---
type: behavior
title: Seedance 快捷角色审核反馈
description: 媒体节点的多渠道快捷审核与自动过审用户偏好。
tags: [canvas, seedance, asset-review, tokenhub]
timestamp: 2026-11-03
---

# Seedance 快捷角色审核反馈

## 入口与调用链

- 图片、视频、音频节点工具栏共用 `SeedanceReviewButton.vue` 和 `createSeedanceReviewController`。
- 它先通过 `/api/volcengine-asset/providers` 读取当前租户已启用且支持该媒体类型的渠道；多个渠道显示下拉框，一个渠道直接使用，无可用渠道时报错。
- 渠道请求只合并相同租户及用户正在进行的请求，完成后释放，不缓存开关结果。
- 已审核或审核中的素材改选另一渠道时允许重新提交；轮询保留创建时的渠道身份。
- 节点数据中的 `seedanceQuickAsset` 保存审核状态、资产 URI、有效期和失败原因。

## 状态约定

| 上游状态 | 前端状态 | 节点显示 |
| --- | --- | --- |
| `Active`、`approved`、`success`、`succeeded`、`completed` | `Active` | 已过审 |
| `Failed`、`rejected`、`blocked`、`error`、`timeout`、`timed_out`、`expired` | `Failed` | 审核失败，重试 |
| 其他或缺失状态 | `Processing` | 审核中 |

轮询期间的状态会立即写回节点；失败原因也会保留在节点数据中并显示在按钮提示中。这样短暂的 toast 消失后，失败仍可见且可重试。

## 超时边界

- 获取渠道和查询资产状态：30 秒。
- 提交快捷角色审核：150 秒，兼容渠道处理图片时较长的创建时间。
- 浏览器请求超时统一抛出 `TIMEOUT`，由图像节点显示明确的失败提示。

## 相关源码

- [共享审核按钮](../../src/components/canvas/SeedanceReviewButton.vue)、[控制器](../../src/utils/seedanceReviewController.js)
- [审核 API](../../src/api/canvas/volcengine-assets.js)
- [审核状态](../../src/utils/assetReviewStatus.js)、[快捷资产状态](../../src/utils/seedanceQuickAsset.js)

## 自动过审偏好

- 视频节点绑定官方、星辰或天枢素材渠道时，底部“高级设置”的自动校验素材默认开启，涵盖连线中的图片、视频和音频。
- 开关通过 `/api/user/preferences` 立即写入 `preferences.canvas.autoReviewMaterials[model]`，服务端成功后更新界面；写入失败保留原值。
- 用户偏好优先于旧节点的 `data.autoReviewMaterials[model]`，新建节点及重新登录后沿用该模型的用户偏好；未设置的模型默认开启。
- [偏好规则](../../src/utils/seedanceAutoReview.js)、[视频节点及持久化测试](../../src/components/canvas/nodes/VideoNode.auto-review.test.mjs)

## 验证边界

- 审核控制器、组件渲染、偏好持久化、渠道请求隔离及既有素材回归通过；Vue 模板渲染验证覆盖单渠道无下拉和多渠道选择。
- 用户前端 `npm run build` 通过。未执行线上浏览器交互联调或真实上游创建审核任务。

## bananahub.cc 发布状态（2026-11-03）

- Nginx 直接提供用户前端 `dist`；`https://bananahub.cc/canvas` 的 HTML、入口资源以及 `Canvas` / `canvas` 分块与本次构建逐项比对一致。
- 后端已重启，素材渠道同时启用星辰和天枢；公开品牌配置已返回天枢 2.0 / 2.5 的正确审核绑定，两个上游素材渠道只读连接测试均通过。
- 未批量修改用户偏好，已有关闭选择继续保留；未设置偏好的模型按默认开启规则执行。

返回 [索引](index.md)，查看 [变更日志](log.md)。
