/**
 * 测试批处理响应问题
 * 发送多个请求，验证是否能正确返回响应
 */

const WORKER_URL = 'http://localhost:8787/v1/chat/completions';

async function sendRequest(content, index) {
	const startTime = Date.now();
	
	const requestBody = {
		model: 'zhipu',
		messages: [
			{
				role: 'user',
				content: `翻译为简体中文（仅输出译文内容）：\n\n${content}`,
			},
		],
		stream: false,
	};

	console.log(`\n[${index}] 发送请求: ${content.substring(0, 30)}...`);

	try {
		const response = await fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestBody),
		});

		const elapsed = Date.now() - startTime;
		
		if (!response.ok) {
			console.error(`[${index}] ❌ HTTP错误: ${response.status}`);
			const text = await response.text();
			console.error(`[${index}] 响应内容:`, text);
			return null;
		}

		const data = await response.json();
		
		console.log(`[${index}] ✅ 收到响应 (${elapsed}ms):`, {
			batched: response.headers.get('X-Batched'),
			batchSize: response.headers.get('X-Batch-Size'),
			content: data.choices?.[0]?.message?.content?.substring(0, 100),
		});

		return data;
	} catch (error) {
		const elapsed = Date.now() - startTime;
		console.error(`[${index}] ❌ 请求失败 (${elapsed}ms):`, error.message);
		return null;
	}
}

async function main() {
	console.log('=== 批处理响应测试 ===\n');
	console.log('发送 8 个请求，预期在 300ms 内合并为一个批处理\n');

	const contents = [
		'Hello World',
		'Good Morning',
		'Thank you',
		'How are you',
		'See you later',
		'Nice to meet you',
		'Have a good day',
		'Take care',
	];

	// 在 300ms 窗口内发送所有请求
	const startTime = Date.now();
	const promises = contents.map((content, index) => sendRequest(content, index + 1));

	console.log('\n等待所有响应...\n');
	const results = await Promise.all(promises);
	const totalTime = Date.now() - startTime;

	console.log('\n=== 测试结果 ===\n');

	const successCount = results.filter(r => r !== null).length;
	const failedCount = results.filter(r => r === null).length;

	console.log(`总耗时: ${totalTime}ms`);
	console.log(`成功: ${successCount}/${contents.length}`);
	console.log(`失败: ${failedCount}/${contents.length}`);

	if (successCount > 0) {
		const isBatched = results.filter(r => r !== null).every((r) => r.batched === true);
		const batchSize = results.find(r => r !== null)?.batchSize;

		console.log('\n批处理信息:');
		console.log(`  所有响应都被批处理: ${isBatched ? 'Yes' : 'No'}`);
		console.log(`  批处理大小: ${batchSize || 'N/A'}`);
	}

	if (successCount === contents.length) {
		console.log('\n✅ 测试通过！所有请求都成功返回响应。');
	} else {
		console.log('\n❌ 测试失败！有请求未返回响应。');
		process.exit(1);
	}
}

main().catch(error => {
	console.error('测试异常:', error);
	process.exit(1);
});
