// 系统提示词和错误消息配置

/**
 * 系统提示词
 */
const SYSTEM_PROMPTS = {
  default: `
**角色**: 资深 FinTech / AI 技术写作者，表达克制、从容、有温度。

**任务**: 将以下内容用简体中文重写，保持原有格式。

**要求**: 

1. **术语保留英文**: API、LLM、FinTech、DeFi、blockchain、ML、AI、agent、RAG、microservices、cloud-native、Transformer、prompt、PostgreSQL、pattern、workflow 等。
2. **表达自然**: 顺应中文语序，避免直译；如“A fixes B by C”→“A 解决了 B，方法是 C”。
3. **语言简洁**: 去翻译腔（如“为…提供”“通过…方式”等），直接表达。
4. **语气克制**: 不夸张、不煽情，用词稳健（如“颇具价值”“值得注意”）。
5. **细节准确**: 关键术语和细节要具体（如 versioned→按版本，proven→经过验证）。
6. **节奏自然**: 长短句结合，适度使用“与此同时”“再比如”“所幸”等过渡。

**风格**: 专业、准确，但不生硬；像在用中文讲述，而不是逐句翻译。
`,
} as const;

type SystemPromptType = keyof typeof SYSTEM_PROMPTS;

/**
 * 获取系统提示词
 */
export function getSystemPrompt(type?: SystemPromptType): string {
  return SYSTEM_PROMPTS.default;
}

/**
 * 错误提示词
 */
export const ERROR_MESSAGES = {
  // API相关
  apiKeyMissing: 'AI服务暂时不可用，请检查API密钥配置',
  unauthorized: 'AI服务认证失败，请检查API密钥是否正确',
  rateLimitExceeded: '请求频率过高，请稍后重试',
  timeout: '网络请求超时，请稍后重试',
  networkError: '网络连接失败，请检查网络设置',
  
  // 服务器相关
  serverError: 'AI服务暂时不可用，请稍后重试',
  serviceUnavailable: 'AI服务正在维护，请稍后重试',
  
  // 请求相关
  invalidRequest: '请求参数无效，请检查输入内容',
  emptyMessage: '消息内容不能为空',
  messageTooLong: '消息内容过长，请缩短后重试',
  
  // Provider相关
  unsupportedProvider: '不支持的AI提供商',
  providerNotAvailable: '当前AI提供商不可用，已自动切换到备用服务',
  allProvidersUnavailable: '所有AI服务暂时不可用，请稍后重试',
} as const;

/**
 * 获取错误消息
 * @param errorType 错误类型
 * @param customMessage 自定义消息（可选）
 * @returns 错误消息
 */
export function getErrorMessage(errorType: keyof typeof ERROR_MESSAGES, customMessage?: string): string {
  return customMessage || ERROR_MESSAGES[errorType] || '未知错误';
}

/**
 * 成功提示消息
 */
export const SUCCESS_MESSAGES = {
  requestCompleted: '请求已成功处理',
  providerSwitched: (fromProvider: string, toProvider: string) => 
    `已从 ${fromProvider} 切换到 ${toProvider}`,
} as const;