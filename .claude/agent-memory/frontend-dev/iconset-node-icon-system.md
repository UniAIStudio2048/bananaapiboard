---
name: iconset-node-icon-system
description: 阶段B Icon 体系统一：IconSet.vue 集中 SVG 图标组件与 nodeTypes icon 字段 name 化约定
metadata:
  type: project
---

# IconSet 集中图标系统（bananaapiboard，阶段B）

阶段B（2026-08-03，uidev 分支）落地了集中式内联 SVG 图标体系，双轨并存：A 轨 `@lucide/vue`（通用操作图标）不动；B 轨 `src/components/common/IconSet.vue` 收口业务/品牌图标。

## 关键事实

- `IconSet.vue`：props 为 `name`（必填）、`size`（默认 20）、`class`、`strokeWidth`（默认 2）。用**双 `<script>` 块**（普通 script 声明具名导出 + `<script setup>` 渲染），因为 `<script setup>` 不允许顶层 `export`。
- 具名导出：`nodeTypeIcon(name)`（返回 SVG 声明式数据）、`getIconData(name)`（节点映射优先，其次 `getFeatureIcon` 回退）、`NODE_ICON_DATA`（节点图标映射表，32 个 key）。
- 数据渲染结构：`{ paths, circles, lines, rects, polylines, polygons }`，`rects` 第 5 位是 rx；`lines`/`circles` 为数值数组，`paths`/`polylines`/`polygons` 为字符串数组。
- `src/config/canvas/nodeTypes.js` 的 `NODE_TYPE_CONFIG[*].icon` 已全部从 emoji/字符改为 IconSet 可识别 name（30 个节点类型、30 个唯一 icon 名，如 `text`/`image`/`video`/`audio`/`digital-human`/`director`/`text-image`/`lip-sync`/`seedance-character`）。
- `feature-icons.js` 无需适配——`getFeatureIcon(name)` 返回的对象结构与 IconSet 渲染结构完全一致，直接消费。

## 已知兼容性风险（已解决）

nodeTypes.js 的 `icon` 字段此前被 3 处**直接当文本字符串渲染**，阶段D（2026-08-03）已全部改为 `IconSet` 渲染：
- `src/components/canvas/NodeSelector.vue` 907/925/943/963/970 行：`<IconSet :name="node.icon" :size="16" />`
- `src/components/canvas/nodes/LLMNode.vue` 338 行：`<span class="icon"><IconSet :name="typeConfig.icon" :size="16" /></span>`，且 LLM_TYPES 的 icon 从字符（`A+`/`◎`/`≡`）改为 IconSet name（`llm`/`image-describe`/`expand`）
- `src/components/canvas/NodeContextMenu.vue` 1300 行：`<span class="icon"><IconSet :name="option.icon" :size="14" /></span>`

**Why:** 阶段B 技术约束为"不要改其他组件文件"，只改了 nodeTypes.js 与新建 IconSet.vue，故消费点兼容留到 C/D。
**How to apply:** 后续改节点图标或做节点外壳统一时，直接以 `NODE_TYPE_CONFIG[*].icon` 为 name 传入 `IconSet` / `nodeTypeIcon`；新增节点类型必须保证 icon 值在 `NODE_ICON_DATA` 或 feature-icons 中可解析。注意 `CanvasToolbar.vue` 的 nodeTypes 仍是硬编码字符（`Aa`/`◫`/`▷`/`♪`），与 IconSet 无关，未改。
