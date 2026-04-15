# JSON Schema Response Format 修复说明

## 问题描述

当向API发送包含 `response_format` 参数的请求时，智谱AI返回的是普通文本而不是符合JSON Schema的结构化响应。

### 示例请求
```json
{
  "model": "google/gemini-2.5-flash",
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "navigator_output",
      "schema": { ... }
    }
  },
  "messages": [...]
}
```

### 错误的返回
```json
{
  "choices": [{
    "message": {
      "content": "[Current state ends]\n[Your task history memory starts here]..."
    }
  }]
}
```

## 根本原因

1. **类型定义缺失**: `ChatRequest` 接口没有定义 `response_format` 字段
2. **参数未传递**: 在构造API调用选项时，`response_format` 没有从请求体传递到provider

## 修复内容

### 1. 更新类型定义 (src/types.ts)

添加了 `response_format` 和 `top_p` 字段到 `ChatRequest`:

```typescript
export interface ChatRequest {
	messages: ChatMessage[];
	model?: string;
	stream?: boolean;
	provider?: string;
	temperature?: number;
	max_tokens?: number;
	top_p?: number;  // 新增
	response_format?: {  // 新增
		type: 'json_schema';
		json_schema?: {
			name?: string;
			strict?: boolean;
			schema: any;
		};
	};
	requestId?: string;
	metadata?: {
		requestId?: string;
		[key: string]: any;
	};
}
```

同时简化了 `JSONSchemaFormat` 的 schema 类型：

```typescript
export interface JSONSchemaFormat {
	type: 'json_schema';
	name?: string;
	strict?: boolean;
	schema: any;  // 改为any以支持复杂嵌套
}
```

### 2. 传递response_format参数 (src/handlers/chat.ts)

在构造options对象时，添加了对 `response_format` 的处理：

```typescript
// 构造请求选项
const options: any = {
	stream: requestBody.stream ?? false,
	temperature: requestBody.temperature,
	max_tokens: requestBody.max_tokens
};

// 如果请求包含response_format，添加到options中
if (requestBody.response_format?.type === 'json_schema') {
	options.responseFormat = {
		type: 'json_schema',
		name: requestBody.response_format.json_schema?.name,
		strict: requestBody.response_format.json_schema?.strict,
		schema: requestBody.response_format.json_schema?.schema
	};
	console.log('[Chat] [步骤1.5] Response format detected:', {
		type: options.responseFormat.type,
		name: options.responseFormat.name,
		hasSchema: !!options.responseFormat.schema
	});
}
```

## 验证


## 测试

运行测试脚本验证修复：

```bash
node test/test-json-schema.js
```

期望的行为：
- ✅ 返回符合指定JSON Schema的结构化响应
- ✅ 内容可以被成功解析为JSON
- ✅ 包含所有required字段

## 注意事项

1. **模型支持**: 确保使用的模型支持JSON Schema（如 `glm-4-flashx`）
2. **Schema格式**: Schema必须是有效的JSON Schema格式
3. **strict模式**: 默认启用strict模式以确保严格遵循schema
4. **Provider指定**: 建议在请求中明确指定 `"provider": "zhipu"` 以确保使用智谱AI

## 相关文件

- `src/types.ts` - 类型定义
- `src/handlers/chat.ts` - 请求处理逻辑
- `test/test-json-schema.js` - 测试脚本
