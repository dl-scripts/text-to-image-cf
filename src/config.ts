import { AIProvider, AIProviderConfig, ChatRequest, Env } from './types';

// CORS headers for cross-origin requests
export const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// 获取请求中的provider参数，如果没有指定则随机选择
export function getProviderFromRequest(request: ChatRequest): AIProvider {
	// 检查请求中是否有provider参数
	if (request.provider) {
		const provider = request.provider.toLowerCase();
		if (provider === 'zhipu' || provider === 'siliconflow' || provider === 'deepseek' || provider === 'nim') {
			return provider as AIProvider;
		}
	}
	
	// 检查消息内容中是否包含provider参数
	const providerParam = request.messages?.find(msg =>
		msg.content?.includes('provider=')
	)?.content?.split('provider=')[1]?.trim();
	
	// 如果指定了provider参数，使用指定的provider
	if (providerParam === 'zhipu' || providerParam === 'siliconflow' || providerParam === 'deepseek' || providerParam === 'nim') {
		return providerParam as AIProvider;
	}
	
	// 否则随机选择一个provider
	const providers: AIProvider[] = ['zhipu', 'siliconflow', 'deepseek', 'nim', 'nim'];
	const randomIndex = Math.floor(Math.random() * providers.length);
	return providers[randomIndex];
}

// 根据provider获取对应的配置
export function getProviderConfig(provider: AIProvider, env: Env): AIProviderConfig {
	switch (provider) {
		case 'zhipu':
			return {
				name: 'zhipu',
				apiKey: env.ZHIPU_API_KEY || '',
				model: env.ZAI_MODEL || 'glm-4-flashx',
				baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
			};
		case 'siliconflow':
			return {
				name: 'siliconflow',
				apiKey: env.SILICONFLOW_API_KEY || '',
				model: env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
				embedding_model: env.SILICONFLOW_EMBEDDING_MODEL || 'Qwen/Qwen3-Embedding-0.6B',
				baseURL: 'https://api.siliconflow.cn/v1/chat/completions',
				embeddingURL: 'https://api.siliconflow.cn/v1/embeddings'
			};
		case 'deepseek':
			return {
				name: 'deepseek',
				apiKey: env.DEEPSEEK_API_KEY || '',
				model: 'deepseek-chat',
				baseURL: 'https://api.deepseek.com/chat/completions'
			};
		case 'nim':
			return {
				name: 'nim',
				apiKey: env.NVIDIA_API_KEY || '',
				model: env.NVIDIA_MODEL || 'moonshotai/kimi-k2-instruct-0905',
				baseURL: 'https://integrate.api.nvidia.com/v1/chat/completions'
			};
		default:
			return {
				name: 'deepseek',
				apiKey: env.DEEPSEEK_API_KEY || '',
				model: 'deepseek-chat',
				baseURL: 'https://api.deepseek.com/chat/completions'
			};
	}
}
