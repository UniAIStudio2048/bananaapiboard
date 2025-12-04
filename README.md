# AI 图片/视频生成平台 - 前端

<p align="center">
  <img src="public/logo.png" alt="Logo" width="120">
</p>

<p align="center">
  <b>🍌 NanoBanana AI Generation Platform</b>
  <br>
  基于 Vue 3 + Vite + TailwindCSS 构建的现代化 AI 生成平台前端
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vue-3.4-4FC08D?style=flat-square&logo=vue.js" alt="Vue 3">
  <img src="https://img.shields.io/badge/Vite-5.x-646CFF?style=flat-square&logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-3.x-38B2AC?style=flat-square&logo=tailwind-css" alt="TailwindCSS">
</p>

---

## ✨ 功能特性

- 🎨 **AI 图片生成** - 支持文生图、图生图、多参考图
- 🎬 **AI 视频生成** - 支持 Sora 模型生成视频
- 👤 **用户系统** - 注册登录、邮箱验证、邀请奖励
- 💎 **积分系统** - 套餐积分 + 永久积分双轨制
- 💰 **充值系统** - 支持余额充值、套餐购买
- 🎫 **兑换券系统** - 支持积分/余额兑换
- 🌙 **多主题支持** - 深色/浅色模式切换
- 📱 **响应式设计** - 完美适配移动端

---

## 📋 系统要求

| 软件 | 版本要求 |
|------|----------|
| Node.js | >= 18.0.0 |
| npm | >= 9.0.0 |
| 浏览器 | Chrome 80+ / Firefox 75+ / Safari 13+ / Edge 80+ |

---

## 🚀 快速开始

### 第一步：获取租户凭证

在使用前，您需要向平台管理员申请租户凭证：

- **TENANT_ID** - 租户唯一标识
- **TENANT_KEY** - 租户授权密钥

### 第二步：克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/ai-image-generator-frontend.git
cd ai-image-generator-frontend
```

### 第三步：安装依赖

```bash
npm install
```

### 第四步：配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
nano .env  # 或使用其他编辑器
```

必填配置项：

```bash
# 后端 API 地址（必填）
VITE_API_BASE=https://your-api-server.com

# 租户凭证（必填）
VITE_TENANT_ID=your-tenant-id
VITE_TENANT_KEY=your-tenant-key
```

### 第五步：启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000 即可看到应用。

---

## ⚙️ 环境变量说明

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `VITE_API_BASE` | ✅ | - | 后端 API 服务器地址 |
| `VITE_TENANT_ID` | ✅ | - | 租户 ID |
| `VITE_TENANT_KEY` | ✅ | - | 租户授权密钥 |
| `VITE_BRAND_NAME` | ❌ | 香蕉AI | 品牌名称 |
| `VITE_BRAND_LOGO` | ❌ | /logo.png | Logo 图片路径 |
| `VITE_PRIMARY_COLOR` | ❌ | #FBBF24 | 主题色 |
| `VITE_ENABLE_VIDEO` | ❌ | true | 是否启用视频生成 |
| `VITE_ENABLE_VOUCHER` | ❌ | true | 是否启用兑换券 |
| `VITE_ENABLE_INVITE` | ❌ | true | 是否启用邀请系统 |
| `VITE_ENABLE_PACKAGES` | ❌ | true | 是否启用套餐系统 |

---

## 📦 构建部署

### 构建生产版本

```bash
npm run build
```

构建产物位于 `dist/` 目录。

### 预览构建结果

```bash
npm run preview
```

### 部署方式

#### 方式一：静态文件部署（推荐）

将 `dist/` 目录部署到任意静态文件服务器（Nginx、Apache、Vercel、Netlify 等）。

**Nginx 配置示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    # 处理 Vue Router 的 History 模式
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理（可选，如果需要在同域部署）
    location /api {
        proxy_pass https://your-api-server.com;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 方式二：Docker 部署

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 📁 项目结构

```
├── public/                 # 静态资源
│   ├── favicon.ico        # 网站图标
│   └── logo.png           # Logo
├── src/
│   ├── api/               # API 客户端
│   │   └── client.js      # API 请求封装
│   ├── assets/            # 样式资源
│   │   ├── tailwind.css   # Tailwind 入口
│   │   └── themes.css     # 主题样式
│   ├── components/        # 通用组件
│   ├── config/            # 配置文件
│   │   └── tenant.js      # 租户配置
│   ├── router/            # 路由配置
│   │   └── index.js
│   ├── utils/             # 工具函数
│   │   ├── theme.js       # 主题工具
│   │   ├── logger.js      # 日志工具
│   │   └── deviceDetection.js
│   ├── views/             # 页面组件
│   │   ├── Home.vue       # 图片生成
│   │   ├── VideoGeneration.vue  # 视频生成
│   │   ├── Auth.vue       # 登录注册
│   │   ├── User.vue       # 用户中心
│   │   └── Packages.vue   # 套餐购买
│   ├── App.vue            # 根组件
│   └── main.js            # 入口文件
├── .env.example           # 环境变量模板
├── index.html             # HTML 模板
├── package.json           # 依赖配置
├── vite.config.js         # Vite 配置
├── tailwind.config.js     # TailwindCSS 配置
└── postcss.config.cjs     # PostCSS 配置
```

---

## 🎨 自定义主题

### 修改主题色

编辑 `tailwind.config.js`：

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fefce8',
          // ... 自定义颜色
          600: '#ca8a04',
        }
      }
    }
  }
}
```

### 修改品牌信息

1. 替换 `public/logo.png` 为您的 Logo
2. 替换 `public/favicon.ico` 为您的图标
3. 在 `.env` 中设置 `VITE_BRAND_NAME`

---

## 🔧 常见问题

### Q: 启动后显示"系统配置错误"？

A: 请检查 `.env` 文件中的 `VITE_TENANT_ID` 和 `VITE_TENANT_KEY` 是否正确配置。

### Q: API 请求返回 401？

A: 确保租户凭证有效且未过期。联系平台管理员确认。

### Q: 如何连接本地开发的后端？

A: 修改 `vite.config.js` 中的代理配置：

```javascript
proxy: {
  '/api': {
    target: 'http://localhost:5000',
    changeOrigin: true
  }
}
```

### Q: 生产环境如何配置 API 地址？

A: 设置环境变量 `VITE_API_BASE` 为您的后端地址，构建时会自动使用。

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。

---

## 🤝 联系支持

如有问题，请联系平台管理员或提交 Issue。

---

<p align="center">Made with ❤️ by NanoBanana Team</p>

