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
		
		// 查找用户请求中的系统提示词
		const userSystemMessage = messages.find(msg => msg.role === 'system');
		const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
		
		// 检测是否是特殊格式的翻译提示词（如 Immersive Translate、Twitter 翻译等）
		const isSpecialFormat = userSystemMessage?.content && (
			userSystemMessage.content.includes('{{') ||  // 模板变量
			userSystemMessage.content.includes('YAML') ||
			userSystemMessage.content.includes('yaml') ||
			userSystemMessage.content.includes('Twitter') ||
			userSystemMessage.content.includes('hashtags') ||
			userSystemMessage.content.includes('@mentions') ||
			userSystemMessage.content.includes('imt_source_field') ||
			userSystemMessage.content.includes('Immersive')
		);
		
		let processedMessages: ChatMessage[];
		
		if (isSpecialFormat && userSystemMessage) {
			// 智能增强：保留原有格式提示词，在前面添加专业背景
			const enhancementPrompt = `# Translation Philosophy

You are a tech professional with 15+ years in FinTech and AI, also a devoted reader of intellectual magazines like 三联生活周刊. Your writing carries the precision of A Cheng and the vitality of Li Juan.

## Core Principles:

1. **Technical terms stay in English**
   API, LLM, agent, FinTech, blockchain, DeFi, AI, ML, RAG, microservices, cloud-native, PostgreSQL, pattern, workflow — these words have precise boundaries, no need to Sinicize

2. **Writing with breathing room**
   - Vary sentence length for rhythm, like natural breathing
   - Pause when needed, expand when appropriate
   - Not everything needs active voice, but don't drown in passives
   - Occasionally close with a short, punchy sentence

3. **Dissolve translation smell, retain texture**
   ❌ "为...提供" → ✅ "给..." or "让...有了"
   ❌ "AI 代理" → ✅ "AI agent"
   ❌ "该工具能够实现" → ✅ "这工具能" or "工具做到了"
   ❌ "通过...的方式" → ✅ Just say the approach
   ❌ "在性能方面有所提升" → ✅ "性能提升了" or "跑得更快了"
   
   Avoid bureaucratic words that make text rigid: 该、进行、方面、对于、而言、从而

4. **Chinese rhythm**
   English "A fixes B by doing C" needn't be translated rigidly
   Could be: "A 解决了 B，方法是 C"
   Or: "A 做到了这点：C，于是 B 就解决了"
   Flow with Chinese breath

5. **Details carry meaning**
   "versioned" = 按版本, "proven" = 经过验证, "deep" = 深入 — capture the weight behind these words

6. **Natural transitions**
   Not always "因此" "从而", sometimes "于是" "这样" "结果" suffices
   Connectors are joints in writing — keep them flexible

**Tone**: Professional yet warm, precise yet human. Like someone who understands both technology and life, conversing with peers who share context. Not a textbook, but an exchange.

---

`;
			processedMessages = [
				{ role: 'system', content: enhancementPrompt + userSystemMessage.content },
				...nonSystemMessages
			];
			
			console.log('Using enhanced special format system prompt');
		} else {
			// 完全替换：使用应用的默认系统提示词
			const systemPrompt = getSystemPrompt('default');
			processedMessages = [
				{ role: 'system', content: systemPrompt },
				...nonSystemMessages
			];
			
			console.log('Using app default system prompt');
		}
		
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

		console.log('Chat completion request:', messageData);

		const options = {
			stream: requestBody.stream ?? false,
			temperature: requestBody.temperature,
			max_tokens: requestBody.max_tokens
		};

		if (selectedProvider === 'zhipu') {
			// 使用智谱AI SDK
			let response;
			const originalProvider = selectedProvider;
			try {
				response = await callZhipuAI(config, processedMessages, options);
				// 记录成功
				circuitBreaker.recordSuccess(originalProvider);
			} catch (apiError: any) {
				// 记录失败
				circuitBreaker.recordFailure(originalProvider, apiError);
				
// 如果�?xx错误或超时，切换到另一个provider重试
			if ((apiError.status && apiError.status >= 500 && apiError.status < 600) || apiError.isTimeout) {
				const retryProvider = getAlternativeProvider(originalProvider);
				console.log(`${originalProvider} returned ${apiError.status || 'timeout'} error, retrying with ${retryProvider}...`);
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
						// 非流式响�?
						const data = await retryResponse.json() as any;
						console.log(`Chat completion successful (retried with ${retryProvider}):`, {
							responseLength: JSON.stringify(data).length,
							finishReason: data.choices?.[0]?.finish_reason
						});

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
				// 非流式响�?
				const result = response as any;
				const resultStr = JSON.stringify(result);
				console.log('Chat completion successful:', {
					responseLength: resultStr.length,
					response: resultStr,
					finishReason: result.choices?.[0]?.finish_reason,
					retried: hasRetried
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
					provider: selectedProvider,
					retried: hasRetried
				}), {
					headers: {
						'Content-Type': 'application/json',
						'X-AI-Provider': selectedProvider,
						'X-Retried': hasRetried ? 'true' : 'false',
						...corsHeaders
					}
				});
			}
		} else if (selectedProvider === 'siliconflow' || selectedProvider === 'deepseek' || selectedProvider === 'nim' || selectedProvider === 'nim2' || selectedProvider === 'openrouter') {
			// 使用SiliconFlow/DeepSeek/NIM/OpenRouter API (OpenAI兼容)
			let response;
			const originalProvider = selectedProvider;
			try {
				response = await callOpenAICompatible(config, processedMessages, options);
				// 记录成功
				circuitBreaker.recordSuccess(originalProvider);
			} catch (apiError: any) {
				// 记录失败
				circuitBreaker.recordFailure(originalProvider, apiError);
				
			// 如果�?xx错误或超时，切换到另一个provider重试
			if ((apiError.status && apiError.status >= 500 && apiError.status < 600) || apiError.isTimeout) {
				const retryProvider = getAlternativeProvider(originalProvider);
				console.log(`${selectedProvider} returned ${apiError.status || 'timeout'} error, retrying with ${retryProvider}...`);
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
				// 流式响应 - 直接转发OpenAI兼容的流式响�?
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
				// 非流式响�?
				const data = await response.json() as any;
				console.log('Chat completion successful:', {
					responseLength: JSON.stringify(data).length,
					finishReason: data.choices?.[0]?.finish_reason,
					retried: hasRetried
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
					provider: selectedProvider,
					retried: hasRetried
				}), {
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
		console.error('! Chat completion error:', error);
		
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
