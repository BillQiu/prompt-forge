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
import {
  AbstractAdapter,
  MessageBuilder,
  StreamHandler,
} from "./AbstractAdapter";
import { AdapterRegistry } from "./AdapterRegistry";

/**
 * Anthropic Claude 适配器，用于与 Anthropic Claude API 交互
 * 使用 AI SDK 统一接口
 */
export class ClaudeAdapter extends AbstractAdapter {
  readonly providerId = "anthropic";
  readonly providerName = "Anthropic Claude";
  readonly description =
    "Anthropic's Claude AI models for text generation and reasoning";

  private static readonly MODELS: ModelInfo[] = [
    // Claude 4 Series - Latest and most advanced
    {
      id: "claude-opus-4-20250514",
      name: "Claude 4 Opus",
      description:
        "Our most powerful and intelligent model yet, world's best coding model with sustained performance on complex tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.015, // $15.00 per 1M tokens
        outputCostPer1KTokens: 0.075, // $75.00 per 1M tokens
      },
    },
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude 4 Sonnet",
      description:
        "High-performance model with exceptional reasoning and coding capabilities, significant upgrade over 3.7",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.003, // $3.00 per 1M tokens
        outputCostPer1KTokens: 0.015, // $15.00 per 1M tokens
      },
    },
    // Claude 3.7 Series - Extended thinking capabilities
    {
      id: "claude-3-7-sonnet-20250219",
      name: "Claude 3.7 Sonnet",
      description:
        "High-performance model with extended thinking capabilities, enhanced reasoning",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.003, // $3.00 per 1M tokens
        outputCostPer1KTokens: 0.015, // $15.00 per 1M tokens
      },
    },
    // Claude 3.5 Series - Current generation
    {
      id: "claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      description:
        "Most intelligent Claude 3 model, excels at complex reasoning and coding",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.003, // $3.00 per 1M tokens
        outputCostPer1KTokens: 0.015, // $15.00 per 1M tokens
      },
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      description: "Fastest, most cost-effective model for everyday tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.0008, // $0.80 per 1M tokens
        outputCostPer1KTokens: 0.004, // $4.00 per 1M tokens
      },
    },
    // Claude 3 Series - Legacy models for compatibility
    {
      id: "claude-3-opus-20240229",
      name: "Claude 3 Opus (Legacy)",
      description:
        "Most powerful Claude 3 model for highly complex tasks (legacy)",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.015, // $15.00 per 1M tokens
        outputCostPer1KTokens: 0.075, // $75.00 per 1M tokens
      },
    },
    {
      id: "claude-3-sonnet-20240229",
      name: "Claude 3 Sonnet (Legacy)",
      description: "Balanced intelligence and speed (legacy)",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.003, // $3.00 per 1M tokens
        outputCostPer1KTokens: 0.015, // $15.00 per 1M tokens
      },
    },
    {
      id: "claude-3-haiku-20240307",
      name: "Claude 3 Haiku (Legacy)",
      description: "Fastest Claude 3 model for light tasks (legacy)",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 200000,
      },
      pricing: {
        inputCostPer1KTokens: 0.00025, // $0.25 per 1M tokens
        outputCostPer1KTokens: 0.00125, // $1.25 per 1M tokens
      },
    },
  ];

  constructor() {
    super(ClaudeAdapter.MODELS);
  }

  /**
   * 获取Claude配置的Zod schema
   */
  getConfigSchema(): z.ZodSchema<ProviderConfig> {
    return z.object({
      // 文本生成参数
      textGeneration: z
        .object({
          temperature: z.number().min(0).max(1).default(0.7),
          maxTokens: z.number().min(1).max(8192).default(2048),
          topP: z.number().min(0).max(1).default(1),
          topK: z.number().min(1).max(200).default(5),
          stop: z.array(z.string()).max(4).default([]),
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
        topK: 5,
        stop: [],
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
    const anthropic = createAnthropic({
      apiKey: apiKey,
    });
    return anthropic(modelId as any);
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      if (!apiKey) {
        return false;
      }

      const model = this.getLanguageModel("claude-3-5-haiku-20241022", apiKey);

      // 尝试一个简单的生成请求来验证API密钥
      await generateText({
        model: model,
        prompt: "Hello",
        maxTokens: 1,
      });

      return true;
    } catch (error) {
      console.warn("Anthropic Claude API key validation failed:", error);
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

        return StreamHandler.createTextStream(
          result.textStream,
          options.model,
          result.usage || Promise.resolve(undefined),
          result.finishReason || Promise.resolve(undefined),
          (error) => this.handleError(error)
        );
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
      throw this.handleError(error);
    }
  }

  // Claude目前不支持图像生成，但保持接口一致性
  async generateImage(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]> {
    throw new LLMAdapterError(
      "Image generation is not supported by Anthropic Claude models",
      "UNSUPPORTED_OPERATION"
    );
  }
}

/**
 * Anthropic Claude 适配器工厂
 */
export class ClaudeAdapterFactory implements AdapterFactory {
  createAdapter(): ClaudeAdapter {
    return new ClaudeAdapter();
  }

  getProviderInfo() {
    return {
      id: "anthropic",
      name: "Anthropic Claude",
      description:
        "Anthropic's Claude AI models for text generation and reasoning",
    };
  }
}

// 自动注册适配器
const registry = AdapterRegistry.getInstance();
registry.register("anthropic", new ClaudeAdapterFactory());
