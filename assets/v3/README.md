# 空域撤离 · 原创美术资产 v3

> 风格：中式志怪 × 写实厚涂 × 鎏金边光，**无霓虹、无卡通、无赛璐珞**

## 色板
| 名称 | HEX | 用途 |
|---|---|---|
| 暗底 | `#0E0B08` | 画面最深底、烟雾底色 |
| 鎏金 | `#C9A24B` | 高光、能量辉光、UI 描边 |
| 余烬橙 | `#C8642A` | 火焰、爆炸、危险提示 |
| 羊皮纸米白 | `#E8DCC4` | 冰霜核心、闪白、文字高光 |
| 玄青 | `#14181F` | 阴影、金属暗部 |

## 提示词模板（VFX）
```
Dark fantasy game VFX asset, [具体效果], thick oil-paint and impasto texture with visible brushstrokes, gilt gold (#C9A24B) and ember orange (#C8642A) glow, bone-white (#E8DCC4) hot cores, on near-black (#0E0B08), painterly volumetric, ornate, NO neon, NO cel-shading, NO cartoon, transparent background
```

## 已生成资产（第一批 VFX）
| 文件 | 用途 | 备注 |
|---|---|---|
| `vfx_hit_spark.png` | 命中火花 | 金色放射状火花，深色底，适合叠加混合 |
| `vfx_crit_flash.png` | 暴击闪光 | 星形鎏金碎裂闪光 |
| `vfx_enemy_death.png` | 敌人死亡爆裂 | 黑烟 + 金色余烬 + 碎片 |
| `vfx_explosion_smoke.png` | 爆炸浓烟 | 厚重黑烟卷 + 金橙核心 |
| `vfx_frost.png` | 冰霜结晶 | 骨白/灰蓝冰晶，真透明背景 |
| `vfx_buff_aura.png` | 鎏金护盾/增益光环 | 金色华丽圆环 |

## 技术说明
- 尺寸：1024×1024 px
- 质量：high
- 部分素材带深底，建议局内用 `globalCompositeOperation = 'lighter'`（叠加）渲染；冰霜为透明通道，正常 alpha 渲染即可。
- 图片右下角带有 `AI生成 WORKBUDDY` 水印，当前阶段作占位/风格验证；若进正式包，需额外去水印或改用无水印管线。

## 与 ChatGPT 资产的关系
- `v1/`、`v2/` 为 ChatGPT 生成的资产（霓虹山海/卡通渲染风格）。
- `v3/` 为本项目原创方向资产（写实厚涂/鎏金），与 v1/v2 风格不同，后续若整体转轨，可逐步替换 v1/v2。
