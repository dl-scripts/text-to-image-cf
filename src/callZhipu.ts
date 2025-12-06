import { AIProviderConfig, ChatMessage } from '.';
import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';

// 调用智谱AI API
export async function callZhipuAI(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<any> {
	console.log('调用智谱AI API:', {
		provider: config.name,
		model: config.model,
		messageCount: messages.length,
		apiKey: config.apiKey ? 'configured' : 'missing'
	});

	const client = new ZhipuAI({
		apiKey: config.apiKey
	});
	
	try {
		const response = await client.createCompletions({
			model: config.model,
			messages: messages,
			temperature: options.temperature ?? 0.3,
			maxTokens: options.max_tokens ?? 4000,
			stream: options.stream ?? false
		});
		
		console.log('智谱AI API 响应成功:', {
			responseType: typeof response,
			hasChoices: !!response?.choices,
			choicesCount: response?.choices?.length || 0
		});
		
		return response;
	} catch (error) {
		console.error('智谱AI API 调用失败:', {
			error: error instanceof Error ? error.message : String(error),
			errorType: error instanceof Error ? error.constructor.name : typeof error,
			provider: config.name,
			model: config.model
		});
		throw error;
	}
}