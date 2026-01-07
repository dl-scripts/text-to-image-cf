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
