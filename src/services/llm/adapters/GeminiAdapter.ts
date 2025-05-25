import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText, LanguageModel } from "ai";
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
 * Google Gemini 适配器，用于与 Google Gemini API 交互
 * 使用 AI SDK 统一接口
 */
export class GeminiAdapter extends AbstractAdapter {
  readonly providerId = "google";
  readonly providerName = "Google Gemini";
  readonly description =
    "Google's Gemini AI models for text generation and multimodal tasks";

  private static readonly MODELS: ModelInfo[] = [
    // Gemini 2.5 Series - Latest and most advanced
    {
      id: "gemini-2.5-flash-preview-05-20",
      name: "Gemini 2.5 Flash Preview",
      description:
        "Our best model in terms of price-performance, offering well-rounded capabilities with adaptive thinking",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1048576, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.00015, // $0.15 per 1M tokens (text/image/video)
        outputCostPer1KTokens: 0.0006, // $0.60 per 1M tokens (non-thinking)
      },
    },
    {
      id: "gemini-2.5-pro-preview-05-06",
      name: "Gemini 2.5 Pro Preview",
      description:
        "Our most powerful thinking model with maximum response accuracy and state-of-the-art performance",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1048576, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.00125, // $1.25 per 1M tokens (<=200k)
        outputCostPer1KTokens: 0.01, // $10.00 per 1M tokens (<=200k)
      },
    },
    // Gemini 2.0 Series - Next generation features
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      description:
        "Newest multimodal model with next generation features and improved capabilities, built for agentic experiences",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1048576, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.0001, // $0.10 per 1M tokens (text/image/video)
        outputCostPer1KTokens: 0.0004, // $0.40 per 1M tokens
      },
    },
    {
      id: "gemini-2.0-flash-lite",
      name: "Gemini 2.0 Flash-Lite",
      description:
        "Cost efficient and low latency model for high-frequency tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1048576, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.000075, // $0.075 per 1M tokens
        outputCostPer1KTokens: 0.0003, // $0.30 per 1M tokens
      },
    },
    // Gemini 1.5 Series - Proven and reliable
    {
      id: "gemini-1.5-pro",
      name: "Gemini 1.5 Pro",
      description:
        "Mid-size multimodal model optimized for complex reasoning tasks with 2M token context",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 2097152, // 2M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.00125, // $1.25 per 1M tokens (<=128k)
        outputCostPer1KTokens: 0.005, // $5.00 per 1M tokens (<=128k)
      },
    },
    {
      id: "gemini-1.5-flash",
      name: "Gemini 1.5 Flash",
      description:
        "Fast and versatile multimodal model for scaling across diverse tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1048576, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.000075, // $0.075 per 1M tokens (<=128k)
        outputCostPer1KTokens: 0.0003, // $0.30 per 1M tokens (<=128k)
      },
    },
    {
      id: "gemini-1.5-flash-8b",
      name: "Gemini 1.5 Flash-8B",
      description:
        "Small model designed for lower intelligence tasks at very low cost",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 1048576, // 1M tokens
      },
      pricing: {
        inputCostPer1KTokens: 0.0000375, // $0.0375 per 1M tokens (<=128k)
        outputCostPer1KTokens: 0.00015, // $0.15 per 1M tokens (<=128k)
      },
    },
    // Embedding Models
    {
      id: "text-embedding-004",
      name: "Text Embedding 004",
      description:
        "State-of-the-art text embedding model for measuring text relatedness",
      capabilities: {
        textGeneration: false,
        imageGeneration: false,
        streaming: false,
        contextLength: 2048,
      },
      pricing: {
        inputCostPer1KTokens: 0, // Free in Gemini API
        outputCostPer1KTokens: 0,
      },
    },
    // Legacy Models (for compatibility)
    {
      id: "gemini-pro",
      name: "Gemini Pro (Legacy)",
      description: "Legacy model - consider upgrading to newer versions",
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

  constructor() {
    super(GeminiAdapter.MODELS);
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
        // 使用标准化流处理器
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
}

/**
 * Google Gemini 适配器工厂
 */
export class GeminiAdapterFactory implements AdapterFactory {
  createAdapter(): GeminiAdapter {
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

// 自动注册适配器
const registry = AdapterRegistry.getInstance();
registry.register("google", new GeminiAdapterFactory());
