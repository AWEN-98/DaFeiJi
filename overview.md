# 移动端适配完成

## 后续调整

### 1. 接入用户 ChatGPT 生成的爆炸特效精灵表
- 来源：用户用 ChatGPT 生成的 1 张绿屏 4×2 爆炸特效序列图。
- 处理：`scripts/process_vfx_explosion.py` 绿幕抠除 + 绿色溢出抑制 + 4×2 切帧 + 每帧居中缩放 → 输出 1024×512 透明 PNG。
- `game.js` VFX 系统扩展：支持逐帧精灵表动画（`spawnVfx` 新增 `{cols, rows, fps}` 参数）。
- 替换 `vfx_explosion_smoke` 单图为 `vfx_explosion_sheet` 动画：玩家炸弹、通用爆炸、精英怪死亡、分裂怪死亡。
- 文件：`prototype/assets/v3/vfx/vfx_explosion_sheet.png`

### 2. 接入用户 ChatGPT 生成的新战机加速动画精灵表
- 来源：用户用 ChatGPT 生成的 3 张绿屏 4×2 加速动画图。
- 处理：`scripts/process_boost_v2.py` 绿幕抠除 → 边缘去绿溢出 → 统一缩放居中 → 输出 1024×512 透明 PNG。
- `game.js` 恢复 boost 状态切换：冲刺/高速时播放 boost sheet（14fps），普通移动播放 idle sheet（10fps）。
- 文件：
  - `prototype/assets/v3/player/qingfalcon_boost_sheet.png`
  - `prototype/assets/v3/player/xuanwu_boost_sheet.png`
  - `prototype/assets/v3/player/fan_dancer_boost_sheet.png`

### 2. 移除未扣干净的 AI 加速动画精灵表
- 删除 `prototype/assets/v3/player/qingfalcon_boost_sheet.png`
- 删除 `prototype/assets/v3/player/xuanwu_boost_sheet.png`
- 删除 `prototype/assets/v3/player/fan_dancer_boost_sheet.png`
- 删除 `game.js` 中对应的 `loadImg` 与 `drawPlayer` boost 切换逻辑，恢复为仅播放 idle sheet。
- 向用户提供 ChatGPT 生图提示词，转由用户在 ChatGPT 中生成透明背景、4×2 网格的干净加速动画资产。

## 改动总结

### 1. 虚拟摇杆（左半屏动态出现）
- 触摸左半屏任意位置 → 摇杆基座(130px)出现 → 拖拽旋钮(56px)控制方向和速度
- 多触摸独立追踪，可与右侧按钮同时操作

### 2. 右侧操控按钮
- 🔥 **开火按钮**（84px）：按住持续开火，自动瞄准520px内最近敌人
- ⚡ **冲刺按钮**（58px）：点击触发冲刺，冷却中灰显
- 💊 **丹药按钮**（58px）：点击使用丹药，空槽淡显
- ⏸ **暂停按钮**（44px，左上角）：替代ESC键

### 3. 横屏模式
- 标题页"📱横屏模式"按钮 → 全屏 + 横屏锁定
- 竖屏游戏中自动弹出旋转提示
- iOS不支持自动锁定时提示手动旋转

### 4. 基地UI精简（移动端）
- Tab可横向滚动
- 网格改单列布局
- 机体卡改横排（图+文字并排）
- 字号/padding全面缩小
- 面板全宽适配

### 5. HUD紧凑模式
- 左上状态面板：236→180px
- 右上状态面板：258→170px（移动端仅显示核心信息）
- 小地图：150→92px
- 羁绊条：70→50px
- 隐藏键盘提示和冗余文字

### 6. 封印宝箱适配
- 移动端改为靠近即触发（无需按E）

## 技术细节
- 旧触摸系统（touchActive/touch/updateTouch）完全移除
- 多触摸通过touchId独立追踪
- 所有场景切换都同步控件显示/隐藏
- `node --check` 通过

## 部署
- 分享链接：https://bf9fc0c1146547b6b3806068d36b2edb.sh4.agentos-app.net
- 部署目录：prototype-deploy/（20MB）
