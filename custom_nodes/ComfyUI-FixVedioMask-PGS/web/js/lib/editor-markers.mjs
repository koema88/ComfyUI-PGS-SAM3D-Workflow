/** 时间线帧标记 mixin。 */

import { MARKER_HIT_PX, MAX_MARKERS } from "./constants.mjs";
import { uid, clamp } from "./utils.mjs";


export class MarkersMixin {

    getMarkers() {
        if (!Array.isArray(this.timeline.markers)) this.timeline.markers = [];
        return this.timeline.markers;
    }

    toggleMarkerAtMouse(e) {
        const { x } = this.getMousePos(e);
        this.toggleMarkerAtFrame(this.xToFrame(x, this.getLayoutWidth()));
    }

    toggleMarkerAtFrame(frame) {
        const total = this.getTotalFrames();
        if (total < 1) return;
        const f = clamp(Math.round(Number(frame) || 0), 0, total);
        const markers = this.getMarkers();
        const width = this.getLayoutWidth();
        const hitFrames = width > 0
            ? Math.max(1, Math.round((MARKER_HIT_PX / width) * total))
            : 1;
        const idx = markers.findIndex((m) => Math.abs(m.frame - f) <= hitFrames);
        if (idx >= 0) {
            markers.splice(idx, 1);
        } else {
            if (markers.length >= MAX_MARKERS) markers.shift();
            // 只 push，不 sort —— 保持添加顺序，序号即添加顺序
            markers.push({ id: uid(), frame: f });
        }
        this.commit();
        this.scheduleRender();
    }

    toggleMarkerAtPlayhead() {
        this.toggleMarkerAtFrame(this.currentFrame);
    }

    clearAllMarkers() {
        if (!this.getMarkers().length) return;
        this.timeline.markers = [];
        this.commit();
        this.scheduleRender();
    }

    /** 删除片段 [start, start+length)：范围内标记删除，之后标记前移。 */
    shiftMarkersAfterDelete(start, length) {
        if (!length) return;
        const end = start + length;
        this.timeline.markers = this.getMarkers()
            .filter((m) => m.frame < start || m.frame >= end)
            .map((m) => (m.frame >= end ? { ...m, frame: m.frame - length } : m));
    }

    /** 帧率切换：标记等比缩放。 */
    scaleMarkers(oldTotal, newTotal) {
        if (oldTotal <= 0 || newTotal <= 0) return;
        const scale = newTotal / oldTotal;
        for (const m of this.getMarkers()) {
            m.frame = clamp(Math.round(m.frame * scale), 0, newTotal);
        }
    }
}