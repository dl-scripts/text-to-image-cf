// CORS headers for cross-origin requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// 定义AI提供商类型
type AIProvider = 'zhipu' | 'siliconflow';

// 定义AI提供商配置
interface AIProviderConfig {
    name: AIProvider;
    apiKey: string;
    model: string;
    baseURL: string;
}

export
    // 调用智谱AI API
    async function callZhipuAI(
        config: AIProviderConfig,
        messages: ChatMessage[],
        options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
    ): Promise<any> {
    console.log('调用智谱AI API:', {
        provider: config.name,
        model: config.model,
        messageCount: messages.length,
        apiKey: config.apiKey ? 'configured' : 'missing'
    });

    const client = new ZhipuAI({
        apiKey: config.apiKey
    });

    try {
        const response = await client.createCompletions({
            model: config.model,
            messages: messages,
            temperature: options.temperature ?? 0.3,
            maxTokens: options.max_tokens ?? 4000,
            stream: options.stream ?? false
        });

        console.log('智谱AI API 响应成功:', {
            responseType: typeof response,
            hasChoices: !!response?.choices,
            choicesCount: response?.choices?.length || 0
        });

        return response;
    } catch (error) {
        console.error('智谱AI API 调用失败:', {
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            provider: config.name,
            model: config.model
        });
        throw error;
    }
}

// export async function handleZhipuResponse(response: Response, options: any, configModel: string) {
//     if (options.stream) {
//         // 流式响应
//         const encoder = new TextEncoder();
//         const readable = new ReadableStream({
//             async start(controller) {
//                 try {
//                     for await (const chunk of response) {
//                         const content = chunk.choices[0]?.delta?.content || '';
//                         if (content) {
//                             controller.enqueue(encoder.encode(`data: ${JSON.stringify({
//                                 choices: [{
//                                     delta: {
//                                         content: content
//                                     }
//                                 }]
//                             })}\n\n`));
//                         }
//                     }
//                     controller.enqueue(encoder.encode('data: [DONE]\n\n'));
//                 } catch (error) {
//                     console.error('Stream error:', error);
//                     controller.error(error);
//                 }
//             }
//         });

//         return new Response(readable, {
//             headers: {
//                 'Content-Type': 'text/event-stream',
//                 'Cache-Control': 'no-cache',
//                 'Connection': 'keep-alive',
//                 'X-AI-Provider': 'Zhipu',
//                 ...corsHeaders
//             }
//         });
//     } else {
//         // 非流式响应
//         const result = response as any;
//         console.log('Chat completion successful:', {
//             responseLength: JSON.stringify(result).length,
//             finishReason: result.choices?.[0]?.finish_reason
//         });

//         return new Response(JSON.stringify({
//             id: `chatcmpl-${Date.now()}`,
//             object: 'chat.completion',
//             created: Math.floor(Date.now() / 1000),
//             model: configModel,
//             choices: result.choices || [],
//             usage: result.usage || {
//                 prompt_tokens: 0,
//                 completion_tokens: 0,
//                 total_tokens: 0
//             },
//             provider: selectedProvider
//         }), {
//             headers: {
//                 'Content-Type': 'application/json',
//                 'X-AI-Provider': selectedProvider,
//                 ...corsHeaders
//             }
//         });
//     }
// }