import { Env } from './types';
import { corsHeaders } from './config';
import { handleChatCompletion } from './handlers/chat';
import { handleEmbedding } from './handlers/embedding';
import { requestBatcher } from './request-batcher';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

				// 提取requestId用于批处理
				// 优先从header获取，其次从请求体metadata获取
				const requestId = request.headers.get('x-request-id') || 
					request.headers.get('cf-ray') ||
					requestBody.metadata?.requestId ||
					requestBody.requestId ||
					crypto.randomUUID();

				console.log('Processing request:', { requestId, hasUserMessages: requestBody.messages?.some((m: any) => m.role === 'user') });

				// 检查是否启用批处理（可通过header控制）
				const enableBatching = request.headers.get('x-enable-batching') !== 'false';
				
				let response: Response;
				
				if (enableBatching && requestBody.messages?.some((m: any) => m.role === 'user')) {
					// 使用批处理器
					response = await requestBatcher.addRequest(
						requestId,
						requestBody,
						async (mergedRequest) => {
							return await handleChatCompletion(mergedRequest, env);
						}
					);
				} else {
					// 直接处理（系统消息或禁用批处理）
					response = await handleChatCompletion(requestBody, env);
				}
				
				// 添加性能日志
				const duration = Date.now() - startTime;
				console.log('Request processed:', {
					path: pathname,
					duration: duration,
					timestamp: new Date().toISOString()
				});
				
				return response;
			}

			// 处理 embedding
			if (pathname === '/v1/embeddings' || pathname === '/embeddings') {
				// 只处理POST请求
				if (method !== 'POST') {
					return new Response('Method not allowed for embedding', { 
						status: 405,
						headers: corsHeaders
					});
				}

				let requestText;
				const contentType = request.headers.get('content-type') || '';
				
				if (contentType.includes('text/plain') || contentType === '') {
					requestText = await request.text();
				} else {
					return new Response('Unsupported content type', {
						status: 415,
						headers: corsHeaders
					});
				}

				const response = await handleEmbedding(requestText, env);
				
				// 添加性能日志
				const duration = Date.now() - startTime;
				console.log('Embedding Request processed:', {
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
