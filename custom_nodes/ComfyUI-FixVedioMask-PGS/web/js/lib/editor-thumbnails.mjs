/** 缩略图 / 预览视频 mixin。 */

import { THUMB_MAX_W, THUMB_JPEG_Q } from "./constants.mjs";


export class ThumbnailsMixin {

    _frameThumbKey(logicalFrame) {
        const entry = this.getFrameMapEntry(logicalFrame);
        const clip = this.getVideoClips()[entry.clip] || {};
        const id = `${clip.type || "input"}:${clip.videoFile || clip.fileName || "none"}`;
        return `${id}#${entry.clip}:${entry.frame}`;
    }

    _queueThumbPrefetch(logicalFrame) {
        if (this.isPlaying) return;
        if (!this.hasVideo()) return;
        const cacheKey = this._frameThumbKey(logicalFrame);
        if (this._thumbCache.has(cacheKey) || this._thumbPending.has(cacheKey)) return;
        this._thumbPending.add(cacheKey);
        this._fetchThumb(logicalFrame).then((img) => {
            this._thumbPending.delete(cacheKey);
            if (!img) return;
            if (this._frameThumbKey(logicalFrame) !== cacheKey) return;
            this._thumbCache.set(cacheKey, img);
            this.scheduleRender();
        }).catch(() => {
            this._thumbPending.delete(cacheKey);
        });
    }

    getFrameImage(frameIndex) {
        return this._thumbCache.get(this._frameThumbKey(frameIndex)) || null;
    }

    async _fetchThumb(logicalFrame) {
        const entry = this.getFrameMapEntry(logicalFrame);
        const v = await this._ensurePreviewReady(entry.clip);
        if (!v?.videoWidth) return null;
        const t = Math.max(0, entry.frame / this.getFrameRate());
        await this._seekPreviewVideo(t, entry.clip);
        if (!v.videoWidth) return null;
        try {
            const ratio = v.videoWidth > THUMB_MAX_W ? THUMB_MAX_W / v.videoWidth : 1;
            const tw = Math.max(1, Math.round(v.videoWidth * ratio));
            const th = Math.max(1, Math.round(v.videoHeight * ratio));
            if (!this._thumbCanvas) {
                this._thumbCanvas = document.createElement("canvas");
                this._thumbCtx = this._thumbCanvas.getContext("2d", { alpha: false });
            }
            this._thumbCanvas.width = tw;
            this._thumbCanvas.height = th;
            this._thumbCtx.drawImage(v, 0, 0, tw, th);
            const dataUrl = this._thumbCanvas.toDataURL("image/jpeg", THUMB_JPEG_Q);
            return await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = dataUrl;
            });
        } catch { return null; }
    }

    _prefetchSegmentThumbs(from, to) {
        for (let f = from; f < to; f++) this._queueThumbPrefetch(f);
    }

    _getPreviewVideoForClip(clipIndex) {
        const url = this.getClipViewUrl(clipIndex);
        if (!this._previewVideos) this._previewVideos = new Map();
        if (clipIndex === 0 && this._previewVideo && !this._previewVideos.has(0)) {
            this._previewVideos.set(0, this._previewVideo);
        }
        if (!url) return this._previewVideos.get(clipIndex) || (clipIndex === 0 ? this._previewVideo : null);
        let v = this._previewVideos.get(clipIndex);
        if (!v) {
            v = document.createElement("video");
            v.crossOrigin = "anonymous";
            v.muted = true;
            v.playsInline = true;
            v.preload = "auto";
            v.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
            document.body.appendChild(v);
            this._previewVideos.set(clipIndex, v);
        }
        const cur = v.currentSrc || v.getAttribute("src") || "";
        if (cur !== url) {
            v.pause();
            v.src = url;
            v.load();
        }
        return v;
    }

    async _ensurePreviewReady(clipIndex, timeoutMs = 8000) {
        const v = this._getPreviewVideoForClip(clipIndex);
        if (!v) return null;
        if (v.videoWidth && v.readyState >= 2) return v;
        await new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                v.removeEventListener("loadeddata", finish);
                v.removeEventListener("canplay", finish);
                resolve();
            };
            v.addEventListener("loadeddata", finish);
            v.addEventListener("canplay", finish);
            if (v.videoWidth && v.readyState >= 2) finish();
            else setTimeout(finish, timeoutMs);
        });
        return v.videoWidth ? v : null;
    }

    async _seekPreviewVideo(timeSec, clipIndex = 0) {
        this._seekChain = this._seekChain.then(() => new Promise((resolve) => {
            const v = this._getPreviewVideoForClip(clipIndex);
            if (!v || !(v.currentSrc || v.getAttribute("src"))) { resolve(); return; }
            const target = Math.max(0, timeSec);
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                v.removeEventListener("seeked", finish);
                resolve();
            };
            v.addEventListener("seeked", finish);
            try { v.currentTime = target; } catch { finish(); return; }
            if (Math.abs(v.currentTime - target) < 0.02 && v.readyState >= 2) finish();
            else setTimeout(finish, 1500);
        }));
        return this._seekChain;
    }

    _restorePreviewVideos() {
        const clips = this.getVideoClips();
        if (!clips.length) return;
        for (let i = 0; i < clips.length; i++) this._getPreviewVideoForClip(i);
        this._previewVideo = this._previewVideos.get(0) || this._previewVideo;
    }

    _clearPreviewVideos(removeExtra = true) {
        if (!this._previewVideos) return;
        for (const [idx, v] of this._previewVideos.entries()) {
            v.pause();
            if (idx === 0 && v === this._previewVideo) {
                v.removeAttribute("src");
                v.load();
                continue;
            }
            if (removeExtra) {
                v.removeAttribute("src");
                v.load();
                v.remove();
            }
        }
        const keep = this._previewVideo;
        this._previewVideos.clear();
        if (keep) this._previewVideos.set(0, keep);
    }

};