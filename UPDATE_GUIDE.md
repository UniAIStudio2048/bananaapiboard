# 🔄 版本更新指南

## 当前版本：v5.5.8

### 📦 本次更新内容

#### 🔥 重要修复
- **多租户 .env 配置支持** - 修复启动时无法读取 .env 配置的问题
- **强制使用开发模式** - 确保租户配置能够正确加载

#### ✨ 新增功能
- 启动时自动检查 .env 文件
- 启动时显示当前租户配置
- 自动从 .env.example 创建 .env

---

## 🚀 如何更新

### 方式一：Git Pull 更新（推荐）

如果你已经克隆了仓库：

```bash
# 进入项目目录
cd bananaapiboard

# 拉取最新代码
git pull origin main

# 切换到最新版本标签（可选）
git checkout v5.5.8

# 安装/更新依赖
npm install

# 重启服务
npm run dev
```

### 方式二：重新克隆

如果是首次使用或想要全新安装：

```bash
# 克隆仓库
git clone https://github.com/iblisbanana/bananaapiboard.git
cd bananaapiboard

# 安装依赖
npm install

# 配置租户信息
cp .env.example .env
nano .env

# 启动服务
npm run dev
```

---

## ⚙️ 配置迁移

### 重要：.env 配置

本次更新后，系统会在启动时自动读取 `.env` 文件。请确保你的 `.env` 文件包含以下配置：

```env
# 租户凭证（必填）
VITE_TENANT_ID=your-tenant-id
VITE_TENANT_KEY=your-tenant-key

# 后端 API 地址（可选，留空使用代理）
VITE_API_BASE=

# 品牌定制（可选）
VITE_BRAND_NAME=你的品牌名称
VITE_BRAND_LOGO=/logo.svg
VITE_PRIMARY_COLOR=#FBBF24

# 功能开关（可选）
VITE_ENABLE_VIDEO=true
VITE_ENABLE_VOUCHER=true
VITE_ENABLE_INVITE=true
VITE_ENABLE_PACKAGES=true
```

### 配置检查

启动服务后，系统会自动显示当前租户配置：

```bash
📋 当前租户配置:
  VITE_TENANT_ID=your-tenant-id
  VITE_TENANT_KEY=your-tenant-key
  VITE_API_BASE=
```

---

## 🔍 验证更新

### 1. 检查版本号

```bash
cat package.json | grep version
```

应该显示：`"version": "5.5.8"`

### 2. 检查服务启动

```bash
npm run dev
```

启动日志应该显示：
```
🔥 使用开发模式启动 (实时读取 .env 配置)
📋 当前租户配置:
  VITE_TENANT_ID=...
```

### 3. 测试登录

访问 http://localhost:3000，使用你的账号登录，确认功能正常。

---

## ⚠️ 注意事项

### 重要变更

1. **启动方式变更**
   - ❌ 旧方式：`vite preview`（不再推荐）
   - ✅ 新方式：`npm run dev`（必须使用）

2. **配置文件**
   - 必须使用 `.env` 文件配置租户信息
   - 不能依赖构建时的环境变量

3. **端口配置**
   - 默认端口：3000
   - 可通过 `--port` 参数修改

### 常见问题

#### Q: 启动后显示 "Port 3000 is in use"？
A: 端口被占用，Vite 会自动切换到其他端口（3001、3002 等）

#### Q: 登录失败，提示租户验证失败？
A: 检查 `.env` 文件中的 `VITE_TENANT_ID` 和 `VITE_TENANT_KEY` 是否正确

#### Q: 修改 .env 后不生效？
A: 重启服务（Ctrl+C 停止，然后 `npm run dev` 重新启动）

---

## 📚 相关文档

- [CHANGELOG.md](./CHANGELOG.md) - 完整更新日志
- [README.md](./README.md) - 项目说明
- [.env.example](./.env.example) - 配置模板

---

## 🆘 获取帮助

如果更新过程中遇到问题：

1. 查看 [GitHub Issues](https://github.com/iblisbanana/bananaapiboard/issues)
2. 查看项目文档
3. 联系技术支持

---

## 📅 更新历史

- **v5.5.8** (2025-12-05) - 修复多租户 .env 配置支持
- **v5.5.7** (2025-12-04) - 用户中心优化
- 更多历史版本请查看 [CHANGELOG.md](./CHANGELOG.md)

---

**祝使用愉快！🎉**

