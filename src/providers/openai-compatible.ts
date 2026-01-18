import { AIProviderConfig, ChatMessage, JSONSchemaFormat } from '../types';
import { fetchWithTimeout } from '../utils';

// 调用OpenAI兼容API (DeepSeek/NIM)
export async function callOpenAICompatible(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number; responseFormat?: JSONSchemaFormat } = {}
): Promise<Response> {
	if (!config.apiKey) {
		throw new Error(`API key not configured for ${config.name}`);
	}

	const defaultMaxTokens = 8192;
	
	const requestBody: any = {
		model: config.model,
		messages: messages,
		stream: options.stream || false,
		temperature: options.temperature ?? 0.7,
		max_tokens: options.max_tokens ?? defaultMaxTokens
	};

	// 如果有responseFormat，添加response_format参数
	if (options.responseFormat) {
		// DeepSeek 不支持 json_schema，只支持简单的 json_object
		if (config.name === 'deepseek') {
			requestBody.response_format = { type: 'json_object' };
		} else {
			// 其他提供商使用完整的 json_schema
			requestBody.response_format = {
				type: options.responseFormat.type,
				json_schema: {
					name: options.responseFormat.name || 'response_schema',
					strict: options.responseFormat.strict ?? true,
					schema: options.responseFormat.schema
				}
			};
		}
	}
	
	const response = await fetchWithTimeout(config.baseURL, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	}, 15000); // 15秒超时

	if (!response.ok) {
		const errorData = await response.json() as any;
		const error = new Error(errorData.error?.message || `API request failed for ${config.name}`) as any;
		error.status = response.status;
		throw error;
	}

	return response;
}
