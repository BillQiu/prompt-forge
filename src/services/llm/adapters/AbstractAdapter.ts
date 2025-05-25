import { LanguageModel } from "ai";
import {
  BaseAdapter,
  TextGenerationOptions,
  ImageGenerationOptions,
  TextResponse,
  ImageResponse,
  StreamChunk,
  ModelInfo,
  LLMAdapterError,
} from "../BaseAdapter";

/**
 * 消息构建器 - 标准化消息格式
 */
export class MessageBuilder {
  private messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  addSystemPrompt(prompt: string): this {
    if (prompt) {
      this.messages.push({
        role: "system",
        content: prompt,
      });
    }
    return this;
  }

  addContext(context: string): this {
    if (context) {
      this.messages.push({
        role: "assistant",
        content: context,
      });
    }
    return this;
  }

  addUserMessage(content: string): this {
    this.messages.push({
      role: "user",
      content: content,
    });
    return this;
  }

  build() {
    return [...this.messages];
  }
}

/**
 * 流处理器 - 标准化流响应处理
 */
export class StreamHandler {
  static createTextStream(
    textStream: AsyncIterable<string>,
    model: string,
    usage: Promise<any>,
    finishReason: Promise<string | undefined>,
    errorHandler: (error: any) => LLMAdapterError
  ): ReadableStream<StreamChunk> {
    return new ReadableStream<StreamChunk>({
      async start(controller) {
        try {
          for await (const chunk of textStream) {
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
              model: model,
              usage: usage ? await usage : undefined,
              finishReason: finishReason ? await finishReason : undefined,
            },
          });
          controller.close();
        } catch (error) {
          controller.error(errorHandler(error));
        }
      },
    });
  }
}

/**
 * 通用错误处理器
 */
export class ErrorHandler {
  static handleAPIError(error: any, providerName: string): LLMAdapterError {
    // 处理已知的LLMAdapterError
    if (error instanceof LLMAdapterError) {
      return error;
    }

    // 处理HTTP状态错误
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
          message = `${providerName} service temporarily unavailable`;
          break;
      }

      return new LLMAdapterError(message, code, status, error);
    }

    // 处理网络错误
    if (error?.code === "ECONNREFUSED" || error?.code === "ENOTFOUND") {
      return new LLMAdapterError(
        `Network error: Unable to connect to ${providerName} API`,
        "NETWORK_ERROR",
        undefined,
        error
      );
    }

    // 处理超时错误
    if (error?.code === "ETIMEDOUT") {
      return new LLMAdapterError(
        `Request timeout: ${providerName} API did not respond in time`,
        "TIMEOUT_ERROR",
        undefined,
        error
      );
    }

    // 处理AI SDK特定错误
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
 * 模型注册表 - 标准化模型信息管理
 */
export class ModelRegistry {
  constructor(private models: ModelInfo[]) {}

  getAllModels(): ModelInfo[] {
    return [...this.models];
  }

  findModel(modelId: string): ModelInfo | undefined {
    return this.models.find((m) => m.id === modelId);
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    const model = this.findModel(modelId);
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
    const model = this.findModel(modelId);
    return model?.capabilities.contextLength;
  }

  getPricing(
    modelId: string
  ):
    | { inputCostPer1KTokens?: number; outputCostPer1KTokens?: number }
    | undefined {
    const model = this.findModel(modelId);
    return model?.pricing;
  }
}

/**
 * 抽象适配器基类
 * 提供所有适配器的通用实现
 */
export abstract class AbstractAdapter implements BaseAdapter {
  abstract readonly providerId: string;
  abstract readonly providerName: string;
  abstract readonly description: string;

  protected modelRegistry: ModelRegistry;

  constructor(models: ModelInfo[]) {
    this.modelRegistry = new ModelRegistry(models);
  }

  // 标准实现 - 子类可以直接使用
  getSupportedModels(): ModelInfo[] {
    return this.modelRegistry.getAllModels();
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    return this.modelRegistry.supportsCapability(modelId, capability);
  }

  getContextLength(modelId: string): number | undefined {
    return this.modelRegistry.getContextLength(modelId);
  }

  getPricing(
    modelId: string
  ):
    | { inputCostPer1KTokens?: number; outputCostPer1KTokens?: number }
    | undefined {
    return this.modelRegistry.getPricing(modelId);
  }

  // 抽象方法 - 子类必须实现
  abstract validateApiKey(apiKey: string): Promise<boolean>;

  abstract generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>>;

  abstract generateImage?(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]>;

  // 受保护的辅助方法
  protected createMessageBuilder(): MessageBuilder {
    return new MessageBuilder();
  }

  protected handleError(error: any): LLMAdapterError {
    return ErrorHandler.handleAPIError(error, this.providerName);
  }

  protected validateTextGenerationCapability(modelId: string): void {
    if (!this.supportsCapability(modelId, "textGeneration")) {
      throw new LLMAdapterError(
        `Model ${modelId} does not support text generation`,
        "UNSUPPORTED_OPERATION"
      );
    }
  }

  protected validateImageGenerationCapability(modelId: string): void {
    if (!this.supportsCapability(modelId, "imageGeneration")) {
      throw new LLMAdapterError(
        `Model ${modelId} does not support image generation`,
        "UNSUPPORTED_OPERATION"
      );
    }
  }

  protected validateApiKeyPresent(apiKey: string): void {
    if (!apiKey) {
      throw new LLMAdapterError("API key is required", "MISSING_API_KEY", 401);
    }
  }
}
