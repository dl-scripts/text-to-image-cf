// 请求批处理器 - 自动合并所有请求，节省token

import { ChatRequest, ChatMessage } from './types';
import { batchConfig } from './config';

interface BatchedRequest {
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
	private batch: BatchedRequest | null = null;
	private batchDelay: number = batchConfig.delay; // 从配置读取延迟时间

	/**
	 * 添加请求到批处理队列
	 */
	async addRequest(
		requestBody: ChatRequest,
		handler: (mergedRequest: ChatRequest) => Promise<Response>
	): Promise<Response> {
		// 如果批处理未启用，直接处理
		if (!batchConfig.enabled) {
			return handler(requestBody);
		}

		return new Promise((resolve, reject) => {
			if (!this.batch) {
				// 创建新的批处理
				this.batch = {
					userMessages: [],
					originalRequests: [],
				};
			}

			// 提取用户消息和系统消息
			const systemMessage = requestBody.messages.find(msg => msg.role === 'system');
			const userMessages = requestBody.messages.filter(msg => msg.role === 'user');

			// 保存系统消息（第一个请求的系统消息）
			if (!this.batch.systemMessage && systemMessage) {
				this.batch.systemMessage = systemMessage;
			}

			// 添加用户消息
			userMessages.forEach(msg => {
				this.batch!.userMessages.push(msg.content);
			});

			// 保存原始请求信息
			this.batch.originalRequests.push({
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
			if (this.batch.originalRequests.length >= batchConfig.maxBatchSize) {
				// 达到最大批次大小，立即处理
				if (this.batch.timer) {
					clearTimeout(this.batch.timer);
				}
				this.processBatch(handler);
				return;
			}

			// 清除旧的定时器
			if (this.batch.timer) {
				clearTimeout(this.batch.timer);
			}

			// 设置新的定时器
			this.batch.timer = setTimeout(() => {
				this.processBatch(handler);
			}, this.batchDelay) as any;
		});
	}

	/**
	 * 处理批量请求
	 */
	private async processBatch(
		handler: (mergedRequest: ChatRequest) => Promise<Response>
	): Promise<void> {
		const batch = this.batch;
		if (!batch || batch.originalRequests.length === 0) {
			return;
		}

		// 清空当前批处理
		this.batch = null;

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
		console.log(`[Batch] Processing ${batch.originalRequests.length} requests`);

		// 智能合并消息内容 - 提取公共指令前缀
		let commonPrefix = '';
		const contents: string[] = [];
		
		batch.userMessages.forEach((message, index) => {
			// 尝试检测指令前缀（通常在第一行，以"："或":"结尾）
			const lines = message.split('\n');
			const firstLine = lines[0]?.trim() || '';
			
			// 检测是否是翻译指令（包含"翻译"、"translate"等关键词，并以冒号结尾）
			const isInstruction = /^(翻译|translate|转换|convert|改写|rewrite).*[：:]\s*$/i.test(firstLine);
			
			if (isInstruction && index === 0) {
				// 第一个消息，保存指令作为公共前缀
				commonPrefix = firstLine;
				// 提取真正的内容（去掉第一行和可能的空行）
				const content = lines.slice(1).join('\n').trim();
				contents.push(content);
				console.log(`[Batch] Detected instruction prefix: "${commonPrefix}"`);
			} else if (isInstruction && commonPrefix) {
				// 后续消息也有相同类型的指令，只提取内容
				const content = lines.slice(1).join('\n').trim();
				contents.push(content);
			} else {
				// 没有指令前缀，直接使用完整消息
				contents.push(message);
			}
		});
		
		// 构建合并后的内容
		let mergedContent: string;
		if (commonPrefix) {
			// 有公共指令：指令 + 换行 + 内容1 + 分隔符 + 内容2 + ...
			mergedContent = commonPrefix + '\n\n' + contents.join('\n\n---\n\n');
			console.log(`[Batch] Merged with common prefix, ${contents.length} content blocks`);
		} else {
			// 没有公共指令，直接用分隔符连接
			mergedContent = batch.userMessages.join('\n\n---\n\n');
			console.log(`[Batch] Merged without prefix extraction`);
		}
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

			// 拆分响应（使用两个或更多换行符+分隔符的模式）
		const content = responseData.choices?.[0]?.message?.content || '';
		const parts = content.split(/\n{2,}---\n{2,}/);

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

			console.log(`[Batch] Successfully merged ${batch.originalRequests.length} requests`);
		} catch (error) {
			// 如果批处理失败，拒绝所有请求
			console.error('[Batch] Processing failed:', error);
			batch.originalRequests.forEach(request => {
				request.reject(error instanceof Error ? error : new Error('Batch processing failed'));
			});
		}
	}

	/**
	 * 清理批处理
	 */
	cleanup(): void {
		if (this.batch?.timer) {
			clearTimeout(this.batch.timer);
		}
		this.batch = null;
	}
}

export const requestBatcher = new RequestBatcher();
