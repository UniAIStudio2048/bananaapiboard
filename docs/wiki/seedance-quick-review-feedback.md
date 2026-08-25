---
type: behavior
title: Seedance 快捷角色审核反馈
description: 图像节点快捷角色审核的状态、超时和用户反馈约定。
tags: [canvas, image-node, seedance, asset-review]
timestamp: 2026-08-24
---

# Seedance 快捷角色审核反馈

## 入口与调用链

- 图像节点工具栏的“过审”按钮由 `ImageNode.vue` 的 `handleQuickSeedanceReview` 处理。
- 它先请求活动素材渠道，再创建快捷角色资产，最后通过 `pollAssetStatus` 查询审核结果。
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

- `src/components/canvas/nodes/ImageNode.vue`
- `src/api/canvas/volcengine-assets.js`
- `src/utils/assetReviewStatus.js`
- `src/utils/seedanceQuickAsset.js`

返回 [索引](index.md)，查看 [变更日志](log.md)。
