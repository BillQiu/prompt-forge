import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
 * Google Gemini 适配器，用于与 Google Gemini API 交互
 * 使用 AI SDK 统一接口
 */
export class GeminiAdapter implements BaseAdapter {
  readonly providerId = "google";
  readonly providerName = "Google Gemini";
  readonly description =
    "Google's Gemini AI models for text generation and multimodal tasks";

  private readonly models: ModelInfo[] = [
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      description:
        "Google's most capable model for complex, multi-step reasoning",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 2000000, // 2M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.00125, // $1.25 per 1M tokens
        outputCostPer1KTokens: 0.005, // $5.00 per 1M tokens
      },
    },
    {
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      description:
        "Fast and versatile performance across a diverse variety of tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.000075, // $0.075 per 1M tokens
        outputCostPer1KTokens: 0.0003, // $0.30 per 1M tokens
      },
    },
    {
      id: "gemini-1.5-flash-8b",
      name: "Gemini 1.5 Flash-8B",
      description: "High volume and lower intelligence tasks at very low cost",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.0000375, // $0.0375 per 1M tokens
        outputCostPer1KTokens: 0.00015, // $0.15 per 1M tokens
      },
    },
    {
      id: "gemini-pro",
      name: "Gemini Pro",
      description: "Best performance for most tasks (legacy)",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 30720,
      },
      pricing: {
        inputCostPer1KTokens: 0.0005,
        outputCostPer1KTokens: 0.0015,
      },
    },
  ];

  getSupportedModels(): ModelInfo[] {
    return [...this.models];
  }

  /**
   * 获取配置好的语言模型实例
   */
  private getLanguageModel(modelId: string, apiKey: string): LanguageModel {
    const google = createGoogleGenerativeAI({
      apiKey: apiKey,
    });
    return google(modelId as any);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      if (!apiKey) {
        return false;
      }

      const model = this.getLanguageModel("gemini-1.5-flash", apiKey);

      // 尝试一个简单的生成请求来验证API密钥
      await generateText({
        model: model,
        prompt: "Hello",
        maxTokens: 1,
      });

      return true;
    } catch (error) {
      console.warn("Google Gemini API key validation failed:", error);
      return false;
    }
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>> {
    try {
      // 验证 API 密钥
      if (!apiKey) {
        throw new LLMAdapterError(
          "API key is required",
          "MISSING_API_KEY",
          401
        );
      }

      // 检查模型是否支持文本生成
      if (!this.supportsCapability(options.model, "textGeneration")) {
        throw new LLMAdapterError(
          `Model ${options.model} does not support text generation`,
          "UNSUPPORTED_OPERATION"
        );
      }

      const model = this.getLanguageModel(options.model, apiKey);

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
              controller.error(self.handleAISDKError(error));
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
      throw this.handleAISDKError(error);
    }
  }

  // Gemini目前不支持图像生成，但保持接口一致性
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    throw new LLMAdapterError(
      "Image generation is not supported by Google Gemini models",
      "UNSUPPORTED_OPERATION"
    );
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) return false;

    switch (capability) {
      case "textGeneration":
        return model.capabilities.textGeneration;
      case "imageGeneration":
        return model.capabilities.imageGeneration;
      case "streaming":
        return model.capabilities.streaming;
      default:
        return false;
    }
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

  /**
   * 处理 AI SDK 错误并转换为统一的错误格式
   */
  private handleAISDKError(error: any): LLMAdapterError {
    // 处理常见的 API 错误
    if (error?.response?.status) {
      const status = error.response.status;
      let message = error.message || "Unknown error occurred";
      let code = "UNKNOWN_ERROR";

      switch (status) {
        case 400:
          code = "INVALID_REQUEST";
          message = "Invalid request: " + (error.message || "Bad request");
          break;
        case 401:
          code = "INVALID_API_KEY";
          message = "Invalid API key provided";
          break;
        case 403:
          code = "PERMISSION_DENIED";
          message = "Permission denied or quota exceeded";
          break;
        case 404:
          code = "MODEL_NOT_FOUND";
          message = "Model not found";
          break;
        case 429:
          code = "RATE_LIMIT_EXCEEDED";
          message = "Rate limit exceeded. Please try again later";
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          code = "SERVICE_UNAVAILABLE";
          message = "Service temporarily unavailable";
          break;
      }

      return new LLMAdapterError(message, code, status, error);
    }

    // 处理网络错误
    if (error?.code === "ECONNREFUSED" || error?.code === "ENOTFOUND") {
      return new LLMAdapterError(
        "Network error: Unable to connect to Google Gemini API",
        "NETWORK_ERROR",
        undefined,
        error
      );
    }

    // 处理超时错误
    if (error?.code === "ETIMEDOUT") {
      return new LLMAdapterError(
        "Request timeout: Google Gemini API did not respond in time",
        "TIMEOUT_ERROR",
        undefined,
        error
      );
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
 * Google Gemini 适配器工厂
 */
export class GeminiAdapterFactory implements AdapterFactory {
  createAdapter(): BaseAdapter {
    return new GeminiAdapter();
  }

  getProviderInfo() {
    return {
      id: "google",
      name: "Google Gemini",
      description:
        "Google's Gemini AI models for text generation and multimodal tasks",
    };
  }
}
