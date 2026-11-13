/** 播放 / 帧计算 / 视频状态 mixin。 */

import { THUMB_PREFETCH_BATCH, DIRECTOR_MIN_WIDTH } from "./constants.mjs";
import { uid, clamp, coerceTimelineFps, formatProbeFps, inputViewUrl, deletedSourceRanges, normalizeFrameMapEntry, buildIdentityFrameMap, logicalToSourceFrame, sourceToLogicalFrame, syncDirectorNodeSize } from "./utils.mjs";

export class PlaybackMixin {
    getFrameMap() {
        const v = this.timeline?.video || {};
        if (v.frameMap?.length) return v.frameMap;
        if (v.frames?.length) return buildIdentityFrameMap(v.frames.length);
        return [];
    }

    getTotalFrames() {
        if (this.batchImages && this.batchImages.length > 0) return this.batchImages.length;
        const mapLen = this.timeline?.video?.frameMap?.length || 0;
        if (mapLen > 0) return mapLen;
        const total = Math.max(0, parseInt(this.timeline?.totalFrames || 0, 10));
        return total > 0 ? total : 0;
    }

    getFrameRate() {
        return coerceTimelineFps(this.fpsInput?.value ?? this.timeline.frameRate ?? 24);
    }

    stepFrame(delta) {
        const total = this.getTotalFrames();
        if (total < 1) return;
        this.seekToFrame(this.currentFrame + (Number(delta) || 0), { fromUi: true });
    }

    seekToFrame(frame, { fromUi = false } = {}) {
        const total = this.getTotalFrames();
        if (total < 1) return;
        const next = clamp(Math.round(Number(frame) || 0), 0, total - 1);
        this.currentFrame = next;
        if (this.seekBar) {
            this.seekBar.max = Math.max(0, total - 1);
            this.seekBar.value = next;
        }
        this._syncStagePreview(next, { force: true });
        this._updateTimelineDom({ skipSeek: true });
        this.scheduleRender();
    }

    _syncStagePreview(logicalFrame, { force = false } = {}) {
        if (!this.stageEl || this.stageEl.classList.contains("hidden")) return;
        
        if (this.batchImages && this.batchImages.length > 0) {
            const idx = clamp(logicalFrame | 0, 0, this.batchImages.length - 1);
            if (this.stageImg) {
                const targetUrl = this.batchImages[idx];
                if (this.stageImg.src !== targetUrl) {
                    this.stageImg.src = targetUrl;
                    this.stageImg.onload = () => this.syncCanvasSize();
                } else {
                    this.syncCanvasSize();
                }
                this.stageImg.classList.remove("hidden");
            }
            this.stageEmpty?.classList.add("hidden");
            this._updateStageBadge(logicalFrame);
            this.loadDrawingFromData();
            return;
        }
        
        this.stageEmpty?.classList.remove("hidden");
        this.stageImg?.classList.add("hidden");
    }

    _updateStageBadge(logicalFrame) {}

    updateStageVisibility() {
        if (!this.stageEl) return;
        this.stageEl.classList.remove("hidden");
        this._syncStagePreview(this.currentFrame, { force: true });
        this.updateDomWidgetHeight();
        syncDirectorNodeSize(this.node, this);
    }

    hasVideo() { return false; }
    getVideoClips() { return []; }
}