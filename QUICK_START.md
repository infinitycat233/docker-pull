# 🚀 快速开始指南

## 5分钟部署到Cloudflare Workers

### 📋 前置条件

- [Node.js](https://nodejs.org/) 16+
- [Cloudflare账户](https://dash.cloudflare.com/sign-up)
- Git

### 🎯 一键部署

#### 方式1: 使用部署脚本（推荐）

```bash
# 1. 进入项目目录
cd cloudflare-worker

# 2. 安装Wrangler CLI
npm install -g wrangler

# 3. 登录Cloudflare
wrangler login

# 4. 运行一键部署脚本
./deploy.sh
```

#### 方式2: 手动部署

```bash
# 1. 安装依赖
npm install

# 2. 复制配置文件
cp wrangler.toml.example wrangler.toml

# 3. 构建项目
npm run build

# 4. 部署
npm run deploy
```

### 🌐 访问您的应用

部署成功后，您将获得一个类似这样的URL：
```
https://docker-image-downloader-prod.your-subdomain.workers.dev
```

### 🧪 测试功能

1. **搜索镜像**
   ```bash
   curl -X POST https://your-worker-url/api/search \
     -H "Content-Type: application/json" \
     -d '{"query": "hello-world"}'
   ```

2. **下载镜像**
   ```bash
   curl -X POST https://your-worker-url/api/download \
     -H "Content-Type: application/json" \
     -d '{"image": "hello-world:latest"}' \
     --output hello-world.tar
   ```

3. **查看热门镜像**
   ```bash
   curl https://your-worker-url/api/popular
   ```

### ⚡ 性能优化（可选）

#### 启用R2缓存

```bash
# 创建R2存储桶
wrangler r2 bucket create docker-image-cache --env production

# 创建KV命名空间
wrangler kv:namespace create "METADATA" --env production
```

然后在 `wrangler.toml` 中添加：

```toml
[env.production]
[[env.production.r2_buckets]]
binding = "DOCKER_CACHE"
bucket_name = "docker-image-cache"

[[env.production.kv_namespaces]]
binding = "METADATA"
id = "your-kv-id-from-above-command"
```

重新部署：
```bash
npm run deploy
```

### 🔧 自定义配置

#### 设置自定义域名

1. 在Cloudflare Dashboard中添加域名
2. 在 `wrangler.toml` 中配置：

```toml
[env.production]
routes = [
  { pattern = "docker.example.com", custom_domain = true }
]
```

#### 配置访问限制

在Cloudflare Dashboard的Workers部分可以设置：
- 访问频率限制
- 地理位置限制
- IP白名单/黑名单

### 📊 监控和分析

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 Workers & Pages 部分
3. 点击您的Worker查看：
   - 请求数量和错误率
   - 响应时间分布
   - 缓存命中率
   - 错误日志

### 🐛 故障排除

#### 常见问题

1. **部署失败：权限错误**
   ```bash
   # 重新登录Cloudflare
   wrangler logout
   wrangler login
   ```

2. **镜像下载失败**
   ```bash
   # 检查Worker日志
   wrangler tail --env production
   ```

3. **缓存不工作**
   ```bash
   # 检查R2存储桶配置
   wrangler r2 bucket list
   ```

#### 获取帮助

- 📖 完整文档：[README.md](README.md)
- 🐛 报告问题：[GitHub Issues](https://github.com/your-repo/issues)
- 💬 Cloudflare支持：[Community Forum](https://community.cloudflare.com/)

### 🎉 完成！

现在您有了一个运行在全球CDN上的高性能Docker镜像下载器！

**下一步：**
- 配置自定义域名
- 设置监控告警
- 集成到您的CI/CD流程

---

💡 **提示：** 这个应用兼容您现有的Python版本的所有功能，并提供了额外的全球加速和缓存优化。