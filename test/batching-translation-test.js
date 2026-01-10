// 测试翻译指令去重功能

const WORKER_URL = 'http://localhost:8787/v1/chat/completions';

async function testTranslationBatching() {
	console.log('=== 测试翻译请求批处理（指令去重） ===\n');
	
	const requestId = `test-translation-${Date.now()}`;
	console.log(`Request ID: ${requestId}\n`);
	
	// 模拟3个翻译请求，每个都有相同的指令前缀
	const texts = [
		'Firefox DevTools hide unreferenced CSS variables | Stefan Judis Web Development',
		'Understanding JavaScript Closures for Beginners',
		'How to Build a REST API with Node.js and Express'
	];
	
	console.log('发送3个翻译请求，每个都有指令前缀...\n');
	
	const promises = texts.map((text, index) => {
		const userMessage = `翻译为简体中文（仅输出译文内容）：\n\n${text}`;
		
		console.log(`[请求 ${index + 1}]`);
		console.log(`内容: "${text.substring(0, 50)}..."`);
		console.log(`完整消息长度: ${userMessage.length} 字符\n`);
		
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
						content: userMessage
					}
				]
			})
		})
		.then(res => {
			const batched = res.headers.get('X-Batched');
			const batchSize = res.headers.get('X-Batch-Size');
			return res.json().then(data => ({
				index: index + 1,
				text,
				batched,
				batchSize,
				content: data.choices?.[0]?.message?.content || '无内容',
				usage: data.usage
			}));
		});
	});
	
	const results = await Promise.all(promises);
	
	console.log('=== 响应结果 ===\n');
	
	results.forEach(r => {
		console.log(`[响应 ${r.index}]`);
		console.log(`批处理: ${r.batched || 'false'}`);
		console.log(`批次大小: ${r.batchSize || 'N/A'}`);
		console.log(`翻译结果: ${r.content}`);
		console.log(`Token使用: prompt=${r.usage?.prompt_tokens}, completion=${r.usage?.completion_tokens}`);
		console.log('');
	});
	
	// 计算 token 节省
	const singleRequestPromptTokens = 550; // 假设单个请求的 prompt tokens（含系统提示词）
	const totalWithoutBatch = singleRequestPromptTokens * 3;
	const totalWithBatch = results[0].usage?.prompt_tokens || 0;
	const saved = totalWithoutBatch - totalWithBatch;
	const savedPercent = ((saved / totalWithoutBatch) * 100).toFixed(1);
	
	console.log('=== Token 分析 ===');
	console.log(`不使用批处理（估算）: ${totalWithoutBatch} tokens`);
	console.log(`使用批处理（实际）: ${totalWithBatch} tokens`);
	console.log(`节省: ${saved} tokens (${savedPercent}%)`);
	
	console.log('\n=== 测试完成 ===');
}

async function testMixedContent() {
	console.log('\n\n=== 测试混合内容（部分有指令，部分没有） ===\n');
	
	const requestId = `test-mixed-${Date.now()}`;
	
	const messages = [
		'翻译为简体中文（仅输出译文内容）：\n\nHello World',
		'Just a plain message without instruction',
		'翻译为简体中文（仅输出译文内容）：\n\nGoodbye World'
	];
	
	console.log('发送混合类型的消息...\n');
	
	const promises = messages.map((msg, index) => {
		console.log(`[请求 ${index + 1}] ${msg.substring(0, 50)}...`);
		
		return fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [{ role: 'user', content: msg }]
			})
		})
		.then(res => res.json().then(data => ({
			index: index + 1,
			content: data.choices?.[0]?.message?.content || '无内容'
		})));
	});
	
	const results = await Promise.all(promises);
	
	console.log('\n结果:');
	results.forEach(r => {
		console.log(`  [${r.index}] ${r.content}`);
	});
	
	console.log('\n=== 测试完成 ===');
}

async function testDifferentInstructions() {
	console.log('\n\n=== 测试不同类型的指令 ===\n');
	
	const requestId = `test-diff-inst-${Date.now()}`;
	
	const messages = [
		'翻译为简体中文（仅输出译文内容）：\n\nFirst content',
		'Translate to English:\n\nSecond content',
		'翻译为简体中文（仅输出译文内容）：\n\nThird content'
	];
	
	console.log('发送不同指令类型的消息...');
	console.log('预期: 由于指令不同，可能不会完全去重\n');
	
	const promises = messages.map((msg, index) => {
		return fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [{ role: 'user', content: msg }]
			})
		})
		.then(res => res.json().then(data => ({
			index: index + 1,
			content: data.choices?.[0]?.message?.content || '无内容'
		})));
	});
	
	const results = await Promise.all(promises);
	
	console.log('结果:');
	results.forEach(r => {
		console.log(`  [${r.index}] ${r.content}`);
	});
	
	console.log('\n=== 测试完成 ===');
}

// 运行所有测试
async function runAllTests() {
	try {
		await testTranslationBatching();
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		await testMixedContent();
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		await testDifferentInstructions();
	} catch (error) {
		console.error('测试失败:', error);
	}
}

runAllTests();
