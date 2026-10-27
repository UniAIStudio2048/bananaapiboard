---
type: feature
title: 画布外部剪贴板粘贴
description: 画布接收外部复制的图片文件和纯文本，并在鼠标位置创建对应节点。
tags: [bananaapiboard, canvas, clipboard]
timestamp: 2026-10-27
---

# 画布外部剪贴板粘贴

## 行为

- 画布空白区域收到系统剪贴板的图片、视频或音频文件时，沿用文件粘贴上传流程。
- 收到 `text/plain` 且没有文件时，创建一个 `text-input` 节点，并保留原始文本（包括首尾空白）。
- 节点剪贴板仍优先于系统剪贴板，保证画布节点 `Ctrl+C` 后可以重复 `Ctrl+V`。
- 输入框、文本域和 `contenteditable` 区域不由画布接管粘贴，保留浏览器编辑行为。

## 实现与验证

- 来源识别：[`src/utils/canvasClipboardPaste.js`](../../src/utils/canvasClipboardPaste.js)。
- 画布处理：[`src/components/canvas/CanvasBoard.vue`](../../src/components/canvas/CanvasBoard.vue)。
- 回归测试：[`src/utils/canvasClipboardPaste.test.mjs`](../../src/utils/canvasClipboardPaste.test.mjs)、[`src/components/canvas/CanvasBoard.clipboard-paste.test.mjs`](../../src/components/canvas/CanvasBoard.clipboard-paste.test.mjs)。
- 验证命令：`node src/utils/canvasClipboardPaste.test.mjs`、`node src/components/canvas/CanvasBoard.clipboard-paste.test.mjs`、`npm run build`。

返回[用户前端知识库索引](index.md)。
