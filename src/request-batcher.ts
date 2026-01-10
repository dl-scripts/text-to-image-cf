// 请求批处理器 - 合并同一requestId的请求，节省token

import { ChatRequest, ChatMessage } from './types';
import { batchConfig } from './config';

interface BatchedRequest {
	requestId: string;
	userMessages: string[];
	originalRequests: Array<{
		messages: ChatMessage[];
		options: {
			stream?: boolean;
			temperature?: number;
			max_tokens?: number;
		};
		resolve: (response: Response) => void;
		reject: (error: Error) => void;
	}>;
	timer?: number;
	systemMessage?: ChatMessage;
}

class RequestBatcher {
	private batches: Map<string, BatchedRequest> = new Map();
	private batchDelay: number = batchConfig.delay; // 从配置读取延迟时间

	/**
	 * 添加请求到批处理队列
	 */
	async addRequest(
		requestId: string,
		requestBody: ChatRequest,
		handler: (mergedRequest: ChatRequest) => Promise<Response>
	): Promise<Response> {
		// 如果批处理未启用，直接处理
		if (!batchConfig.enabled) {
			return handler(requestBody);
		}

		return new Promise((resolve, reject) => {
			let batch = this.batches.get(requestId);

			if (!batch) {
				// 创建新的批处理
				batch = {
					requestId,
					userMessages: [],
					originalRequests: [],
				};
				this.batches.set(requestId, batch);
			}

			// 提取用户消息和系统消息
			const systemMessage = requestBody.messages.find(msg => msg.role === 'system');
			const userMessages = requestBody.messages.filter(msg => msg.role === 'user');

			// 保存系统消息（第一个请求的系统消息）
			if (!batch.systemMessage && systemMessage) {
				batch.systemMessage = systemMessage;
			}

			// 添加用户消息
			userMessages.forEach(msg => {
				batch!.userMessages.push(msg.content);
			});

			// 保存原始请求信息
			batch.originalRequests.push({
				messages: requestBody.messages,
				options: {
					stream: requestBody.stream,
					temperature: requestBody.temperature,
					max_tokens: requestBody.max_tokens,
				},
				resolve,
				reject,
			});

			// 检查批次大小限制
			if (batch.originalRequests.length >= batchConfig.maxBatchSize) {
				// 达到最大批次大小，立即处理
				if (batch.timer) {
					clearTimeout(batch.timer);
				}
				this.processBatch(requestId, handler);
				return;
			}

			// 清除旧的定时器
			if (batch.timer) {
				clearTimeout(batch.timer);
			}

			// 设置新的定时器
			batch.timer = setTimeout(() => {
				this.processBatch(requestId, handler);
			}, this.batchDelay) as any;
		});
	}

	/**
	 * 处理批量请求
	 */
	private async processBatch(
		requestId: string,
		handler: (mergedRequest: ChatRequest) => Promise<Response>
	): Promise<void> {
		const batch = this.batches.get(requestId);
		if (!batch || batch.originalRequests.length === 0) {
			return;
		}

		// 从批处理队列中移除
		this.batches.delete(requestId);

		try {
			// 如果只有一个请求，直接处理
			if (batch.originalRequests.length === 1) {
				const request = batch.originalRequests[0];
				const mergedRequest: ChatRequest = {
					messages: request.messages,
					stream: request.options.stream,
					temperature: request.options.temperature,
					max_tokens: request.options.max_tokens,
				};

				const response = await handler(mergedRequest);
				request.resolve(response);
				return;
			}

			// 合并多个请求
			console.log(`Batching ${batch.originalRequests.length} requests for requestId: ${requestId}`);

			// 构建合并后的消息
			const mergedContent = batch.userMessages.join('\n\n---\n\n');
			const mergedMessages: ChatMessage[] = [];

			if (batch.systemMessage) {
				mergedMessages.push(batch.systemMessage);
			}

			mergedMessages.push({
				role: 'user',
				content: mergedContent,
			});

			// 使用第一个请求的配置
			const firstRequest = batch.originalRequests[0];
			const mergedRequest: ChatRequest = {
				messages: mergedMessages,
				stream: false, // 批处理时禁用流式响应
				temperature: firstRequest.options.temperature,
				max_tokens: firstRequest.options.max_tokens,
			};

			// 发送合并后的请求
			const response = await handler(mergedRequest);
			const responseData = await response.json() as any;

			// 拆分响应
			const content = responseData.choices?.[0]?.message?.content || '';
			const parts = content.split(/\n*---\n*/);

			// 为每个原始请求创建响应
			batch.originalRequests.forEach((request, index) => {
				const partContent = parts[index] || parts[0]; // 如果拆分失败，使用完整内容

				const individualResponse = {
					id: `${responseData.id}-${index}`,
					object: responseData.object,
					created: responseData.created,
					model: responseData.model,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: partContent.trim(),
							},
							finish_reason: 'stop',
						},
					],
					usage: {
						// 平均分配token使用量
						prompt_tokens: Math.floor((responseData.usage?.prompt_tokens || 0) / batch.originalRequests.length),
						completion_tokens: Math.floor((responseData.usage?.completion_tokens || 0) / batch.originalRequests.length),
						total_tokens: Math.floor((responseData.usage?.total_tokens || 0) / batch.originalRequests.length),
					},
					provider: responseData.provider,
					batched: true,
					batchSize: batch.originalRequests.length,
				};

				request.resolve(
					new Response(JSON.stringify(individualResponse), {
						status: 200,
						headers: {
							'Content-Type': 'application/json',
							'X-Batched': 'true',
							'X-Batch-Size': batch.originalRequests.length.toString(),
						},
					})
				);
			});

			console.log(`Batch processed successfully: ${batch.originalRequests.length} requests merged`);
		} catch (error) {
			// 如果批处理失败，拒绝所有请求
			console.error('Batch processing failed:', error);
			batch.originalRequests.forEach(request => {
				request.reject(error instanceof Error ? error : new Error('Batch processing failed'));
			});
		}
	}

	/**
	 * 清理过期的批处理
	 */
	cleanup(): void {
		for (const [requestId, batch] of this.batches.entries()) {
			if (batch.timer) {
				clearTimeout(batch.timer);
			}
			this.batches.delete(requestId);
		}
	}
}

export const requestBatcher = new RequestBatcher();
