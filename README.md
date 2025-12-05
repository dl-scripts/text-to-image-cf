# Text to Image App

智能图像生成服务，支持多种 AI 模型和增强的提示词功能。

## 功能特性

### 🤖 双模型支持
- **智谱 AI (z.ai GLM-4)**：用于高级图像生成和 agent 任务
- **Cloudflare Workers AI**：作为后备和快速图像生成选项

### 🚀 智能代理
- 自动检测请求类型（agent vs 普通图像生成）
- Agent 请求路由到 z.ai GLM-4 API
- 普通请求使用 Cloudflare AI 图像生成

### 🚀 z.ai API 集成
- 使用官方 zhipuai-sdk-nodejs-v4
- 支持 agent 聊天和图像生成
- 环境变量配置（`ZHIPU_API_KEY`）

### 🚀 动态提示词优化
- 使用 z.ai GLM-4 模型优化用户输入的提示词
- 自动提取和使用增强后的提示词进行图像生成

### 🚀 完善的错误处理
- 完整的 try-catch 错误处理
- 详细的错误日志记录
- 适当的 HTTP 状态码返回

## 🛡 技术栈

- **Cloudflare Workers**：运行时平台
- **zhipuai-sdk-nodejs-v4**：智谱 AI 客户端
- **TypeScript**：类型安全的实现
- **环境变量配置**：安全的 API 密钥管理

## API 端点

### Agent 请求
```bash
POST /v1/chat/completions
{
  "prompt": "一个充满未来感的城市，有飞行汽车",
  "agent": true
}
```

### 图像生成
```bash
POST /
{
  "prompt": "夕阳下的山脉美景"
}
```

### 直接调用 z.ai（开发测试）
```bash
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -d '{"prompt": "test prompt", "agent": true}'
```

## 🔧 环境配置

在 `wrangler.toml` 中添加：
```toml
[env.production]
ZHIPU_API_KEY = "your-actual-zhipuai-api-key"

[env.development]
ZHIPU_API_KEY = "your-development-zhipuai-api-key"
```

## 🚀 部署

```bash
# 安装依赖
npm install

# 配置生产环境变量
wrangler secret put ZHIPU_API_KEY "your-production-zhipuai-api-key"

# 部署
wrangler deploy
```

## 🚀 使用方法

1. 开发模式：使用本地 zhipuai API 密钥测试
2. 生产模式：使用 Cloudflare Workers AI 作为后备
3. 自动降级：z.ai API 不可用时自动切换到 Cloudflare Workers AI

这个项目展示了现代云原生应用开发的最佳实践，结合了多个 AI 服务来提供最优的用户体验。🚀

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/text-to-image-template
```

A live public deployment of this template is available at [https://text-to-image-template.templates.workers.dev](https://text-to-image-template.templates.workers.dev).

## Setup Steps

1. Install project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Deploy your project!
   ```bash
   npx wrangler deploy
   ```
3. Monitor your worker
   ```bash
   npx wrangler tail
   ```

This template helps you get started with a robust, production-ready Workers application that uses modern AI services. For detailed setup instructions and best practices, see the [Cloudflare documentation](https://developers.cloudflare.com/workers-ai/).
