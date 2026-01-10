/**
 * 测试智能指令提取功能
 * 验证批处理时是否能正确提取公共翻译指令
 * 注意：所有请求会自动合并批处理，不需要 requestId
 */

const WORKER_URL = 'http://localhost:8787/v1/chat/completions';

async function sendRequest(content, index) {
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

	console.log(`\n[Request ${index}] Sending...`);
	console.log('Content:', content.substring(0, 50) + '...');

	const response = await fetch(WORKER_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
	});

	const data = await response.json();

	console.log(`[Request ${index}] Response:`, {
		batched: response.headers.get('X-Batched'),
		batchSize: response.headers.get('X-Batch-Size'),
		content: data.choices?.[0]?.message?.content?.substring(0, 100),
	});

	return data;
}

async function main() {
	console.log('=== 智能指令提取测试 ===\n');
	console.log('预期行为：所有请求自动合并批处理，只保留一个"翻译为简体中文"指令，用 --- 分隔各个内容\n');

	const contents = [
		'Firefox DevTools hide unreferenced CSS variables | Stefan Judis Web Development',
		'JavaScript Array Methods You Should Know',
		'Understanding TypeScript Generics',
	];

	// 在300ms窗口内发送所有请求
	const promises = contents.map((content, index) => sendRequest(content, index + 1));

	console.log('\n等待所有响应...\n');
	const results = await Promise.all(promises);

	console.log('\n=== 测试结果 ===\n');

	results.forEach((result, index) => {
		console.log(`Response ${index + 1}:`);
		console.log('  内容:', result.choices?.[0]?.message?.content);
		console.log('  Batched:', result.batched ? 'Yes' : 'No');
		console.log('  Batch Size:', result.batchSize || 'N/A');
		console.log();
	});

	// 验证批处理
	const isBatched = results.every((r) => r.batched === true);
	const batchSize = results[0]?.batchSize;

	console.log('验证结果:');
	console.log('  ✓ 所有请求都被批处理:', isBatched ? 'Yes' : 'No');
	console.log('  ✓ 批处理大小:', batchSize || 'N/A');

	if (isBatched && batchSize === contents.length) {
		console.log('\n✅ 测试成功！请检查日志确认指令提取逻辑正常工作。');
	} else {
		console.log('\n❌ 测试失败：请求未被正确批处理。');
	}
}

main().catch(console.error);
