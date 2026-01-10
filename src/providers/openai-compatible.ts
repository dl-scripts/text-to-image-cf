import { AIProviderConfig, ChatMessage } from '../types';
import { fetchWithTimeout } from '../utils';

// 调用OpenAI兼容API (SiliconFlow/DeepSeek/NIM)
export async function callOpenAICompatible(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<Response> {
	if (!config.apiKey) {
		throw new Error(`API key not configured for ${config.name}`);
	}

	const defaultMaxTokens = 8192;
	
	const response = await fetchWithTimeout(config.baseURL, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: config.model,
			messages: messages,
			stream: options.stream || false,
			temperature: options.temperature ?? 0.7,
			max_tokens: options.max_tokens ?? defaultMaxTokens
		})
	}, 3500); // 5秒超时

	if (!response.ok) {
		const errorData = await response.json() as any;
		const error = new Error(errorData.error?.message || `API request failed for ${config.name}`) as any;
		error.status = response.status;
		throw error;
	}

	return response;
}
