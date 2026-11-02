---
type: reference
title: 画布历史选择与音频卡片
description: 历史选择弹窗与侧栏共享紧凑瀑布流，音频使用节点风格的波形试听卡片。
tags: [canvas, history, audio, ui]
timestamp: 2026-11-02
---

# 画布历史选择与音频卡片

## 布局

- [HistoryPanel.vue](../../src/components/canvas/HistoryPanel.vue) 同时承担左侧历史记录与右键“从生成历史选择”。原选择入口只启用了全屏外壳，但列数仍按侧栏的两列计算，导致大图被拉伸显示。
- 两个入口现在通过 `useElementSize(scrollContainerRef)` 获取内容宽度，每约 220px 分配一列，限制为 1–6 列。选择模式和展开历史使用同一组瀑布流间距。
- 图片、视频继续保留原始比例；音频根据播放器内容自适应高度，避免正方形空占位。

## 音频试听

- [HistoryAudioCard.vue](../../src/components/canvas/HistoryAudioCard.vue) 沿用 [AudioNode.vue](../../src/components/canvas/nodes/AudioNode.vue) 的灰色波形区、白色波形条、红色播放线、圆形播放键和时间显示。
- 波形条为与节点一致的示意样式，不额外下载整段音频提取振幅；播放线与时间来自实际音频元素。
- 使用 `preload="none"`，点击后才加载媒体；未知时长显示 `--:--`，加载元数据后更新。
- 播放和进度条阻止事件冒泡，不切换选择、不打开预览；卡片标题和空白区沿用原来的选择/预览行为。
- 同时只播放一个历史卡片音频；切换记录、筛选卸载、关闭面板、打开全屏预览时暂停。加载失败显示可重试提示。
- 选择结果继续通过原 `select-history` → Canvas 插入与立即保存链路，不改变持久化、历史保留或权限规则。

## 验证

- [定向回归](../../src/components/canvas/HistoryPanel.compact-media.test.mjs) 先复现旧选择弹窗 `2 !== 6`，新增 5 项验证列数、播放失败重试、互斥播放、进度限制及事件隔离。
- 除下述已知旧断言外，`HistoryPanel*.test.mjs`、`Canvas.history-picker.test.mjs`、`historyAspectRatio.test.mjs`、`historyMediaDetails.test.mjs` 共 30 项通过；`npm run build` 通过。
- `HistoryPanel.model-display.test.mjs` 仍要求旧的 `info-tag` 模板，而当前详情已使用新结构；该断言在修改前 `HEAD` 和工作区均失败，未在此任务中修改。
- Playwright 隔离挂载真实组件并拦截历史 API，使用本地 WAV 实际播放：试听/进度不误选，第二条开始时第一条暂停，关闭停止播放，图片与音频混合选择正确返回。
- 左侧历史两列，展开和右键选择在 1600px 视口同为六列、单卡约 216px；390/768/1024px 分别为 1/3/4 列，无面板横向溢出，底部确认按钮可见。明暗主题截图人工检查通过。
- 浏览器测试使用示例历史，未写入真实租户或部署生产。预览页 Vite HMR WebSocket 被浏览器本地网络检查拦截，使用重新加载获取当前源码。
- GitNexus 修改前影响检查为 LOW；交付扫描的旧索引行号映射与当前函数位置有偏差，因此另以实际 `git diff` 核对修改范围，未将扫描中出现的相邻函数名当作实际改动。

相关：[历史筛选栏布局](canvas-history-filters-layout.md)、[索引](index.md)、[变更日志](log.md)。
