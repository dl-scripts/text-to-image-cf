# GLM Chat API Service

基于智谱 AI GLM-4 模型的聊天服务，提供 OpenAI 兼容的 API 接口。

## 功能特性

### 🤖 GLM-4 模型支持
- **智谱 AI (zhipu AI)**：使用 GLM-4-flash 模型进行对话
- **OpenAI 兼容接口**：完全兼容 OpenAI Chat Completions API 格式
- **流式响应**：支持 Server-Sent Events (SSE) 流式输出

### 🚀 完善的错误处理
- 详细的错误分类和中文提示
- API 密钥验证和网络错误处理
- 适当的 HTTP 状态码和错误信息

### 🔒 跨域支持
- 完整的 CORS 配置
- 支持跨域请求和预检请求
- 安全的头部配置

### 📊 请求日志
- 详细的请求和响应日志
- 性能监控和时间统计
- 错误追踪和调试信息

## 🛡 技术栈

- **Cloudflare Workers**：运行时平台
- **zhipuai-sdk-nodejs-v4**：智谱 AI 客户端
- **TypeScript**：类型安全的实现
- **环境变量配置**：安全的 API 密钥管理

## API 端点

### 聊天完成
```bash
POST /v1/chat/completions
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下自己"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 4000,
  "stream": false
}
```

### 简化聊天接口
```bash
POST /chat
Content-Type: application/json

{
  "messages": [
    {
      "role": "user", 
      "content": "你好"
    }
  ]
}
```

### 文本直接对话
```bash
POST /chat
Content-Type: text/plain

你好，请介绍一下自己
```

### 流式响应示例
```bash
POST /v1/chat/completions
Content-Type: application/json

{
  "messages": [
    {"role": "user", "content": "请写一首诗"}
  ],
  "stream": true
}
```

## 🔧 环境配置

在 Cloudflare Workers 中设置环境变量：
```bash
# 设置智谱 AI API 密钥
wrangler secret put ZHIPU_API_KEY

# 输入你的智谱 API 密钥
your-zhipuai-api-key-here
```

## 🚀 部署

```bash
# 安装依赖
npm install

# 设置 API 密钥
wrangler secret put ZHIPU_API_KEY

# 部署到 Cloudflare Workers
npm run deploy

# 本地开发
npm run dev
```

## 📋 响应格式

### 非流式响应
```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "glm-4-flash",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！我是基于智谱AI GLM-4模型的助手..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

### 流式响应
```text
data: {"choices":[{"delta":{"content":"你好"}}]}

data: {"choices":[{"delta":{"content":"！我是"}}]}

data: [DONE]
```

### 错误响应
```json
{
  "error": {
    "message": "智谱AI服务暂时不可用，请检查API密钥配置",
    "type": "chat_completion_error",
    "suggestion": "请检查输入内容或稍后重试"
  }
}
```

## 🔍 使用示例

### JavaScript/TypeScript
```javascript
const response = await fetch('https://your-worker.workers.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '你好' }
    ]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Python
```python
import requests

response = requests.post('https://your-worker.workers.dev/v1/chat/completions', json={
    "messages": [
        {"role": "user", "content": "你好"}
    ]
})

data = response.json()
print(data['choices'][0]['message']['content'])
```

### cURL
```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

## 🚨 注意事项

1. **API 密钥安全**：请确保智谱 AI API 密钥的安全存储
2. **速率限制**：注意智谱 AI 的 API 调用频率限制
3. **错误处理**：在生产环境中请妥善处理各种错误情况
4. **成本控制**：监控 API 使用量以控制成本

## 📊 监控

```bash
# 实时查看日志
npx wrangler tail

# 检查部署状态
npx wrangler deploy --dry-run
```

## 🔄 版本兼容性

- 兼容 OpenAI Chat Completions API v1 格式
- 支持 GLM-4-flash 模型
- TypeScript 类型安全
- Node.js 兼容性支持

这个项目提供了一个简单、可靠的方式来使用智谱 AI 的聊天能力，通过 Cloudflare Workers 的全球边缘网络提供低延迟的 AI 服务。🚀
