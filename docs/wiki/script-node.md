---
type: reference
title: 新版脚本独立节点
description: 脚本三步编辑、资产、双提示词及媒体生成的接入位置。
tags: [canvas, script, storyboard]
timestamp: 2026-10-20
---

# 新版脚本节点

添加节点菜单/工具栏新增“脚本 NEW”，类型为 `script`。连接文本和图片作为输入，支持剧本生成、角色参考生成、手工编写三种入口。

- [ScriptNode](../../src/components/canvas/nodes/ScriptNode.vue)：概览、完成度、快捷重新生成/批量分镜/批量视频/下载，以及只读快照打开。
- [ScriptEditor](../../src/components/canvas/script/ScriptEditor.vue)：确认镜头 → 准备资产 → 合成提示词；多条对白、时长、景别、光影、音效、运镜、资产引用、拖拽排序、色标、双提示词编辑；资产上传、画布/个人库选择、保存个人库；批量选择与模型参数。
- [useScriptDocument](../../src/components/canvas/script/useScriptDocument.js)：立即保存接口、版本冲突可见、任务恢复、逐项媒体提交、结果节点/连线/编组、批处理缺项重试；任务提交响应到达时即使切换画布仍写入原节点。
- [scriptDocument](../../src/utils/scriptDocument.js)：免费自动拼接与带 BOM 的双表 CSV（10列分镜，空行后4列资产），防止电子表格公式注入。

## 与既有生成链路的关系

图片与视频使用已有 `/api/images/generate`、`/api/videos/generate` 及任务查询，按租户模型标识 `value` 提交。图像使用资产参考，视频有分镜图时以它作为首帧。模型列表响应租户配置版本变化。媒体任务成功或失败逐项保留，网络异常保留任务 ID，不因轮询失败直接重复提交。

LLM 任务在后端持续执行。媒体批处理在当前页面逐项提交，切换画布或离开页面后，已提交任务继续在服务端运行，尚未提交项下次通过“生成缺项”继续。不要把这描述成完整的服务端媒体批队列。

## 验证与限制

用户要求不再实测 LibTV 批量视频，因此视频选择与首帧流程按本项目接口实现。浏览器验收采用真实组件/控制器配模拟 API，走通手工三步、资产回填、重新加载、双提示词、CSV导出；未完成真实数据库/上游模型生成闭环。美术风格或镜头内容改变后需用户重新确认/合成，已有图片不会自动重生成。

运行 `node --test src/utils/scriptDocument.test.mjs src/utils/canvasImageResolutionOptions.test.mjs src/utils/canvasTaskResult.test.mjs` 和 `npm run build`。

[开发计划](../superpowers/plans/2026-10-19-script-node.md)；[后端说明](../../../bananaapiserver/docs/wiki/script-node.md)；[租户配置](../../../bananatenantmanager/docs/wiki/script-node.md)。
