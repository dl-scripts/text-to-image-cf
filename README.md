# 多AI Provider聊天API

这个项目实现了一个支持多个AI提供商的聊天API，可以在智谱AI和SiliconFlow之间随机或指定选择。

## 功能特性

- 支持智谱AI和SiliconFlow两个AI提供商
- 可以随机选择一个提供商
- 可以通过请求参数指定特定提供商
- 支持流式和非流式响应
- OpenAI兼容的API接口

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

- 确保在Cloudflare Workers中正确配置了两个AI提供商的API密钥
- 如果没有指定provider，系统会随机选择一个
- provider字段优先级高于消息中的provider参数
