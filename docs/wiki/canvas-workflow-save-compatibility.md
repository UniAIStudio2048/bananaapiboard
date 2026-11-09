---
type: guide
title: 画布工作流保存协议兼容性
description: 记录个人旧工作流版本冲突恢复与团队协作保存元数据的边界。
tags: [bananaapiboard, canvas, workflow, collaboration]
timestamp: 2026-11-09
---

# 画布工作流保存协议兼容性

## 保存规则

- [canvasStore](../../src/stores/canvas/canvasStore.js) 只为团队空间导出的完整快照设置 `protocolVersion: 2`、`baseRevision` 和 `collabEpoch`；个人空间继续使用节点版本基线的完整保存路径。
- [CanvasSpaceSwitcher](../../src/components/canvas/CanvasSpaceSwitcher.vue) 保存非活动团队标签时必须携带协作版本、会话 epoch 和节点基线。
- [WorkflowPanel](../../src/components/canvas/WorkflowPanel.vue) 修改已保存工作流描述时，团队工作流同样携带协作元数据，避免被服务端当作旧客户端。
- [workflow API](../../src/api/canvas/workflow.js) 对遗漏协议字段的新建团队保存请求补齐 `protocolVersion: 2` 和初始 `baseRevision`。

## 编辑租约

同一工作流同一时间只有一个标签页可编辑（服务端设计见 [编辑租约](../../../bananaapiserver/docs/wiki/canvas-workflow-edit-lease.md)）。

- [canvasEditLease](../../src/utils/canvasEditLease.js) 维护每个工作流的 `editor` / `readonly` / `pending` / `released` / `unknown` 状态；会话标识复用 `sessionStorage` 的 `canvas_collab_client_id`。
- [workflow API](../../src/api/canvas/workflow.js) 是唯一拦截点：整份保存、`patchWorkflowNode`、`postWorkflowOps` 都携带 `X-Canvas-Session-Id` 与（编辑者的）`X-Canvas-Lease-Token`；只读时直接抛出 `edit_lease_readonly` 不发请求；服务端返回 `edit_lease_lost` / `edit_lease_held` 时切为只读。
- [useCanvasEditLease](../../src/composables/useCanvasEditLease.js) 为每个已打开的工作流标签页获取租约（切换画布标签不释放），每 20 秒心跳，页面关闭时释放；收到交接请求先保存再让出；抢占成功、从只读或已释放重新获得编辑权、只读时编辑方保存后，都从服务端（增量表优先）重新加载并保留视口。
- 只读界面：[CanvasBoard](../../src/components/canvas/CanvasBoard.vue) 的 `editReadonly` 禁止拖拽、连线、选择、双击新建、右键、粘贴和拖入文件；左侧工具栏 `inert`；[CanvasEditLeaseBanner](../../src/components/canvas/CanvasEditLeaseBanner.vue) 显示持有者并提供抢占。
- 租约接口不可用（例如后端未升级）时状态为 `unknown`，按旧协议保存。
- 服务端返回 `missing: true`（节点/连线在增量表中缺失）时，[canvasStore](../../src/stores/canvas/canvasStore.js) 的 `acknowledgeIncrementalResults` 用本地完整数据补发 add。
- 生产环境由 Nginx 提供 `dist` 静态文件：拉取代码后必须重新构建前端，并为 `/ws/` 配置 WebSocket 转发到后端。

## 冲突恢复

- 收到 `version_conflict` 且响应包含 `node_versions` 时，只拉取版本变化的节点，用服务端写回字段（`output`、`status`、`progress`、`error`、`audioUrl`、`audioData`、`scriptDocument`、`scriptSummary`）覆盖本地，其余字段保留本地修改，再按服务端基线重试一次。
- `protocolVersion: 2` 的协作快照仅在持有编辑权时才这样重试；未持有时冲突必须重新加载。
- 个人工作流同时走增量写入与整份保存：增量写入确认的节点版本同步到 `savedNodeVersions`；整份保存前先 flush 增量写入；冲突按每次返回的最新基线最多重试 3 次（2026-11-08 线上 706020456707 提交视频时增量写入在重试间隙推进版本导致二次冲突）。
- 旧任务结果不覆盖重新生成（2026-11-09 海外站视频节点“生成中”跳回旧视频）：[canvasTaskResultGuard](../../src/utils/canvasTaskResultGuard.js) 以本地 `processingStartedAt`（保存与提交前写入）判断，服务端终态结果开始时间更早或缺失、且不是同一 `taskId` 时视为旧任务。冲突重试跳过这类节点，`applyIncrementalNode` 丢弃其结果字段（仍推进版本），[视频提交恢复](../../src/stores/canvas/pendingGenerationSubmissions.js) 丢弃创建时间早于节点本次开始时间的残留提交记录。
- [incrementalWriter](../../src/stores/canvas/incrementalWriter.js) 的 `flush()` 遇到进行中的批次时等待其完成并发出期间新排队的写入，保证整份保存前的 flush 真正落库。
- 本地开发：[vite.config.js](../../vite.config.js) 代理 `/ws`，否则实时推送连不上（线上由 Nginx 转发）。

## 验证

- `node --test src/utils/canvasEditLease.test.mjs src/composables/useCanvasEditLease.test.mjs`
- `node src/api/canvas/workflow.save-versions.test.mjs`
- `node src/stores/canvas/canvasStore.save-versions.test.mjs`
- `node --test src/utils/canvasTaskResultGuard.test.mjs src/stores/canvas/pendingGenerationSubmissions.test.mjs`
- `node src/stores/canvas/incrementalWriter.test.mjs`
- `node src/utils/workflowSaveEntrypoints.test.mjs`
- `npm run build`

相关入口：[索引](index.md) · [变更日志](log.md)。
