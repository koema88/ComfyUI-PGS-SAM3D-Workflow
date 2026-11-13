# ComfyUI PGS · SAM3.1 视频动作跟踪 / 3D 白模 + ID 通道工作流

一套用于「视频动作跟踪 → SAM 3D Body 人体网格推理 → 3D 白模渲染（按人物分配 ID 颜色）」的 ComfyUI 工作流，附三个配套自定义节点包和全部模型下载地址。

> 本仓库为个人备份与分发用途。三个 `-PGS` 插件在 GitHub 上**没有公开原始仓库**，属于二次改写的定制包，来源与许可见文末「来源与许可」。

## 目录结构

```
.
├── README.md                     # 本说明
├── MODELS.md                     # 四个模型的完整下载地址（HuggingFace / 国内镜像 / 网盘备份）
├── workflows/
│   └── SAM3.1-Tracking-3D-WhiteModel-IDChannel-V2.0-PGS.json
│       # 原始文件名：SAM3.1（视频动作+-+跟踪推理++-+3D白模+ID通道V2.0）-PGS.json
└── custom_nodes/
    ├── ComfyUI-SAM3D-CustomColor-PGS/   # 多人 3D 白模自定义颜色渲染
    ├── ComfyUI-LoadRef-PGS/             # 可视化视频/音频加载与裁切
    └── ComfyUI-FixVedioMask-PGS/        # 逐帧画笔修复 + 混合预览 + 结果锁定
```

## 安装步骤

1. 把 `custom_nodes/` 下的**三个文件夹**复制到 `ComfyUI/custom_nodes/`，保持文件夹名不变（工作流按节点 ID 查找，改名不影响 ID，但路由前缀与前端扩展名有 `PGS` 依赖）。
2. 安装额外依赖（只有 FixVedioMask 需要）：

   ```bash
   pip install -r ComfyUI/custom_nodes/ComfyUI-FixVedioMask-PGS/requirements.txt
   ```

   内容为 `opencv-python-headless>=4.8.0` 和 `imageio-ffmpeg>=0.4.9`。`torch / numpy / Pillow / aiohttp / av` 由 ComfyUI 环境提供。
3. 按 [MODELS.md](MODELS.md) 下载四个模型，放到对应目录。
4. 重启 ComfyUI，导入 `workflows/` 里的 JSON。

## 模型下载

| 模型 | 大小 | 放置目录 |
| --- | --- | --- |
| `moge_3_vitg_fp16.safetensors` | 2.33 GB | `models/geometry_estimation/` |
| `sam_3d_body_dinov3_bf16.safetensors` | 2.64 GB | `models/detection/` |
| `sam3.1_multiplex_w4a4_convrot_selective_fp16clip_fp32source.safetensors` | 999.6 MB | `models/checkpoints/Sam3.1/` |
| `rt_detr_v4-x-hgnet_fp16.safetensors` | 118.2 MB | `models/diffusion_models/RT_detr/` |

四个文件的 HuggingFace 官方直链、`hf-mirror.com` 国内镜像直链、原作者夸克网盘备份，全部列在 [MODELS.md](MODELS.md)。

工作流内置的说明节点里也保留了原作者的夸克网盘备份链接（三个插件包同样有备份链接，见文末）。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| ComfyUI | 需要带原生 SAM 3.1 / SAM 3D Body / MoGe / RT-DETR 节点的版本；SAM 3D Body 核心节点由 [Comfy-Org/ComfyUI PR #14370](https://github.com/Comfy-Org/ComfyUI/pull/14370) 于 2026-08-23 合入 |
| 量化权重 | `sam3.1_multiplex_w4a4_...` 是第三方 INT4 ConvRot 量化版，需要 ComfyUI v0.28.0+ 与较新的 `comfy-kitchen`；不支持的硬件会回退到 INT8。若跑不起来，可换官方 FP16 版 `sam3.1_multiplex_fp16.safetensors` |
| 显存 | 工作流同时加载 SAM 3.1 + SAM 3D Body + MoGe-3 ViT-G + RT-DETR，建议 16 GB 以上 |

## 三个自定义节点包

| 包 | 节点 ID | 说明 |
| --- | --- | --- |
| `ComfyUI-SAM3D-CustomColor-PGS` | `SAM3DBody_CustomColorRender` | 基于 ComfyUI 核心 `comfy_extras/sam3d_body/rasterizer.py` 的 `render_pose_data_torch`。按人物索引分配 HEX 颜色、按 `pred_cam_t[2]` 深度排序解决遮挡、灰模与纯色按 `tint_strength` 混合。分类 `image/detection` |
| `ComfyUI-LoadRef-PGS` | `LoadVideoPGS` / `LoadAudioPGS` / `VideoInfoPGS` | 带可视化时间轴、裁切、分段计划（`segment_plan_json`）、分片上传路由 `/loadref_pgs_upload_chunk`。分类 `PGS/Import` |
| `ComfyUI-FixVedioMask-PGS` | `FixVedioMask-PGS` | 对 `PoseRef` / `PoseMask` 两路 IMAGE 序列做逐帧画笔修复、混合模式与滤镜、`lockResult` 结果锁定，路由前缀 `/fix_vedio_mask/`。分类 `FixVedioMask/PGS`。目录名 `Vedio` 是历史拼写，勿改 |

## 工作流依赖与已知缺件

工作流共 16 个顶层节点、4 个子图。子图内部全部使用 ComfyUI 核心节点：

- `SAM3.1跟踪`：`CheckpointLoaderSimple` / `CLIPTextEncode` / `SAM3_VideoTrack` / `easy positive`
- `跟踪边界框`：`UNETLoader` / `RTDETR_detect`
- `SAM3.1 角色模型 身体数据 推理`：`SAM3DBody_Loader` / `_Predict` / `_Smooth` / `_FaceExpression`
- `SAM3.1相机推理`：`LoadMoGeModel` / `MoGeInference` / `MoGeGeometryToFOV`

**已知缺件（导入前请确认）**：

| 节点 | 状态 |
| --- | --- |
| `ImageListToBatch_PGS` | **不在这三个包里**。工作流顶层节点 395 用到，需另找对应的小插件，否则该分支会报红 |
| `StartLoop` / `EndLoop` | 循环控制节点，三个包均未提供；可能来自 ComfyUI 新版核心或某个循环插件，需自行确认 |
| `easy positive` | 来自 `ComfyUI-Easy-Use`（子图内使用） |
| `CreateVideo` / `SaveVideo` / `PrimitiveInt` / `MarkdownNote` | ComfyUI 核心节点 |

## 来源与许可

- 三个 `-PGS` 插件包在 GitHub 上查不到同名仓库，无 `.git`、`pyproject.toml`、`LICENSE` 或作者署名，为二次改写的私有定制包。**本仓库仅为个人备份，不代表拥有这些代码的著作权，请勿据此主张原创或用于商业分发。**
- 技术上游：
  - `SAM3D-CustomColor` 直接复用 [Comfy-Org/ComfyUI](https://github.com/Comfy-Org/ComfyUI) 核心的 SAM 3D Body rasterizer；
  - `LoadRef` 功能接近 [grimztha/Comfyui-reference-loader](https://github.com/grimztha/Comfyui-reference-loader)（GPL-3.0），但代码实现不同；
  - `FixVedioMask` 理念接近 [knoic/ComfyUI-VideoMaskEditor](https://github.com/knoic/ComfyUI-VideoMaskEditor)（MIT），但处理的是 IMAGE 序列而非 MASK 序列，代码不同。
- 模型权重遵循各自许可：MoGe（MIT）、SAM 3D Body 与 SAM 3.1（SAM License，第三方量化版还要求随附 `SAM_LICENSE.txt`）、RT-DETR（Apache-2.0）。仓库**不包含任何模型权重**，仅提供下载链接。

### 原作者的插件包备份链接（来自工作流内置说明节点）

- [ComfyUI-SAM3D-CustomColor-PGS](https://pan.quark.cn/s/3c0f45f042c7)
- [ComfyUI-FixVedioMask-PGS](https://pan.quark.cn/s/53d01644235c)
- [ComfyUI-LoadRef-PGS](https://pan.quark.cn/s/96ea2524a6cf)
