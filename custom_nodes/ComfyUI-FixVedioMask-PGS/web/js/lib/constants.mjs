/** 所有常量。无副作用，无依赖。 */

export const RULER_H = 24;
export const SEG_LABEL_H = 20;
export const TRACK_H = 160;
export const TRACK_Y = RULER_H + SEG_LABEL_H;
export const MIN_SEG = 4;
export const HANDLE_PX = 14;
export const THUMB_MAX_W = 96;
export const THUMB_JPEG_Q = 0.4;
export const THUMB_PREFETCH_BATCH = 2;
export const MAX_THUMBS_PER_SEGMENT = 6;
export const TIMELINE_SYNC_DEBOUNCE_MS = 500;
export const COMFY_UPLOAD_SOFT_LIMIT = 95 * 1024 * 1024;
export const MINIMAX_CHUNK_SIZE = 8 * 1024 * 1024;

export const MARKER_HIT_PX = 8;
export const MAX_MARKERS = 200;

export const DIRECTOR_MIN_WIDTH = 900;
export const LOCKED_NODE_WIDTH = 840;
export const MIN_NODE_HEIGHT = 885;

export const RULER_MAJOR_SEC = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
export const RULER_MIN_MAJOR_PX = 64;
export const RULER_MIN_MINOR_PX = 7;

export const CLIP_SEGMENT_COLORS = [
    "rgba(255,200,50,0.9)",
    "rgba(102,170,255,0.9)",
    "rgba(79,255,143,0.9)",
    "rgba(255,102,170,0.9)",
];

export const RESOLUTION_ASPECTS = [
    ["1:1 (方形)", 1, 1],
    ["2:3 (竖版照片)", 2, 3],
    ["3:2 (横版照片)", 3, 2],
    ["3:4 (竖版标准)", 3, 4],
    ["4:3 (标准)", 4, 3],
    ["9:16 (竖屏)", 9, 16],
    ["16:9 (宽屏)", 16, 9],
    ["21:9 (超宽)", 21, 9],
];
export const DEFAULT_ASPECT_RATIO = "16:9 (宽屏)";
export const CUSTOM_ASPECT_RATIO = "自定义";
export const DEFAULT_MEGAPIXELS = 0.4;
export const MINIMAX_CANVAS_MULTIPLE = 32;