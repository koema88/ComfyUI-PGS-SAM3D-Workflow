/** 片段规范化 / 重排序 mixin。 */

import {
    MIN_SEG,
    THUMB_PREFETCH_BATCH,
} from "./constants.mjs";

import {
    uid,
    clamp,
} from "./utils.mjs";


export class SegmentsMixin {

    // ═══════════════════ 规范化 ═══════════════════

    normalizeSegments() {
        const total = this.getTotalFrames();
        let segs = [...this.timeline.segments].sort((a, b) => a.start - b.start);
        if (!total) {
            this.timeline.segments = [];
            this.timeline.totalFrames = 0;
            return;
        }
        if (!segs.length) segs = [{ id: uid(), start: 0, length: total }];
        const fixed = [];
        let cursor = 0;
        for (const seg of segs) {
            const start = clamp(seg.start, cursor, total);
            let length = Math.max(MIN_SEG, seg.length ?? (total - start));
            if (start + length > total) length = total - start;
            if (length < MIN_SEG) continue;
            fixed.push({ ...seg, start, length });
            cursor = start + length;
        }
        if (fixed.length && cursor < total) fixed[fixed.length - 1].length += total - cursor;
        this.timeline.segments = fixed;
        this.timeline.totalFrames = total;
        this.selectedIndex = clamp(this.selectedIndex, 0, Math.max(0, fixed.length - 1));
    }

    compactSegmentsAfterDelete() {
        const total = this.getTotalFrames();
        if (total <= 0) { this.timeline.segments = []; return; }
        const segs = [...this.timeline.segments].sort((a, b) => a.start - b.start);
        if (!segs.length) {
            this.timeline.segments = [{ id: uid(), start: 0, length: total }];
            return;
        }
        let cursor = 0;
        const fixed = [];
        for (const seg of segs) {
            let length = seg.length ?? MIN_SEG;
            if (cursor + length > total) length = total - cursor;
            if (length < MIN_SEG) {
                if (fixed.length) fixed[fixed.length - 1].length += length;
                cursor += length;
                continue;
            }
            fixed.push({ ...seg, start: cursor, length });
            cursor += length;
        }
        if (!fixed.length) this.timeline.segments = [{ id: uid(), start: 0, length: total }];
        else if (cursor < total) fixed[fixed.length - 1].length += total - cursor;
        this.timeline.segments = fixed;
    }

    // ═══════════════════ 重排序 ═══════════════════

    _orderedSegmentsWithRank() {
        return [...this.timeline.segments]
            .map((seg, arrayIndex) => ({ seg, arrayIndex }))
            .sort((a, b) => a.seg.start - b.seg.start)
            .map((item, visualRank) => ({ ...item, visualRank }));
    }

    _visualRankFromArrayIndex(arrayIndex) {
        const ordered = this._orderedSegmentsWithRank();
        return ordered.find((o) => o.arrayIndex === arrayIndex)?.visualRank ?? arrayIndex;
    }

    _computeReorderDropRank(frame, fromRank) {
        const ordered = this._orderedSegmentsWithRank();
        if (!ordered.length) return fromRank;
        const remaining = ordered.filter((item) => item.visualRank !== fromRank);
        for (let index = 0; index < remaining.length; index++) {
            const item = remaining[index];
            const mid = item.seg.start + item.seg.length / 2;
            if (frame < mid) return index;
        }
        return remaining.length;
    }

    _getReorderInsertFrame(dropRank, fromRank) {
        const ordered = [...this.timeline.segments].sort((a, b) => a.start - b.start);
        const lengths = ordered.map((s) => s.length);
        const without = lengths.filter((_, i) => i !== fromRank);
        let frame = 0;
        for (let i = 0; i < dropRank && i < without.length; i++) frame += without[i];
        return frame;
    }

    reorderSegmentsByRank(fromRank, toRank) {
        const ordered = [...this.timeline.segments]
            .map((seg) => ({ seg }))
            .sort((a, b) => a.seg.start - b.seg.start);
        if (fromRank < 0 || fromRank >= ordered.length) return;
        if (toRank < 0 || toRank >= ordered.length) return;
        if (fromRank === toRank) return;
        if (!this.getFrameMap().length && this.getTotalFrames() > 0) this.materializeFrameMap();
        const map = [...this.getFrameMap()];
        const slices = ordered.map((o) => map.slice(o.seg.start, o.seg.start + o.seg.length));
        const metas = ordered.map((o) => ({ ...o.seg }));
        const [mSlice] = slices.splice(fromRank, 1);
        const [mMeta] = metas.splice(fromRank, 1);
        slices.splice(toRank, 0, mSlice);
        metas.splice(toRank, 0, mMeta);
        const newMap = slices.flat();
        let start = 0;
        const newSegs = metas.map((seg, idx) => {
            const s = { ...seg, start, length: slices[idx].length };
            start += s.length;
            return s;
        });
        this.setFrameMap(newMap);
        this.timeline.segments = newSegs;
        this.selectedIndex = toRank;
        // 重排后清空所有帧标记
        this.timeline.markers = [];
        this._prefetchSegmentThumbs(0, Math.min(newMap.length, THUMB_PREFETCH_BATCH * 4));
    }

}