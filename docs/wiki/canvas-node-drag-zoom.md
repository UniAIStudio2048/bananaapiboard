---
type: knowledge
title: 画布放大后的节点拖动与网格吸附
description: 节点拖动过程连续跟随指针，释放时再按网格或对齐辅助线确定位置。
tags: [canvas, drag, zoom, grid]
timestamp: 2026-09-23
---

# 画布放大后的节点拖动与网格吸附

- [CanvasBoard.vue](../../src/components/canvas/CanvasBoard.vue) 使用 Vue Flow 拖动节点。默认开启的 20 画布单位网格若用于每一帧取整，缩放至 126% 时节点会以约 25.2 屏幕像素为步长移动，表现为跳位。
- Vue Flow 拖动期间关闭内置网格吸附；节点释放时由 [canvasDragPositions.js](../../src/utils/canvasDragPositions.js) 计算最终位置。开启网格开关时按 20 画布单位吸附，关闭时保留精确位置；对齐辅助线的位置优先于网格。
- 多选拖动将主节点的最终位移统一应用到所有被拖节点，保持节点间距。对应测试见 [canvasDragPositions.test.mjs](../../src/utils/canvasDragPositions.test.mjs) 和 [CanvasBoard.multi-node-drag.test.mjs](../../src/components/canvas/CanvasBoard.multi-node-drag.test.mjs)。

返回 [索引](index.md)。
