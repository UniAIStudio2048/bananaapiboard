---
type: architecture
title: R2 视频播放与源文件下载
tags: [video, r2, stream, hls]
timestamp: 2026-09-14
---

# R2 视频播放与源文件下载

- [播放指令](../../src/directives/streamVideo.js)用于画布视频节点、视频生成页、用户历史和素材预览的展示播放器；原 URL 通过已登录请求交由后端验证媒体所有权、所属桶和加速开关。
- [播放器控制器](../../src/utils/streamVideoPlayback.js)只改变 video 元素的播放源，不替换节点数据、历史记录或下载参数。处理中保持源文件，最多轮询 30 分钟；就绪时优先原生 HLS，否则动态加载 hls.js。
- 切换保留播放位置与播放/暂停状态；HLS 致命错误回到原文件。销毁/换源取消轮询并释放播放器，清理加速封面和下载限制。
- HLS 时禁用播放器自带的衍生文件下载，应用下载按钮仍使用原 URL；生成页和画布已有下载接口继续返回源文件。
- [控制器测试](../../src/utils/streamVideoPlayback.test.mjs)六项通过；用户前端 `npm run build` 通过，hls.js 单独按需加载。末次构建入口为 `/assets/index-Bs8lBLnG.js`，HTTPS 首页及入口、HLS、画布脚本已逐字节核对与 dist 一致。
- Chrome 真实原生 HLS 与强制 hls.js 分支均已验证 Stream 与 R2 本地转码两条路径，播放时间正常前进，无媒体错误；响应解析在浏览器验证中使用测试会话拦截，媒体清单与片段使用实际远端地址。后端鉴权另由服务路由测试验证。
- 实际 `/api/videos/download` 与原 R2 对象 SHA-256 完全相同，大小 6,247,222 字节，原对象 CDN `HIT`。R2 HLS 主清单返回正确 MIME 和 CORS，实测缓存状态为 `DYNAMIC`，未修改共用上传器或 CDN 规则。

相关：[后端容量与恢复策略](../../../bananaapiserver/docs/wiki/r2-video-playback.md) · [索引](index.md) · [日志](log.md)。
