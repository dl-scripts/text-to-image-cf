// 类型定义

export interface ChatMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export interface ChatRequest {
	messages: ChatMessage[];
	model?: string;
	stream?: boolean;
	provider?: string;
	temperature?: number;
	max_tokens?: number;
}

export type AIProvider = 'zhipu' | 'siliconflow' | 'deepseek' | 'nim' | 'nim2' | 'openrouter';

export interface AIProviderConfig {
	name: AIProvider;
	apiKey: string;
	model: string;
	embedding_model?: string;
	baseURL: string;
	embeddingURL?: string;
}

export interface Env {
	ZHIPU_API_KEY: string;
	ZAI_MODEL: string;
	SILICONFLOW_API_KEY: string;
	SILICONFLOW_MODEL: string;
	SILICONFLOW_EMBEDDING_MODEL: string;
	DEEPSEEK_API_KEY: string;
	NVIDIA_API_KEY: string;
	NVIDIA_MODEL: string;
	OPENROUTER_API_KEY: string;
	OPENROUTER_MODEL: string;
}
