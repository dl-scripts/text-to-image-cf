# Retry 机制说明

## 概述

从此版本开始，retry（重试）机制默认**关闭**。只有在请求中显式启用时才会触发重试逻辑。

## 如何启用 Retry

在请求头中添加 `X-Enable-Retry: true` 即可启用重试机制：

```bash
curl -X POST https://your-api.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Enable-Retry: true" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

## Retry 行为

当启用 retry 后：

1. **触发条件**：仅在以下情况下触发重试
   - API 返回 5xx 错误（500-599）
   - 请求超时

2. **重试策略**
   - 自动切换到另一个可用的 AI Provider
   - 记录重试状态（响应头中会包含 `X-Retried: true`）
   - Circuit Breaker 仍然生效，避免重复调用失败的 Provider

3. **默认行为**（不设置 `X-Enable-Retry` 或设置为 `false`）
   - 遇到错误直接返回给客户端
   - 不会自动切换 Provider
   - Circuit Breaker 仍然记录失败状态

## 响应头

- `X-AI-Provider`: 实际使用的 Provider 名称
- `X-Retried`: 如果发生了重试，值为 `true`；否则为 `false`

## CORS 配置

已更新 CORS 配置以支持 `X-Enable-Retry` 请求头：

```typescript
'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Enable-Retry'
```

## 注意事项

- 即使启用 retry，如果所有 Provider 都不可用（Circuit Breaker 全部打开），仍然会返回错误
- Retry 只会尝试一次备用 Provider，不会进行多次重试
- 对于 4xx 错误（如认证失败、参数错误等），不会触发重试
