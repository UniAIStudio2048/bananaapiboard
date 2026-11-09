---
type: architecture
title: 用户端 R2 图片预览
description: 画布和历史列表对 Cloudflare R2 图片变换 URL 的 LOD、原图还原与下载处理。
tags: [bananaapiboard, r2, cloudflare, image, canvas]
timestamp: 2026-11-09
---

# 用户端 R2 图片预览

- 用户端识别 `/cdn-cgi/image/` 变换地址，历史列表按 200px、画布按 LOD 宽度重写 `width`、`format` 和 `quality`，由 Cloudflare CDN 缓存稳定变体。
- `getOriginalImageUrl` 会去除变换路径，恢复 `publicBase/<key>`；下载和全屏预览不使用 WebP/AVIF 缩略图。
- COS 的 `imageMogr2`、七牛的 `imageView2`、视频封面和第三方 URL 保持原处理顺序；变换识别不会把 COS 配置转成 R2 URL。
- 变换地址加载失败时沿用现有一次性原图回退，避免画布节点空白。

相关：[后端实现](../../../bananaapiserver/docs/wiki/r2-image-transform.md) · [画布缩略图工具](../../src/utils/canvasThumbnail.js) · [索引](index.md) · [日志](log.md)。
