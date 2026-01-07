import { AIProvider } from './types';

// 断路器状态
enum CircuitState {
	CLOSED = 'CLOSED',       // 正常状态，允许请求
	OPEN = 'OPEN',           // 断开状态，拒绝请求
	HALF_OPEN = 'HALF_OPEN'  // 半开状态，尝试恢复
}

interface CircuitBreakerConfig {
	failureThreshold: number;      // 失败阈值
	successThreshold: number;      // 成功恢复阈值
	timeout: number;               // 断路器打开后多久尝试恢复（毫秒）
	resetTime: number;             // 重置错误计数的时间窗口（毫秒）
}

interface ProviderCircuit {
	state: CircuitState;
	failureCount: number;
	successCount: number;
	lastFailureTime: number;
	openedAt: number;
	firstFailureTime: number;
}

// 默认配置
const DEFAULT_CONFIG: CircuitBreakerConfig = {
	failureThreshold: 3,      // 3次失败后打开断路器
	successThreshold: 2,      // 2次成功后关闭断路器
	timeout: 60000,           // 60秒后尝试半开
	resetTime: 120000         // 2分钟内的失败计数
};

class CircuitBreakerManager {
	private circuits: Map<AIProvider, ProviderCircuit>;
	private config: CircuitBreakerConfig;

	constructor(config: Partial<CircuitBreakerConfig> = {}) {
		this.circuits = new Map();
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	// 获取或创建provider的断路器
	private getCircuit(provider: AIProvider): ProviderCircuit {
		if (!this.circuits.has(provider)) {
			this.circuits.set(provider, {
				state: CircuitState.CLOSED,
				failureCount: 0,
				successCount: 0,
				lastFailureTime: 0,
				openedAt: 0,
				firstFailureTime: 0
			});
		}
		return this.circuits.get(provider)!;
	}

	// 检查provider是否可用
	canExecute(provider: AIProvider): boolean {
		const circuit = this.getCircuit(provider);
		const now = Date.now();

		switch (circuit.state) {
			case CircuitState.CLOSED:
				return true;

			case CircuitState.OPEN:
				// 检查是否超过超时时间，如果是则转为半开状态
				if (now - circuit.openedAt >= this.config.timeout) {
					circuit.state = CircuitState.HALF_OPEN;
					circuit.successCount = 0;
					console.log(`[Circuit Breaker] ${provider} entering HALF_OPEN state`);
					return true;
				}
				return false;

			case CircuitState.HALF_OPEN:
				return true;

			default:
				return true;
		}
	}

	// 记录成功调用
	recordSuccess(provider: AIProvider): void {
		const circuit = this.getCircuit(provider);

		if (circuit.state === CircuitState.HALF_OPEN) {
			circuit.successCount++;
			console.log(`[Circuit Breaker] ${provider} success in HALF_OPEN (${circuit.successCount}/${this.config.successThreshold})`);
			
			if (circuit.successCount >= this.config.successThreshold) {
				this.reset(provider);
				console.log(`[Circuit Breaker] ${provider} recovered to CLOSED state`);
			}
		} else if (circuit.state === CircuitState.CLOSED) {
			// 在关闭状态下成功，重置失败计数
			circuit.failureCount = 0;
			circuit.firstFailureTime = 0;
		}
	}

	// 记录失败调用
	recordFailure(provider: AIProvider, error: any): void {
		const circuit = this.getCircuit(provider);
		const now = Date.now();

		circuit.lastFailureTime = now;

		// 检查是否需要重置计数器（超出时间窗口）
		if (circuit.firstFailureTime === 0) {
			circuit.firstFailureTime = now;
		} else if (now - circuit.firstFailureTime > this.config.resetTime) {
			// 超出时间窗口，重置计数
			circuit.failureCount = 1;
			circuit.firstFailureTime = now;
			console.log(`[Circuit Breaker] ${provider} failure count reset due to time window`);
			return;
		}

		circuit.failureCount++;
		console.log(`[Circuit Breaker] ${provider} failure recorded (${circuit.failureCount}/${this.config.failureThreshold})`);

		if (circuit.state === CircuitState.HALF_OPEN) {
			// 半开状态失败，立即打开
			this.open(provider);
		} else if (circuit.state === CircuitState.CLOSED) {
			// 关闭状态下达到阈值，打开断路器
			if (circuit.failureCount >= this.config.failureThreshold) {
				this.open(provider);
			}
		}
	}

	// 打开断路器
	private open(provider: AIProvider): void {
		const circuit = this.getCircuit(provider);
		circuit.state = CircuitState.OPEN;
		circuit.openedAt = Date.now();
		console.log(`[Circuit Breaker] ${provider} OPENED due to failures`);
	}

	// 重置断路器
	private reset(provider: AIProvider): void {
		const circuit = this.getCircuit(provider);
		circuit.state = CircuitState.CLOSED;
		circuit.failureCount = 0;
		circuit.successCount = 0;
		circuit.firstFailureTime = 0;
		circuit.lastFailureTime = 0;
		circuit.openedAt = 0;
	}

	// 获取provider状态（用于调试）
	getState(provider: AIProvider): { state: string; failureCount: number; canExecute: boolean } {
		const circuit = this.getCircuit(provider);
		return {
			state: circuit.state,
			failureCount: circuit.failureCount,
			canExecute: this.canExecute(provider)
		};
	}

	// 获取所有可用的providers
	getAvailableProviders(providers: AIProvider[]): AIProvider[] {
		return providers.filter(p => this.canExecute(p));
	}
}

// 导出单例实例
export const circuitBreaker = new CircuitBreakerManager();
