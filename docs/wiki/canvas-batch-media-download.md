---
type: guide
title: 画布多选媒体下载
description: 多选节点右键菜单的媒体过滤与下载路径。
tags: [bananaapiboard, canvas, download]
timestamp: 2026-09-23
---

# 画布多选媒体下载

- 多选节点后，在画布空白处或已选节点上右键，可通过“下载选中媒体”逐个触发下载；右键未选节点仍打开单节点菜单。来源：[CanvasBoard.vue](../../src/components/canvas/CanvasBoard.vue)、[CanvasContextMenu.vue](../../src/components/canvas/CanvasContextMenu.vue)。
- 批量选择优先使用 `selectedNodeIds`，没有多选列表时回退到 `selectedNodeId`；仅保留有图片、视频或音频的节点，并按选择顺序去重。文本及无媒体节点跳过。来源：[canvasBatchDownload.js](../../src/utils/canvasBatchDownload.js)、[canvasDirectory.js](../../src/utils/canvasDirectory.js)。
- 下载复用单节点文件名及流式下载路径，两个文件的触发间隔为 500 毫秒；前端只能确认下载已触发，实际保存仍由浏览器控制。来源：[Canvas.vue](../../src/views/Canvas.vue)、[client.js](../../src/api/client.js)。

返回 [索引](index.md)。
