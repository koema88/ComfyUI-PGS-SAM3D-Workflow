import os
import re
import json
import asyncio
import torch
import numpy as np
import folder_paths
import av
import cv2
from server import PromptServer
from aiohttp import web
import comfy.utils

# ================= 安全限制配置 =================
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"}
MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB
# ================================================

def _read_and_write_file_chunk(file, file_path, mode):
    chunk_bytes = file.file.read()
    with open(file_path, mode) as f:
        f.write(chunk_bytes)

def _sanitize_upload_name(name):
    if not name: return "upload"
    base = os.path.basename(str(name).replace("\\", "/"))
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base).strip()
    if not base or base in (".", ".."): base = "upload"
    if len(base) > 200:
        stem, ext = os.path.splitext(base)
        base = stem[:200 - len(ext)] + ext
    return base

@PromptServer.instance.routes.post("/loadref_pgs_upload_chunk")
async def loadref_pgs_upload_chunk(request):
    post = await request.post()
    file = post.get("file")
    filename = post.get("filename")
    chunk_index = int(post.get("chunk_index"))
    total_chunks = int(post.get("total_chunks"))
    total_size = int(post.get("total_size", 0))

    safe_name = _sanitize_upload_name(filename)
    
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return web.json_response({"error": f"不支持的文件类型: {ext}"}, status=400)
    
    if total_size > MAX_FILE_SIZE:
        return web.json_response({"error": "文件过大，超过 2GB 限制"}, status=413)

    upload_dir = folder_paths.get_input_directory()
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, safe_name)

    mode = "ab" if chunk_index > 0 else "wb"
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _read_and_write_file_chunk, file, file_path, mode)

    if chunk_index == total_chunks - 1:
        return web.json_response({"name": safe_name})
    return web.json_response({"status": "ok"})


class LoadVideoPGS:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "filename": ("STRING", {"default": "", "multiline": False}),
                "start_time": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100000.0, "step": 0.01}),
                "end_time": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100000.0, "step": 0.01}),
                "duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 100000.0, "step": 0.01}),
                "start_frame": ("INT", {"default": 0, "min": 0, "max": 10000000, "step": 1}),
                "end_frame": ("INT", {"default": 0, "min": 0, "max": 10000000, "step": 1}),
                "duration_frames": ("INT", {"default": 0, "min": 0, "max": 10000000, "step": 1}),
                "frame_rate": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 120.0, "step": 0.001}),
                "display_mode": (["seconds", "frames"], {"default": "seconds"}),
                "resize_method": (["maintain aspect ratio", "stretch to fit", "pad", "crop"], {"default": "maintain aspect ratio"}),
                "custom_width": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "custom_height": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 8}),
                "multiple": ("INT", {"default": 32, "min": 1, "max": 256, "step": 1, "tooltip": "长宽整除倍数"}),
                "crop_x": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_y": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_w": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "crop_h": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "segment_plan_json": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {
                "segment_index": ("INT", {"default": -1, "min": -1, "max": 9999, "step": 1, "forceInput": True}),
            }
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "STRING")
    RETURN_NAMES = ("frames", "audio", "video_info")
    FUNCTION = "load_video"
    CATEGORY = "PGS/Import"

    def load_video(self, filename, start_time, end_time, duration, start_frame, end_frame, duration_frames,
                   frame_rate, display_mode, resize_method, custom_width, custom_height, multiple,
                   crop_x, crop_y, crop_w, crop_h,
                   segment_plan_json="", segment_index=-1, **kwargs):
        
        # ================= 修复：强制检查 filename =================
        if not filename or filename == "(none)" or str(filename).strip() == "":
            filename = kwargs.get("filename", "")
            
        if not filename or filename == "(none)" or str(filename).strip() == "":
            print(f"[LoadVideoPGS] ❌ 缺少文件名。收到的完整 kwargs: {kwargs}")
            raise ValueError("请先上传视频文件（系统未检测到有效文件名）")
        # ==========================================================

        video_path = filename
        if not os.path.exists(video_path):
            video_path = folder_paths.get_annotated_filepath(filename)
            if not os.path.exists(video_path):
                video_path = os.path.join(folder_paths.get_input_directory(), filename)
                if not os.path.exists(video_path):
                    raise FileNotFoundError(f"视频文件未找到: {filename}")

        try:
            seg_index_int = int(segment_index) if segment_index is not None else -1
        except (TypeError, ValueError):
            seg_index_int = -1

        container = None
        try:
            container = av.open(video_path)
            video_stream = container.streams.video[0] if len(container.streams.video) > 0 else None
            if video_stream is None:
                raise ValueError("视频文件中没有视频流")

            video_duration = 0
            if video_stream.duration and video_stream.time_base:
                video_duration = float(video_stream.duration * video_stream.time_base)
            orig_w = video_stream.codec_context.width if video_stream.codec_context else 512
            orig_h = video_stream.codec_context.height if video_stream.codec_context else 512

            try:
                from av.video.reformatter import Colorspace, ColorRange
                fallback_cs = Colorspace.ITU709 if max(orig_w, orig_h) >= 720 else Colorspace.ITU601
                fallback_cr = ColorRange.MPEG
                dst_range = ColorRange.JPEG
            except ImportError:
                fallback_cs = "itu709" if max(orig_w, orig_h) >= 720 else "itu601"
                fallback_cr = "mpeg"
                dst_range = "jpeg"

            src_colorspace = fallback_cs
            src_color_range = fallback_cr
            if video_stream.codec_context:
                cc = video_stream.codec_context
                c_space = getattr(cc, 'colorspace', getattr(cc, 'color_space', None))
                if c_space is not None and hasattr(c_space, 'name') and c_space.name != "UNSPECIFIED":
                    src_colorspace = c_space
                c_range = getattr(cc, 'color_range', None)
                if c_range is not None and hasattr(c_range, 'name') and c_range.name != "UNSPECIFIED":
                    src_color_range = c_range

            # ══════════════ 分段规划覆盖 ══════════════
            seg_overridden = False
            seg_info = None
            plan = {}
            if segment_plan_json:
                try:
                    plan = json.loads(segment_plan_json)
                except Exception:
                    plan = {}

            if seg_index_int >= 0:
                segs = plan.get("segments") or []
                idx = seg_index_int

                if len(segs) == 0:
                    print(f"[LoadVideoPGS] ⚠ segment_index={idx} 已连接，但分段计划为空，已忽略索引。")
                elif idx >= len(segs):
                    raise ValueError(f"segment_index {idx} 超出范围 (0~{len(segs)-1})")
                else:
                    seg = segs[idx]
                    plan_fps = float(plan.get("fps", 24))
                    ctx = int(plan.get("context_frames", 0))
                    out_mode = plan.get("output_mode", "delivered")

                    seg_start_frame = int(seg["start"])
                    seg_end_frame = int(seg["end"])

                    # 核心修复：如果是 delivered 模式，跳过前面重叠的 ctx 帧
                    if out_mode == "delivered" and ctx > 0:
                        seg_start_frame = min(seg_start_frame + ctx, seg_end_frame)

                    if seg_start_frame >= seg_end_frame:
                        raise ValueError(f"第 {idx+1} 段（索引 {idx}）没有有效帧")

                    actual_start_time = seg_start_frame / plan_fps
                    actual_end_time = seg_end_frame / plan_fps
                    seg_overridden = True
                    seg_info = {
                        "idx": idx, "total": len(segs),
                        "start_frame": seg_start_frame, "end_frame": seg_end_frame,
                        "raw_start_frame": int(seg["start"]), "raw_end_frame": int(seg["end"]),
                        "context_frames": ctx, "out_mode": out_mode, "preset": plan.get("preset", "none"),
                    }
                    print(f"[LoadVideoPGS] 分段模式: 索引={idx+1}/{len(segs)}，帧 {seg_start_frame}~{seg_end_frame}，模式={out_mode}")

            if not seg_overridden:
                if display_mode == "frames":
                    fr = float(frame_rate) if frame_rate > 0 else 24.0
                    actual_start_time = float(start_frame) / fr
                    if end_frame > 0 and end_frame > start_frame:
                        actual_end_time = float(end_frame) / fr
                    elif duration_frames > 0:
                        actual_end_time = actual_start_time + (duration_frames / fr)
                    else:
                        actual_end_time = video_duration
                else:
                    actual_start_time = max(0.0, start_time)
                    if end_time > 0 and end_time > start_time:
                        actual_end_time = end_time
                    elif duration > 0:
                        actual_end_time = actual_start_time + duration
                    else:
                        actual_end_time = video_duration

                if actual_end_time <= 0 or actual_end_time > video_duration:
                    actual_end_time = video_duration
                if actual_start_time >= actual_end_time:
                    actual_start_time = 0
                    actual_end_time = video_duration

            manual_crop_left = int(orig_w * crop_x)
            manual_crop_top = int(orig_h * crop_y)
            manual_crop_right = orig_w - int(orig_w * (crop_x + crop_w))
            manual_crop_bottom = orig_h - int(orig_h * (crop_y + crop_h))
            manual_crop_left = max(0, min(manual_crop_left, orig_w - 1))
            manual_crop_top = max(0, min(manual_crop_top, orig_h - 1))
            manual_crop_right = max(0, min(manual_crop_right, orig_w - manual_crop_left - 1))
            manual_crop_bottom = max(0, min(manual_crop_bottom, orig_h - manual_crop_top - 1))
            cropped_orig_w = orig_w - manual_crop_left - manual_crop_right
            cropped_orig_h = orig_h - manual_crop_top - manual_crop_bottom

            target_w = custom_width if custom_width > 0 else cropped_orig_w
            target_h = custom_height if custom_height > 0 else cropped_orig_h
            
            multiple = max(1, multiple)
            target_w = max(multiple, (target_w // multiple) * multiple)
            target_h = max(multiple, (target_h // multiple) * multiple)

            scale_w, scale_h = target_w, target_h
            pad_left = pad_right = pad_top = pad_bottom = 0
            crop_left = crop_right = crop_top = crop_bottom = 0

            if custom_width > 0 or custom_height > 0:
                if resize_method in ["maintain aspect ratio", "pad"]:
                    ratio = min(target_w / cropped_orig_w, target_h / cropped_orig_h)
                    scale_w = max(multiple, (int(cropped_orig_w * ratio) // multiple) * multiple)
                    scale_h = max(multiple, (int(cropped_orig_h * ratio) // multiple) * multiple)
                    if resize_method == "pad":
                        pad_x = target_w - scale_w
                        pad_y = target_h - scale_h
                        pad_left = pad_x // 2
                        pad_right = pad_x - pad_left
                        pad_top = pad_y // 2
                        pad_bottom = pad_y - pad_top
                    else:
                        target_w, target_h = scale_w, scale_h
                elif resize_method == "crop":
                    ratio = max(target_w / cropped_orig_w, target_h / cropped_orig_h)
                    scale_w = max(multiple, (int(cropped_orig_w * ratio) // multiple + 1) * multiple)
                    scale_h = max(multiple, (int(cropped_orig_h * ratio) // multiple + 1) * multiple)
                    crop_x_px = scale_w - target_w
                    crop_y_px = scale_h - target_h
                    crop_left = crop_x_px // 2
                    crop_right = crop_x_px - crop_left
                    crop_top = crop_y_px // 2
                    crop_bottom = crop_y_px - crop_top

            # ══════════════ 视频解码 ══════════════
            frame_interval = 1.0 / float(frame_rate) if frame_rate > 0 else 1.0 / 24.0
            expected_frames = max(1, int(round((actual_end_time - actual_start_time) * frame_rate)))
            max_duplicates = max(1, int(frame_rate * 0.5))

            pbar = comfy.utils.ProgressBar(expected_frames) if expected_frames > 0 else None

            video_stream.thread_type = "AUTO"
            if video_stream.time_base:
                seek_pts = int(actual_start_time / float(video_stream.time_base))
            else:
                seek_pts = int(actual_start_time * av.time_base)
            
            try:
                container.seek(seek_pts, stream=video_stream, backward=True)
            except Exception as e:
                print(f"[LoadVideoPGS] Seek 失败，改为从头解码: {e}")
                container.seek(0, stream=video_stream, backward=True)

            collected_frames = []
            frames_loaded = 0
            next_sample_time = actual_start_time

            for frame in container.decode(video_stream):
                frame_time = frame.time
                if frame_time is None and frame.pts is not None and video_stream.time_base:
                    frame_time = float(frame.pts * video_stream.time_base)
                if frame_time is None:
                    frame_time = 0.0

                if frame_time < actual_start_time:
                    continue
                if frame_time > actual_end_time + frame_interval:
                    break

                try:
                    frame = frame.reformat(
                        format="rgb24",
                        src_colorspace=src_colorspace,
                        src_color_range=src_color_range,
                        dst_color_range=dst_range
                    )
                    frame_rgb = frame.to_ndarray(format='rgb24')
                except Exception:
                    frame_rgb = frame.to_ndarray(format='rgb24')

                if manual_crop_left > 0 or manual_crop_top > 0 or manual_crop_right > 0 or manual_crop_bottom > 0:
                    frame_rgb = frame_rgb[manual_crop_top:orig_h - manual_crop_bottom,
                                          manual_crop_left:orig_w - manual_crop_right, :]

                if scale_w != cropped_orig_w or scale_h != cropped_orig_h:
                    frame_rgb = cv2.resize(frame_rgb, (scale_w, scale_h), interpolation=cv2.INTER_AREA)

                if crop_left > 0 or crop_top > 0 or crop_right > 0 or crop_bottom > 0:
                    frame_rgb = frame_rgb[crop_top:scale_h - crop_bottom, crop_left:scale_w - crop_right, :]

                if pad_left > 0 or pad_top > 0 or pad_right > 0 or pad_bottom > 0:
                    frame_rgb = np.pad(frame_rgb, ((pad_top, pad_bottom), (pad_left, pad_right), (0, 0)),
                                       mode='constant', constant_values=0)

                duplicate_count = 0
                while (next_sample_time <= frame_time
                       and next_sample_time < actual_end_time
                       and frames_loaded < expected_frames):
                    collected_frames.append(torch.from_numpy(frame_rgb).float().div_(255.0))
                    frames_loaded += 1
                    next_sample_time += frame_interval
                    duplicate_count += 1
                    if duplicate_count >= max_duplicates:
                        next_sample_time = frame_time + frame_interval
                        break
                    if pbar:
                        pbar.update(1)

                if frames_loaded >= expected_frames:
                    break

            if not collected_frames:
                final_h = target_h if target_h > 0 else cropped_orig_h
                final_w = target_w if target_w > 0 else cropped_orig_w
                image_tensor = torch.zeros((1, final_h, final_w, 3), dtype=torch.float32)
            else:
                image_tensor = torch.stack(collected_frames)

            # ══════════════ 音频提取 ══════════════
            target_sample_rate = 22050
            max_audio_seconds = 300
            audio_dict = {"waveform": torch.zeros((1, 2, target_sample_rate), dtype=torch.float32), "sample_rate": target_sample_rate}
            has_audio = False
            if len(container.streams.audio) > 0:
                try:
                    audio_stream = container.streams.audio[0]
                    audio_stream.thread_type = "AUTO"
                    resampler = av.AudioResampler(format='fltp', layout='stereo', rate=target_sample_rate)
                    audio_chunks = []
                    if audio_stream.time_base:
                        seek_pts = int(actual_start_time / float(audio_stream.time_base))
                    else:
                        seek_pts = int(actual_start_time * av.time_base)
                    
                    try:
                        container.seek(seek_pts, stream=audio_stream, backward=True)
                    except Exception:
                        container.seek(0, stream=audio_stream, backward=True)

                    real_start = None
                    for frame in container.decode(audio_stream):
                        if frame.pts is not None and audio_stream.time_base:
                            frame_time = float(frame.pts * audio_stream.time_base)
                        else:
                            frame_time = frame.time or 0.0
                        if frame_time > actual_end_time + 1.0:
                            break
                        if frame_time < actual_start_time:
                            continue
                        if real_start is None:
                            real_start = frame_time
                        for r_frame in resampler.resample(frame):
                            audio_chunks.append(r_frame.to_ndarray())

                    if audio_chunks:
                        waveform = np.concatenate(audio_chunks, axis=1)
                        if real_start is not None and real_start < actual_start_time:
                            head = int((actual_start_time - real_start) * target_sample_rate)
                            if head > 0 and waveform.shape[1] > head:
                                waveform = waveform[:, head:]
                        target_samples = int((actual_end_time - actual_start_time) * target_sample_rate)
                        if target_samples <= 0:
                            waveform = np.zeros((2, 0), dtype=np.float32)
                        else:
                            waveform = waveform[:, :target_samples]
                        max_samples = int(max_audio_seconds * target_sample_rate)
                        if waveform.shape[1] > max_samples:
                            waveform = waveform[:, :max_samples]
                        if waveform.shape[1] == 0:
                            waveform = np.zeros((2, target_sample_rate), dtype=np.float32)
                        audio_dict = {"waveform": torch.from_numpy(waveform).unsqueeze(0), "sample_rate": target_sample_rate}
                        has_audio = True
                except Exception as e:
                    print(f"[LoadVideoPGS] 音频提取失败: {e}")

            final_duration = float(max(0.0, actual_end_time - actual_start_time))
            frame_count = image_tensor.shape[0]

            # 构建信息字典并 JSON 序列化
            seg_lines = []
            if seg_overridden and seg_info is not None:
                si = seg_info
                out_mode_cn = "仅新增帧（无重叠）" if si["out_mode"] == "delivered" else "含上下文（相邻重叠）"
                preset_cn = "MiniMax H3" if si.get("preset") == "minimaxh3" else "自由"
                seg_len_frames = si["end_frame"] - si["start_frame"]
                
                seg_lines.append(f"当前运行段：第 {si['idx'] + 1} 段 / 共 {si['total']} 段")
                seg_lines.append(f"当前段时间：{actual_start_time:.2f}s → {actual_end_time:.2f}s（{final_duration:.2f}s）")
                seg_lines.append(f"当前段帧号：{si['start_frame']} → {si['end_frame']}（段长 {seg_len_frames} 帧）")
                seg_lines.append(f"模式：{out_mode_cn} · {preset_cn}")
                seg_lines.append(f"--- 所有分段信息 ---")
                
                segs = plan.get("segments", [])
                plan_fps = float(plan.get("fps", 24))
                for i, sg in enumerate(segs):
                    s_frame = int(sg["start"])
                    e_frame = int(sg["end"])
                    s_time = s_frame / plan_fps
                    e_time = e_frame / plan_fps
                    seg_lines.append(f"#{i+1}: 帧 {s_frame} ~ {e_frame} | 时间 {s_time:.2f}s ~ {e_time:.2f}s | 时长 {(e_frame - s_frame)/plan_fps:.2f}s")
                
                segment_info_text = "\n".join(seg_lines)
            else:
                segment_info_text = f"手动模式\n时间：{actual_start_time:.2f}s → {actual_end_time:.2f}s（{final_duration:.2f}s）\n帧数：{frame_count}"

            info_dict = {
                "fps": float(frame_rate),
                "frame_count": int(frame_count),
                "duration": float(final_duration),
                "width": int(image_tensor.shape[2]),
                "height": int(image_tensor.shape[1]),
                "segment_info": segment_info_text
            }
            video_info = json.dumps(info_dict, ensure_ascii=False, indent=2)

            return (image_tensor, audio_dict, video_info)
        finally:
            if container is not None:
                container.close()


class LoadAudioPGS:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "filename": ("STRING", {"default": "", "multiline": False}),
                "trim_start": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 3600.0, "step": 0.01}),
                "trim_end": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 3600.0, "step": 0.01}),
            },
            "optional": {
                "video_duration": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 3600.0, "step": 0.01, "forceInput": True}),
            }
        }

    RETURN_TYPES = ("AUDIO", "STRING")
    RETURN_NAMES = ("audio", "audio_info")
    FUNCTION = "load_audio"
    CATEGORY = "PGS/Import"

    def load_audio(self, filename="", trim_start=0.0, trim_end=0.0, video_duration=0.0):
        if not filename or filename == "(none)":
            raise ValueError("请先上传音频文件")
        if not os.path.exists(filename):
            filename = folder_paths.get_annotated_filepath(filename)
        if not os.path.exists(filename):
            raise FileNotFoundError(f"音频文件未找到: {filename}")

        container = None
        try:
            container = av.open(filename)
            audio_stream = container.streams.audio[0] if len(container.streams.audio) > 0 else None
            if audio_stream is None:
                raise ValueError("音频文件中没有音频流")

            target_sample_rate = 22050
            max_audio_seconds = 300
            resampler = av.AudioResampler(format='fltp', layout='stereo', rate=target_sample_rate)
            audio_chunks = []
            if audio_stream.time_base:
                seek_pts = int(trim_start / float(audio_stream.time_base))
            else:
                seek_pts = int(trim_start * av.time_base)
            
            try:
                container.seek(seek_pts, stream=audio_stream, backward=True)
            except Exception:
                container.seek(0, stream=audio_stream, backward=True)

            real_start = None
            for frame in container.decode(audio_stream):
                if frame.pts is not None and audio_stream.time_base:
                    frame_time = float(frame.pts * audio_stream.time_base)
                else:
                    frame_time = frame.time or 0.0
                if trim_end > trim_start and frame_time > trim_end + 1.0:
                    break
                if frame_time < trim_start:
                    continue
                if real_start is None:
                    real_start = frame_time
                for r_frame in resampler.resample(frame):
                    audio_chunks.append(r_frame.to_ndarray())

            if not audio_chunks:
                waveform = np.zeros((2, 0), dtype=np.float32)
            else:
                waveform = np.concatenate(audio_chunks, axis=1)
                if real_start is not None and real_start < trim_start:
                    head = int((trim_start - real_start) * target_sample_rate)
                    if head > 0 and waveform.shape[1] > head:
                        waveform = waveform[:, head:]
                if trim_end > trim_start:
                    target_samples = int((trim_end - trim_start) * target_sample_rate)
                else:
                    target_samples = waveform.shape[1]
                if target_samples <= 0:
                    waveform = np.zeros((2, 0), dtype=np.float32)
                else:
                    waveform = waveform[:, :target_samples]
                max_samples = int(max_audio_seconds * target_sample_rate)
                if waveform.shape[1] > max_samples:
                    waveform = waveform[:, :max_samples]
                if waveform.shape[1] == 0:
                    waveform = np.zeros((2, target_sample_rate), dtype=np.float32)

            sliced = torch.from_numpy(waveform).unsqueeze(0)
            info = json.dumps({
                "filename": os.path.basename(filename),
                "original_duration_seconds": float(waveform.shape[1] / target_sample_rate),
                "trimmed_duration_seconds": float(waveform.shape[1] / target_sample_rate),
                "sample_rate": target_sample_rate,
                "start_seconds": float(trim_start),
                "end_seconds": float(trim_end if trim_end > trim_start else waveform.shape[1] / target_sample_rate),
            }, ensure_ascii=False, indent=2)

            return ({"waveform": sliced, "sample_rate": target_sample_rate}, info)
        finally:
            if container is not None:
                container.close()


class VideoInfo:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_info": ("STRING", {"default": "", "multiline": False, "forceInput": True}),
            }
        }

    RETURN_TYPES = ("FLOAT", "INT", "FLOAT", "INT", "INT", "STRING")
    RETURN_NAMES = ("fps", "frame_count", "duration", "width", "height", "segment_info")
    FUNCTION = "get_info"
    CATEGORY = "PGS/Info"

    def get_info(self, video_info):
        try:
            data = json.loads(video_info)
            return (
                float(data.get("fps", 0.0)),
                int(data.get("frame_count", 0)),
                float(data.get("duration", 0.0)),
                int(data.get("width", 0)),
                int(data.get("height", 0)),
                str(data.get("segment_info", "无分段信息"))
            )
        except Exception:
            return (0.0, 0, 0.0, 0, 0, f"解析失败:\n{video_info}")


NODE_CLASS_MAPPINGS = {
    "LoadVideoPGS": LoadVideoPGS,
    "LoadAudioPGS": LoadAudioPGS,
    "VideoInfoPGS": VideoInfo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadVideoPGS": "Load Video (PGS)",
    "LoadAudioPGS": "Load Audio (PGS)",
    "VideoInfoPGS": "Video Info (PGS)",
}