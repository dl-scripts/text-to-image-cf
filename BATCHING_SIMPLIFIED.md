# 批处理简化说明

## 变更摘要

已将批处理逻辑简化，移除 requestId 判断机制。现在**所有请求自动合并批处理**。

## 改动内容

### 1. **src/request-batcher.ts** - 核心逻辑简化

**之前**：使用 `Map<string, Batch>` 按 requestId 分组
```typescript
private batches: Map<string, BatchedRequest> = new Map();

async addRequest(
    requestId: string,
    requestBody: ChatRequest,
    handler: ...
): Promise<Response>
```

**现在**：使用单个 batch 对象，自动合并所有请求
```typescript
private batch: BatchedRequest | null = null;

async addRequest(
    requestBody: ChatRequest,
    handler: ...
): Promise<Response>
```

### 2. **src/index.ts** - 移除 requestId 提取

**删除的代码**：
```typescript
// 提取requestId用于批处理
const requestId = request.headers.get('x-request-id') || 
    request.headers.get('cf-ray') ||
    requestBody.metadata?.requestId ||
    requestBody.requestId ||
    crypto.randomUUID();
```

**简化后的调用**：
```typescript
response = await requestBatcher.addRequest(
    requestBody,  // 不再需要 requestId
    async (mergedRequest) => {
        return await handleChatCompletion(mergedRequest, env);
    }
);
```

### 3. **test/smart-instruction-test.js** - 测试脚本简化

**移除**：
- `REQUEST_ID` 常量
- `X-Request-Id` header
- `requestId` 字段

## 工作原理

### 批处理触发条件

1. **300ms 时间窗口**：收到第一个请求后，等待 300ms
2. **最大批处理大小**：累积到 10 个请求时立即处理
3. **自动合并**：窗口期内的所有请求自动合并为一个

### 批处理流程

```
Request 1 arrives (t=0ms)
  ↓
  创建 batch，启动 300ms 计时器
  ↓
Request 2 arrives (t=50ms)
Request 3 arrives (t=100ms)
  ↓
  添加到同一个 batch
  ↓
Timer expires (t=300ms)
  ↓
  合并 3 个请求，发送给后台
  ↓
  拆分响应，返回给各个请求
```

### 智能指令提取（保留）

仍然支持自动提取公共翻译指令：

**输入**（3个请求）：
```
翻译为简体中文（仅输出译文内容）：
Content 1

翻译为简体中文（仅输出译文内容）：
Content 2

翻译为简体中文（仅输出译文内容）：
Content 3
```

**合并后发送给后台**：
```
翻译为简体中文（仅输出译文内容）：

Content 1

---

Content 2

---

Content 3
```

## 配置参数

在 [src/config.ts](src/config.ts)：

```typescript
export const batchConfig = {
    enabled: true,        // 启用批处理
    delay: 300,          // 300ms 窗口期
    maxBatchSize: 10,    // 最多合并 10 个请求
};
```

## 优势

1. **更简单**：不需要管理 requestId
2. **更高效**：自动合并所有并发请求
3. **Token 节省更明显**：
   - 单个服务使用场景，所有请求都会合并
   - 翻译场景：指令只发送一次
   - 批处理大小越大，节省比例越高

## 测试

```bash
# 启动开发服务器
npm run dev

# 测试智能指令提取
npm run test:instruction
```

测试会在 300ms 内发送 3 个翻译请求，验证：
- ✅ 所有请求被合并为一个批处理
- ✅ 只保留一个翻译指令
- ✅ 每个请求收到正确的响应

## 日志输出

```
[Request] Processing chat completion
[Batch] Processing 3 requests
[Batch] Detected instruction prefix: "翻译为简体中文（仅输出译文内容）："
[Batch] Merged with common prefix, 3 content blocks
[Batch] Successfully merged 3 requests
```

## 向后兼容说明

- ❌ **不兼容**：移除了 requestId 参数，需要更新所有调用代码
- ✅ **API 响应格式不变**：仍然返回标准 OpenAI 格式
- ✅ **Headers 保持一致**：`X-Batched: true`, `X-Batch-Size: N`
- ✅ **配置参数不变**：batchConfig 仍然有效

## 适用场景

此简化版本适合：
- ✅ 单用户/小团队使用
- ✅ 翻译、改写等批量处理场景
- ✅ 需要最大化 token 节省
- ✅ 不需要按业务逻辑分组请求

**不适合**：
- ❌ 多租户环境（不同用户的请求会被合并）
- ❌ 需要隔离不同业务请求
- ❌ 需要按 session/conversation 分组

如果需要分组隔离，可以通过 `X-Enable-Batching: false` header 临时禁用批处理。

## 相关文档

- [SMART_INSTRUCTION.md](SMART_INSTRUCTION.md) - 智能指令提取详解
- [BATCHING_GUIDE.md](BATCHING_GUIDE.md) - 批处理完整指南
- [BATCHING_QUICKSTART.md](BATCHING_QUICKSTART.md) - 快速开始
