// utils.mjs - 通用工具函数和常量

import { api } from "../../../scripts/api.js";

export const VIDEO_NODE = "LoadVideoPGS";
export const AUDIO_NODE = "LoadAudioPGS";

export const VIDEO_NODE_WIDTH = 340;
export const VIDEO_NODE_HEIGHT = 380;
export const VIDEO_PANEL_WIDTH = 316;
export const VIDEO_PANEL_HEIGHT = 350;

export const AUDIO_NODE_WIDTH = 280;
export const AUDIO_NODE_HEIGHT = 300;
export const AUDIO_PANEL_WIDTH = 256;
export const AUDIO_PANEL_HEIGHT = 270;

export function kindOf(f) {
    const n = f.name || "";
    if (f.type?.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/i.test(n)) return "image";
    if (f.type?.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi)$/i.test(n)) return "video";
    if (f.type?.startsWith("audio/") || /\.(mp3|wav|flac|m4a|ogg|aac)$/i.test(n)) return "audio";
    return null;
}

export function fileUrl(name) {
    if (!name || name === "(none)") return "";
    const p = String(name).replaceAll("\\", "/").split("/").filter(Boolean);
    const f = p.pop() || "";
    const q = new URLSearchParams({ filename: f, type: "input", subfolder: p.join("/") });
    return api.apiURL(`/view?${q}`);
}

export async function uploadFileChunked(file, chunkSize = 5 * 1024 * 1024) {
    const totalChunks = Math.ceil(file.size / chunkSize);
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);
        const formData = new FormData();
        formData.append('file', chunk, file.name);
        formData.append('filename', file.name);
        formData.append('chunk_index', i);
        formData.append('total_chunks', totalChunks);
        formData.append('total_size', file.size); // 修复：传递给后端校验
        
        const resp = await api.fetchApi('/loadref_pgs_upload_chunk', {
            method: 'POST',
            body: formData,
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error || `上传失败 (状态码: ${resp.status})`);
        }
        const data = await resp.json();
        if (i === totalChunks - 1 && data.name) {
            return data.name;
        }
    }
    return file.name;
}

export function setWidgetValue(node, name, value, silent = false, force = false) {
    const w = node.widgets?.find(w => w.name === name);
    if (!w) return;
    if (!force && w.value === value) return;
    w.value = value;
    w.callback?.(value);
    node.properties = node.properties || {};
    node.properties[name] = value;
    if (!silent) {
        node.setDirtyCanvas(true, true);
        node.graph?.setDirtyCanvas(true, true);
    }
}

export function widgetValue(node, name, fb = null) {
    const w = node.widgets?.find(w => w.name === name);
    if (w && w.value !== undefined && w.value !== "") return w.value;
    if (node.properties?.[name] !== undefined && node.properties[name] !== "") return node.properties[name];
    return fb;
}

export function fmt(s) {
    s = Math.max(0, s || 0);
    const h = Math.floor(s / 3600),
        m = Math.floor(s % 3600 / 60),
        x = Math.floor(s % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`
        : `${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
}

export function hideWidget(w) {
    if (!w) return;
    w.hidden = true;
    w.options = w.options || {};
    w.options.hidden = true;
    w.computeSize = () => [0, -4];
    if (w.element) w.element.style.display = "none";
}

export function panelStyle(w, h) {
    return `width:${w}px;min-width:${w}px;max-width:${w}px;height:${h}px;min-height:${h}px;max-height:${h}px;box-sizing:border-box;padding:8px;display:flex;flex-direction:column;gap:6px;background:rgba(20,28,38,0.75);border:1px solid rgba(120,160,190,0.35);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.12),inset 0 -1px 0 rgba(0,0,0,0.2);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:Arial,sans-serif;color:#d7e3ef;overflow:hidden;`;
}

export function injectStyles() {
    if (document.getElementById("pgs-lr-s")) return;
    const st = document.createElement("style");
    st.id = "pgs-lr-s";
    st.textContent = `
.pgs-drop{aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#08b4ed;cursor:pointer;border:1px dashed #2c5368;border-radius:6px;background:#101b26;padding:4px;box-sizing:border-box;width:100%;height:100%;transition:all .2s}
.pgs-drop:hover{border-color:#0aa4d6;background:#142633;box-shadow:0 0 12px rgba(10,164,214,.6),inset 0 0 8px rgba(10,164,214,.2)}
.pgs-di{font-size:14px;color:#08b4ed}.pgs-dt{font-size:10px;color:#d9e8f2}.pgs-ds{font-size:8px;color:#8697a7;margin-top:3px}
.pgs-card{aspect-ratio:1;border:1px solid #30485c;border-radius:6px;background:#1a2938;overflow:hidden;position:relative;cursor:pointer;width:100%;height:100%}
.pgs-card video,.pgs-card img{width:100%;height:100%;object-fit:cover;background:#071018;transition:object-fit .2s}
.pgs-card:hover video,.pgs-card:hover img{object-fit:contain}
.pgs-ci{position:absolute;left:0;right:0;bottom:0;padding:3px 5px;background:rgba(10,20,30,.7);display:flex;align-items:center;gap:4px;font-size:9px;color:#d9e8f2;z-index:2}
.pgs-fn{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pgs-x{position:absolute;right:2px;top:2px;border:0;background:rgba(34,52,65,.7);color:#d3e0ea;cursor:pointer;font-size:12px;padding:2px 5px;border-radius:50%;z-index:3}
.pgs-x:hover{background:#4a6a7d;color:#fff}
.pgs-pb{border:0;background:rgba(34,52,65,.7);color:#d3e0ea;cursor:pointer;font-size:11px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:50%}
.pgs-pb:hover{background:#4a6a7d;color:#fff}
.pgs-pt{color:#b8d2dc;font-size:9px}
.pgs-ac{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;background:#1a2938}
.pgs-ai{font-size:32px;color:#8ea3b4;margin-bottom:6px}
.pgs-an{width:100%;text-align:center;color:#d9e8f2;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px}
.pgs-ab{border:1px solid #3a5363;border-radius:50%;background:#223744;color:#dce7ee;width:26px;height:26px;cursor:pointer;font-size:12px}
.pgs-ab:hover{background:#2a4a58}
.pgs-at{color:#b8d2dc;font-size:10px}
.pgs-tb{border:1px solid #466474;border-radius:4px;background:#223744;color:#b8d2dc;padding:3px 8px;font-size:10px;cursor:pointer;margin-top:4px}
.pgs-tb:hover{background:#2a4a58}
.pgs-eb{margin-top:6px;padding:5px 10px;background:#2a4a58;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;cursor:pointer;font-size:11px;width:100%}
.pgs-eb:hover{background:#356173}
.pgs-ov{position:fixed;inset:0;z-index:10500;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);font:12px Arial,sans-serif}
.pgs-dl{width:min(920px,calc(100vw - 40px));max-height:90vh;overflow-y:auto;background:#1a222b;color:#d7e3ec;border:1px solid #365161;border-radius:10px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.7)}
.pgs-tb2{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #365161}
.pgs-tb2 button,.pgs-tb2 input,.pgs-tb2 select{background:#223744;color:#dce7ee;border:1px solid #3a5363;border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer}
.pgs-tb2 button.on{background:#0aa4d6;color:#06131b;border-color:#0aa4d6;font-weight:bold}
.pgs-pv{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:6px;overflow:hidden;margin-bottom:10px}
.pgs-pv video{width:100%;height:100%;object-fit:contain;outline:none}
.pgs-cb{position:absolute;border:2px dashed #38bdf8;display:none;cursor:move;box-sizing:border-box;box-shadow:0 0 0 9999px rgba(0,0,0,.5);z-index:10}
.pgs-ch{position:absolute;width:20px;height:20px;background:transparent}

.pgs-tl{display:flex;flex-direction:column;background:rgba(0,0,0,.35);padding:10px 12px 12px 12px;border-radius:4px;margin-bottom:8px;position:relative;}
.pgs-tr{position:relative;height:18px;font-size:10px;color:#9299a8;user-select:none;font-variant-numeric:tabular-nums;margin-bottom:2px;padding:0 1px;}
.pgs-ts{position:relative;width:100%;height:34px;background:#20232a;background-image:linear-gradient(90deg,#343941 1px,transparent 1px);background-size:10% 100%;border:1px solid #363b45;border-radius:4px;cursor:crosshair;box-sizing:border-box;overflow:hidden;}
.pgs-tf{position:absolute;top:0;bottom:0;background:rgba(188,198,210,.16);border-left:1px solid rgba(210,220,230,.6);border-right:1px solid rgba(210,220,230,.6);pointer-events:none;z-index:1;}
.pgs-th{position:absolute;top:0;bottom:0;width:2px;background:#c9d4df;transform:translateX(-50%);cursor:ew-resize;z-index:2;box-shadow:0 0 0 1px #15181d;}
.pgs-th::after{content:"";position:absolute;top:0;bottom:0;left:-9px;width:20px;background:transparent;cursor:ew-resize;pointer-events:auto;}
.pgs-th::before{content:"";position:absolute;top:-1px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #c9d4df;}
.pgs-th:hover,.pgs-th:hover::before{background:#e1ebf4;}
.pgs-th:hover::before{border-top-color:#e1ebf4;}
.pgs-pointer-row{position:relative;height:14px;margin-bottom:-2px;user-select:none;touch-action:none;}
.pgs-pointer{position:absolute;top:0;width:12px;height:12px;transform:translateX(-50%);padding:0;border:0;background:#38bdf8;clip-path:polygon(0 0,100% 0,50% 100%);cursor:ew-resize;z-index:15;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));}
.pgs-pointer:hover{background:#78c4ff;}

.pgs-readout{display:flex;justify-content:space-between;font-size:11px;color:#aeb5c2;font-variant-numeric:tabular-nums;margin-top:6px;margin-bottom:8px;}
.pgs-readout .pgs-ro-cur{color:#e2edf3;}
.pgs-readout .pgs-ro-range{color:#9ab3c4;}
.pgs-readout .pgs-ro-dur{color:#9fc9ec;}

.pgs-btn-row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;margin-bottom:0;width:100%;}
.pgs-btn-group{display:flex;gap:6px;align-items:center;}
.pgs-btn-row button{border:1px solid #424956;border-radius:5px;padding:5px 10px;background:#242832;color:#e6e9ef;cursor:pointer;font-size:11px;}
.pgs-btn-row button:hover{background:#303643;}
.pgs-btn-row .pgs-fr{min-width:48px;padding:5px 6px;color:#9fc9ec;font-variant-numeric:tabular-nums;text-align:center;}

.pgs-range{position:absolute;bottom:0;left:0;height:4px;background:rgba(0,255,0,0.8);pointer-events:none;z-index:8;transition:left .1s,width .1s}
.pgs-thumb-range{position:absolute;bottom:0;left:0;height:4px;background:rgba(0,255,0,0.8);pointer-events:none;z-index:5;transition:left .1s,width .1s}
.pgs-thumb-range-label{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:2px 5px;border-radius:3px;pointer-events:none;z-index:6}
.pgs-aspect-btn.on{background:#0aa4d6;color:#06131b;border-color:#0aa4d6}
.pgs-seg-item{border:1px solid #3a5363;border-radius:4px;background:#223744;color:#dce7ee;padding:4px 6px;font-size:10px;cursor:pointer;text-align:left;}
.pgs-seg-item:hover{background:#2a4a58;}
.pgs-seg-item b{color:#0aa4d6;}
`;
    document.head.appendChild(st);
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}