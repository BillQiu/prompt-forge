import {
  TextGenerationOptions,
  ImageGenerationOptions,
  TextResponse,
  ImageResponse,
  StreamChunk,
  ModelInfo,
  LLMAdapterError,
  AdapterFactory,
} from "../BaseAdapter";
import { AbstractAdapter, StreamHandler } from "./AbstractAdapter";
import { AdapterRegistry } from "./AdapterRegistry";

/**
 * Mock 适配器配置选项
 */
export interface MockAdapterConfig {
  /** 模拟延迟（毫秒） */
  delay?: number;
  /** 是否模拟错误 */
  simulateError?: boolean;
  /** 错误类型 */
  errorType?: "network" | "auth" | "rate_limit" | "server_error";
  /** 自定义响应内容 */
  customResponse?: string;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

/**
 * Mock 适配器，用于测试和开发
 * 支持可配置的模拟行为
 */
export class MockAdapter extends AbstractAdapter {
  readonly providerId = "mock";
  readonly providerName = "Mock Provider";
  readonly description = "Mock adapter for testing and development";

  private static readonly MODELS: ModelInfo[] = [
    {
      id: "mock-gpt-4",
      name: "Mock GPT-4",
      description: "Mock version of GPT-4 for testing",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
      pricing: {
        inputCostPer1KTokens: 0.01,
        outputCostPer1KTokens: 0.03,
      },
    },
    {
      id: "mock-claude-3",
      name: "Mock Claude 3",
      description: "Mock version of Claude 3 for testing",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.003,
        outputCostPer1KTokens: 0.015,
      },
    },
    {
      id: "mock-dall-e-3",
      name: "Mock DALL-E 3",
      description: "Mock version of DALL-E 3 for testing",
      capabilities: {
        textGeneration: false,
        imageGeneration: true,
        streaming: false,
        contextLength: 4000,
      },
      pricing: {
        inputCostPer1KTokens: 0.04,
        outputCostPer1KTokens: 0.04,
      },
    },
    {
      id: "mock-fast-model",
      name: "Mock Fast Model",
      description: "Fast mock model for testing",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 8000,
      },
      pricing: {
        inputCostPer1KTokens: 0.001,
        outputCostPer1KTokens: 0.002,
      },
    },
  ];

  private config: MockAdapterConfig;

  constructor(config: MockAdapterConfig = {}) {
    super(MockAdapter.MODELS);
    this.config = {
      delay: 100,
      simulateError: false,
      errorType: "network",
      customResponse: "",
      verbose: false,
      ...config,
    };
  }

  /**
   * 更新Mock配置
   */
  updateConfig(config: Partial<MockAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.verbose) {
      console.log("MockAdapter配置更新:", this.config);
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): MockAdapterConfig {
    return { ...this.config };
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    // 模拟验证延迟
    await this.simulateDelay();

    if (this.config.simulateError && this.config.errorType === "auth") {
      return false;
    }

    // Mock适配器接受任何非空字符串作为有效API密钥
    return typeof apiKey === "string" && apiKey.length > 0;
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>> {
    try {
      // 使用基类验证
      this.validateApiKeyPresent(apiKey);
      this.validateTextGenerationCapability(options.model);

      // 模拟错误
      if (this.config.simulateError) {
        await this.simulateDelay();
        throw this.createMockError();
      }

      // 日志记录
      if (this.config.verbose) {
        console.log("MockAdapter generateText:", {
          prompt: prompt.slice(0, 100) + (prompt.length > 100 ? "..." : ""),
          model: options.model,
          stream: options.stream,
        });
      }

      // 生成mock响应
      const mockContent = this.generateMockContent(prompt, options);

      if (options.stream) {
        return this.createMockStream(mockContent, options.model);
      } else {
        // 模拟延迟
        await this.simulateDelay();

        return {
          content: mockContent,
          metadata: {
            model: options.model,
            usage: {
              promptTokens: this.estimateTokens(prompt),
              completionTokens: this.estimateTokens(mockContent),
              totalTokens: this.estimateTokens(prompt + mockContent),
            },
            finishReason: "stop",
          },
        };
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    try {
      // 使用基类验证
      this.validateApiKeyPresent(apiKey);
      this.validateImageGenerationCapability(options.model);

      // 模拟错误
      if (this.config.simulateError) {
        await this.simulateDelay();
        throw this.createMockError();
      }

      // 日志记录
      if (this.config.verbose) {
        console.log("MockAdapter generateImage:", {
          prompt: prompt.slice(0, 100) + (prompt.length > 100 ? "..." : ""),
          model: options.model,
        });
      }

      // 模拟延迟
      await this.simulateDelay(this.config.delay! * 3); // 图像生成通常更慢

      // 生成mock图像响应
      const mockImages: ImageResponse[] = Array.from(
        { length: options.n || 1 },
        (_, i) => ({
          url: `https://via.placeholder.com/1024x1024/0066cc/ffffff?text=Mock+Image+${
            i + 1
          }`,
          metadata: {
            model: options.model,
            size: options.size || "1024x1024",
            prompt: prompt,
            finishReason: "stop",
          },
        })
      );

      return mockImages;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = {
      delay: 100,
      simulateError: false,
      errorType: "network",
      customResponse: "",
      verbose: false,
    };
  }

  /**
   * 设置为快速模式（无延迟，无错误）
   */
  setFastMode(): void {
    this.config = {
      ...this.config,
      delay: 0,
      simulateError: false,
      verbose: false,
    };
  }

  /**
   * 设置错误模拟
   */
  setErrorMode(errorType: MockAdapterConfig["errorType"] = "network"): void {
    this.config = {
      ...this.config,
      simulateError: true,
      errorType,
    };
  }

  // === 私有辅助方法 ===

  /**
   * 模拟延迟
   */
  private async simulateDelay(delay?: number): Promise<void> {
    const actualDelay = delay ?? this.config.delay ?? 100;
    if (actualDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }

  /**
   * 生成Mock内容
   */
  private generateMockContent(
    prompt: string,
    options: TextGenerationOptions
  ): string {
    if (this.config.customResponse) {
      return this.config.customResponse;
    }

    // 基于模型生成不同风格的响应
    const modelId = options.model;

    if (modelId.includes("gpt")) {
      return `This is a mock GPT response to: "${prompt.slice(0, 50)}..." 

Generated by ${modelId} with the following parameters:
- Temperature: ${options.temperature || 0.7}
- Max tokens: ${options.maxTokens || 2048}
- System prompt: ${options.systemPrompt ? "Yes" : "No"}
- Context: ${options.context ? "Yes" : "No"}

This is a simulated response for testing purposes. In a real implementation, this would be generated by the actual AI model.`;
    }

    if (modelId.includes("claude")) {
      return `Hello! I'm Claude (mock version). I understand you're asking about: "${prompt.slice(
        0,
        50
      )}..."

I'm here to help with thoughtful, helpful responses. This is a mock response generated for testing purposes, but in real usage, I would provide detailed, nuanced answers based on my training.

Model: ${modelId}
Parameters used: Temperature ${options.temperature || 0.7}, Max tokens ${
        options.maxTokens || 2048
      }`;
    }

    // 默认响应
    return `Mock AI Response: "${prompt.slice(0, 50)}..."

This is a simulated response from ${modelId}. The response is generated based on your prompt and the model's capabilities. 

Timestamp: ${new Date().toISOString()}
Configuration: ${JSON.stringify(this.config, null, 2)}`;
  }

  /**
   * 创建Mock流
   */
  private createMockStream(
    content: string,
    model: string
  ): ReadableStream<StreamChunk> {
    const chunks = content.split(" ");
    let chunkIndex = 0;

    return StreamHandler.createTextStream(
      (async function* () {
        for (const chunk of chunks) {
          // 模拟流延迟
          await new Promise((resolve) => setTimeout(resolve, 20));
          yield chunk + " ";
          chunkIndex++;
        }
      })(),
      model,
      Promise.resolve({
        promptTokens: Math.floor(Math.random() * 100) + 50,
        completionTokens: chunks.length,
        totalTokens: Math.floor(Math.random() * 100) + 50 + chunks.length,
      }),
      Promise.resolve("stop"),
      (error) => this.handleError(error)
    );
  }

  /**
   * 估算token数量
   */
  private estimateTokens(text: string): number {
    // 简单估算：约4个字符 = 1个token
    return Math.ceil(text.length / 4);
  }

  /**
   * 创建Mock错误
   */
  private createMockError(): LLMAdapterError {
    const errorType = this.config.errorType!;

    switch (errorType) {
      case "network":
        return new LLMAdapterError(
          "Mock network error: Unable to connect to service",
          "NETWORK_ERROR",
          0
        );
      case "auth":
        return new LLMAdapterError(
          "Mock authentication error: Invalid API key",
          "INVALID_API_KEY",
          401
        );
      case "rate_limit":
        return new LLMAdapterError(
          "Mock rate limit error: Too many requests",
          "RATE_LIMIT_EXCEEDED",
          429
        );
      case "server_error":
        return new LLMAdapterError(
          "Mock server error: Internal server error",
          "SERVICE_UNAVAILABLE",
          500
        );
      default:
        return new LLMAdapterError("Mock unknown error", "UNKNOWN_ERROR", 500);
    }
  }
}

/**
 * Mock 适配器工厂
 */
export class MockAdapterFactory implements AdapterFactory {
  private config: MockAdapterConfig;

  constructor(config: MockAdapterConfig = {}) {
    this.config = config;
  }

  createAdapter(): MockAdapter {
    return new MockAdapter(this.config);
  }

  getProviderInfo() {
    return {
      id: "mock",
      name: "Mock Provider",
      description:
        "Mock adapter for testing and development with configurable behavior",
    };
  }

  /**
   * 更新工厂配置
   */
  updateConfig(config: Partial<MockAdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// 自动注册适配器
const registry = AdapterRegistry.getInstance();
registry.register("mock", new MockAdapterFactory());
