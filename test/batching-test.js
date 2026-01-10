// 批处理功能测试

const WORKER_URL = 'http://localhost:8787/v1/chat/completions';
// const WORKER_URL = 'https://text-to-image-cf.dal.workers.dev/v1/chat/completions';

async function testBatching() {
	console.log('=== 测试请求批处理功能 ===\n');
	
	const requestId = `test-${Date.now()}`;
	console.log(`使用 Request ID: ${requestId}\n`);
	
	// 模拟同一篇文章的多个段落翻译请求
	const texts = [
		'How to Become an Agentic AI Expert in 2026?',
		'The world of artificial intelligence is evolving rapidly.',
		'Understanding AI agents is crucial for modern developers.',
	];
	
	console.log('发送3个请求（应该被合并为1个批次）...\n');
	
	const startTime = Date.now();
	
	// 并发发送所有请求
	const promises = texts.map((text, index) => {
		console.log(`[请求 ${index + 1}] 发送: "${text.substring(0, 50)}..."`);
		
		return fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [
					{
						role: 'user',
						content: `翻译为简体中文（仅输出译文内容）：\n\n${text}`
					}
				],
				stream: false
			})
		})
		.then(res => {
			const batched = res.headers.get('X-Batched');
			const batchSize = res.headers.get('X-Batch-Size');
			return res.json().then(data => ({
				index: index + 1,
				batched,
				batchSize,
				data
			}));
		});
	});
	
	// 等待所有响应
	const results = await Promise.all(promises);
	
	const duration = Date.now() - startTime;
	
	console.log('\n=== 响应结果 ===\n');
	
	results.forEach(result => {
		console.log(`[响应 ${result.index}]`);
		console.log(`  批处理: ${result.batched || 'false'}`);
		console.log(`  批次大小: ${result.batchSize || 'N/A'}`);
		console.log(`  内容: ${result.data.choices?.[0]?.message?.content || '无内容'}`);
		console.log(`  Token使用: ${JSON.stringify(result.data.usage)}`);
		console.log('');
	});
	
	console.log(`总耗时: ${duration}ms`);
	console.log('\n=== 测试完成 ===');
}

async function testNoBatching() {
	console.log('\n\n=== 测试禁用批处理 ===\n');
	
	const response = await fetch(WORKER_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Enable-Batching': 'false',
			'X-Request-Id': `test-${Date.now()}`,
		},
		body: JSON.stringify({
			messages: [
				{
					role: 'user',
					content: '你好，这是一个测试'
				}
			]
		})
	});
	
	const batched = response.headers.get('X-Batched');
	const data = await response.json();
	
	console.log(`批处理状态: ${batched || 'false'} (应该是 false)`);
	console.log(`响应: ${data.choices?.[0]?.message?.content || '无内容'}`);
	console.log('\n=== 测试完成 ===');
}

async function testDifferentRequestIds() {
	console.log('\n\n=== 测试不同 Request ID（不应该合并） ===\n');
	
	const promises = [1, 2, 3].map(i => {
		const requestId = `test-${Date.now()}-${i}`;
		console.log(`发送请求 ${i}，Request ID: ${requestId}`);
		
		return fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [
					{
						role: 'user',
						content: `测试消息 ${i}`
					}
				]
			})
		})
		.then(res => {
			const batched = res.headers.get('X-Batched');
			const batchSize = res.headers.get('X-Batch-Size');
			return { i, batched, batchSize };
		});
	});
	
	const results = await Promise.all(promises);
	
	console.log('\n结果:');
	results.forEach(r => {
		console.log(`  请求 ${r.i}: 批处理=${r.batched || 'false'}, 批次大小=${r.batchSize || 'N/A'}`);
	});
	
	console.log('\n=== 测试完成 ===');
}

// 运行所有测试
async function runAllTests() {
	try {
		await testBatching();
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		await testNoBatching();
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		await testDifferentRequestIds();
	} catch (error) {
		console.error('测试失败:', error);
	}
}

runAllTests();
