import { describe, it, expect, beforeEach } from "vitest";
import { AdapterRegistry } from "../../adapters/AdapterRegistry";
import { AdapterFactory, BaseAdapter } from "../../BaseAdapter";
import { TEST_MODELS } from "../fixtures/testModels";

// Mock适配器实现
class MockTestAdapter implements BaseAdapter {
  readonly providerId = "mock-test";
  readonly providerName = "Mock Test Provider";
  readonly description = "Mock adapter for testing registry";

  getSupportedModels() {
    return Object.values(TEST_MODELS);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    return apiKey === "valid";
  }

  async generateText() {
    return {
      content: "Mock response",
      metadata: { model: "test-model" },
    };
  }

  supportsCapability(): boolean {
    return true;
  }

  getContextLength(): number | undefined {
    return 4096;
  }

  getPricing() {
    return {
      inputCostPer1KTokens: 0.001,
      outputCostPer1KTokens: 0.002,
    };
  }
}

class MockTestAdapterFactory implements AdapterFactory {
  createAdapter(): BaseAdapter {
    return new MockTestAdapter();
  }

  getProviderInfo() {
    return {
      id: "mock-test",
      name: "Mock Test Provider",
      description: "Mock adapter for testing registry",
    };
  }
}

describe("AdapterRegistry", () => {
  let registry: AdapterRegistry;
  let factory: MockTestAdapterFactory;

  beforeEach(() => {
    // 为测试创建新的实例
    (AdapterRegistry as any).instance = undefined;
    registry = AdapterRegistry.getInstance();
    factory = new MockTestAdapterFactory();
  });

  describe("单例模式", () => {
    it("应该返回同一个实例", () => {
      const instance1 = AdapterRegistry.getInstance();
      const instance2 = AdapterRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("适配器注册", () => {
    it("应该成功注册适配器工厂", () => {
      registry.register("test-provider", factory);
      expect(registry.hasProvider("test-provider")).toBe(true);
    });

    it("应该返回注册的工厂", () => {
      registry.register("test-provider", factory);
      const retrievedFactory = registry.getFactory("test-provider");
      expect(retrievedFactory).toBe(factory);
    });

    it("应该对未注册的提供者返回undefined", () => {
      const nonexistentFactory = registry.getFactory("nonexistent");
      expect(nonexistentFactory).toBeUndefined();
    });
  });

  describe("适配器创建", () => {
    beforeEach(() => {
      registry.register("test-provider", factory);
    });

    it("应该创建适配器实例", () => {
      const adapter = registry.createAdapter("test-provider");
      expect(adapter).toBeInstanceOf(MockTestAdapter);
      expect(adapter?.providerId).toBe("mock-test");
    });

    it("应该对未注册的提供者返回undefined", () => {
      const adapter = registry.createAdapter("nonexistent");
      expect(adapter).toBeUndefined();
    });
  });

  describe("提供者信息管理", () => {
    beforeEach(() => {
      registry.register("test-provider-1", factory);
      registry.register("test-provider-2", new MockTestAdapterFactory());
    });

    it("应该返回所有注册的提供者信息", () => {
      const providers = registry.getAllProviders();
      expect(providers).toHaveLength(2);

      const provider = providers.find((p) => p.id === "test-provider-1");
      expect(provider).toBeDefined();
      expect(provider?.name).toBe("Mock Test Provider");
      expect(provider?.description).toBe("Mock adapter for testing registry");
    });

    it("应该返回所有提供者ID", () => {
      const providerIds = registry.getProviderIds();
      expect(providerIds).toContain("test-provider-1");
      expect(providerIds).toContain("test-provider-2");
      expect(providerIds).toHaveLength(2);
    });

    it("应该检查提供者是否存在", () => {
      expect(registry.hasProvider("test-provider-1")).toBe(true);
      expect(registry.hasProvider("nonexistent")).toBe(false);
    });
  });

  describe("边界情况", () => {
    it("应该处理空的注册表", () => {
      expect(registry.getAllProviders()).toHaveLength(0);
      expect(registry.getProviderIds()).toHaveLength(0);
      expect(registry.hasProvider("any")).toBe(false);
    });

    it("应该允许覆盖已注册的提供者", () => {
      registry.register("test-provider", factory);

      const newFactory = new MockTestAdapterFactory();
      registry.register("test-provider", newFactory);

      const retrievedFactory = registry.getFactory("test-provider");
      expect(retrievedFactory).toBe(newFactory);
    });
  });
});
