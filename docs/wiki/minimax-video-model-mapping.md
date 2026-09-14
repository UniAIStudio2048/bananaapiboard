---
type: troubleshooting
title: MiniMax 视频模型展示与生成方式
description: 后台独立模型在画布中的身份、名称、分组及模式映射。
tags: [canvas, video, minimax, atlascloud]
timestamp: 2026-09-14
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

## AtlasCloud 画布素材路由（2026-09-14）

- 公开配置确认 `wan3.0` 的内部名称为 `atlascloud-h3-t2v-copy-wan`，顶层仍使用 `atlascloud-video-t2v`。显示名称不决定请求身份。
- AtlasCloud H3 样式的画布下拉始终展示三种模式：无素材仅 `text2video` 可选；单图允许手动选择 `image2video_first` 或 `multimodal_ref`；多图或任何视频/音频仅 `multimodal_ref` 可选。不适用选项保留显示但置灰、禁用点击。
- 素材变化时仅修正失效模式；保留有效的人工选择。监听器不再监听模式本身，避免单图手选参考后又被重置成图生。专用 `atlascloud-wan3` 的文件和链接模式在没有连线素材时沿用原有保留行为。
- 排队任务提交使用捕获的模型名称、H3 模式及视频/音频列表，避免图片上传、画布保存期间切换到 RouterBee 后把 `model` 改为 `wan-3.0`。音视频 blob 上传完成后更新请求快照；上传失败中止本次提交。
- AtlasCloud 参考模式允许只有音频的素材组合。模式变化沿用节点已有的 `updateNodeData` 持久化流程。
- [行为回归测试](../../src/components/canvas/nodes/VideoNode.atlascloud-routing.test.mjs) 覆盖模型切换竞态、素材增减、单独音频校验和排队任务素材保留。后端按真实模型后缀隔离三种渠道，见 [WAN 3.0 渠道路由](../../../bananaapiserver/docs/wiki/atlascloud-wan3-image-input.md)。
- 用户反馈后新增手动模式保留、无素材/单图/多素材可选范围及禁用选择测试；前端相关 40 项通过。另使用 Chromium 渲染源码中的下拉按钮模板和样式，验证单图两种模式实际点击、无素材禁用，以及禁用项 `opacity: 0.35`；这是组件级浏览器验证，不是收费生成端到端实测。
- 扩展检查发现 `VideoNode.omni-reference-compat.test.mjs` 仍断言旧 `/api/videos/upload`，但源码已使用 `uploadCanvasMedia`；修改前 `HEAD` 同样不满足该断言，此次未改动这项既有问题。
- GitNexus 初次刷新遇到 WAL 检查点错误，默认 512KB 限制跳过大型 `VideoNode.vue`；使用 `gitnexus analyze --force --index-only --max-file-size 2048 --workers 4 --wal-checkpoint-threshold 268435456` 重建成功。
- 重建后 `handleGenerate`、`sendGenerateRequest`、`processGenerationInBackground`、`ensureReferenceVideoUrlsAccessible` 的 upstream 影响分析均为 LOW，直接调用方数量分别为 3、1、1、1，集中于画布生成流程。
- `gitnexus detect-changes --scope all` 整体扫描标记 CRITICAL，列出 22 条经过这些共用生成函数的执行流程；逐函数 LOW 不抵消整体扫描提示。已向用户说明此差异，验证限于相关回归、构建和本地服务检查，未进行收费生成的浏览器端到端验收。

## 来源与验证命令

### 本机网站构建生效验证（2026-09-14）

- `bananahub.cc` 的 Nginx 站点直接读取 `/opt/banana/bananaapiboard/dist`，3000 端口是独立 Vite 开发服务。
- 执行 `npm run build` 成功；通过 `curl --resolve bananahub.cc:443:127.0.0.1` 检查站点 HTTPS，首页与 `dist/index.html` 完全一致，入口 JS、CSS、Vue vendor 和画布脚本的 SHA-256 与本地构建文件一致。
- 手动模式修复后的画布资源为 `/assets/canvas-n5L76b8x.js`，站点返回内容与新构建 SHA-256 一致。这是本机站点生效验证，不代表浏览器已刷掉旧页面或视频生成实测通过。
- Nginx reload 权限不可用；静态产物已被运行中的 Nginx 正确返回，无需修改站点配置。

2026-09-14 专项验证：

```bash
node --test src/components/canvas/nodes/VideoNode.atlascloud-routing.test.mjs src/utils/videoGenerationMode.test.mjs src/components/canvas/nodes/VideoNode.minimax-modes.test.mjs src/components/canvas/nodes/VideoNode.atlascloud-resolutions.test.mjs src/config/tenant.atlascloud-video-group.test.mjs
node --test src/components/canvas/nodes/VideoNode.reference-audio-upload.test.mjs src/components/canvas/nodes/VideoNode.seedance-multimedia.test.mjs src/components/canvas/nodes/VideoNode.wan3-default-mode.test.mjs src/components/canvas/nodes/VideoNode.mode-selector.test.mjs src/components/canvas/nodes/VideoNode.canvas-persistence.source.test.mjs src/components/canvas/nodes/VideoNode.client-submission.source.test.mjs
npm run build
```

相关行为测试通过，Vite 构建通过；未调用收费上游生成，未验证成片效果。构建保留现有大包和混合动态/静态导入警告。

- [模型列表映射](../../src/config/tenant.js)
- [画布视频节点](../../src/components/canvas/nodes/VideoNode.vue)
- [模型数量、名称和渠道隔离测试](../../src/config/tenant.atlascloud-video-group.test.mjs)
- [模式下拉回归测试](../../src/components/canvas/nodes/VideoNode.minimax-modes.test.mjs)
- [后端模型路由约束](../../../bananaapiserver/docs/wiki/atlascloud-model-isolation.md)

运行 `node --test src/config/tenant.atlascloud-video-group.test.mjs src/components/canvas/nodes/VideoNode.minimax-modes.test.mjs` 和 `npm run build`。

GitNexus 对 `getAvailableVideoModels` 标记 HIGH（8 个直接调用方、13 个受影响符号）；用户于 2026-09-13 确认修改 AtlasCloud 分支。共用列表的入口包括画布、视频生成页、AI 助手和节点选择器。

返回 [索引](index.md)，查看 [变更日志](log.md)。
