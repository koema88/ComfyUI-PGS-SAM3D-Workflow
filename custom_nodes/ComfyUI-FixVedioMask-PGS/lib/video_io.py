"""Probe source videos under ComfyUI input folder (metadata + frame count)."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess

import folder_paths

log = logging.getLogger("FixVedioMaskPGS.video_io")


def _require_cv2():
    try:
        import cv2
        return cv2
    except ImportError as exc:
        raise ImportError(
            "OpenCV is required as a fallback video probe. "
            "Install: pip install opencv-python-headless"
        ) from exc


def resolve_video_path(video: dict) -> str:
    """Resolve timeline video metadata to an absolute path under ComfyUI input."""
    video_file = (video.get("videoFile") or video.get("fileName") or "").strip()
    if not video_file:
        raise ValueError("No video file in timeline.")

    base = folder_paths.get_input_directory()
    subfolder = (video.get("subfolder") or "").strip().replace("\\", "/")

    candidates = []
    if subfolder and not video_file.startswith(subfolder):
        candidates.append(os.path.join(base, subfolder, os.path.basename(video_file)))
    candidates.append(os.path.join(base, video_file.replace("/", os.sep)))
    candidates.append(os.path.join(base, os.path.basename(video_file)))

    for path in candidates:
        if os.path.isfile(path):
            return path

    raise ValueError(f"Video file not found in ComfyUI input: {video_file}")


def ffprobe_bin() -> str | None:
    """Resolve ffprobe: PATH first, then imageio-ffmpeg sibling binary if present."""
    probe = shutil.which("ffprobe")
    if probe:
        return probe
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        ff = get_ffmpeg_exe()
        stem = "ffprobe.exe" if os.name == "nt" else "ffprobe"
        candidate = os.path.join(os.path.dirname(ff), stem)
        if os.path.isfile(candidate):
            return candidate
    except ImportError:
        pass
    return None


def _parse_rate(value) -> float:
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text or text in {"0/0", "N/A"}:
        return 0.0
    if "/" in text:
        num, den = text.split("/", 1)
        try:
            den_f = float(den)
            return float(num) / den_f if den_f > 0 else 0.0
        except ValueError:
            return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _parse_seconds(value) -> float:
    """ffprobe may return 'N/A' for stream duration; treat as 0."""
    text = str(value or "").strip()
    if not text or text.upper() == "N/A":
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def _ffprobe_stream_info(path: str) -> dict | None:
    probe = ffprobe_bin()
    if not probe:
        return None
    try:
        res = subprocess.run(
            [
                probe, "-v", "error", "-select_streams", "v:0",
                "-show_entries",
                "stream=width,height,duration,nb_frames,r_frame_rate,avg_frame_rate",
                "-of", "json", path,
            ],
            capture_output=True, check=True,
        )
        payload = json.loads(res.stdout.decode("utf-8", "replace"))
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError) as exc:
        log.debug("ffprobe stream info failed for %s: %s", path, exc)
        return None
    streams = payload.get("streams") or []
    return streams[0] if streams else None


def _ffprobe_count_frames(path: str) -> int | None:
    probe = ffprobe_bin()
    if not probe:
        return None
    try:
        res = subprocess.run(
            [
                probe, "-v", "error", "-select_streams", "v:0",
                "-count_frames", "-show_entries", "stream=nb_read_frames",
                "-of", "csv=p=0", path,
            ],
            capture_output=True, check=True,
        )
        text = res.stdout.decode("utf-8", "replace").strip()
        if text.isdigit():
            return int(text)
    except (subprocess.CalledProcessError, OSError) as exc:
        log.debug("ffprobe count_frames failed for %s: %s", path, exc)
    return None


def _opencv_probe(path: str) -> dict:
    cv2 = _require_cv2()
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {path}")
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        native_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        duration = float(frame_count / native_fps) if frame_count > 0 and native_fps > 0 else 0.0
        return {
            "width": width,
            "height": height,
            "duration": duration,
            "native_fps": native_fps,
            "frame_count": max(0, frame_count),
        }
    finally:
        cap.release()


def probe_video_file(path: str) -> dict:
    """Probe container metadata and an accurate frame count."""
    if not path or not os.path.isfile(path):
        raise ValueError(f"Video file not found: {path}")

    method = "estimated"
    stream = _ffprobe_stream_info(path)
    opencv_meta = None

    width = height = 0
    duration = 0.0
    native_fps = 0.0
    frame_count = 0

    if stream:
        width = int(stream.get("width") or 0)
        height = int(stream.get("height") or 0)
        duration = _parse_seconds(stream.get("duration"))
        native_fps = _parse_rate(stream.get("avg_frame_rate")) or _parse_rate(stream.get("r_frame_rate"))
        nb_frames = str(stream.get("nb_frames") or "").strip()
        if nb_frames.isdigit() and int(nb_frames) > 0:
            frame_count = int(nb_frames)
            method = "ffprobe_nb_frames"

    if frame_count <= 0:
        counted = _ffprobe_count_frames(path)
        if counted is not None and counted > 0:
            frame_count = counted
            method = "ffprobe_count_frames"

    if frame_count <= 0 or width <= 0 or height <= 0 or native_fps <= 0:
        try:
            opencv_meta = _opencv_probe(path)
        except ImportError:
            opencv_meta = None
        if opencv_meta:
            width = width or int(opencv_meta["width"])
            height = height or int(opencv_meta["height"])
            native_fps = native_fps or float(opencv_meta["native_fps"])
            if frame_count <= 0 and int(opencv_meta["frame_count"]) > 0:
                frame_count = int(opencv_meta["frame_count"])
                method = "opencv"

    if duration <= 0 and frame_count > 0 and native_fps > 0:
        duration = frame_count / native_fps
    elif duration <= 0 and opencv_meta:
        duration = float(opencv_meta.get("duration") or 0.0)

    if frame_count <= 0 and duration > 0 and native_fps > 0:
        frame_count = max(1, int(round(duration * native_fps)))
        if method == "estimated":
            method = "duration_estimate"

    if frame_count <= 0:
        raise ValueError(f"Could not determine frame count for video: {path}")

    if native_fps <= 0:
        native_fps = 24.0

    return {
        "width": width,
        "height": height,
        "duration": duration,
        "native_fps": native_fps,
        "frame_count": frame_count,
        "probe_method": method,
    }