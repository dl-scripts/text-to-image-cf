# 请求批处理功能实现总结

## 概述

根据 Cloudflare 日志中的 requestId，实现了智能请求批处理功能。相同 requestId 的用户消息会在 0.3 秒内自动合并，一起发送给 AI 后台，然后将响应拆分返回，从而节省 token 并提高效率。

## 新增文件

### 1. src/request-batcher.ts
**核心批处理器类**
- `RequestBatcher` 类：管理请求的批处理队列
- `addRequest()`: 添加请求到批处理队列
- `processBatch()`: 处理批量请求
  - 单个请求：直接处理
  - 多个请求：合并用户消息，使用 `\n\n---\n\n` 分隔
  - 拆分响应：按分隔符拆分，分配给各个原始请求
- `cleanup()`: 清理过期的批处理

### 2. BATCHING_GUIDE.md
**批处理功能完整指南**
- 工作原理说明
- requestId 识别机制
- 批处理时间窗口
- 请求合并和响应拆分逻辑
- 配置选项
- 控制批处理行为（全局/单个请求）
- 监控和调试方法
- Token 节省计算
- 使用场景分析
- 客户端集成示例（JavaScript/Python）
- 注意事项和性能优化建议

### 3. BATCHING_CONFIG.md
**详细配置说明**
- 配置参数解释
- 使用场景分析（翻译插件/实时对话/API批量调用）
- Token 节省计算示例
- 监控和调试指南
- 常见问题解答
- 性能优化建议

### 4. test/batching-test.js
**批处理功能测试脚本**
- `testBatching()`: 测试相同 requestId 的请求合并
- `testNoBatching()`: 测试禁用批处理
- `testDifferentRequestIds()`: 测试不同 requestId 不应合并

## 修改的文件

### 1. src/index.ts
**主入口文件**
- 导入 `requestBatcher`
- 添加 `ExecutionContext` 参数支持
- 提取 requestId（优先级：Header → CF-Ray → metadata → 生成UUID）
- 添加批处理开关逻辑（`X-Enable-Batching` header）
- 判断是否包含用户消息决定是否批处理
- 使用 `requestBatcher.addRequest()` 处理批量请求

### 2. src/types.ts
**类型定义**
- `ChatRequest` 接口新增字段：
  - `requestId?: string` - 请求ID
  - `metadata?: { requestId?: string; [key: string]: any }` - 元数据

### 3. src/config.ts
**配置文件**
- 更新 CORS headers，添加支持：
  - `X-Request-Id` - 请求ID header
  - `X-Enable-Batching` - 批处理控制 header
- 新增 `batchConfig` 配置对象：
  - `enabled: true` - 是否启用批处理
  - `delay: 300` - 批处理延迟（毫秒）
  - `maxBatchSize: 10` - 单个批次最大请求数

### 4. README.md
**主文档**
- 更新功能特性，添加"智能请求批处理"
- 新增"请求批处理功能"章节
- 提供基本使用示例
- 链接到详细的批处理指南

### 5. package.json
**项目配置**
- 新增测试脚本：
  - `test:batch` - 运行批处理测试

## 功能特性

### 1. RequestId 识别机制
优先级顺序：
1. HTTP Header `X-Request-Id`
2. Cloudflare Ray ID (`cf-ray` header)
3. 请求体 `metadata.requestId`
4. 请求体 `requestId` 字段
5. 自动生成 UUID

### 2. 批处理逻辑
```
时间轴:
t=0ms    : 请求1到达 → 创建批次，启动300ms定时器
t=50ms   : 请求2到达 → 添加到批次，重置定时器
t=100ms  : 请求3到达 → 添加到批次，重置定时器
t=400ms  : 定时器触发 → 合并3个请求，发送给AI
```

### 3. 消息合并格式
```
原始:
请求1: "翻译：Hello"
请求2: "翻译：World"

合并后:
"翻译：Hello

---

翻译：World"
```

### 4. 响应拆分
```
AI 响应: "你好\n\n---\n\n世界"
↓
响应1: "你好"
响应2: "世界"
```

### 5. Token 平均分配
每个请求的 token 使用量 = 总 token 数 / 批次大小（向下取整）

### 6. 响应 Headers
```
X-Batched: true
X-Batch-Size: 3
```

## 控制选项

### 全局配置
在 `src/config.ts` 修改：
```typescript
export const batchConfig = {
  enabled: true,      // 启用/禁用
  delay: 300,        // 延迟时间
  maxBatchSize: 10,  // 最大批次
};
```

### 单个请求控制
```bash
# 禁用批处理
curl -H "X-Enable-Batching: false" ...
```

### 自动禁用场景
- 流式响应 (`stream: true`)
- 没有用户消息的请求
- 批处理全局禁用

## Token 节省效果

### 示例计算（系统提示词 500 tokens）

| 请求数 | 不启用批处理 | 启用批处理 | 节省比例 |
|--------|--------------|------------|----------|
| 3      | 1,530        | 530        | 65%      |
| 5      | 2,550        | 550        | 78%      |
| 10     | 5,100        | 620        | 88%      |

## 测试方法

### 1. 启动开发服务器
```bash
npm run dev
```

### 2. 运行批处理测试
```bash
npm run test:batch
```

### 3. 手动测试
```bash
# 发送多个相同 requestId 的请求
REQUEST_ID="test-$(date +%s)"

curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}' &

curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: $REQUEST_ID" \
  -d '{"messages":[{"role":"user","content":"World"}]}' &

wait
```

## 注意事项

1. **分隔符冲突**
   - 使用 `\n\n---\n\n` 作为分隔符
   - 如果内容包含此模式，可能影响拆分

2. **顺序保证**
   - 响应按原始请求顺序返回
   - 索引从 0 开始

3. **错误处理**
   - 批处理失败，所有请求收到错误
   - 记录详细日志用于调试

4. **并发控制**
   - Cloudflare Workers 是无状态的
   - 批处理状态在内存中，Worker 重启会丢失

5. **延迟权衡**
   - 延迟太短：合并效果差
   - 延迟太长：用户体验差
   - 建议：200-500ms

## 部署步骤

1. **确保所有文件已添加**
```bash
git add src/request-batcher.ts
git add BATCHING_GUIDE.md
git add BATCHING_CONFIG.md
git add test/batching-test.js
```

2. **提交更改**
```bash
git commit -m "feat: 实现请求批处理功能，节省token"
```

3. **部署到 Cloudflare**
```bash
npm run deploy
```

4. **验证功能**
```bash
# 更新 test/batching-test.js 中的 WORKER_URL
# 然后运行测试
npm run test:batch
```

## 后续优化建议

1. **动态调整延迟**
   - 根据请求频率自动调整延迟时间
   - 高峰期缩短延迟，低谷期延长延迟

2. **持久化批处理状态**
   - 使用 Durable Objects 存储批处理状态
   - 避免 Worker 重启导致批处理丢失

3. **智能分隔符**
   - 使用更安全的分隔符（如特殊标记）
   - 或使用 JSON 数组格式

4. **统计分析**
   - 记录批处理命中率
   - 统计 token 节省量
   - 分析最佳延迟时间

5. **支持更多场景**
   - 支持流式批处理（技术上更复杂）
   - 支持不同消息类型的批处理
   - 支持优先级队列

## 文档链接

- [批处理功能指南](BATCHING_GUIDE.md) - 完整使用指南
- [批处理配置说明](BATCHING_CONFIG.md) - 详细配置文档
- [主 README](README.md) - 项目总览
