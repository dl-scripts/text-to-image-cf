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
	requestId?: string;
	metadata?: {
		requestId?: string;
		[key: string]: any;
	};
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

// Responses API types
export interface ResponseMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface JSONSchemaProperty {
	type: string;
	description?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	enum?: any[];
	items?: JSONSchemaProperty;
	properties?: Record<string, JSONSchemaProperty>;
	required?: string[];
	additionalProperties?: boolean;
}

export interface JSONSchemaFormat {
	type: 'json_schema';
	name?: string;
	strict?: boolean;
	schema: JSONSchemaProperty;
}

export interface ResponseTextFormat {
	format?: JSONSchemaFormat;
}

export interface ResponseRequest {
	model?: string;
	input: string | ResponseMessage[];
	text?: ResponseTextFormat;
	provider?: string;
	temperature?: number;
	max_tokens?: number;
}

export interface ResponseOutput {
	id: string;
	object: 'response';
	created: number;
	model: string;
	content: string;
	usage?: {
		input_tokens: number;
		output_tokens: number;
		total_tokens: number;
	};
	provider?: string;
}
