import { ResponseRequest, Env, ResponseMessage, ChatMessage, AIProvider } from '../types';
import { corsHeaders, getProviderConfig, getAlternativeProvider } from '../config';
import { callZhipuAI } from '../providers/zhipu';
import { callOpenAICompatible } from '../providers/openai-compatible';
import { circuitBreaker } from '../circuit-breaker';

/**
 * 通用内容清洗：确保下游 API 收到的是标准 String 或标准多模态数组
 * 修复 OpenAI 兼容协议中常见的 variant 冲突
 */
function normalizeContent(content: any): any {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        // 如果数组项包含非标的 'input_text'，将其修正为标准的 'text'
        return content.map(item => {
            if (item.type === 'input_text') {
                return { type: 'text', text: item.text };
            }
            return item;
        });
    }
    return content;
}

export async function handleResponseAPI(requestBody: ResponseRequest, env: Env): Promise<Response> {
    let selectedProvider: AIProvider | undefined;
    let hasRetried = false;

    try {
        // 1. 基础验证
        if (!requestBody || typeof requestBody.input === 'undefined') {
            return new Response(JSON.stringify({ error: { message: 'Missing input field' } }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json', ...corsHeaders } 
            });
        }

        // 2. 通用消息转换 (General Mapping)
        // 将 Responses API 的 input 转换为标准 Chat Completion 的 messages
        let messages: ChatMessage[] = [];
        if (typeof requestBody.input === 'string') {
            messages = [{ role: 'user', content: requestBody.input }];
        } else if (Array.isArray(requestBody.input)) {
            messages = (requestBody.input as ResponseMessage[]).map(msg => ({
                role: msg.role as 'user' | 'assistant' | 'system',
                content: normalizeContent(msg.content)
            }));
        }

        // 3. 动态 Provider 调度
        const providerName = requestBody.provider?.toLowerCase() as AIProvider;
        if (providerName && circuitBreaker.canExecute(providerName)) {
            selectedProvider = providerName;
        } else {
            const available = circuitBreaker.getAvailableProviders(['zhipu', 'deepseek', 'siliconflow', 'nim', 'nim2', 'openrouter']);
            selectedProvider = available.length > 0 ? available[0] : 'nim2';
        }

        const config = getProviderConfig(selectedProvider, env);

        // 4. 通用选项映射 (透传前端参数)
        const options = {
            stream: false,
            temperature: requestBody.temperature ?? 0.7,
            max_tokens: requestBody.max_tokens,
            // 接收标准的 response_format
            responseFormat: (requestBody as any).response_format || requestBody.text?.format
        };

        // 5. 执行逻辑 (通用透传)
        const executeCall = async (prov: AIProvider, conf: any) => {
            if (prov === 'zhipu') {
                return await callZhipuAI(conf, messages, options);
            } else {
                const res = await callOpenAICompatible(conf, messages, options);
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    throw { status: res.status, message: errBody.error?.message || 'Upstream Error' };
                }
                return await res.json();
            }
        };

        let apiResponse: any;
        try {
            apiResponse = await executeCall(selectedProvider, config);
            circuitBreaker.recordSuccess(selectedProvider);
        } catch (err: any) {
            circuitBreaker.recordFailure(selectedProvider!, err);
            // 自动容灾重试
            const retryProv = getAlternativeProvider(selectedProvider!);
            selectedProvider = retryProv;
            hasRetried = true;
            apiResponse = await executeCall(retryProv, getProviderConfig(retryProv, env));
            circuitBreaker.recordSuccess(retryProv);
        }

        // 6. 原始响应透传
        return new Response(JSON.stringify(apiResponse), {
            headers: {
                'Content-Type': 'application/json',
                'X-AI-Provider': selectedProvider!,
                ...(hasRetried && { 'X-Retried': 'true' }),
                ...corsHeaders
            }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({
            error: { message: error.message || 'Internal Server Error', provider: selectedProvider }
        }), { 
            status: error.status || 500, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
}