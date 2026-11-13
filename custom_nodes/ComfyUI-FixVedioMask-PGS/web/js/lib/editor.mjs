import { api } from "../../../scripts/api.js";
import { clamp } from "./utils.mjs";
import { STYLES } from "./styles.mjs";
import { DomMixin } from "./editor-dom.mjs";

export class VideoEditor {
    constructor(node, container, domWidget) {
        this.node = node;
        this.container = container;
        this.domWidget = domWidget;
        this.batchMasks = [];
        this.batchRefs = [];
        this.currentFrame = 0;
        this.currentTool = "brush";
        this.selectedIndex = 0;
        this._syncTimer = null;

        this.penShapes = [];
        this.penPoints = [];
        this.penSelectedPoints = [];
        this.currentPenPoint = null;
        this.pendingClosePoint = null;
        this.dragHandleInfo = null;
        this.dragOrigins = null;
        this.isBoxSelecting = false;
        this.snapshot = null;

        this._undoStack = [];
        this._redoStack = [];
        this._undoLimit = 10;

        for (const w of node.widgets || []) {
            if (w.name === "timeline_data" || w.name === "video_file") {
                w.hidden = true;
                if (!w.options) w.options = {};
                w.options.hidden = true;
                w.computeSize = () => [0, 0];
                if (w.element) w.element.style.display = "none";
            }
        }
        this.timelineWidget = node.widgets?.find(w => w.name === "timeline_data");
        this.timeline = this.parseTimeline(this.timelineWidget?.value || "");

        this.buildDOM();
        this.bindEvents();
        this.updateDomWidgetHeight();
        this.syncUIFromData();
    }

    parseTimeline(raw) {
        const base = {
            totalFrames: 0,
            output: { 
                blendMode: "normal", 
                blendOpacity: 100, 
                grayscale: false, 
                blur: 0, 
                levels: { black: 0, mid: 128, white: 255 },
                foregroundColor: "#ffffff", // ★ 新增前景色
                backgroundColor: "#000000"  // ★ 新增背景色
            },
            drawings: {},
            lockResult: false,
        };
        if (!raw?.trim()) return base;
        try {
            const data = JSON.parse(raw);
            data.output = { ...base.output, ...(data.output || {}) };
            data.output.levels = { ...base.output.levels, ...(data.output.levels || {}) };
            data.drawings = data.drawings || {};
            return data;
        } catch {
            return base;
        }
    }

    syncUIFromData() {
        const out = this.timeline.output || {};
        if (this.blendModeEl) this.blendModeEl.value = out.blendMode || "normal";
        if (this.blendOpacityEl) this.blendOpacityEl.value = out.blendOpacity ?? 100;
        if (this.blendOpacityValEl) this.blendOpacityValEl.textContent = (out.blendOpacity ?? 100) + "%";
        
        // ★ 同步前景/背景色
        if (this.fgColorEl) this.fgColorEl.value = out.foregroundColor || "#ffffff";
        if (this.bgColorEl) this.bgColorEl.value = out.backgroundColor || "#000000";
        
        if (this.grayBtn) {
            const isGray = !!out.grayscale;
            this.grayBtn.classList.toggle("active", isGray);
            this.grayBtn.textContent = isGray ? "⬛ 已去色" : "⬛ 去色";
        }

        if (this.blurEl) {
            this.blurEl.value = out.blur ?? 0;
            if (this.blurValEl) this.blurValEl.textContent = this.blurEl.value + "px";
        }

        const lv = out.levels || { black: 0, mid: 128, white: 255 };
        if (this.levelHandles) {
            this.levelHandles.black.style.left = `${(lv.black / 255) * 100}%`;
            this.levelHandles.mid.style.left = `${(lv.mid / 255) * 100}%`;
            this.levelHandles.white.style.left = `${(lv.white / 255) * 100}%`;
        }

        this.updateBlendStyles();

        if (this.lockBtn) {
            if (this.timeline.lockResult) {
                this.lockBtn.classList.add("active");
                this.lockBtn.textContent = "🔒 已锁定";
            } else {
                this.lockBtn.classList.remove("active");
                this.lockBtn.textContent = "🔓 锁定结果";
            }
        }
    }

    updateBlendStyles() {
        const topLayer = this.root?.querySelector('[data-r="stage-top-layer"]');
        const svgFilter = this.levelFilter;
        if (!topLayer || !svgFilter) return;
        
        const hasRef = this.batchRefs && this.batchRefs.length > 0 && !!this.batchRefs[this.currentFrame];
        let mode = "normal";
        let opacity = 1.0;
        if (hasRef) {
            mode = this.blendModeEl.value || "normal";
            if (mode === "soft_light") mode = "soft-light";
            if (mode === "hard_light") mode = "hard-light";
            opacity = (+this.blendOpacityEl.value / 100);
        }
        topLayer.style.mixBlendMode = mode;
        topLayer.style.opacity = opacity.toString();
        
        let filterList = [];
        
        const blur = this.timeline.output?.blur || 0;
        if (blur > 0) filterList.push(`blur(${blur}px)`);

        const isGray = !!this.timeline.output?.grayscale;
        if (isGray) filterList.push("grayscale(1)");
        
        const levels = this.timeline.output?.levels;
        if (levels && (levels.black > 0 || levels.mid !== 128 || levels.white < 255)) {
            const b = levels.black / 255;
            const w = levels.white / 255;
            if (w > b + 1e-6) {
                const m = levels.mid / 255;
                const norm_m = Math.max(0.001, Math.min(0.999, (m - b) / (w - b)));
                const gamma = Math.log(0.5) / Math.log(norm_m);
                
                const lut = [];
                for (let i = 0; i < 256; i++) {
                    let v = i / 255;
                    v = (v - b) / (w - b);
                    v = Math.max(0, Math.min(1, v));
                    v = Math.pow(v, 1 / gamma);
                    lut.push(v.toFixed(4));
                }
                const lutStr = lut.join(" ");
                
                svgFilter.innerHTML = `
                    <feFuncR type="table" tableValues="${lutStr}"></feFuncR>
                    <feFuncG type="table" tableValues="${lutStr}"></feFuncG>
                    <feFuncB type="table" tableValues="${lutStr}"></feFuncB>
                `;
                filterList.push("url(#fvm-levels-filter)");
            } else {
                svgFilter.innerHTML = '';
            }
        } else {
            svgFilter.innerHTML = ''; 
        }
        
        topLayer.style.filter = filterList.length > 0 ? filterList.join(" ") : "none";
    }

    onBlendField(key, value) {
        this.timeline.output = this.timeline.output || {};
        this.timeline.output[key] = value;
        this.commit(true);
    }

    syncCanvasSize() {
        if (!this.drawCanvasEl || !this.stageImgBase) return;
        const img = this.stageImgBase;
        if (!img.naturalWidth || !img.naturalHeight) return;

        const natW = img.naturalWidth;
        const natH = img.naturalHeight;

        if (this.drawCanvasEl.width !== natW || this.drawCanvasEl.height !== natH) {
            this.drawCanvasEl.width = natW;
            this.drawCanvasEl.height = natH;
            if (this.overlayCanvasEl) {
                this.overlayCanvasEl.width = natW;
                this.overlayCanvasEl.height = natH;
            }
            this.snapshot = null;
            this.loadDrawingFromData();
        }

        const stage = this.root?.querySelector('[data-r="video-stage"]');
        const stageW = Math.max(1, (stage?.clientWidth || 960) - 2);
        const stageH = Math.max(1, (stage?.clientHeight || 540) - 2);

        const SAFE_PAD_RATIO = 0.06; 
        const safeW = Math.max(1, stageW * (1 - SAFE_PAD_RATIO * 2));
        const safeH = Math.max(1, stageH * (1 - SAFE_PAD_RATIO * 2));

        const scale = Math.min(safeW / natW, safeH / natH);
        const dispW = Math.max(1, Math.round(natW * scale));
        const dispH = Math.max(1, Math.round(natH * scale));

        for (const el of [this.drawCanvasEl, this.stageImgBase, this.stageImgRef, this.overlayCanvasEl]) {
            if (!el) continue;
            el.style.width = `${dispW}px`;
            el.style.height = `${dispH}px`;
            el.style.left = "50%";
            el.style.top = "50%";
            el.style.transform = "translate(-50%, -50%)";
            el.style.objectFit = "fill";
        }

        const safeFrame = this.root?.querySelector('[data-r="safe-frame"]');
        if (safeFrame) {
            safeFrame.style.display = "block";
            safeFrame.style.width = `${dispW}px`;
            safeFrame.style.height = `${dispH}px`;
            safeFrame.style.left = "50%";
            safeFrame.style.top = "50%";
            safeFrame.style.transform = "translate(-50%, -50%)";
        }
    }

    async stepFrame(delta) {
        const total = this.batchMasks.length;
        if (total < 1) return;
        await this.bakeShapesToCanvas();
        this._seekToFrameInternal(clamp(this.currentFrame + (Number(delta) || 0), 0, total - 1));
    }

    async seekToFrame(frame) {
        if (this.batchMasks.length < 1) return;
        await this.bakeShapesToCanvas();
        this._seekToFrameInternal(frame);
    }

    _seekToFrameInternal(frame) {
        this.currentFrame = clamp(frame, 0, this.batchMasks.length - 1);
        if (this.seekBar) this.seekBar.value = this.currentFrame;
        this._syncStagePreview();
        this.updateTimelineDom();
        this._undoStack = [];
        this._redoStack = [];
    }

    _syncStagePreview() {
        if (this.batchMasks.length > 0) {
            const hasRef = this.batchRefs.length > 0 && !!this.batchRefs[this.currentFrame];
            
            const baseUrl = hasRef ? this.batchRefs[this.currentFrame] : this.batchMasks[this.currentFrame];
            const curSrc = this.stageImgBase.getAttribute("src") || "";
            if (curSrc !== baseUrl) {
                this.stageImgBase.src = baseUrl;
                this.syncCanvasSize();
                this.stageImgBase.onload = () => this.syncCanvasSize();
            } else if (this.stageImgBase.naturalWidth) {
                this.syncCanvasSize();
            }
            this.stageImgBase.classList.remove("hidden");

            const topLayer = this.root?.querySelector('[data-r="stage-top-layer"]');
            if (hasRef) {
                const maskUrl = this.batchMasks[this.currentFrame];
                if (this.stageImgRef.getAttribute("src") !== maskUrl) this.stageImgRef.src = maskUrl;
                this.stageImgRef.classList.remove("hidden");
                if (topLayer) topLayer.classList.remove("hidden");
            } else {
                this.stageImgRef.classList.add("hidden");
                if (topLayer) topLayer.classList.add("hidden");
            }

            this.stageEmpty.classList.add("hidden");
            this.updateBlendStyles();
            this.loadDrawingFromData();
        } else {
            this.stageEmpty.classList.remove("hidden");
            this.stageImgBase.classList.add("hidden");
            this.stageImgRef.classList.add("hidden");
            const topLayer = this.root?.querySelector('[data-r="stage-top-layer"]');
            if (topLayer) topLayer.classList.add("hidden");
            
            const safeFrame = this.root?.querySelector('[data-r="safe-frame"]');
            if (safeFrame) safeFrame.style.display = "none";
            
            if (this.drawCanvasEl) this.drawCtx.clearRect(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            if (this.overlayCanvasEl) this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
            this.snapshot = null;
        }
    }

    updateTimelineDom() {
        const total = this.batchMasks.length || 0;
        if (this.timecodeEl) this.timecodeEl.textContent = `第 ${this.currentFrame + 1} / ${total} 帧`;
        if (this.frameTotalEl) this.frameTotalEl.textContent = String(total);
        if (this.frameInputEl && document.activeElement !== this.frameInputEl) this.frameInputEl.value = String(total > 0 ? this.currentFrame + 1 : 1);
    }

    commit(immediate = false) {
        if (!this.timelineWidget) return;
        clearTimeout(this._syncTimer);
        const doSave = () => {
            const payload = { ...this.timeline, totalFrames: this.batchMasks.length };
            const json = JSON.stringify(payload);
            if (this.timelineWidget.value === json) return;
            this.timelineWidget.value = json;
            this.node.setDirtyCanvas(true, false);
        };
        if (immediate) doSave();
        else this._syncTimer = setTimeout(doSave, 300);
    }

    loadDrawingFromData() {
        if (!this.drawCanvasEl) return;
        if (!this.drawCanvasEl.width || !this.drawCanvasEl.height) return;

        this.drawCtx.clearRect(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        if (this.overlayCanvasEl) this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);

        this.timeline.drawings = this.timeline.drawings || {};
        const dataUrl = this.timeline.drawings[this.currentFrame];

        if (!dataUrl) {
            this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            if ((this.penShapes && this.penShapes.length > 0) || this.penPoints.length > 0 || this.currentPenPoint) {
                this.renderPenPreview();
            }
            return;
        }

        const capturedFrame = this.currentFrame;
        const img = new Image();
        img.onload = () => {
            if (this.currentFrame !== capturedFrame) return;
            if (!this.drawCanvasEl) return;
            this.drawCtx.clearRect(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            this.drawCtx.drawImage(img, 0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            if ((this.penShapes && this.penShapes.length > 0) || this.penPoints.length > 0 || this.currentPenPoint) {
                this.renderPenPreview();
            }
        };
        img.onerror = () => {
            if (this.currentFrame !== capturedFrame) return;
            if (!this.drawCanvasEl || !this.drawCanvasEl.width) return;
            this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        };
        img.src = dataUrl;
    }

    _saveCanvasToData(frameIdx = this.currentFrame) {
        if (!this.drawCanvasEl || !this.drawCanvasEl.width) return;
        this.timeline.drawings = this.timeline.drawings || {};
        let hasDraw = false;
        const data = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height).data;
        const stride = 4 * 8;
        for (let i = 3; i < data.length; i += stride) {
            if (data[i] > 0) { hasDraw = true; break; }
        }
        if (hasDraw) {
            let out = "";
            try { out = this.drawCanvasEl.toDataURL("image/webp", 0.85); } catch { out = ""; }
            if (!out || out.length < 32) out = this.drawCanvasEl.toDataURL("image/png");
            this.timeline.drawings[frameIdx] = out;
        } else {
            delete this.timeline.drawings[frameIdx];
        }
        this.commit(true);
    }

    saveDrawingToData() { this._saveCanvasToData(this.currentFrame); }

    clearCurrentDrawing() {
        if (!this.drawCanvasEl) return;
        this.drawCtx.clearRect(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        if (this.overlayCanvasEl) this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
        this.timeline.drawings = this.timeline.drawings || {};
        delete this.timeline.drawings[this.currentFrame];
        this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        
        this.penShapes = [];
        this.penPoints = [];
        this.penSelectedPoints = [];
        this.currentPenPoint = null;
        this.pendingClosePoint = null;
        this.dragHandleInfo = null;
        this.dragOrigins = null;
        this.isBoxSelecting = false;

        this._undoStack = [];
        this._redoStack = [];
        this.commit(true);
    }

    clearAllDrawings() {
        if (!this.drawCanvasEl) return;
        this.drawCtx.clearRect(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        if (this.overlayCanvasEl) this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
        this.timeline.drawings = {};
        this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);

        this.penShapes = [];
        this.penPoints = [];
        this.penSelectedPoints = [];
        this.currentPenPoint = null;
        this.pendingClosePoint = null;
        this.dragHandleInfo = null;
        this.dragOrigins = null;
        this.isBoxSelecting = false;

        this._undoStack = [];
        this._redoStack = [];
        this.commit(true);
    }

    pushUndoSnapshot() {
        if (!this.drawCanvasEl?.width) return;
        const snap = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        this._undoStack.push(snap);
        if (this._undoStack.length > this._undoLimit) this._undoStack.shift();
        this._redoStack = [];
    }

    undo() {
        if (!this.drawCanvasEl || this._undoStack.length === 0) return;
        const prev = this._undoStack.pop();
        const cur = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        this._redoStack.push(cur);
        this.drawCtx.putImageData(prev, 0, 0);
        this.snapshot = prev;
        this.saveDrawingToData();
    }

    redo() {
        if (!this.drawCanvasEl || this._redoStack.length === 0) return;
        const next = this._redoStack.pop();
        const cur = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        this._undoStack.push(cur);
        this.drawCtx.putImageData(next, 0, 0);
        this.snapshot = next;
        this.saveDrawingToData();
    }

    updateDomWidgetHeight() {
        if (!this.container) return;
        this.container.style.minHeight = "880px";
        if (this.domWidget?.options) this.domWidget.options.getMinHeight = () => 880;
    }
}

const _domDescs = Object.getOwnPropertyDescriptors(DomMixin.prototype);
delete _domDescs.constructor;
Object.defineProperties(VideoEditor.prototype, _domDescs);