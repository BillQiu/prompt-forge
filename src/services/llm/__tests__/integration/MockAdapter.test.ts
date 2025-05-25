import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockAdapter, MockAdapterConfig } from "../../adapters/MockAdapter";
import {
  TextGenerationOptions,
  ImageGenerationOptions,
  LLMAdapterError,
} from "../../BaseAdapter";
import { MOCK_API_KEYS, TEST_PROMPTS } from "../fixtures/testModels";

describe("MockAdapter Integration", () => {
  let adapter: MockAdapter;

  beforeEach(() => {
    adapter = new MockAdapter();
  });

  describe("基本功能", () => {
    it("应该提供正确的提供者信息", () => {
      expect(adapter.providerId).toBe("mock");
      expect(adapter.providerName).toBe("Mock Provider");
      expect(adapter.description).toBe(
        "Mock adapter for testing and development"
      );
    });

    it("应该返回支持的模型列表", () => {
      const models = adapter.getSupportedModels();
      expect(models.length).toBeGreaterThan(0);

      const gptModel = models.find((m) => m.id === "mock-gpt-4");
      expect(gptModel).toBeDefined();
      expect(gptModel?.capabilities.textGeneration).toBe(true);
    });

    it("应该正确检查模型能力", () => {
      expect(adapter.supportsCapability("mock-gpt-4", "textGeneration")).toBe(
        true
      );
      expect(adapter.supportsCapability("mock-gpt-4", "imageGeneration")).toBe(
        false
      );
      expect(
        adapter.supportsCapability("mock-dall-e-3", "imageGeneration")
      ).toBe(true);
    });
  });

  describe("API密钥验证", () => {
    it("应该接受有效的API密钥", async () => {
      const isValid = await adapter.validateApiKey(MOCK_API_KEYS.valid);
      expect(isValid).toBe(true);
    });

    it("应该拒绝空的API密钥", async () => {
      const isValid = await adapter.validateApiKey(MOCK_API_KEYS.empty);
      expect(isValid).toBe(false);
    });

    it("应该在错误模式下返回false", async () => {
      adapter.setErrorMode("auth");
      const isValid = await adapter.validateApiKey(MOCK_API_KEYS.valid);
      expect(isValid).toBe(false);
    });
  });

  describe("文本生成", () => {
    it("应该生成非流式文本响应", async () => {
      const options: TextGenerationOptions = {
        model: "mock-gpt-4",
        temperature: 0.7,
        maxTokens: 100,
      };

      const response = await adapter.generateText(
        TEST_PROMPTS.simple,
        options,
        MOCK_API_KEYS.valid
      );

      expect(response).toHaveProperty("content");
      expect(response).toHaveProperty("metadata");

      if ("content" in response) {
        expect(response.content).toContain("GPT");
        expect(response.metadata?.model).toBe("mock-gpt-4");
        expect(response.metadata?.usage).toBeDefined();
      }
    });

    it("应该生成流式文本响应", async () => {
      const options: TextGenerationOptions = {
        model: "mock-gpt-4",
        stream: true,
      };

      const response = await adapter.generateText(
        TEST_PROMPTS.simple,
        options,
        MOCK_API_KEYS.valid
      );

      expect(response).toBeInstanceOf(ReadableStream);

      if (response instanceof ReadableStream) {
        const reader = response.getReader();
        const chunks = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }

        expect(chunks.length).toBeGreaterThan(0);
        const lastChunk = chunks[chunks.length - 1];
        expect(lastChunk.isComplete).toBe(true);
      }
    });

    it("应该根据模型类型生成不同风格的响应", async () => {
      const claudeResponse = await adapter.generateText(
        TEST_PROMPTS.simple,
        { model: "mock-claude-3" },
        MOCK_API_KEYS.valid
      );

      if ("content" in claudeResponse) {
        expect(claudeResponse.content).toContain("Claude");
      }
    });

    it("应该在错误模式下抛出异常", async () => {
      adapter.setErrorMode("network");

      await expect(
        adapter.generateText(
          TEST_PROMPTS.simple,
          { model: "mock-gpt-4" },
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow(LLMAdapterError);
    });
  });

  describe("图像生成", () => {
    it("应该生成图像响应", async () => {
      const options: ImageGenerationOptions = {
        model: "mock-dall-e-3",
        size: "1024x1024",
        n: 2,
      };

      const response = await adapter.generateImage(
        "A beautiful sunset",
        options,
        MOCK_API_KEYS.valid
      );

      expect(Array.isArray(response)).toBe(true);
      expect(response).toHaveLength(2);
      expect(response[0]).toHaveProperty("url");
      expect(response[0]).toHaveProperty("metadata");
      expect(response[0].metadata?.model).toBe("mock-dall-e-3");
    });

    it("应该在错误模式下抛出异常", async () => {
      adapter.setErrorMode("server_error");

      await expect(
        adapter.generateImage(
          "Test image",
          { model: "mock-dall-e-3" },
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow(LLMAdapterError);
    });
  });

  describe("配置管理", () => {
    it("应该允许更新配置", () => {
      const newConfig: Partial<MockAdapterConfig> = {
        delay: 500,
        customResponse: "Custom test response",
        verbose: true,
      };

      adapter.updateConfig(newConfig);
      const config = adapter.getConfig();

      expect(config.delay).toBe(500);
      expect(config.customResponse).toBe("Custom test response");
      expect(config.verbose).toBe(true);
    });

    it("应该使用自定义响应", async () => {
      const customResponse = "This is a custom response for testing";
      adapter.updateConfig({ customResponse });

      const response = await adapter.generateText(
        TEST_PROMPTS.simple,
        { model: "mock-gpt-4" },
        MOCK_API_KEYS.valid
      );

      if ("content" in response) {
        expect(response.content).toBe(customResponse);
      }
    });

    it("应该支持快速模式", async () => {
      adapter.setFastMode();
      const config = adapter.getConfig();

      expect(config.delay).toBe(0);
      expect(config.simulateError).toBe(false);
      expect(config.verbose).toBe(false);
    });

    it("应该支持重置配置", () => {
      adapter.updateConfig({ delay: 500, verbose: true });
      adapter.reset();

      const config = adapter.getConfig();
      expect(config.delay).toBe(100);
      expect(config.verbose).toBe(false);
    });
  });

  describe("错误模拟", () => {
    it("应该模拟网络错误", async () => {
      adapter.setErrorMode("network");

      await expect(
        adapter.generateText(
          TEST_PROMPTS.simple,
          { model: "mock-gpt-4" },
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow("Mock network error");
    });

    it("应该模拟认证错误", async () => {
      adapter.setErrorMode("auth");

      await expect(
        adapter.generateText(
          TEST_PROMPTS.simple,
          { model: "mock-gpt-4" },
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow("Mock authentication error");
    });

    it("应该模拟速率限制错误", async () => {
      adapter.setErrorMode("rate_limit");

      await expect(
        adapter.generateText(
          TEST_PROMPTS.simple,
          { model: "mock-gpt-4" },
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow("Mock rate limit error");
    });
  });

  describe("性能测试", () => {
    it("应该在指定延迟内完成响应", async () => {
      const delay = 50;
      adapter.updateConfig({ delay });

      const startTime = Date.now();
      await adapter.generateText(
        TEST_PROMPTS.simple,
        { model: "mock-fast-model" },
        MOCK_API_KEYS.valid
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(delay);
    });

    it("应该在快速模式下立即响应", async () => {
      adapter.setFastMode();

      const startTime = Date.now();
      await adapter.generateText(
        TEST_PROMPTS.simple,
        { model: "mock-fast-model" },
        MOCK_API_KEYS.valid
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // 应该在50ms内完成
    });
  });

  describe("验证功能", () => {
    it("应该验证API密钥存在", async () => {
      await expect(
        adapter.generateText(TEST_PROMPTS.simple, { model: "mock-gpt-4" }, "")
      ).rejects.toThrow("API key is required");
    });

    it("应该验证模型能力", async () => {
      await expect(
        adapter.generateText(
          TEST_PROMPTS.simple,
          { model: "mock-dall-e-3" }, // 这个模型不支持文本生成
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow("does not support text generation");

      await expect(
        adapter.generateImage(
          "Test image",
          { model: "mock-gpt-4" }, // 这个模型不支持图像生成
          MOCK_API_KEYS.valid
        )
      ).rejects.toThrow("does not support image generation");
    });
  });
});
