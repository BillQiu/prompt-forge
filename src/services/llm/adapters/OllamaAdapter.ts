import { createOllama } from "ollama-ai-provider";
import { generateText, streamText, LanguageModel } from "ai";
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
 * Ollama 适配器，用于与本地 Ollama 服务器交互
 * 使用 ollama-ai-provider
 */
export class OllamaAdapter implements BaseAdapter {
  readonly providerId = "ollama";
  readonly providerName = "Ollama";
  readonly description = "Local AI models running on Ollama server";

  private baseURL: string = "http://localhost:11434/api";
  private availableModels: ModelInfo[] = [];

  // 常见的 Ollama 模型，实际模型列表会动态获取
  private readonly commonModels: ModelInfo[] = [
    {
      id: "llama3.2",
      name: "Llama 3.2",
      description: "Meta's Llama 3.2 model with 3B parameters",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
    },
    {
      id: "llama3.2:1b",
      name: "Llama 3.2 1B",
      description: "Meta's Llama 3.2 model with 1B parameters (lightweight)",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
    },
    {
      id: "llama3.1",
      name: "Llama 3.1",
      description: "Meta's Llama 3.1 model with 8B parameters",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
    },
    {
      id: "llama3.1:70b",
      name: "Llama 3.1 70B",
      description:
        "Meta's Llama 3.1 model with 70B parameters (high capability)",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
    },
    {
      id: "mistral",
      name: "Mistral",
      description: "Mistral AI's 7B parameter model",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 32768,
      },
    },
    {
      id: "phi3",
      name: "Phi-3",
      description: "Microsoft's Phi-3 model",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
    },
    {
      id: "gemma2",
      name: "Gemma 2",
      description: "Google's Gemma 2 model",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 8192,
      },
    },
    {
      id: "codellama",
      name: "Code Llama",
      description: "Meta's Code Llama model specialized for code generation",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 16384,
      },
    },
    {
      id: "llava",
      name: "LLaVA",
      description:
        "Large Language and Vision Assistant with multimodal capabilities",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 4096,
      },
    },
    {
      id: "qwen2.5",
      name: "Qwen 2.5",
      description: "Alibaba's Qwen 2.5 model",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 32768,
      },
    },
  ];

  constructor(baseURL?: string) {
    if (baseURL) {
      this.baseURL = baseURL;
    }
  }

  /**
   * 动态获取 Ollama 服务器上可用的模型
   */
  private async fetchAvailableModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(
        `${this.baseURL.replace("/api", "")}/api/tags`
      );
      if (!response.ok) {
        console.warn(
          "Could not fetch models from Ollama server, using common models"
        );
        return this.commonModels;
      }

      const data = await response.json();
      const models: ModelInfo[] = data.models.map((model: any) => {
        // 尝试在常见模型中找到匹配的模型信息
        const commonModel = this.commonModels.find(
          (cm) =>
            model.name.includes(cm.id) ||
            cm.id.includes(model.name.split(":")[0])
        );

        return {
          id: model.name,
          name: model.name,
          description:
            commonModel?.description || `Ollama model: ${model.name}`,
          capabilities: commonModel?.capabilities || {
            textGeneration: true,
            imageGeneration: false,
            streaming: true,
            contextLength: 4096,
          },
          pricing: {
            inputCostPer1KTokens: 0, // 本地模型无费用
            outputCostPer1KTokens: 0,
          },
        };
      });

      this.availableModels = models;
      return models;
    } catch (error) {
      console.warn("Error fetching models from Ollama server:", error);
      // 如果无法连接到服务器，返回常见模型列表
      return this.commonModels;
    }
  }

  getSupportedModels(): ModelInfo[] {
    // 如果还没有获取过模型，先返回常见模型列表
    // 真正的动态模型获取会在后台进行
    if (this.availableModels.length === 0) {
      // 异步获取真实的模型列表，但不阻塞当前调用
      this.fetchAvailableModels().catch(console.warn);
      return [...this.commonModels];
    }
    return [...this.availableModels];
  }

  /**
   * 获取配置好的语言模型实例
   */
  private getLanguageModel(modelId: string): LanguageModel {
    const ollama = createOllama({
      baseURL: this.baseURL,
    });
    return ollama(modelId);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    // Ollama 不需要 API 密钥，但我们检查服务器是否可访问
    try {
      const response = await fetch(
        `${this.baseURL.replace("/api", "")}/api/tags`
      );
      return response.ok;
    } catch (error) {
      console.warn("Ollama server is not accessible:", error);
      return false;
    }
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>> {
    try {
      // 检查模型是否支持文本生成
      if (!this.supportsCapability(options.model, "textGeneration")) {
        throw new LLMAdapterError(
          `Model ${options.model} does not support text generation`,
          "UNSUPPORTED_OPERATION"
        );
      }

      const model = this.getLanguageModel(options.model);

      // 构建消息
      let messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];

      if (options.systemPrompt) {
        messages.push({
          role: "system",
          content: options.systemPrompt,
        });
      }

      if (options.context) {
        messages.push({
          role: "assistant",
          content: options.context,
        });
      }

      messages.push({
        role: "user",
        content: prompt,
      });

      // 构建生成参数
      const generateParams = {
        model: model,
        messages: messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      };

      if (options.stream) {
        // 流式生成
        const result = await streamText(generateParams);
        const self = this;

        return new ReadableStream<StreamChunk>({
          async start(controller) {
            try {
              for await (const chunk of result.textStream) {
                controller.enqueue({
                  content: chunk,
                  isComplete: false,
                });
              }

              // 发送完成信号
              controller.enqueue({
                content: "",
                isComplete: true,
                metadata: {
                  model: options.model,
                  usage: result.usage ? await result.usage : undefined,
                  finishReason: result.finishReason
                    ? await result.finishReason
                    : undefined,
                },
              });
              controller.close();
            } catch (error) {
              controller.error(self.handleOllamaError(error));
            }
          },
        });
      } else {
        // 非流式生成
        const result = await generateText(generateParams);

        return {
          content: result.text,
          metadata: {
            model: options.model,
            usage: result.usage,
            finishReason: result.finishReason,
          },
        };
      }
    } catch (error) {
      throw this.handleOllamaError(error);
    }
  }

  // Ollama 不支持图像生成，但保持接口一致性
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    throw new LLMAdapterError(
      "Image generation is not supported by Ollama models",
      "UNSUPPORTED_OPERATION"
    );
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    // 对于 Ollama，我们假设所有模型都支持文本生成和流式传输
    // 但不支持图像生成（除非是专门的多模态模型如 LLaVA）
    switch (capability) {
      case "textGeneration":
        return true;
      case "imageGeneration":
        return false; // Ollama 主要用于文本生成
      case "streaming":
        return true;
      default:
        return false;
    }
  }

  getContextLength(modelId: string): number | undefined {
    const model = this.commonModels.find(
      (m) => m.id === modelId || modelId.includes(m.id)
    );
    return model?.capabilities.contextLength || 4096; // 默认上下文长度
  }

  getPricing(
    modelId: string
  ):
    | { inputCostPer1KTokens?: number; outputCostPer1KTokens?: number }
    | undefined {
    // Ollama 是本地模型，无费用
    return {
      inputCostPer1KTokens: 0,
      outputCostPer1KTokens: 0,
    };
  }

  /**
   * 设置自定义的 Ollama 服务器 URL
   */
  setBaseURL(baseURL: string): void {
    this.baseURL = baseURL;
    // 清空缓存的模型列表，强制重新获取
    this.availableModels = [];
  }

  /**
   * 获取当前的 Ollama 服务器 URL
   */
  getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * 处理 Ollama 错误并转换为统一的错误格式
   */
  private handleOllamaError(error: any): LLMAdapterError {
    // 处理网络连接错误
    if (error?.code === "ECONNREFUSED" || error?.code === "ENOTFOUND") {
      return new LLMAdapterError(
        `Network error: Unable to connect to Ollama server at ${this.baseURL}. Please ensure Ollama is running and accessible.`,
        "NETWORK_ERROR",
        undefined,
        error
      );
    }

    // 处理超时错误
    if (error?.code === "ETIMEDOUT") {
      return new LLMAdapterError(
        "Request timeout: Ollama server did not respond in time",
        "TIMEOUT_ERROR",
        undefined,
        error
      );
    }

    // 处理 HTTP 状态错误
    if (error?.response?.status) {
      const status = error.response.status;
      let message = error.message || "Unknown error occurred";
      let code = "UNKNOWN_ERROR";

      switch (status) {
        case 400:
          code = "INVALID_REQUEST";
          message = "Invalid request: " + (error.message || "Bad request");
          break;
        case 404:
          code = "MODEL_NOT_FOUND";
          message = `Model not found. Please ensure the model is installed on your Ollama server.`;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          code = "SERVICE_UNAVAILABLE";
          message = "Ollama server is temporarily unavailable";
          break;
      }

      return new LLMAdapterError(message, code, status, error);
    }

    // 处理 AI SDK 特定错误
    if (error?.name === "AI_APICallError") {
      return new LLMAdapterError(
        `API call failed: ${error.message}`,
        "API_CALL_ERROR",
        error.status,
        error
      );
    }

    if (error?.name === "AI_InvalidPromptError") {
      return new LLMAdapterError(
        `Invalid prompt: ${error.message}`,
        "INVALID_PROMPT",
        400,
        error
      );
    }

    if (error?.name === "AI_InvalidResponseFormatError") {
      return new LLMAdapterError(
        `Invalid response format: ${error.message}`,
        "INVALID_RESPONSE_FORMAT",
        undefined,
        error
      );
    }

    // 处理其他已知错误类型
    if (error instanceof LLMAdapterError) {
      return error;
    }

    // 默认错误处理
    return new LLMAdapterError(
      error?.message || "An unexpected error occurred",
      "UNKNOWN_ERROR",
      undefined,
      error
    );
  }
}

/**
 * Ollama 适配器工厂
 */
export class OllamaAdapterFactory implements AdapterFactory {
  private baseURL?: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL;
  }

  createAdapter(): BaseAdapter {
    return new OllamaAdapter(this.baseURL);
  }

  getProviderInfo() {
    return {
      id: "ollama",
      name: "Ollama",
      description: "Local AI models running on Ollama server",
    };
  }
}
