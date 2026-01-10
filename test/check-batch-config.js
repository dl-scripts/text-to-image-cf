#!/usr/bin/env node

// 快速检查批处理配置

const fs = require('fs');
const path = require('path');

console.log('=== 批处理配置检查 ===\n');

// 检查 config.ts
const configPath = path.join(__dirname, '../src/config.ts');
const configContent = fs.readFileSync(configPath, 'utf8');

// 检查 batchConfig
const batchConfigMatch = configContent.match(/export const batchConfig = \{([^}]+)\}/s);
if (batchConfigMatch) {
	console.log('✓ 找到 batchConfig');
	
	const config = batchConfigMatch[1];
	const enabled = config.match(/enabled:\s*(true|false)/);
	const delay = config.match(/delay:\s*(\d+)/);
	const maxBatchSize = config.match(/maxBatchSize:\s*(\d+)/);
	
	console.log('\n当前配置:');
	console.log(`  enabled: ${enabled ? enabled[1] : '未找到'} ${enabled && enabled[1] === 'true' ? '✓' : '✗ 应该是 true'}`);
	console.log(`  delay: ${delay ? delay[1] + 'ms' : '未找到'}`);
	console.log(`  maxBatchSize: ${maxBatchSize ? maxBatchSize[1] : '未找到'}`);
	
	if (enabled && enabled[1] === 'false') {
		console.log('\n⚠️  警告: 批处理已禁用！');
		console.log('   要启用批处理，请修改 src/config.ts:');
		console.log('   enabled: true');
	}
} else {
	console.log('✗ 未找到 batchConfig');
}

// 检查 CORS headers
const corsMatch = configContent.match(/export const corsHeaders = \{([^}]+)\}/s);
if (corsMatch) {
	console.log('\n✓ 找到 corsHeaders');
	
	const cors = corsMatch[1];
	const exposeHeaders = cors.match(/Access-Control-Expose-Headers['"`]?\s*:\s*['"`]([^'"`]+)['"`]/);
	
	if (exposeHeaders) {
		const headers = exposeHeaders[1].split(',').map(h => h.trim());
		console.log('\n暴露的响应头:');
		headers.forEach(h => {
			console.log(`  - ${h}`);
		});
		
		const hasXBatched = headers.includes('X-Batched');
		const hasXBatchSize = headers.includes('X-Batch-Size');
		
		if (!hasXBatched || !hasXBatchSize) {
			console.log('\n⚠️  警告: 缺少批处理相关的响应头暴露');
			console.log('   建议添加: X-Batched, X-Batch-Size');
		}
	} else {
		console.log('\n⚠️  警告: 未设置 Access-Control-Expose-Headers');
		console.log('   浏览器可能无法读取批处理标记');
	}
}

// 检查 request-batcher.ts 是否存在
const batcherPath = path.join(__dirname, '../src/request-batcher.ts');
if (fs.existsSync(batcherPath)) {
	console.log('\n✓ request-batcher.ts 存在');
	
	const batcherContent = fs.readFileSync(batcherPath, 'utf8');
	
	// 检查关键方法
	const hasAddRequest = batcherContent.includes('addRequest');
	const hasProcessBatch = batcherContent.includes('processBatch');
	
	console.log(`  - addRequest 方法: ${hasAddRequest ? '✓' : '✗'}`);
	console.log(`  - processBatch 方法: ${hasProcessBatch ? '✓' : '✗'}`);
	
	// 检查是否有调试日志
	const hasDebugLogs = batcherContent.includes('[Batch]');
	console.log(`  - 调试日志: ${hasDebugLogs ? '✓' : '✗ 建议添加'}`);
} else {
	console.log('\n✗ request-batcher.ts 不存在');
}

// 检查 index.ts 是否导入了 requestBatcher
const indexPath = path.join(__dirname, '../src/index.ts');
if (fs.existsSync(indexPath)) {
	const indexContent = fs.readFileSync(indexPath, 'utf8');
	
	const hasImport = indexContent.includes('import') && indexContent.includes('requestBatcher');
	const hasUsage = indexContent.includes('requestBatcher.addRequest');
	
	console.log('\nindex.ts 集成:');
	console.log(`  - 导入 requestBatcher: ${hasImport ? '✓' : '✗'}`);
	console.log(`  - 使用 addRequest: ${hasUsage ? '✓' : '✗'}`);
	
	if (!hasImport || !hasUsage) {
		console.log('\n⚠️  警告: index.ts 可能没有正确集成批处理器');
	}
}

// 总结
console.log('\n=== 检查完成 ===');
console.log('\n下一步:');
console.log('1. 运行 npm run dev 启动服务');
console.log('2. 运行 npm run test:diagnostic 测试批处理');
console.log('3. 查看日志中的 [Batch] 标记');
