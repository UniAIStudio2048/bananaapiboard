#!/bin/bash
# ========================================
# 推送到GitHub的辅助脚本
# ========================================

echo "🚀 准备推送到GitHub..."
echo ""

# 检查是否在正确的目录
if [ ! -d ".git" ]; then
    echo "❌ 错误: 当前目录不是Git仓库"
    exit 1
fi

# 检查远程仓库配置
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if [ -z "$REMOTE_URL" ]; then
    echo "❌ 错误: 未配置远程仓库"
    exit 1
fi

echo "📦 远程仓库: $REMOTE_URL"
echo ""

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  警告: 有未提交的更改"
    read -p "是否先提交这些更改? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "Update: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
fi

# 切换到main分支
git branch -M main 2>/dev/null

echo "📤 开始推送..."
echo ""

# 尝试推送
if git push -u origin main 2>&1; then
    echo ""
    echo "✅ 推送成功！"
    echo "🌐 访问: https://github.com/bananaapiboard/bananaapiboard"
else
    echo ""
    echo "❌ 推送失败，可能需要配置认证"
    echo ""
    echo "请选择以下方式之一："
    echo ""
    echo "【方式1】使用Personal Access Token"
    echo "  1. 创建Token: https://github.com/settings/tokens"
    echo "  2. 执行: git remote set-url origin https://YOUR_TOKEN@github.com/bananaapiboard/bananaapiboard.git"
    echo "  3. 再次运行此脚本"
    echo ""
    echo "【方式2】使用SSH密钥"
    echo "  1. 配置SSH密钥到GitHub"
    echo "  2. 执行: git remote set-url origin git@github.com:bananaapiboard/bananaapiboard.git"
    echo "  3. 再次运行此脚本"
    echo ""
    exit 1
fi




