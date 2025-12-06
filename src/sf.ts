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

// 调用SiliconFlow API (OpenAI兼容)
export async function callSiliconFlow(
    config: AIProviderConfig,
    messages: ChatMessage[],
    options: { stream?: boolean; temperature?: number; max_tokens?: number } = {}
): Promise<Response> {
    console.log('调用SiliconFlow API:', {
        provider: config.name,
        model: config.model,
        messageCount: messages.length,
        apiKey: config.apiKey ? 'configured' : 'missing',
        baseURL: config.baseURL
    });

    if (!config.apiKey) {
        throw new Error(`API key not configured for ${config.name}`);
    }

    const requestBody = JSON.stringify({
        model: config.model,
        messages: messages,
        stream: options.stream || false,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 4000
    });

    console.log('SiliconFlow API 请求体:', requestBody);

    const response = await fetch(config.baseURL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
        },
        body: requestBody
    });

    console.log('SiliconFlow API 响应状态:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
        const responseText = await response.text();
        console.error('SiliconFlow API 错误响应内容:', responseText);

        // 检查是否是HTML响应（错误页面）
        if (responseText.trim().startsWith('<')) {
            console.error('SiliconFlow API 返回HTML错误页面，可能原因：', {
                status: response.status,
                contentType: response.headers.get('content-type'),
                url: config.baseURL
            });
            throw new Error(`API返回HTML错误页面而非JSON，状态码：${response.status}`);
        }

        try {
            const errorData = JSON.parse(responseText);
            throw new Error(errorData.error?.message || `API request failed for ${config.name}`);
        } catch (parseError) {
            console.error('SiliconFlow API 错误响应解析失败:', parseError);
            throw new Error(`API返回非JSON格式错误，状态码：${response.status}，响应内容：${responseText.substring(0, 200)}`);
        }
    }

    // 尝试解析JSON响应
    let responseData;
    try {
        const responseText = await response.text();
        console.log('SiliconFlow API 成功响应内容:', responseText);
        responseData = JSON.parse(responseText);
        console.log('SiliconFlow API 解析成功:', {
            responseType: typeof responseData,
            hasChoices: !!responseData?.choices,
            choicesCount: responseData?.choices?.length || 0
        });
    } catch (parseError) {
        console.error('SiliconFlow API 响应解析失败:', parseError);
        throw new Error(`API响应解析失败：${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    return response;
}
