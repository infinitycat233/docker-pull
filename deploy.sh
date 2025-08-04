#!/bin/bash

# Docker镜像下载器 - Cloudflare Workers 部署脚本

set -e

echo "🚀 开始部署Docker镜像下载器到Cloudflare Workers..."

# 检查必要工具
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 未安装. 请先安装 Node.js"; exit 1; }
command -v wrangler >/dev/null 2>&1 || { echo "❌ Wrangler CLI 未安装. 运行: npm install -g wrangler"; exit 1; }

# 检查是否已登录
if ! wrangler whoami >/dev/null 2>&1; then
    echo "❌ 未登录Cloudflare账户. 运行: wrangler login"
    exit 1
fi

echo "✅ 环境检查通过"

# 安装依赖
echo "📦 安装依赖..."
npm install

# 构建项目
echo "🔨 构建项目..."
npm run build

# 检查是否存在生产环境配置
if ! grep -q "\[env.production\]" wrangler.toml; then
    echo "⚠️  警告: 未找到生产环境配置"
    echo "请确保 wrangler.toml 中包含 [env.production] 配置"
fi

# 询问是否创建R2存储桶
read -p "🗃️  是否需要创建R2存储桶用于缓存? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "创建R2存储桶..."
    wrangler r2 bucket create docker-image-cache --env production || echo "存储桶可能已存在"
    
    echo "创建KV命名空间..."
    KV_ID=$(wrangler kv:namespace create "METADATA" --env production | grep -o 'id = "[^"]*"' | cut -d'"' -f2)
    if [ ! -z "$KV_ID" ]; then
        echo "✅ KV命名空间创建成功，ID: $KV_ID"
        echo "请将此ID添加到 wrangler.toml 的 kv_namespaces 配置中"
    fi
fi

# 部署到生产环境
echo "🚀 部署到生产环境..."
wrangler deploy --env production

echo "🎉 部署完成！"
echo ""
echo "📋 部署信息:"
echo "- Workers名称: docker-image-downloader-prod"
echo "- 访问地址: https://docker-image-downloader-prod.<your-subdomain>.workers.dev"
echo ""
echo "🔧 后续步骤:"
echo "1. 在Cloudflare Dashboard中配置自定义域名（可选）"
echo "2. 设置访问限制和安全策略（可选）"
echo "3. 监控使用情况和性能指标"
echo ""
echo "📖 更多信息请查看 README.md"