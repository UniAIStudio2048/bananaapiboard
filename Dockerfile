# ========================================
# AI 图片/视频生成平台 - 前端 Docker 构建
# ========================================

# 阶段1: 构建
FROM node:18-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production=false

# 复制源代码
COPY . .

# 构建参数（可在构建时传入）
ARG VITE_API_BASE
ARG VITE_TENANT_ID
ARG VITE_TENANT_KEY
ARG VITE_BRAND_NAME

# 构建
RUN npm run build

# 阶段2: 运行
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]

