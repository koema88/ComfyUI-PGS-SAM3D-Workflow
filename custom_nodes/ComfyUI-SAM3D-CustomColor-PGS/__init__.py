import torch
import numpy as np
from comfy_api.latest import ComfyExtension, io
from comfy_extras.sam3d_body.rasterizer import render_pose_data_torch as render_pose_data
import comfy.model_management
import comfy.utils

class SAM3DBody_CustomColorRender(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SAM3DBody_CustomColorRender",
            display_name="Render SAM3D Body (Custom Color ID)",
            category="image/detection",
            inputs=[
                io.Custom("MHR_POSE_DATA").Input("pose_data"),
                io.String.Input(
                    "color_hex_list", 
                    default="#0000FF, #FF0000, #00FF00, #800080, #00FFFF, #FFFF00", 
                    tooltip="用逗号分隔的十六进制颜色：1.蓝 2.红 3.绿 4.紫 5.青 6.黄"
                ),
                # 【修改点】：默认值改为了 0.5
                io.Float.Input(
                    "tint_strength", default=0.5, min=0.0, max=1.0, step=0.05, 
                    tooltip="叠色的浓度。0.0=纯灰模，0.5=色彩与光影平衡(推荐)，1.0=纯色覆盖"
                ),
                io.Image.Input("background", optional=True),
                io.Int.Input("width", default=0),
                io.Int.Input("height", default=0),
            ],
            outputs=[io.Image.Output("image")],
        )

    @classmethod
    def execute(cls, pose_data, color_hex_list, tint_strength=0.5, background=None, width=0, height=0) -> io.NodeOutput:
        native_H, native_W = pose_data["image_size"]
        W = int(width) if width > 0 else native_W
        H = int(height) if height > 0 else native_H

        # 解析颜色列表
        hex_list = [c.strip() for c in color_hex_list.split(",")]
        colors = []
        for h in hex_list:
            h = h.lstrip('#')
            if len(h) == 6:
                colors.append(torch.tensor([int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)], dtype=torch.float32))
            else:
                colors.append(torch.tensor([0.5, 0.5, 0.5], dtype=torch.float32))
        
        if not colors:
            colors.append(torch.tensor([0.5, 0.5, 0.5], dtype=torch.float32))

        frames = pose_data["frames"]
        B = len(frames)
        if B == 0:
            return io.NodeOutput(torch.zeros(1, H, W, 3))

        out_device = comfy.model_management.intermediate_device()
        out_dtype = comfy.model_management.intermediate_dtype()
        
        # 准备背景
        bg_t = None if background is None else background.to(device=out_device, dtype=out_dtype)
        if bg_t is not None and tuple(bg_t.shape[1:3]) != (H, W):
            bg_t = comfy.utils.common_upscale(bg_t.movedim(-1, 1), W, H, "bilinear", "disabled").movedim(1, -1)

        frames_out = []
        for f in range(B):
            frame_img = torch.zeros((H, W, 3), device=out_device, dtype=out_dtype) if bg_t is None else bg_t[min(f, bg_t.shape[0] - 1)].clone()
            
            persons = frames[f]
            
            # 按深度排序，解决遮挡问题
            def get_depth(p):
                cam_t = p.get("pred_cam_t")
                if cam_t is not None:
                    return float(cam_t[2]) 
                return 0.0

            indexed_persons = list(enumerate(persons))
            persons_sorted = sorted(indexed_persons, key=lambda x: get_depth(x[1]), reverse=True)
            
            for original_idx, person in persons_sorted:
                single_pose = {
                    "frames": [[person]],
                    "faces": pose_data["faces"],
                    "image_size": pose_data["image_size"],
                    "canonical_colors": pose_data.get("canonical_colors"),
                    "hand_vert_mask": pose_data.get("hand_vert_mask"),
                }
                
                # 1. 渲染原味灰度模型
                grey_img = render_pose_data(single_pose, frame_idx=0, W=W, H=H, background=None, composite="mesh_only", opacity=1.0, shader_preset="default", cache={})
                grey_img = grey_img.to(device=out_device, dtype=out_dtype)
                
                # 2. 渲染剪影蒙版
                mask_img = render_pose_data(single_pose, frame_idx=0, W=W, H=H, background=None, composite="silhouette", cache={})
                mask_img = mask_img.to(device=out_device, dtype=out_dtype)
                mask = (mask_img.sum(dim=-1, keepdim=True) > 0.01).float()

                # 3. 叠一层淡淡的颜色
                color_rgb = colors[original_idx % len(colors)].to(device=out_device, dtype=out_dtype)
                
                # 核心公式：混合灰模和纯色。
                colored_img = grey_img * (1.0 - tint_strength) + color_rgb * tint_strength
                
                # 4. 融合到背景
                frame_img = colored_img * mask + frame_img * (1.0 - mask)

            frames_out.append(frame_img)

        out_image = torch.stack(frames_out, dim=0)
        return io.NodeOutput(out_image)

class CustomColorExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [SAM3DBody_CustomColorRender]

async def comfy_entrypoint() -> CustomColorExtension:
    return CustomColorExtension()