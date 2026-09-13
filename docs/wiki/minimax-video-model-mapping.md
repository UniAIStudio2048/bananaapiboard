---
type: troubleshooting
title: MiniMax 视频模型展示与生成方式
description: 后台独立模型在画布中的身份、名称、分组及模式映射。
tags: [canvas, video, minimax, atlascloud]
timestamp: 2026-09-13
---

# MiniMax 视频模型展示与生成方式

- `video_models` 中每个启用的 AtlasCloud 模型保留独立入口，`value` 使用后台 `name`；相同渠道、API 类型或上游模型名不是合并依据。
- 显示名称优先使用 `displayName`，其次使用租户 `modelNames.video`，最后回退到 `name`；分组和顺序沿用 `video_model_groups`。
- 每个模型仅聚合自身渠道的生成能力。公开配置没有 `channels` 时使用自身顶层 `supportedModes`，保留连接图片后的 `i2v` 可见性。
- 画布 MiniMax H3 下拉仅包含以下三类，并按 `minimaxConfig.supportedModes` 过滤明确禁用的模式。

| 显示名称 | 请求模式值 |
| --- | --- |
| 文生视频 | `text2video` |
| 图生视频 | `image2video_first` |
| 参考生视频 | `multimodal_ref` |

## AtlasCloud 分辨率

- 画布的 AtlasCloud 分辨率列表优先读取 `resolutionPricing` 中启用的档位，再按 `displayResolutions` 过滤；没有计费档位时保留旧版 `768P / 2K` 回退。
- 选项值保留后台键名（如 `480p`），显示标签转为 `480P`；已有计费工具按不区分大小写的分辨率匹配单价。
- H3 Max Turbo 副本当前后台启用 `480p / 768P`、禁用 `2k`；画布按配置展示，不再受写死的 `768P / 2K` 列表限制。
- [分辨率与计费回归测试](../../src/components/canvas/nodes/VideoNode.atlascloud-resolutions.test.mjs) 覆盖 480P 显示、禁用 2K、显式隐藏与旧配置回退。

## 来源与验证

- [模型列表映射](../../src/config/tenant.js)
- [画布视频节点](../../src/components/canvas/nodes/VideoNode.vue)
- [模型数量、名称和渠道隔离测试](../../src/config/tenant.atlascloud-video-group.test.mjs)
- [模式下拉回归测试](../../src/components/canvas/nodes/VideoNode.minimax-modes.test.mjs)
- [后端模型路由约束](../../../bananaapiserver/docs/wiki/atlascloud-model-isolation.md)

运行 `node --test src/config/tenant.atlascloud-video-group.test.mjs src/components/canvas/nodes/VideoNode.minimax-modes.test.mjs` 和 `npm run build`。

GitNexus 对 `getAvailableVideoModels` 标记 HIGH（8 个直接调用方、13 个受影响符号）；用户于 2026-09-13 确认修改 AtlasCloud 分支。共用列表的入口包括画布、视频生成页、AI 助手和节点选择器。

返回 [索引](index.md)，查看 [变更日志](log.md)。
