"""FixVedioMask-PGS
图像序列编辑器 + 画笔修复 + 实时混合预览 + 结果锁定。
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import time
import math
from collections import OrderedDict

import folder_paths
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from aiohttp import web
from server import PromptServer

log = logging.getLogger("FixVedioMaskPGS")
WEB_DIRECTORY = "./web/js"

_MAX_CACHE_ENTRIES = 2  # ★ 降低显存占用：原 8 -> 2
_MAX_DRAWING_B64_SIZE = 4 * 1024 * 1024
_PREVIEW_PREFIX = "FVM_"
_GLOBAL_CACHE: "OrderedDict[str, tuple]" = OrderedDict()
_UPLOAD_STATE: dict = {}  # upload_id -> {total, filename, chunks:{idx: bytes}}


def _cache_get(key: str):
    if key in _GLOBAL_CACHE:
        _GLOBAL_CACHE.move_to_end(key)
        return _GLOBAL_CACHE[key]
    return None

def _cache_put(key: str, value) -> None:
    _GLOBAL_CACHE[key] = value
    _GLOBAL_CACHE.move_to_end(key)
    while len(_GLOBAL_CACHE) > _MAX_CACHE_ENTRIES:
        old_key, old_val = _GLOBAL_CACHE.popitem(last=False)
        del old_val

def _cache_pop(key: str) -> None:
    _GLOBAL_CACHE.pop(key, None)

try:
    from .lib.video_io import resolve_video_path as _resolve_video_path
    from .lib.video_io import probe_video_file as _probe_video_file
    _HAVE_VIDEO_IO = True
except Exception as _e:
    _resolve_video_path = None
    _probe_video_file = None
    _HAVE_VIDEO_IO = False
    log.warning(f"FixVedioMaskPGS: video_io 不可用: {_e}")


async def _read_probe_body(request):
    try:
        if request.can_read_body and request.content_type == "application/json":
            return await request.json()
        return dict(request.query)
    except Exception as exc:
        return {"__error": f"Invalid request: {exc}"}


async def probe_video(request):
    body = await _read_probe_body(request)
    if "__error" in body:
        return web.Response(status=400, text=body["__error"])

    video_file = str(body.get("videoFile") or body.get("video_file") or "").strip()
    if not video_file:
        return web.Response(status=400, text="Missing videoFile.")

    subfolder = str(body.get("subfolder") or "").strip()
    vtype = str(body.get("type") or "input").strip() or "input"

    if _HAVE_VIDEO_IO and _resolve_video_path and _probe_video_file:
        try:
            path = _resolve_video_path({"videoFile": video_file, "subfolder": subfolder, "type": vtype})
            info = _probe_video_file(path)
            return web.json_response({
                "width": int(info.get("width") or 0),
                "height": int(info.get("height") or 0),
                "duration": float(info.get("duration") or 0.0),
                "native_fps": float(info.get("native_fps") or 24.0),
                "frame_count": int(info.get("frame_count") or 1),
            })
        except Exception as exc:
            return web.Response(status=400, text=str(exc))
    return web.json_response({"width": 0, "height": 0, "duration": 0, "native_fps": 24, "frame_count": 1})


@PromptServer.instance.routes.post("/fix_vedio_mask/probe_video")
async def route_probe_video_post(request): return await probe_video(request)

@PromptServer.instance.routes.get("/fix_vedio_mask/probe_video")
async def route_probe_video_get(request): return await probe_video(request)


# ★ 新增：分块上传路由（修复 >95MB 视频上传 404 问题）
@PromptServer.instance.routes.post("/fix_vedio_mask/upload_chunk")
async def route_upload_chunk(request):
    try:
        form = await request.post()
    except Exception as exc:
        return web.Response(status=400, text=f"Invalid multipart: {exc}")

    upload_id = str(form.get("upload_id") or "").strip()
    filename = str(form.get("filename") or "video.mp4").strip()
    if not upload_id:
        return web.Response(status=400, text="Missing upload_id")

    try:
        chunk_index = int(form.get("chunk_index"))
        total_chunks = int(form.get("total_chunks"))
    except (TypeError, ValueError):
        return web.Response(status=400, text="Invalid chunk_index/total_chunks")

    chunk_field = form.get("chunk")
    if chunk_field is None:
        return web.Response(status=400, text="Missing chunk")
    try:
        chunk_bytes = chunk_field.file.read() if hasattr(chunk_field, "file") else bytes(chunk_field)
    except Exception as exc:
        return web.Response(status=400, text=f"Cannot read chunk: {exc}")

    state = _UPLOAD_STATE.get(upload_id)
    if state is None:
        state = {"total": total_chunks, "filename": filename, "chunks": {}}
        _UPLOAD_STATE[upload_id] = state
    state["chunks"][chunk_index] = chunk_bytes
    received = len(state["chunks"])

    if received < state["total"]:
        return web.json_response({"ok": True, "received": received, "total": state["total"]})

    # 拼接并保存到 input 目录
    try:
        data_bytes = b"".join(state["chunks"].get(i, b"") for i in range(state["total"]))
    finally:
        _UPLOAD_STATE.pop(upload_id, None)

    base = folder_paths.get_input_directory()
    safe_name = os.path.basename(filename) or "video.mp4"
    final_name = f"fvm_upload_{int(time.time()*1000)}_{safe_name}"
    final_path = os.path.join(base, final_name)
    try:
        with open(final_path, "wb") as f:
            f.write(data_bytes)
    except OSError as exc:
        return web.Response(status=500, text=f"Write failed: {exc}")

    return web.json_response({
        "name": final_name,
        "filename": final_name,
        "subfolder": "",
        "type": "input",
    })


@PromptServer.instance.routes.post("/fix_vedio_mask/clear_cache")
async def route_clear_cache(request):
    try:
        body = await request.json() if request.can_read_body else {}
    except Exception:
        body = {}
    uid = str((body or {}).get("unique_id") or "").strip()
    if uid: _cache_pop(uid)
    else: _GLOBAL_CACHE.clear()
    return web.json_response({"ok": True, "cache_size": len(_GLOBAL_CACHE)})


# ────────── 节点 ──────────

class FixVedioMaskPGSNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "PoseMask": ("IMAGE", {"lazy": True}),
                "PoseRef": ("IMAGE", {"lazy": True}),
                "timeline_data": ("STRING", {"default": "", "multiline": True}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    OUTPUT_IS_LIST = (True,)
    OUTPUT_NODE = True
    FUNCTION = "execute"
    CATEGORY = "FixVedioMask/PGS"

    def check_lazy_status(self, timeline_data="", unique_id="", PoseRef=None, PoseMask=None):
        timeline = {}
        if timeline_data and str(timeline_data).strip():
            try: timeline = json.loads(timeline_data)
            except Exception: pass

        is_locked = bool(timeline.get("lockResult", False))
        key = str(unique_id) if unique_id else ""

        if not is_locked and key: _cache_pop(key)

        if is_locked and key:
            cached = _cache_get(key)
            if cached is not None and (cached[0] is not None or cached[1] is not None):
                return []

        need = []
        if PoseRef is None: need.append("PoseRef")
        if PoseMask is None: need.append("PoseMask")
        return need

    def execute(self, PoseRef=None, PoseMask=None, timeline_data="", unique_id=""):
        timeline = {}
        if timeline_data and str(timeline_data).strip():
            try: timeline = json.loads(timeline_data)
            except json.JSONDecodeError: pass

        is_locked = bool(timeline.get("lockResult", False))
        key = str(unique_id) if unique_id else ""

        if is_locked and key:
            cached = _cache_get(key)
            if cached is not None and (cached[0] is not None or cached[1] is not None):
                PoseMask, PoseRef = cached
            elif PoseMask is not None or PoseRef is not None:
                _cache_put(key, (PoseMask, PoseRef))
            else:
                log.warning(f"FixVedioMaskPGS: 节点 {key} 已锁定但无缓存。")

        output_block = timeline.get("output") or {}
        blend_mode = str(output_block.get("blendMode") or "normal").lower()
        blend_opacity = float(output_block.get("blendOpacity", 100)) / 100.0
        grayscale = bool(output_block.get("grayscale", False))
        levels = output_block.get("levels") or {} 
        blur = float(output_block.get("blur", 0.0))
        
        segments = timeline.get("segments") or []
        total_frames = int(timeline.get("totalFrames") or 0)
        source_frame_count = int((timeline.get("video") or {}).get("sourceFrameCount") or 0)
        drawings = timeline.get("drawings") or {}

        output_images = []
        sliced_mask = None
        sliced_ref = None

        if PoseMask is not None or PoseRef is not None:
            def slice_tensor(tensor):
                if tensor is None: return None
                if not segments: return tensor.clone()
                if source_frame_count > 0 and tensor.shape[0] != source_frame_count: return tensor.clone()
                if source_frame_count <= 0 and tensor.shape[0] != total_frames: return tensor.clone()
                sliced = []
                for seg in segments:
                    start = int(seg.get("start") or 0)
                    length = int(seg.get("length") or seg.get("frameCount") or 0)
                    if length > 0:
                        end = min(start + length, tensor.shape[0])
                        if end > start: sliced.append(tensor[start:end])
                return torch.cat(sliced, dim=0) if sliced else tensor.clone()

            sliced_mask = slice_tensor(PoseMask) if PoseMask is not None else None
            sliced_ref = slice_tensor(PoseRef) if PoseRef is not None else None

            # 深度拷贝一份纯净的原图（ID层）用于前端显示，不加涂鸦不加滤镜
            raw_mask_for_ui = sliced_mask.clone() if sliced_mask is not None else None
            raw_ref_for_ui = sliced_ref.clone() if sliced_ref is not None else None

            if sliced_mask is not None and drawings:
                for frame_str, b64_data in drawings.items():
                    try: frame_idx = int(frame_str)
                    except (TypeError, ValueError): continue
                    if frame_idx < 0 or frame_idx >= sliced_mask.shape[0]: continue
                    if not isinstance(b64_data, str) or not b64_data: continue
                    if len(b64_data) > _MAX_DRAWING_B64_SIZE: continue
                    if "," in b64_data: b64_data = b64_data.split(",", 1)[1]

                    try:
                        img_data = base64.b64decode(b64_data)
                        draw_img = Image.open(io.BytesIO(img_data)).convert("RGBA")
                        target_h, target_w = sliced_mask.shape[1:3]
                        draw_img = draw_img.resize((target_w, target_h), Image.Resampling.NEAREST)
                        alpha = draw_img.split()[3]
                        alpha_np = np.array(alpha).astype(np.float32) / 255.0
                        draw_rgb = np.array(draw_img.convert("RGB")) / 255.0
                        target_frame = sliced_mask[frame_idx].cpu().numpy()
                        if target_frame.ndim == 2: target_frame = target_frame[..., None]
                        if target_frame.shape[-1] == 1 and draw_rgb.shape[-1] == 3:
                            draw_rgb = draw_rgb.mean(axis=-1, keepdims=True)
                        elif target_frame.shape[-1] == 3 and draw_rgb.shape[-1] == 4:
                            draw_rgb = draw_rgb[..., :3]
                        alpha_np = alpha_np[..., None]
                        target_frame = target_frame * (1.0 - alpha_np) + draw_rgb * alpha_np
                        if sliced_mask[frame_idx].ndim == 2: target_frame = target_frame.squeeze(-1)
                        sliced_mask[frame_idx] = torch.from_numpy(np.ascontiguousarray(target_frame)).to(sliced_mask.device, dtype=sliced_mask.dtype)
                    except Exception as e:
                        log.warning(f"处理涂鸦出错 (frame={frame_idx}): {e}")

            if sliced_mask is not None and sliced_ref is not None:
                if sliced_ref.shape[1:3] != sliced_mask.shape[1:3]:
                    sliced_ref = F.interpolate(
                        sliced_ref.permute(0, 3, 1, 2),
                        size=(sliced_mask.shape[1], sliced_mask.shape[2]),
                        mode='bilinear', align_corners=False,
                    ).permute(0, 2, 3, 1)
                
                # ★ 滤镜顺序：模糊 -> 去色 -> 色阶（作用于整个组）
                if blur > 0:
                    sliced_mask = self._apply_blur(sliced_mask, blur)

                if grayscale and sliced_mask.shape[-1] >= 3:
                    gray = (0.299 * sliced_mask[..., 0:1] + 0.587 * sliced_mask[..., 1:2] + 0.114 * sliced_mask[..., 2:3])
                    sliced_mask = gray.repeat(1, 1, 1, sliced_mask.shape[-1])

                if levels:
                    sliced_mask = self._apply_levels(sliced_mask, levels)

                output_images.append(self._blend_images(sliced_ref, sliced_mask, blend_mode, blend_opacity))
            elif sliced_mask is not None:
                out_mask = sliced_mask
                if blur > 0:
                    out_mask = self._apply_blur(out_mask, blur)
                if grayscale and out_mask.shape[-1] >= 3:
                    gray = (0.299 * out_mask[..., 0:1] + 0.587 * out_mask[..., 1:2] + 0.114 * out_mask[..., 2:3])
                    out_mask = gray.repeat(1, 1, 1, out_mask.shape[-1])
                if levels:
                    out_mask = self._apply_levels(out_mask, levels)
                output_images.append(out_mask)
            elif sliced_ref is not None:
                output_images.append(sliced_ref)

        if not output_images:
            output_images.append(torch.zeros((1, 64, 64, 3), dtype=torch.float32))

        masks_b64, refs_b64 = self._prepare_ui_images(key, raw_mask_for_ui, raw_ref_for_ui)
        return {"ui": {"preview_masks": masks_b64, "preview_refs": refs_b64}, "result": (output_images,)}

    def _apply_levels(self, tensor, levels):
        black = float(levels.get("black", 0))
        mid = float(levels.get("mid", 128))
        white = float(levels.get("white", 255))
        
        if black == 0 and mid == 128 and white == 255:
            return tensor
            
        b = max(0.0, min(1.0, black / 255.0))
        w = max(b + 0.001, min(1.0, white / 255.0))
        m = max(b + 0.001, min(w - 0.001, mid / 255.0))
        
        norm_mid = (m - b) / (w - b)
        gamma = math.log(0.5) / math.log(norm_mid) if 0 < norm_mid < 1 else 1.0
        
        out = (tensor - b) / (w - b)
        out = torch.clamp(out, 0.0, 1.0)
        out = out ** (1.0 / gamma)
        return out

    def _apply_blur(self, tensor, radius):
        if radius <= 0:
            return tensor
        b, h, w, c = tensor.shape
        tensor = tensor.permute(0, 3, 1, 2) # B, C, H, W
        k = int(radius * 2 + 1)
        if k % 2 == 0: k += 1
        pad = k // 2
        out = F.avg_pool2d(F.pad(tensor, (pad, pad, pad, pad), mode='reflect'), k, stride=1)
        return out.permute(0, 2, 3, 1)

    def _prepare_ui_images(self, node_key: str, sliced_mask, sliced_ref):
        masks_b64 = []
        refs_b64 = []
        temp_dir = folder_paths.get_temp_directory()
        timestamp = int(time.time() * 1000)
        safe_key = "anon" if not node_key else "".join(ch for ch in str(node_key) if ch.isalnum() or ch in ("-", "_")) or "anon"
        prefix = f"{_PREVIEW_PREFIX}{safe_key}_"
        try:
            for name in os.listdir(temp_dir):
                if name.startswith(prefix):
                    try: os.remove(os.path.join(temp_dir, name))
                    except OSError: pass
        except OSError: pass

        def save_sequence(tensor, tag):
            if tensor is None: return []
            disp = tensor
            if disp.shape[-1] == 1: disp = disp.repeat(1, 1, 1, 3)
            elif disp.shape[-1] > 3: disp = disp[..., :3]
            out = []
            for i in range(disp.shape[0]):
                arr = (disp[i].cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                pil_img = Image.fromarray(arr)
                filename = f"{prefix}{tag}_{timestamp}_{i}.png"
                pil_img.save(os.path.join(temp_dir, filename))
                out.append({"filename": filename, "subfolder": "", "type": "temp"})
            return out

        masks_b64 = save_sequence(sliced_mask, "mask")
        refs_b64 = save_sequence(sliced_ref, "ref")
        return masks_b64, refs_b64

    def _blend_images(self, bg, fg, mode, opacity):
        bg, fg, opacity = bg.float(), fg.float(), max(0.0, min(1.0, opacity))
        if bg.shape[1:3] != fg.shape[1:3]:
            fg = F.interpolate(fg.permute(0, 3, 1, 2), size=(bg.shape[1], bg.shape[2]), mode='bilinear', align_corners=False).permute(0, 2, 3, 1)

        b = max(bg.shape[0], fg.shape[0])
        if bg.shape[0] < b: bg = torch.cat([bg, bg[-1:].expand(b - bg.shape[0], -1, -1, -1)], dim=0)
        elif bg.shape[0] > b: bg = bg[:b]
        if fg.shape[0] < b: fg = torch.cat([fg, fg[-1:].expand(b - fg.shape[0], -1, -1, -1)], dim=0)
        elif fg.shape[0] > b: fg = fg[:b]

        if mode == "normal": out = fg
        elif mode == "multiply": out = fg * bg
        elif mode == "screen": out = 1.0 - (1.0 - fg) * (1.0 - bg)
        elif mode == "overlay": out = torch.where(bg < 0.5, 2.0 * bg * fg, 1.0 - 2.0 * (1.0 - bg) * (1.0 - fg))
        elif mode == "soft_light": out = (1.0 - 2.0 * fg) * bg ** 2 + 2.0 * fg * bg
        elif mode == "hard_light": out = torch.where(fg < 0.5, 2.0 * fg * bg, 1.0 - 2.0 * (1.0 - fg) * (1.0 - bg))
        else: out = fg
        return out * opacity + bg * (1.0 - opacity)


NODE_CLASS_MAPPINGS = {"FixVedioMask-PGS": FixVedioMaskPGSNode}
NODE_DISPLAY_NAME_MAPPINGS = {"FixVedioMask-PGS": "FixVedioMask-PGS"}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]