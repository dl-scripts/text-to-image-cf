# 智能指令提取功能

## 概述

批处理系统现在支持智能指令提取，能够自动识别和合并相同的翻译指令，避免重复发送相同的指令前缀。

## 功能说明

### 问题场景

在翻译场景下，用户消息通常格式如下：

```
翻译为简体中文（仅输出译文内容）：

Firefox DevTools hide unreferenced CSS variables
```

如果直接将多个这样的消息合并，会得到：

```
翻译为简体中文（仅输出译文内容）：

Firefox DevTools hide unreferenced CSS variables

---

翻译为简体中文（仅输出译文内容）：

JavaScript Array Methods

---

翻译为简体中文（仅输出译文内容）：

Understanding TypeScript Generics
```

这会浪费大量 token，因为指令 "翻译为简体中文（仅输出译文内容）：" 重复了多次。

### 解决方案

智能指令提取功能会：

1. **检测指令前缀**：识别第一行是否包含翻译指令关键词（翻译、translate、转换、convert、改写、rewrite）并以冒号结尾
2. **提取公共指令**：如果检测到指令，将第一个消息的指令作为公共前缀
3. **提取纯内容**：从后续消息中去除相同的指令，只保留真正需要处理的内容
4. **智能合并**：最终输出为 `指令 + 内容1 + --- + 内容2 + --- + 内容3`

优化后的合并结果：

```
翻译为简体中文（仅输出译文内容）：

Firefox DevTools hide unreferenced CSS variables

---

JavaScript Array Methods

---

Understanding TypeScript Generics
```

## 支持的指令模式

系统使用以下正则表达式检测指令：

```javascript
/^(翻译|translate|转换|convert|改写|rewrite).*[：:]\s*$/i
```

支持的指令示例：

- `翻译为简体中文（仅输出译文内容）：`
- `Translate to English:`
- `转换为正式语气：`
- `Convert to JSON format:`
- `改写为更简洁的表达：`
- `Rewrite in professional tone:`

## 实现细节

### 检测逻辑

在 [src/request-batcher.ts](src/request-batcher.ts) 的 `processBatch` 方法中：

```typescript
batch.userMessages.forEach((message, index) => {
    const lines = message.split('\n');
    const firstLine = lines[0]?.trim() || '';
    
    // 检测是否是翻译指令
    const isInstruction = /^(翻译|translate|转换|convert|改写|rewrite).*[：:]\s*$/i.test(firstLine);
    
    if (isInstruction && index === 0) {
        // 第一个消息，保存指令作为公共前缀
        commonPrefix = firstLine;
        const content = lines.slice(1).join('\n').trim();
        contents.push(content);
    } else if (isInstruction && commonPrefix) {
        // 后续消息也有相同类型的指令，只提取内容
        const content = lines.slice(1).join('\n').trim();
        contents.push(content);
    } else {
        // 没有指令前缀，直接使用完整消息
        contents.push(message);
    }
});
```

### 合并策略

```typescript
let mergedContent: string;
if (commonPrefix) {
    // 有公共指令：指令 + 换行 + 内容1 + 分隔符 + 内容2 + ...
    mergedContent = commonPrefix + '\n\n' + contents.join('\n\n---\n\n');
} else {
    // 没有公共指令，直接用分隔符连接
    mergedContent = batch.userMessages.join('\n\n---\n\n');
}
```

## 测试

### 运行测试

```bash
# 启动开发服务器
npm run dev

# 在新终端运行测试
npm run test:instruction
```

### 测试输出

测试会发送3个带有相同翻译指令的请求，验证：

1. 所有请求被正确批处理
2. 日志显示检测到公共指令前缀
3. 每个请求收到正确的翻译结果

### 查看日志

在开发服务器终端查看批处理日志：

```
[Batch] Processing 3 requests for requestId: test-instruction-1234567890
[Batch] Detected instruction prefix: "翻译为简体中文（仅输出译文内容）："
[Batch] Merged with common prefix, 3 content blocks
```

## Token 节省估算

以翻译场景为例：

- **指令长度**：`翻译为简体中文（仅输出译文内容）：` ≈ 20 tokens
- **批处理数量**：3 个请求

**优化前**：20 tokens × 3 = 60 tokens（仅指令部分）  
**优化后**：20 tokens × 1 = 20 tokens（仅指令部分）  
**节省**：40 tokens（约 67% 减少）

实际使用中，随着批处理数量增加，节省效果更明显：

| 批处理大小 | 优化前 | 优化后 | 节省比例 |
|----------|--------|--------|---------|
| 3        | 60     | 20     | 67%     |
| 5        | 100    | 20     | 80%     |
| 10       | 200    | 20     | 90%     |

## 向后兼容

- 如果消息没有指令前缀，系统会自动回退到简单拼接模式
- System message 仍然只保留一个（与之前行为一致）
- 对于非翻译场景，行为不受影响

## 相关配置

批处理配置位于 [src/config.ts](src/config.ts)：

```typescript
export const batchConfig = {
    enabled: true,          // 启用批处理
    delay: 300,            // 300ms 窗口期
    maxBatchSize: 10,      // 最多合并10个请求
};
```

## 调试

如需查看详细的批处理日志，可以检查：

1. `[Batch] Detected instruction prefix:` - 显示检测到的公共指令
2. `[Batch] Merged with common prefix` - 显示使用指令提取模式
3. `[Batch] Merged without prefix extraction` - 显示使用简单拼接模式

## 相关文档

- [BATCHING_GUIDE.md](BATCHING_GUIDE.md) - 批处理系统完整指南
- [BATCHING_QUICKSTART.md](BATCHING_QUICKSTART.md) - 快速开始
- [BATCHING_TROUBLESHOOTING.md](BATCHING_TROUBLESHOOTING.md) - 故障排查
