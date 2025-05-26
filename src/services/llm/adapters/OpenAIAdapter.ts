import { createOpenAI } from "@ai-sdk/openai";
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
import { AdapterRegistry } from "./AdapterRegistry";

/**
 * OpenAI 适配器，用于与 OpenAI API 交互
 * 支持最新的 GPT-4.1 系列、o3/o4-mini 推理模型和图像生成
 * 使用 AI SDK 统一接口
 */
export class OpenAIAdapter extends AbstractAdapter {
  readonly providerId = "openai";
  readonly providerName = "OpenAI";
  readonly description =
    "OpenAI GPT-4.1, o3/o4-mini reasoning models, and image generation";

  private static readonly MODELS: ModelInfo[] = [
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

  constructor() {
    super(OpenAIAdapter.MODELS);
  }

  /**
   * 获取OpenAI配置的Zod schema
   */
  getConfigSchema(): z.ZodSchema<ProviderConfig> {
    return z.object({
      // 文本生成参数
      textGeneration: z
        .object({
          temperature: z.number().min(0).max(2).default(0.7),
          maxTokens: z.number().min(1).max(4096).default(2048),
          topP: z.number().min(0).max(1).default(1),
          frequencyPenalty: z.number().min(-2).max(2).default(0),
          presencePenalty: z.number().min(-2).max(2).default(0),
          stop: z.array(z.string()).max(4).default([]),
        })
        .default({}),

      // 图像生成参数
      imageGeneration: z
        .object({
          size: z
            .enum(["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"])
            .default("1024x1024"),
          quality: z.enum(["standard", "hd"]).default("standard"),
          style: z.enum(["vivid", "natural"]).default("vivid"),
          numImages: z.number().min(1).max(10).default(1),
        })
        .default({}),

      // 高级设置
      advanced: z
        .object({
          timeout: z.number().min(1000).max(300000).default(30000), // 30秒超时
          retryAttempts: z.number().min(0).max(5).default(3),
          baseURL: z.string().url().optional(),
        })
        .default({}),
    });
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): ProviderConfig {
    return {
      textGeneration: {
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        stop: [],
      },
      imageGeneration: {
        size: "1024x1024",
        quality: "standard",
        style: "vivid",
        numImages: 1,
      },
      advanced: {
        timeout: 30000,
        retryAttempts: 3,
      },
    };
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
      // 使用基类提供的验证方法
      this.validateApiKeyPresent(apiKey);
      this.validateTextGenerationCapability(options.model);

      const model = this.getLanguageModel(options.model, apiKey);

      // 使用标准化消息构建器
      const messages = this.createMessageBuilder()
        .addSystemPrompt(options.systemPrompt || "")
        .addContext(options.context || "")
        .addUserMessage(prompt)
        .build();

      const generateOptions = {
        model: model,
        messages: messages,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
      };

      if (options.stream) {
        // 使用标准化流处理器
        const { textStream, usage } = streamText(generateOptions);

        return StreamHandler.createTextStream(
          textStream,
          options.model,
          usage || Promise.resolve(undefined),
          Promise.resolve("stop"),
          (error) => this.handleError(error)
        );
      } else {
        // 非流式生成
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
      throw this.handleError(error);
    }
  }

  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    try {
      // 使用基类提供的验证方法
      this.validateApiKeyPresent(apiKey);
      this.validateImageGenerationCapability(options.model);

      // AI SDK 目前不直接支持图像生成，我们需要使用原生OpenAI客户端
      // 这里暂时抛出错误，表示需要在未来版本中实现
      throw new LLMAdapterError(
        "Image generation via AI SDK is not yet implemented. Will be added in future versions.",
        "NOT_IMPLEMENTED"
      );
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // 重写父类方法以暂时禁用图像生成功能
  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    // 暂时禁用图像生成，因为AI SDK不直接支持
    if (capability === "imageGeneration") {
      return false;
    }

    return super.supportsCapability(modelId, capability);
  }
}

/**
 * OpenAI 适配器工厂
 */
export class OpenAIAdapterFactory implements AdapterFactory {
  createAdapter(): OpenAIAdapter {
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

// 自动注册适配器
const registry = AdapterRegistry.getInstance();
registry.register("openai", new OpenAIAdapterFactory());
