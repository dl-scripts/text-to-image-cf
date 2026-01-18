import { ResponseRequest, Env, ResponseMessage, ChatMessage, AIProvider } from '../types';
import { corsHeaders, getProviderFromRequest, getProviderConfig, getAlternativeProvider } from '../config';
import { callZhipuAI } from '../providers/zhipu';
import { callOpenAICompatible } from '../providers/openai-compatible';
import { circuitBreaker } from '../circuit-breaker';
import { getSystemPrompt } from '../prompts';

/**
 * 核心修复函数：处理 Vercel AI SDK 的多模态 content 格式
 * 将 [{type: 'input_text', text: '...'}] 转换为下游 API 兼容的 String
 */
function normalizeContent(content: any): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        // 查找数组中包含文本的项，兼容 'text' 和 'input_text' 变体
        const textItem = content.find(item => item.type === 'text' || item.type === 'input_text');
        if (textItem && typeof textItem.text === 'string') {
            return textItem.text;
        }
        return JSON.stringify(content);
    }
    return String(content || '');
}

export async function handleResponseAPI(requestBody: ResponseRequest, env: Env): Promise<Response> {
    let selectedProvider: AIProvider | undefined;
    let hasRetried = false;

    try {
        // 1. 验证请求体
        if (!requestBody || typeof requestBody !== 'object') {
            return new Response(JSON.stringify({
                error: { message: 'Invalid request body', type: 'validation_error' }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // 2. 验证并处理 input 字段
        if (!requestBody.input) {
            return new Response(JSON.stringify({
                error: { message: 'Missing required field: input', type: 'validation_error' }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        let messages: ChatMessage[];
        if (typeof requestBody.input === 'string') {
            messages = [
                { role: 'system', content: getSystemPrompt('default') },
                { role: 'user', content: requestBody.input }
            ];
        } else {
            const inputMessages = requestBody.input as ResponseMessage[];
            // 过滤掉前端可能自带的 system 消息，由后端统一注入
            const nonSystemMessages = inputMessages.filter(msg => msg.role !== 'system');
            
            messages = [
                { role: 'system', content: getSystemPrompt('default') },
                ...nonSystemMessages.map(msg => ({
                    role: msg.role as 'user' | 'assistant' | 'system',
                    // ✨ 调用转换函数，彻底修复 unknown variant input_text 错误
                    content: normalizeContent(msg.content)
                }))
            ];
        }

        // 3. 选择 Provider 逻辑
        if (requestBody.provider) {
            const provider = requestBody.provider.toLowerCase();
            const supported: AIProvider[] = ['zhipu', 'siliconflow', 'deepseek', 'nim', 'nim2', 'openrouter'];
            if (supported.includes(provider as AIProvider)) {
                selectedProvider = provider as AIProvider;
                if (!circuitBreaker.canExecute(selectedProvider)) {
                    selectedProvider = getAlternativeProvider(selectedProvider);
                }
            }
        }

        if (!selectedProvider) {
            const allProviders: AIProvider[] = ['zhipu', 'deepseek', 'siliconflow', 'nim', 'nim2', 'openrouter'];
            const availableProviders = circuitBreaker.getAvailableProviders(allProviders);
            selectedProvider = availableProviders.length > 0 ? availableProviders[0] : 'nim2';
        }

        const config = getProviderConfig(selectedProvider, env);

        // 4. 下游 API 配置 (支持结构化输出)
        const options = {
            stream: false,
            temperature: requestBody.temperature ?? 0.3,
            max_tokens: requestBody.max_tokens,
            // 兼容多种结构化输出声明方式
            responseFormat: requestBody.text?.format || (requestBody as any).response_format
        };

        // 5. 执行请求与重试机制
        let apiResponse: any;
        const originalProvider = selectedProvider;

        const executeCall = async (prov: AIProvider, conf: any) => {
            if (prov === 'zhipu') {
                return await callZhipuAI(conf, messages, options);
            } else {
                const res = await callOpenAICompatible(conf, messages, options);
                if (!res.ok) {
                    const errorJson = await res.json().catch(() => ({}));
                    const err: any = new Error(errorJson.error?.message || 'Upstream API Error');
                    err.status = res.status;
                    throw err;
                }
                return await res.json();
            }
        };

        try {
            apiResponse = await executeCall(selectedProvider, config);
            circuitBreaker.recordSuccess(originalProvider);
        } catch (apiError: any) {
            circuitBreaker.recordFailure(originalProvider, apiError);

            // 5xx 错误或超时自动切换 Provider 重试一次
            if ((apiError.status && apiError.status >= 500) || apiError.isTimeout || apiError.message.includes('fetch')) {
                const retryProvider = getAlternativeProvider(originalProvider);
                const retryConfig = getProviderConfig(retryProvider, env);
                hasRetried = true;
                selectedProvider = retryProvider;

                try {
                    apiResponse = await executeCall(retryProvider, retryConfig);
                    circuitBreaker.recordSuccess(retryProvider);
                } catch (retryError: any) {
                    circuitBreaker.recordFailure(retryProvider, retryError);
                    throw retryError;
                }
            } else {
                throw apiError;
            }
        }

        // 6. 返回响应
        return new Response(JSON.stringify(apiResponse), {
            headers: {
                'Content-Type': 'application/json',
                'X-AI-Provider': selectedProvider,
                ...(hasRetried && { 'X-Retried': 'true' }),
                ...corsHeaders
            }
        });

    } catch (error: any) {
        console.error('Final Responses API error:', error.message);
        return new Response(JSON.stringify({
            error: {
                message: error.message || 'Internal server error',
                type: 'api_error',
                provider: selectedProvider
            }
        }), {
            status: error.status || 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
            }
        });
    }
}