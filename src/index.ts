import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';
import { callZhipuAI } from './zhipu';
import { callSiliconFlow, handleSiliconFlowResponse } from './sf';

// 添加缓存相关的接口定义
interface CacheEntry {
	response: any;
	timestamp: number;
	ttl: number; // 生存时间（秒）
}

interface D1Database {
	get(key: string): Promise<any>;
	put(key: string, value: any, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(): Promise<Array<{ key: string; metadata?: any }>>;
}

// CORS headers for cross-origin requests
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
type AIProvider = 'zhipu' | 'siliconflow';

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
		if (provider === 'zhipu' || provider === 'siliconflow') {
			return provider as AIProvider;
		}
	}
	
// 检查消息内容中是否包含provider参数
const providerParam = request.messages?.find(msg =>
	msg.content?.includes('provider=')
)?.content?.split('provider=')[1]?.trim();

// 如果指定了provider参数，使用指定的provider
if (providerParam === 'zhipu' || providerParam === 'siliconflow') {
	console.log('使用指定的provider:', providerParam);
	return providerParam as AIProvider;
}

// 否则随机选择一个provider
const providers: AIProvider[] = ['zhipu', 'siliconflow'];
const randomIndex = Math.floor(Math.random() * providers.length);
const selectedProvider = providers[randomIndex];

console.log('随机选择provider:', {
	timestamp: new Date().toISOString(),
	selectedProvider: selectedProvider,
	reason: 'no_provider_specified'
});

return selectedProvider;

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
		default:
			return {
				name: 'zhipu',
				apiKey: env.ZHIPU_API_KEY || '',
				model: env.ZAI_MODEL || 'glm-4-flashx',
				baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
			};
	}
}


// Handle chat completion requests
async function handleChatCompletion(requestBody: ChatRequest, env: Env): Promise<Response> {
	try {
		const messages = requestBody.messages || [];
		
		// 获取要使用的provider
		const selectedProvider = getProviderFromRequest(requestBody);
		const config = getProviderConfig(selectedProvider, env);
		
		console.log('Chat completion request:', {
			messageCount: messages.length,
			firstMessage: messages[0]?.content?.substring(0, 50) + '...',
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
			const result = await handleResponse(response, options, config.model, selectedProvider);


		} else if (selectedProvider === 'siliconflow') {
			// 使用SiliconFlow API (OpenAI兼容)
			const response = await callSiliconFlow(config, messages, options);

			const result = await handleResponse(response, options, config.model, selectedProvider);

			return result;
		} else {
			throw new Error(`Unsupported provider: ${selectedProvider}`);
		}

	} catch (error) {
		console.error('Chat completion error:', error);
		
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
				suggestion: '请检查输入内容或稍后重试'
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
					console.log('不支持的HTTP方法:', {
						timestamp: new Date().toISOString(),
						requestId: requestId,
						method: method,
						pathname: pathname
					});
					return new Response('Method not allowed', {
						status: 405,
						headers: corsHeaders
					});
				}
				
				let requestBody;
				const contentType = request.headers.get('content-type') || '';
				
				console.log('解析请求体:', {
					timestamp: new Date().toISOString(),
					requestId: requestId,
					contentType: contentType
				});
				
				if (contentType.includes('application/json')) {
					try {
						requestBody = await request.json();
						console.log('JSON请求体解析成功:', {
							timestamp: new Date().toISOString(),
							requestId: requestId,
							messageCount: requestBody?.messages?.length || 0
						});
					} catch (parseError) {
						console.error('JSON请求体解析失败:', {
							timestamp: new Date().toISOString(),
							requestId: requestId,
							error: parseError instanceof Error ? parseError.message : String(parseError)
						});
						return new Response(JSON.stringify({
							error: {
								message: 'Invalid JSON in request body',
								type: 'parse_error',
								timestamp: new Date().toISOString(),
								requestId: requestId
							}
						}), {
							status: 400,
							headers: {
								'Content-Type': 'application/json',
								...corsHeaders
							}
						});
					}
				} else if (contentType.includes('text/plain')) {
					const text = await request.text();
					try {
						requestBody = JSON.parse(text);
						console.log('文本请求体解析成功:', {
							timestamp: new Date().toISOString(),
							requestId: requestId,
							messageCount: requestBody?.messages?.length || 0
						});
					} catch (parseError) {
						console.error('文本请求体解析失败:', {
							timestamp: new Date().toISOString(),
							requestId: requestId,
							error: parseError instanceof Error ? parseError.message : String(parseError)
						});
						// 如果不是JSON，将其作为简单的prompt处理
						requestBody = {
							messages: [{ role: 'user', content: text }]
						};
					}
				} else {
					console.log('不支持的请求类型:', {
						timestamp: new Date().toISOString(),
						requestId: requestId,
						contentType: contentType
					});
					return new Response(JSON.stringify({
						error: {
							message: 'Unsupported content type',
							type: 'unsupported_content_type',
							timestamp: new Date().toISOString(),
							requestId: requestId
						}
					}), {
						status: 415,
						headers: {
							'Content-Type': 'application/json',
							...corsHeaders
						}
					});
				}

				console.log('开始处理聊天请求:', {
					timestamp: new Date().toISOString(),
					requestId: requestId,
					provider: requestBody?.provider || 'auto',
					messageCount: requestBody?.messages?.length || 0,
					model: requestBody?.model || 'default'
				});

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
		const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
		console.error('Worker处理请求失败:', {
			timestamp: new Date().toISOString(),
			requestId: requestId,
			error: error instanceof Error ? error.message : String(error),
			errorType: error instanceof Error ? error.constructor.name : typeof error,
			stack: error instanceof Error ? error.stack : undefined,
			url: request.url,
			method: request.method,
			pathname: new URL(request.url).pathname
		});
		
		return new Response(JSON.stringify({
			error: {
				message: error instanceof Error ? error.message : 'Unknown error',
				type: 'worker_error',
				timestamp: new Date().toISOString(),
				requestId: requestId
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


export async function handleResponse(response: Response, options: any, configModel: string, provider: string) {
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
                'X-AI-Provider': provider,
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
            model: data.model || configModel,
            choices: data.choices || [],
            usage: data.usage || {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            },
            provider: provider
        }), {
            headers: {
                'Content-Type': 'application/json',
                'X-AI-Provider': provider,
                ...corsHeaders
            }
        });
    }
}
