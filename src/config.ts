import { AIProvider, AIProviderConfig, ChatRequest, Env } from './types';
import { circuitBreaker } from './circuit-breaker';

// CORS headers for cross-origin requests
export const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, X-Enable-Retry',
	'Access-Control-Expose-Headers': 'X-AI-Provider, X-Retried',
};

// 获取一个与当前provider不同的备用provider
export function getAlternativeProvider(currentProvider: AIProvider): AIProvider {
	const allProviders: AIProvider[] = ['deepseek', 'nim', 'openrouter'];
	// 过滤掉当前provider
	const otherProviders = allProviders.filter(p => p !== currentProvider);
	// 获取可用的provider
	const availableProviders = circuitBreaker.getAvailableProviders(otherProviders);
	
	if (availableProviders.length === 0) {
		// 如果没有其他可用provider，返回列表中第一个不同的provider
		console.warn(`[Retry] No alternative providers available, using ${otherProviders[0]} as fallback`);
		return otherProviders[0];
	}
	
	// 随机选择一个可用的备用provider
	const randomIndex = Math.floor(Math.random() * availableProviders.length);
	return availableProviders[randomIndex];
}

// 获取请求中的provider参数，如果没有指定则随机选择
export function getProviderFromRequest(request: ChatRequest): AIProvider {
	// 检查请求中是否有provider参数
	if (request.provider) {
		const provider = request.provider.toLowerCase();
		if (provider === 'deepseek' || provider === 'nim'  || provider === 'openrouter') {
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
	if (providerParam === 'deepseek' || providerParam === 'nim' || providerParam === 'openrouter' ) {
		const selectedProvider = providerParam as AIProvider;
		if (circuitBreaker.canExecute(selectedProvider)) {
			return selectedProvider;
		}
		console.log(`[Circuit Breaker] Requested provider ${selectedProvider} is unavailable, selecting alternative`);
	}
	
	// 随机选择一个可用的provider, remove siliconflow
	const allProviders: AIProvider[] = ['deepseek', 'nim', 'openrouter'];
	const availableProviders = circuitBreaker.getAvailableProviders(allProviders);
	
	if (availableProviders.length === 0) {
		console.warn('[Circuit Breaker] All providers unavailable, using deepseek as fallback');
		return 'deepseek';
	}
	
	const randomIndex = Math.floor(Math.random() * availableProviders.length);
	return availableProviders[randomIndex];
}

// 根据provider获取对应的配置
export function getProviderConfig(provider: AIProvider, env: Env): AIProviderConfig {
	switch (provider) {
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
				model: env.NVIDIA_MODEL || 'minimaxai/minimax-m2.7',
				baseURL: 'https://integrate.api.nvidia.com/v1/chat/completions'
			};
	
		case 'openrouter':
			return {
				name: 'openrouter',
				apiKey: env.OPENROUTER_API_KEY || '',
				model: env.OPENROUTER_MODEL || 'nvidia/nemotron-3-nano-30b-a3b:free',
				baseURL: 'https://openrouter.ai/api/v1/chat/completions'
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
