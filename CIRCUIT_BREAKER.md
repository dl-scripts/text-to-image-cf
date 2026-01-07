# 断路器机制说明

## 功能概述

系统现在已集成断路器（Circuit Breaker）机制，用于提高服务的弹性和可靠性。当某个AI provider频繁出错时，断路器会自动将其熔断，避免继续调用失败的服务。

## 工作原理

### 三种状态

1. **CLOSED（关闭）** - 正常状态
   - 所有请求正常通过
   - 记录失败次数

2. **OPEN（断开）** - 熔断状态
   - 拒绝所有请求
   - 在超时时间后转为半开状态

3. **HALF_OPEN（半开）** - 尝试恢复
   - 允许少量请求通过
   - 根据结果决定是关闭还是重新打开

### 配置参数

```typescript
{
  failureThreshold: 3,      // 3次失败后打开断路器
  successThreshold: 2,      // 半开状态下2次成功后关闭断路器
  timeout: 60000,           // 60秒后尝试半开
  resetTime: 120000         // 2分钟时间窗口内的失败计数
}
```

## 使用场景

### 场景1：Provider频繁出错
```
zhipu连续失败3次 → 断路器打开 → 后续请求不再调用zhipu → 自动使用其他provider
```

### 场景2：自动恢复
```
断路器打开60秒后 → 转为半开状态 → 尝试1-2次请求 → 成功则关闭断路器，失败则重新打开
```

### 场景3：所有Provider都不可用
```
系统会使用nim作为最后的fallback，即使nim也被熔断
```

## 日志示例

```
[Circuit Breaker] zhipu failure recorded (1/3)
[Circuit Breaker] zhipu failure recorded (2/3)
[Circuit Breaker] zhipu failure recorded (3/3)
[Circuit Breaker] zhipu OPENED due to failures
[Circuit Breaker] Requested provider zhipu is unavailable, selecting alternative
[Circuit Breaker] zhipu entering HALF_OPEN state
[Circuit Breaker] zhipu success in HALF_OPEN (1/2)
[Circuit Breaker] zhipu success in HALF_OPEN (2/2)
[Circuit Breaker] zhipu recovered to CLOSED state
```

## 与重试机制的配合

1. **第一层防护**：断路器阻止调用已知失败的provider
2. **第二层防护**：5xx错误时使用nim重试
3. **第三层防护**：nim失败时也会被断路器记录

## 文件结构

```
src/
├── circuit-breaker.ts        # 断路器核心逻辑
├── config.ts                 # 集成断路器的provider选择
├── handlers/
│   └── chat.ts              # 记录成功/失败事件
```

## 监控和调试

可以通过以下方式查看断路器状态：

```typescript
import { circuitBreaker } from './circuit-breaker';

// 查看特定provider的状态
const state = circuitBreaker.getState('zhipu');
console.log(state);
// 输出: { state: 'OPEN', failureCount: 3, canExecute: false }

// 获取所有可用的providers
const available = circuitBreaker.getAvailableProviders(['zhipu', 'siliconflow', 'deepseek', 'nim']);
```

## 优势

1. **自动故障隔离**：快速识别并隔离故障的provider
2. **减少延迟**：避免调用已知失败的服务
3. **自动恢复**：系统会自动尝试恢复被熔断的provider
4. **级联保护**：防止单个provider故障影响整个系统
5. **成本优化**：减少对失败服务的无效调用
