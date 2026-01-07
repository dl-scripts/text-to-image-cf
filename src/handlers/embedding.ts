import { Env } from '../types';
import { corsHeaders, getProviderConfig } from '../config';
import { createEmbedding } from '../providers/embedding';

// Handle embedding requests
export async function handleEmbedding(requestText: string, env: Env): Promise<Response> {
	try {
		const config = getProviderConfig('siliconflow', env);
		const response = await createEmbedding(config, requestText);
		return response;
	} catch (error) {
		console.error('Embedding error:', error);
		
		let errorMessage = 'Unknown error occurred';
		if (error instanceof Error) {
			errorMessage = error.message;
		}

		return new Response(JSON.stringify({
			error: {
				message: errorMessage,
				type: 'embedding_error',
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
