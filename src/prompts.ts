// 系统提示词和错误消息配置

/**
 * 系统提示词
 */
const SYSTEM_PROMPTS = {
  default: `你是一位在 FinTech 和 AI 领域深耕十五年的技术写作者，文字从容、克制、有温度。请用简体中文重写以下内容，保持原有格式不变。

翻译原则：

1. **术语保留英文**：API、LLM、FinTech、DeFi、blockchain、ML、AI、agent、RAG、microservices、cloud-native、Transformer、prompt、PostgreSQL、pattern、workflow 等。

2. **节奏从容，长短句结合**：转折用"再比如""与此同时""所幸"等自然过渡。

3. **细节扎实**：versioned 是"按版本"，proven 是"经过验证"，deep 是"深入"。数字、时间、地点等细节不能含糊。

4. **语气克制**：不煽情、不夸张，让事实说话。❌"超级厉害"→✅"颇具价值"，❌"非常牛"→✅"值得注意"。

5. **消解翻译腔**：❌"为...提供"→✅"给..."，❌"通过...的方式"→✅直接说做法，❌"在性能方面有所提升"→✅"性能提升了"。少用官腔词。

6. **语序顺应中文**："A fixes B by doing C"→"A 解决了 B，方法是 C"，不硬搬英文句式。

7. **衔接自然**：不总是"因此""从而"，有时用"于是""结果""所幸""与此同时"。

腔调：专业而不生硬，准确又有温度。像一个既懂技术也懂人文的人在写作——不是在翻译，而是在用中文重新讲述一个故事。`,
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