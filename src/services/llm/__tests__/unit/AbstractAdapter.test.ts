import { describe, it, expect, beforeEach } from "vitest";
import {
  AbstractAdapter,
  MessageBuilder,
  StreamHandler,
  ErrorHandler,
  ModelRegistry,
} from "../../adapters/AbstractAdapter";
import {
  ModelInfo,
  LLMAdapterError,
  TextGenerationOptions,
  ImageGenerationOptions,
} from "../../BaseAdapter";
import { TEST_MODELS } from "../fixtures/testModels";

// 创建测试用的具体适配器实现
class TestAdapter extends AbstractAdapter {
  readonly providerId = "test";
  readonly providerName = "Test Provider";
  readonly description = "Test adapter for unit testing";

  async validateApiKey(apiKey: string): Promise<boolean> {
    return apiKey === "valid-key";
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ) {
    this.validateApiKeyPresent(apiKey);
    this.validateTextGenerationCapability(options.model);

    return {
      content: `Mock response to: ${prompt}`,
      metadata: {
        model: options.model,
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
      },
    };
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ) {
    this.validateApiKeyPresent(apiKey);
    this.validateImageGenerationCapability(options.model);

    return [
      {
        url: "https://example.com/test-image.png",
        metadata: {
          model: options.model,
          prompt,
          finishReason: "stop",
        },
      },
    ];
  }
}

describe("AbstractAdapter", () => {
  let adapter: TestAdapter;
  const testModels = Object.values(TEST_MODELS);

  beforeEach(() => {
    adapter = new TestAdapter(testModels);
  });

  describe("模型管理", () => {
    it("应该返回所有支持的模型", () => {
      const models = adapter.getSupportedModels();
      expect(models).toHaveLength(testModels.length);
      expect(models).toEqual(testModels);
    });

    it("应该正确检查模型能力", () => {
      expect(
        adapter.supportsCapability("test-text-model", "textGeneration")
      ).toBe(true);
      expect(
        adapter.supportsCapability("test-text-model", "imageGeneration")
      ).toBe(false);
      expect(
        adapter.supportsCapability("test-image-model", "imageGeneration")
      ).toBe(true);
      expect(
        adapter.supportsCapability("test-image-model", "textGeneration")
      ).toBe(false);
    });

    it("应该返回正确的上下文长度", () => {
      expect(adapter.getContextLength("test-text-model")).toBe(4096);
      expect(adapter.getContextLength("nonexistent-model")).toBeUndefined();
    });

    it("应该返回正确的定价信息", () => {
      const pricing = adapter.getPricing("test-text-model");
      expect(pricing).toEqual({
        inputCostPer1KTokens: 0.001,
        outputCostPer1KTokens: 0.002,
      });
    });
  });

  describe("验证方法", () => {
    it("应该验证API密钥存在", () => {
      expect(() => adapter["validateApiKeyPresent"]("")).toThrow(
        LLMAdapterError
      );
      expect(() => adapter["validateApiKeyPresent"]("valid-key")).not.toThrow();
    });

    it("应该验证文本生成能力", () => {
      expect(() =>
        adapter["validateTextGenerationCapability"]("test-text-model")
      ).not.toThrow();
      expect(() =>
        adapter["validateTextGenerationCapability"]("test-image-model")
      ).toThrow(LLMAdapterError);
    });

    it("应该验证图像生成能力", () => {
      expect(() =>
        adapter["validateImageGenerationCapability"]("test-image-model")
      ).not.toThrow();
      expect(() =>
        adapter["validateImageGenerationCapability"]("test-text-model")
      ).toThrow(LLMAdapterError);
    });
  });

  describe("接口实现", () => {
    it("应该实现generateText方法", async () => {
      const result = await adapter.generateText(
        "Hello",
        {
          model: "test-text-model",
        },
        "valid-key"
      );

      expect(result).toHaveProperty("content");
      expect(result).toHaveProperty("metadata");
    });

    it("应该实现generateImage方法", async () => {
      const result = await adapter.generateImage(
        "Test image",
        {
          model: "test-image-model",
        },
        "valid-key"
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toHaveProperty("url");
      expect(result[0]).toHaveProperty("metadata");
    });
  });
});

describe("MessageBuilder", () => {
  let builder: MessageBuilder;

  beforeEach(() => {
    builder = new MessageBuilder();
  });

  it("应该构建基本用户消息", () => {
    const messages = builder.addUserMessage("Hello").build();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      role: "user",
      content: "Hello",
    });
  });

  it("应该构建完整的消息链", () => {
    const messages = builder
      .addSystemPrompt("You are a helpful assistant")
      .addContext("Previous conversation context")
      .addUserMessage("Hello")
      .build();

    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual({
      role: "system",
      content: "You are a helpful assistant",
    });
    expect(messages[1]).toEqual({
      role: "assistant",
      content: "Previous conversation context",
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: "Hello",
    });
  });

  it("应该跳过空的系统提示和上下文", () => {
    const messages = builder
      .addSystemPrompt("")
      .addContext("")
      .addUserMessage("Hello")
      .build();

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
  });
});

describe("ModelRegistry", () => {
  let registry: ModelRegistry;
  const testModels = Object.values(TEST_MODELS);

  beforeEach(() => {
    registry = new ModelRegistry(testModels);
  });

  it("应该返回所有模型", () => {
    const models = registry.getAllModels();
    expect(models).toHaveLength(testModels.length);
  });

  it("应该根据ID查找模型", () => {
    const model = registry.findModel("test-text-model");
    expect(model).toBeDefined();
    expect(model?.id).toBe("test-text-model");

    const nonexistent = registry.findModel("nonexistent");
    expect(nonexistent).toBeUndefined();
  });

  it("应该检查模型能力", () => {
    expect(
      registry.supportsCapability("test-text-model", "textGeneration")
    ).toBe(true);
    expect(
      registry.supportsCapability("test-text-model", "imageGeneration")
    ).toBe(false);
    expect(registry.supportsCapability("nonexistent", "textGeneration")).toBe(
      false
    );
  });
});

describe("ErrorHandler", () => {
  it("应该处理HTTP状态错误", () => {
    const error = {
      response: { status: 401 },
      message: "Unauthorized",
    };

    const handled = ErrorHandler.handleAPIError(error, "TestProvider");
    expect(handled).toBeInstanceOf(LLMAdapterError);
    expect(handled.code).toBe("INVALID_API_KEY");
    expect(handled.statusCode).toBe(401);
  });

  it("应该处理网络错误", () => {
    const error = {
      code: "ECONNREFUSED",
      message: "Connection refused",
    };

    const handled = ErrorHandler.handleAPIError(error, "TestProvider");
    expect(handled.code).toBe("NETWORK_ERROR");
    expect(handled.message).toContain("TestProvider");
  });

  it("应该处理超时错误", () => {
    const error = {
      code: "ETIMEDOUT",
      message: "Request timeout",
    };

    const handled = ErrorHandler.handleAPIError(error, "TestProvider");
    expect(handled.code).toBe("TIMEOUT_ERROR");
  });

  it("应该传递已知的LLMAdapterError", () => {
    const originalError = new LLMAdapterError("Original error", "CUSTOM_CODE");
    const handled = ErrorHandler.handleAPIError(originalError, "TestProvider");
    expect(handled).toBe(originalError);
  });
});
