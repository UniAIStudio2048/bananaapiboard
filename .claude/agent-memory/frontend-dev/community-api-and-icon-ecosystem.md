---
name: community-api-and-icon-ecosystem
description: 社区特色功能/作品 API 返回结构、feature-icons 图标体系与灵感中心页面接线方式
metadata:
  type: project
---

## 社区 API 返回结构（bananaapiboard/src/api/community.js）

- `getFeatures()` → `/api/community/features`，返回 `{ success: true, data: rows }`，行结构只有 `{ id, label, icon, workflow_id }`，**没有 title/description 字段**（一句话说明需前端自备文案映射）。
- `getWorks(params)` → `/api/community/works?page&pageSize&sort&featured&category_id&keyword`，返回 `res.data?.works || res.works || []`。
- 常用参数：`{ page: 1, pageSize: 12, featured: 1 }` 取精选作品。

## 图标体系（阶段 B/C）

- `src/utils/feature-icons.js`：`getFeatureIcon(name)` → `{paths,circles,lines,rects,polylines,polygons}` 或 null；含 52 个图标（已补 `globe`、`users`，来源是租户管理端 `bananatenantmanager/src/views/CommunityFeatures.vue` 的 iconList，**该文件是 community_features 表 icon 字段的规范图标集**）。
- `src/components/common/IconSet.vue`：`<IconSet name size class strokeWidth>` 渲染；解析链路 `getIconData(name) = NODE_ICON_DATA[name] || getFeatureIcon(name)`。**注意 users 图标在租户管理端用 paths2 字段，IconSet 不识别，需合并进 paths**。
- 实际 DB `community_features` 表 icon 值示例：`wand / infinity / globe / img2img / brain / sparkles / layout / users`。

## 灵感中心页面（阶段 C2）

- `src/views/Inspiration.vue`：Hero + 特色功能宫格（数据 `getFeatures`）+ 灵感作品（`getWorks` + WorkCard columns 瀑布流）+ 提示词复制 + 底部 CTA。主站亮/暗主题（`bg-canvas`/`bg-surface-1`/`border-hairline`）。
- 特色功能「开始使用」路由映射：label/icon 含 `video/字幕/水印` → `/video`；含 `canvas/分镜/三视图/角色` → `/canvas`；其余 → `/generate`（文生图主入口，需登录）。
- 主 CTA「去创作」统一跳 `/generate`（路由 name: 'home'，与 App.vue 生成菜单一致）。Home.vue 目前**不消费** `route.query.prompt`，提示词卡跳转带 query 仅作未来扩展。

## 导航入口

- App.vue 主导航在 `isGlobalNavVisible` 为 true 时显示（排除 `/`、/canvas、/workflows、/docs、/community*）。`/inspiration` 走正常导航。
- 画布 AI 灵感助手面板（`src/components/canvas/AIAssistantPanel.vue`）header-actions 有「打开灵感中心」按钮，用 `window.open('/inspiration', '_blank')`（该组件未引入 vue-router）。
