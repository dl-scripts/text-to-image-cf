# 提示词使用指南

## 概述

项目中的所有提示词和错误消息现在都集中管理在 `src/prompts.ts` 文件中。

## 系统提示词

### 使用方法

```typescript
import { getSystemPrompt, SYSTEM_PROMPTS } from './prompts';

// 使用默认系统提示词
const defaultPrompt = getSystemPrompt();

// 使用特定场景的系统提示词
const codingPrompt = getSystemPrompt('coding');
const translatorPrompt = getSystemPrompt('translator');
```

### 可用的系统提示词类型

- `default`: 默认助手
- `coding`: 编程助手
- `translator`: 翻译助手
- `writing`: 写作助手
- `analyst`: 分析助手
- `concise`: 简洁模式
- `detailed`: 详细模式

### 在聊天请求中使用

如果你想在聊天请求中添加系统提示词，可以这样做：

```typescript
import { getSystemPrompt } from '../prompts';

// 在消息数组开头添加系统提示词
const messages = [
  { role: 'system', content: getSystemPrompt('coding') },
  { role: 'user', content: '用户的问题...' }
];
```

## 用户提示词模板

### 使用方法

```typescript
import { USER_PROMPT_TEMPLATES } from './prompts';

// 代码审查模板
const codeReviewPrompt = USER_PROMPT_TEMPLATES.codeReview(`
  function example() {
    console.log('Hello');
  }
`);

// 翻译模板
const translatePrompt = USER_PROMPT_TEMPLATES.translate('Hello, World!', '中文');

// 总结模板
const summarizePrompt = USER_PROMPT_TEMPLATES.summarize('长文本内容...');
```

## 错误消息

### 使用方法

```typescript
import { getErrorMessage, ERROR_MESSAGES } from './prompts';

// 使用预定义的错误消息
const errorMsg = getErrorMessage('unauthorized');

// 使用自定义错误消息
const customErrorMsg = getErrorMessage('serverError', '自定义错误描述');

// 直接访问错误消息
const rateLimitMsg = ERROR_MESSAGES.rateLimitExceeded;
```

## 添加新的提示词

### 添加系统提示词

在 `src/prompts.ts` 文件中的 `SYSTEM_PROMPTS` 对象添加新的提示词：

```typescript
export const SYSTEM_PROMPTS = {
  // ... 现有提示词
  
  // 新的提示词
  myNewPrompt: `这是一个新的系统提示词...`,
} as const;
```

### 添加错误消息

在 `ERROR_MESSAGES` 对象中添加新的错误消息：

```typescript
export const ERROR_MESSAGES = {
  // ... 现有错误消息
  
  // 新的错误消息
  myNewError: '这是一个新的错误消息',
} as const;
```

## 在API请求中指定系统提示词类型

你可以扩展 API 来支持通过请求参数选择系统提示词类型。例如：

```bash
curl -X POST https://your-worker.workers.dev/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "请帮我审查这段代码"}
    ],
    "systemPrompt": "coding"
  }'
```

要实现这个功能，需要在 `ChatRequest` 类型中添加 `systemPrompt` 字段，然后在处理请求时自动插入相应的系统提示词。

## 最佳实践

1. **集中管理**: 所有提示词都应该在 `src/prompts.ts` 中定义，避免在代码中硬编码
2. **类型安全**: 使用 TypeScript 的类型系统确保提示词类型的正确性
3. **可维护性**: 定期审查和更新提示词，确保它们符合当前的需求
4. **国际化**: 如果需要支持多语言，可以为每种语言创建单独的提示词文件
5. **文档化**: 为每个提示词添加注释，说明其用途和使用场景
