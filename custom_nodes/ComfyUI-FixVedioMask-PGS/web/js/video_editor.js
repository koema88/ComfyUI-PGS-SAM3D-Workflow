import { app } from "../../scripts/app.js";
import { VideoEditor } from "./lib/editor.mjs";

const DIRECTOR_DOM_WIDGET_NAME = "fix_vedio_mask_ui";
const NODE_TYPE = "FixVedioMask-PGS";

const PANEL_WIDTH = 1000;
const PANEL_HEIGHT = 880;
const NODE_WIDTH = 1040;
const NODE_HEIGHT = PANEL_HEIGHT + 40;

function isVideoEditorNode(node) {
    return (node?.comfyClass || node?.type || "") === NODE_TYPE;
}

function initVideoEditor(node) {
    const dups = (node.widgets || []).filter((w) => w?.name === DIRECTOR_DOM_WIDGET_NAME);
    const widget = dups.find((w) => w.element?.querySelector?.(":scope > .bd-wrap")) || node._videoDomWidget || dups[0];
    const container = widget?.element;
    if (!container) return null;
    const existing = node._videoEditor || widget._videoEditor;
    if (existing?.root && existing.container === container) return existing;

    if (existing) { try { existing.destroy(); } catch { } }
    try {
        container.innerHTML = "";
        const editor = new VideoEditor(node, container, widget);
        node._videoEditor = editor;
        widget._videoEditor = editor;
        return editor;
    } catch (err) {
        console.error("[FVM-PGS] UI init failed:", err);
        return null;
    }
}

app.registerExtension({
    name: "FixVedioMaskPGS.Plugin",
    async nodeCreated(node) {
        if (!isVideoEditorNode(node)) return;
        setTimeout(() => initVideoEditor(node), 0);
    },
    async loadedGraphNode(node) {
        if (!isVideoEditorNode(node)) return;
        setTimeout(() => initVideoEditor(node), 0);
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onCreated?.apply(this, arguments);
            this.size = [NODE_WIDTH, NODE_HEIGHT];

            // 重命名输入口显示名（内部 key 保持 PoseMask / PoseRef 不变，兼容老工作流）
            for (const inp of this.inputs || []) {
                if (inp.name === "PoseMask") {
                    inp.label = "Character ID";
                }
                if (inp.name === "PoseRef") {
                    inp.label = "VideoRef";
                }
            }

            for (const w of this.widgets || []) {
                if (w.name === "timeline_data" || w.name === "video_file") {
                    w.hidden = true;
                    if (!w.options) w.options = {};
                    w.options.hidden = true;
                    w.computeSize = () => [0, 0];
                    if (w.element) w.element.style.display = "none";
                }
            }

            const container = document.createElement("div");
            container.className = "mvr-host";
            container.style.width = `${PANEL_WIDTH}px`;
            container.style.maxWidth = `${PANEL_WIDTH}px`;

            const widget = this.addDOMWidget(DIRECTOR_DOM_WIDGET_NAME, "fix_vedio_mask", container, {
                getValue: () => "", setValue: () => {},
                getMinHeight: () => PANEL_HEIGHT, getHeight: () => PANEL_HEIGHT,
                hideOnZoom: false, serialize: false,
            });
            widget.computeSize = () => [NODE_WIDTH, PANEL_HEIGHT];

            this._videoDomWidget = widget;
            setTimeout(() => initVideoEditor(this), 0);
            return r;
        };

        // 只锁最小高度，宽度允许用户拖动
        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function () {
            if (this.size && this.size[1] < NODE_HEIGHT) this.size[1] = NODE_HEIGHT;
            const out = onResize?.apply(this, arguments);
            if (!this._videoEditor?.isPlaying && !this._videoEditor?._pauseSettling) {
                this._videoEditor?.onNodeResize?.();
            }
            return out;
        };
    },
});