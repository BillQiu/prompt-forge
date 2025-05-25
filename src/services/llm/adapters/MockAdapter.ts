import {
  BaseAdapter,
  TextGenerationOptions,
  ImageGenerationOptions,
  TextResponse,
  ImageResponse,
  StreamChunk,
  ModelInfo,
  LLMAdapterError,
  AdapterFactory,
} from "../BaseAdapter";

/**
 * Mock 适配器，用于测试和开发目的
 * 模拟真实 LLM 提供者的行为
 */
export class MockAdapter implements BaseAdapter {
  readonly providerId = "mock";
  readonly providerName = "Mock Provider";
  readonly description = "Mock adapter for testing and development purposes";

  private readonly models: ModelInfo[] = [
    {
      id: "mock-text-basic",
      name: "Mock Text Basic",
      description: "Basic text generation model for testing",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 4096,
      },
      pricing: {
        inputCostPer1KTokens: 0.001,
        outputCostPer1KTokens: 0.002,
      },
    },
    {
      id: "mock-text-advanced",
      name: "Mock Text Advanced",
      description: "Advanced text generation model for testing",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 8192,
      },
      pricing: {
        inputCostPer1KTokens: 0.003,
        outputCostPer1KTokens: 0.006,
      },
    },
    {
      id: "mock-image-basic",
      name: "Mock Image Basic",
      description: "Basic image generation model for testing",
      capabilities: {
        textGeneration: false,
        imageGeneration: true,
        streaming: false,
      },
      pricing: {
        inputCostPer1KTokens: 0.02,
        outputCostPer1KTokens: 0.02,
      },
    },
    {
      id: "mock-multimodal",
      name: "Mock Multimodal",
      description: "Multimodal model supporting both text and image generation",
      capabilities: {
        textGeneration: true,
        imageGeneration: true,
        streaming: true,
        contextLength: 16384,
      },
      pricing: {
        inputCostPer1KTokens: 0.01,
        outputCostPer1KTokens: 0.03,
      },
    },
  ];

  // 可配置的响应行为
  private config = {
    simulateDelay: true,
    minDelay: 100,
    maxDelay: 500,
    streamChunkSize: 10,
    errorRate: 0, // 0-1 之间，模拟错误率
    customResponses: new Map<string, string>(),
  };

  /**
   * 配置 Mock 适配器的行为
   */
  configure(options: {
    simulateDelay?: boolean;
    minDelay?: number;
    maxDelay?: number;
    streamChunkSize?: number;
    errorRate?: number;
    customResponses?: Map<string, string>;
  }) {
    Object.assign(this.config, options);
  }

  getSupportedModels(): ModelInfo[] {
    return [...this.models];
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    // 模拟 API 密钥验证
    await this.simulateDelay();

    // 为了测试，我们接受任何非空字符串作为有效密钥
    // 特殊值 'invalid' 用于测试无效密钥
    return apiKey.length > 0 && apiKey !== "invalid";
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>> {
    // 验证 API 密钥
    if (!(await this.validateApiKey(apiKey))) {
      throw new LLMAdapterError("Invalid API key", "INVALID_API_KEY", 401);
    }

    // 检查模型是否支持文本生成
    if (!this.supportsCapability(options.model, "textGeneration")) {
      throw new LLMAdapterError(
        `Model ${options.model} does not support text generation`,
        "UNSUPPORTED_OPERATION"
      );
    }

    // 模拟错误率
    if (Math.random() < this.config.errorRate) {
      throw new LLMAdapterError("Simulated API error", "API_ERROR", 500);
    }

    const mockResponse = this.generateMockTextResponse(prompt, options);

    if (options.stream) {
      return this.createTextStream(mockResponse, options);
    } else {
      await this.simulateDelay();
      return {
        content: mockResponse,
        metadata: {
          model: options.model,
          usage: {
            promptTokens: Math.floor(prompt.length / 4),
            completionTokens: Math.floor(mockResponse.length / 4),
            totalTokens: Math.floor((prompt.length + mockResponse.length) / 4),
          },
          finishReason: "stop",
        },
      };
    }
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    // 验证 API 密钥
    if (!(await this.validateApiKey(apiKey))) {
      throw new LLMAdapterError("Invalid API key", "INVALID_API_KEY", 401);
    }

    // 检查模型是否支持图像生成
    if (!this.supportsCapability(options.model, "imageGeneration")) {
      throw new LLMAdapterError(
        `Model ${options.model} does not support image generation`,
        "UNSUPPORTED_OPERATION"
      );
    }

    // 模拟错误率
    if (Math.random() < this.config.errorRate) {
      throw new LLMAdapterError("Simulated API error", "API_ERROR", 500);
    }

    await this.simulateDelay();

    const numImages = options.numImages || 1;
    const images: ImageResponse[] = [];

    for (let i = 0; i < numImages; i++) {
      images.push({
        url: `https://picsum.photos/512/512?random=${Date.now()}-${i}`,
        metadata: {
          model: options.model,
          revisedPrompt: `${prompt} (mock generated image ${i + 1})`,
          size: options.size || "512x512",
          quality: options.quality || "standard",
          style: options.style || "vivid",
        },
      });
    }

    return images;
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) return false;

    return model.capabilities[capability] || false;
  }

  getContextLength(modelId: string): number | undefined {
    const model = this.models.find((m) => m.id === modelId);
    return model?.capabilities.contextLength;
  }

  getPricing(
    modelId: string
  ):
    | { inputCostPer1KTokens?: number; outputCostPer1KTokens?: number }
    | undefined {
    const model = this.models.find((m) => m.id === modelId);
    return model?.pricing;
  }

  private generateMockTextResponse(
    prompt: string,
    options: TextGenerationOptions
  ): string {
    // 检查是否有自定义响应
    const customResponse = this.config.customResponses.get(prompt);
    if (customResponse) {
      return customResponse;
    }

    // 生成基于提示的模拟响应
    const responses = [
      `这是对提示 "${prompt}" 的模拟响应。`,
      `Mock response for: "${prompt}". This is generated by the mock adapter.`,
      `根据您的提示 "${prompt}"，这里是一个模拟的 AI 响应。模型：${options.model}`,
      `Mock AI response: I understand you asked about "${prompt}". Here's a simulated answer.`,
      `模拟响应：您的问题是 "${prompt}"，这是一个由 Mock 适配器生成的测试响应。`,
    ];

    let response = responses[Math.floor(Math.random() * responses.length)];

    // 根据温度参数调整响应长度
    if (options.temperature && options.temperature > 0.7) {
      response +=
        " 这是一个较长的响应，因为温度参数较高，模拟了更有创意的输出。";
    }

    // 根据 maxTokens 截断响应
    if (options.maxTokens) {
      const maxLength = options.maxTokens * 4; // 粗略估算
      if (response.length > maxLength) {
        response = response.substring(0, maxLength - 3) + "...";
      }
    }

    return response;
  }

  private createTextStream(
    content: string,
    options: TextGenerationOptions
  ): ReadableStream<StreamChunk> {
    const chunkSize = this.config.streamChunkSize;
    let index = 0;

    return new ReadableStream<StreamChunk>({
      async start(controller) {
        const sendChunk = async () => {
          if (index >= content.length) {
            // 发送完成标记
            controller.enqueue({
              content: "",
              isComplete: true,
              metadata: {
                model: options.model,
                finishReason: "stop",
              },
            });
            controller.close();
            return;
          }

          const chunk = content.slice(index, index + chunkSize);
          index += chunkSize;

          controller.enqueue({
            content: chunk,
            isComplete: false,
            metadata: {
              model: options.model,
            },
          });

          // 模拟流式响应的延迟
          await new Promise((resolve) => setTimeout(resolve, 50));
          sendChunk();
        };

        await sendChunk();
      },
    });
  }

  private async simulateDelay(): Promise<void> {
    if (!this.config.simulateDelay) return;

    const delay =
      Math.random() * (this.config.maxDelay - this.config.minDelay) +
      this.config.minDelay;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Mock 适配器工厂
 */
export class MockAdapterFactory implements AdapterFactory {
  createAdapter(): BaseAdapter {
    return new MockAdapter();
  }

  getProviderInfo() {
    return {
      id: "mock",
      name: "Mock Provider",
      description: "Mock adapter for testing and development purposes",
    };
  }
}
