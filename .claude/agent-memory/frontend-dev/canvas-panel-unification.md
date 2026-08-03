---
name: canvas-panel-unification
description: 阶段C1 画布侧栏面板视觉统一：.canvas-panel 共享类 + 按钮三级 + lucide 图标替换约定
metadata:
  type: project
---

# 画布面板统一（bananaapiboard，阶段C1）

阶段C1（2026-08-03，uidev 分支）统一 5 个画布侧栏面板（Workflow/Asset/History/AIAssistant/Skills）+ CanvasToolbar 视觉，只改外壳层 + 头部按钮，不动面板内部业务逻辑。

## canvas.css 共享类（阶段C1 新增，位于文件末尾）

- `.canvas-panel`：surface-1 背景（`--canvas-bg-secondary`）+ hairline 边框（`--canvas-border-subtle`）+ radius **12px** + 文本 primary。已加到 5 个面板外壳元素上（`class="xxx-panel canvas-panel"`）。
- `.canvas-panel-header / .canvas-panel-title / .canvas-panel-actions / .canvas-panel-close`：统一头部模式（padding 16px 20px、hairline 底边、32px 圆角关闭钮）。
- `.canvas-tool-btn`：画布工具按钮 32px 方形 / radius 8px / hover `--canvas-bg-tertiary`（surface-2 抬升）。
- 按钮分级：`.canvas-panel .btn-primary`（香蕉黄 `--canvas-accent-banana`，主）/ `.btn-secondary`（surface 抬升 + hairline）/ `.btn-ghost`（纯文本）。**只在 `.canvas-panel` 作用域内生效**，避免影响主站与 UserProfilePanel 等其它 `.btn-*` 用法。

## 关键约定

- **画布内一律用 `--canvas-*` token，不用 Tailwind `bg-surface-*`/`border-hairline`**：那组解析为 `--theme-*` 变量，只在主站 `.theme-light/.theme-dark` 上定义；画布页主题走 `:root.canvas-theme-light`（Canvas.vue 的 `root.classList` 切换），Tailwind surface 类在画布暗色下会回退到亮色值。
- 面板圆角统一 **12px**（不用 `--canvas-radius-lg`=16px）；工具按钮 8px。均用字面量，未改 `--canvas-radius-*` 变量值（那会影响节点等其它组件，属后续阶段）。
- 面板视觉值收敛到 scoped 样式（scoped (0,2,0) 压过全局 `.canvas-panel` (0,1,0)），所以 5 个面板的 scoped 外壳/头部/按钮值也改成同款 token，两处一致。
- AIAssistantPanel 是右 dock 面板，radius 为 `12px 0 0 12px`，左侧 hairline 边框；头部保留品牌渐变 sparkle（`fill="url(#gradient)"`，非 stroke 结构，未替换）。
- SkillsPanel 是居中 modal，外壳/头部同款 token；其 `.skills-actions button` scoped 视觉移除，改为 `btn-primary`/`btn-secondary` 分级类控制。SkillsPanel.source.test.mjs 断言 light 模式 `.skills-panel` bg 为 `rgba(255,255,255,0.98)`，保留未动。

## lucide 图标替换（C1-2）

- CanvasToolbar 3 个内联 SVG → `Workflow`/`History`/`Save`，size 18；`.icon-btn` 32px。
- 面板头部按钮内联 SVG → lucide：WorkflowPanel（`Workflow`/`X`/`User`/`LayoutGrid`/`Search`/`Plus`/`Folder`）、AssetPanel（`SlidersHorizontal`/`Maximize2`/`Minimize2`/`X`）、HistoryPanel（`History`/`SquareCheck`/`Maximize2`/`Minimize2`/`X`）、AIAssistantPanel（`MessageSquarePlus`/`History`/`Sparkle`/`X`）、SkillsPanel（`X` 替代 × 字符）。
- **未替换（保留）**：面板 body 内部图标（列表项/空状态/右键菜单）、CanvasToolbar 节点类型字符图标（`Aa`/`◫`/`▷`/`♪`，硬编码字符，见 [[nodeshell-unification]] 遗留）、AI 头部品牌渐变 sparkle、`+`/`↑` 文本字符。

## 相关记忆

- [[nodeshell-unification]]：节点外壳统一 + `--canvas-accent-*` token 注意点。
- [[iconset-node-icon-system]]：IconSet 节点图标体系。

**Why:** 阶段C1 只做画布面板外壳视觉统一，body 内部图标与节点图标消费处（NodeSelector/LLMNode/NodeContextMenu）属后续阶段。
**How to apply:** 后续阶段统一面板内部或节点图标时，优先用 lucide + 上述共享类；画布样式一律 `--canvas-*` token。
