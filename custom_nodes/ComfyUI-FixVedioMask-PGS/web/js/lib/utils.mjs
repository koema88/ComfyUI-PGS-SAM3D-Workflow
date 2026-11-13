/** 通用工具函数 + 帧映射纯函数。 */

import { api } from "../../../scripts/api.js";

import {
    RULER_H,
    SEG_LABEL_H,
    TRACK_H,
    RULER_MAJOR_SEC,
    RULER_MIN_MAJOR_PX,
    RULER_MIN_MINOR_PX,
    DIRECTOR_MIN_WIDTH,
} from "./constants.mjs";


// ─────────── 基础 ───────────

export function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function snapDim(v, stride = 32) {
    return Math.max(stride, Math.round(v / stride) * stride);
}

export function snapScaledDim(dim, scale, stride = 32) {
    return Math.max(stride, Math.round((dim * scale) / stride) * stride);
}

export function resolveOutputDimensions(sourceW, sourceH, output, fallback = {}) {
    const mode = String(output?.mode || "long_edge").toLowerCase();
    const canvasStride = 32;
    if (mode === "fixed") {
        const w = snapDim(+(output?.width ?? fallback.width ?? 848), canvasStride);
        const h = snapDim(+(output?.height ?? fallback.height ?? 480), canvasStride);
        return { mode: "fixed", width: w, height: h, refMaxSize: Math.max(w, h) };
    }
    const longEdge = Math.max(canvasStride, +(output?.longEdge ?? output?.long_edge ?? fallback.refMaxSize ?? 848));
    const sw = sourceW || 0;
    const sh = sourceH || 0;
    if (!sw || !sh) {
        return { mode: "long_edge", width: longEdge, height: canvasStride, refMaxSize: longEdge };
    }
    const scale = Math.min(1, longEdge / Math.max(sw, sh));
    return {
        mode: "long_edge",
        width: snapScaledDim(sw, scale, canvasStride),
        height: snapScaledDim(sh, scale, canvasStride),
        refMaxSize: longEdge,
    };
}


// ─────────── 刻度尺 ───────────

export function pickRulerMajorStepSec(pxPerSec) {
    const pps = Math.max(0.001, Number(pxPerSec) || 0.001);
    for (const step of RULER_MAJOR_SEC) {
        if (step * pps >= RULER_MIN_MAJOR_PX) return step;
    }
    return RULER_MAJOR_SEC[RULER_MAJOR_SEC.length - 1];
}

export function pickRulerMinorStepSec(majorSec, pxPerSec) {
    const pps = Math.max(0.001, Number(pxPerSec) || 0.001);
    for (const div of [10, 5, 4, 2]) {
        const minor = majorSec / div;
        if (minor >= 1 && Number.isInteger(minor) && minor * pps >= RULER_MIN_MINOR_PX) {
            return minor;
        }
    }
    return majorSec;
}

export function formatRulerTime(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    if (s < 60) return String(s);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatProbeFps(value) {
    const fps = Math.round(Number(value) * 100) / 100;
    if (Number.isInteger(fps)) return String(fps);
    return fps.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function coerceTimelineFps(value, fallback = 24) {
    const fps = Number(value);
    if (!Number.isFinite(fps) || fps <= 0) return coerceTimelineFps(fallback, 24);
    return Math.round(clamp(fps, 1, 240) * 100) / 100;
}


// ─────────── 上传 ───────────

export function isUploadSizeError(err) {
    const msg = String(err?.message || err);
    return /body size|413|max_upload|too large|104857600/i.test(msg);
}

export function formatUploadError(err) {
    const msg = String(err?.message || err);
    if (isUploadSizeError(err)) {
        return "文件超过 ComfyUI 默认上传限制（100MB）。已尝试分块上传；若仍失败，请手动复制到 ComfyUI/input/ 后刷新。";
    }
    return msg;
}

export async function uploadToInput(file) {
    const body = new FormData();
    body.append("image", file, file.name);
    body.append("type", "input");
    body.append("overwrite", "false");
    const resp = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `Upload failed (${resp.status})`);
    }
    return resp.json();
}

export async function uploadVideoChunked(file, onProgress) {
    const filename = file.name || "video.mp4";
    const uploadId = crypto.randomUUID();
    const totalChunks = Math.ceil(file.size / (8 * 1024 * 1024));
    for (let i = 0; i < totalChunks; i++) {
        const start = i * 8 * 1024 * 1024;
        const end = Math.min(start + 8 * 1024 * 1024, file.size);
        const body = new FormData();
        body.append("upload_id", uploadId);
        body.append("chunk_index", String(i));
        body.append("total_chunks", String(totalChunks));
        body.append("filename", filename);
        body.append("chunk", file.slice(start, end), `${filename}.part`);
        const resp = await api.fetchApi("/fix_vedio_mask/upload_chunk", { method: "POST", body });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `Chunk upload failed (${resp.status})`);
        }
        onProgress?.((i + 1) / totalChunks, i + 1, totalChunks);
        const data = await resp.json();
        if (data.name) return data;
    }
    throw new Error("分块上传未完成");
}

export async function uploadToInputSmart(file, onProgress) {
    const soft = 95 * 1024 * 1024;
    if (file.size <= soft) {
        try {
            return await uploadToInput(file);
        } catch (err) {
            if (!isUploadSizeError(err)) throw err;
        }
    }
    return uploadVideoChunked(file, onProgress);
}

export function videoRelativePath(upload) {
    const name = upload.name || upload.filename;
    const sub = (upload.subfolder || "").replace(/\\/g, "/").replace(/\/$/, "");
    return sub ? `${sub}/${name}` : name;
}

export function inputViewUrl(relativePath, type = "input") {
    const norm = String(relativePath || "").replace(/\\/g, "/");
    const slash = norm.lastIndexOf("/");
    const filename = slash >= 0 ? norm.slice(slash + 1) : norm;
    const subfolder = slash >= 0 ? norm.slice(0, slash) : "";
    const params = new URLSearchParams({ filename, type });
    if (subfolder) params.set("subfolder", subfolder);
    return api.apiURL(`/view?${params.toString()}`);
}


// ─────────── 帧映射纯函数 ───────────

export function deletedSourceRanges(video) {
    return video?.deletedSourceRanges || video?.deleted_source_ranges || [];
}

export function normalizeFrameMapEntry(entry, defaultClip = 0) {
    if (entry == null) return { clip: defaultClip, frame: 0 };
    if (typeof entry === "number") return { clip: defaultClip, frame: entry };
    return {
        clip: entry.clip ?? entry.videoClip ?? defaultClip,
        frame: entry.frame ?? 0,
    };
}

export function buildIdentityFrameMap(count) {
    return Array.from({ length: count }, (_, i) => i);
}

export function buildClipFrameMap(clipIndex, count) {
    return Array.from({ length: count }, (_, i) => ({ clip: clipIndex, frame: i }));
}

export function logicalToSourceFrame(logical, video) {
    const map = video?.frameMap;
    if (map?.length) {
        return normalizeFrameMapEntry(map[clamp(logical, 0, map.length - 1)]).frame;
    }
    let src = logical;
    for (const [start, end] of [...deletedSourceRanges(video)].sort((a, b) => a[0] - b[0])) {
        if (src >= start) src += end - start;
        else break;
    }
    return src;
}

export function sourceToLogicalFrame(srcFrame, video) {
    const map = video?.frameMap;
    if (map?.length) {
        let best = -1;
        for (let i = 0; i < map.length; i++) {
            const e = normalizeFrameMapEntry(map[i]);
            if (e.frame === srcFrame) return i;
            if (e.frame < srcFrame) best = i;
            else if (best < 0) return -1;
        }
        return best;
    }
    let logical = srcFrame;
    for (const [start, end] of [...deletedSourceRanges(video)].sort((a, b) => a[0] - b[0])) {
        if (srcFrame >= end) logical -= (end - start);
        else if (srcFrame >= start) return -1;
        else break;
    }
    return Math.max(0, logical);
}


// ─────────── DOM widget 辅助 ───────────

export function getDirectorUiHeight(editor) {
    const trackH = editor?.canvasHeight || (RULER_H + SEG_LABEL_H + TRACK_H);
    const showStage = editor ? !!editor.hasVideo?.() : false;
    let h = trackH + 260;
    if (showStage) h += 240;
    return h;
}

export function contentDomWidgetMinHeight(editor) {
    return getDirectorUiHeight(editor);
}

export function bindDomWidgetContentComputeSize(editor) {
    const widget = editor?.domWidget;
    if (!widget) return 0;
    try { delete widget.computeSize; } catch { widget.computeSize = undefined; }
    const minH = getDirectorUiHeight(editor);
    widget.computeLayoutSize = () => ({
        minHeight: minH,
        maxHeight: undefined,
        minWidth: DIRECTOR_MIN_WIDTH,
    });
    if (widget.options) {
        widget.options.getMinHeight = () => getDirectorUiHeight(editor);
        delete widget.options.getMaxHeight;
    }
    return minH;
}

export function syncDirectorNodeSize(node, editor) {
    if (editor?.isPlaying) return;
    editor?.updateDomWidgetHeight?.();
}