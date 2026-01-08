/**
 * 辅助函数：使用 Web Crypto API 生成 SHA-256 哈希
 * 将输入字符串转换为 16 进制字符串
 */
export async function calculateHash(message: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	// 将字节数组转换为 hex 字符串
	return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 带超时的 fetch 函数
 * @param url 请求URL
 * @param options fetch选项
 * @param timeout 超时时间（毫秒），默认8秒
 * @returns Promise<Response>
 */
export async function fetchWithTimeout(
	url: string,
	options: RequestInit = {},
	timeout: number = 8000
): Promise<Response> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal
		});
		clearTimeout(timeoutId);
		return response;
	} catch (error: any) {
		clearTimeout(timeoutId);
		if (error.name === 'AbortError') {
			const timeoutError = new Error(`Request timeout after ${timeout}ms`) as any;
			timeoutError.status = 504; // Gateway Timeout
			timeoutError.isTimeout = true;
			throw timeoutError;
		}
		throw error;
	}
}
