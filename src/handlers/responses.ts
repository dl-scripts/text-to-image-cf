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
    const requestStartTime = Date.now();

    try {
        // 记录原始请求 - 完整内容
        console.log('[Response API] ========== REQUEST START ==========');
        console.log('[Response API] Complete Request Body:', JSON.stringify(requestBody, null, 2));
        console.log('[Response API] ========== REQUEST END ==========');

        // 1. 基础验证
        if (!requestBody || typeof requestBody.input === 'undefined') {
            console.error('[Response API] Validation failed: Missing input field');
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

        console.log('[Response API] Converted Messages:', JSON.stringify(messages, null, 2));

        // 3. 动态 Provider 调度
        const providerName = requestBody.provider?.toLowerCase() as AIProvider;
        if (providerName && circuitBreaker.canExecute(providerName)) {
            selectedProvider = providerName;
        } else {
            const available = circuitBreaker.getAvailableProviders(['zhipu', 'deepseek', 'siliconflow', 'nim', 'nim2', 'openrouter']);
            selectedProvider = available.length > 0 ? available[0] : 'nim2';
        }

        const config = getProviderConfig(selectedProvider, env);

        console.log('-- SELECTED PROVIDER:', selectedProvider);
        console.log('[Response API] Provider details:', {
            requested_provider: providerName,
            selected_provider: selectedProvider,
            model: config.model,
            endpoint: config.endpoint,
            circuit_breaker_status: circuitBreaker.canExecute(selectedProvider) ? 'available' : 'degraded'
        });

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
            console.log('[Response API] Calling provider:', {
                provider: prov,
                model: conf.model,
                endpoint: conf.endpoint,
                timestamp: new Date().toISOString()
            });

            if (prov === 'zhipu') {
                return await callZhipuAI(conf, messages, options);
            } else {
                const res = await callOpenAICompatible(conf, messages, options);
                if (!res.ok) {
                    const errBody = await res.json().catch(() => ({}));
                    console.error('[Response API] ========== PROVIDER ERROR START ==========');
                    console.error('[Response API] Provider:', prov);
                    console.error('[Response API] Status:', res.status);
                    console.error('[Response API] Complete Error Body:', JSON.stringify(errBody, null, 2));
                    console.error('[Response API] ========== PROVIDER ERROR END ==========');
                    throw { status: res.status, message: errBody.error?.message || 'Upstream Error', fullError: errBody };
                }
                return await res.json();
            }
        };

        let apiResponse: any;
        try {
            apiResponse = await executeCall(selectedProvider, config);
            circuitBreaker.recordSuccess(selectedProvider);
            
            console.log('[Response API] ========== RESPONSE START ==========');
            console.log('[Response API] Provider:', selectedProvider);
            console.log('[Response API] Duration (ms):', Date.now() - requestStartTime);
            console.log('[Response API] Complete Response Body:', JSON.stringify(apiResponse, null, 2));
            console.log('[Response API] ========== RESPONSE END ==========');
        } catch (err: any) {
            console.error('[Response API] ========== CALL FAILED ERROR START ==========');
            console.error('[Response API] Provider:', selectedProvider);
            console.error('[Response API] Duration (ms):', Date.now() - requestStartTime);
            console.error('[Response API] Complete Error Object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
            console.error('[Response API] ========== CALL FAILED ERROR END ==========');
            
            circuitBreaker.recordFailure(selectedProvider!, err);
            // 自动容灾重试
            const retryProv = getAlternativeProvider(selectedProvider!);
            selectedProvider = retryProv;
            hasRetried = true;
            
            console.log('[Response API] Retrying with alternative provider:', {
                original_provider: selectedProvider,
                retry_provider: retryProv
            });
            
            apiResponse = await executeCall(retryProv, getProviderConfig(retryProv, env));
            circuitBreaker.recordSuccess(retryProv);
            
            console.log('[Response API] ========== RETRY RESPONSE START ==========');
            console.log('[Response API] Retry Provider:', retryProv);
            console.log('[Response API] Total Duration (ms):', Date.now() - requestStartTime);
            console.log('[Response API] Complete Retry Response Body:', JSON.stringify(apiResponse, null, 2));
            console.log('[Response API] ========== RETRY RESPONSE END ==========');
        }

        // 6. 原始响应透传
        console.log('[Response API] Sending response:', {
            provider: selectedProvider,
            retried: hasRetried,
            total_duration_ms: Date.now() - requestStartTime,
            timestamp: new Date().toISOString()
        });

        return new Response(JSON.stringify(apiResponse), {
            headers: {
                'Content-Type': 'application/json',
                'X-AI-Provider': selectedProvider!,
                ...(hasRetried && { 'X-Retried': 'true' }),
                ...corsHeaders
            }
        });

    } catch (error: any) {
        console.error('[Response API] ========== FINAL ERROR START ==========');
        console.error('[Response API] Provider:', selectedProvider);
        console.error('[Response API] Duration (ms):', Date.now() - requestStartTime);
        console.error('[Response API] Timestamp:', new Date().toISOString());
        console.error('[Response API] Complete Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        console.error('[Response API] ========== FINAL ERROR END ==========');

        return new Response(JSON.stringify({
            error: { message: error.message || 'Internal Server Error', provider: selectedProvider }
        }), { 
            status: error.status || 500, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
}