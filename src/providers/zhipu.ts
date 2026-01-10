import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';
import { AIProviderConfig, ChatMessage } from '../types';

// 调用智谱AI API
export async function callZhipuAI(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<any> {
	const client = new ZhipuAI({
		apiKey: config.apiKey
	});
	
	try {
		return await client.createCompletions({
			model: config.model,
			messages: messages,
			temperature: options.temperature ?? 0.7,
			maxTokens: options.max_tokens ?? 8192,
			stream: options.stream ?? false
		});
	} catch (error: any) {
		// 检查是否是HTTP错误并提取状态码
		if (error.message) {
			// 尝试从错误消息中提取状态码 (例如: "500", "502", "503"等)
			const statusMatch = error.message.match(/\b(5\d{2})\b/);
			if (statusMatch) {
				error.status = parseInt(statusMatch[1]);
			}
		}
		throw error;
	}
}
