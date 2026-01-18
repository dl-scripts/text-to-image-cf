/**
 * 测试 JSON Schema response_format 功能
 * 这个测试验证智谱AI是否正确处理response_format参数
 */

const testRequest = {
	"model": "google/gemini-2.5-flash",
	"temperature": 0.3,
	"top_p": 0.513,
	"stream": false,
	"response_format": {
		"type": "json_schema",
		"json_schema": {
			"name": "navigator_output",
			"schema": {
				"type": "object",
				"properties": {
					"current_state": {
						"type": "object",
						"properties": {
							"evaluation_previous_goal": {
								"type": "string",
								"title": "Evaluation Previous Goal"
							},
							"memory": {
								"type": "string",
								"title": "Memory"
							},
							"next_goal": {
								"type": "string",
								"title": "Next Goal"
							}
						},
						"required": ["evaluation_previous_goal", "memory", "next_goal"],
						"description": "Current state of the agent",
						"title": "Current State"
					},
					"action": {
						"type": "array",
						"items": {
							"type": "object",
							"properties": {
								"done": {
									"type": "object",
									"properties": {
										"text": {
											"type": "string",
											"title": "Text"
										},
										"success": {
											"type": "boolean",
											"title": "Success"
										}
									},
									"required": ["text", "success"],
									"nullable": true,
									"description": "Complete task",
									"title": "Done"
								}
							}
						},
						"title": "Action"
					}
				},
				"required": ["current_state", "action"],
				"title": "NavigatorAgentOutput"
			}
		}
	},
	"max_tokens": 4096,
	"messages": [
		{
			"role": "system",
			"content": "You are a helpful assistant that returns structured JSON responses."
		},
		{
			"role": "user",
			"content": "Please analyze the task and return your response in the specified JSON format."
		}
	],
	"provider": "zhipu"  // 明确指定使用智谱AI
};

async function testJSONSchema() {
	try {
		console.log('发送测试请求...');
		console.log('Request:', JSON.stringify(testRequest, null, 2));

		const response = await fetch('http://localhost:8787/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(testRequest)
		});

		const data = await response.json();
		
		console.log('\n响应状态:', response.status);
		console.log('Provider:', response.headers.get('X-AI-Provider'));
		console.log('Retried:', response.headers.get('X-Retried'));
		
		console.log('\n完整响应:');
		console.log(JSON.stringify(data, null, 2));

		if (data.choices && data.choices[0] && data.choices[0].message) {
			console.log('\n返回的内容:');
			console.log(data.choices[0].message.content);

			// 尝试解析为JSON以验证格式
			try {
				const parsed = JSON.parse(data.choices[0].message.content);
				console.log('\n✅ 成功解析为JSON！');
				console.log('解析后的结构:', JSON.stringify(parsed, null, 2));
			} catch (e) {
				console.log('\n❌ 无法解析为JSON');
			}
		}

	} catch (error) {
		console.error('测试失败:', error);
	}
}

// 运行测试
testJSONSchema();
