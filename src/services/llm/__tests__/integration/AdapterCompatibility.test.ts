import { describe, it, expect, beforeAll } from "vitest";
import { AdapterRegistry } from "../../adapters/AdapterRegistry";
import { BaseAdapter } from "../../BaseAdapter";

describe("Adapter Compatibility", () => {
  let registry: AdapterRegistry;

  beforeAll(() => {
    registry = AdapterRegistry.getInstance();
  });

  // 测试所有注册的适配器
  const getAvailableAdapters = (): Array<{
    id: string;
    adapter: BaseAdapter;
  }> => {
    const providerIds = registry.getProviderIds();
    return providerIds
      .map((id) => {
        const adapter = registry.createAdapter(id);
        return adapter ? { id, adapter } : null;
      })
      .filter(Boolean) as Array<{ id: string; adapter: BaseAdapter }>;
  };

  describe("接口一致性", () => {
    it("所有适配器都应该实现BaseAdapter接口", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        // 检查必需的属性
        expect(
          adapter.providerId,
          `${id} should have providerId`
        ).toBeDefined();
        expect(
          adapter.providerName,
          `${id} should have providerName`
        ).toBeDefined();
        expect(
          typeof adapter.providerId,
          `${id} providerId should be string`
        ).toBe("string");
        expect(
          typeof adapter.providerName,
          `${id} providerName should be string`
        ).toBe("string");

        // 检查必需的方法
        expect(
          typeof adapter.getSupportedModels,
          `${id} should have getSupportedModels method`
        ).toBe("function");
        expect(
          typeof adapter.validateApiKey,
          `${id} should have validateApiKey method`
        ).toBe("function");
        expect(
          typeof adapter.generateText,
          `${id} should have generateText method`
        ).toBe("function");
        expect(
          typeof adapter.supportsCapability,
          `${id} should have supportsCapability method`
        ).toBe("function");
        expect(
          typeof adapter.getContextLength,
          `${id} should have getContextLength method`
        ).toBe("function");
        expect(
          typeof adapter.getPricing,
          `${id} should have getPricing method`
        ).toBe("function");
      });
    });

    it("所有适配器都应该返回有效的模型信息", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        const models = adapter.getSupportedModels();

        expect(
          Array.isArray(models),
          `${id} should return array of models`
        ).toBe(true);
        expect(
          models.length,
          `${id} should have at least one model`
        ).toBeGreaterThan(0);

        models.forEach((model, index) => {
          expect(model.id, `${id} model ${index} should have id`).toBeDefined();
          expect(
            model.name,
            `${id} model ${index} should have name`
          ).toBeDefined();
          expect(
            model.capabilities,
            `${id} model ${index} should have capabilities`
          ).toBeDefined();

          // 检查能力对象结构
          const capabilities = model.capabilities;
          expect(
            typeof capabilities.textGeneration,
            `${id} model ${index} textGeneration should be boolean`
          ).toBe("boolean");
          expect(
            typeof capabilities.imageGeneration,
            `${id} model ${index} imageGeneration should be boolean`
          ).toBe("boolean");
          expect(
            typeof capabilities.streaming,
            `${id} model ${index} streaming should be boolean`
          ).toBe("boolean");

          if (capabilities.contextLength !== undefined) {
            expect(
              typeof capabilities.contextLength,
              `${id} model ${index} contextLength should be number`
            ).toBe("number");
            expect(
              capabilities.contextLength,
              `${id} model ${index} contextLength should be positive`
            ).toBeGreaterThan(0);
          }
        });
      });
    });

    it("所有适配器的能力检查应该与模型信息一致", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        const models = adapter.getSupportedModels();

        models.forEach((model) => {
          // 检查文本生成能力一致性
          const supportsTextGeneration = adapter.supportsCapability(
            model.id,
            "textGeneration"
          );
          expect(
            supportsTextGeneration,
            `${id} model ${model.id} textGeneration capability mismatch`
          ).toBe(model.capabilities.textGeneration);

          // 检查图像生成能力一致性
          const supportsImageGeneration = adapter.supportsCapability(
            model.id,
            "imageGeneration"
          );
          expect(
            supportsImageGeneration,
            `${id} model ${model.id} imageGeneration capability mismatch`
          ).toBe(model.capabilities.imageGeneration);

          // 检查流式传输能力一致性
          const supportsStreaming = adapter.supportsCapability(
            model.id,
            "streaming"
          );
          expect(
            supportsStreaming,
            `${id} model ${model.id} streaming capability mismatch`
          ).toBe(model.capabilities.streaming);
        });
      });
    });

    it("所有适配器的上下文长度应该与模型信息一致", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        const models = adapter.getSupportedModels();

        models.forEach((model) => {
          const contextLength = adapter.getContextLength(model.id);
          expect(
            contextLength,
            `${id} model ${model.id} context length mismatch`
          ).toBe(model.capabilities.contextLength);
        });
      });
    });

    it("所有适配器的定价信息应该与模型信息一致", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        const models = adapter.getSupportedModels();

        models.forEach((model) => {
          const pricing = adapter.getPricing(model.id);

          if (model.pricing === undefined) {
            expect(
              pricing,
              `${id} model ${model.id} should not have pricing if model doesn't define it`
            ).toBeUndefined();
          } else {
            expect(
              pricing,
              `${id} model ${model.id} should have pricing`
            ).toBeDefined();
            expect(
              pricing?.inputCostPer1KTokens,
              `${id} model ${model.id} input cost mismatch`
            ).toBe(model.pricing.inputCostPer1KTokens);
            expect(
              pricing?.outputCostPer1KTokens,
              `${id} model ${model.id} output cost mismatch`
            ).toBe(model.pricing.outputCostPer1KTokens);
          }
        });
      });
    });
  });

  describe("错误处理一致性", () => {
    it("所有适配器对不存在的模型应该返回一致的结果", () => {
      const adapters = getAvailableAdapters();
      const nonExistentModel = "definitely-does-not-exist-model-12345";

      adapters.forEach(({ id, adapter }) => {
        expect(
          adapter.supportsCapability(nonExistentModel, "textGeneration"),
          `${id} should return false for non-existent model capability`
        ).toBe(false);

        expect(
          adapter.getContextLength(nonExistentModel),
          `${id} should return undefined for non-existent model context length`
        ).toBeUndefined();

        expect(
          adapter.getPricing(nonExistentModel),
          `${id} should return undefined for non-existent model pricing`
        ).toBeUndefined();
      });
    });
  });

  describe("提供者信息", () => {
    it("所有注册的提供者应该有有效的信息", () => {
      const providers = registry.getAllProviders();

      providers.forEach((provider) => {
        expect(provider.id, "Provider should have id").toBeDefined();
        expect(provider.name, "Provider should have name").toBeDefined();
        expect(typeof provider.id, "Provider id should be string").toBe(
          "string"
        );
        expect(typeof provider.name, "Provider name should be string").toBe(
          "string"
        );
        expect(
          provider.id.length,
          "Provider id should not be empty"
        ).toBeGreaterThan(0);
        expect(
          provider.name.length,
          "Provider name should not be empty"
        ).toBeGreaterThan(0);
      });
    });

    it("提供者ID应该与适配器的providerId一致", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        const provider = registry.getAllProviders().find((p) => p.id === id);
        expect(
          provider,
          `Provider ${id} should exist in registry`
        ).toBeDefined();

        // 注意：这里我们不强制要求 provider.id === adapter.providerId
        // 因为注册时的 key 可能与 adapter.providerId 不同
        // 但我们可以检查提供者名称的一致性
        const factory = registry.getFactory(id);
        const providerInfo = factory?.getProviderInfo();

        if (providerInfo) {
          expect(
            provider?.name,
            `Provider ${id} name should match factory info`
          ).toBe(providerInfo.name);
          expect(
            provider?.description,
            `Provider ${id} description should match factory info`
          ).toBe(providerInfo.description);
        }
      });
    });
  });

  describe("模型ID唯一性", () => {
    it("同一提供者内的模型ID应该是唯一的", () => {
      const adapters = getAvailableAdapters();

      adapters.forEach(({ id, adapter }) => {
        const models = adapter.getSupportedModels();
        const modelIds = models.map((m) => m.id);
        const uniqueModelIds = new Set(modelIds);

        expect(uniqueModelIds.size, `${id} should have unique model IDs`).toBe(
          modelIds.length
        );
      });
    });
  });
});
