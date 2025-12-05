import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';

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

// Handle chat completion requests
async function handleChatCompletion(requestBody: any, env: Env): Promise<Response> {
	try {
		const messages = requestBody.messages || [];

		console.log('Chat completion request:', {
			messageCount: messages.length,
			firstMessage: messages[0]?.content?.substring(0, 50) + '...'
		});

		// 使用智谱AI GLM-4 模型
		const client = new ZhipuAI({
			apiKey: env.ZHIPU_API_KEY
		});
		
		const response = await client.createCompletions({
			model: 'glm-4-flash',
			messages: messages,
			temperature: requestBody.temperature ?? 0.7,
			maxTokens: requestBody.max_tokens ?? 4000,
			stream: requestBody.stream ?? false
		});

		if (requestBody.stream) {
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
					...corsHeaders
				}
			});
		} else {
			// 非流式响应
			const result = response as any;
			console.log('Chat completion successful:', {
				responseLength: JSON.stringify(result).length,
				finishReason: result.choices?.[0]?.finish_reason
			});

			return new Response(JSON.stringify({
				id: `chatcmpl-${Date.now()}`,
				object: 'chat.completion',
				created: Math.floor(Date.now() / 1000),
				model: 'glm-4-flash',
				choices: result.choices || [],
				usage: result.usage || {
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0
				}
			}), {
				headers: {
					'Content-Type': 'application/json',
					...corsHeaders
				}
			});
		}

	} catch (error) {
		console.error('Chat completion error:', error);
		
		let errorMessage = 'Unknown error occurred';
		if (error instanceof Error) {
			errorMessage = error.message;
		}
		
		// 检查是否是API密钥错误
		if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('invalid api_key')) {
			errorMessage = '智谱AI服务暂时不可用，请检查API密钥配置';
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
