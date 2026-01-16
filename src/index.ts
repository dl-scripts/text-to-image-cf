import { Env } from './types';
import { corsHeaders } from './config';
import { handleChatCompletion } from './handlers/chat';
import { handleEmbedding } from './handlers/embedding';
import { handleResponseAPI } from './handlers/responses';

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

				console.log('[Request] Processing chat completion');

			// 直接处理请求
			const response = await handleChatCompletion(requestBody, env);
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
			// 处理 Responses API
			if (pathname === '/v1/responses' || pathname === '/responses') {
				// 只处理POST请求
				if (method !== 'POST') {
					return new Response('Method not allowed for responses', { 
						status: 405,
						headers: corsHeaders
					});
				}

				let requestBody;
				const contentType = request.headers.get('content-type') || '';
				
				if (contentType.includes('application/json')) {
					requestBody = await request.json();
				} else {
					return new Response('Unsupported content type for responses', {
						status: 415,
						headers: corsHeaders
					});
				}

				console.log('[Request] Processing Responses API');

				const response = await handleResponseAPI(requestBody as any, env);
				
				// 添加性能日志
				const duration = Date.now() - startTime;
				console.log('Responses API Request processed:', {
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
