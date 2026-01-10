# 批处理功能快速开始

## 1分钟快速使用

### 启用批处理（默认已启用）

在客户端发送请求时，添加相同的 `X-Request-Id` header：

```javascript
const requestId = 'article-' + Date.now();

// 发送多个请求，它们会在 300ms 内自动合并
Promise.all([
  fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-Id': requestId  // 关键：使用相同的 requestId
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '翻译：Hello' }]
    })
  }),
  
  fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Request-Id': requestId  // 相同的 requestId
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '翻译：World' }]
    })
  })
]).then(responses => {
  // 两个请求会被合并为一个发送给 AI
  // 响应会自动拆分返回
  console.log('批处理完成！');
});
```

### 禁用批处理

如果某个请求不想被合并：

```javascript
fetch(url, {
  headers: {
    'X-Enable-Batching': 'false'  // 禁用批处理
  },
  // ...
})
```

### 验证批处理是否生效

```javascript
const response = await fetch(url, options);

// 检查响应头
const batched = response.headers.get('X-Batched');
const batchSize = response.headers.get('X-Batch-Size');

console.log(`是否批处理: ${batched}`);
console.log(`批次大小: ${batchSize}`);
```

## 配置调整

编辑 `src/config.ts`：

```typescript
export const batchConfig = {
  enabled: true,      // 关闭批处理改为 false
  delay: 300,        // 调整延迟时间（毫秒）
  maxBatchSize: 10,  // 调整最大批次大小
};
```

## 测试

```bash
# 启动开发服务器
npm run dev

# 运行批处理测试（在另一个终端）
npm run test:batch
```

## 实际应用示例

### 浏览器插件翻译

```javascript
// 用户选中多段文字，插件逐段发送翻译请求
const articleId = document.location.href;
const paragraphs = getSelectedParagraphs();

paragraphs.forEach(para => {
  translateText(para.text, articleId);
});

async function translateText(text, articleId) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': articleId  // 同一文章的所有段落使用相同ID
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: `翻译为简体中文：\n\n${text}` }
      ]
    })
  });
  
  const data = await response.json();
  return data.choices[0].message.content;
}
```

### Node.js 批量处理

```javascript
const crypto = require('crypto');

async function batchTranslate(texts) {
  const batchId = crypto.randomUUID();
  
  const promises = texts.map(text =>
    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': batchId
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: `翻译：${text}` }
        ]
      })
    }).then(r => r.json())
  );
  
  const results = await Promise.all(promises);
  return results.map(r => r.choices[0].message.content);
}

// 使用
const translations = await batchTranslate([
  'Hello', 
  'World', 
  'How are you?'
]);
console.log(translations);
```

## Token 节省示例

假设系统提示词占用 500 tokens：

### 不使用批处理
```
3个请求 = 3 × (500 + 10) = 1,530 tokens
```

### 使用批处理
```
1个合并请求 = 500 + (3 × 10 + 分隔符) ≈ 530 tokens
节省 = 1,530 - 530 = 1,000 tokens (65%)
```

## 常见问题

**Q: 会影响响应速度吗？**  
A: 会增加最多 300ms 的延迟（可配置）。但通过合并请求，实际总处理时间会减少。

**Q: 如何确保请求被合并？**  
A: 确保在 300ms（默认延迟）内发送，且使用相同的 requestId。

**Q: 流式响应支持吗？**  
A: 不支持。`stream: true` 的请求会自动跳过批处理。

**Q: 响应顺序会乱吗？**  
A: 不会。响应会按原始请求顺序返回。

## 更多信息

- [完整指南](BATCHING_GUIDE.md) - 详细的功能说明
- [配置文档](BATCHING_CONFIG.md) - 配置选项和场景分析
- [实现细节](BATCHING_IMPLEMENTATION.md) - 技术实现总结
