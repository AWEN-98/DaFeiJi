# 音频授权说明（CREDITS）

## 当前架构（v3）
- **战斗/事件音效（射击/命中/暴击/爆炸/敌亡/Boss/拾取/符文/合成/丹药/冲刺等）= 引擎内 WebAudio 合成音效**（代码生成，无素材依赖，无授权问题）。
- **仅 2 个音效使用外部素材**（合成做不出的旋律感），来自 Kenney.nl，**CC0 1.0 免费可商用**：
  - `jingles_HIT00.ogg` —— 撤离成功胜利旋律
  - `click1.ogg` —— UI 点击

## Kenney 素材来源
- 来源仓库（GitHub 镜像）：https://github.com/iwenzhou/kenney
- 素材作者：Kenney (https://www.kenney.nl)
- 许可：CC0 1.0 —— 可自由使用、修改、商用，无需署名

**可用于商业项目（含《空域撤离》正式发售）**，无版权/授权风险。

## 文件清单（31 个 ogg，全部内嵌于 audio-data.js）
- 射击：laser5.ogg / laser7.ogg / laser4.ogg（备选）
- 命中/暴击：laser4.ogg / zapTwoTone.ogg / zap1.ogg
- 爆炸/死亡：spaceTrash1-4.ogg / phaserUp3.ogg
- 能量/拾取/升级：powerUp1/2/3/4/5/7/8/10/12.ogg
- 事件：lowThreeTone.ogg / zapThreeToneDown.ogg / highDown.ogg / phaserDown1/3.ogg / phaseJump2.ogg / threeTone1.ogg
- 胜利旋律：jingles_HIT00.ogg
- UI 点击：click1.ogg

> 注：audio/ 目录保留全部素材源文件供正式版参考；运行时仅 jingles_HIT00/click1 被引用。
