// video_widget.mjs - 视频节点预览组件

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
    VIDEO_PANEL_WIDTH,
    VIDEO_PANEL_HEIGHT
} from './utils.mjs';
import { openVideoEditor } from './video_editor.mjs';

export function createVideoWidget(node) {
    if (typeof node.addDOMWidget !== "function") return;
    injectStyles();
    const widget = node.addDOMWidget("pgs_video_preview", "pgs_video_preview", document.createElement("div"), {
        serialize: false,
        hideOnZoom: false
    });
    const root = widget.element;
    root.style.cssText = panelStyle(VIDEO_PANEL_WIDTH, VIDEO_PANEL_HEIGHT);

    // 确保 multiple 被隐藏
    ["start_time", "end_time", "duration", "start_frame", "end_frame", "duration_frames", "frame_rate", "display_mode", "resize_method", "custom_width", "custom_height", "multiple", "crop_x", "crop_y", "crop_w", "crop_h", "segment_plan_json"].forEach(n => {
        const w = node.widgets?.find(w => w.name === n);
        if (w) hideWidget(w);
    });

    function render() {
        root.innerHTML = "";
        const fn = widgetValue(node, "filename");
        if (!fn || fn === "(none)") {
            const d = document.createElement("div");
            d.className = "pgs-drop";
            
            const dropContent = document.createElement("div");
            dropContent.style.cssText = "display:flex;align-items:center;justify-content:center;gap:5px";
            const iconSpan = document.createElement("span");
            iconSpan.className = "pgs-di";
            iconSpan.textContent = "📤︎";
            const textSpan = document.createElement("span");
            textSpan.className = "pgs-dt";
            textSpan.textContent = "拖拽或点击上传视频";
            dropContent.append(iconSpan, textSpan);

            const subSpan = document.createElement("div");
            subSpan.className = "pgs-ds";
            subSpan.textContent = "支持 MP4/MOV/WebM";

            d.append(dropContent, subSpan);
            root.appendChild(d);
            attachV(d);
            return;
        }
        const card = document.createElement("div");
        card.className = "pgs-card";
        const video = document.createElement("video");
        video.src = fileUrl(fn);
        video.muted = false;
        video.preload = "metadata";
        card.appendChild(video);

        const rangeBar = document.createElement("div");
        rangeBar.className = "pgs-thumb-range";
        card.appendChild(rangeBar);

        const rangeLabel = document.createElement("div");
        rangeLabel.className = "pgs-thumb-range-label";
        rangeLabel.style.display = "none";
        card.appendChild(rangeLabel);

        const info = document.createElement("div");
        info.className = "pgs-ci";
        const pb = document.createElement("button");
        pb.className = "pgs-pb";
        pb.textContent = "▶";
        const pt = document.createElement("span");
        pt.className = "pgs-pt";
        pt.textContent = "00:00 / 00:00";
        info.appendChild(pb);
        info.appendChild(pt);
        card.appendChild(info);

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

        const eb = document.createElement("button");
        eb.className = "pgs-eb";
        eb.textContent = "编辑";
        eb.onclick = e => {
            e.stopPropagation();
            openVideoEditor(node);
        };
        root.appendChild(eb);

        let playing = false;

        function getStart() { return parseFloat(widgetValue(node, "start_time", 0)) || 0; }

        function getEnd() {
            const d = parseFloat(widgetValue(node, "end_time", 0)) || 0;
            return d > 0 ? d : video.duration;
        }

        function updateRangeUI() {
            const vd = video.duration;
            if (!vd) return;
            const s = getStart(),
                e = getEnd();
            rangeBar.style.left = s / vd * 100 + "%";
            rangeBar.style.width = (e - s) / vd * 100 + "%";
            if (e > s) {
                rangeLabel.style.display = "block";
                rangeLabel.textContent = `${fmt(s)} - ${fmt(e)}`;
            } else {
                rangeLabel.style.display = "none";
            }
        }

        video.onloadedmetadata = () => {
            pt.textContent = `${fmt(0)} / ${fmt(video.duration)}`;
            updateRangeUI();
            const hasEndTime = parseFloat(widgetValue(node, "end_time", 0)) > 0;
            if (!hasEndTime) {
                setWidgetValue(node, "duration", video.duration, true);
                node.properties = node.properties || {};
                node.properties["duration_seconds"] = video.duration;
            } else {
                const s = parseFloat(widgetValue(node, "start_time", 0)) || 0;
                const e = parseFloat(widgetValue(node, "end_time", 0)) || 0;
                const d = Math.max(0, e - s);
                setWidgetValue(node, "duration", d, true);
                node.properties = node.properties || {};
                node.properties["duration_seconds"] = d;
            }
        };

        video.ontimeupdate = () => {
            pt.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
            if (playing) {
                const s = getStart(),
                    e = getEnd();
                if (video.currentTime >= e) {
                    video.pause();
                    playing = false;
                    pb.textContent = "▶";
                    video.currentTime = s;
                    pt.textContent = `${fmt(s)} / ${fmt(video.duration)}`;
                } else if (video.currentTime < s) {
                    video.currentTime = s;
                }
            }
        };

        video.onended = () => {
            playing = false;
            pb.textContent = "▶";
            pt.textContent = `${fmt(getStart())} / ${fmt(video.duration)}`;
        };

        pb.onclick = e => {
            e.stopPropagation();
            if (playing) {
                video.pause();
                playing = false;
                pb.textContent = "▶";
            } else {
                const s = getStart();
                video.currentTime = s;
                video.play();
                playing = true;
                pb.textContent = "⏸";
            }
        };
        card.onclick = e => e.stopPropagation();
    }
    node._pgsVideoRender = render;

    function attachV(el) {
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
            acceptV(e.dataTransfer.files);
        });
        el.addEventListener("click", () => {
            const i = document.createElement("input");
            i.type = "file";
            i.accept = "video/*";
            i.onchange = () => acceptV(i.files);
            i.click();
        });
    }

    async function acceptV(files) {
        const f = [...files].find(f => kindOf(f) === "video");
        if (!f) return;
        try {
            const n = await uploadFileChunked(f);
            setWidgetValue(node, "filename", n);
            setWidgetValue(node, "start_time", 0);
            setWidgetValue(node, "end_time", 0);
            setWidgetValue(node, "duration", 0);
            setWidgetValue(node, "start_frame", 0);
            setWidgetValue(node, "end_frame", 0);
            setWidgetValue(node, "duration_frames", 0);
            setWidgetValue(node, "crop_x", 0);
            setWidgetValue(node, "crop_y", 0);
            setWidgetValue(node, "crop_w", 1);
            setWidgetValue(node, "crop_h", 1);
            node.properties = node.properties || {};
            delete node.properties.segment_plan;
            setWidgetValue(node, "segment_plan_json", "");
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