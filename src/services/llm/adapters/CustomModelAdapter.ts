import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, streamText, LanguageModel } from "ai";
import { z } from "zod";
import {
  TextGenerationOptions,
  ImageGenerationOptions,
  TextResponse,
  ImageResponse,
  StreamChunk,
  ModelInfo,
  LLMAdapterError,
  AdapterFactory,
  ProviderConfig,
} from "../BaseAdapter";
import { AbstractAdapter, StreamHandler } from "./AbstractAdapter";
import { CustomModel } from "@/services/db";

/**
 * 自定义模型适配器，支持用户定义的模型配置
 * 根据 providerType 动态选择请求格式（OpenAI 或 Anthropic）
 */
export class CustomModelAdapter extends AbstractAdapter {
  readonly providerId = "custom";
  readonly providerName = "Custom Models";
  readonly description =
    "User-defined custom models with configurable provider types";

  private customModel: CustomModel;

  constructor(customModel: CustomModel) {
    // 创建一个动态的模型信息，使用数据库ID作为模型ID
    const modelInfo: ModelInfo = {
      id: `custom:${customModel.id}`,
      name: customModel.name,
      description: `Custom model: ${customModel.name} (${customModel.providerType} format)`,
      capabilities: {
        textGeneration: true,
        imageGeneration: false, // 暂时只支持文本生成
        streaming: true,
        contextLength: 128000, // 默认上下文长度
      },
      pricing: {
        inputCostPer1KTokens: 0, // 自定义模型价格未知
        outputCostPer1KTokens: 0,
      },
    };

    super([modelInfo]);
    this.customModel = customModel;
  }

  getConfigSchema(): z.ZodSchema<ProviderConfig> {
    return z.object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).max(100000).optional(),
      topP: z.number().min(0).max(1).optional(),
      frequencyPenalty: z.number().min(-2).max(2).optional(),
      presencePenalty: z.number().min(-2).max(2).optional(),
    });
  }

  getDefaultConfig(): ProviderConfig {
    return {
      temperature: 0.7,
      maxTokens: 4000,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };
  }

  /**
   * 根据 providerType 创建相应的语言模型实例
   */
  private getLanguageModel(modelId?: string): LanguageModel {
    const { baseUrl, apiKey, providerType, name } = this.customModel;

    switch (providerType) {
      case "openai":
        const openaiProvider = createOpenAI({
          baseURL: baseUrl,
          apiKey: apiKey,
        });
        // 使用存储的自定义模型名称
        return openaiProvider(name);

      case "anthropic":
        const anthropicProvider = createAnthropic({
          baseURL: baseUrl,
          apiKey: apiKey,
        });
        // 使用存储的自定义模型名称
        return anthropicProvider(name);

      default:
        throw new LLMAdapterError(
          `Unsupported provider type: ${providerType}`,
          "UNSUPPORTED_PROVIDER_TYPE"
        );
    }
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // 尝试使用自定义模型的API密钥进行简单的验证请求
      const model = this.getLanguageModel();

      await generateText({
        model,
        prompt: "Hello",
        maxTokens: 1,
      });

      return true;
    } catch (error) {
      console.error("Custom model API key validation failed:", error);
      return false;
    }
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>> {
    try {
      // 自定义模型使用存储的API密钥，不需要验证传入的apiKey参数
      // 规范化模型ID：如果传入的是数字ID，则转换为完整格式
      const normalizedModelId = options.model.includes(":")
        ? options.model
        : `custom:${options.model}`;

      this.validateTextGenerationCapability(normalizedModelId);

      const model = this.getLanguageModel();
      const messageBuilder = this.createMessageBuilder();

      // 构建消息
      if (options.systemPrompt) {
        messageBuilder.addSystemPrompt(options.systemPrompt);
      }
      if (options.context) {
        messageBuilder.addContext(options.context);
      }
      messageBuilder.addUserMessage(prompt);

      const messages = messageBuilder.build();

      // 准备生成参数
      const generateParams = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 4000,
        topP: options.topP ?? 1,
        frequencyPenalty: options.frequencyPenalty ?? 0,
        presencePenalty: options.presencePenalty ?? 0,
      };

      if (options.stream) {
        // 流式响应
        const { textStream, usage, finishReason } = await streamText(
          generateParams
        );

        return StreamHandler.createTextStream(
          textStream,
          normalizedModelId,
          usage,
          finishReason,
          (error) => this.handleError(error)
        );
      } else {
        // 非流式响应
        const result = await generateText(generateParams);

        return {
          content: result.text,
          metadata: {
            model: normalizedModelId,
            usage: result.usage
              ? {
                  promptTokens: result.usage.promptTokens,
                  completionTokens: result.usage.completionTokens,
                  totalTokens: result.usage.totalTokens,
                }
              : undefined,
            finishReason: result.finishReason || "stop",
          },
        };
      }
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // 暂时不支持图像生成
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    throw new LLMAdapterError(
      "Image generation is not supported for custom models",
      "UNSUPPORTED_CAPABILITY"
    );
  }

  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    const model = this.modelRegistry.findModel(modelId);
    if (!model) return false;

    switch (capability) {
      case "textGeneration":
        return model.capabilities.textGeneration;
      case "imageGeneration":
        return false; // 暂时不支持图像生成
      case "streaming":
        return model.capabilities.streaming;
      default:
        return false;
    }
  }
}

/**
 * 自定义模型适配器工厂
 */
export class CustomModelAdapterFactory implements AdapterFactory {
  private customModel: CustomModel;

  constructor(customModel: CustomModel) {
    this.customModel = customModel;
  }

  createAdapter(): CustomModelAdapter {
    return new CustomModelAdapter(this.customModel);
  }

  getProviderInfo() {
    return {
      id: "custom",
      name: "Custom Models",
      description:
        "User-defined custom models with configurable provider types",
    };
  }
}
