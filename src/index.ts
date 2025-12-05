import { ZhipuAI } from 'zhipuai-sdk-nodejs-v4';

export default {
	async fetch(request, env) {
		try {
			// Initialize ZhipuAI client with API key from environment variables
			const client = new ZhipuAI({
				apiKey: env.ZHIPU_API_KEY || 'your-api-key-here'
			});

			// Get prompt from request or use default
			const url = new URL(request.url);
			const prompt = url.searchParams.get('prompt') || "cyberpunk cat";

			// Call z.ai API for agent request
			const response = await client.chat.completions.create({
				model: "glm-4",
				messages: [
					{
						role: "user",
						content: `Generate an image description based on this prompt: ${prompt}`
					}
				],
				max_tokens: 500,
				temperature: 0.7
			});

			// Extract the enhanced prompt from the response
			const enhancedPrompt = response.choices[0]?.message?.content || prompt;

			// Use the enhanced prompt with Cloudflare's AI for image generation
			const inputs = {
				prompt: enhancedPrompt,
			};

			const imageResponse = await env.AI.run(
				"@cf/stabilityai/stable-diffusion-xl-base-1.0",
				inputs,
			);

			return new Response(imageResponse, {
				headers: {
					"content-type": "image/png",
				},
			});

		} catch (error) {
			console.error('Error:', error);
			return new Response(JSON.stringify({ error: 'Failed to process request' }), {
				status: 500,
				headers: {
					'content-type': 'application/json',
				},
			});
		}
	},
} satisfies ExportedHandler<Env>;
