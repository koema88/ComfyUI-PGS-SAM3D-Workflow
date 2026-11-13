import { api } from "../../../scripts/api.js";
import { RULER_H, SEG_LABEL_H, TRACK_H, TRACK_Y, MIN_SEG, HANDLE_PX } from "./constants.mjs";
import { STYLES } from "./styles.mjs";
import { clamp, contentDomWidgetMinHeight, bindDomWidgetContentComputeSize } from "./utils.mjs";
import { app } from "../../../scripts/app.js";

export class DomMixin {
    // ★ 修改：始终返回前景色
    _getGlobalColor() {
        return this.timeline?.output?.foregroundColor || "#ffffff";
    }

    buildDOM() {
        this.root = document.createElement("div");
        this.root.className = "bd-wrap";
        
        this.root.innerHTML = `
        <svg style="position:absolute; width:0; height:0; pointer-events:none;" aria-hidden="true">
            <filter id="fvm-levels-filter" color-interpolation-filters="sRGB">
                <feComponentTransfer></feComponentTransfer>
            </filter>
        </svg>
        <style>${STYLES}</style>
        <style>
            .bd-stage { position: relative; background: #111; display: flex; align-items: center; justify-content: center; height: 540px; overflow: hidden; }
            .bd-stage-img-base { position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 1; pointer-events: none; }
            
            /* 核心：组隔离层 */
            .bd-stage-top-layer { position: absolute; top:0; left:0; width:100%; height:100%; z-index: 2; pointer-events: none; transition: opacity 0.1s; isolation: isolate; }
            .bd-stage-img-ref { position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; pointer-events: none; }
            .bd-stage-canvas { position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; cursor: crosshair; pointer-events: auto; }
            
            /* 不参与混合模式的独立辅助画布 */
            .bd-stage-overlay { position: absolute; top:0; left:0; width:100%; height:100%; object-fit: contain; z-index: 5; pointer-events: none; }

            /* ★ 安全框/出血位：仅作视觉提示，无遮挡、无阻挡 */
            .bd-stage-safe-frame {
                position: absolute;
                border: 1px dashed rgba(79, 255, 143, 0.55);
                pointer-events: none;
                z-index: 6;
                display: none;
                box-sizing: border-box;
            }

            /* 画笔 / 橡皮 光标圆环 */
            .bd-cursor-ring { position: absolute; pointer-events: none; z-index: 10; display: none; transform: translate(-50%, -50%); mix-blend-mode: difference; }
            .bd-cursor-ring-outer { position: absolute; inset: 0; border-radius: 50%; border: 1.5px dashed rgba(255,255,255,0.65); }
            .bd-cursor-ring-inner { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.95); }
            
            .bd-lock-btn { background: #4a1515 !important; color: #ff5555 !important; border-color: #ff5555 !important; }
            .bd-lock-btn:hover { background: #632020 !important; }
            .bd-lock-btn.active { background: #1a3a2a !important; color: #4fff8f !important; border-color: #4fff8f !important; }
            .bd-lock-btn.active:hover { background: #1f4a34 !important; }

            .bd-gray-btn.active { background: #333 !important; color: #fff !important; border-color: #888 !important; }

            .bd-tools-panel {
                display: flex; gap: 10px; background: rgba(28, 28, 32, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px;
                padding: 8px; margin-top: 6px;
            }
            .bd-tools-left {
                display: flex; flex-direction: column; gap: 6px;
                border-right: 1px solid rgba(255, 255, 255, 0.1); padding-right: 10px; min-width: 80px;
            }
            .tool-btn {
                background: transparent; color: #ccc; border: 1px solid transparent;
                border-radius: 4px; padding: 6px 8px; cursor: pointer; text-align: left;
                display: flex; align-items: center; gap: 6px; transition: all 0.2s; font-size: 11px;
            }
            .tool-btn:hover { background: rgba(255, 255, 255, 0.05); }
            .tool-btn.active { background: rgba(79, 255, 143, 0.15); color: #4fff8f; border-color: #4fff8f; }
            
            .bd-tools-right { flex: 1; display: flex; align-items: center; }
            .tool-props { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; width: 100%; }
            .tool-props label { font-size: 11px; color: #888; }
            .tool-props input[type="range"] { width: 70px; accent-color: #4fff8f; }
            .tool-props input[type="color"] { width: 24px; height: 24px; padding: 0; border: none; background: transparent; cursor: pointer; }
            
            /* PS 风格色阶条 */
            .bd-levels-widget {
                display: inline-flex; align-items: center; gap: 6px;
                background: #181818; padding: 4px 8px; border-radius: 4px; border: 1px solid #333;
                height: 29px; box-sizing: border-box; user-select: none;
            }
            .bd-levels-track {
                position: relative; width: 120px; height: 10px;
                background: linear-gradient(to right, #000, #fff);
                border: 1px solid #444; border-radius: 2px;
                margin: 0 6px;
            }
            .bd-level-handle {
                position: absolute; top: -4px;
                width: 6px; height: 18px;
                background: #777; border: 1px solid #000; border-radius: 2px;
                transform: translateX(-50%);
                cursor: ew-resize; pointer-events: auto; box-sizing: border-box;
            }
            .bd-level-handle[data-p="black"] { background: #111; border-color: #555; }
            .bd-level-handle[data-p="mid"]   { background: #888; border-color: #555; }
            .bd-level-handle[data-p="white"] { background: #eee; border-color: #555; }

            .hidden { display: none !important; }
        </style>`;

        this.root.innerHTML += `
            <div class="bd-toolbar-wrap">
                <div class="bd-toolbar">
                    <div class="bd-actions" style="gap: 12px;">
                        <button type="button" class="bd-btn" data-a="clear-all-drawings" title="清除所有帧的涂鸦">🗑️ 清空全部</button>
                        <button type="button" class="bd-btn" data-a="clear-current-drawing" title="清除当前帧的涂鸦 (快捷键 C)">🧹 清空本帧 (C)</button>
                        
                        <div class="bd-blend-group" style="display:flex; align-items:center; gap:6px; background: #181818; padding: 4px 8px; border-radius: 4px; border: 1px solid #333;">
                            <label style="color:#888; font-size:11px;">混合</label>
                            <select class="bd-select" data-r="blend-mode" style="padding:2px 4px; font-size:11px; height: 22px; max-width: 100px;">
                                <option value="normal">正常</option>
                                <option value="multiply">正片叠底</option>
                                <option value="screen">滤色</option>
                                <option value="overlay">叠加</option>
                                <option value="soft_light">柔光</option>
                                <option value="hard_light">强光</option>
                            </select>
                            <input type="range" data-r="blend-opacity" min="0" max="100" value="100" style="width:60px; accent-color:#4fff8f;">
                            <span data-r="blend-opacity-val" style="color:#ddd; font-size:11px; width:30px; text-align:right;">100%</span>
                        </div>
                        
                        <!-- ★ 修改：前景/背景双色选择器 -->
                        <div class="bd-color-picker" style="display:flex; align-items:center; gap:8px; background:#181818; padding:4px 8px; border-radius:4px; border:1px solid #333; height:29px; box-sizing:border-box;" title="按 X 键互换前景色和背景色">
                            <label style="color:#888; font-size:11px;">颜色</label>
                            <div style="position:relative; width:38px; height:24px;">
                                <input type="color" data-r="bg-color" value="#000000" style="position:absolute; bottom:0; right:0; width:22px; height:22px; padding:0; border:1px solid #555; border-radius:2px; cursor:pointer;" title="背景色">
                                <input type="color" data-r="fg-color" value="#ffffff" style="position:absolute; top:0; left:0; width:22px; height:22px; padding:0; border:1px solid #888; border-radius:2px; cursor:pointer; z-index:2;" title="前景色 (绘制颜色)">
                            </div>
                            <span style="color:#555; font-size:10px; font-weight:bold;">X 互换</span>
                        </div>
                        
                        <button type="button" class="bd-btn bd-lock-btn" data-a="lock-result" title="锁定后，运行将直接使用当前结果，不再读取上游">🔓 锁定结果</button>
                    </div>
                    <div class="bd-right"><div class="bd-timecode" data-r="timecode">第 1 帧</div></div>
                </div>
            </div>
            <div class="bd-main">
                <div class="bd-stage" data-r="video-stage">
                    <img class="bd-stage-img-base hidden" data-r="stage-img-base" alt="">
                    
                    <div class="bd-stage-top-layer" data-r="stage-top-layer">
                        <img class="bd-stage-img-ref hidden" data-r="stage-img-ref" alt="">
                        <canvas class="bd-stage-canvas" data-r="draw-canvas"></canvas>
                    </div>

                    <canvas class="bd-stage-overlay" data-r="overlay-canvas"></canvas>

                    <div class="bd-stage-safe-frame" data-r="safe-frame"></div>

                    <div class="bd-cursor-ring" data-r="cursor-ring">
                        <div class="bd-cursor-ring-outer"></div>
                        <div class="bd-cursor-ring-inner" data-r="cursor-ring-inner"></div>
                    </div>
                    <div class="bd-stage-empty" data-r="stage-empty">请先点击"运行"以获取图片</div>
                </div>
                <div class="bd-controls">
                    <div class="bd-player">
                        <button type="button" class="bd-icon-btn" data-a="frame-prev">‹</button>
                        <span class="bd-frame-jump">
                            <span>帧</span>
                            <input type="number" class="bd-frame-input" data-r="frame-input" min="1" step="1" value="1">
                            <span>/</span>
                            <span class="bd-frame-total" data-r="frame-total">0</span>
                        </span>
                        <button type="button" class="bd-icon-btn" data-a="frame-next">›</button>
                        <input type="range" class="bd-seek" data-r="seek" min="0" value="0" step="1" style="margin-left: 10px;">
                    </div>
                </div>
                
                <div class="bd-tools-panel">
                    <div class="bd-tools-left">
                        <button class="tool-btn active" data-tool="brush">🖌️ 画笔 (B)</button>
                        <button class="tool-btn" data-tool="eraser">🧽 橡皮 (E)</button>
                        <button class="tool-btn" data-tool="lasso">🪢 套索 (L)</button>
                        <button class="tool-btn" data-tool="pen">🖋️ 钢笔 (P)</button>
                        <button class="tool-btn" data-tool="filter">🎨 滤镜</button>
                    </div>
                    <div class="bd-tools-right">
                        <div class="tool-props" data-tool-props="brush">
                            <label>大小</label>
                            <input type="range" data-r="brush-size" min="1" max="100" value="20">
                            <label style="margin-left: 10px;">羽化</label>
                            <input type="range" data-r="brush-feather" min="0" max="50" value="0">
                        </div>
                        <div class="tool-props hidden" data-tool-props="eraser">
                            <label>大小</label>
                            <input type="range" data-r="eraser-size" min="1" max="100" value="20">
                        </div>
                        <div class="tool-props hidden" data-tool-props="lasso">
                            <label>套索模式</label>
                            <select class="bd-select" data-r="lasso-mode" style="height:22px; padding:0 4px; font-size:11px;">
                                <option value="source-over">填充 (补漏)</option>
                                <option value="destination-out">擦除 (去杂)</option>
                            </select>
                        </div>
                        <div class="tool-props hidden" data-tool-props="pen">
                            <label>钢笔模式</label>
                            <select class="bd-select" data-r="pen-mode" style="height:22px; padding:0 4px; font-size:11px;">
                                <option value="source-over">填充 (补漏)</option>
                                <option value="destination-out">擦除 (去杂)</option>
                            </select>
                        </div>
                        
                        <div class="tool-props hidden" data-tool-props="filter" style="display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding-top: 4px;">
                            <div style="display: flex; align-items: center; gap: 16px; width: 100%;">
                                <button type="button" class="bd-btn bd-gray-btn" data-a="toggle-grayscale" title="将当前组（ID+涂鸦）转为黑白">⬛ 去色</button>
                                
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                                    <label style="color:#888; font-size:11px;">模糊</label>
                                    <input type="range" data-r="filter-blur" min="0" max="50" step="0.5" value="0" style="flex: 1; max-width: 300px; accent-color:#4fff8f;">
                                    <span data-r="filter-blur-val" style="color:#ddd; font-size:11px; width:36px; text-align:right;">0px</span>
                                </div>
                            </div>

                            <div class="bd-levels-widget" style="width: 100%; max-width: 500px; box-sizing: border-box;">
                                <label style="color:#888; font-size:11px; margin-right: 6px;">色阶</label>
                                <div class="bd-levels-track" data-r="levels-track" style="flex: 1; width: auto; margin-right: 12px;">
                                    <div class="bd-level-handle" data-p="black" style="left: 0%;"></div>
                                    <div class="bd-level-handle" data-p="mid" style="left: 50%;"></div>
                                    <div class="bd-level-handle" data-p="white" style="left: 100%;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = "";
        this.container.appendChild(this.root);

        this.timecodeEl = this.root.querySelector('[data-r="timecode"]');
        this.frameInputEl = this.root.querySelector('[data-r="frame-input"]');
        this.frameTotalEl = this.root.querySelector('[data-r="frame-total"]');
        this.seekBar = this.root.querySelector('[data-r="seek"]');
        
        this.stageImgBase = this.root.querySelector('[data-r="stage-img-base"]');
        this.stageImgRef = this.root.querySelector('[data-r="stage-img-ref"]');
        this.stageEmpty = this.root.querySelector('[data-r="stage-empty"]');
        this.stageTopLayer = this.root.querySelector('[data-r="stage-top-layer"]');
        this.safeFrameEl = this.root.querySelector('[data-r="safe-frame"]');
        
        this.drawCanvasEl = this.root.querySelector('[data-r="draw-canvas"]');
        this.drawCtx = this.drawCanvasEl.getContext("2d", { willReadFrequently: true });
        
        this.overlayCanvasEl = this.root.querySelector('[data-r="overlay-canvas"]');
        this.overlayCtx = this.overlayCanvasEl.getContext("2d");

        this._cursorRing = this.root.querySelector('[data-r="cursor-ring"]');
        this._cursorRingInner = this.root.querySelector('[data-r="cursor-ring-inner"]');
        this._stageEl = this.root.querySelector('[data-r="video-stage"]');
        this._lastMousePos = null;

        this.blendModeEl = this.root.querySelector('[data-r="blend-mode"]');
        this.blendOpacityEl = this.root.querySelector('[data-r="blend-opacity"]');
        this.blendOpacityValEl = this.root.querySelector('[data-r="blend-opacity-val"]');
        this.lockBtn = this.root.querySelector('[data-a="lock-result"]');
        this.grayBtn = this.root.querySelector('[data-a="toggle-grayscale"]');
        
        // ★ 获取前景/背景色 DOM
        this.fgColorEl = this.root.querySelector('[data-r="fg-color"]');
        this.bgColorEl = this.root.querySelector('[data-r="bg-color"]');

        this.levelFilter = this.root.querySelector('#fvm-levels-filter feComponentTransfer');
        this.levelsTrackEl = this.root.querySelector('[data-r="levels-track"]');
        this.levelHandles = {
            black: this.root.querySelector('[data-p="black"]'),
            mid: this.root.querySelector('[data-p="mid"]'),
            white: this.root.querySelector('[data-p="white"]')
        };
        this.blurEl = this.root.querySelector('[data-r="filter-blur"]');
        this.blurValEl = this.root.querySelector('[data-r="filter-blur-val"]');
    }

    bindEvents() {
        const bind = (sel, fn) => {
            const el = this.root.querySelector(sel);
            if (el) el.onclick = (e) => { e.stopPropagation(); Promise.resolve(fn()).catch(console.error); };
        };
        bind('[data-a="frame-prev"]', () => this.stepFrame(-1));
        bind('[data-a="frame-next"]', () => this.stepFrame(1));
        
        bind('[data-a="clear-all-drawings"]', () => { this.clearAllDrawings(); });
        bind('[data-a="clear-current-drawing"]', () => { this.clearCurrentDrawing(); });
        
        bind('[data-a="toggle-grayscale"]', () => {
            this.timeline.output = this.timeline.output || {};
            this.timeline.output.grayscale = !this.timeline.output.grayscale;
            this.syncUIFromData();
            this.commit(true);
        });

        bind('[data-a="lock-result"]', () => {
            this.timeline.lockResult = !this.timeline.lockResult;
            this.syncUIFromData();
            this.commit(true);
        });

        // ★ 前景/背景色输入监听
        this.fgColorEl.addEventListener("input", () => {
            this.timeline.output.foregroundColor = this.fgColorEl.value;
            this.commit(true);
        });
        this.bgColorEl.addEventListener("input", () => {
            this.timeline.output.backgroundColor = this.bgColorEl.value;
            this.commit(true);
        });

        // 色阶拖拽事件
        let dragState = null;
        this.levelsTrackEl.addEventListener("pointerdown", (e) => {
            const handle = e.target.closest('.bd-level-handle');
            if (!handle) return;
            e.preventDefault();
            e.stopPropagation();
            
            const p = handle.dataset.p;
            dragState = {
                p,
                startX: e.clientX,
                startVal: this.timeline.output.levels[p],
                handle,
                pointerId: e.pointerId
            };
            handle.setPointerCapture(e.pointerId);
            handle.style.zIndex = 10;
        });
        
        this.levelsTrackEl.addEventListener("pointermove", (e) => {
            if (!dragState) return;
            const rect = this.levelsTrackEl.getBoundingClientRect();
            const pxRange = rect.width;
            const dx = e.clientX - dragState.startX;
            const valDelta = (dx / pxRange) * 255;
            
            let newVal = Math.round(dragState.startVal + valDelta);
            newVal = Math.max(0, Math.min(255, newVal));
            
            const levels = this.timeline.output.levels;
            if (dragState.p === 'black') {
                newVal = Math.min(newVal, levels.mid - 1);
            } else if (dragState.p === 'mid') {
                newVal = Math.max(newVal, levels.black + 1);
                newVal = Math.min(newVal, levels.white - 1);
            } else if (dragState.p === 'white') {
                newVal = Math.max(newVal, levels.mid + 1);
            }
            
            if (levels[dragState.p] !== newVal) {
                levels[dragState.p] = newVal;
                dragState.handle.style.left = `${(newVal / 255) * 100}%`;
                this.updateBlendStyles();
            }
        });
        
        this.levelsTrackEl.addEventListener("pointerup", (e) => {
            if (dragState) {
                dragState.handle.releasePointerCapture(dragState.pointerId);
                dragState.handle.style.zIndex = '';
                dragState = null;
                this.commit(true);
            }
        });
        this.levelsTrackEl.addEventListener("pointercancel", (e) => {
            if (dragState) {
                dragState.handle.releasePointerCapture(dragState.pointerId);
                dragState.handle.style.zIndex = '';
                dragState = null;
                this.commit(true);
            }
        });

        // 模糊事件
        this.blurEl.addEventListener("input", () => {
            this.timeline.output = this.timeline.output || {};
            this.timeline.output.blur = +this.blurEl.value;
            this.blurValEl.textContent = this.blurEl.value + "px";
            this.updateBlendStyles();
            this.commit(true);
        });

        // ─────────── 画笔/橡皮 光标圆环 ───────────
        this._updateCursorRingSize = () => {
            const ring = this._cursorRing;
            const inner = this._cursorRingInner;
            if (!ring || !inner) return;
            if (this.currentTool !== "brush" && this.currentTool !== "eraser") return;
            if (!this.drawCanvasEl.width || !this.drawCanvasEl.height) {
                ring.style.display = "none";
                return;
            }
            let size = 20;
            let feather = 0;
            if (this.currentTool === "brush") {
                const sz = this.root.querySelector('[data-r="brush-size"]');
                const fe = this.root.querySelector('[data-r="brush-feather"]');
                if (sz) size = +sz.value || 20;
                if (fe) feather = +fe.value || 0;
            } else {
                const sz = this.root.querySelector('[data-r="eraser-size"]');
                if (sz) size = +sz.value || 20;
            }
            const clientW = this.drawCanvasEl.clientWidth;
            const scale = (clientW > 0 && this.drawCanvasEl.width > 0) ? clientW / this.drawCanvasEl.width : 1;
            const innerDispSize = Math.max(2, size * scale);
            const outerDispSize = Math.max(innerDispSize + 2, (size + 2 * feather) * scale);
            ring.style.width = `${outerDispSize}px`;
            ring.style.height = `${outerDispSize}px`;
            inner.style.width = `${innerDispSize}px`;
            inner.style.height = `${innerDispSize}px`;
        };

        this._updateCursorRingPos = (clientX, clientY) => {
            const ring = this._cursorRing;
            const stage = this._stageEl;
            if (!ring || !stage) return;
            if (this.currentTool !== "brush" && this.currentTool !== "eraser") { ring.style.display = "none"; return; }
            if (!this.drawCanvasEl.width || !this.drawCanvasEl.height) { ring.style.display = "none"; return; }
            const stageRect = stage.getBoundingClientRect();
            const k = (stage.clientWidth && stageRect.width) ? (stageRect.width / stage.clientWidth) : 1;
            ring.style.left = `${(clientX - stageRect.left) / (k || 1)}px`;
            ring.style.top = `${(clientY - stageRect.top) / (k || 1)}px`;
            ring.style.display = "block";
            this._updateCursorRingSize();
        };

        for (const sel of ['[data-r="brush-size"]', '[data-r="eraser-size"]', '[data-r="brush-feather"]']) {
            const el = this.root.querySelector(sel);
            if (el) el.addEventListener("input", () => {
                if (this._lastMousePos) this._updateCursorRingPos(this._lastMousePos.x, this._lastMousePos.y);
            });
        }

        const toolBtns = this.root.querySelectorAll(".tool-btn");
        const propDivs = this.root.querySelectorAll(".tool-props");

        this.switchTool = async (toolName) => {
            await this.bakeShapesToCanvas();
            this.currentTool = toolName;
            toolBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tool === toolName));
            propDivs.forEach(div => div.classList.toggle("hidden", div.dataset.toolProps !== toolName));
            if (this.drawCanvasEl) {
                if (toolName === "brush" || toolName === "eraser") this.drawCanvasEl.style.cursor = "none";
                else this.drawCanvasEl.style.cursor = toolName ? "crosshair" : "default";
            }
            if (this._cursorRing && toolName !== "brush" && toolName !== "eraser") this._cursorRing.style.display = "none";

            this.isDrawing = false;
            this.lassoPoints = [];
            this.penPoints = [];
            this.penSelectedPoints = [];
            this.currentPenPoint = null;
            this.pendingClosePoint = null;
            this.dragHandleInfo = null;
            this.dragOrigins = null;
            this.isBoxSelecting = false;
            this.snapshot = null;
            
            if (this.overlayCanvasEl) this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
            this.loadDrawingFromData();
            this.drawCtx.setLineDash([]);
            if (this._lastMousePos) this._updateCursorRingPos(this._lastMousePos.x, this._lastMousePos.y);
        };

        toolBtns.forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                Promise.resolve(this.switchTool(btn.dataset.tool)).catch(console.error);
            };
        });

        this.switchTool("brush").catch(console.error);

        this.seekBar.oninput = () => { this.seekToFrame(+this.seekBar.value).catch(console.error); };
        this.frameInputEl.addEventListener("change", () => {
            const raw = parseInt(this.frameInputEl.value, 10);
            if (Number.isFinite(raw)) this.seekToFrame(raw - 1).catch(console.error);
        });

        const getDrawPos = (e) => {
            const canvas = this.drawCanvasEl;
            const rect = canvas.getBoundingClientRect();
            const cw = rect.width || 1;
            const ch = rect.height || 1;
            return [
                (e.clientX - rect.left) * (canvas.width / cw),
                (e.clientY - rect.top) * (canvas.height / ch)
            ];
        };

        const getAllAnchors = () => {
            const all = [...this.penPoints];
            if (this.penShapes) this.penShapes.forEach(shape => all.push(...shape.points));
            return all;
        };

        const findAnchorAt = (x, y) => {
            const all = getAllAnchors();
            for (let i = all.length - 1; i >= 0; i--) {
                const p = all[i];
                if (Math.hypot(x - p.x, y - p.y) <= 25) return p; 
            }
            return null;
        };

        const findHandleAt = (x, y) => {
            const all = getAllAnchors();
            for (let p of all) {
                if (p.cp1 && Math.hypot(x - p.cp1.x, y - p.cp1.y) <= 20) return { point: p, handle: 'cp1' };
                if (p.cp2 && Math.hypot(x - p.cp2.x, y - p.cp2.y) <= 20) return { point: p, handle: 'cp2' };
            }
            return null;
        };

        let isDrawing = false;

        this._onGlobalMouseMove = (e) => {
            if (!this.drawCanvasEl) return;
            const rect = this.drawCanvasEl.getBoundingClientRect();
            const isInside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

            if (isInside) {
                this._lastMousePos = { x: e.clientX, y: e.clientY };
                this._updateCursorRingPos(e.clientX, e.clientY);
            } else {
                if (this._cursorRing) this._cursorRing.style.display = "none";
            }

            const isEditing = isDrawing || this.dragHandleInfo || this.dragOrigins || this.isBoxSelecting || this.pendingClosePoint || (this.currentTool === "pen" && isInside);
            
            if (!isInside && !isDrawing && !this.dragHandleInfo && !this.dragOrigins && !this.isBoxSelecting && !this.pendingClosePoint) return;
            if (this.currentTool === "filter") return;

            const [x, y] = getDrawPos(e);

            if (this.currentTool === "pen") {
                if (this.isBoxSelecting) {
                    this.boxEnd = {x, y};
                    this.renderPenPreview(x, y);
                    return;
                }
                if (this.pendingClosePoint) {
                    const dragDist = Math.hypot(x - this.pendingClosePoint.startX, y - this.pendingClosePoint.startY);
                    if (dragDist > 3) this.pendingClosePoint.cp1 = { x: x, y: y };
                    this.renderPenPreview(x, y);
                    return;
                }
                if (this.dragHandleInfo) {
                    const p = this.dragHandleInfo.point;
                    const handle = this.dragHandleInfo.handle;
                    p[handle] = { x, y };
                    const otherHandle = handle === 'cp1' ? 'cp2' : 'cp1';
                    p[otherHandle] = { x: p.x - (x - p.x), y: p.y - (y - p.y) };
                    this.renderPenPreview(x, y);
                    return;
                }
                if (this.dragOrigins) {
                    const dx = x - this.dragStartMouse.x;
                    const dy = y - this.dragStartMouse.y;
                    this.dragOrigins.forEach(item => {
                        item.p.x = item.origX + dx;
                        item.p.y = item.origY + dy;
                        if (item.p.cp1 && item.origCp1X !== null) { item.p.cp1.x = item.origCp1X + dx; item.p.cp1.y = item.origCp1Y + dy; }
                        if (item.p.cp2 && item.origCp2X !== null) { item.p.cp2.x = item.origCp2X + dx; item.p.cp2.y = item.origCp2Y + dy; }
                    });
                    this.renderPenPreview(x, y);
                    return;
                }
            }

            if (!isDrawing && this.currentTool !== "pen") return;
            
            if (this.currentTool === "brush" || this.currentTool === "eraser") {
                if (!isDrawing) return;
                this.drawCtx.lineTo(x, y);
                this.drawCtx.stroke();
            } 
            else if (this.currentTool === "lasso" && isDrawing) {
                const lastPoint = this.lassoPoints[this.lassoPoints.length - 1];
                if (Math.hypot(x - lastPoint.x, y - lastPoint.y) > 4) this.lassoPoints.push({x, y});
                this.renderLassoPreview(x, y);
            }
            else if (this.currentTool === "pen") {
                if (isDrawing && this.currentPenPoint) {
                    const dragDist = Math.hypot(x - this.currentPenPoint.startX, y - this.currentPenPoint.startY);
                    if (dragDist > 3) {
                        const dx = x - this.currentPenPoint.startX;
                        const dy = y - this.currentPenPoint.startY;
                        this.currentPenPoint.cp2 = { x: this.currentPenPoint.x + dx, y: this.currentPenPoint.y + dy };
                        this.currentPenPoint.cp1 = { x: this.currentPenPoint.x - dx, y: this.currentPenPoint.y - dy };
                    }
                }
                this.renderPenPreview(x, y);
            }
        };
        window.addEventListener("mousemove", this._onGlobalMouseMove);

        this.drawCanvasEl.addEventListener("mousedown", (e) => {
            if (!this.currentTool) return;
            if (!this.drawCanvasEl.width || !this.drawCanvasEl.height) return;
            if (this.currentTool === "filter") return;
            
            this.isBoxSelecting = false;
            const [x, y] = getDrawPos(e);
            const isCtrl = e.ctrlKey || e.metaKey;

            if (this.currentTool === "brush" || this.currentTool === "eraser") {
                if (typeof this.pushUndoSnapshot === "function") this.pushUndoSnapshot();
            }

            if (this.currentTool === "pen") {
                const hitAnchor = findAnchorAt(x, y);
                const hitHandle = findHandleAt(x, y);

                if (this.penPoints.length >= 2) {
                    const firstPoint = this.penPoints[0];
                    if (Math.hypot(x - firstPoint.x, y - firstPoint.y) < 30) {
                        this.pendingClosePoint = { x: firstPoint.x, y: firstPoint.y, cp1: null, cp2: firstPoint.cp2 ? { ...firstPoint.cp2 } : null, startX: x, startY: y };
                        this.renderPenPreview(x, y);
                        return;
                    }
                }

                if (isCtrl) {
                    if (hitAnchor) {
                        const idx = this.penSelectedPoints.indexOf(hitAnchor);
                        if (idx >= 0) this.penSelectedPoints.splice(idx, 1);
                        else this.penSelectedPoints.push(hitAnchor);
                    } else if (hitHandle) {
                        this.dragHandleInfo = hitHandle;
                        if (!this.penSelectedPoints.includes(hitHandle.point)) this.penSelectedPoints.push(hitHandle.point);
                    } else {
                        if (!this.snapshot) this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
                        this.isBoxSelecting = true;
                        this.boxStart = {x, y};
                        this.boxEnd = {x, y};
                    }
                    this.renderPenPreview(x, y);
                    return;
                }

                if (hitHandle) {
                    this.dragHandleInfo = hitHandle;
                    this.renderPenPreview(x, y);
                    return;
                }

                if (hitAnchor) {
                    if (!this.penSelectedPoints.includes(hitAnchor)) this.penSelectedPoints = [hitAnchor];
                    this.dragOrigins = this.penSelectedPoints.map(p => ({
                        p: p, origX: p.x, origY: p.y,
                        origCp1X: p.cp1 ? p.cp1.x : null, origCp1Y: p.cp1 ? p.cp1.y : null,
                        origCp2X: p.cp2 ? p.cp2.x : null, origCp2Y: p.cp2 ? p.cp2.y : null,
                    }));
                    this.dragStartMouse = {x, y};
                    this.renderPenPreview(x, y);
                    return;
                }
                if (this.penSelectedPoints.length > 0) this.penSelectedPoints = [];
            }

            isDrawing = true;
            if (this.currentTool === "lasso" || (this.currentTool === "pen" && this.penPoints.length === 0)) {
                if (!this.snapshot || this.currentTool === "lasso") this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            }
            
            if (this.currentTool === "brush") {
                const color = this._getGlobalColor();
                const size = +this.root.querySelector('[data-r="brush-size"]').value;
                const feather = +this.root.querySelector('[data-r="brush-feather"]').value;
                this.drawCtx.globalCompositeOperation = "source-over";
                this.drawCtx.strokeStyle = color;
                this.drawCtx.lineWidth = size;
                this.drawCtx.lineCap = "round";
                this.drawCtx.lineJoin = "round";
                this.drawCtx.shadowBlur = feather;
                this.drawCtx.shadowColor = color;
                this.drawCtx.beginPath();
                this.drawCtx.moveTo(x, y);
                this.drawCtx.lineTo(x, y);
                this.drawCtx.stroke();
            } 
            else if (this.currentTool === "eraser") {
                const size = +this.root.querySelector('[data-r="eraser-size"]').value;
                this.drawCtx.globalCompositeOperation = "destination-out";
                this.drawCtx.strokeStyle = "rgba(0,0,0,1)";
                this.drawCtx.lineWidth = size;
                this.drawCtx.lineCap = "round";
                this.drawCtx.lineJoin = "round";
                this.drawCtx.shadowBlur = 0;
                this.drawCtx.beginPath();
                this.drawCtx.moveTo(x, y);
                this.drawCtx.lineTo(x, y);
                this.drawCtx.stroke();
            }
            else if (this.currentTool === "lasso") {
                this.lassoPoints = [{x, y}];
                this.renderLassoPreview(x, y);
            }
            else if (this.currentTool === "pen") {
                this.currentPenPoint = { x, y, cp1: null, cp2: null, startX: x, startY: y };
                this.renderPenPreview(x, y);
            }
        });

        const finishDraw = () => {
            if (this.currentTool === "filter") return;
            
            if (this.currentTool === "pen") {
                if (this.isBoxSelecting) {
                    this.isBoxSelecting = false;
                    if (this.boxStart && this.boxEnd) {
                        const x1 = Math.min(this.boxStart.x, this.boxEnd.x);
                        const x2 = Math.max(this.boxStart.x, this.boxEnd.x);
                        const y1 = Math.min(this.boxStart.y, this.boxEnd.y);
                        const y2 = Math.max(this.boxStart.y, this.boxEnd.y);
                        const all = getAllAnchors();
                        this.penSelectedPoints = all.filter(p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
                    }
                    this.boxStart = null;
                    this.boxEnd = null;
                    this.renderPenPreview();
                    return;
                }
                if (this.pendingClosePoint) {
                    const first = this.penPoints[0];
                    if (this.pendingClosePoint.cp1) first.cp1 = { ...this.pendingClosePoint.cp1 };
                    this.pendingClosePoint = null;
                    this.closePenPath();
                    return;
                }
                if (this.dragHandleInfo) {
                    this.dragHandleInfo = null;
                    this.renderPenPreview();
                    return;
                }
                if (this.dragOrigins) {
                    this.dragOrigins = null;
                    this.renderPenPreview();
                    return;
                }
            }
            
            if (!isDrawing) return;
            isDrawing = false;
            
            if (this.currentTool === "lasso" && this.lassoPoints.length > 3) {
                this.drawCtx.globalCompositeOperation = this.root.querySelector('[data-r="lasso-mode"]').value;
                this.drawCtx.fillStyle = this._getGlobalColor();
                this.drawCtx.beginPath();
                this.drawCtx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
                for (let i = 1; i < this.lassoPoints.length; i++) this.drawCtx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
                this.drawCtx.closePath();
                this.drawCtx.fill();
                this.drawCtx.globalCompositeOperation = "source-over";
                this.saveDrawingToData();
                this.lassoPoints = [];
                
                this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
            }
            
            if (this.currentTool === "pen" && this.currentPenPoint) {
                this.penPoints.push(this.currentPenPoint);
                this.currentPenPoint = null;
                this.renderPenPreview();
            }
            
            if (this.currentTool === "brush" || this.currentTool === "eraser") {
                this.drawCtx.shadowBlur = 0;
                this.saveDrawingToData();
            }
        };

        this.drawCanvasEl.addEventListener("mouseup", finishDraw);
        this._finishDrawHandler = finishDraw;
        window.addEventListener("mouseup", finishDraw);

        this.drawCanvasEl.addEventListener("dblclick", () => {
            if (this.currentTool === "pen") {
                this.pendingClosePoint = null; 
                this.currentPenPoint = null;
                if (this.penPoints.length > 1) this.closePenPath();
            }
        });

        this._onKeyDown = async (e) => {
            const sel = app?.canvas?.selected_nodes;
            if (this.node?.id != null && sel && !sel[this.node.id]) return;

            const t = e.target;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

            if (e.key === "Enter" && this.currentTool === "pen") {
                e.preventDefault();
                if (this.penPoints.length > 1) {
                    this.penShapes = this.penShapes || [];
                    this.penShapes.push({ points: this.penPoints, mode: this.root.querySelector('[data-r="pen-mode"]').value });
                }
                this.penPoints = []; this.penSelectedPoints = []; this.currentPenPoint = null;
                this.pendingClosePoint = null; this.dragHandleInfo = null; this.dragOrigins = null;
                this.isBoxSelecting = false; this.drawCtx.setLineDash([]);
                
                await this.bakeShapesToCanvas();
                this.overlayCtx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) this.redo(); else this.undo();
                return;
            }

            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                await this.stepFrame(e.key === "ArrowLeft" ? -step : step);
                return;
            }

            const k = e.key.toLowerCase();

            // ★ 新增：X 键切换前景/背景色
            if (k === "x" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                const out = this.timeline.output;
                const temp = out.foregroundColor || "#ffffff";
                out.foregroundColor = out.backgroundColor || "#000000";
                out.backgroundColor = temp;
                this.syncUIFromData();
                this.commit(true);
                return;
            }

            // ★ 新增：C 键清空当前帧涂鸦
            if (k === "c" && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                this.clearCurrentDrawing();
                return;
            }

            // ★ 新增：D 切换上一帧，F 切换下一帧（Shift 加速 10 帧）
            if ((k === "d" || k === "f") && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                await this.stepFrame(k === "d" ? -step : step);
                return;
            }

            if (k === "b") { e.preventDefault(); await this.switchTool("brush"); }
            else if (k === "e") { e.preventDefault(); await this.switchTool("eraser"); }
            else if (k === "l") { e.preventDefault(); await this.switchTool("lasso"); }
            else if (k === "p") { e.preventDefault(); await this.switchTool("pen"); }
            else if (k === "[" || k === "]") {
                const sizeInput = this.root.querySelector('[data-r="brush-size"]');
                if (sizeInput) {
                    e.preventDefault();
                    const step = 2;
                    let v = (+sizeInput.value) + (k === "]" ? step : -step);
                    v = Math.max(+sizeInput.min, Math.min(+sizeInput.max, v));
                    sizeInput.value = String(v);
                    if (this._lastMousePos) this._updateCursorRingPos(this._lastMousePos.x, this._lastMousePos.y);
                }
            }
        };
        this._onKeyDownWrapper = (e) => { Promise.resolve(this._onKeyDown(e)).catch(console.error); };
        window.addEventListener("keydown", this._onKeyDownWrapper);

        this.blendModeEl.oninput = () => { this.updateBlendStyles(); this.onBlendField("blendMode", this.blendModeEl.value); };
        this.blendOpacityEl.oninput = () => {
            if (this.blendOpacityValEl) this.blendOpacityValEl.textContent = this.blendOpacityEl.value + "%";
            this.updateBlendStyles();
            this.onBlendField("blendOpacity", +this.blendOpacityEl.value);
        };

        this._onExecuted = (e) => {
            const detail = e.detail;
            if (!detail) return;
            const nid = String(this.node.id);
            if (String(detail.node) !== nid && String(detail.display_node) !== nid) return;
            const output = detail.output;
            if (!output) return;

            let masks = output.preview_masks || output.images || [];
            let refs = output.preview_refs || [];

            if (masks.length === 0 && refs.length > 0) { masks = refs; refs = []; }

            if (masks.length > 0) {
                const t = Date.now();
                const buildUrl = (img) => api.apiURL(`/view?filename=${encodeURIComponent(img.filename)}&type=${encodeURIComponent(img.type || "temp")}&subfolder=${encodeURIComponent(img.subfolder || "")}&t=${t}`);
                this.batchMasks = masks.map(buildUrl);
                this.batchRefs = refs.map(buildUrl);

                this.timeline.totalFrames = this.batchMasks.length;
                if (this.seekBar) this.seekBar.max = this.batchMasks.length - 1;
                this.currentFrame = Math.min(this.currentFrame, this.batchMasks.length - 1);
                this.updateTimelineDom();

                try {
                    this._syncStagePreview();
                    this.updateDomWidgetHeight();
                } catch (err) { console.error("[FVM-PGS] 渲染预览时出错:", err); }
                this.commit();
            }
        };
        api.addEventListener("executed", this._onExecuted);

        this.root.querySelectorAll("input, select, button").forEach(el => {
            ["pointerdown", "mousedown", "mouseup", "click", "dblclick"].forEach(name => {
                el.addEventListener(name, ev => ev.stopPropagation());
            });
        });
    }

    async bakeShapesToCanvas() {
        if (!this.penShapes || this.penShapes.length === 0) return;
        if (!this.drawCanvasEl) return;
        if (!this.drawCanvasEl.width || !this.drawCanvasEl.height) return;

        const frameIdx = this.currentFrame;
        const shapes = this.penShapes.slice();
        this.penShapes = [];

        const fillColor = this._getGlobalColor();

        const drawAndSave = (baseImg) => {
            this.drawCtx.clearRect(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            if (baseImg) this.drawCtx.drawImage(baseImg, 0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
            
            this.drawCtx.save();
            for (const shape of shapes) {
                this.drawCtx.globalCompositeOperation = shape.mode;
                this.drawCtx.fillStyle = fillColor;
                this.drawCtx.beginPath();
                this.drawCtx.moveTo(shape.points[0].x, shape.points[0].y);
                
                for (let i = 1; i < shape.points.length; i++) {
                    const curr = shape.points[i];
                    const prev = shape.points[i - 1];
                    this.drawCtx.bezierCurveTo(prev.cp2 ? prev.cp2.x : prev.x, prev.cp2 ? prev.cp2.y : prev.y, curr.cp1 ? curr.cp1.x : curr.x, curr.cp1 ? curr.cp1.y : curr.y, curr.x, curr.y);
                }
                
                const last = shape.points[shape.points.length - 1];
                const first = shape.points[0];
                this.drawCtx.bezierCurveTo(last.cp2 ? last.cp2.x : last.x, last.cp2 ? last.cp2.y : last.y, first.cp1 ? first.cp1.x : first.x, first.cp1 ? first.cp1.y : first.y, first.x, first.y);
                
                this.drawCtx.closePath();
                this.drawCtx.fill();
            }
            this.drawCtx.restore();

            if (typeof this._saveCanvasToData === "function") this._saveCanvasToData(frameIdx);
            else this.saveDrawingToData();
            
            this.snapshot = this.drawCtx.getImageData(0, 0, this.drawCanvasEl.width, this.drawCanvasEl.height);
        };

        const dataUrl = this.timeline.drawings ? this.timeline.drawings[frameIdx] : null;
        if (dataUrl) {
            await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => { drawAndSave(img); resolve(); };
                img.onerror = () => { drawAndSave(null); resolve(); };
                img.src = dataUrl;
            });
        } else {
            drawAndSave(null);
        }
    }

    closePenPath() {
        if (this.currentTool !== "pen" || this.penPoints.length < 2) return;
        this.penShapes = this.penShapes || [];
        this.penShapes.push({ points: this.penPoints, mode: this.root.querySelector('[data-r="pen-mode"]').value });
        this.penPoints = []; this.currentPenPoint = null; this.penSelectedPoints = [];
        this.pendingClosePoint = null; this.drawCtx.setLineDash([]);
        this.renderPenPreview();
    }

    renderLassoPreview(currentX, currentY) {
        if (!this.overlayCtx || this.lassoPoints.length === 0) return;
        const ctx = this.overlayCtx;
        ctx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);
        
        const rect = this.drawCanvasEl.getBoundingClientRect();
        const displayScale = rect.width > 0 ? (this.drawCanvasEl.width / rect.width) : 1;

        ctx.save();
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 2 * displayScale;
        ctx.setLineDash([6 * displayScale, 4 * displayScale]);
        ctx.beginPath();
        ctx.moveTo(this.lassoPoints[0].x, this.lassoPoints[0].y);
        for (let i = 1; i < this.lassoPoints.length; i++) {
            ctx.lineTo(this.lassoPoints[i].x, this.lassoPoints[i].y);
        }
        if (currentX !== undefined && currentY !== undefined) {
            ctx.lineTo(currentX, currentY);
        }
        ctx.stroke();
        
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(0, 255, 0, 0.15)";
        ctx.fill();
        ctx.restore();
    }

    renderPenPreview(mouseX, mouseY) {
        if (!this.overlayCtx) return;
        
        const ctx = this.overlayCtx;
        ctx.clearRect(0, 0, this.overlayCanvasEl.width, this.overlayCanvasEl.height);

        if (this.penPoints.length === 0 && (!this.penShapes || this.penShapes.length === 0) && !this.currentPenPoint && !this.pendingClosePoint && !this.isBoxSelecting && !this.dragOrigins) {
            return;
        }

        const rect = this.drawCanvasEl.getBoundingClientRect();
        const displayScale = rect.width > 0 ? (this.drawCanvasEl.width / rect.width) : 1;
        
        const ptR = 7 * displayScale; const ptStroke = 2.5 * displayScale; const hlR = 4 * displayScale; const lineW = 2 * displayScale;
        const dashLine = [6 * displayScale, 4 * displayScale]; const dashLineWhite = [4 * displayScale, 4 * displayScale];
        const fillColor = this._getGlobalColor();
        
        ctx.save();
        
        if (this.penShapes && this.penShapes.length > 0) {
            ctx.save();
            this.penShapes.forEach(shape => {
                ctx.globalCompositeOperation = shape.mode;
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.moveTo(shape.points[0].x, shape.points[0].y);
                for (let i = 1; i < shape.points.length; i++) {
                    const curr = shape.points[i];
                    const prev = shape.points[i - 1];
                    ctx.bezierCurveTo(prev.cp2 ? prev.cp2.x : prev.x, prev.cp2 ? prev.cp2.y : prev.y, curr.cp1 ? curr.cp1.x : curr.x, curr.cp1 ? curr.cp1.y : curr.y, curr.x, curr.y);
                }
                const last = shape.points[shape.points.length - 1];
                const first = shape.points[0];
                ctx.bezierCurveTo(last.cp2 ? last.cp2.x : last.x, last.cp2 ? last.cp2.y : last.y, first.cp1 ? first.cp1.x : first.x, first.cp1 ? first.cp1.y : first.y, first.x, first.y);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = "#00ff00";
                ctx.lineWidth = lineW;
                ctx.stroke();
            });
            ctx.restore();
        }

        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = lineW;
        ctx.setLineDash([]);

        const allPoints = [...this.penPoints];
        if (this.pendingClosePoint) allPoints.push(this.pendingClosePoint);
        else if (this.currentPenPoint) allPoints.push(this.currentPenPoint);
        
        if (allPoints.length > 0) {
            ctx.beginPath();
            ctx.moveTo(allPoints[0].x, allPoints[0].y);
            for (let i = 1; i < allPoints.length; i++) {
                const curr = allPoints[i];
                const prev = allPoints[i - 1];
                ctx.bezierCurveTo(prev.cp2 ? prev.cp2.x : prev.x, prev.cp2 ? prev.cp2.y : prev.y, curr.cp1 ? curr.cp1.x : curr.x, curr.cp1 ? curr.cp1.y : curr.y, curr.x, curr.y);
            }
            ctx.stroke();
        }
        
        const isEditing = this.penSelectedPoints.length > 0 || this.isBoxSelecting || this.dragOrigins !== null || this.dragHandleInfo !== null;
        if (!isEditing && mouseX !== undefined && mouseY !== undefined && !this.currentPenPoint && !this.pendingClosePoint) {
            ctx.setLineDash(dashLineWhite);
            ctx.strokeStyle = "#ffffff";
            ctx.beginPath();
            const last = allPoints[allPoints.length - 1];
            if (last) {
                ctx.moveTo(last.x, last.y);
                ctx.lineTo(mouseX, mouseY);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }
        
        const anchorsToDraw = new Set();
        allPoints.forEach(p => anchorsToDraw.add(p));
        if (this.penShapes) this.penShapes.forEach(shape => shape.points.forEach(p => anchorsToDraw.add(p)));

        const pointsToShowHandles = new Set();
        if (isEditing) anchorsToDraw.forEach(p => pointsToShowHandles.add(p));
        else {
            if (this.currentPenPoint) pointsToShowHandles.add(this.currentPenPoint);
            if (this.pendingClosePoint) pointsToShowHandles.add(this.pendingClosePoint);
        }

        for (let p of pointsToShowHandles) {
            if (p.cp1) {
                ctx.strokeStyle = "#00ff00"; ctx.lineWidth = 1.5 * displayScale; ctx.setLineDash([4 * displayScale, 4 * displayScale]);
                ctx.beginPath(); ctx.moveTo(p.cp1.x, p.cp1.y);
                if (p.cp2) ctx.lineTo(p.cp2.x, p.cp2.y); else ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.setLineDash([]); ctx.fillStyle = "#00ff00";
                ctx.beginPath(); ctx.arc(p.cp1.x, p.cp1.y, hlR, 0, Math.PI * 2); ctx.fill();
            }
            if (p.cp2) {
                if (!p.cp1) {
                    ctx.strokeStyle = "#00ff00"; ctx.lineWidth = 1.5 * displayScale; ctx.setLineDash([4 * displayScale, 4 * displayScale]);
                    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.cp2.x, p.cp2.y); ctx.stroke();
                }
                ctx.setLineDash([]); ctx.fillStyle = "#00ff00";
                ctx.beginPath(); ctx.arc(p.cp2.x, p.cp2.y, hlR, 0, Math.PI * 2); ctx.fill();
            }
        }

        anchorsToDraw.forEach((p) => {
            ctx.setLineDash([]);
            const isSelected = this.penSelectedPoints.includes(p) || (this.dragHandleInfo && this.dragHandleInfo.point === p);
            ctx.fillStyle = isSelected ? "#ffff00" : "#ffffff";
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = ptStroke;
            ctx.beginPath(); ctx.arc(p.x, p.y, ptR, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            if (mouseX !== undefined && mouseY !== undefined && Math.hypot(mouseX - p.x, mouseY - p.y) < 20 * displayScale) {
                ctx.beginPath(); ctx.arc(p.x, p.y, ptR + 4 * displayScale, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(0, 255, 0, 0.3)"; ctx.fill();
                ctx.strokeStyle = "#00ff00"; ctx.lineWidth = ptStroke; ctx.stroke();
            }
        });

        if (this.isBoxSelecting && this.boxStart && this.boxEnd) {
            const x = Math.min(this.boxStart.x, this.boxEnd.x); const y = Math.min(this.boxStart.y, this.boxEnd.y);
            const w = Math.abs(this.boxEnd.x - this.boxStart.x); const h = Math.abs(this.boxEnd.y - this.boxStart.y);
            ctx.setLineDash(dashLine); ctx.lineWidth = 2 * displayScale; ctx.strokeStyle = "#00aaff";
            ctx.fillStyle = "rgba(0, 170, 255, 0.15)"; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    updateSelectionUI() { if (this.timeline.segments?.length) this.selectedIndex = clamp(this.selectedIndex, 0, this.timeline.segments.length - 1); }

    destroy() {
        clearTimeout(this._syncTimer);
        if (this._onExecuted) api.removeEventListener("executed", this._onExecuted);
        if (this._onKeyDownWrapper) window.removeEventListener("keydown", this._onKeyDownWrapper);
        if (this._onGlobalMouseMove) window.removeEventListener("mousemove", this._onGlobalMouseMove);
        if (this._finishDrawHandler) window.removeEventListener("mouseup", this._finishDrawHandler);
        if (this.node?.id != null) {
            try { api.fetchApi("/fix_vedio_mask/clear_cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unique_id: String(this.node.id) }) }).catch(() => {}); } catch {}
        }
        this.root?.remove(); this.root = null;
        if (this.node?._videoEditor === this) this.node._videoEditor = null;
    }
}