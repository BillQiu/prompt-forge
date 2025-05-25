import { createOpenAI } from "@ai-sdk/openai";
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
 * OpenAI 适配器，用于与 OpenAI API 交互
 * 支持最新的 GPT-4.1 系列、o3/o4-mini 推理模型和图像生成
 * 使用 AI SDK 统一接口
 */
export class OpenAIAdapter implements BaseAdapter {
  readonly providerId = "openai";
  readonly providerName = "OpenAI";
  readonly description =
    "OpenAI GPT-4.1, o3/o4-mini reasoning models, and image generation";

  private readonly models: ModelInfo[] = [
    // GPT-4.1 系列 - 最新模型
    {
      id: "gpt-4.1",
      name: "GPT-4.1",
      description: "最智能的模型，在编程、指令遵循和长上下文理解方面有重大改进",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.002,
        outputCostPer1KTokens: 0.008,
      },
    },
    {
      id: "gpt-4.1-mini",
      name: "GPT-4.1 Mini",
      description: "平衡速度和智能的经济型模型，性能超越 GPT-4o",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.0004,
        outputCostPer1KTokens: 0.0016,
      },
    },
    {
      id: "gpt-4.1-nano",
      name: "GPT-4.1 Nano",
      description: "最快、最经济的模型，适用于低延迟任务",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.0001,
        outputCostPer1KTokens: 0.0004,
      },
    },
    // 推理模型系列
    {
      id: "o3",
      name: "OpenAI o3",
      description: "最强大的推理模型，在编程、数学、科学和视觉感知方面表现卓越",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.01,
        outputCostPer1KTokens: 0.04,
      },
    },
    {
      id: "o4-mini",
      name: "OpenAI o4-mini",
      description:
        "快速、经济高效的推理模型，在数学、编程和视觉任务方面表现强劲",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1000000, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.0011,
        outputCostPer1KTokens: 0.0044,
      },
    },
    // GPT-4o 系列 - 更新定价
    {
      id: "gpt-4o",
      name: "GPT-4o",
      description: "具有视觉能力的先进多模态模型",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
      pricing: {
        inputCostPer1KTokens: 0.005,
        outputCostPer1KTokens: 0.02,
      },
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      description: "经济实惠的智能小型模型",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 128000,
      },
      pricing: {
        inputCostPer1KTokens: 0.0006,
        outputCostPer1KTokens: 0.0024,
      },
    },
    // 图像生成模型
    {
      id: "gpt-image-1",
      name: "GPT Image 1",
      description: "精确、高保真的图像生成和编辑模型",
      capabilities: {
        textGeneration: false,
        imageGeneration: true,
        streaming: false,
        contextLength: 128000,
      },
      pricing: {
        inputCostPer1KTokens: 0.005,
        outputCostPer1KTokens: 0.04,
      },
    },
    // 传统图像生成模型
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      description: "先进的图像生成模型",
      capabilities: {
        textGeneration: false,
        imageGeneration: true,
        streaming: false,
        contextLength: 4000,
      },
      pricing: {
        inputCostPer1KTokens: 0.04, // HD 1024x1024
        outputCostPer1KTokens: 0.04,
      },
    },
    {
      id: "dall-e-2",
      name: "DALL-E 2",
      description: "上一代图像生成模型",
      capabilities: {
        textGeneration: false,
        imageGeneration: true,
        streaming: false,
        contextLength: 1000,
      },
      pricing: {
        inputCostPer1KTokens: 0.02, // 1024x1024
        outputCostPer1KTokens: 0.02,
      },
    },
    // 传统模型 (保留兼容性)
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      description: "高智能模型，适用于复杂的多步骤任务 (建议使用 GPT-4.1)",
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
  ];

  getSupportedModels(): ModelInfo[] {
    return [...this.models];
  }

  /**
   * 获取配置好的语言模型实例
   */
  private getLanguageModel(modelId: string, apiKey: string): LanguageModel {
    const openai = createOpenAI({
      apiKey: apiKey,
    });
    return openai(modelId as any);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      if (!apiKey) {
        return false;
      }

      // 使用最经济的模型进行验证
      const model = this.getLanguageModel("gpt-4.1-nano", apiKey);

      // 尝试一个简单的生成请求来验证API密钥
      await generateText({
        model: model,
        prompt: "Hello",
        maxTokens: 1,
      });

      return true;
    } catch (error) {
      console.warn("OpenAI API key validation failed:", error);
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
          role: "user",
          content: options.context,
        });
      }

      messages.push({
        role: "user",
        content: prompt,
      });

      const generateOptions = {
        model: model,
        messages: messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
      };

      if (options.stream) {
        // 返回流式响应
        const { textStream, usage } = streamText(generateOptions);

        return new ReadableStream<StreamChunk>({
          start: async (controller) => {
            try {
              let fullContent = "";

              for await (const delta of textStream) {
                fullContent += delta;
                controller.enqueue({
                  content: delta,
                  isComplete: false,
                  metadata: {
                    model: options.model,
                  },
                });
              }

              // 流结束时发送完成信号
              const finalUsage = await usage;
              controller.enqueue({
                content: "",
                isComplete: true,
                metadata: {
                  model: options.model,
                  finishReason: "stop",
                  usage: finalUsage
                    ? {
                        promptTokens: finalUsage.promptTokens,
                        completionTokens: finalUsage.completionTokens,
                        totalTokens: finalUsage.totalTokens,
                      }
                    : undefined,
                },
              });
              controller.close();
            } catch (error) {
              const llmError = this.handleAISDKError(error);
              controller.error(llmError);
            }
          },
        });
      } else {
        // 返回完整响应
        const { text, usage, finishReason } = await generateText(
          generateOptions
        );

        return {
          content: text,
          metadata: {
            model: options.model,
            usage: usage
              ? {
                  promptTokens: usage.promptTokens,
                  completionTokens: usage.completionTokens,
                  totalTokens: usage.totalTokens,
                }
              : undefined,
            finishReason: finishReason,
          },
        };
      }
    } catch (error) {
      throw this.handleAISDKError(error);
    }
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    try {
      // 验证 API 密钥
      if (!apiKey) {
        throw new LLMAdapterError(
          "API key is required",
          "MISSING_API_KEY",
          401
        );
      }

      // 检查模型是否支持图像生成
      if (!this.supportsCapability(options.model, "imageGeneration")) {
        throw new LLMAdapterError(
          `Model ${options.model} does not support image generation`,
          "UNSUPPORTED_OPERATION"
        );
      }

      // AI SDK 目前不直接支持图像生成，我们需要使用原生OpenAI客户端
      // 这里暂时抛出错误，表示需要在未来版本中实现
      throw new LLMAdapterError(
        "Image generation via AI SDK is not yet implemented. Will be added in future versions.",
        "NOT_IMPLEMENTED"
      );
    } catch (error) {
      throw this.handleAISDKError(error);
    }
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) {
      return false;
    }

    // 暂时禁用图像生成，因为AI SDK不直接支持
    if (capability === "imageGeneration") {
      return false;
    }

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

  /**
   * 处理 AI SDK 错误，提供用户友好的错误消息
   */
  private handleAISDKError(error: any): LLMAdapterError {
    if (error instanceof LLMAdapterError) {
      return error;
    }

    // AI SDK 错误处理
    if (error?.name === "AI_APICallError") {
      const { message, statusCode } = error;

      switch (statusCode) {
        case 401:
          return new LLMAdapterError(
            "API密钥无效或认证失败。请检查您的OpenAI API密钥是否正确。",
            "INVALID_API_KEY",
            401,
            error
          );
        case 403:
          return new LLMAdapterError(
            "访问被拒绝。您的API密钥可能没有权限访问此资源。",
            "PERMISSION_DENIED",
            403,
            error
          );
        case 404:
          return new LLMAdapterError(
            "请求的模型或资源不存在。请检查模型名称是否正确。",
            "NOT_FOUND",
            404,
            error
          );
        case 429:
          return new LLMAdapterError(
            "请求频率超出限制。请稍后再试或检查您的使用配额。",
            "RATE_LIMIT",
            429,
            error
          );
        case 500:
        case 502:
        case 503:
          return new LLMAdapterError(
            "OpenAI服务暂时不可用。请稍后重试。",
            "SERVICE_UNAVAILABLE",
            statusCode,
            error
          );
        case 400:
          return new LLMAdapterError(
            "请求参数无效。请检查您的输入内容。",
            "BAD_REQUEST",
            400,
            error
          );
        default:
          return new LLMAdapterError(
            message || "API调用失败，请稍后重试。",
            "API_ERROR",
            statusCode || 500,
            error
          );
      }
    }

    // AI SDK 解析错误
    if (error?.name === "AI_ParseError") {
      return new LLMAdapterError(
        "解析响应时出错。服务器返回的数据格式可能有问题。",
        "PARSE_ERROR",
        500,
        error
      );
    }

    // 网络错误
    if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
      return new LLMAdapterError(
        "网络连接失败。请检查您的网络连接或代理设置。",
        "NETWORK_ERROR",
        0,
        error
      );
    }

    // 超时错误
    if (error?.code === "ETIMEDOUT" || error?.name === "TimeoutError") {
      return new LLMAdapterError(
        "请求超时。服务器响应时间过长，请稍后重试。",
        "TIMEOUT_ERROR",
        408,
        error
      );
    }

    // 内容安全错误
    if (error?.message?.includes("content_policy")) {
      return new LLMAdapterError(
        "内容被安全策略拒绝。请修改您的提示词内容。",
        "CONTENT_POLICY_VIOLATION",
        400,
        error
      );
    }

    // 通用错误
    return new LLMAdapterError(
      error?.message || "发生未知错误，请稍后重试。",
      "UNKNOWN_ERROR",
      500,
      error
    );
  }
}

/**
 * OpenAI 适配器工厂
 */
export class OpenAIAdapterFactory implements AdapterFactory {
  createAdapter(): BaseAdapter {
    return new OpenAIAdapter();
  }

  getProviderInfo() {
    return {
      id: "openai",
      name: "OpenAI",
      description:
        "OpenAI GPT-4.1, o3/o4-mini reasoning models, and image generation via AI SDK",
    };
  }
}
