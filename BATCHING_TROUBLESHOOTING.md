# 批处理功能故障排查指南

## 问题：批处理没有正确工作

如果你发现批处理功能默认开启但似乎没有正确处理请求，请按照以下步骤进行诊断。

## 快速诊断

### 1. 运行诊断工具

```bash
# 确保 Worker 正在运行
npm run dev

# 在另一个终端运行诊断工具
npm run test:diagnostic
```

诊断工具会进行5项测试：
- ✓ 基本批处理（3个快速请求）
- ✓ 延迟请求（间隔200ms）
- ✓ 过慢请求（间隔400ms，超过窗口）
- ✓ 禁用批处理
- ✓ 不同 Request ID

### 2. 检查日志输出

Worker 日志中应该看到：
```
[Batch] Creating new batch for requestId: xxx
[Batch] Adding to existing batch for requestId: xxx, current size: 1
[Batch] Setting timer for 300ms, current batch size: 2
[Batch] Processing batch for requestId: xxx
[Batch] Batch contains 2 requests
Batching 2 requests for requestId: xxx
Batch processed successfully: 2 requests merged
```

### 3. 检查响应 Headers

正确的批处理响应应该包含：
```
X-Batched: true
X-Batch-Size: 3
```

## 常见问题及解决方案

### 问题1: 批处理配置被禁用

**症状**: 所有请求都单独处理，没有 `X-Batched` header

**检查**:
```bash
# 查看 src/config.ts
grep "enabled" src/config.ts
```

**解决方案**:
确保配置为：
```typescript
export const batchConfig = {
  enabled: true,  // ← 必须是 true
  delay: 300,
  maxBatchSize: 10,
};
```

### 问题2: 请求没有使用相同的 RequestId

**症状**: 每个请求的批次大小都是 1

**检查日志**:
```
Processing request: { requestId: "abc-1", hasUserMessages: true }
Processing request: { requestId: "abc-2", hasUserMessages: true }
Processing request: { requestId: "abc-3", hasUserMessages: true }
```
↑ 注意 requestId 不同

**解决方案**:
确保客户端发送相同的 requestId：
```javascript
const requestId = 'article-' + Date.now();

// 所有请求使用相同的 requestId
fetch(url, {
  headers: {
    'X-Request-Id': requestId  // ← 相同的值
  }
})
```

### 问题3: 请求发送间隔太长

**症状**: 请求被分成多个批次处理

**检查**:
- 批处理窗口默认 300ms
- 如果请求间隔 > 300ms，会被分开处理

**解决方案**:

**选项A**: 增加延迟时间
```typescript
export const batchConfig = {
  enabled: true,
  delay: 500,  // ← 增加到 500ms
  maxBatchSize: 10,
};
```

**选项B**: 客户端一次性发送所有请求
```javascript
// ✓ 正确：并发发送
Promise.all([
  fetch(url, { ... }),
  fetch(url, { ... }),
  fetch(url, { ... })
]);

// ✗ 错误：顺序发送（太慢）
await fetch(url, { ... });
await sleep(500);  // ← 超过300ms窗口
await fetch(url, { ... });
```

### 问题4: 流式响应导致跳过批处理

**症状**: 请求包含 `stream: true`

**检查请求体**:
```json
{
  "messages": [...],
  "stream": true  // ← 流式响应会跳过批处理
}
```

**解决方案**:
批处理不支持流式响应（技术限制）。如果需要批处理，设置：
```json
{
  "messages": [...],
  "stream": false  // 或者不设置此字段
}
```

### 问题5: 响应拆分不正确

**症状**: 所有请求返回相同的内容，或者内容混乱

**原因**: 
- AI 返回的内容没有按 `\n\n---\n\n` 格式分隔
- 提示词没有要求 AI 使用分隔符

**检查日志**:
```
Response parts (1) don't match request count (3)
```
↑ 警告：拆分数量不匹配

**解决方案**:

**临时方案**: 在系统提示词中明确要求：
```typescript
const systemPrompt = `你是翻译助手。
当收到多段文本时（用 --- 分隔），请逐段翻译，并在译文之间也用 \n\n---\n\n 分隔。

例如：
输入: "Hello\n\n---\n\nWorld"
输出: "你好\n\n---\n\n世界"`;
```

**长期方案**: 改进拆分逻辑，使用更可靠的方法。

### 问题6: Cloudflare Workers 环境问题

**症状**: 本地测试正常，部署后不工作

**可能原因**:
1. Workers 的 `setTimeout` 在某些情况下表现不一致
2. 无状态环境可能导致批处理状态丢失

**检查**:
```bash
# 查看生产日志
wrangler tail
```

**解决方案**:
考虑使用 Durable Objects 来持久化批处理状态（高级方案）。

### 问题7: CORS Headers 缺失

**症状**: 浏览器无法读取 `X-Batched` header

**检查浏览器控制台**:
```
Access to header 'X-Batched' from origin 'xxx' has been blocked by CORS policy
```

**解决方案**:
确保 `src/config.ts` 包含：
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Enable-Batching',
  'Access-Control-Expose-Headers': 'X-Batched, X-Batch-Size',  // ← 添加这一行
};
```

## 调试技巧

### 技巧1: 添加详细日志

在 `src/request-batcher.ts` 中临时添加：
```typescript
// 在 processBatch 开始处
console.log('[DEBUG] User messages:', batch.userMessages);
console.log('[DEBUG] Merged content:', mergedContent);

// 在拆分后
console.log('[DEBUG] AI response:', content);
console.log('[DEBUG] Split parts:', parts);
```

### 技巧2: 检查时间戳

```javascript
// 客户端
const timestamps = [];
for (let i = 0; i < 3; i++) {
  timestamps.push(Date.now());
  await fetch(url, { ... });
}
console.log('请求间隔:', timestamps.map((t, i) => 
  i > 0 ? t - timestamps[i-1] : 0
));
```

### 技巧3: 使用 curl 测试

```bash
# 在300ms内发送3个请求
REQUEST_ID="test-$(date +%s)"

curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"messages":[{"role":"user","content":"1"}]}' &

curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"messages":[{"role":"user","content":"2"}]}' &

curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"messages":[{"role":"user","content":"3"}]}' &

wait
```

### 技巧4: 监控批处理统计

添加统计功能（可选）：
```typescript
// 在 request-batcher.ts 中
private stats = {
  totalRequests: 0,
  totalBatches: 0,
  avgBatchSize: 0,
};

// 在 processBatch 中
this.stats.totalRequests += batch.originalRequests.length;
this.stats.totalBatches++;
this.stats.avgBatchSize = this.stats.totalRequests / this.stats.totalBatches;
console.log('[Batch Stats]', this.stats);
```

## 验证清单

在部署前确认：

- [ ] `batchConfig.enabled = true`
- [ ] 客户端使用相同的 `X-Request-Id`
- [ ] 请求在 300ms 内发送（或调整 delay）
- [ ] 请求不包含 `stream: true`
- [ ] CORS headers 正确配置
- [ ] 运行诊断测试全部通过
- [ ] 查看日志确认批处理正在工作
- [ ] 响应包含 `X-Batched: true` header

## 需要帮助？

如果问题仍然存在：

1. 运行 `npm run test:diagnostic` 并保存输出
2. 收集 Worker 日志（包含 `[Batch]` 前缀的行）
3. 检查请求和响应示例
4. 查看浏览器网络面板

## 已知限制

1. **流式响应不支持批处理** - 这是设计限制
2. **Cloudflare Workers 无状态** - Worker 重启会丢失批处理状态
3. **定时器精度** - setTimeout 在高负载下可能不够精确
4. **最大请求大小** - 合并后的请求不能超过 AI 模型限制

## 性能建议

- 延迟时间：200-500ms
- 最大批次：5-10
- 适用场景：翻译、批量处理
- 不适用：实时对话、长文本
