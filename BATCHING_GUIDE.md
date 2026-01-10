# 请求批处理功能说明

## 概述

为了节省 token 使用量并提高处理效率，系统实现了智能请求批处理功能。来自同一篇文章（相同 requestId）的多个翻译请求会被自动合并，一起发送给 AI 模型处理，然后将响应拆分返回给各个请求。

## 工作原理

### 1. 请求识别

系统通过以下方式识别来自同一来源的请求：

- **优先级 1**: HTTP Header `X-Request-Id`
- **优先级 2**: Cloudflare Ray ID (`cf-ray` header)
- **优先级 3**: 请求体中的 `metadata.requestId`
- **优先级 4**: 请求体中的 `requestId` 字段
- **优先级 5**: 自动生成的 UUID

示例请求：

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

### 2. 批处理时间窗口

- 默认延迟：**300 毫秒**
- 在此时间窗口内，相同 requestId 的请求会被累积
- 时间窗口结束后，自动合并处理

### 3. 请求合并

多个用户消息会被合并为一个请求：

```
原始请求1: "翻译：Hello"
原始请求2: "翻译：World"
原始请求3: "翻译：How are you?"

合并后:
"翻译：Hello

---

翻译：World

---

翻译：How are you?"
```

### 4. 响应拆分

AI 返回的响应会按 `---` 分隔符拆分，每个部分对应一个原始请求：

```
AI响应: "你好\n\n---\n\n世界\n\n---\n\n你好吗？"

拆分为:
响应1: "你好"
响应2: "世界"
响应3: "你好吗？"
```

## 配置选项

在 `src/config.ts` 中可以调整批处理参数：

```typescript
export const batchConfig = {
  enabled: true,        // 是否启用批处理
  delay: 300,          // 批处理延迟（毫秒）
  maxBatchSize: 10,    // 单个批次最大请求数
};
```

## 控制批处理行为

### 1. 全局禁用批处理

修改 `src/config.ts`：

```typescript
export const batchConfig = {
  enabled: false,  // 禁用批处理
  // ...
};
```

### 2. 单个请求禁用批处理

添加 HTTP Header：

```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "X-Enable-Batching: false" \
  -d '...'
```

### 3. 流式响应自动禁用批处理

当请求包含 `"stream": true` 时，批处理会自动禁用，直接处理该请求。

## 监控和调试

### 响应 Headers

批处理的响应会包含特殊的 headers：

```
X-Batched: true
X-Batch-Size: 3
```

### 日志信息

批处理会输出详细日志：

```javascript
// 请求进入批处理
Processing request: { requestId: "abc123", hasUserMessages: true }

// 批次处理
Batching 3 requests for requestId: abc123

// 批次完成
Batch processed successfully: 3 requests merged
```

## Token 节省

### 示例计算

假设系统提示词占用 500 tokens：

**不使用批处理**：
- 请求1: 500 (系统) + 10 (用户) = 510 tokens
- 请求2: 500 (系统) + 10 (用户) = 510 tokens
- 请求3: 500 (系统) + 10 (用户) = 510 tokens
- **总计**: 1530 tokens

**使用批处理**：
- 合并请求: 500 (系统) + 30 (用户，含分隔符) = 530 tokens
- **节省**: 1530 - 530 = **1000 tokens (65% 节省)**

## 使用场景

### ✅ 适合批处理

- 翻译一篇文章的多个段落
- 批量处理相似的短文本
- 同一用户的连续请求

### ❌ 不适合批处理

- 流式响应 (自动禁用)
- 对延迟敏感的实时对话
- 长文本处理（超过 max_tokens）

## 客户端集成示例

### JavaScript/TypeScript

```typescript
// 使用相同的 requestId 批量处理
const requestId = 'article-' + Date.now();

async function translateBatch(texts: string[]) {
  const promises = texts.map(text => 
    fetch('https://your-worker.workers.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: `翻译：${text}` }
        ]
      })
    }).then(r => r.json())
  );
  
  return Promise.all(promises);
}

// 使用
const results = await translateBatch([
  'Hello',
  'World',
  'How are you?'
]);
```

### Python

```python
import requests
import time

request_id = f"article-{int(time.time())}"

def translate_batch(texts):
    responses = []
    for text in texts:
        response = requests.post(
            'https://your-worker.workers.dev/v1/chat/completions',
            headers={
                'Content-Type': 'application/json',
                'X-Request-Id': request_id,
            },
            json={
                'messages': [
                    {'role': 'user', 'content': f'翻译：{text}'}
                ]
            }
        )
        responses.append(response.json())
    return responses

# 使用
results = translate_batch(['Hello', 'World', 'How are you?'])
```

## 注意事项

1. **分隔符冲突**: 如果内容中包含 `---`，可能影响响应拆分
2. **顺序保证**: 拆分响应按原始请求顺序返回
3. **错误处理**: 如果批处理失败，所有请求都会收到错误响应
4. **Token 统计**: 每个响应中的 token 使用量是平均分配的估算值

## 性能优化建议

1. **合理设置延迟**: 
   - 延迟太短：批次太小，节省有限
   - 延迟太长：用户等待时间增加

2. **控制批次大小**: 
   - 避免单个批次过大导致超时
   - 建议 maxBatchSize 保持在 5-10 之间

3. **监控效果**: 
   - 定期查看日志中的批处理统计
   - 根据实际使用情况调整参数
