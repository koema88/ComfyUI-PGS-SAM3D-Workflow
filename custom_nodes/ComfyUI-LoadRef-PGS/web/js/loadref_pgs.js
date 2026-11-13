// loadref_pgs.js - 插件主入口

import { app } from "../../../scripts/app.js";
import { createVideoWidget } from './video_widget.mjs';
import { createAudioWidget } from './audio_widget.mjs';
import {
    VIDEO_NODE,
    AUDIO_NODE,
    VIDEO_NODE_WIDTH,
    VIDEO_NODE_HEIGHT,
    AUDIO_NODE_WIDTH,
    AUDIO_NODE_HEIGHT,
    hideWidget
} from './utils.mjs';

app.registerExtension({
    name: "pgs.loadref",
    async beforeRegisterNodeDef(nt, nd) {
        if (nd.name === VIDEO_NODE) {
            const o = nt.prototype.onNodeCreated;
            nt.prototype.onNodeCreated = function () {
                const r = o?.apply(this, arguments);
                if (typeof this.addDOMWidget === "function") {
                    const props = this.properties || {};
                    const syncKeys = ["filename", "start_time", "end_time", "duration", "start_frame", "end_frame", "duration_frames", "frame_rate", "display_mode", "resize_method", "custom_width", "custom_height", "multiple", "crop_x", "crop_y", "crop_w", "crop_h", "segment_plan_json", "segment_index"];
                    syncKeys.forEach(name => {
                        const w = this.widgets?.find(w => w.name === name);
                        if (w && props[name] !== undefined && props[name] !== null && props[name] !== "") {
                            w.value = props[name];
                        }
                    });

                    ["start_time", "end_time", "duration", "start_frame", "end_frame", "duration_frames", "frame_rate", "display_mode", "resize_method", "custom_width", "custom_height", "multiple", "crop_x", "crop_y", "crop_w", "crop_h", "segment_plan_json"].forEach(n => {
                        const w = this.widgets?.find(w => w.name === n);
                        if (w) hideWidget(w);
                    });

                    if (!this._pgsVideoWidget) {
                        createVideoWidget(this);
                        this._pgsVideoWidget = true;
                    }

                    this.setSize([VIDEO_NODE_WIDTH, VIDEO_NODE_HEIGHT]);
                    const baseComputeSize = this.computeSize.bind(this);
                    this.computeSize = function (out) {
                        const measured = baseComputeSize(out);
                        measured[0] = VIDEO_NODE_WIDTH;
                        return measured;
                    };
                    const prevOnResize = this.onResize;
                    this.onResize = function (...args) {
                        if (this.size && this.size[0] !== VIDEO_NODE_WIDTH) this.size[0] = VIDEO_NODE_WIDTH;
                        prevOnResize?.apply(this, args);
                    };
                    const domWidget = this.widgets?.find(w => w.name === "pgs_video_preview");
                    if (domWidget) {
                        domWidget.options = domWidget.options || {};
                        domWidget.options.getMinHeight = () => VIDEO_NODE_HEIGHT;
                        domWidget.options.getHeight = () => "100%";
                    }
                }

                // ★ 核心修复：序列化时强制同步 filename
                const origOnSerialize = this.onSerialize;
                this.onSerialize = function (info) {
                    if (origOnSerialize) origOnSerialize.apply(this, arguments);
                    const w = this.widgets?.find(w => w.name === "filename");
                    if (w && this.properties?.filename !== undefined && this.properties.filename !== "") {
                        w.value = this.properties.filename;
                    }
                };
                const origOnConfigure = this.onConfigure;
                this.onConfigure = function (info) {
                    if (origOnConfigure) origOnConfigure.apply(this, arguments);
                    if (info?.properties?.filename) {
                        const w = this.widgets?.find(w => w.name === "filename");
                        if (w) {
                            w.value = info.properties.filename;
                            w.callback?.(w.value);
                        }
                    }
                    if (info?.properties?.segment_plan) {
                        this.properties = this.properties || {};
                        this.properties.segment_plan = info.properties.segment_plan;
                    }
                    setTimeout(() => { if (this._pgsVideoRender) this._pgsVideoRender(); }, 100);
                };
                return r;
            };
        }

        if (nd.name === AUDIO_NODE) {
            const o = nt.prototype.onNodeCreated;
            nt.prototype.onNodeCreated = function () {
                const r = o?.apply(this, arguments);
                if (typeof this.addDOMWidget === "function") {
                    const props = this.properties || {};
                    const syncKeys = ["filename", "trim_start", "trim_end"];
                    syncKeys.forEach(name => {
                        const w = this.widgets?.find(w => w.name === name);
                        if (w && props[name] !== undefined && props[name] !== null && props[name] !== "") {
                            w.value = props[name];
                        }
                    });

                    ["trim_start", "trim_end"].forEach(n => {
                        const w = this.widgets?.find(w => w.name === n);
                        if (w) hideWidget(w);
                    });

                    if (!this._pgsAudioWidget) {
                        createAudioWidget(this);
                        this._pgsAudioWidget = true;
                    }

                    this.setSize([AUDIO_NODE_WIDTH, AUDIO_NODE_HEIGHT]);
                    const baseComputeSize = this.computeSize.bind(this);
                    this.computeSize = function (out) {
                        const measured = baseComputeSize(out);
                        measured[0] = AUDIO_NODE_WIDTH;
                        return measured;
                    };
                    const prevOnResize = this.onResize;
                    this.onResize = function (...args) {
                        if (this.size && this.size[0] !== AUDIO_NODE_WIDTH) this.size[0] = AUDIO_NODE_WIDTH;
                        prevOnResize?.apply(this, args);
                    };
                    const domWidget = this.widgets?.find(w => w.name === "pgs_audio_preview");
                    if (domWidget) {
                        domWidget.options = domWidget.options || {};
                        domWidget.options.getMinHeight = () => AUDIO_NODE_HEIGHT;
                        domWidget.options.getHeight = () => "100%";
                    }
                }

                // ★ 核心修复：音频也做强制同步
                const origOnSerialize = this.onSerialize;
                this.onSerialize = function (info) {
                    if (origOnSerialize) origOnSerialize.apply(this, arguments);
                    const w = this.widgets?.find(w => w.name === "filename");
                    if (w && this.properties?.filename !== undefined && this.properties.filename !== "") {
                        w.value = this.properties.filename;
                    }
                };
                const origOnConfigure = this.onConfigure;
                this.onConfigure = function (info) {
                    if (origOnConfigure) origOnConfigure.apply(this, arguments);
                    if (info?.properties?.filename) {
                        const w = this.widgets?.find(w => w.name === "filename");
                        if (w) {
                            w.value = info.properties.filename;
                            w.callback?.(w.value);
                        }
                    }
                    setTimeout(() => { if (this._pgsAudioRender) this._pgsAudioRender(); }, 100);
                };
                return r;
            };
        }
    }
});