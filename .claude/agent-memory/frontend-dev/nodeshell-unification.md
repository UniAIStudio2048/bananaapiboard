---
name: nodeshell-unification
description: 阶段D 节点外壳统一：NodeShell.vue 头部规范 + 三态/选中态收敛到 canvas.css 统一 token
metadata:
  type: project
---

# NodeShell 外壳统一（bananaapiboard，阶段D）

阶段D（2026-08-03，uidev 分支）完成节点外壳统一，**只改外壳层**（NodeShell.vue + canvas.css），核心大文件零改动。

## NodeShell.vue（虚拟化轻骨架）

- 接口不变：`props` 仍为 `id` / `data` / `type` / `selected`。VirtualizedNode HOC 以 `h(NodeShell, { id, data, type, selected })` 透传，详见 `src/components/canvas/VirtualizedNode.js`。
- 头部规范：「24px 圆角方块底（`--canvas-bg-tertiary`=surface-2）+ 16px IconSet 图标」→「类别色小圆点（取 `NODE_TYPE_CONFIG[type].color`）+ 类别名」→「标题（flex:1）」→「右侧状态徽标（运行中/完成/失败）」。
- 类别名来源：`NODE_CATEGORIES[key].label`，未覆盖的 `edit`/`video`/`character` 用本地 `FALLBACK_CATEGORY_LABELS` 兜底。
- 画布统一注册的别名节点类型（`image`/`image-gen`/`video`/`video-gen`/`audio`/`llm`/`character-card`/`bytefor-character`）**不是** NODE_TYPE_CONFIG 的 key，NodeShell 用 `TYPE_ICON_ALIAS` 映射到规范图标名。
- 设计铁律不变：不连 Pinia、不订阅 useVueFlow、不挂 Handle，模板保持 <60 行 DOM。

## 三态/选中态（收敛到 canvas.css）

- 样式放在 `src/styles/canvas.css` 的 `.vue-flow__node .canvas-node-shell[...]` 全局规则（特异性 (0,3,0) 压过 scoped 的 base 1px 边框 (0,2,0)，不受 CSS 顺序影响）。
- 三态：running/processing=warning（`--canvas-accent-warning` + `canvasShellGlowWarning` 脉冲动画）；completed/success=success（`--canvas-accent-success`）；failed/error=error（`--canvas-accent-error`），均 1px 边框 + 辉光。
- 选中态：`--canvas-accent-primary` 蓝，1.5px 边框 + `0 0 0 4px rgba(59,130,246,.15)` 光晕，**不改成香蕉黄**。
- **注意：canvas.css 实际 token 是 `--canvas-accent-warning/success/error/primary`，不是 spec 里写的 `--canvas-color-*`**（`--canvas-color-*` 不存在）。

## 手柄（D-3）

`.vue-flow__handle:hover` 的 `transform: scale(1.2)` → `scale(1.25)`；connecting 蓝色光晕保持 `0 0 0 4px rgba(59,130,246,0.2)`。

## 遗留：各节点自带外观样式（建议后续单独收敛）

核心节点（ImageNode/VideoNode/TextNode/AudioNode/SeedanceCharacterNode/StoryboardNode）仍用 `.node-card` + 各自的 header/badge 类（如 `reference-header`、`edit-saving-badge`、`heygen-digital-human-badge`），三态/选中态各自实现，**未统一**。CanvasToolbar.vue 的 nodeTypes 图标仍是硬编码字符。这些均不在阶段D 范围，改动风险高（大文件），建议后续单独收敛。

**Why:** 阶段D 技术约束为只改外壳层，核心节点 1.3-1.4 万行，改内部外观回归风险高。
**How to apply:** 后续统一真实节点外观时，对照 NODE_TYPE_CONFIG 的 icon/category/color 与 canvas.css 的 `--canvas-accent-*` token；三态/选中态以 `.vue-flow__node .canvas-node-shell` 规则为参考样板。
