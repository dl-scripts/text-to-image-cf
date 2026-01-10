# 批处理配置说明

## 在 src/config.ts 中配置批处理参数

```typescript
export const batchConfig = {
  // 是否启用批处理
  // true: 启用批处理，相同 requestId 的请求会被合并
  // false: 禁用批处理，所有请求独立处理
  enabled: true,
  
  // 批处理延迟时间（毫秒）
  // 在此时间窗口内收到的相同 requestId 的请求会被合并
  // 推荐值: 200-500ms
  // - 太短: 合并效果不明显
  // - 太长: 用户等待时间过长
  delay: 300,
  
  // 单个批次最大请求数
  // 达到此数量后立即处理，不再等待延迟时间
  // 推荐值: 5-10
  // - 太小: 无法充分利用批处理优势
  // - 太大: 可能导致单次请求过大或超时
  maxBatchSize: 10,
};
```

## 使用场景分析

### 场景 1: 翻译插件（推荐启用）
```typescript
// 配置
enabled: true
delay: 300
maxBatchSize: 10

// 说明
// 用户选中多段文字并点击翻译，插件会为每段生成一个请求
// 所有请求使用相同的 requestId
// 系统会在 300ms 内合并这些请求，一次性发送给 AI
// 可以节省大量的系统提示词 token
```

### 场景 2: 实时对话（推荐禁用）
```typescript
// 配置
enabled: false

// 说明
// 用户与 AI 进行实时对话
// 每次对话都是独立的，不应该合并
// 延迟会影响用户体验
```

### 场景 3: API 批量调用（启用并调整参数）
```typescript
// 配置
enabled: true
delay: 500
maxBatchSize: 20

// 说明
// 后端服务批量处理数据
// 可以容忍较长的延迟
// 需要更大的批次大小
```

## Token 节省计算示例

### 系统提示词: 500 tokens

#### 不启用批处理
```
请求 1: 500 (系统) + 10 (用户) = 510 tokens
请求 2: 500 (系统) + 10 (用户) = 510 tokens
请求 3: 500 (系统) + 10 (用户) = 510 tokens
总计: 1530 tokens
```

#### 启用批处理
```
合并请求: 500 (系统) + 30 (用户 + 分隔符) = 530 tokens
节省: 1530 - 530 = 1000 tokens (约 65%)
```

### 10个请求的情况
```
不启用: 10 × 510 = 5100 tokens
启用: 500 + (10 × 10) + 20 = 620 tokens
节省: 约 88%
```

## 监控和调试

### 启用详细日志
在代码中已包含详细的批处理日志：
```
Processing request: { requestId: "xxx", hasUserMessages: true }
Batching 3 requests for requestId: xxx
Batch processed successfully: 3 requests merged
```

### 检查响应头
批处理的响应包含特殊 headers：
```
X-Batched: true
X-Batch-Size: 3
```

### 客户端验证
```javascript
const response = await fetch(url, options);
const isBatched = response.headers.get('X-Batched') === 'true';
const batchSize = response.headers.get('X-Batch-Size');
console.log(`批处理: ${isBatched}, 批次大小: ${batchSize}`);
```

## 常见问题

### Q: 如何为单个请求禁用批处理？
A: 添加 HTTP Header: `X-Enable-Batching: false`

### Q: 流式响应支持批处理吗？
A: 不支持。包含 `stream: true` 的请求会自动跳过批处理。

### Q: 响应内容中包含 `---` 怎么办？
A: 系统使用 `\n\n---\n\n` 作为分隔符，一般内容中不会完全匹配。
   如果确实有问题，可以考虑修改分隔符或为该请求禁用批处理。

### Q: 批处理失败会怎样？
A: 所有该批次的请求都会收到错误响应。系统会记录详细的错误日志。

### Q: 不同用户的请求会被合并吗？
A: 不会。只有相同 requestId 的请求才会被合并。
   确保每个用户/会话使用不同的 requestId。

### Q: 如何测试批处理功能？
A: 运行测试脚本：
```bash
npm run dev  # 启动开发服务器
# 在另一个终端
npm run test:batch  # 运行批处理测试
```

## 性能优化建议

1. **根据实际情况调整延迟**
   - 监控日志中的批次大小
   - 如果批次大小普遍为 1，考虑增加延迟
   - 如果用户反馈响应慢，考虑减少延迟

2. **设置合理的最大批次大小**
   - 避免单个请求过大导致超时
   - 考虑 AI 模型的 token 限制
   - 监控错误率，如果批处理失败频繁，减小批次大小

3. **针对不同场景使用不同配置**
   - 可以通过环境变量动态配置
   - 在 wrangler.json 中设置不同环境的配置

4. **客户端优化**
   - 确保同一批请求使用相同的 requestId
   - 尽量在短时间内发送所有相关请求
   - 可以考虑客户端延迟发送来等待更多请求
