---
type: reference
title: 画布视频工具栏交互稳定性
description: 视频节点片段截取与画面裁切工具的指针事件隔离和操作层生命周期约束。
tags: [bananaapiboard, canvas, video, interaction]
timestamp: 2026-11-07
---

# 画布视频工具栏交互稳定性

## 2026-11-07：片段截取与画面裁切点击闪退

- 现象：视频节点上方的“片段截取”和“画面裁切”点击后，操作区域短暂出现后消失，无法继续拖动时间范围或裁剪框。
- 根因：视频工具栏没有使用 Vue Flow 的 `nodrag` / `nopan` 交互隔离；同时片段时间轴和裁剪层的挂载条件、关闭监听依赖 `showToolbar`。指针事件导致节点选中态短暂变化时，操作层被立即卸载。
- 修复：工具栏拦截 `pointerdown` / `mousedown` 并加入 `nodrag nopan nowheel`；活动的片段截取和画面裁切会话独立于工具栏可见状态保持挂载，只在用户关闭、完成或源视频变化时退出。
- 验证：视频工具相关 Node 回归 15 项、裁剪/片段工具函数 10 项通过；`npm run build` 通过；Chromium 热加载点击两个入口后，`.segment-clip-bar`、`.crop-surface` 和裁剪控制区均保持可见，未新增控制台错误。

## 2026-11-07：画面裁切快捷比例

- 底部裁切控制条新增比例菜单，提供 `16:9`、`9:16`、`1:1`、`3:4`、`4:3`、`21:9` 六个快捷选项，不包含智能/自适应比例。
- 选择比例后，裁切框保持当前中心点，在当前选区内按视频原始尺寸调整为目标比例；最终仍通过原有像素裁切接口生成结果视频。
- 比例计算位于 `src/utils/videoFrameCrop.js`，组件通过 `aspectRatio` 属性接收控制条选中的比例。

## 2026-11-07：片段截取整数吸附与空格播放

- 开启整数秒吸附后，当前选区先归一到视频时长范围内的整数秒；拖拽开始或结束边缘时始终取最近整数秒，不再只在距离整数 `0.1` 秒以内才吸附。
- 片段截取栏的空格快捷键兼容 `KeyboardEvent.key` 的空格写法以及 `code: 'Space'`，在非按钮焦点下切换播放和暂停；按钮焦点仍保留浏览器原生空格操作。
- 相关回归覆盖 `VideoSegmentClipBar` 键盘处理、整数吸附边界、片段节点导出流程和视频片段工具函数。

[知识库索引](index.md) · [变更记录](log.md) · [视频节点片段剪辑与草稿保存](../../../docs/video-node-clip-editing.md)

## 来源

- [视频节点](../../src/components/canvas/nodes/VideoNode.vue)
- [片段截取栏](../../src/components/canvas/VideoSegmentClipBar.vue)
- [画面裁切层](../../src/components/canvas/VideoFrameCropOverlay.vue)
- [视频工具栏回归](../../src/components/canvas/nodes/VideoNode.video-tools-actions.test.mjs)
