# 模型下载地址

本工作流需要四个模型。**仓库不含权重文件**，以下是官方 HuggingFace 直链、国内镜像直链和原作者网盘备份。文件大小于 2026-11-13 通过 HuggingFace API 核实。

目录以工作流内置说明节点为准；ComfyUI 会递归扫描子目录，若放到官方默认目录（如 `models/diffusion_models/`）同样可以识别。

---

## 1. `moge_3_vitg_fp16.safetensors`

- **大小**：2385.7 MB（约 2.33 GB）
- **放置目录**：`ComfyUI/models/geometry_estimation/`
- **来源**：[Comfy-Org/MoGe](https://huggingface.co/Comfy-Org/MoGe)，原始模型 [Ruicheng/moge-3-vitg](https://huggingface.co/Ruicheng/moge-3-vitg)，MIT
- **用途**：`LoadMoGeModel` → `MoGeInference` → `MoGeGeometryToFOV`，估计相机视场角

| 渠道 | 直链 |
| --- | --- |
| HuggingFace | https://huggingface.co/Comfy-Org/MoGe/resolve/main/geometry_estimation/moge_3_vitg_fp16.safetensors?download=true |
| 国内镜像 | https://hf-mirror.com/Comfy-Org/MoGe/resolve/main/geometry_estimation/moge_3_vitg_fp16.safetensors?download=true |
| 网盘备份 | https://pan.quark.cn/s/6eda3ae24e0e |

---

## 2. `sam_3d_body_dinov3_bf16.safetensors`

- **大小**：2699.6 MB（约 2.64 GB）
- **放置目录**：`ComfyUI/models/detection/`
- **来源**：[Comfy-Org/sam-3d-body](https://huggingface.co/Comfy-Org/sam-3d-body)，原始模型 [facebook/sam-3d-body-dinov3](https://huggingface.co/facebook/sam-3d-body-dinov3)，SAM License
- **用途**：`SAM3DBody_Loader` → `_Predict` / `_Smooth` / `_FaceExpression`
- 同仓库另有 INT8 ConvRot 版 `sam_3d_body_dinov3_int8_convrot.safetensors`（1901.7 MB），显存紧张可换

| 渠道 | 直链 |
| --- | --- |
| HuggingFace | https://huggingface.co/Comfy-Org/sam-3d-body/resolve/main/detection/sam_3d_body_dinov3_bf16.safetensors?download=true |
| 国内镜像 | https://hf-mirror.com/Comfy-Org/sam-3d-body/resolve/main/detection/sam_3d_body_dinov3_bf16.safetensors?download=true |
| 网盘备份 | https://pan.quark.cn/s/6a300e8a4d5d |

---

## 3. `sam3.1_multiplex_w4a4_convrot_selective_fp16clip_fp32source.safetensors`

- **大小**：999.6 MB（约 0.98 GiB）
- **SHA256**：`A75D0559F508C30FC418FD060A5E3F330F1B7085ED2636F5FD67E3384A2EBBBD`
- **放置目录**：`ComfyUI/models/checkpoints/Sam3.1/`
- **来源**：[Sparknight/sam3.1-int8-int4-convrot](https://huggingface.co/Sparknight/sam3.1-int8-int4-convrot) — **第三方量化版，非 Comfy-Org 官方权重**，衍生自 Meta 官方 FP32 权重，受 SAM License 约束，分发需随附 `SAM_LICENSE.txt`
- **用途**：`CheckpointLoaderSimple` → `SAM3_VideoTrack` 视频多目标跟踪
- **要求**：ComfyUI v0.28.0+ 的原生 INT4 ConvRot 支持，配合较新 `comfy-kitchen`；不支持的 GPU 会回退 INT8
- **官方 FP16 替代**（1.63 GiB，兼容性最好）：https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors?download=true

| 渠道 | 直链 |
| --- | --- |
| HuggingFace | https://huggingface.co/Sparknight/sam3.1-int8-int4-convrot/resolve/main/sam3.1_multiplex_w4a4_convrot_selective_fp16clip_fp32source.safetensors?download=true |
| 国内镜像 | https://hf-mirror.com/Sparknight/sam3.1-int8-int4-convrot/resolve/main/sam3.1_multiplex_w4a4_convrot_selective_fp16clip_fp32source.safetensors?download=true |
| 网盘备份 | https://pan.quark.cn/s/937d7e7d62d2 |

---

## 4. `rt_detr_v4-x-hgnet_fp16.safetensors`

- **大小**：118.2 MB
- **放置目录**：`ComfyUI/models/diffusion_models/RT_detr/`（官方默认位置为 `models/diffusion_models/`）
- **来源**：[Comfy-Org/RT-DETR](https://huggingface.co/Comfy-Org/RT-DETR)，同文件也存在于 [Comfy-Org/SDPose](https://huggingface.co/Comfy-Org/SDPose) 仓库；原始项目 [RT-DETRs/RT-DETRv4](https://github.com/RT-DETRs/RT-DETRv4)，Apache-2.0
- **用途**：`UNETLoader` → `RTDETR_detect`，人物框检测
- 同仓库另有 FP32 版 `rt_detr_v4-x-hgnet_fp32.safetensors`（236.3 MB）

| 渠道 | 直链 |
| --- | --- |
| HuggingFace | https://huggingface.co/Comfy-Org/RT-DETR/resolve/main/diffusion_models/rt_detr_v4-x-hgnet_fp16.safetensors?download=true |
| 国内镜像 | https://hf-mirror.com/Comfy-Org/RT-DETR/resolve/main/diffusion_models/rt_detr_v4-x-hgnet_fp16.safetensors?download=true |
| 备用仓库 | https://huggingface.co/Comfy-Org/SDPose/resolve/main/diffusion_models/rt_detr_v4-x-hgnet_fp16.safetensors?download=true |
| 网盘备份 | https://pan.quark.cn/s/e15d9f25ade4 |

---

## 命令行下载示例

把 `$COMFY` 换成你的 ComfyUI 根目录（Windows 下用 PowerShell 的 `$COMFY` 变量）：

```bash
COMFY="K:/COMFYUI_dapao/ComfyUI"
mkdir -p "$COMFY/models/geometry_estimation" "$COMFY/models/detection" \
         "$COMFY/models/checkpoints/Sam3.1" "$COMFY/models/diffusion_models/RT_detr"

curl -L -C - -o "$COMFY/models/geometry_estimation/moge_3_vitg_fp16.safetensors" \
  "https://hf-mirror.com/Comfy-Org/MoGe/resolve/main/geometry_estimation/moge_3_vitg_fp16.safetensors"

curl -L -C - -o "$COMFY/models/detection/sam_3d_body_dinov3_bf16.safetensors" \
  "https://hf-mirror.com/Comfy-Org/sam-3d-body/resolve/main/detection/sam_3d_body_dinov3_bf16.safetensors"

curl -L -C - -o "$COMFY/models/checkpoints/Sam3.1/sam3.1_multiplex_w4a4_convrot_selective_fp16clip_fp32source.safetensors" \
  "https://hf-mirror.com/Sparknight/sam3.1-int8-int4-convrot/resolve/main/sam3.1_multiplex_w4a4_convrot_selective_fp16clip_fp32source.safetensors"

curl -L -C - -o "$COMFY/models/diffusion_models/RT_detr/rt_detr_v4-x-hgnet_fp16.safetensors" \
  "https://hf-mirror.com/Comfy-Org/RT-DETR/resolve/main/diffusion_models/rt_detr_v4-x-hgnet_fp16.safetensors"
```

`-C -` 支持断点续传。国内网络把 `hf-mirror.com` 换回 `huggingface.co` 即可走官方源。

四个模型合计约 6.1 GB。
