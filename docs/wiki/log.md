---
type: log
title: 用户前端知识库变更日志
tags: [bananaapiboard, canvas, wiki]
timestamp: 2026-09-24
---

# 变更日志

## 2026-09-24

- 新增 [大画布视频封面回退](canvas-video-cover-fallback.md)：记录可见节点限流截帧、成功图片持久化和远程验证限制。

- 更新 [画布历史记录与资产筛选栏布局](canvas-history-filters-layout.md)：撤回搜索宽度限制，搜索框与分类标签统一高度，资产放大视图使用紧凑筛选栏。

- 新增 [画布历史记录与资产筛选栏布局](canvas-history-filters-layout.md)：压缩历史记录全屏筛选区高度；侧栏和窄屏采用两行，相关测试与前端构建通过。

## 2026-09-23

- 新增 [画布放大后的节点拖动与网格吸附](canvas-node-drag-zoom.md)：记录高缩放下逐帧网格取整导致的跳位，以及释放时吸附的行为。

- 调整 [画布深夜模式背景与网格颜色](canvas-dark-grid-colors.md)：白昼模式网格点加深，以便在浅色画布上清晰显示同样的点阵。

- 新增 [画布深夜模式背景与网格颜色](canvas-dark-grid-colors.md)：记录深夜模式背景和网格点的新色值及白昼模式配色。

- 新增 [画布多选媒体下载](canvas-batch-media-download.md)：记录多选菜单入口、媒体范围和既有下载流程。

## 2026-09-14

- 新增 [R2 视频播放与源文件下载](r2-video-playback.md)：Stream/R2 HLS 播放切换、失败回退和下载一致性验证。

- 修正 [AtlasCloud 手动模式与禁用规则](minimax-video-model-mapping.md)：单图可在图生和参考之间手选，无素材仅文生可选，其他项置灰；移除覆盖人工选择的监听行为，并通过 Chromium 组件交互验证。

- 按用户要求重新构建并验证 [AtlasCloud 画布修复生效](minimax-video-model-mapping.md)：网站 HTTPS 返回的首页和入口/画布静态资源与新 `dist` 一致。

- 更新 [MiniMax 视频模型展示与生成方式](minimax-video-model-mapping.md)：记录 AtlasCloud 按连线素材切换模式、排队请求保留模型与音视频素材、音频输入校验，以及 GitNexus 和既有 Omni 源码断言的验证限制。

## 2026-09-13

- 更新 [MiniMax 视频模型展示与生成方式](minimax-video-model-mapping.md)：AtlasCloud 分辨率改用后台启用的计费档位，支持副本模型 480P，并保留显示过滤和旧配置回退。
- 新增 [MiniMax 视频模型展示与生成方式](minimax-video-model-mapping.md)：记录取消跨模型合并、保留后台名称和分组、三种生成方式及图片输入能力兼容。

## 2026-08-24

- 新增 [Seedance 快捷角色审核反馈](seedance-quick-review-feedback.md)：记录图像节点快捷审核的终态兼容、超时反馈与节点状态规则。

返回 [索引](index.md)。
