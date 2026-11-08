---
type: guide
title: 画布工作流保存协议兼容性
description: 记录个人旧工作流版本冲突恢复与团队协作保存元数据的边界。
tags: [bananaapiboard, canvas, workflow, collaboration]
timestamp: 2026-11-08
---

# 画布工作流保存协议兼容性

## 保存规则

- [canvasStore](../../src/stores/canvas/canvasStore.js) 只为团队空间导出的完整快照设置 `protocolVersion: 2`、`baseRevision` 和 `collabEpoch`；个人空间继续使用节点版本基线的完整保存路径。
- [CanvasSpaceSwitcher](../../src/components/canvas/CanvasSpaceSwitcher.vue) 保存非活动团队标签时必须携带协作版本、会话 epoch 和节点基线。
- [WorkflowPanel](../../src/components/canvas/WorkflowPanel.vue) 修改已保存工作流描述时，团队工作流同样携带协作元数据，避免被服务端当作旧客户端。
- [workflow API](../../src/api/canvas/workflow.js) 对遗漏协议字段的新建团队保存请求补齐 `protocolVersion: 2` 和初始 `baseRevision`。

## 旧工作流冲突恢复

- [workflow API](../../src/api/canvas/workflow.js) 收到 `version_conflict` 且响应包含 `node_versions` 时，只对非协作协议的完整快照刷新节点基线并重试一次。
- `protocolVersion: 2` 的协作快照不自动重试；发生冲突时必须重新加载，防止旧快照覆盖其他成员的节点。

## 验证

- `node src/api/canvas/workflow.save-versions.test.mjs`
- `node src/stores/canvas/canvasStore.save-versions.test.mjs`
- `node src/utils/workflowSaveEntrypoints.test.mjs`
- `npm run build`

相关入口：[索引](index.md) · [变更日志](log.md)。
