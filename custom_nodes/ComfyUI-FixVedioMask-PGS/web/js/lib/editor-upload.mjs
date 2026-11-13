/** 上传 / 加载 / probe mixin。 */

import { api } from "../../../scripts/api.js";
import { THUMB_PREFETCH_BATCH } from "./constants.mjs";
import { uid, formatUploadError, uploadToInputSmart, videoRelativePath, inputViewUrl } from "./utils.mjs";

export class UploadMixin {

    pickVideoFile() {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "video/*";
        input.onchange = () => { if (input.files?.[0]) this.loadVideoFile(input.files[0]); };
        input.click();
    }

    // 新增：直接从路径加载（用于连线自动识别）
    async loadVideoByPath(filePath, slotName = "PoseMask") {
        if (!filePath) return;
        const fileName = filePath.split('/').pop().split('\\').pop();
        
        // 判断是否已经加载了相同的视频，避免重复刷新
        const currentClip = this.getVideoClips()[0];
        if (currentClip && currentClip.videoFile === filePath) return;
        
        const btn = this.root.querySelector('[data-a="video"]');
        if (btn) { btn.disabled = true; btn.textContent = "加载中…"; }
        this.videoNameEl.textContent = `加载: ${fileName}…`;
        
        try {
            await this._applyLoadedVideo({
                fileName: fileName,
                relPath: filePath,
                subfolder: "",
                type: "input",
            });
        } catch (err) {
            console.error("[FVM-PGS] load from upstream failed:", err);
            this.videoNameEl.textContent = `加载失败: ${formatUploadError(err)}`;
            this.updateVideoNameLabel();
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "上传视频"; }
        }
    }

    async loadVideoFile(file) {
        const btn = this.root.querySelector('[data-a="video"]');
        if (btn) { btn.disabled = true; btn.textContent = "上传中…"; }
        this.videoNameEl.textContent = `上传中: ${file.name}`;
        try {
            const uploaded = await uploadToInputSmart(file, (frac, cur, total) => {
                const pct = Math.round(frac * 100);
                this.videoNameEl.textContent = `上传中: ${file.name} (${cur}/${total}, ${pct}%)…`;
            });
            const relPath = videoRelativePath(uploaded);
            await this._applyLoadedVideo({
                fileName: file.name,
                relPath,
                subfolder: uploaded.subfolder || "",
                type: uploaded.type || "input",
            });
        } catch (err) {
            console.error("[FVM-PGS] load failed:", err);
            this.videoNameEl.textContent = `加载失败: ${formatUploadError(err)}`;
            this.updateVideoNameLabel();
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = "上传视频"; }
        }
    }

    async _prepareVideoFrames({ fileName, relPath, subfolder, type, syncNativeFps = true }) {
        this.videoNameEl.textContent = `解析: ${fileName}…`;
        const viewUrl = inputViewUrl(relPath, type || "input");

        let serverProbe = null;
        try {
            serverProbe = await this.probeVideoFile(relPath, subfolder, type);
        } catch (err) {
            console.warn("[FVM-PGS] probe failed:", err);
        }
        const browserMeta = await this.probeVideoMetadata(viewUrl).catch(() => ({ width: 0, height: 0, duration: 0 }));
        const nativeFps = Number(serverProbe?.native_fps || 0);
        const nativeFrameCount = Number(serverProbe?.frame_count || 0);
        const meta = {
            width: Number(serverProbe?.width || browserMeta.width || 0),
            height: Number(serverProbe?.height || browserMeta.height || 0),
            duration: Number(serverProbe?.duration ?? browserMeta.duration ?? 0),
            nativeFps,
            nativeFrameCount,
        };
        if (syncNativeFps && nativeFps > 0) this.syncFrameRateUI(nativeFps);
        const fps = this.getFrameRate();
        const totalFrames = Math.max(1, Math.round(meta.duration * fps) || nativeFrameCount);
        return { fileName, relPath, subfolder, type, meta, totalFrames, viewUrl };
    }

    async probeVideoFile(relPath, subfolder = "", type = "input") {
        const resp = await api.fetchApi("/fix_vedio_mask/probe_video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoFile: relPath, subfolder, type: type || "input" }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        return resp.json();
    }

    async probeVideoMetadata(url) {
        const video = document.createElement("video");
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        await new Promise((res, rej) => {
            video.onloadedmetadata = () => res();
            video.onerror = () => rej(new Error("无法读取视频元数据"));
        });
        return {
            width: video.videoWidth || 0,
            height: video.videoHeight || 0,
            duration: video.duration || 0,
        };
    }

    _buildClipRecord({ fileName, relPath, subfolder, type, meta, totalFrames }) {
        return {
            id: uid(),
            fileName,
            videoFile: relPath,
            subfolder: subfolder || "",
            type: type || "input",
            width: meta.width,
            height: meta.height,
            duration: meta.duration,
            nativeFps: meta.nativeFps || null,
            nativeFrameCount: meta.nativeFrameCount || null,
            sourceFrameCount: totalFrames,
        };
    }

    async _applyLoadedVideo({ fileName, relPath, subfolder, type }) {
        const prep = await this._prepareVideoFrames({ fileName, relPath, subfolder, type });
        const { totalFrames, viewUrl } = prep;
        const clip = this._buildClipRecord(prep);
        this.timeline.videoClips = [clip];
        this.setSparseVideoFrames(totalFrames);
        this.timeline.video = {
            ...this.timeline.video,
            fileName: clip.fileName,
            videoFile: clip.videoFile,
            subfolder: clip.subfolder,
            type: clip.type,
            frames: [],
            frameMap: [],
            deletedSourceRanges: [],
            sourceFrameCount: totalFrames,
            width: clip.width,
            height: clip.height,
            duration: clip.duration,
            nativeFps: clip.nativeFps,
            nativeFrameCount: clip.nativeFrameCount,
        };
        this.timeline.segments = [{ id: uid(), start: 0, length: totalFrames }];
        this.timeline.markers = [];
        this.selectedIndex = 0;
        this.currentFrame = 0;
        if (this.seekBar) {
            this.seekBar.max = Math.max(0, totalFrames - 1);
            this.seekBar.value = 0;
        }
        this._invalidateVideoThumbs();
        this._clearPreviewVideos(true);
        this._previewVideo = this._getPreviewVideoForClip(0);
        if (this._previewVideo && viewUrl) this._previewVideo.src = viewUrl;
        this._stageClipIndex = -1;
        if (this.stageVideo) {
            this.stageVideo.pause();
            this.stageVideo.removeAttribute("src");
            this.stageVideo.load();
        }
        this.updateVideoNameLabel();
        this._prefetchSegmentThumbs(0, Math.min(totalFrames, THUMB_PREFETCH_BATCH * 4));
        this.updateStageVisibility();
        this._syncStagePreview(this.currentFrame, { force: true });
        this.commit(false, { syncTimeline: true });
    }
}