// audio_widget.mjs - 音频节点预览组件

import {
    injectStyles,
    panelStyle,
    hideWidget,
    widgetValue,
    setWidgetValue,
    fileUrl,
    fmt,
    kindOf,
    uploadFileChunked,
    AUDIO_PANEL_WIDTH,
    AUDIO_PANEL_HEIGHT
} from './utils.mjs';
import { openAudioTrimEditor } from './audio_editor.mjs';

export function createAudioWidget(node) {
    if (typeof node.addDOMWidget !== "function") return;
    injectStyles();
    const widget = node.addDOMWidget("pgs_audio_preview", "pgs_audio_preview", document.createElement("div"), {
        serialize: false,
        hideOnZoom: false
    });
    const root = widget.element;
    root.style.cssText = panelStyle(AUDIO_PANEL_WIDTH, AUDIO_PANEL_HEIGHT);

    ["trim_start", "trim_end"].forEach(n => {
        const w = node.widgets?.find(w => w.name === n);
        if (w) hideWidget(w);
    });

    function render() {
        let fn = widgetValue(node, "filename");
        if (!fn && node.properties?.filename) {
            fn = node.properties.filename;
            setWidgetValue(node, "filename", fn, true);
        }
        root.innerHTML = "";
        if (fn && fn !== "(none)") {
            const card = document.createElement("div");
            card.className = "pgs-card";
            const c = document.createElement("div");
            c.className = "pgs-ac";

            const iconDiv = document.createElement("div");
            iconDiv.className = "pgs-ai";
            iconDiv.textContent = "♫";
            const nameDiv = document.createElement("div");
            nameDiv.className = "pgs-an";
            nameDiv.textContent = fn.split("/").pop();
            c.append(iconDiv, nameDiv);

            const ct = document.createElement("div");
            ct.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px";
            const pb = document.createElement("button");
            pb.className = "pgs-ab";
            pb.textContent = "▶";
            const pt = document.createElement("span");
            pt.className = "pgs-at";
            pt.textContent = "00:00 / 00:00";
            ct.appendChild(pb);
            ct.appendChild(pt);
            c.appendChild(ct);
            const tb = document.createElement("button");
            tb.className = "pgs-tb";
            tb.textContent = "✂ 裁剪";
            tb.onclick = e => {
                e.stopPropagation();
                openAudioTrimEditor(node, fn);
            };
            c.appendChild(tb);
            card.appendChild(c);
            const rangeBar = document.createElement("div");
            rangeBar.className = "pgs-thumb-range";
            card.appendChild(rangeBar);
            const rangeLabel = document.createElement("div");
            rangeLabel.className = "pgs-thumb-range-label";
            rangeLabel.style.display = "none";
            card.appendChild(rangeLabel);
            const playProgress = document.createElement("div");
            playProgress.style.cssText = "position:absolute;bottom:0;left:0;height:4px;background:#38bdf8;width:0%;pointer-events:none;z-index:6;transition:width 0.1s linear";
            card.appendChild(playProgress);
            const x = document.createElement("button");
            x.className = "pgs-x";
            x.textContent = "×";
            x.onclick = e => {
                e.stopPropagation();
                setWidgetValue(node, "filename", "", false, true);
                render();
            };
            card.appendChild(x);
            root.appendChild(card);

            const audio = new Audio(fileUrl(fn));
            let playing = false;

            function getStart() { return parseFloat(widgetValue(node, "trim_start", 0)) || 0; }

            function getEnd() {
                const d = parseFloat(widgetValue(node, "trim_end", 0)) || 0;
                return d > 0 ? d : audio.duration;
            }

            function updateRangeUI() {
                const ad = audio.duration;
                if (!ad) return;
                const s = getStart(),
                    e = getEnd();
                rangeBar.style.left = s / ad * 100 + "%";
                rangeBar.style.width = (e - s) / ad * 100 + "%";
                if (e > s) {
                    rangeLabel.style.display = "block";
                    rangeLabel.textContent = `${fmt(s)} - ${fmt(e)}`;
                } else {
                    rangeLabel.style.display = "none";
                }
            }
            audio.onloadedmetadata = () => {
                pt.textContent = `${fmt(0)} / ${fmt(audio.duration)}`;
                updateRangeUI();
            };
            audio.ontimeupdate = () => {
                pt.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration)}`;
                if (audio.duration && isFinite(audio.duration)) {
                    playProgress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
                }
                if (playing) {
                    const s = getStart(),
                        e = getEnd();
                    if (audio.currentTime >= e) {
                        audio.pause();
                        playing = false;
                        pb.textContent = "▶";
                        audio.currentTime = s;
                        pt.textContent = `${fmt(s)} / ${fmt(audio.duration)}`;
                    } else if (audio.currentTime < s) {
                        audio.currentTime = s;
                    }
                }
            };
            audio.onended = () => {
                playing = false;
                pb.textContent = "▶";
                pt.textContent = `${fmt(getStart())} / ${fmt(audio.duration)}`;
                playProgress.style.width = "0%";
            };
            pb.onclick = e => {
                e.stopPropagation();
                if (playing) {
                    audio.pause();
                    playing = false;
                    pb.textContent = "▶";
                } else {
                    const s = getStart();
                    audio.currentTime = s;
                    audio.play();
                    playing = true;
                    pb.textContent = "⏸";
                }
            };
            card.onclick = e => e.stopPropagation();
        } else {
            const d = document.createElement("div");
            d.className = "pgs-drop";
            
            const dropContent = document.createElement("div");
            dropContent.style.cssText = "display:flex;align-items:center;justify-content:center;gap:5px";
            const iconSpan = document.createElement("span");
            iconSpan.className = "pgs-di";
            iconSpan.textContent = "♫";
            const textSpan = document.createElement("span");
            textSpan.className = "pgs-dt";
            textSpan.textContent = "拖拽或点击上传音频";
            dropContent.append(iconSpan, textSpan);

            const subSpan = document.createElement("div");
            subSpan.className = "pgs-ds";
            subSpan.textContent = "MP3/WAV/FLAC";

            d.append(dropContent, subSpan);
            root.appendChild(d);
            attachA(d);
        }
    }
    node._pgsAudioRender = render;

    function attachA(el) {
        const glow = o => {
            if (o) {
                el.style.borderColor = "#0aa4d6";
                el.style.boxShadow = "0 0 12px rgba(10,164,214,.6),inset 0 0 8px rgba(10,164,214,.2)";
                el.style.background = "#142633";
            } else {
                el.style.borderColor = "#2c5368";
                el.style.boxShadow = "none";
                el.style.background = "#101b26";
            }
        };
        el.addEventListener("mouseenter", () => glow(true));
        el.addEventListener("mouseleave", () => glow(false));
        el.addEventListener("dragenter", e => {
            e.preventDefault();
            e.stopPropagation();
            glow(true);
        });
        el.addEventListener("dragleave", e => {
            e.preventDefault();
            e.stopPropagation();
            glow(false);
        });
        el.addEventListener("dragover", e => {
            e.preventDefault();
            e.stopPropagation();
        });
        el.addEventListener("drop", e => {
            e.preventDefault();
            e.stopPropagation();
            glow(false);
            acceptA(e.dataTransfer.files);
        });
        el.addEventListener("click", () => {
            const i = document.createElement("input");
            i.type = "file";
            i.accept = "audio/*";
            i.onchange = () => acceptA(i.files);
            i.click();
        });
    }

    async function acceptA(files) {
        const f = [...files].find(f => kindOf(f) === "audio");
        if (!f) return;
        try {
            const n = await uploadFileChunked(f);
            setWidgetValue(node, "filename", n);
            render();
        } catch (e) {
            console.error(e);
            const errDiv = document.createElement("div");
            errDiv.style.cssText = "color:#f66;font-size:10px;margin-top:4px;";
            errDiv.textContent = "上传失败: " + e.message;
            root.appendChild(errDiv);
        }
    }

    render();
    setTimeout(render, 200);
}