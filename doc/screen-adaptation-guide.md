# 屏幕适配方案

## 问题诊断

### 原始配置 vs 期望值

| 配置项 | 当前值 | 正确值 | 影响 |
|--------|--------|--------|------|
| Canvas UITransform | 1280 × 720 | 1920 × 1080 | 画布坐标空间小于游戏内容，导致内容溢出裁剪 |
| Camera orthoHeight | 504.586 | 540 (=1080/2) | 摄像机可见高度约 1009 单位，小于 1080 设计高度 |
| Canvas Widget | enabled, LEFT+RIGHT+TOP+BOTTOM | disabled | Widget 强行将 Canvas 拉伸为屏幕像素尺寸，覆盖设计分辨率 |
| 分辨率策略 | 无 | SHOW_ALL | 不同宽高比的手机屏幕无适配，画面会被拉伸/裁剪 |

**根因**: Canvas 设计分辨率 (1280×720) 与 GameConfig (1920×1080) 及所有场景节点坐标不匹配。

### 发现的关键冲突

**Canvas Widget 冲突**（第二轮审查发现）：
Canvas 节点挂载了 `alignFlags=45`（LEFT+RIGHT+TOP+BOTTOM）的 Widget，`alignMode=2`（ON_WINDOW_RESIZE）。它在 `lateUpdate` 中会将 Canvas UITransform 拉伸为屏幕的实际像素尺寸（如 896×414），直接覆盖我们设置的 1920×1080 设计分辨率。

---

## 解决方案

创建 `assets/scripts/core/ScreenAdapter.ts` 组件，挂载到 `Canvas/Camera` 节点，运行时自动完成全部适配。

### 组件属性

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| Design Width | number | 1920 | 设计宽度，与 GameConfig.DESIGN_WIDTH 保持一致 |
| Design Height | number | 1080 | 设计高度，与 GameConfig.DESIGN_HEIGHT 保持一致 |
| Adapt Mode | enum | SHOW_ALL | 适配模式：SHOW_ALL / FIXED_HEIGHT / FIXED_WIDTH |

### 运行时执行顺序

```
onLoad:
  1. 禁用 Canvas Widget            → Widget.lateUpdate 再也无法拉伸 Canvas
  2. view.setDesignResolutionSize(1920, 1080, SHOW_ALL)
  3. 注册 screen.on('window-resize') 监听

start:（保证在所有 onLoad 之后执行）
  4. Canvas UITransform = 1920 × 1080   → 坐标空间匹配 GameConfig
  5. Camera orthoHeight = 540           → 可见高度 = 2 × 540 = 1080

第一帧渲染:
  6. Camera 精确渲染 1920×1080 区域
  7. SHOW_ALL 策略按屏幕比例缩放，保持画面不变形
```

### SHOW_ALL 策略原理

- 游戏内容 1920×1080 **完整可见**
- 画面**保持 16:9 比例**，不会拉伸变形
- 非 16:9 屏幕自动留黑边（大多数手机接近 16:9，黑边极小）

---

## 编辑器操作（唯一手动步骤）

选中 `Canvas/Camera` 节点 → 点击「添加组件」→ 搜索 `ScreenAdapter` → 确认属性：

- **Design Width**: `1920`
- **Design Height**: `1080`
- **Adapt Mode**: `SHOW_ALL`

> Camera orthoHeight 和 Canvas UITransform 由脚本运行时自动修正，无需手动修改。Widget 也会被脚本自动禁用。

---

## 各设备适配效果

| 设备 | 横屏分辨率 | 比例 | 效果 |
|------|-----------|------|------|
| iPhone 8 | 1334×750 | 16:9 | 完美填充，无黑边 |
| iPhone 14 Pro Max | 2796×1290 | 19.5:9 | 填满高度，左右微量黑边 |
| Samsung S24 | 2340×1080 | 19.5:9 | 填满高度，左右微量黑边 |
| iPad | 2048×1536 | 4:3 | 填满宽度，上下有黑边 |
| 微信 PC | 窗口可调 | 任意 | 拖拽窗口时实时适配 |

---

## 逐组件兼容性验证

| 组件 | 屏幕依赖点 | 适配后 |
|------|-----------|--------|
| ScreenAdapter | Canvas + Camera + View | 运行时修正三项配置 |
| PlayerController | `getUILocation().y` 分上下屏 | y=540 在 1920×1080 空间正确划分 |
| PlayerAnim | 无 | 不受影响 |
| GameManager | 无 | 不受影响 |
| UIManager | UI 面板显隐 | 锚点居中，在 1920×1080 空间内正确 |
| Obstacle/ObstacleSpawner | GameConfig 坐标常量 | SPAWN_X=1200/DESPAWN_X=-1200 在可见范围 |
| BackgroundScroller | 视差 tile 循环 | 纯局部坐标，不受 Canvas 尺寸影响 |
| GroundScroller | 双缓冲 tile 循环 | 纯局部坐标，不受 Canvas 尺寸影响 |
| EventBus | 无 | 不受影响 |
| ObjectPool | 无 | 不受影响 |

---

## 适配模式参考

| 模式 | 适用场景 |
|------|----------|
| `SHOW_ALL`（默认） | 画面完整不变形，非 16:9 留黑边。适合跑酷游戏 |
| `FIXED_HEIGHT` | 竖屏游戏。横屏跑酷不推荐 |
| `FIXED_WIDTH` | 横屏跑酷但会裁剪天空区域 |

---

## 验证方法

1. Cocos Creator 编辑器内点击「预览」，调整预览窗口大小，确认画面比例不变形
2. 微信开发者工具中切换不同机型（iPhone / Android），确认各尺寸下 Player、Ground、障碍物、UI 完整可见
3. 确认触摸操作正常：上半屏跳跃、下半屏下蹲

---

## 相关文件

| 文件 | 作用 |
|------|------|
| `assets/scripts/core/ScreenAdapter.ts` | 屏幕适配核心组件（新建） |
| `assets/scripts/core/GameConfig.ts` | 设计分辨率常量 DESIGN_WIDTH / DESIGN_HEIGHT |
| `assets/scripts/player/PlayerController.ts` | 触摸屏分区（_screenHalfHeight） |
