// 批处理诊断工具 - 详细测试批处理功能

const WORKER_URL = 'http://localhost:8787/v1/chat/completions';

// 颜色输出
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testBasicBatching() {
	log('\n=== 测试1: 基本批处理（3个快速请求） ===', 'bright');
	
	const requestId = `test-basic-${Date.now()}`;
	log(`Request ID: ${requestId}`, 'cyan');
	
	const texts = ['Hello', 'World', 'Test'];
	
	log(`\n发送 ${texts.length} 个请求...`, 'yellow');
	const startTime = Date.now();
	
	const promises = texts.map((text, index) => {
		const sendTime = Date.now();
		log(`  [${index + 1}] 发送: "${text}" (${sendTime - startTime}ms)`, 'cyan');
		
		return fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [
					{ role: 'user', content: `回复一个字：${text}` }
				]
			})
		})
		.then(res => {
			const responseTime = Date.now();
			const batched = res.headers.get('X-Batched');
			const batchSize = res.headers.get('X-Batch-Size');
			
			return res.json().then(data => ({
				index: index + 1,
				text,
				batched,
				batchSize,
				responseTime: responseTime - startTime,
				content: data.choices?.[0]?.message?.content || '无内容',
				data
			}));
		});
	});
	
	const results = await Promise.all(promises);
	const duration = Date.now() - startTime;
	
	log('\n结果:', 'bright');
	results.forEach(r => {
		const status = r.batched === 'true' ? '✓' : '✗';
		const statusColor = r.batched === 'true' ? 'green' : 'red';
		log(`  ${status} [${r.index}] ${r.text}`, statusColor);
		log(`    批处理: ${r.batched || 'false'}, 批次大小: ${r.batchSize || 'N/A'}`, 'cyan');
		log(`    响应时间: ${r.responseTime}ms`, 'cyan');
		log(`    内容: ${r.content}`, 'cyan');
		log(`    Token: prompt=${r.data.usage?.prompt_tokens}, completion=${r.data.usage?.completion_tokens}`, 'cyan');
	});
	
	log(`\n总耗时: ${duration}ms`, 'yellow');
	
	// 验证
	const allBatched = results.every(r => r.batched === 'true');
	const sameBatchSize = results.every(r => r.batchSize === String(texts.length));
	
	if (allBatched && sameBatchSize) {
		log('✓ 测试通过：所有请求都被正确批处理', 'green');
	} else {
		log('✗ 测试失败：批处理未正确工作', 'red');
		if (!allBatched) log('  - 部分请求未被批处理', 'red');
		if (!sameBatchSize) log('  - 批次大小不一致', 'red');
	}
	
	return { passed: allBatched && sameBatchSize, results };
}

async function testSlowRequests() {
	log('\n=== 测试2: 延迟请求（间隔200ms） ===', 'bright');
	
	const requestId = `test-slow-${Date.now()}`;
	log(`Request ID: ${requestId}`, 'cyan');
	
	const texts = ['First', 'Second', 'Third'];
	const results = [];
	const startTime = Date.now();
	
	for (let i = 0; i < texts.length; i++) {
		const text = texts[i];
		const sendTime = Date.now();
		log(`  [${i + 1}] 发送: "${text}" (${sendTime - startTime}ms)`, 'cyan');
		
		const promise = fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [
					{ role: 'user', content: `回复一个字：${text}` }
				]
			})
		});
		
		results.push(promise);
		
		// 等待200ms再发送下一个
		if (i < texts.length - 1) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
	}
	
	const responses = await Promise.all(results);
	const data = await Promise.all(responses.map(r => r.json()));
	
	log('\n结果:', 'bright');
	data.forEach((d, i) => {
		const batched = responses[i].headers.get('X-Batched');
		const batchSize = responses[i].headers.get('X-Batch-Size');
		const status = batched === 'true' ? '✓' : '✗';
		const statusColor = batched === 'true' ? 'green' : 'red';
		
		log(`  ${status} [${i + 1}] ${texts[i]}`, statusColor);
		log(`    批处理: ${batched || 'false'}, 批次大小: ${batchSize || 'N/A'}`, 'cyan');
	});
	
	const allBatched = data.every((_, i) => responses[i].headers.get('X-Batched') === 'true');
	
	if (allBatched) {
		log('✓ 测试通过：延迟请求仍被批处理（定时器重置正常）', 'green');
	} else {
		log('✓ 预期行为：由于间隔200ms，在300ms窗口内，应该被合并', 'yellow');
	}
	
	return { passed: true, responses };
}

async function testTooSlowRequests() {
	log('\n=== 测试3: 过慢请求（间隔400ms，超过窗口） ===', 'bright');
	
	const requestId = `test-tooslow-${Date.now()}`;
	log(`Request ID: ${requestId}`, 'cyan');
	
	const texts = ['First', 'Second'];
	const results = [];
	const startTime = Date.now();
	
	for (let i = 0; i < texts.length; i++) {
		const text = texts[i];
		const sendTime = Date.now();
		log(`  [${i + 1}] 发送: "${text}" (${sendTime - startTime}ms)`, 'cyan');
		
		const promise = fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [
					{ role: 'user', content: `回复一个字：${text}` }
				]
			})
		});
		
		results.push(promise);
		
		// 等待400ms（超过300ms窗口）
		if (i < texts.length - 1) {
			await new Promise(resolve => setTimeout(resolve, 400));
		}
	}
	
	const responses = await Promise.all(results);
	const data = await Promise.all(responses.map(r => r.json()));
	
	log('\n结果:', 'bright');
	data.forEach((d, i) => {
		const batched = responses[i].headers.get('X-Batched');
		const batchSize = responses[i].headers.get('X-Batch-Size');
		
		log(`  [${i + 1}] ${texts[i]}`, 'cyan');
		log(`    批处理: ${batched || 'false'}, 批次大小: ${batchSize || 'N/A'}`, 'cyan');
	});
	
	log('✓ 预期行为：由于间隔400ms超过300ms窗口，应该分开处理', 'yellow');
	
	return { passed: true, responses };
}

async function testDisabledBatching() {
	log('\n=== 测试4: 禁用批处理 ===', 'bright');
	
	const requestId = `test-disabled-${Date.now()}`;
	log(`Request ID: ${requestId}`, 'cyan');
	
	const response = await fetch(WORKER_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Request-Id': requestId,
			'X-Enable-Batching': 'false',
		},
		body: JSON.stringify({
			messages: [
				{ role: 'user', content: '测试' }
			]
		})
	});
	
	const batched = response.headers.get('X-Batched');
	const data = await response.json();
	
	log(`批处理状态: ${batched || 'false'} (应该是 false)`, batched === 'false' || !batched ? 'green' : 'red');
	
	if (batched === 'false' || !batched) {
		log('✓ 测试通过：批处理已正确禁用', 'green');
	} else {
		log('✗ 测试失败：批处理应该被禁用', 'red');
	}
	
	return { passed: batched === 'false' || !batched };
}

async function testDifferentRequestIds() {
	log('\n=== 测试5: 不同 Request ID（不应合并） ===', 'bright');
	
	const promises = [1, 2, 3].map(i => {
		const requestId = `test-different-${Date.now()}-${i}`;
		log(`  [${i}] Request ID: ${requestId}`, 'cyan');
		
		return fetch(WORKER_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Request-Id': requestId,
			},
			body: JSON.stringify({
				messages: [
					{ role: 'user', content: `测试 ${i}` }
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
	
	log('\n结果:', 'bright');
	results.forEach(r => {
		log(`  [${r.i}] 批处理=${r.batched || 'false'}, 批次大小=${r.batchSize || 'N/A'}`, 'cyan');
	});
	
	// 每个请求应该都是独立处理（batchSize=1或没有batched标记）
	const allIndependent = results.every(r => !r.batched || r.batchSize === '1');
	
	if (allIndependent) {
		log('✓ 测试通过：不同 Request ID 的请求独立处理', 'green');
	} else {
		log('✗ 测试失败：不同 Request ID 不应该被合并', 'red');
	}
	
	return { passed: allIndependent, results };
}

// 主测试流程
async function runAllTests() {
	log('========================================', 'bright');
	log('  批处理功能诊断工具', 'bright');
	log('========================================', 'bright');
	log(`\n目标服务器: ${WORKER_URL}`, 'cyan');
	log('批处理窗口: 300ms', 'cyan');
	log('最大批次: 10', 'cyan');
	
	const results = {
		passed: 0,
		failed: 0,
		tests: []
	};
	
	try {
		// 测试1
		const test1 = await testBasicBatching();
		results.tests.push({ name: '基本批处理', ...test1 });
		if (test1.passed) results.passed++; else results.failed++;
		
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		// 测试2
		const test2 = await testSlowRequests();
		results.tests.push({ name: '延迟请求', ...test2 });
		if (test2.passed) results.passed++; else results.failed++;
		
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		// 测试3
		const test3 = await testTooSlowRequests();
		results.tests.push({ name: '过慢请求', ...test3 });
		if (test3.passed) results.passed++; else results.failed++;
		
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		// 测试4
		const test4 = await testDisabledBatching();
		results.tests.push({ name: '禁用批处理', ...test4 });
		if (test4.passed) results.passed++; else results.failed++;
		
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		// 测试5
		const test5 = await testDifferentRequestIds();
		results.tests.push({ name: '不同RequestID', ...test5 });
		if (test5.passed) results.passed++; else results.failed++;
		
	} catch (error) {
		log(`\n✗ 测试过程出错: ${error.message}`, 'red');
		console.error(error);
	}
	
	// 总结
	log('\n========================================', 'bright');
	log('  测试总结', 'bright');
	log('========================================', 'bright');
	log(`通过: ${results.passed}`, 'green');
	log(`失败: ${results.failed}`, results.failed > 0 ? 'red' : 'cyan');
	
	const allPassed = results.failed === 0;
	if (allPassed) {
		log('\n✓ 所有测试通过！批处理功能正常工作。', 'green');
	} else {
		log('\n✗ 部分测试失败，请检查日志。', 'red');
		log('\n故障排查建议:', 'yellow');
		log('1. 确保 Worker 正在运行 (npm run dev)', 'yellow');
		log('2. 检查 src/config.ts 中 batchConfig.enabled = true', 'yellow');
		log('3. 查看 Worker 控制台日志，搜索 [Batch] 前缀', 'yellow');
		log('4. 确认 requestId 正确传递', 'yellow');
	}
}

runAllTests();
