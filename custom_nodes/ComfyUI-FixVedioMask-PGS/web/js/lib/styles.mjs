/** CSS 样式字符串。 */

export const STYLES = `
/* ★ 核心修复：解除 800px 宽度限制，扩展高度到 880px */
.mvr-host{width:1000px;max-width:1000px;height:880px;min-height:880px;max-height:880px;margin:0 auto;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;padding:16px;background:rgba(28,28,32,0.72);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);border:1px solid rgba(255,255,255,0.09);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.05);}


.bd-wrap{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#e0e0e0;font-size:11px;display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box;position:relative;min-height:0;height:100%;flex:1 1 auto;overflow:hidden}
.bd-main{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;gap:6px;width:100%}
.bd-toolbar-wrap{display:flex;flex-direction:column;gap:4px;width:100%}
.bd-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;width:100%}
.bd-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;flex:1;min-width:0}
.bd-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0}
.bd-btn{background:#222;color:#e0e0e0;border:1px solid #111;border-radius:4px;padding:6px 12px;font-size:11px;line-height:1.35;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.bd-actions>.bd-btn{height:29px;min-height:29px}
.bd-btn:hover{background:#333;border-color:#555}
.bd-btn:disabled{opacity:.4;cursor:not-allowed}
.bd-btn-primary{background:#1a3a2a;border-color:#4fff8f;color:#4fff8f}
.bd-btn-primary:hover{background:#1f4a34}
.bd-btn-danger:hover{background:#4a1515;border-color:#c44;color:#faa}
.bd-icon-btn{background:#2a2a2a;border:1px solid #444;color:#eee;cursor:pointer;padding:6px 10px;border-radius:4px}
.bd-icon-btn.active{background:#1a3a2a;color:#4fff8f;border-color:#4fff8f}
.bd-num{width:42px;background:#181818;border:1px solid #333;border-radius:4px;color:#eee;padding:5px 4px;font-size:11px;text-align:center;-moz-appearance:textfield}
.bd-num:disabled{opacity:.4;cursor:not-allowed}
.bd-num::-webkit-outer-spin-button,.bd-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.bd-select{background:#181818;border:1px solid #333;border-radius:4px;color:#eee;padding:4px 6px;font-size:11px;max-width:240px;box-sizing:border-box}
.bd-actions>.bd-select{padding:6px 10px;font-size:11px;line-height:1.35;height:29px;min-height:29px;max-width:min(480px,55vw)}
.bd-video-tag{color:#4fff8f;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.bd-bounds,.bd-timecode{color:#aaa;font-size:11px}
.bd-timecode{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.bd-tl-zoom{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.bd-tl-zoom.hidden{display:none!important}

.bd-btn-zoom.active{background:#1a3a2a;color:#4fff8f;border-color:#4fff8f}
.bd-tl-zoom-slider{width:128px;height:18px;margin:0;accent-color:#4fff8f;cursor:pointer;flex-shrink:0;touch-action:none}

/* 舞台 */
.bd-stage{width:100%;box-sizing:border-box;background:#0c0c0c;border:1px solid #222;border-bottom:none;border-radius:6px 6px 0 0;overflow:hidden;position:relative;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;align-self:center;margin:0 auto}
.bd-stage.hidden{display:none!important}

.bd-stage-video,.bd-stage-img{width:100%;height:100%;max-height:none;object-fit:contain;background:#000;display:block}
.bd-stage-img.hidden,.bd-stage-video.hidden{display:none!important}

.bd-stage-empty{color:#555;font-size:11px;pointer-events:none}
.bd-stage-badge{position:absolute;left:8px;bottom:8px;padding:2px 7px;border-radius:3px;background:rgba(0,0,0,.65);color:#ccc;font-size:10px;line-height:1.4;cursor:pointer;user-select:none}
.bd-stage-badge:hover{color:#fff;background:rgba(0,0,0,.8)}
.bd-controls{width:100%;box-sizing:border-box;background:#151515;border:1px solid #222;border-radius:0 0 6px 6px;padding:8px 10px;margin-top:0;flex-shrink:0}
.bd-stage.hidden+.bd-controls{border-radius:6px;border-color:#333;background:#1e1e1e}
.bd-player{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%}
.bd-frame-jump{display:inline-flex;align-items:center;gap:4px;color:#ddd;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}
.bd-frame-input{width:64px;background:#181818;border:1px solid #444;border-radius:4px;color:#eee;padding:4px;font-size:11px;text-align:center;-moz-appearance:textfield}
.bd-frame-input:focus{border-color:#4fff8f;outline:none}
.bd-frame-input::-webkit-outer-spin-button,.bd-frame-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.bd-frame-total{color:#888;min-width:2.5em}
.bd-seek{flex:1;min-width:120px;height:6px}
.bd-player .bd-timecode{min-width:88px;font-size:11px;color:#ddd}

/* 时间轴 */
.bd-viewport{width:100%;max-width:100%;min-width:0;overflow-x:hidden;overflow-y:hidden;border-radius:6px;border:1px solid #111;background:#2a2a2a;box-sizing:border-box;flex-shrink:0}
.bd-viewport.bd-zoomed{overflow-x:auto;scrollbar-width:thin;scrollbar-color:#555 #1a1a1a}
.bd-viewport.bd-zoomed::-webkit-scrollbar{height:10px}
.bd-viewport.bd-zoomed::-webkit-scrollbar-track{background:#1a1a1a;border-radius:5px}
.bd-viewport.bd-zoomed::-webkit-scrollbar-thumb{background:#555;border-radius:5px}
.bd-viewport.bd-zoomed::-webkit-scrollbar-thumb:hover{background:#777}
.bd-canvas{display:block;width:100%;min-width:100%;height:auto;cursor:pointer;box-sizing:border-box;flex-shrink:0;object-fit:fill}
.bd-canvas.bd-grab{cursor:grab}
.bd-canvas.bd-grabbing{cursor:grabbing}

/* 输出栏 */
.bd-output{width:100%;box-sizing:border-box;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 8px;background:#1e1e1e;border:1px solid #333;border-radius:6px}
.bd-output label{color:#888;font-size:10px;white-space:nowrap}
.bd-out-fixed{display:flex;gap:4px;align-items:center}
.bd-out-fixed.hidden{display:none!important}

/* 多视图排版栏 */
.bd-layout-bar{gap:12px}
.bd-layout-bar>.bd-choice{display:inline-flex;align-items:center;gap:4px;color:#ddd;font-size:11px;cursor:pointer;user-select:none;white-space:nowrap}
.bd-layout-bar>.bd-choice input{accent-color:#4fff8f;cursor:pointer;margin:0;width:14px;height:14px}
.bd-layout-bar .bd-num{width:72px}
.bd-layout-bar .bd-meta{color:#8c8;font-variant-numeric:tabular-nums}

/* 弹窗 */
.bd-modal-overlay{position:absolute;inset:0;z-index:200;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box;border-radius:6px}
.bd-modal{background:#1e1e1e;border:1px solid #333;border-radius:6px;padding:12px;width:100%;max-width:460px;max-height:calc(100% - 8px);display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 28px rgba(0,0,0,.5)}
.bd-modal-title{color:#e0e0e0;font-size:12px;font-weight:600;line-height:1.35}
.bd-modal-body{color:#aaa;font-size:11px;line-height:1.5;white-space:pre-wrap}
.bd-modal-body.hidden{display:none}
.bd-modal-actions{display:flex;gap:8px;justify-content:flex-end;flex-shrink:0}

.hidden{display:none!important}

`;