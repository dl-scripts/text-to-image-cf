import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';

// CORS headers for cross-origin requests
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 辅助函数：使用 Web Crypto API 生成 SHA-256 哈希
 * 将输入字符串转换为 16 进制字符串
 */
async function calculateHash(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // 将字节数组转换为 hex 字符串
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

interface ChatRequest {
	messages: ChatMessage[];
	model?: string;
	stream?: boolean;
	provider?: string; // 添加provider参数
	temperature?: number;
	max_tokens?: number;
}

// 定义AI提供商类型
type AIProvider = 'zhipu' | 'siliconflow' | 'deepseek';

// 定义AI提供商配置
interface AIProviderConfig {
	name: AIProvider;
	apiKey: string;
	model: string;
	baseURL: string;
}

// 获取请求中的provider参数，如果没有指定则随机选择
function getProviderFromRequest(request: ChatRequest): AIProvider {
	// 检查请求中是否有provider参数
	if (request.provider) {
		const provider = request.provider.toLowerCase();
		if (provider === 'zhipu' || provider === 'siliconflow' || provider === 'deepseek' ) {
			return provider as AIProvider;
		}
	}
	
	// 检查消息内容中是否包含provider参数
	const providerParam = request.messages?.find(msg =>
		msg.content?.includes('provider=')
	)?.content?.split('provider=')[1]?.trim();
	
	// 如果指定了provider参数，使用指定的provider
	if (providerParam === 'zhipu' || providerParam === 'siliconflow' || providerParam === 'deepseek') {
		return providerParam as AIProvider;
	}
	
	// 否则随机选择一个provider
	const providers: AIProvider[] = ['zhipu', 'siliconflow', 'deepseek'];
	const randomIndex = Math.floor(Math.random() * providers.length);
	return providers[randomIndex];
}

// 根据provider获取对应的配置
function getProviderConfig(provider: AIProvider, env: Env): AIProviderConfig {
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
				baseURL: 'https://api.siliconflow.cn/v1/chat/completions'
			};
		case 'deepseek':
			return {
				name: 'deepseek',
				apiKey: env.DEEPSEEK_API_KEY || '',
				model: 'deepseek-chat',
				baseURL: 'https://api.deepseek.com/chat/completions'
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

// 调用智谱AI API
async function callZhipuAI(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<any> {
	const client = new ZhipuAI({
		apiKey: config.apiKey
	});
	
	return await client.createCompletions({
		model: config.model,
		messages: messages,
		temperature: options.temperature ?? 0.3,
		maxTokens: options.max_tokens ?? 4000,
		stream: options.stream ?? false
	});
}

// 调用SiliconFlow API (OpenAI兼容)
async function callOpenAI(
	config: AIProviderConfig,
	messages: ChatMessage[],
	options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<Response> {
	if (!config.apiKey) {
		throw new Error(`API key not configured for ${config.name}`);
	}

	const response = await fetch(config.baseURL, {
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
			max_tokens: options.max_tokens ?? 4000
		})
	});

	if (!response.ok) {
		const errorData = await response.json() as any;
		throw new Error(errorData.error?.message || `API request failed for ${config.name}`);
	}

	return response;
}

// Handle chat completion requests
async function handleChatCompletion(requestBody: ChatRequest, env: Env): Promise<Response> {
	let selectedProvider;
	try {
		const messages = requestBody.messages || [];
		
		// 获取要使用的provider
		selectedProvider = getProviderFromRequest(requestBody);
		const config = getProviderConfig(selectedProvider, env);
		
		console.log('Chat completion request:', {
			messageCount: messages.length,
			firstMessage: messages[0]?.content,
			provider: selectedProvider,
			model: config.model
		});

		const options = {
			stream: requestBody.stream ?? false,
			temperature: requestBody.temperature,
			max_tokens: requestBody.max_tokens
		};

		if (selectedProvider === 'zhipu') {
			// 使用智谱AI SDK
			const response = await callZhipuAI(config, messages, options);

			if (options.stream) {
				// 流式响应
				const encoder = new TextEncoder();
				const readable = new ReadableStream({
					async start(controller) {
						try {
							for await (const chunk of response) {
								const content = chunk.choices[0]?.delta?.content || '';
								if (content) {
									controller.enqueue(encoder.encode(`data: ${JSON.stringify({
										choices: [{
											delta: {
												content: content
											}
										}]
									})}\n\n`));
								}
							}
							controller.enqueue(encoder.encode('data: [DONE]\n\n'));
						} catch (error) {
							console.error('Stream error:', error);
							controller.error(error);
						}
					}
				});

				return new Response(readable, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						'Connection': 'keep-alive',
						'X-AI-Provider': selectedProvider,
						...corsHeaders
					}
				});
			} else {
				// 非流式响应
				const result = response as any;
				const resultStr = JSON.stringify(result);
				console.log('Chat completion successful:', {
					responseLength: resultStr.length,
					response: resultStr,
					finishReason: result.choices?.[0]?.finish_reason
				});

				return new Response(JSON.stringify({
					id: `chatcmpl-${Date.now()}`,
					object: 'chat.completion',
					created: Math.floor(Date.now() / 1000),
					model: config.model,
					choices: result.choices || [],
					usage: result.usage || {
						prompt_tokens: 0,
						completion_tokens: 0,
						total_tokens: 0
					},
					provider: selectedProvider
				}), {
					headers: {
						'Content-Type': 'application/json',
						'X-AI-Provider': selectedProvider,
						...corsHeaders
					}
				});
			}
		} else if (selectedProvider === 'siliconflow' || selectedProvider === 'deepseek') {
			// 使用SiliconFlow API (OpenAI兼容)
			const response = await callOpenAI(config, messages, options);

			if (options.stream) {
				// 流式响应 - 直接转发SiliconFlow的流式响应
				const reader = response.body?.getReader();
				if (!reader) {
					throw new Error('Response body is not readable');
				}
				const encoder = new TextEncoder();
				const readable = new ReadableStream({
					async start(controller) {
						try {
							while (true) {
								const { done, value } = await reader.read();
								if (done) break;
								controller.enqueue(value);
							}
						} catch (error) {
							console.error('Stream error:', error);
							controller.error(error);
						}
					}
				});

				return new Response(readable, {
					headers: {
						'Content-Type': 'text/event-stream',
						'Cache-Control': 'no-cache',
						'Connection': 'keep-alive',
						'X-AI-Provider': selectedProvider,
						...corsHeaders
					}
				});
			} else {
				// 非流式响应
				const data = await response.json() as any;
				console.log('Chat completion successful:', {
					responseLength: JSON.stringify(data).length,
					finishReason: data.choices?.[0]?.finish_reason
				});

				return new Response(JSON.stringify({
					id: data.id || `chatcmpl-${Date.now()}`,
					object: data.object || 'chat.completion',
					created: data.created || Math.floor(Date.now() / 1000),
					model: data.model || config.model,
					choices: data.choices || [],
					usage: data.usage || {
						prompt_tokens: 0,
						completion_tokens: 0,
						total_tokens: 0
					},
					provider: selectedProvider
				}), {
					headers: {
						'Content-Type': 'application/json',
						'X-AI-Provider': selectedProvider,
						...corsHeaders
					}
				});
			}
		} else {
			throw new Error(`Unsupported provider: ${selectedProvider}`);
		}

	} catch (error) {
		console.error('! Chat completion error:', error);
		
		let errorMessage = 'Unknown error occurred';
		if (error instanceof Error) {
			errorMessage = error.message;
		}
		
		// 检查是否是API密钥错误
		if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('invalid api_key')) {
			errorMessage = 'AI服务暂时不可用，请检查API密钥配置';
		} else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
			errorMessage = '请求频率过高，请稍后重试';
		} else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
			errorMessage = '网络请求超时，请稍后重试';
		}

		return new Response(JSON.stringify({
			error: {
				message: errorMessage,
				type: 'chat_completion_error',
				suggestion: '请检查输入内容或稍后重试',
				selectedProvider: selectedProvider,
			}
		}), {
			status: 500,
			headers: {
				'Content-Type': 'application/json',
				...corsHeaders
			}
		});
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const startTime = Date.now();
		
		try {
			const url = new URL(request.url);
			const pathname = url.pathname;
			const method = request.method;
			
			// Handle OPTIONS requests for CORS
			if (method === 'OPTIONS') {
				return new Response(null, {
					status: 200,
					headers: corsHeaders
				});
			}

			// 处理聊天完成请求
			if (pathname === '/v1/chat/completions' || pathname === '/chat') {
				// 只处理POST请求
				if (method !== 'POST') {
					return new Response('Method not allowed', { 
						status: 405,
						headers: corsHeaders
					});
				}

				let requestBody;
				const contentType = request.headers.get('content-type') || '';
				
				if (contentType.includes('application/json')) {
					requestBody = await request.json();
				} else if (contentType.includes('text/plain')) {
					const text = await request.text();
					try {
						requestBody = JSON.parse(text);
					} catch {
						// 如果不是JSON，将其作为简单的prompt处理
						requestBody = {
							messages: [{ role: 'user', content: text }]
						};
					}
				} else {
					return new Response('Unsupported content type', {
						status: 415,
						headers: corsHeaders
					});
				}

				const response = await handleChatCompletion(requestBody, env);
				
				// 添加性能日志
				const duration = Date.now() - startTime;
				console.log('Request processed:', {
					path: pathname,
					duration: duration,
					timestamp: new Date().toISOString()
				});
				
				return response;
			}

			// 旧版兼容性 - 重定向到新的聊天API
			if (pathname.startsWith('/api/ai/')) {
				return new Response(JSON.stringify({
					message: 'API路径已迁移，请使用新路径进行聊天',
					new_path: '/v1/chat/completions',
					deprecated: true
				}), {
					status: 301,
					headers: {
						'Location': '/v1/chat/completions',
						...corsHeaders
					}
				});
			}

			return new Response('Not Found', {
				status: 404,
				headers: corsHeaders
			});

		} catch (error) {
			console.error('Worker error:', error);
			
			return new Response(JSON.stringify({
				error: {
					message: error instanceof Error ? error.message : 'Unknown error',
					type: 'worker_error'
				}
			}), {
				status: 500,
				headers: {
					'Content-Type': 'application/json',
					...corsHeaders
				}
			});
		}
	}
};
