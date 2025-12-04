# AI 图片/视频生成平台 - 前端

<p align="center">
  <img src="public/logo.svg" alt="Logo" width="120">
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
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
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
- 📱 **响应式设计** - 完美适配移动端、平板、桌面

---

## 📋 系统环境要求

### 必需环境

| 软件 | 版本要求 | 说明 |
|------|----------|------|
| **Node.js** | >= 18.0.0 | 推荐使用 LTS 版本 |
| **npm** | >= 9.0.0 | 或使用 yarn/pnpm |
| **Git** | >= 2.0.0 | 用于克隆项目 |

### 浏览器支持

| 浏览器 | 最低版本 |
|--------|----------|
| Chrome | 80+ |
| Firefox | 75+ |
| Safari | 13+ |
| Edge | 80+ |

### 操作系统

- ✅ Linux (Ubuntu 20.04+, CentOS 7+, Debian 10+)
- ✅ macOS (10.15+)
- ✅ Windows (10+)

---

## 🚀 详细安装步骤

### 第一步：检查系统环境

在开始之前，请确保您的系统已安装 Node.js 和 npm：

```bash
# 检查 Node.js 版本
node -v
# 应该显示 v18.0.0 或更高版本

# 检查 npm 版本
npm -v
# 应该显示 9.0.0 或更高版本
```

如果未安装，请访问 [Node.js 官网](https://nodejs.org/) 下载安装。

**Linux/macOS 安装示例：**

```bash
# 使用 nvm 安装（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# 或使用包管理器
# Ubuntu/Debian
sudo apt update
sudo apt install nodejs npm

# macOS (使用 Homebrew)
brew install node
```

### 第二步：获取租户凭证

在使用前，您需要向平台管理员申请租户凭证：

- **TENANT_ID** - 租户唯一标识（例如：`tenant-001`）
- **TENANT_KEY** - 租户授权密钥（例如：`LICENSE-KEY-XXXXX`）
- **API_BASE** - 后端 API 服务器地址（例如：`https://api.example.com`）

> 💡 **提示**：如果没有租户凭证，请联系平台管理员获取。

### 第三步：克隆项目

```bash
# 克隆仓库
git clone https://github.com/iblisbanana/bananaapiboard.git

# 进入项目目录
cd bananaapiboard
```

### 第四步：安装依赖

```bash
# 安装项目依赖（推荐使用 npm）
npm install

# 或使用 yarn
yarn install

# 或使用 pnpm
pnpm install
```

**安装时间**：通常需要 1-3 分钟，取决于网络速度。

**常见问题处理：**

```bash
# 如果遇到网络问题，可以使用国内镜像
npm install --registry=https://registry.npmmirror.com

# 如果遇到权限问题（Linux/macOS）
sudo npm install

# 清除缓存后重试
npm cache clean --force
npm install
```

### 第五步：配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
nano .env
# 或使用其他编辑器：vim, code, notepad 等
```

**必填配置项（必须填写）：**

```bash
# ======================================
# 必填配置 - 请根据实际情况填写
# ======================================

# 后端 API 地址（必填）
# 示例: https://api.example.com 或 http://localhost:5000
VITE_API_BASE=https://your-api-server.com

# 租户 ID（必填）
# 向平台管理员申请获取
VITE_TENANT_ID=your-tenant-id

# 租户授权密钥（必填）
# 向平台管理员申请获取
VITE_TENANT_KEY=your-tenant-key
```

**可选配置项（可根据需要修改）：**

```bash
# ======================================
# 可选配置 - 品牌定制
# ======================================

# 品牌名称（默认：香蕉AI）
VITE_BRAND_NAME=我的AI平台

# Logo 图片路径（默认：/logo.svg）
VITE_BRAND_LOGO=/logo.svg

# 主题色（默认：#FBBF24，黄色）
VITE_PRIMARY_COLOR=#FBBF24

# ======================================
# 可选配置 - 功能开关
# ======================================

# 启用视频生成功能（默认：true）
VITE_ENABLE_VIDEO=true

# 启用兑换券功能（默认：true）
VITE_ENABLE_VOUCHER=true

# 启用邀请系统（默认：true）
VITE_ENABLE_INVITE=true

# 启用套餐系统（默认：true）
VITE_ENABLE_PACKAGES=true
```

**配置示例：**

```bash
# 开发环境配置示例
VITE_API_BASE=http://localhost:5000
VITE_TENANT_ID=dev-tenant-001
VITE_TENANT_KEY=DEV-LICENSE-KEY-001

# 生产环境配置示例
VITE_API_BASE=https://api.production.com
VITE_TENANT_ID=prod-tenant-001
VITE_TENANT_KEY=PROD-LICENSE-KEY-XXXXX
```

### 第六步：启动开发服务器

```bash
# 启动开发服务器
npm run dev
```

**启动成功后，您会看到：**

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
  ➜  press h + enter to show help
```

**访问应用：**

- 本地访问：http://localhost:3000
- 局域网访问：http://您的IP地址:3000

---

## ⚙️ 环境变量详细说明

### 必填环境变量

| 变量名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `VITE_API_BASE` | String | 后端 API 服务器地址 | `https://api.example.com` |
| `VITE_TENANT_ID` | String | 租户唯一标识 | `tenant-001` |
| `VITE_TENANT_KEY` | String | 租户授权密钥 | `LICENSE-KEY-XXXXX` |

### 可选环境变量

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `VITE_BRAND_NAME` | String | `香蕉AI` | 品牌名称，显示在页面标题 |
| `VITE_BRAND_LOGO` | String | `/logo.svg` | Logo 图片路径（相对于 public 目录） |
| `VITE_PRIMARY_COLOR` | String | `#FBBF24` | 主题色（十六进制颜色值） |
| `VITE_ENABLE_VIDEO` | Boolean | `true` | 是否启用视频生成功能 |
| `VITE_ENABLE_VOUCHER` | Boolean | `true` | 是否启用兑换券功能 |
| `VITE_ENABLE_INVITE` | Boolean | `true` | 是否启用邀请系统 |
| `VITE_ENABLE_PACKAGES` | Boolean | `true` | 是否启用套餐系统 |

---

## 📦 构建和部署

### 开发模式

```bash
# 启动开发服务器（支持热重载）
npm run dev

# 指定端口启动
PORT=8080 npm run dev
```

### 构建生产版本

```bash
# 构建生产版本
npm run build
```

**构建产物：**

- 输出目录：`dist/`
- 包含文件：HTML、CSS、JS 等静态资源
- 文件大小：通常 1-3 MB（已压缩）

**构建优化：**

- ✅ 自动代码压缩
- ✅ Tree-shaking（移除未使用代码）
- ✅ 资源优化和压缩
- ✅ 生产环境优化

### 预览构建结果

```bash
# 预览生产构建
npm run preview

# 预览时指定端口
PORT=8080 npm run preview
```

### 部署方式

#### 方式一：静态文件部署（推荐）

将 `dist/` 目录部署到任意静态文件服务器。

**1. Nginx 部署**

```bash
# 复制构建产物到 Nginx 目录
sudo cp -r dist/* /var/www/html/

# 或使用自定义目录
sudo cp -r dist/* /var/www/ai-platform/
```

**Nginx 配置示例：**

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/ai-platform;
    index index.html;

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # 处理 Vue Router 的 History 模式
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 代理（可选，如果后端在同服务器）
    location /api {
        proxy_pass https://your-api-server.com;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**2. Apache 部署**

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/ai-platform

    <Directory /var/www/ai-platform>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Vue Router History 模式支持
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</VirtualHost>
```

**3. Vercel 部署**

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel
```

**4. Netlify 部署**

```bash
# 安装 Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --prod --dir=dist
```

#### 方式二：Docker 部署

**使用项目提供的 Dockerfile：**

```bash
# 构建 Docker 镜像
docker build -t ai-platform-frontend .

# 运行容器
docker run -d \
  -p 3000:80 \
  -e VITE_API_BASE=https://api.example.com \
  -e VITE_TENANT_ID=your-tenant-id \
  -e VITE_TENANT_KEY=your-tenant-key \
  --name ai-frontend \
  ai-platform-frontend
```

**使用 Docker Compose：**

```bash
# 编辑 docker-compose.yml 中的环境变量
nano docker-compose.yml

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

#### 方式三：云平台部署

**1. 阿里云 OSS + CDN**

```bash
# 安装阿里云 CLI
npm i -g @alicloud/cli

# 上传到 OSS
ossutil cp -r dist/ oss://your-bucket/ --update
```

**2. 腾讯云 COS**

```bash
# 使用 coscmd 上传
coscmd upload -rs dist/ /
```

**3. AWS S3 + CloudFront**

```bash
# 使用 AWS CLI
aws s3 sync dist/ s3://your-bucket/ --delete
```

---

## 📁 项目结构说明

```
bananaapiboard/
├── public/                    # 静态资源目录
│   ├── favicon.ico           # 网站图标
│   └── logo.svg              # Logo 图片
│
├── src/                       # 源代码目录
│   ├── api/                  # API 客户端
│   │   └── client.js         # API 请求封装
│   │
│   ├── assets/               # 样式资源
│   │   ├── tailwind.css      # Tailwind CSS 入口
│   │   └── themes.css        # 主题样式
│   │
│   ├── components/           # 通用组件
│   │   ├── ImageAnnotator.vue      # 图片标注组件
│   │   ├── MentionDropdown.vue     # 提及下拉组件
│   │   └── PromptInputWithTags.vue # 提示词输入组件
│   │
│   ├── config/               # 配置文件
│   │   └── tenant.js         # 租户配置管理
│   │
│   ├── router/               # 路由配置
│   │   └── index.js          # Vue Router 配置
│   │
│   ├── utils/                # 工具函数
│   │   ├── theme.js          # 主题切换工具
│   │   ├── logger.js         # 前端日志工具
│   │   ├── deviceDetection.js      # 设备检测工具
│   │   └── imageAnnotation.js      # 图片标注工具
│   │
│   ├── views/                # 页面组件
│   │   ├── Home.vue          # 图片生成页面
│   │   ├── VideoGeneration.vue     # 视频生成页面
│   │   ├── Auth.vue          # 登录注册页面
│   │   ├── User.vue          # 用户中心页面
│   │   └── Packages.vue      # 套餐购买页面
│   │
│   ├── App.vue               # 根组件
│   └── main.js               # 应用入口文件
│
├── .env.example              # 环境变量模板
├── .gitignore                # Git 忽略文件
├── index.html                # HTML 模板
├── package.json              # 项目依赖配置
├── vite.config.js            # Vite 构建配置
├── tailwind.config.js        # TailwindCSS 配置
├── postcss.config.cjs        # PostCSS 配置
├── jsconfig.json             # JavaScript 配置
├── Dockerfile                # Docker 构建文件
├── docker-compose.yml        # Docker Compose 配置
├── nginx.conf                # Nginx 配置示例
├── LICENSE                   # MIT 开源协议
└── README.md                 # 项目说明文档
```

---

## 🎨 自定义配置

### 修改品牌信息

**1. 替换 Logo：**

```bash
# 将您的 Logo 文件放到 public 目录
cp your-logo.png public/logo.png

# 或使用 SVG 格式（推荐）
cp your-logo.svg public/logo.svg
```

**2. 修改品牌名称：**

在 `.env` 文件中设置：

```bash
VITE_BRAND_NAME=我的AI平台
```

**3. 修改网站标题：**

编辑 `index.html`：

```html
<title>我的AI平台</title>
```

### 修改主题色

编辑 `tailwind.config.js`：

```javascript
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fefce8',
          100: '#fef9c3',
          // ... 其他色阶
          600: '#ca8a04',  // 修改这里的主色调
          700: '#a16207',
          // ...
        }
      }
    }
  }
}
```

或在 `.env` 中设置：

```bash
VITE_PRIMARY_COLOR=#3B82F6  # 蓝色主题
```

### 功能开关

在 `.env` 中控制功能启用/禁用：

```bash
# 禁用视频生成功能
VITE_ENABLE_VIDEO=false

# 禁用兑换券功能
VITE_ENABLE_VOUCHER=false

# 禁用邀请系统
VITE_ENABLE_INVITE=false

# 禁用套餐系统
VITE_ENABLE_PACKAGES=false
```

---

## 🔧 常见问题排查

### Q1: 启动后显示"系统配置错误"？

**原因：** 租户凭证未配置或配置错误。

**解决方法：**

1. 检查 `.env` 文件是否存在：
   ```bash
   ls -la .env
   ```

2. 确认必填配置项已填写：
   ```bash
   cat .env | grep VITE_TENANT
   ```

3. 验证配置格式是否正确（无多余空格、引号等）

4. 重启开发服务器：
   ```bash
   # 停止当前服务 (Ctrl+C)
   npm run dev
   ```

### Q2: API 请求返回 401 未授权？

**原因：** 租户凭证无效或已过期。

**解决方法：**

1. 确认 `VITE_TENANT_ID` 和 `VITE_TENANT_KEY` 正确
2. 联系平台管理员验证凭证有效性
3. 检查后端 API 地址是否正确

### Q3: npm install 失败或很慢？

**解决方法：**

```bash
# 使用国内镜像源
npm config set registry https://registry.npmmirror.com

# 或使用 cnpm
npm install -g cnpm --registry=https://registry.npmmirror.com
cnpm install

# 清除缓存
npm cache clean --force
```

### Q4: 如何连接本地开发的后端？

**方法一：使用环境变量**

在 `.env` 中设置：

```bash
VITE_API_BASE=http://localhost:5000
```

**方法二：修改 Vite 代理配置**

编辑 `vite.config.js`：

```javascript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
```

### Q5: 构建后页面空白？

**原因：** 可能是路由配置或资源路径问题。

**解决方法：**

1. 检查 `vite.config.js` 中的 `base` 配置
2. 确认 `dist/index.html` 中的资源路径正确
3. 检查浏览器控制台错误信息

### Q6: 生产环境如何配置 API 地址？

**方法一：构建时设置环境变量**

```bash
VITE_API_BASE=https://api.production.com npm run build
```

**方法二：使用 Docker 构建参数**

```bash
docker build \
  --build-arg VITE_API_BASE=https://api.production.com \
  --build-arg VITE_TENANT_ID=your-id \
  --build-arg VITE_TENANT_KEY=your-key \
  -t ai-platform-frontend .
```

### Q7: 端口被占用？

**解决方法：**

```bash
# 查找占用端口的进程
# Linux/macOS
lsof -i :3000

# Windows
netstat -ano | findstr :3000

# 杀死进程或使用其他端口
PORT=8080 npm run dev
```

### Q8: 热重载不工作？

**解决方法：**

1. 检查文件是否在 `src/` 目录下
2. 确认文件扩展名正确（.vue, .js, .css）
3. 重启开发服务器
4. 清除浏览器缓存

---

## 🛠️ 开发指南

### 添加新页面

1. 在 `src/views/` 创建新组件
2. 在 `src/router/index.js` 添加路由：

```javascript
import NewPage from '@/views/NewPage.vue'

{
  path: '/new-page',
  name: 'new-page',
  component: NewPage,
  meta: { title: '新页面' }
}
```

### 添加新组件

在 `src/components/` 创建组件，然后在其他组件中导入：

```vue
<script setup>
import NewComponent from '@/components/NewComponent.vue'
</script>
```

### API 调用

使用 `src/api/client.js` 中的封装方法：

```javascript
import { api } from '@/api/client'

// GET 请求
const data = await api.get('/api/endpoint')

// POST 请求
const result = await api.post('/api/endpoint', { key: 'value' })
```

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📞 获取帮助

- 📧 邮箱支持：联系平台管理员
- 🐛 提交 Issue：[GitHub Issues](https://github.com/iblisbanana/bananaapiboard/issues)
- 📖 查看文档：本项目 README.md

---

## 🎯 快速命令参考

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview

# Docker 构建
docker build -t ai-platform-frontend .

# Docker 运行
docker run -p 3000:80 ai-platform-frontend
```

---

<p align="center">Made with ❤️ by NanoBanana Team</p>

<p align="center">
  <a href="https://github.com/iblisbanana/bananaapiboard">⭐ Star this repo</a> |
  <a href="https://github.com/iblisbanana/bananaapiboard/issues">🐛 Report Bug</a> |
  <a href="https://github.com/iblisbanana/bananaapiboard/pulls">💡 Request Feature</a>
</p>
