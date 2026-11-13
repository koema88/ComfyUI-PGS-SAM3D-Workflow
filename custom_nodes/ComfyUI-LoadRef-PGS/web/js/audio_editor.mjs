// audio_editor.mjs - 音频裁剪编辑器

import { app } from "../../../scripts/app.js";   // 新增导入

import { widgetValue, setWidgetValue, fileUrl, fmt } from './utils.mjs';

let currentAudioEditor = null;

export async function openAudioTrimEditor(node, filename) {
    if (currentAudioEditor) {
        currentAudioEditor.remove();
        currentAudioEditor = null;
    }
    const ov = document.createElement("div");
    ov.style.cssText = "position:fixed;inset:0;z-index:10200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.64);font:12px Arial,sans-serif";
    currentAudioEditor = ov;
    document.body.appendChild(ov);
    const dl = document.createElement("div");
    dl.style.cssText = "width:min(720px,calc(100vw - 30px));box-sizing:border-box;padding:15px;background:#17222c;color:#d7e3ec;border:1px solid #365161;border-radius:9px;box-shadow:0 18px 52px rgba(0,0,0,.55)";
    ov.appendChild(dl);
    dl.innerHTML = `<div style="font-size:13px;margin-bottom:12px">音频裁剪</div>`;
    const ww = document.createElement("div");
    ww.style.cssText = "position:relative;width:100%;height:190px;overflow:hidden;border:1px solid #324b5b;border-radius:6px;background:#0d1720;cursor:crosshair;touch-action:none";
    dl.appendChild(ww);
    const wc = document.createElement("canvas");
    wc.style.cssText = "display:block;width:100%;height:100%";
    ww.appendChild(wc);
    const ld = document.createElement("div");
    ld.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7f94a3;background:#0d1720";
    ld.textContent = "加载中...";
    ww.appendChild(ld);
    const tm = document.createElement("div");
    tm.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px";
    dl.appendChild(tm);
    const sb = document.createElement("div");
    sb.style.cssText = "padding:7px 9px;border-radius:5px;background:#1d2b36;color:#9fb0bc";
    sb.innerHTML = `<span>开始</span><strong style="display:block;margin-top:3px;color:#e2edf3;font-size:13px">--</strong>`;
    const eb = document.createElement("div");
    eb.style.cssText = "padding:7px 9px;border-radius:5px;background:#1d2b36;color:#9fb0bc";
    eb.innerHTML = `<span>结束</span><strong style="display:block;margin-top:3px;color:#e2edf3;font-size:13px">--</strong>`;
    const db = document.createElement("div");
    db.style.cssText = "padding:7px 9px;border-radius:5px;background:#1d2b36;color:#9fb0bc;position:relative";
    db.innerHTML = `<span>选取时长</span><strong style="display:block;margin-top:3px;color:#e2edf3;font-size:13px">--</strong>`;
    tm.append(sb, eb, db);
    const sv = sb.querySelector("strong"),
        ev = eb.querySelector("strong"),
        dv = db.querySelector("strong");
    const syn = document.createElement("button");
    syn.textContent = "同步视频时长";
    syn.style.cssText = "position:absolute;right:6px;top:5px;border:1px solid #466474;border-radius:4px;background:#223744;color:#b8d2dc;padding:2px 7px;font:12px/16px Arial,sans-serif;cursor:pointer";
    db.appendChild(syn);
    const ct = document.createElement("div");
    ct.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:12px";
    dl.appendChild(ct);
    const pb = document.createElement("button");
    pb.textContent = "▶";
    pb.style.cssText = "display:flex;align-items:center;justify-content:center;width:30px;height:28px;border:1px solid #3a5363;border-radius:4px;background:#1d2b36;color:#dce7ee;cursor:pointer";
    ct.appendChild(pb);
    const ht = document.createElement("span");
    ht.textContent = "滚轮缩放；中键拖动视图；点击选区播放/停止，选区内按住左键拖动";
    ht.style.cssText = "color:#778b99;font-size:10px";
    ct.appendChild(ht);
    const ac = document.createElement("div");
    ac.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px";
    dl.appendChild(ac);
    const ccl = document.createElement("button");
    ccl.textContent = "取消";
    ccl.style.cssText = "border:1px solid #3a5363;border-radius:4px;background:#1d2b36;color:#dce7ee;padding:6px 14px;cursor:pointer";
    const svb = document.createElement("button");
    svb.textContent = "保存";
    svb.style.cssText = "background:#17535a;border-color:#26717a;color:#e8f6f6;padding:6px 14px;cursor:pointer;border-radius:4px;border:1px solid";
    svb.disabled = true;
    ac.append(ccl, svb);

    let buf = null,
        start = 0,
        end = 0,
        drg = null,
        doX = 0,
        ds = 0,
        de = 0,
        pdx = 0,
        moved = false,
        panX = 0,
        panVs = 0,
        vs = 0,
        ve_ = 0,
        pa = null,
        pp = false,
        phf = 0,
        minSel = 0.05;
    let peaks = null;
    let handleResize = null;   // 新增

    const stop = rs => {
        if (!pa) return;
        pa.pause();
        if (rs) pa.currentTime = start;
        pp = false;
        cancelAnimationFrame(phf);
        phf = 0;
        pb.textContent = "▶";
        draw();
    };
    const close = () => {
        stop(false);
        pa?.removeAttribute("src");
        buf = null;
        pa = null;
        peaks = null;
        if (handleResize) {
            window.removeEventListener("resize", handleResize);
            handleResize = null;
        }
        ov.remove();
        currentAudioEditor = null;
    };
    ccl.onclick = close;
    ov.onclick = e => {
        if (e.target === ov) close();
    };
    dl.onclick = e => e.stopPropagation();

    const dec = async n => {
        const r = await fetch(fileUrl(n));
        if (!r.ok) throw new Error("解码失败: " + r.status);
        const b = await r.arrayBuffer();
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) throw new Error("浏览器不支持");
        const c = new C();
        try {
            return await c.decodeAudioData(b.slice(0));
        } finally {
            c.close().catch(() => {});
        }
    };

    function computePeaks(buffer, canvasWidth) {
        const channelData = buffer.getChannelData(0);
        const peaks = new Float32Array(canvasWidth);
        const samplesPerPixel = Math.floor(channelData.length / canvasWidth);
        for (let i = 0; i < canvasWidth; i++) {
            let max = 0;
            const start = i * samplesPerPixel;
            const end = Math.min(start + samplesPerPixel, channelData.length);
            for (let j = start; j < end; j += 10) {
                const val = Math.abs(channelData[j]);
                if (val > max) max = val;
            }
            peaks[i] = max;
        }
        return peaks;
    }

    function draw() {
        if (!buf || !peaks) return;
        const r = wc.getBoundingClientRect(),
            rat = Math.max(1, devicePixelRatio || 1);
        const w = Math.max(1, Math.round(r.width * rat)),
            h = Math.max(1, Math.round(r.height * rat));
        if (wc.width !== w || wc.height !== h) {
            wc.width = w;
            wc.height = h;
        }
        const c = wc.getContext("2d");
        c.clearRect(0, 0, w, h);
        c.fillStyle = "#0d1720";
        c.fillRect(0, 0, w, h);
        const wh = Math.max(1, h - 24 * rat),
            cy = wh / 2;
        const vd = Math.max(0.001, ve_ - vs);
        const t2x = s => (s - vs) / vd * w;
        c.strokeStyle = "#587080";
        c.lineWidth = Math.max(1, rat);
        c.beginPath();
        const canvasWidthLogical = w / rat;
        for (let x = 0; x < w; x++) {
            const logicalX = Math.floor(x / rat);
            if (logicalX >= peaks.length) break;
            const pk = peaks[logicalX] || 0;
            const a = Math.max(1, pk * wh * 0.42);
            c.moveTo(x + 0.5, cy - a);
            c.lineTo(x + 0.5, cy + a);
        }
        c.stroke();

        const sx = t2x(start),
            ex = t2x(end);
        const cx1 = Math.max(0, Math.min(w, sx)),
            cx2 = Math.max(0, Math.min(w, ex));
        c.fillStyle = "rgba(4,10,15,.62)";
        c.fillRect(0, 0, cx1, wh);
        c.fillRect(cx2, 0, w - cx2, wh);
        c.fillStyle = "rgba(10,164,214,.16)";
        c.fillRect(cx1, 0, Math.max(0, cx2 - cx1), wh);
        c.strokeStyle = "#27d9e5";
        c.lineWidth = Math.max(2, 2 * rat);
        for (const x of [sx, ex]) {
            if (x < 0 || x > w) continue;
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, wh);
            c.stroke();
        }
        c.fillStyle = "#27d9e5";
        const hw = 5 * rat,
            hh = 24 * rat;
        if (sx >= 0 && sx <= w) c.fillRect(sx - hw / 2, cy - hh / 2, hw, hh);
        if (ex >= 0 && ex <= w) c.fillRect(ex - hw / 2, cy - hh / 2, hw, hh);
        c.fillStyle = "#0b141c";
        c.fillRect(0, wh, w, 24 * rat);
        c.strokeStyle = "#435865";
        c.lineWidth = Math.max(1, rat);
        c.beginPath();
        c.moveTo(0, wh + 0.5 * rat);
        c.lineTo(w, wh + 0.5 * rat);
        c.stroke();
        c.fillStyle = "#8095a3";
        c.font = `${9 * rat}px Arial`;
        c.textBaseline = "top";
        for (let s = Math.ceil(vs); s <= ve_ + 0.001; s++) {
            const x = t2x(s);
            if (x < 0 || x > w) continue;
            c.strokeStyle = "#536b79";
            c.beginPath();
            c.moveTo(x, wh);
            c.lineTo(x, wh + 5 * rat);
            c.stroke();
            c.fillText(s.toFixed(0) + "s", Math.max(2 * rat, Math.min(w - c.measureText(s.toFixed(0) + "s").width - 2 * rat, x - c.measureText(s.toFixed(0) + "s").width / 2)), wh + 7 * rat);
        }
        if (pp && pa) {
            const px = t2x(pa.currentTime);
            if (px >= 0 && px <= w) {
                c.strokeStyle = "#fff";
                c.lineWidth = Math.max(1, rat);
                c.beginPath();
                c.moveTo(px, 0);
                c.lineTo(px, wh);
                c.stroke();
            }
        }
    }

    const upd = () => {
        sv.textContent = start.toFixed(2) + "s";
        ev.textContent = end.toFixed(2) + "s";
        dv.textContent = (end - start).toFixed(2) + "s";
        draw();
    };
    const psec = e => {
        const r = ww.getBoundingClientRect();
        return Math.max(0, Math.min(buf.duration, vs + (e.clientX - r.left) / r.width * (ve_ - vs)));
    };
    const play = async () => {
        if (!pa || end <= start) return;
        pa.currentTime = start;
        try {
            await pa.play();
            pp = true;
            pb.textContent = "⏸";
            const an = () => {
                if (!pp || !pa) return;
                if (pa.currentTime >= end) {
                    stop();
                    return;
                }
                if (pa.currentTime < vs || pa.currentTime > ve_) {
                    const sp = ve_ - vs;
                    vs = Math.max(0, Math.min(buf.duration - sp, pa.currentTime - sp * 0.08));
                    ve_ = Math.min(buf.duration, vs + sp);
                }
                draw();
                phf = requestAnimationFrame(an);
            };
            an();
        } catch {}
    };
    const tp = () => (pp ? stop() : play());
    ww.onwheel = e => {
        if (!buf) return;
        e.preventDefault();
        e.stopPropagation();
        const r = ww.getBoundingClientRect(),
            ar = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
            at = vs + ar * (ve_ - vs),
            cs = ve_ - vs;
        const ms = Math.min(buf.duration, Math.max(0.25, (end - start) / 20)),
            ns = Math.max(ms, Math.min(buf.duration, cs * (e.deltaY < 0 ? 0.8 : 1.25)));
        vs = Math.max(0, Math.min(buf.duration - ns, at - ns * ar));
        ve_ = vs + ns;
        draw();
    };
    ww.onpointerdown = e => {
        if (!buf) return;
        e.preventDefault();
        if (e.button === 1) {
            drg = "view";
            panX = e.clientX;
            panVs = vs;
            ww.setPointerCapture(e.pointerId);
            return;
        }
        if (e.button !== 0) return;
        const was = pp,
            s = psec(e),
            hit = Math.max((ve_ - vs) * 10 / Math.max(1, ww.clientWidth), 0.03);
        if (Math.abs(s - start) <= hit) drg = "start";
        else if (Math.abs(s - end) <= hit) drg = "end";
        else if (s > start && s < end) drg = "sel";
        else drg = Math.abs(s - start) < Math.abs(s - end) ? "start" : "end";
        doX = s;
        ds = start;
        de = end;
        pdx = e.clientX;
        moved = false;
        ww.dataset.wp = was ? "1" : "0";
        ww.setPointerCapture(e.pointerId);
    };
    ww.onpointermove = e => {
        if (!buf || !drg) return;
        if (drg === "view") {
            const sp = ve_ - vs,
                dl = -(e.clientX - panX) / Math.max(1, ww.clientWidth) * sp;
            vs = Math.max(0, Math.min(buf.duration - sp, panVs + dl));
            ve_ = vs + sp;
            draw();
            return;
        }
        const s = psec(e);
        if (drg === "sel" && !moved) {
            if (Math.abs(e.clientX - pdx) < 4) return;
            moved = true;
        }
        if (drg === "start") start = Math.max(0, Math.min(end - minSel, s));
        else if (drg === "end") end = Math.min(buf.duration, Math.max(start + minSel, s));
        else {
            const l = de - ds,
                ns = Math.max(0, Math.min(buf.duration - l, ds + s - doX));
            start = ns;
            end = ns + l;
        }
        upd();
    };
    const fin = e => {
        if (drg === "view") {
            drg = null;
            try {
                ww.releasePointerCapture(e.pointerId);
            } catch {}
            return;
        }
        const cl = drg === "sel" && !moved,
            was = ww.dataset.wp === "1";
        delete ww.dataset.wp;
        drg = null;
        try {
            ww.releasePointerCapture(e.pointerId);
        } catch {}
        if (cl) was ? stop() : play();
    };
    ww.onpointerup = fin;
    ww.onpointercancel = fin;
    pb.onclick = tp;
    syn.onclick = () => {
        if (!buf) return;
        stop();
        let target = 0;
        const vdInput = node.inputs?.find(i => i.name === "video_duration");
        if (vdInput && vdInput.link != null) {
            const link = app.graph.links[vdInput.link];
            const srcNode = app.graph.getNodeById(link.origin_id);
            if (srcNode) {
                const durWidget = srcNode.widgets?.find(w => w.name === "duration");
                if (durWidget && parseFloat(durWidget.value) > 0) target = parseFloat(durWidget.value);
                if (target <= 0 && srcNode.properties?.["duration_seconds"] > 0) target = parseFloat(srcNode.properties["duration_seconds"]);
                if (target <= 0 && srcNode.type === "LoadVideoPGS") {
                    const videoEl = srcNode.widgets?.find(w => w.name === "pgs_video_preview")?.element?.querySelector("video");
                    if (videoEl && videoEl.duration && isFinite(videoEl.duration)) target = videoEl.duration;
                }
            }
        }
        if (target <= 0 || !isFinite(target)) {
            syn.textContent = "⚠ 未检测到视频时长";
            syn.style.background = "#8b5c2a";
            syn.style.color = "#fff";
            setTimeout(() => {
                syn.textContent = "同步视频时长";
                syn.style.background = "";
                syn.style.color = "";
            }, 1500);
            return;
        }
        const audioShorter = buf.duration <= target;
        if (audioShorter) {
            start = 0;
            end = buf.duration;
        } else {
            start = Math.max(0, Math.min(start, buf.duration - target));
            end = Math.min(buf.duration, start + target);
        }
        upd();
        const feedbackText = audioShorter ? `✓ 已全选(音频${buf.duration.toFixed(1)}s < 视频${target.toFixed(1)}s)` : `✓ 已同步至${target.toFixed(1)}s`;
        const originalText = syn.textContent,
            originalBg = syn.style.background;
        syn.textContent = feedbackText;
        syn.style.background = "#0aa4d6";
        syn.style.color = "#fff";
        syn.disabled = true;
        setTimeout(() => {
            syn.textContent = originalText;
            syn.style.background = originalBg;
            syn.style.color = "";
            syn.disabled = false;
        }, 1800);
    };
    svb.onclick = () => {
        if (!buf) return;
        setWidgetValue(node, "trim_start", start);
        setWidgetValue(node, "trim_end", end);
        close();
        node.setDirtyCanvas(true, true);
        if (node._pgsAudioRender) node._pgsAudioRender();
    };
    try {
        buf = await dec(filename);
        if (!document.body.contains(ov)) return;
        start = Number(widgetValue(node, "trim_start", 0)) || 0;
        end = Number(widgetValue(node, "trim_end", 0)) || Math.min(buf.duration, 5);
        if (end <= start) {
            start = 0;
            end = Math.min(buf.duration, Math.max(minSel, 5));
        }
        if (end - start < minSel) {
            start = 0;
            end = Math.min(buf.duration, Math.max(minSel, 5));
        }
        pa = new Audio(fileUrl(filename));
        pa.preload = "auto";
        pa.ontimeupdate = () => {
            if (pp && pa.currentTime >= end) stop();
        };
        pa.onended = () => stop();
        vs = 0;
        ve_ = buf.duration;
        peaks = computePeaks(buf, Math.max(100, ww.clientWidth));
        ld.remove();
        pb.disabled = false;
        svb.disabled = false;
        upd();
        handleResize = () => {
            if (buf) {
                peaks = computePeaks(buf, Math.max(100, ww.clientWidth));
                draw();
            }
        };
        window.addEventListener("resize", handleResize);
    } catch (err) {
        ld.textContent = "解码失败: " + err.message;
        console.error(err);
    }
}