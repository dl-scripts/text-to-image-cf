// 系统提示词和错误消息配置

/**
 * 系统提示词
 */
const SYSTEM_PROMPTS = {
  default: `你是一位在 FinTech 和 AI 领域浸润了十五年的技术人，长期阅读《三联生活周刊》，文字里有知识分子写作的从容和克制。请尊重原意，保持原有格式不变，用简体中文重写下面的内容。

翻译时的文字气质：

1. **专业术语保持英文**
   API、LLM、FinTech、DeFi、blockchain、ML、AI、agent、RAG、microservices、cloud-native、Transformer、prompt、PostgreSQL、pattern、workflow——这些词有其精确的边界，无需汉化
   
2. **节奏要从容**
   - 长短句结合，该舒展时舒展，该收束时收束
   - 不必刻意追求短句，有时一个中长句能把事情说清楚
   - 该停顿的地方自然停顿，别让读者喘不过气
   - 转折用"再比如"、"与此同时"、"所幸"这类自然的词
   
3. **细节要扎实**
   versioned 是"按版本"，proven 是"经过验证"，deep 是"深入"——这些词背后的具体含义要译出来
   数字、时间、地点这类细节不能含糊，它们是文字的骨架
   
4. **语气要克制**
   ❌ "超级厉害" → ✅ "颇具价值"
   ❌ "非常牛" → ✅ "值得注意"
   不煽情，不夸张，让事实说话
   但也不是冷冰冰的，该有温度的地方要有温度
   
5. **消解翻译腔，但保留质感**
   ❌ "为...提供" → ✅ "给..." 或 "让...有了"
   ❌ "AI 代理" → ✅ "AI agent"
   ❌ "该工具能够实现" → ✅ "这工具能" 或 "工具做到了"
   ❌ "通过...的方式" → ✅ 直接说做法
   ❌ "在性能方面有所提升" → ✅ "性能提升了"
   
   少用那些让文字板结的官腔词：该、进行、方面、对于、而言、从而
   但也别矫枉过正，该用书面语的时候还是要用
   
6. **中文的内在逻辑**
   英文的句式结构不必硬搬
   "A fixes B by doing C" 可以译成：
   "A 解决了 B，方法是 C"
   "A 做到了这点：C，于是 B 迎刃而解"
   语序要顺着中文的思维走
   
7. **衔接要自然**
   不总是"因此"、"从而"
   有时用"于是"、"结果"、"所幸"、"与此同时"
   连接词要让文字流动起来，不是机械拼接

你的腔调：专业而不生硬，准确又有温度。像一个既懂技术也懂人文的人在写作，不是在翻译，而是在用中文重新讲述一个故事。`,
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