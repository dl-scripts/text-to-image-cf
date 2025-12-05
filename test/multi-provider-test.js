// 测试多个AI provider的实现
const API_BASE_URL = 'https://text-to-image-cf.dal.workers.dev'; // 替换为你的Worker域名

// 测试用例
const testCases = [
  {
    name: "测试随机选择provider",
    messages: [
      { role: "user", content: "你好，请介绍一下你自己" }
    ],
    expectedFields: ["provider", "content"]
  },
  {
    name: "测试指定zhipu provider",
    provider: "zhipu",
    messages: [
      { role: "user", content: "你好，请介绍一下你自己" }
    ],
    expectedFields: ["provider", "content"]
  },
  {
    name: "测试指定siliconflow provider",
    provider: "siliconflow",
    messages: [
      { role: "user", content: "你好，请介绍一下你自己" }
    ],
    expectedFields: ["provider", "content"]
  }
];

// 运行测试
async function runTests() {
  console.log('开始测试多个AI provider功能...\n');
  
  for (const testCase of testCases) {
    console.log(`\n运行测试: ${testCase.name}`);
    
    try {
      const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: testCase.messages,
          ...(testCase.provider && { provider: testCase.provider })
        })
      });
      
      if (!response.ok) {
        console.error(`请求失败: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      console.log('响应:', data);
      
      // 检查响应中是否包含预期的字段
      const hasAllFields = testCase.expectedFields.every(field => 
        field in data && data[field] !== undefined
      );
      
      if (hasAllFields) {
        console.log(`✅ 测试通过: ${testCase.name}`);
      } else {
        console.log(`❌ 测试失败: ${testCase.name} - 缺少字段`);
      }
      
      // 检查provider字段是否存在且有效
      if (testCase.provider && data.provider) {
        const validProviders = ['zhipu', 'siliconflow'];
        if (validProviders.includes(data.provider)) {
          console.log(`✅ Provider字段正确: ${data.provider}`);
        } else {
          console.log(`❌ Provider字段无效: ${data.provider}`);
        }
      }
      
    } catch (error) {
      console.error(`测试错误: ${error.message}`);
    }
  }
  
  console.log('\n测试完成!');
}

// 如果直接运行此文件
if (typeof module !== 'undefined' && require.main === module) {
  runTests();
}