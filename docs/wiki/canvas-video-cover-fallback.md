---
type: architecture
title: 大画布视频封面回退
description: 视频封面缺失或加载失败时的限流截帧与节点持久化路径。
tags: [canvas, video, poster, performance]
timestamp: 2026-09-24
---

# 大画布视频封面回退

- [视频节点](../../src/components/canvas/nodes/VideoNode.vue)优先显示节点保存的封面，其次尝试云存储视频截帧 URL。节点已由视口可见性控制挂载，封面图片立即加载；封面缺失或图片加载失败时，只为可见节点请求现有的服务端 `extractVideoFrame` 接口。
- [截帧队列](../../src/utils/canvasVideoPosterQueue.js)全画布最多同时运行 2 个请求，节点离开视口或卸载时取消待发请求，避免缩小画布时同时解码大量视频或压满后端。队列不缓存跨会话的封面结果。
- 服务端返回的图片经过浏览器实际加载后才写入节点 `output.cover_url` 和 `output.thumbnailUrl`，并使用现有节点 PATCH 接口同步到工作流数据库。请求失败或返回的图片无法加载时，保留视频首帧回退。
- [并发测试](../../src/utils/canvasVideoPosterQueue.test.mjs)覆盖并发上限、失败后释放槽位和取消排队请求；[节点断言](../../src/components/canvas/nodes/VideoNode.performance.test.mjs)覆盖请求、写回和回退门控；`npm run build` 通过。
- 租户工作流 `790757607123` 的远程数据与浏览器效果仍待验证：七海后端拒绝提供的私钥登录，前端域名 `tv.xlianai.com:22` 连接超时，443 端口没有 SSH 握手。本条不把截图中的黑块直接归因为某一种 URL 或媒体错误。

相关：[R2 视频播放与源文件下载](r2-video-playback.md) · [索引](index.md) · [日志](log.md)。
