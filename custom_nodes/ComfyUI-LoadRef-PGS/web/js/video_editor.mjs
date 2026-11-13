// video_editor.mjs - 视频编辑器

import { widgetValue, setWidgetValue, fileUrl, fmt, debounce } from './utils.mjs';

let currentVideoEditor = null;

const SEG_LEN_FREE = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 30, 60];
const SEG_LEN_H3 = [22, 39, 56, 73, 90, 107, 124, 141, 158, 175, 192,
                    209, 226, 243, 260, 277, 294, 311, 328, 345, 362,
                    379, 396, 413, 430, 447, 464, 481, 498, 515, 532];

const CTX_FREE = [0, 6, 12, 18, 22, 24, 30, 36, 39, 48, 56, 60, 72, 96, 120];
const CTX_H3 = [0, 5, 22, 39, 56];

const COMMON_ASPECTS = [
    [1, 1], [5, 4], [4, 3], [3, 2], [16, 10], [16, 9], [21, 9],
    [4, 5], [3, 4], [2, 3], [10, 16], [9, 16], [9, 21]
];

function nearestInList(value, list) {
    value = Number(value) || 0;
    let best = list[0], bestDist = Math.abs(list[0] - value);
    for (const v of list) {
        const d = Math.abs(v - value);
        if (d < bestDist) { best = v; bestDist = d; }
    }
    return best;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function matchAspect(w, h) {
    if (!w || !h) return "?";
    const actual = w / h;
    let best = null, bestDiff = Infinity;
    for (const [aw, ah] of COMMON_ASPECTS) {
        const diff = Math.abs(actual - aw / ah) / (aw / ah);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = [aw, ah];
        }
    }
    if (best && bestDiff <= 0.02) return `${best[0]}:${best[1]}`;
    const rw = Math.round(w);
    const rh = Math.round(h);
    const div = gcd(rw, rh);
    const fw = rw / div;
    const fh = rh / div;
    if (fw <= 100 && fh <= 100) return `${fw}:${fh}`;
    return `${actual.toFixed(2)}:1`;
}

export function openVideoEditor(node) {
    if (currentVideoEditor) {
        currentVideoEditor.remove();
        currentVideoEditor = null;
    }
    const ov = document.createElement("div");
    ov.className = "pgs-ov";
    currentVideoEditor = ov;
    document.body.appendChild(ov);
    const dl = document.createElement("div");
    dl.className = "pgs-dl";
    ov.appendChild(dl);

    const styleId = "pgs-video-editor-input-style";
    if (!document.getElementById(styleId)) {
        const s = document.createElement("style");
        s.id = styleId;
        s.textContent = `
            .pgs-btn-row input.pgs-fr {
                width: 56px;
                height: 26px;
                box-sizing: border-box;
                border: 1px solid #424956;
                border-radius: 5px;
                padding: 0 4px;
                background: #242832;
                color: #9fc9ec;
                font-size: 11px;
                font-variant-numeric: tabular-nums;
                text-align: center;
                outline: none;
                transition: border-color .15s;
            }
            .pgs-btn-row input.pgs-fr:focus {
                border-color: #6aa9df;
                background: #303643;
            }
        `;
        document.head.appendChild(s);
    }

    const titleBar = document.createElement("div");
    titleBar.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;";
    const titleText = document.createElement("div");
    titleText.style.cssText = "font-size:16px;font-weight:bold;";
    titleText.textContent = "视频编辑器";
    
    const metaInfo = document.createElement("div");
    metaInfo.style.cssText = "font-size:12px;color:#8ea3b4;display:flex;align-items:center;gap:8px;";
    
    const metaSpan1 = document.createElement("span");
    const metaSpan2 = document.createElement("span");
    const metaSpan3 = document.createElement("span");
    const metaSpan4 = document.createElement("span");
    metaInfo.append(metaSpan1, metaSpan2, metaSpan3, metaSpan4);

    const aspectInfo = document.createElement("span");
    aspectInfo.style.cssText = "font-size:11px;padding:3px 10px;background:#0d1c24;border:1px solid #3a5363;border-radius:4px;white-space:nowrap;display:none;margin-left:auto;";
    
    titleBar.appendChild(titleText);
    titleBar.appendChild(metaInfo);
    titleBar.appendChild(aspectInfo);
    dl.appendChild(titleBar);

    const pv = document.createElement("div");
    pv.className = "pgs-pv";
    const ve = document.createElement("video");
    ve.src = fileUrl(widgetValue(node, "filename", ""));
    ve.controls = true;
    ve.muted = false;
    pv.appendChild(ve);
    dl.appendChild(pv);

    const rangeOverlay = document.createElement("div");
    rangeOverlay.className = "pgs-range";
    pv.appendChild(rangeOverlay);

    const cb = document.createElement("div");
    cb.className = "pgs-cb";
    cb.style.display = "none";
    const hs = {
        tl: "top:-3px;left:-3px;cursor:nwse-resize;border-top:6px solid #38bdf8;border-left:6px solid #38bdf8",
        tr: "top:-3px;right:-3px;cursor:nesw-resize;border-top:6px solid #38bdf8;border-right:6px solid #38bdf8",
        bl: "bottom:-3px;left:-3px;cursor:nesw-resize;border-bottom:6px solid #38bdf8;border-left:6px solid #38bdf8",
        br: "bottom:-3px;right:-3px;cursor:nwse-resize;border-bottom:6px solid #38bdf8;border-right:6px solid #38bdf8",
        tm: "top:-3px;left:50%;transform:translateX(-50%);cursor:ns-resize;border-top:6px solid #38bdf8;width:16px;height:10px",
        bm: "bottom:-3px;left:50%;transform:translateX(-50%);cursor:ns-resize;border-bottom:6px solid #38bdf8;width:16px;height:10px",
        lm: "top:50%;left:-3px;transform:translateY(-50%);cursor:ew-resize;border-left:6px solid #38bdf8;width:10px;height:16px",
        rm: "top:50%;right:-3px;transform:translateY(-50%);cursor:ew-resize;border-right:6px solid #38bdf8;width:10px;height:16px"
    };
    Object.entries(hs).forEach(([n, c]) => {
        const h = document.createElement("div");
        h.className = "pgs-ch";
        h.style.cssText = c;
        h.dataset.h = n;
        cb.appendChild(h);
    });
    pv.appendChild(cb);

    const tl = document.createElement("div");
    tl.className = "pgs-tl";
    
    const pointerRow = document.createElement("div");
    pointerRow.className = "pgs-pointer-row";
    const pointer = document.createElement("button");
    pointer.type = "button";
    pointer.className = "pgs-pointer";
    pointerRow.appendChild(pointer);

    const tr = document.createElement("div");
    tr.className = "pgs-tr";
    const ts = document.createElement("div");
    ts.className = "pgs-ts";
    const segOverlay = document.createElement("div");
    segOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:4px;z-index:1;";
    const tf = document.createElement("div");
    tf.className = "pgs-tf";
    const sh = document.createElement("div");
    sh.className = "pgs-th";
    const eh = document.createElement("div");
    eh.className = "pgs-th";
    ts.append(segOverlay, tf, sh, eh);

    const readout = document.createElement("div");
    readout.className = "pgs-readout";
    readout.innerHTML = `
        <span class="pgs-ro-cur">00:00.00</span>
        <span class="pgs-ro-range">In 00:00.00 - Out 00:00.00 · Duration 0 frames</span>
        <span class="pgs-ro-dur">0 / 0 frames</span>
    `;
    const roCur = readout.querySelector(".pgs-ro-cur");
    const roRange = readout.querySelector(".pgs-ro-range");
    const roDur = readout.querySelector(".pgs-ro-dur");

    const btnRow = document.createElement("div");
    btnRow.className = "pgs-btn-row";
    btnRow.innerHTML = `
        <div class="pgs-btn-group left">
            <button data-act="set-in">Set In</button>
            <input type="number" data-act="in-frame" class="pgs-fr" value="0" title="输入帧号并回车">
        </div>
        <div class="pgs-btn-group center">
            <button data-act="to-start" title="到开头">|≪</button>
            <button data-act="prev-frame" title="上一帧">&lt;</button>
            <button data-act="play" style="min-width:56px;">Play</button>
            <button data-act="next-frame" title="下一帧">&gt;</button>
            <button data-act="to-end" title="到结尾">≫|</button>
        </div>
        <div class="pgs-btn-group right">
            <input type="number" data-act="out-frame" class="pgs-fr" value="0" title="输入帧号并回车">
            <button data-act="set-out">Set Out</button>
        </div>
    `;
    const btnPlay = btnRow.querySelector('[data-act="play"]');
    const inpInFr = btnRow.querySelector('[data-act="in-frame"]');
    const inpOutFr = btnRow.querySelector('[data-act="out-frame"]');

    tl.append(readout, pointerRow, tr, ts, btnRow);
    dl.appendChild(tl);

    const tb = document.createElement("div");
    tb.className = "pgs-tb2";
    tb.style.marginTop = "10px";
    let cropOn = false,
        mode = widgetValue(node, "display_mode", "seconds");
    let dur = 0,
        drg = null,
        off = 0,
        selW = 0,
        cdrg = null,
        csx = 0,
        csy = 0,
        ccx = 0,
        ccy = 0,
        ccw = 1,
        cch = 1;
    let keepAspect = true;
    let videoAspectRatio = 1.0;

    const mb = document.createElement("button");
    mb.textContent = "帧模式";
    mb.onclick = () => {
        const fr = parseFloat(fri.value) || 24;
        let s, e;
        if (mode === "seconds") {
            s = parseFloat(widgetValue(node, "start_time", 0)) || 0;
            e = parseFloat(widgetValue(node, "end_time", 0)) || dur || 0;
            if (e <= s) e = s + (parseFloat(widgetValue(node, "duration", 0)) || 0);
        } else {
            const sf = parseInt(widgetValue(node, "start_frame", 0)) || 0;
            const ef = parseInt(widgetValue(node, "end_frame", 0)) || 0;
            const df = parseInt(widgetValue(node, "duration_frames", 0)) || 0;
            s = sf / fr;
            e = ef > sf ? ef / fr : (sf + df) / fr;
            if (e <= s) e = s + df / fr;
        }
        const d = Math.max(0, e - s);
        mode = mode === "seconds" ? "frames" : "seconds";
        mb.textContent = mode === "seconds" ? "帧模式" : "秒模式";
        setWidgetValue(node, "display_mode", mode);
        setWidgetValue(node, "start_time", s);
        setWidgetValue(node, "end_time", e);
        setWidgetValue(node, "duration", d);
        setWidgetValue(node, "start_frame", Math.round(s * fr));
        setWidgetValue(node, "end_frame", Math.round(e * fr));
        setWidgetValue(node, "duration_frames", Math.round(d * fr));
        node.properties = node.properties || {};
        node.properties["duration_seconds"] = d;
        updateTS();
        updateParams();
        updateRangeOverlay();
        if (segEnabled) {
            rebuildSegLenOptions();
            rebuildCtxOptions();
            recalcSegments();
        }
    };
    tb.appendChild(mb);

    const frl = document.createElement("span");
    frl.textContent = "帧率:";
    frl.style.cssText = "font-size:11px;color:#b8d2dc;margin-left:8px;";
    tb.appendChild(frl);

    const fri = document.createElement("input");
    fri.type = "number";
    fri.value = widgetValue(node, "frame_rate", 24);
    fri.min = 1;
    fri.max = 120;
    fri.step = 0.001;
    fri.style.cssText = "width:60px;background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;";
    fri.onchange = () => {
        setWidgetValue(node, "frame_rate", parseFloat(fri.value) || 24);
        syncT();
        updateTS();
        updateParams();
        if (segEnabled) recalcSegments();
        updateMetaInfo();
    };
    tb.appendChild(fri);

    dl.appendChild(tb);

    const commonParams = document.createElement("div");
    commonParams.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:10px;";
    dl.appendChild(commonParams);

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "重置";
    resetBtn.title = "恢复原始尺寸";
    resetBtn.style.cssText = "border:1px solid #3a5363;border-radius:4px;background:#223744;color:#dce7ee;cursor:pointer;font-size:11px;padding:3px 8px;";
    resetBtn.onclick = () => {
        setWidgetValue(node, "custom_width", 0);
        setWidgetValue(node, "custom_height", 0);
        const mult = parseInt(multipleSel.value) || 1;
        if (ve.videoWidth && ve.videoHeight) {
            widthInput.value = alignValue(ve.videoWidth, mult);
            widthInput.placeholder = `原始 ${ve.videoWidth}`;
            heightInput.value = alignValue(ve.videoHeight, mult);
            heightInput.placeholder = `原始 ${ve.videoHeight}`;
        } else {
            widthInput.value = 0;
            heightInput.value = 0;
        }
        updateParams();
    };
    commonParams.appendChild(resetBtn);

    const widthLabel = document.createElement("label");
    widthLabel.textContent = "宽:";
    commonParams.appendChild(widthLabel);

    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.step = 1;
    widthInput.value = widgetValue(node, "custom_width", 0);
    widthInput.style.cssText = "width:70px;background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;";
    commonParams.appendChild(widthInput);

    const aspectBtn = document.createElement("button");
    aspectBtn.textContent = "🔗";
    aspectBtn.title = "等比锁定";
    aspectBtn.className = "pgs-aspect-btn" + (keepAspect ? " on" : "");
    aspectBtn.style.cssText = "border:1px solid #3a5363;border-radius:4px;background:#0aa4d6;color:#06131b;cursor:pointer;font-size:12px;padding:2px 6px;";
    aspectBtn.onclick = () => {
        keepAspect = !keepAspect;
        aspectBtn.classList.toggle("on", keepAspect);
        aspectBtn.style.background = keepAspect ? "#0aa4d6" : "#223744";
        aspectBtn.style.color = keepAspect ? "#06131b" : "#dce7ee";
    };
    commonParams.appendChild(aspectBtn);

    const heightLabel = document.createElement("label");
    heightLabel.textContent = "高:";
    commonParams.appendChild(heightLabel);

    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.step = 1;
    heightInput.value = widgetValue(node, "custom_height", 0);
    heightInput.style.cssText = "width:70px;background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;";
    commonParams.appendChild(heightInput);

    const rl = document.createElement("label");
    rl.textContent = "缩放:";
    commonParams.appendChild(rl);

    const rs = document.createElement("select");
    rs.innerHTML = `<option value="maintain aspect ratio">保持比例</option><option value="stretch to fit">拉伸</option><option value="pad">填充</option><option value="crop">裁剪</option>`;
    rs.value = widgetValue(node, "resize_method", "maintain aspect ratio");
    rs.onchange = () => {
        setWidgetValue(node, "resize_method", rs.value);
        updateAspectInfo();
    };
    commonParams.appendChild(rs);

    const multipleLabel = document.createElement("label");
    multipleLabel.textContent = "倍数:";
    multipleLabel.style.marginLeft = "6px";
    commonParams.appendChild(multipleLabel);

    const multipleSel = document.createElement("select");
    multipleSel.style.cssText = "background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;";
    multipleSel.innerHTML = `<option value="8">8</option><option value="16">16</option><option value="32">32</option><option value="64">64</option>`;
    
    let currentMultiple = parseInt(widgetValue(node, "multiple", 32));
    multipleSel.value = currentMultiple;
    commonParams.appendChild(multipleSel);

    const cropBtnRow = document.createElement("div");
    cropBtnRow.style.cssText = "border-top:1px solid #365161; padding-top:12px; margin-top:24px; margin-bottom:8px;";
    dl.appendChild(cropBtnRow);

    const cbtn = document.createElement("button");
    cbtn.textContent = "Crop";
    cbtn.style.cssText = "border:1px solid #3a5363;border-radius:4px;background:#223744;color:#dce7ee;cursor:pointer;font-size:11px;padding:4px 12px;";
    cbtn.onclick = () => {
        cropOn = !cropOn;
        cbtn.classList.toggle("on", cropOn);
        cb.style.display = cropOn ? "block" : "none";
        ve.controls = !cropOn;
        cropSection.style.display = cropOn ? "block" : "none";
        if (cropOn) {
            cbtn.style.background = "#0aa4d6";
            cbtn.style.color = "#06131b";
            ve.pause();
            updateCb();
            updateCropPixelInputs();
        } else {
            cbtn.style.background = "#223744";
            cbtn.style.color = "#dce7ee";
        }
        updateParams();
    };
    cropBtnRow.appendChild(cbtn);

    const cropSection = document.createElement("div");
    cropSection.style.cssText = "display:none; padding-top:8px; margin-top:4px;";
    dl.appendChild(cropSection);

    const cropRow = document.createElement("div");
    cropRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:10px;";
    cropSection.appendChild(cropRow);

    const ratioLabel = document.createElement("span");
    ratioLabel.textContent = "比例：";
    ratioLabel.style.cssText = "font-size:12px;color:#b8d2dc;";
    cropRow.appendChild(ratioLabel);

    const ratioSelect = document.createElement("select");
    ratioSelect.style.cssText = "background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;";
    ratioSelect.innerHTML = `
        <option value="free">自由</option>
        <option value="original">原始</option>
        <option value="1:1">1:1</option>
        <option value="4:5">4:5</option>
        <option value="5:4">5:4</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="4:3">4:3</option>
        <option value="3:4">3:4</option>
        <option value="3:2">3:2</option>
        <option value="2:3">2:3</option>
        <option value="2:1">2:1</option>
        <option value="1:2">1:2</option>
    `;
    cropRow.appendChild(ratioSelect);

    const posLabel = document.createElement("span");
    posLabel.textContent = "位置：";
    posLabel.style.cssText = "font-size:12px;color:#b8d2dc;";
    cropRow.appendChild(posLabel);

    function createPixelInput(label, nodeName, container, width = 60) {
        const lb = document.createElement("label");
        lb.style.cssText = "display:inline-flex;align-items:center;gap:3px;font-size:11px;color:#b8d2dc;";
        lb.textContent = label + ":";
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = 1;
        inp.min = 0;
        inp.style.cssText = `width:${width}px;background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;`;
        container.appendChild(lb);
        lb.appendChild(inp);
        return { lb, inp };
    }
    const cropXInput = createPixelInput("X", "crop_x", cropRow);
    const cropYInput = createPixelInput("Y", "crop_y", cropRow);

    const sizeLabel = document.createElement("span");
    sizeLabel.textContent = "大小：";
    sizeLabel.style.cssText = "font-size:12px;color:#b8d2dc;";
    cropRow.appendChild(sizeLabel);

    const cropWInput = createPixelInput("宽", "crop_w", cropRow);
    const cropHInput = createPixelInput("高", "crop_h", cropRow);

    let segPlan = null;
    let segEnabled = false;
    let segPanelInited = false;

    const segPanel = document.createElement("div");
    segPanel.style.cssText = "border-top:1px solid #365161;padding-top:10px;margin-top:12px;display:none;";
    dl.appendChild(segPanel);

    const segHeader = document.createElement("div");
    segHeader.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:8px;";
    segPanel.appendChild(segHeader);

    const segToggleBtn = document.createElement("button");
    segToggleBtn.textContent = "分段规划";
    segToggleBtn.style.cssText = "border:1px solid #3a5363;border-radius:4px;background:#223744;color:#b8d2dc;cursor:pointer;font-size:12px;font-weight:bold;padding:4px 14px;transition:all .15s;";
    segHeader.appendChild(segToggleBtn);

    const segParamsRow = document.createElement("div");
    segParamsRow.style.cssText = "display:none;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:8px;";
    segPanel.appendChild(segParamsRow);

    const segPresetLb = document.createElement("span");
    segPresetLb.textContent = "模式:";
    segPresetLb.style.cssText = "font-size:11px;color:#b8d2dc;";
    segParamsRow.appendChild(segPresetLb);

    const segPresetSel = document.createElement("select");
    segPresetSel.style.cssText = "background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;min-width:100px;";
    segPresetSel.innerHTML = `
        <option value="none">自由</option>
        <option value="minimaxh3">MiniMax H3</option>
    `;
    segPresetSel.value = "none";
    segParamsRow.appendChild(segPresetSel);

    const segLenLb = document.createElement("label");
    segLenLb.textContent = "段长(总长):";
    segLenLb.style.cssText = "font-size:11px;color:#b8d2dc;";
    segParamsRow.appendChild(segLenLb);
    const segLenSel = document.createElement("select");
    segLenSel.style.cssText = "background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;min-width:150px;";
    segParamsRow.appendChild(segLenSel);

    const segCtxLb = document.createElement("label");
    segCtxLb.textContent = "重叠:";
    segCtxLb.style.cssText = "font-size:11px;color:#b8d2dc;";
    segParamsRow.appendChild(segCtxLb);
    const segCtxSel = document.createElement("select");
    segCtxSel.style.cssText = "background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;min-width:130px;";
    segParamsRow.appendChild(segCtxSel);

    const segModeLb = document.createElement("label");
    segModeLb.textContent = "输出:";
    segModeLb.style.cssText = "font-size:11px;color:#b8d2dc;";
    segParamsRow.appendChild(segModeLb);
    const segModeSel = document.createElement("select");
    segModeSel.style.cssText = "background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:3px 6px;font-size:11px;";
    segModeSel.innerHTML = `<option value="raw">含上下文</option><option value="delivered">仅新增帧</option>`;
    segParamsRow.appendChild(segModeSel);

    const segStatus = document.createElement("div");
    segStatus.style.cssText = "font-size:11px;color:#0aa4d6;margin-bottom:8px;padding:4px 8px;background:#0d1c24;border-radius:4px;display:none;";
    segPanel.appendChild(segStatus);

    const segList = document.createElement("div");
    segList.style.cssText = "display:none;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;max-height:200px;overflow-y:auto;";
    segPanel.appendChild(segList);

    function getFps() { return parseFloat(fri.value) || 24; }

    function rebuildSegLenOptions(preferSeconds) {
        const isH3 = segPresetSel.value === "minimaxh3";
        const showFrames = (mode === "frames");
        const oldSec = preferSeconds !== undefined
            ? Number(preferSeconds)
            : (parseFloat(segLenSel.value) || 5);

        segLenSel.innerHTML = "";
        const fps = getFps();
        if (isH3) {
            const targetFrames = oldSec * fps;
            const chosen = nearestInList(targetFrames, SEG_LEN_H3);
            SEG_LEN_H3.forEach(f => {
                const sec = f / 24; // H3 永远基于 24fps 对齐
                const o = document.createElement("option");
                o.value = sec.toFixed(4);
                o.textContent = showFrames ? `${f} 帧` : `${f} 帧 (${sec.toFixed(2)}s)`;
                segLenSel.appendChild(o);
            });
            segLenSel.value = (chosen / 24).toFixed(4);
        } else {
            const chosen = nearestInList(oldSec, SEG_LEN_FREE);
            SEG_LEN_FREE.forEach(s => {
                const o = document.createElement("option");
                o.value = s;
                const frames = Math.round(s * fps);
                o.textContent = showFrames ? `${frames} 帧` : `${s} 秒`;
                segLenSel.appendChild(o);
            });
            segLenSel.value = chosen;
        }
    }

    function rebuildCtxOptions(preferFrames) {
        const isH3 = segPresetSel.value === "minimaxh3";
        const showFrames = (mode === "frames");
        const list = isH3 ? CTX_H3 : CTX_FREE;
        const oldFrames = preferFrames !== undefined
            ? Number(preferFrames)
            : (parseInt(segCtxSel.value) || 0);
        const chosen = nearestInList(oldFrames, list);

        segCtxSel.innerHTML = "";
        list.forEach(f => {
            const o = document.createElement("option");
            o.value = f;
            if (f === 0) {
                o.textContent = "0 (无重叠)";
            } else if (showFrames) {
                o.textContent = `${f} 帧`;
            } else {
                o.textContent = `${f} 帧 (≈${(f / getFps()).toFixed(2)}s)`;
            }
            segCtxSel.appendChild(o);
        });
        segCtxSel.value = chosen;
    }

    function renderSegmentBars() {
        segOverlay.innerHTML = "";
        if (!segEnabled || !segPlan || !dur) return;
        const fps = getFps();
        const totalFrames = Math.round(dur * fps);
        segPlan.segments.forEach((s, i) => {
            if (s.end <= s.start) return;
            const bar = document.createElement("div");
            const hue = (i * 137.508) % 360;
            const leftPct = (s.start / totalFrames) * 100;
            const widthPct = ((s.end - s.start) / totalFrames) * 100;
            bar.style.cssText =
                "position:absolute;top:0;height:100%;box-sizing:border-box;" +
                `left:${leftPct}%;width:${widthPct}%;` +
                `background:hsla(${hue},70%,55%,0.5);` +
                `border-right:1px solid hsla(${hue},80%,70%,0.95);`;
            segOverlay.appendChild(bar);
        });
    }

    function recalcSegments() {
        if (!dur) return;
        const fps = getFps();
        const rawLenSec = parseFloat(segLenSel.value) || 5;
        const ctx = parseInt(segCtxSel.value) || 0;
        const strictH3 = segPresetSel.value === "minimaxh3";
        const outMode = segModeSel.value;
        const showFrames = (mode === "frames");

        const rangeStartFrame = Math.max(0, Math.round(gs() * fps));
        const rangeEndFrame = Math.max(0, Math.round(ge() * fps));
        const rangeFrames = rangeEndFrame - rangeStartFrame;

        if (rangeFrames <= 0) {
            segStatus.textContent = "请先在时间线上选择有效范围（开始 < 结束）";
            segList.innerHTML = "";
            segPlan = null;
            segOverlay.innerHTML = "";
            return;
        }

        let raw;
        if (strictH3) {
            const targetFrames = Math.max(5, Math.round(rawLenSec * 24));
            const legal = [];
            const hi = Math.max(targetFrames + 100, rangeFrames + 100);
            for (let f = 5; f <= hi; f++) {
                if ((f - 5) % 17 === 0) legal.push(f);
            }
            raw = nearestInList(targetFrames, legal);
        } else {
            raw = Math.max(1, Math.round(rawLenSec * fps));
        }
        if (raw > rangeFrames) raw = rangeFrames;

        // 修复核心：无论是 raw 还是 delivered，由于要平滑衔接，步进必须是 raw - ctx
        let step = Math.max(1, raw - ctx);
        if (step <= 0) step = raw; // 防御性后备

        const finalSegs = [];
        let droppedTail = false;
        let s = 0;
        let safety = 0;
        const minValidLen = ctx + 1;
        while (s < rangeFrames && safety < 100000) {
            const e = Math.min(s + raw, rangeFrames);
            if (e - s > (outMode === "delivered" ? ctx : 0)) {
                finalSegs.push({
                    start: s + rangeStartFrame,
                    end: e + rangeStartFrame,
                });
            } else if (e > s) {
                droppedTail = true;
            }
            s += step;
            safety++;
        }

        if (!finalSegs.length) {
            segStatus.textContent = "参数无效，无法分段（尾段太短）";
            segList.innerHTML = "";
            segPlan = null;
            segOverlay.innerHTML = "";
            return;
        }

        const plan = {
            fps: fps,
            raw_frames: raw,
            context_frames: ctx, // 始终保存
            delivered_frames: step,
            segment_seconds: raw / fps,
            total_frames: rangeFrames,
            segment_count: finalSegs.length,
            output_mode: outMode,
            preset: segPresetSel.value,
            version: 3,
            segments: finalSegs,
            range_start_frame: rangeStartFrame,
            range_end_frame: rangeEndFrame,
        };
        segPlan = plan;

        const rawSec = raw / fps;
        const stepSec = step / fps;
        let segLenText;
        if (outMode === "raw" && ctx > 0) {
            if (showFrames) {
                segLenText = `每段总长 ${raw} 帧 · 新增 ${step} 帧（含 ${ctx} 帧重叠）`;
            } else {
                segLenText =
                    `每段总长 ${raw} 帧（${rawSec.toFixed(2)}s）· ` +
                    `新增 ${step} 帧（${stepSec.toFixed(2)}s）· 重叠 ${ctx} 帧`;
            }
        } else {
            if (showFrames) {
                segLenText = `每段 ${raw} 帧 · 无重叠`;
            } else {
                segLenText = `每段 ${raw} 帧（${rawSec.toFixed(2)}s）· 无重叠`;
            }
        }
        const rangeText = showFrames
            ? `范围内 ${rangeFrames} 帧`
            : `范围内 ${rangeFrames} 帧（${(rangeFrames / fps).toFixed(2)}s）`;
        let warnText = "";
        if (droppedTail) {
            warnText = ` · ⚠ 尾段 ≤ ${ctx} 帧重叠已丢弃`;
        }
        segStatus.textContent = `${rangeText} · ${segLenText} · 共 ${plan.segment_count} 段${warnText}`;

        segList.innerHTML = "";
        plan.segments.forEach((sg, i) => {
            const btn = document.createElement("button");
            btn.className = "pgs-seg-item";
            const hue = (i * 137.508) % 360;
            btn.style.borderLeft = `3px solid hsl(${hue},70%,60%)`;
            if (showFrames) {
                btn.innerHTML = `<b>#${i}</b> ${sg.start}→${sg.end}`;
            } else {
                btn.innerHTML = `<b>#${i}</b> ${(sg.start / fps).toFixed(2)}→${(sg.end / fps).toFixed(2)}s`;
            }
            btn.title = `帧 ${sg.start} ~ ${sg.end}（${sg.end - sg.start} 帧，索引 ${i}）`;
            btn.onclick = () => {
                if (ve.readyState >= 1) ve.currentTime = sg.start / fps;
            };
            segList.appendChild(btn);
        });
        renderSegmentBars();
    }

    function applySegToggle() {
        segParamsRow.style.display = segEnabled ? "flex" : "none";
        segStatus.style.display = segEnabled ? "block" : "none";
        segList.style.display = segEnabled ? "grid" : "none";
        if (segEnabled) {
            segToggleBtn.style.background = "#0aa4d6";
            segToggleBtn.style.color = "#06131b";
            segToggleBtn.style.borderColor = "#0aa4d6";
        } else {
            segToggleBtn.style.background = "#223744";
            segToggleBtn.style.color = "#b8d2dc";
            segToggleBtn.style.borderColor = "#3a5363";
        }
        if (segEnabled) {
            recalcSegments();
        } else {
            segOverlay.innerHTML = "";
            segPlan = null;
        }
    }

    segToggleBtn.onclick = () => {
        segEnabled = !segEnabled;
        applySegToggle();
    };

    segPresetSel.onchange = () => {
        const curSec = parseFloat(segLenSel.value) || 5;
        const curCtx = parseInt(segCtxSel.value) || 0;
        rebuildSegLenOptions(curSec);
        rebuildCtxOptions(curCtx);
        if (segEnabled) recalcSegments();
    };
    segLenSel.onchange = () => { if (segEnabled) recalcSegments(); };
    segCtxSel.onchange = () => { if (segEnabled) recalcSegments(); };
    segModeSel.onchange = () => { if (segEnabled) recalcSegments(); };

    function initSegPanel() {
        if (segPanelInited || !dur) return;
        segPanelInited = true;
        const saved = node.properties?.segment_plan;
        if (saved && saved.segments && saved.segments.length) {
            segEnabled = true;
            segPresetSel.value = saved.preset || "none";
            rebuildSegLenOptions(saved.target_seconds ?? saved.segment_seconds ?? 5);
            rebuildCtxOptions(saved.context_frames ?? 22);
            segModeSel.value = saved.output_mode || "raw";
        } else {
            segEnabled = false;
            segPresetSel.value = "none";
            rebuildSegLenOptions(5);
            rebuildCtxOptions(22);
            segModeSel.value = "raw";
        }
        segPanel.style.display = "block";
        applySegToggle();
    }

    function initCropPanelFromSaved() {
        if (!ve.videoWidth || !ve.videoHeight) return;
        const cx = parseFloat(widgetValue(node, "crop_x", 0)) || 0;
        const cy = parseFloat(widgetValue(node, "crop_y", 0)) || 0;
        const cw = parseFloat(widgetValue(node, "crop_w", 1)) || 1;
        const ch = parseFloat(widgetValue(node, "crop_h", 1)) || 1;
        const isCropped = (cx > 0.001 || cy > 0.001 || cw < 0.999 || ch < 0.999);
        if (isCropped && !cropOn) {
            cropOn = true;
            cbtn.classList.add("on");
            cb.style.display = "block";
            ve.controls = false;
            cropSection.style.display = "block";
            cbtn.style.background = "#0aa4d6";
            cbtn.style.color = "#06131b";
            updateCb();
            updateCropPixelInputs();
        }
    }

    const ac = document.createElement("div");
    ac.style.cssText = "display:flex;justify-content:flex-end;gap:10px;margin-top:15px";
    const ccl = document.createElement("button");
    ccl.textContent = "取消";
    ccl.style.cssText = "background:#1d2b36;color:#cbd8e0;border:1px solid #3a4d5b;border-radius:4px;padding:6px 14px;cursor:pointer";
    const svb = document.createElement("button");
    svb.textContent = "保存";
    svb.style.cssText = "background:#17535a;color:#e8f6f6;border:1px solid #26717a;border-radius:4px;padding:6px 14px;cursor:pointer";
    ac.append(ccl, svb);
    dl.appendChild(ac);

    const gs = () => parseFloat(widgetValue(node, "start_time", 0)) || 0;
    const ge = () => {
        const e = parseFloat(widgetValue(node, "end_time", 0)) || 0;
        return e > 0 ? e : dur;
    };

    function maxFrame() { return Math.max(0, Math.round(dur * getFps()) - 1); }
    function currentFrame() { return Math.round((ve.currentTime || 0) * getFps()); }

    function updateMetaInfo() {
        if (!ve.videoWidth) return;
        const vw = ve.videoWidth;
        const vh = ve.videoHeight;
        const fps = getFps();
        metaSpan1.textContent = `宽 ${vw}px · 高 ${vh}px`;
        metaSpan2.textContent = `画幅 ${matchAspect(vw, vh)}`;
        metaSpan3.textContent = `帧率 ${fps.toFixed(2)} fps`;
        metaSpan4.textContent = `总长度 ${fmt(ve.duration)}`;
    }

    function updateReadout() {
        if (!dur) return;
        const fps = getFps();
        const f = currentFrame();
        roCur.textContent = fmt(ve.currentTime);
        roRange.textContent = `In ${fmt(gs())} - Out ${fmt(ge())} · Duration ${Math.round((ge() - gs()) * fps)} frames`;
        roDur.textContent = `${f} / ${Math.round(dur * fps)} frames`;
        
        pointer.style.left = `${Math.max(0, Math.min(1, ve.currentTime / dur)) * 100}%`;
        
        if (document.activeElement !== inpInFr) inpInFr.value = String(Math.round(gs() * fps));
        if (document.activeElement !== inpOutFr) inpOutFr.value = String(Math.round(ge() * fps));
    }

    function goToFrame(frame) {
        if (!dur) return;
        frame = Math.max(0, Math.min(maxFrame(), Math.round(frame)));
        ve.currentTime = frame / getFps();
        updateReadout();
    }

    widthInput.addEventListener("keydown", (e) => { if (e.key === "Enter") widthInput.blur(); });
    heightInput.addEventListener("keydown", (e) => { if (e.key === "Enter") heightInput.blur(); });
    inpInFr.addEventListener("keydown", (e) => { if (e.key === "Enter") inpInFr.blur(); });
    inpOutFr.addEventListener("keydown", (e) => { if (e.key === "Enter") inpOutFr.blur(); });

    inpInFr.addEventListener("change", () => {
        let f = parseInt(inpInFr.value);
        if (!isNaN(f)) {
            f = Math.max(0, Math.min(Math.round(ge() * getFps()) - 1, Math.round(maxFrame()), f));
            setWidgetValue(node, "start_time", f / getFps());
            setWidgetValue(node, "start_frame", f);
            ve.currentTime = f / getFps();
        }
        syncT();
        updateTS();
        updateParams();
        updateRangeOverlay();
        if (segEnabled) recalcSegments();
        updateReadout();
        inpInFr.value = String(Math.round(gs() * getFps()));
    });

    inpOutFr.addEventListener("change", () => {
        let f = parseInt(inpOutFr.value);
        if (!isNaN(f)) {
            f = Math.max(Math.round(gs() * getFps()) + 1, Math.min(Math.round(maxFrame()), f));
            setWidgetValue(node, "end_time", f / getFps());
            setWidgetValue(node, "end_frame", f);
            ve.currentTime = f / getFps();
        }
        syncT();
        updateTS();
        updateParams();
        updateRangeOverlay();
        if (segEnabled) recalcSegments();
        updateReadout();
        inpOutFr.value = String(Math.round(ge() * getFps()));
    });

    btnRow.addEventListener("click", (e) => {
        const act = e.target?.dataset?.act;
        if (!act || !dur) return;
        if (act === "set-in") {
            setWidgetValue(node, "start_time", ve.currentTime);
            setWidgetValue(node, "start_frame", Math.round(ve.currentTime * getFps()));
        } else if (act === "set-out") {
            setWidgetValue(node, "end_time", ve.currentTime);
            setWidgetValue(node, "end_frame", Math.round(ve.currentTime * getFps()));
        } else if (act === "to-start") { goToFrame(0); return; }
        else if (act === "to-end") { goToFrame(maxFrame()); return; }
        else if (act === "prev-frame") { goToFrame(currentFrame() - 1); return; }
        else if (act === "next-frame") { goToFrame(currentFrame() + 1); return; }
        else if (act === "play") {
            if (ve.paused) {
                if (ve.currentTime < gs() || ve.currentTime >= ge()) {
                    ve.currentTime = gs();
                }
                ve.play();
            } else {
                ve.pause();
            }
            return;
        } else {
            return;
        }
        syncT();
        updateTS();
        updateParams();
        updateRangeOverlay();
        if (segEnabled) recalcSegments();
        updateReadout();
    });

    function updateAspectInfo() {
        if (!ve.videoWidth || !ve.videoHeight) {
            aspectInfo.style.display = "none";
            return;
        }
        const vw = ve.videoWidth;
        const vh = ve.videoHeight;
        const origText = matchAspect(vw, vh);

        const cx = parseFloat(widgetValue(node, "crop_x", 0)) || 0;
        const cy = parseFloat(widgetValue(node, "crop_y", 0)) || 0;
        const cw = parseFloat(widgetValue(node, "crop_w", 1)) || 1;
        const ch = parseFloat(widgetValue(node, "crop_h", 1)) || 1;
        const isCropped = (cx > 0.001 || cy > 0.001 || cw < 0.999 || ch < 0.999);
        const cropW = vw * cw;
        const cropH = vh * ch;
        const cropText = isCropped ? matchAspect(cropW, cropH) : null;

        const customW = parseFloat(widgetValue(node, "custom_width", 0)) || 0;
        const customH = parseFloat(widgetValue(node, "custom_height", 0)) || 0;
        const hasCustom = customW > 0 || customH > 0;

        let outW, outH;
        if (hasCustom) {
            outW = customW > 0 ? customW : cropW;
            outH = customH > 0 ? customH : cropH;
        } else {
            outW = cropW;
            outH = cropH;
        }
        const outText = matchAspect(outW, outH);

        const C = {
            orig: "#8ea3b4",
            crop: "#38bdf8",
            scale: "#f0a020",
            out:  "#4ade80",
            arrow: "#5c7785"
        };
        const arrow = `<span style="color:${C.arrow};margin:0 5px;">→</span>`;
        const dot = `<span style="color:${C.arrow};margin:0 5px;">·</span>`;

        let html = `<span style="color:${C.orig};">原 ${origText}</span>`;
        if (isCropped) {
            html += dot + `<span style="color:${C.crop};">裁 ${cropText}</span>`;
        }
        if (hasCustom) {
            html += arrow + `<span style="color:${C.scale};">缩放</span>`;
        }
        html += arrow + `<span style="color:${C.out};font-weight:bold;">输出 ${outText}</span>`;
        html += `<span style="color:${C.arrow};margin-left:6px;">(${Math.round(outW)}×${Math.round(outH)})</span>`;

        aspectInfo.innerHTML = html;
        aspectInfo.style.display = "inline-block";
    }

    function syncT() {
        const fr = getFps(),
            s = gs(),
            e = ge(),
            d = Math.max(0, e - s);
        setWidgetValue(node, "start_time", s);
        setWidgetValue(node, "end_time", e);
        setWidgetValue(node, "duration", d);
        setWidgetValue(node, "start_frame", Math.round(s * fr));
        setWidgetValue(node, "end_frame", Math.round(e * fr));
        setWidgetValue(node, "duration_frames", Math.round(d * fr));
        node.properties = node.properties || {};
        node.properties["duration_seconds"] = d;
    }

    function updateTS() {
        if (!dur) return;
        const s = gs(),
            e = ge();
        sh.style.left = `${s / dur * 100}%`;
        eh.style.left = `${e / dur * 100}%`;
        tf.style.left = `${s / dur * 100}%`;
        tf.style.width = `${(e - s) / dur * 100}%`;
        tr.innerHTML = "";
        for (let i = 0; i <= 5; i++) {
            const p = i / 5,
                t = dur * p;
            const d = document.createElement("div");
            d.style.cssText = `position:absolute;left:${p * 100}%;top:0;transform:translateX(-50%);font-size:9px`;
            d.textContent = mode === "frames" ? Math.round(t * getFps()) : fmt(t);
            tr.appendChild(d);
        }
    }

    function alignValue(val, mult) {
        if (!val || !mult || val <= 0) return 0;
        return Math.max(mult, Math.round(val / mult) * mult);
    }

    function updateAspectDimensions(changed, val) {
        const mult = parseInt(multipleSel.value) || 1;
        let w = parseFloat(widthInput.value) || 0;
        let h = parseFloat(heightInput.value) || 0;

        if (changed === "width") {
            w = alignValue(val, mult);
            if (keepAspect && videoAspectRatio) {
                h = alignValue(w / videoAspectRatio, mult);
            }
        } else if (changed === "height") {
            h = alignValue(val, mult);
            if (keepAspect && videoAspectRatio) {
                w = alignValue(h * videoAspectRatio, mult);
            }
        } else if (changed === "multiple") {
            if (w > 0) w = alignValue(w, mult);
            if (h > 0) h = alignValue(h, mult);
        }

        widthInput.value = w;
        heightInput.value = h;
        setWidgetValue(node, "custom_width", w);
        setWidgetValue(node, "custom_height", h);
        updateAspectInfo();
    }

    widthInput.addEventListener("input", debounce(updateAspectInfo, 150));
    heightInput.addEventListener("input", debounce(updateAspectInfo, 150));
    widthInput.addEventListener("change", () => updateAspectDimensions("width", parseInt(widthInput.value)));
    heightInput.addEventListener("change", () => updateAspectDimensions("height", parseInt(heightInput.value)));
    
    multipleSel.addEventListener("change", () => {
        currentMultiple = parseInt(multipleSel.value) || 1;
        node.properties = node.properties || {};
        node.properties.output_multiple = currentMultiple;
        updateAspectDimensions("multiple");
    });

    function updateCropPixelInputs() {
        if (!ve.videoWidth || !ve.videoHeight) {
            cropXInput.inp.value = 0;
            cropYInput.inp.value = 0;
            cropWInput.inp.value = ve.videoWidth || 0;
            cropHInput.inp.value = ve.videoHeight || 0;
            return;
        }
        const vw = ve.videoWidth;
        const vh = ve.videoHeight;
        cropXInput.inp.value = Math.round(parseFloat(widgetValue(node, "crop_x", 0)) * vw);
        cropYInput.inp.value = Math.round(parseFloat(widgetValue(node, "crop_y", 0)) * vh);
        cropWInput.inp.value = Math.round(parseFloat(widgetValue(node, "crop_w", 1)) * vw);
        cropHInput.inp.value = Math.round(parseFloat(widgetValue(node, "crop_h", 1)) * vh);
    }

    function addPixelInputListener(inp, nodeName) {
        inp.addEventListener("input", () => {
            if (!ve.videoWidth || !ve.videoHeight) return;
            const px = parseFloat(inp.value);
            if (isNaN(px)) return;
            const vw = ve.videoWidth;
            const vh = ve.videoHeight;
            let ratio = 0;
            switch (nodeName) {
                case "crop_x": ratio = px / vw; break;
                case "crop_y": ratio = px / vh; break;
                case "crop_w": ratio = px / vw; break;
                case "crop_h": ratio = px / vh; break;
            }
            if (nodeName === "crop_w" || nodeName === "crop_h") {
                ratio = Math.max(0.01, Math.min(ratio, 1 - parseFloat(widgetValue(node, nodeName === "crop_w" ? "crop_x" : "crop_y", 0))));
            } else {
                ratio = Math.max(0, Math.min(ratio, 1 - parseFloat(widgetValue(node, nodeName === "crop_x" ? "crop_w" : "crop_h", 1))));
            }
            setWidgetValue(node, nodeName, ratio);
            updateCb();
            updateCropPixelInputs();
            updateAspectInfo();
            ratioSelect.value = "free";
        });
        inp.addEventListener("change", () => inp.dispatchEvent(new Event("input")));
    }
    addPixelInputListener(cropXInput.inp, "crop_x");
    addPixelInputListener(cropYInput.inp, "crop_y");
    addPixelInputListener(cropWInput.inp, "crop_w");
    addPixelInputListener(cropHInput.inp, "crop_h");

    function applyPresetRatio(ratioValue) {
        if (!ve.videoWidth || !ve.videoHeight) return;
        const vw = ve.videoWidth;
        const vh = ve.videoHeight;

        if (ratioValue === "free") return;

        let targetW, targetH;
        if (ratioValue === "original") {
            targetW = vw;
            targetH = vh;
        } else {
            const [rw, rh] = ratioValue.split(":").map(Number);
            const targetAspect = rw / rh;
            const videoAspect = vw / vh;

            if (videoAspect > targetAspect) {
                targetH = vh;
                targetW = Math.round(vh * targetAspect);
            } else {
                targetW = vw;
                targetH = Math.round(vw / targetAspect);
            }
        }

        const cropW = targetW / vw;
        const cropH = targetH / vh;
        const cropX = (1 - cropW) / 2;
        const cropY = (1 - cropH) / 2;

        setWidgetValue(node, "crop_x", cropX);
        setWidgetValue(node, "crop_y", cropY);
        setWidgetValue(node, "crop_w", cropW);
        setWidgetValue(node, "crop_h", cropH);

        updateCb();
        updateCropPixelInputs();
        updateAspectInfo();
    }

    ratioSelect.addEventListener("change", () => {
        applyPresetRatio(ratioSelect.value);
    });

    function updateCb() {
        const vw = ve.videoWidth,
            vh = ve.videoHeight;
        if (!vw || !vh) return;
        const r = ve.getBoundingClientRect(),
            sc = Math.min(r.width / vw, r.height / vh),
            dw = vw * sc,
            dh = vh * sc,
            ox = (r.width - dw) / 2,
            oy = (r.height - dh) / 2;
        const cx = parseFloat(widgetValue(node, "crop_x", 0)),
            cy = parseFloat(widgetValue(node, "crop_y", 0)),
            cw = parseFloat(widgetValue(node, "crop_w", 1)),
            ch = parseFloat(widgetValue(node, "crop_h", 1));
        cb.style.left = `${ox + cx * dw}px`;
        cb.style.top = `${oy + cy * dh}px`;
        cb.style.width = `${cw * dw}px`;
        cb.style.height = `${ch * dh}px`;
    }

    function updateRangeOverlay() {
        if (!dur) return;
        const vw = ve.videoWidth,
            vh = ve.videoHeight;
        if (!vw || !vh) return;
        const r = ve.getBoundingClientRect(),
            sc = Math.min(r.width / vw, r.height / vh),
            dw = vw * sc,
            dh = vh * sc,
            ox = (r.width - dw) / 2,
            oy = (r.height - dh) / 2;
        const s = gs(),
            e = ge();
        const left = ox + (s / dur) * dw;
        const width = (e - s) / dur * dw;
        rangeOverlay.style.left = `${left}px`;
        rangeOverlay.style.width = `${width}px`;
        rangeOverlay.style.bottom = `${oy}px`;
    }

    function updateParams() {
        updateCropPixelInputs();
        updateAspectInfo();
        if (ve.videoWidth && ve.videoHeight) {
            const mult = parseInt(multipleSel.value) || 1;
            if (parseFloat(widthInput.value) === 0) {
                widthInput.value = alignValue(ve.videoWidth, mult);
                widthInput.placeholder = `原始 ${ve.videoWidth}`;
            }
            if (parseFloat(heightInput.value) === 0) {
                heightInput.value = alignValue(ve.videoHeight, mult);
                heightInput.placeholder = `原始 ${ve.videoHeight}`;
            }
        }
    }

    function onResize() {
        updateCb();
        updateRangeOverlay();
    }

    ve.onloadedmetadata = () => {
        dur = ve.duration;
        if (ve.videoWidth && ve.videoHeight) {
            videoAspectRatio = ve.videoWidth / ve.videoHeight;
            const mult = parseInt(multipleSel.value) || 1;
            if (parseFloat(widgetValue(node, "custom_width", 0)) === 0) {
                widthInput.value = alignValue(ve.videoWidth, mult);
                widthInput.placeholder = `原始 ${ve.videoWidth}`;
            }
            if (parseFloat(widgetValue(node, "custom_height", 0)) === 0) {
                heightInput.value = alignValue(ve.videoHeight, mult);
                heightInput.placeholder = `原始 ${ve.videoHeight}`;
            }
            updateCropPixelInputs();
            updateAspectInfo();
            updateMetaInfo();
        }
        if (ge() <= 0 || ge() > dur) setWidgetValue(node, "end_time", dur);
        syncT();
        updateTS();
        updateCb();
        updateParams();
        updateRangeOverlay();
        initCropPanelFromSaved();
        initSegPanel();
        updateReadout();

        ve.ontimeupdate = () => {
            updateReadout();
            if (drg) return;
            const s = gs(), e = ge();
            if (e > s && ve.currentTime >= e) {
                ve.currentTime = s;
                ve.play().catch(() => {});
            } else if (ve.currentTime < s) {
                ve.currentTime = s;
            }
        };
    };

    ve.addEventListener("play", () => { btnPlay.textContent = "Pause"; });
    ve.addEventListener("pause", () => { btnPlay.textContent = "Play"; });

    window.addEventListener("resize", onResize);

    ts.onpointerdown = e => {
        if (!dur) return;
        const r = ts.getBoundingClientRect(),
            x = e.clientX - r.left,
            sx = gs() / dur * r.width,
            ex = ge() / dur * r.width;
        if (Math.abs(x - sx) < 10) drg = "start";
        else if (Math.abs(x - ex) < 10) drg = "end";
        else if (x > sx && x < ex) {
            drg = "center";
            off = x / r.width * dur - gs();
            selW = ge() - gs();
        } else drg = Math.abs(x - sx) < Math.abs(x - ex) ? "start" : "end";
        ts.setPointerCapture(e.pointerId);
    };
    ts.onpointermove = e => {
        if (!drg || !dur) return;
        const r = ts.getBoundingClientRect(),
            x = Math.max(0, Math.min(e.clientX - r.left, r.width)),
            v = x / r.width * dur;
        if (drg === "start") {
            if (v < ge()) setWidgetValue(node, "start_time", v);
        } else if (drg === "end") {
            if (v > gs()) setWidgetValue(node, "end_time", v);
        } else {
            let ns = v - off,
                ne = ns + selW;
            if (ns < 0) { ns = 0; ne = selW; }
            if (ne > dur) { ne = dur; ns = dur - selW; }
            setWidgetValue(node, "start_time", ns);
            setWidgetValue(node, "end_time", ne);
        }
        syncT();
        updateTS();
        updateParams();
        updateRangeOverlay();
        if (ve) ve.currentTime = gs();
        updateReadout();
    };
    ts.onpointerup = () => {
        drg = null;
        if (ve) ve.currentTime = gs();
        if (segEnabled) recalcSegments();
        updateReadout();
    };

    pointerRow.addEventListener("pointerdown", (e) => {
        if (!dur) return;
        e.preventDefault();
        e.stopPropagation();
        ve.pause();
        pointerRow.setPointerCapture(e.pointerId);
        const move = (ev) => {
            const r = pointerRow.getBoundingClientRect();
            const t = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur;
            ve.currentTime = t;
            updateReadout();
        };
        const up = () => {
            pointerRow.removeEventListener("pointermove", move);
            pointerRow.removeEventListener("pointerup", up);
            pointerRow.removeEventListener("pointercancel", up);
        };
        pointerRow.addEventListener("pointermove", move);
        pointerRow.addEventListener("pointerup", up);
        pointerRow.addEventListener("pointercancel", up);
        move(e);
    });

    cb.onpointerdown = e => {
        if (!cropOn) return;
        e.preventDefault();
        e.stopPropagation();
        const h = e.target.closest(".pgs-ch");
        cdrg = h ? h.dataset.h : "move";
        csx = e.clientX;
        csy = e.clientY;
        ccx = parseFloat(widgetValue(node, "crop_x", 0));
        ccy = parseFloat(widgetValue(node, "crop_y", 0));
        ccw = parseFloat(widgetValue(node, "crop_w", 1));
        cch = parseFloat(widgetValue(node, "crop_h", 1));
        cb.setPointerCapture(e.pointerId);
    };
    cb.onpointermove = e => {
        if (!cropOn || !cdrg) return;
        const r = ve.getBoundingClientRect(),
            sc = Math.min(r.width / ve.videoWidth, r.height / ve.videoHeight),
            dw = ve.videoWidth * sc,
            dh = ve.videoHeight * sc;
        const dx = (e.clientX - csx) / dw,
            dy = (e.clientY - csy) / dh;
        let nx = ccx, ny = ccy, nw = ccw, nh = cch;
        if (cdrg === "move") {
            nx = Math.max(0, Math.min(ccx + dx, 1 - ccw));
            ny = Math.max(0, Math.min(ccy + dy, 1 - cch));
        } else {
            if (cdrg === "tl") {
                nw = ccw - dx; nh = cch - dy;
                nx = ccx + ccw - nw; ny = ccy + cch - nh;
            } else if (cdrg === "tr") {
                nw = ccw + dx; nh = cch - dy;
                ny = ccy + cch - nh;
            } else if (cdrg === "bl") {
                nw = ccw - dx; nh = cch + dy;
                nx = ccx + ccw - nw;
            } else if (cdrg === "br") {
                nw = ccw + dx; nh = cch + dy;
            } else if (cdrg === "tm") {
                nh = cch - dy; ny = ccy + cch - nh;
            } else if (cdrg === "bm") {
                nh = cch + dy;
            } else if (cdrg === "lm") {
                nw = ccw - dx; nx = ccx + ccw - nw;
            } else {
                nw = ccw + dx;
            }
            nw = Math.max(0.02, Math.min(nw, 1 - nx));
            nh = Math.max(0.02, Math.min(nh, 1 - ny));
            nx = Math.max(0, Math.min(nx, 1 - nw));
            ny = Math.max(0, Math.min(ny, 1 - nh));
        }
        setWidgetValue(node, "crop_x", nx);
        setWidgetValue(node, "crop_y", ny);
        setWidgetValue(node, "crop_w", nw);
        setWidgetValue(node, "crop_h", nh);
        updateCb();
        updateCropPixelInputs();
        updateAspectInfo();
        ratioSelect.value = "free";
    };
    cb.onpointerup = () => { cdrg = null; };

    const close = () => {
        if (ve) {
            ve.pause();
            ve.onloadedmetadata = null;
            ve.ontimeupdate = null;
            ve.removeAttribute('src');
            ve.load();
        }
        ov.remove();
        currentVideoEditor = null;
        window.removeEventListener("resize", onResize);
    };

    ccl.onclick = close;
    svb.onclick = () => {
        if (segEnabled && segPlan) {
            const saved = {
                ...segPlan,
                target_seconds: parseFloat(segLenSel.value) || 5,
                preset: segPresetSel.value,
            };
            node.properties = node.properties || {};
            node.properties.segment_plan = saved;
            setWidgetValue(node, "segment_plan_json", JSON.stringify(saved));
        } else {
            node.properties = node.properties || {};
            delete node.properties.segment_plan;
            setWidgetValue(node, "segment_plan_json", "");
        }

        const origCustomWidth = parseFloat(widgetValue(node, "custom_width", 0));
        const origCustomHeight = parseFloat(widgetValue(node, "custom_height", 0));
        let finalWidth = parseFloat(widthInput.value);
        let finalHeight = parseFloat(heightInput.value);
        
        const mult = parseInt(multipleSel.value) || 1;
        finalWidth = alignValue(finalWidth, mult);
        finalHeight = alignValue(finalHeight, mult);

        if (origCustomWidth === 0 && finalWidth === alignValue(ve.videoWidth, mult)) finalWidth = 0;
        if (origCustomHeight === 0 && finalHeight === alignValue(ve.videoHeight, mult)) finalHeight = 0;

        setWidgetValue(node, "custom_width", finalWidth);
        setWidgetValue(node, "custom_height", finalHeight);
        setWidgetValue(node, "resize_method", rs.value);
        setWidgetValue(node, "multiple", mult);
        setWidgetValue(node, "frame_rate", getFps());
        setWidgetValue(node, "display_mode", mode);
        syncT();

        close();

        if (node._pgsVideoRender) {
            node._pgsVideoRender();
            setTimeout(() => node._pgsVideoRender(), 300);
        }
    };

    updateTS();
    updateCb();
    updateParams();
    updateRangeOverlay();
    updateReadout();
}