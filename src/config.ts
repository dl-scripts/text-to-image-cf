import { AIProvider, AIProviderConfig, ChatRequest, Env } from './types';
import { circuitBreaker } from './circuit-breaker';

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
			const selectedProvider = provider as AIProvider;
			// 即使指定了provider，也要检查断路器状态
			if (circuitBreaker.canExecute(selectedProvider)) {
				return selectedProvider;
			}
			console.log(`[Circuit Breaker] Requested provider ${selectedProvider} is unavailable, selecting alternative`);
			// 如果指定的provider不可用，继续选择可用的provider
		}
	}
	
	// 检查消息内容中是否包含provider参数
	const providerParam = request.messages?.find(msg =>
		msg.content?.includes('provider=')
	)?.content?.split('provider=')[1]?.trim();
	
	// 如果指定了provider参数，使用指定的provider
	if (providerParam === 'zhipu' || providerParam === 'siliconflow' || providerParam === 'deepseek' || providerParam === 'nim') {
		const selectedProvider = providerParam as AIProvider;
		if (circuitBreaker.canExecute(selectedProvider)) {
			return selectedProvider;
		}
		console.log(`[Circuit Breaker] Requested provider ${selectedProvider} is unavailable, selecting alternative`);
	}
	
	// 随机选择一个可用的provider
	const allProviders: AIProvider[] = ['zhipu', 'siliconflow', 'deepseek', 'nim', 'nim'];
	const availableProviders = circuitBreaker.getAvailableProviders(allProviders);
	
	if (availableProviders.length === 0) {
		// 所有provider都不可用，返回nim作为最后的选择
		console.warn('[Circuit Breaker] All providers unavailable, using nim as fallback');
		return 'nim';
	}
	
	const randomIndex = Math.floor(Math.random() * availableProviders.length);
	return availableProviders[randomIndex];
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
				model: env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
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
