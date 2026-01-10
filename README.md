# 多AI Provider聊天API

这个项目实现了一个支持多个AI提供商的聊天API，可以在智谱AI和SiliconFlow之间随机或指定选择。

## 功能特性

- 支持多个AI提供商（智谱AI、SiliconFlow、DeepSeek、NVIDIA NIM、OpenRouter）
- 可以随机选择或指定特定提供商
- 支持流式和非流式响应
- OpenAI兼容的API接口
- **智能请求批处理** - 自动合并同一来源的请求，节省token
- 断路器保护机制
- 自动故障切换

## API使用方法

### 基本请求

```bash
curl -X POST https://your-worker-domain.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己"}
    ]
  }'
```

### 指定提供商

在请求体中添加`provider`字段来指定使用的AI提供商：

```bash
# 使用智谱AI
curl -X POST https://your-worker-domain.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己"}
    ],
    "provider": "zhipu"
  }'

# 使用SiliconFlow
curl -X POST https://your-worker-domain.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好，请介绍一下你自己"}
    ],
    "provider": "siliconflow"
  }'
```

### 在消息中指定提供商

也可以在消息内容中包含`provider=xxx`来指定提供商：

```bash
curl -X POST https://your-worker-domain.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "provider=siliconflow 你好，请介绍一下你自己"}
    ]
  }'
```

## 环境变量配置

需要在Cloudflare Workers中配置以下环境变量：

- `ZHIPU_API_KEY`: 智谱AI的API密钥
- `ZAI_MODEL`: 智谱AI使用的模型（默认：glm-4-flashx）
- `SILICONFLOW_API_KEY`: SiliconFlow的API密钥
- `SILICONFLOW_MODEL`: SiliconFlow使用的模型（默认：Qwen/Qwen2.5-7B-Instruct）

## 响应格式

API返回标准的OpenAI兼容格式，并在响应头中包含`X-AI-Provider`字段来指示实际使用的提供商。

## 开发和测试

项目包含一个测试文件`test/multi-provider-test.js`，可以用来验证功能是否正常工作。

```bash
cd test && node multi-provider-test.js
```

## 部署

1. 配置环境变量
2. 部署到Cloudflare Workers
3. 测试API功能

## 注意事项

- 确保在Cloudflare Workers中正确配置了AI提供商的API密钥
- 如果没有指定provider，系统会随机选择一个可用的提供商
- provider字段优先级高于消息中的provider参数

## 请求批处理功能

为了节省 token 并提高效率，系统支持智能请求批处理。来自同一来源（相同 requestId）的多个请求会在 300ms 内自动合并处理。

### 使用方法

在请求中添加 `X-Request-Id` header：

```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: article-12345" \
  -d '{
    "messages": [
      {"role": "user", "content": "翻译：Hello"}
    ]
  }'
```

更多详细信息请参考 [批处理功能指南](BATCHING_GUIDE.md)
