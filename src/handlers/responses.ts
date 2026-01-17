import { ResponseRequest, Env, ResponseMessage, ChatMessage, AIProvider } from '../types';
import { corsHeaders, getProviderFromRequest, getProviderConfig, getAlternativeProvider } from '../config';
import { callZhipuAI } from '../providers/zhipu';
import { callOpenAICompatible } from '../providers/openai-compatible';
import { circuitBreaker } from '../circuit-breaker';
import { getSystemPrompt } from '../prompts';

// Handle Responses API requests
export async function handleResponseAPI(requestBody: ResponseRequest, env: Env): Promise<Response> {
	let selectedProvider: AIProvider | undefined;
	let hasRetried = false;

	try {
		// 处理input字段 - 可以是字符串或消息数组
		let messages: ChatMessage[];
		if (typeof requestBody.input === 'string') {
			// 如果是字符串，创建一个简单的用户消息
			messages = [
				{ role: 'system', content: getSystemPrompt('default') },
				{ role: 'user', content: requestBody.input }
			];
		} else {
			// 如果是消息数组，转换为ChatMessage格式
			const inputMessages = requestBody.input as ResponseMessage[];
			const nonSystemMessages = inputMessages.filter(msg => msg.role !== 'system');
			messages = [
				{ role: 'system', content: getSystemPrompt('default') },
				...nonSystemMessages.map(msg => ({
					role: msg.role as 'user' | 'assistant' | 'system',
					content: msg.content
				}))
			];
		}

		// 获取要使用的provider
		// 从请求中直接获取provider，或使用默认值
		if (requestBody.provider) {
			const provider = requestBody.provider.toLowerCase();
			if (provider === 'zhipu' || provider === 'siliconflow' || provider === 'deepseek' || provider === 'nim' || provider === 'nim2' || provider === 'openrouter') {
				selectedProvider = provider as AIProvider;
				if (!circuitBreaker.canExecute(selectedProvider)) {
					console.log(`[Circuit Breaker] Requested provider ${selectedProvider} is unavailable, selecting alternative`);
					selectedProvider = getAlternativeProvider(selectedProvider);
				}
			} else {
				// 默认选择
				const allProviders: AIProvider[] = ['zhipu', 'deepseek', 'siliconflow', 'nim', 'nim2', 'openrouter'];
				const availableProviders = circuitBreaker.getAvailableProviders(allProviders);
				selectedProvider = availableProviders.length > 0 ? availableProviders[0] : 'nim2';
			}
		} else {
			// 默认选择
			const allProviders: AIProvider[] = ['zhipu', 'deepseek', 'siliconflow', 'nim', 'nim2', 'openrouter'];
			const availableProviders = circuitBreaker.getAvailableProviders(allProviders);
			selectedProvider = availableProviders.length > 0 ? availableProviders[0] : 'nim2';
		}
		const config = getProviderConfig(selectedProvider, env);

		console.log('Responses API request:', {
			messageCount: messages.length,
			provider: selectedProvider,
			model: config.model,
			hasFormat: !!requestBody.text?.format
		});

		const options = {
			stream: false, // Responses API 不支持流式响应
			temperature: requestBody.temperature,
			max_tokens: requestBody.max_tokens,
			responseFormat: requestBody.text?.format
		};

		let apiResponse: any;
		const originalProvider = selectedProvider;

		try {
			if (selectedProvider === 'zhipu') {
				apiResponse = await callZhipuAI(config, messages, options);
			} else {
				const response = await callOpenAICompatible(config, messages, options);
				apiResponse = await response.json();
			}
			circuitBreaker.recordSuccess(originalProvider);
		} catch (apiError: any) {
			circuitBreaker.recordFailure(originalProvider, apiError);

			// 如果5xx错误或超时，切换到另一个provider重试
			if ((apiError.status && apiError.status >= 500 && apiError.status < 600) || apiError.isTimeout) {
				const retryProvider = getAlternativeProvider(originalProvider);
				console.log(`${originalProvider} returned ${apiError.status || 'timeout'} error, retrying with ${retryProvider}...`);
				hasRetried = true;
				const retryConfig = getProviderConfig(retryProvider, env);
				selectedProvider = retryProvider;

				try {
					const retryResponse = await callOpenAICompatible(retryConfig, messages, options);
					apiResponse = await retryResponse.json();
					circuitBreaker.recordSuccess(retryProvider);
				} catch (retryError: any) {
					circuitBreaker.recordFailure(retryProvider, retryError);
					throw retryError;
				}
			} else {
				throw apiError;
			}
		}

		// 提取内容 - 处理不同的响应格式
		let content = '';
		if (apiResponse.choices && apiResponse.choices[0]) {
			// Chat Completions格式
			content = apiResponse.choices[0].message?.content || '';
		} else if (apiResponse.content) {
			// 已经是Responses API格式
			content = apiResponse.content;
		}

		// 如果有JSON schema格式要求，确保内容是有效的JSON
		if (requestBody.text?.format && content) {
			try {
				// 验证JSON格式
				JSON.parse(content);
			} catch (e) {
				console.warn('Response content is not valid JSON:', content);
			}
		}

		// 构建Responses API响应格式
		const responseOutput = {
			id: `resp-${Date.now()}`,
			object: 'response' as const,
			created: Math.floor(Date.now() / 1000),
			model: requestBody.model || config.model,
			content: content,
			usage: {
				input_tokens: apiResponse.usage?.prompt_tokens || 0,
				output_tokens: apiResponse.usage?.completion_tokens || 0,
				total_tokens: apiResponse.usage?.total_tokens || 0
			},
			provider: selectedProvider
		};

		console.log('Responses API successful:', {
			responseLength: content.length,
			hasFormat: !!requestBody.text?.format,
			retried: hasRetried
		});
		console.log('=== 完整 Response API Response ===');
		console.log(JSON.stringify(responseOutput, null, 2));
		console.log('===================================');

		return new Response(JSON.stringify(responseOutput), {
			headers: {
				'Content-Type': 'application/json',
				'X-AI-Provider': selectedProvider,
				...(hasRetried && { 'X-Retried': 'true' }),
				...corsHeaders
			}
		});

	} catch (error: any) {
		console.error('Responses API error:', {
			message: error.message,
			status: error.status,
			provider: selectedProvider
		});

		return new Response(JSON.stringify({
			error: {
				message: error.message || 'Internal server error',
				type: 'api_error',
				provider: selectedProvider
			}
		}), {
			status: error.status || 500,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders
			}
		});
	}
}
