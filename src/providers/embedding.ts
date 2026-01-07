import { AIProviderConfig } from '../types';

export async function createEmbedding(config: AIProviderConfig, input: string) {
	let dimensions = 1024;
	switch (config.embedding_model) {
		case 'Qwen/Qwen3-Embedding-4B':
			dimensions = 2560;
			break;
		case 'Qwen/Qwen3-Embedding-8B':
			dimensions = 4096;
			break;
		default:
			break;
	}
	const options = {
		method: 'POST',
		headers: { 
			Authorization: `Bearer ${config.apiKey}`, 
			'Content-Type': 'application/json' 
		},
		body: JSON.stringify({
			model: config.embedding_model,
			input: input,
			encoding_format: 'float',
			dimensions: dimensions,
		})
	};

	const response = await fetch(config.embeddingURL!, options);
	if (!response.ok) {
		const errorData = await response.json() as any;
		throw new Error(errorData.error?.message || `API request failed for ${config.name}`);
	}

	return response;
}
