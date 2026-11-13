/** Canvas 绘制 mixin。 */

import { RULER_H, SEG_LABEL_H, TRACK_H, TRACK_Y } from "./constants.mjs";
import { clamp } from "./utils.mjs";

export class RenderMixin {
    render() {
        const width = this._measureDrawWidth();
        if (width) this._drawTimelineCanvas(width);
        this._updateTimelineDom();
        this._syncStagePreview(this.currentFrame);
    }

    _drawTimelineCanvas(width) {
        if (!this.canvas || !this.ctx) return;
        const height = this.canvasHeight || (RULER_H + SEG_LABEL_H + TRACK_H);
        const dpr = window.devicePixelRatio || 1;
        
        if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
            this.canvas.width = width * dpr;
            this.canvas.height = height * dpr;
            this.canvas.style.width = "100%";
            this.canvas.style.height = `${height}px`;
        }
        
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.clearRect(0, 0, width, height);
        
        // 绘制简单的背景
        this.ctx.fillStyle = "#222";
        this.ctx.fillRect(0, 0, width, height);
    }
}