---
type: knowledge
title: 画布深夜模式背景与网格颜色
description: 画布背景和网格点的主题色来源。
tags: [canvas, theme, grid]
timestamp: 2026-09-23
---

# 画布深夜模式背景与网格颜色

- 深夜模式的画布背景使用 `src/styles/canvas.css` 中的 `--canvas-bg-primary: #141414`。
- 网格点使用 `--canvas-grid-color: #474747`，由 `src/components/canvas/CanvasBoard.vue` 的 `Background` 组件和 `src/styles/canvas.css` 的 SVG 点样式共同引用。
- 白昼模式在 `:root.canvas-theme-light` 中使用背景 `#f5f5f4` 和网格点 `#b8b4af`，保持与深夜模式相同的 20px 点阵并提高浅色背景上的可见度。

返回 [索引](index.md)。
