import { ResponseRequest, Env, ResponseMessage, ChatMessage, AIProvider } from '../types';
import { corsHeaders, getProviderConfig, getAlternativeProvider, getProviderFromRequest } from '../config';
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
        const providerName = requestBody.provider?.toLowerCase();
        
        // 如果客户端传入 'custom'，则随机选择一个可用的 provider
        if (providerName === 'custom') {
            selectedProvider = getProviderFromRequest({ messages } as any);
            console.log('[Response API] Custom provider selected:', selectedProvider);
        } else if (providerName && circuitBreaker.canExecute(providerName as AIProvider)) {
            selectedProvider = providerName as AIProvider;
        } else if (providerName) {
            // 指定的 provider 不可用，选择替代的
            console.log('[Response API] Requested provider unavailable:', providerName);
            selectedProvider = getProviderFromRequest({ messages } as any);
        } else {
            // 没有指定 provider，随机选择
            selectedProvider = getProviderFromRequest({ messages } as any);
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
        const maxRetries = 2; // 至少尝试2个不同的provider（如果第一个失败）
        let retryCount = 0;
        const triedProviders: AIProvider[] = [];
        
        while (retryCount <= maxRetries) {
            try {
                triedProviders.push(selectedProvider);
                apiResponse = await executeCall(selectedProvider, config);
                circuitBreaker.recordSuccess(selectedProvider);
                
                console.log('[Response API] ========== RESPONSE START ==========');
                console.log('[Response API] Provider:', selectedProvider);
                console.log('[Response API] Retry Count:', retryCount);
                console.log('[Response API] Duration (ms):', Date.now() - requestStartTime);
                console.log('[Response API] Complete Response Body:', JSON.stringify(apiResponse, null, 2));
                console.log('[Response API] ========== RESPONSE END ==========');
                
                break; // 成功，跳出循环
            } catch (err: any) {
                console.error('[Response API] ========== CALL FAILED ERROR START ==========');
                console.error('[Response API] Provider:', selectedProvider);
                console.error('[Response API] Retry Count:', retryCount);
                console.error('[Response API] Duration (ms):', Date.now() - requestStartTime);
                console.error('[Response API] Complete Error Object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
                console.error('[Response API] ========== CALL FAILED ERROR END ==========');
                
                circuitBreaker.recordFailure(selectedProvider!, err);
                
                // 如果还有重试机会，选择替代provider
                if (retryCount < maxRetries) {
                    const retryProv = getAlternativeProvider(selectedProvider!);
                    const previousProvider = selectedProvider;
                    selectedProvider = retryProv;
                    hasRetried = true;
                    retryCount++;
                    
                    console.log('[Response API] Retrying with alternative provider:', {
                        attempt: retryCount + 1,
                        failed_provider: previousProvider,
                        retry_provider: retryProv,
                        tried_providers: triedProviders
                    });
                    
                    // 更新config为新的provider
                    const newConfig = getProviderConfig(retryProv, env);
                    Object.assign(config, newConfig);
                } else {
                    // 所有重试都失败了，抛出最后一个错误
                    console.error('[Response API] All retry attempts exhausted');
                    throw err;
                }
            }
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