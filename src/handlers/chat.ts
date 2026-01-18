import { ChatRequest, Env, ChatMessage } from '../types';
import { corsHeaders, getProviderFromRequest, getProviderConfig, getAlternativeProvider } from '../config';
import { callZhipuAI } from '../providers/zhipu';
import { callOpenAICompatible } from '../providers/openai-compatible';
import { circuitBreaker } from '../circuit-breaker';
import { getErrorMessage, getSystemPrompt } from '../prompts';

// Handle chat completion requests
export async function handleChatCompletion(requestBody: ChatRequest, env: Env): Promise<Response> {
	let selectedProvider;
	let hasRetried = false;
	try {
		const messages = requestBody.messages || [];
		const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
		
		// 使用默认系统提示词
		const systemPrompt = getSystemPrompt('default');
		const processedMessages: ChatMessage[] = [
			{ role: 'system', content: systemPrompt },
			...nonSystemMessages
		];
		
		// 获取要使用的provider
		selectedProvider = getProviderFromRequest(requestBody);
		const config = getProviderConfig(selectedProvider, env);
		

		const messageData: any = {
			messageCount: processedMessages.length,
			provider: selectedProvider,
			model: config.model
		}
		for (let index = 0; index < processedMessages.length; index++) {
			const element = processedMessages[index];
			messageData['message_' + index] = element;
		}

		console.log('[Chat] [步骤1] Chat completion request:', messageData);

		// 构造请求选项
		const options: any = {
			stream: requestBody.stream ?? false,
			temperature: requestBody.temperature,
			max_tokens: requestBody.max_tokens
		};

		// 如果请求包含response_format，添加到options中
		if (requestBody.response_format?.type === 'json_schema') {
			options.responseFormat = {
				type: 'json_schema',
				name: requestBody.response_format.json_schema?.name,
				strict: requestBody.response_format.json_schema?.strict,
				schema: requestBody.response_format.json_schema?.schema
			};
			console.log('[Chat] [步骤1.5] Response format detected:', {
				type: options.responseFormat.type,
				name: options.responseFormat.name,
				hasSchema: !!options.responseFormat.schema
			});
		}

		if (selectedProvider === 'zhipu') {
			// 使用智谱AI SDK
			console.log('[Chat] [步骤2] Using Zhipu AI Provider');
			let response;
			const originalProvider = selectedProvider;
			try {
				response = await callZhipuAI(config, processedMessages, options);
				// 记录成功
				circuitBreaker.recordSuccess(originalProvider);
			} catch (apiError: any) {
				// 记录失败
				circuitBreaker.recordFailure(originalProvider, apiError);
				
			// 如果5xx错误或超时，切换到另一个provider重试
			if ((apiError.status && apiError.status >= 500 && apiError.status < 600) || apiError.isTimeout) {
				const retryProvider = getAlternativeProvider(originalProvider);
				console.log(`[Chat] [步骤3-重试] ${originalProvider} returned ${apiError.status || 'timeout'} error, retrying with ${retryProvider}...`);
				hasRetried = true;
				const retryConfig = getProviderConfig(retryProvider, env);
				selectedProvider = retryProvider;
				// 备用provider使用callOpenAICompatible
				try {
					const retryResponse = await callOpenAICompatible(retryConfig, processedMessages, options);
					circuitBreaker.recordSuccess(retryProvider);
						
						if (options.stream) {
						// 流式响应
						const reader = retryResponse.body?.getReader();
						if (!reader) {
							throw new Error('Response body is not readable');
						}
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
								'X-Retried': 'true',
								...corsHeaders
							}
						});
					} else {
						// 非流式响应
						const data = await retryResponse.json() as any;
						console.log(`[Chat Retry] [步骤3-成功] Chat completion successful (retried with ${retryProvider}):`, {
							responseLength: JSON.stringify(data).length,
							finishReason: data.choices?.[0]?.finish_reason
						});

						console.log('[Chat Retry] [步骤3] ========== API RESPONSE START ==========');
						console.log('[Chat Retry] [步骤3] Original Provider:', originalProvider);
						console.log('[Chat Retry] [步骤3] Retry Provider:', retryProvider);
						console.log('[Chat Retry] [步骤3] Complete API Response:', JSON.stringify(data, null, 2));
						console.log('[Chat Retry] [步骤3] ========== API RESPONSE END ==========');

						return new Response(JSON.stringify({
							id: data.id || `chatcmpl-${Date.now()}`,
							object: data.object || 'chat.completion',
							created: data.created || Math.floor(Date.now() / 1000),
							model: data.model || retryConfig.model,
							choices: data.choices || [],
							usage: data.usage || {
								prompt_tokens: 0,
								completion_tokens: 0,
								total_tokens: 0
							},
							provider: selectedProvider,
							retried: true
						}), {
							headers: {
								'Content-Type': 'application/json',
								'X-AI-Provider': selectedProvider,
								'X-Retried': 'true',
								...corsHeaders
							}
						});
					}
					} catch (retryError: any) {
						circuitBreaker.recordFailure(retryProvider, retryError);
						throw retryError;
					}
				} else {
					throw apiError;
				}
			}

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
			console.log('[Chat] [步骤4-成功] Chat completion successful:', {
					responseLength: resultStr.length,
					response: resultStr,
					finishReason: result.choices?.[0]?.finish_reason,
					retried: hasRetried
				});

				console.log('[Chat] [步骤4] ========== API RESPONSE START ==========');
				console.log('[Chat] [步骤4] Provider:', selectedProvider);
				console.log('[Chat] [步骤4] Retried:', hasRetried);
				console.log('[Chat] [步骤4] Complete API Response:', JSON.stringify(result, null, 2));
				console.log('[Chat] [步骤4] ========== API RESPONSE END ==========');

				const completeResponse = {
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
					provider: selectedProvider,
					retried: hasRetried
				};
				console.log('=== 完整 Chat Completion Response ===');
				console.log(JSON.stringify(completeResponse, null, 2));
				console.log('====================================');

				return new Response(JSON.stringify(completeResponse), {
					headers: {
						'Content-Type': 'application/json',
						'X-AI-Provider': selectedProvider,
						'X-Retried': hasRetried ? 'true' : 'false',
						...corsHeaders
					}
				});
			}
		} else if (selectedProvider === 'deepseek' || selectedProvider === 'nim' || selectedProvider === 'nim2' || selectedProvider === 'openrouter' || selectedProvider === 'openrouter2') {
			// 使用DeepSeek/NIM/OpenRouter API (OpenAI兼容)
			console.log('[Chat] [步骤2] Using OpenAI Compatible Provider:', selectedProvider);
			let response;
			const originalProvider = selectedProvider;
			try {
				response = await callOpenAICompatible(config, processedMessages, options);
				// 记录成功
				circuitBreaker.recordSuccess(originalProvider);
			} catch (apiError: any) {
				// 记录失败
				circuitBreaker.recordFailure(originalProvider, apiError);
				
			// 如果5xx错误或超时，切换到另一个provider重试
			if ((apiError.status && apiError.status >= 500 && apiError.status < 600) || apiError.isTimeout) {
				const retryProvider = getAlternativeProvider(originalProvider);
				console.log(`[Chat] [步骤3-重试] ${selectedProvider} returned ${apiError.status || 'timeout'} error, retrying with ${retryProvider}...`);
				hasRetried = true;
				const retryConfig = getProviderConfig(retryProvider, env);
				selectedProvider = retryProvider;
				try {
					response = await callOpenAICompatible(retryConfig, processedMessages, options);
					circuitBreaker.recordSuccess(retryProvider);
				} catch (retryError: any) {
					circuitBreaker.recordFailure(retryProvider, retryError);
					throw retryError;
					}
				} else {
					throw apiError;
				}
			}

			if (options.stream) {
				// 流式响应 - 直接转发OpenAI兼容的流式
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
			console.log('[Chat] [步骤4-成功] Chat completion successful:', {
					responseLength: JSON.stringify(data).length,
					finishReason: data.choices?.[0]?.finish_reason,
					retried: hasRetried
				});

				console.log('[Chat] [步骤4] ========== API RESPONSE START ==========');
				console.log('[Chat] [步骤4] Provider:', selectedProvider);
				console.log('[Chat] [步骤4] Retried:', hasRetried);
				console.log('[Chat] [步骤4] Complete API Response:', JSON.stringify(data, null, 2));
				console.log('[Chat] [步骤4] ========== API RESPONSE END ==========');

				const completeResponse = {
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
					provider: selectedProvider,
					retried: hasRetried
				};
				console.log('=== 完整 Chat Completion Response ===');
				console.log(JSON.stringify(completeResponse, null, 2));
				console.log('====================================');

				return new Response(JSON.stringify(completeResponse), {
					headers: {
						'Content-Type': 'application/json',
						'X-AI-Provider': selectedProvider,
						'X-Retried': hasRetried ? 'true' : 'false',
						...corsHeaders
					}
				});
			}
		} else {
			throw new Error(`Unsupported provider: ${selectedProvider}`);
		}

	} catch (error) {
		console.error('[Chat] [最终错误] Chat completion error:', error);
		
		let errorMessage = 'Unknown error occurred';
		if (error instanceof Error) {
			errorMessage = error.message;
		}
		
		// 检查是否是API密钥错误
		if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('invalid api_key')) {
			errorMessage = getErrorMessage('unauthorized');
		} else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
			errorMessage = getErrorMessage('rateLimitExceeded');
		} else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
			errorMessage = getErrorMessage('timeout');
		} else if (errorMessage.includes('Unsupported provider')) {
			errorMessage = getErrorMessage('unsupportedProvider');
		} else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
			errorMessage = getErrorMessage('serverError');
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
