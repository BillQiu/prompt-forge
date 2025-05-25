import { AdapterFactory, BaseAdapter } from "../BaseAdapter";

/**
 * 适配器注册表
 * 统一管理所有LLM提供者适配器
 */
export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private factories: Map<string, AdapterFactory> = new Map();

  private constructor() {}

  static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  /**
   * 注册适配器工厂
   */
  register(providerId: string, factory: AdapterFactory): void {
    this.factories.set(providerId, factory);
  }

  /**
   * 获取适配器工厂
   */
  getFactory(providerId: string): AdapterFactory | undefined {
    return this.factories.get(providerId);
  }

  /**
   * 创建适配器实例
   */
  createAdapter(providerId: string): BaseAdapter | undefined {
    const factory = this.getFactory(providerId);
    return factory?.createAdapter();
  }

  /**
   * 获取所有注册的提供者信息
   */
  getAllProviders(): Array<{ id: string; name: string; description?: string }> {
    return Array.from(this.factories.entries()).map(([providerId, factory]) => {
      const providerInfo = factory.getProviderInfo();
      return {
        id: providerId,
        name: providerInfo.name,
        description: providerInfo.description,
      };
    });
  }

  /**
   * 获取所有注册的提供者ID
   */
  getProviderIds(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * 检查提供者是否已注册
   */
  hasProvider(providerId: string): boolean {
    return this.factories.has(providerId);
  }
}

/**
 * 适配器装饰器 - 用于自动注册适配器
 */
export function registerAdapter(providerId: string) {
  return function <T extends new (...args: any[]) => AdapterFactory>(
    constructor: T
  ) {
    const registry = AdapterRegistry.getInstance();
    const factory = new constructor();
    registry.register(providerId, factory);
    return constructor;
  };
}
