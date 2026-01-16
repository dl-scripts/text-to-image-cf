import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';
import { AIProviderConfig, ChatMessage, JSONSchemaFormat } from '../types';

// 调用智谱AI API
export async function callZhipuAI(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number; responseFormat?: JSONSchemaFormat } = {}
): Promise<any> {
	const client = new ZhipuAI({
		apiKey: config.apiKey
	});
	
	try {
		const requestParams: any = {
			model: config.model,
			messages: messages,
			temperature: options.temperature ?? 0.7,
			maxTokens: options.max_tokens ?? 8192,
			stream: options.stream ?? false
		};

		// 如果有responseFormat，添加response_format参数
		if (options.responseFormat) {
			requestParams.response_format = {
				type: options.responseFormat.type,
				json_schema: {
					name: options.responseFormat.name || 'response_schema',
					strict: options.responseFormat.strict ?? true,
					schema: options.responseFormat.schema
				}
			};
		}

		return await client.createCompletions(requestParams);
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
