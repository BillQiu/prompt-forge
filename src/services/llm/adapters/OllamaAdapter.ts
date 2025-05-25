import { createOllama } from "ollama-ai-provider";
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
 * Ollama 适配器配置
 */
export interface OllamaAdapterConfig {
  /** Ollama 服务器基础URL */
  baseURL?: string;
  /** 是否启用模型自动发现 */
  enableModelDiscovery?: boolean;
  /** 模型刷新间隔（秒） */
  modelRefreshInterval?: number;
  /** 是否启用详细日志 */
  verbose?: boolean;
}

/**
 * Ollama 适配器，用于与本地 Ollama 服务交互
 * 支持动态模型发现和管理
 * 使用 AI SDK 统一接口
 */
export class OllamaAdapter extends AbstractAdapter {
  readonly providerId = "ollama";
  readonly providerName = "Ollama";
  readonly description = "Local Ollama models for text generation and chat";

  private config: OllamaAdapterConfig;
  private dynamicModels: ModelInfo[] = [];
  private lastModelRefresh: number = 0;

  // 默认的基础模型配置（在无法连接到Ollama时使用）
  private static readonly DEFAULT_MODELS: ModelInfo[] = [
    {
      id: "llama3.3:latest",
      name: "Llama 3.3",
      description: "Meta's latest Llama model for general purpose tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 8192,
      },
      pricing: {
        inputCostPer1KTokens: 0, // 本地部署，无费用
        outputCostPer1KTokens: 0,
      },
    },
    {
      id: "llama3.2:latest",
      name: "Llama 3.2",
      description: "Meta's Llama 3.2 model for various text tasks",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 8192,
      },
      pricing: {
        inputCostPer1KTokens: 0,
        outputCostPer1KTokens: 0,
      },
    },
    {
      id: "codellama:latest",
      name: "Code Llama",
      description: "Specialized model for code generation and programming",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 16384,
      },
      pricing: {
        inputCostPer1KTokens: 0,
        outputCostPer1KTokens: 0,
      },
    },
    {
      id: "gemma2:latest",
      name: "Gemma 2",
      description: "Google's Gemma 2 model",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 8192,
      },
      pricing: {
        inputCostPer1KTokens: 0,
        outputCostPer1KTokens: 0,
      },
    },
    {
      id: "qwen2.5:latest",
      name: "Qwen 2.5",
      description: "Alibaba's Qwen 2.5 model with multilingual support",
      capabilities: {
        textGeneration: true,
        imageGeneration: false,
        streaming: true,
        contextLength: 32768,
      },
      pricing: {
        inputCostPer1KTokens: 0,
        outputCostPer1KTokens: 0,
      },
    },
  ];

  constructor(config: OllamaAdapterConfig = {}) {
    super(OllamaAdapter.DEFAULT_MODELS);
    this.config = {
      baseURL: "http://localhost:11434/api",
      enableModelDiscovery: true,
      modelRefreshInterval: 300, // 5分钟
      verbose: false,
      ...config,
    };

    // 初始化时尝试发现模型
    if (this.config.enableModelDiscovery) {
      this.refreshModels().catch((error) => {
        if (this.config.verbose) {
          console.warn("初始模型发现失败:", error);
        }
      });
    }
  }

  /**
   * 获取配置好的语言模型实例
   */
  private getLanguageModel(modelId: string): LanguageModel {
    const ollama = createOllama({
      baseURL: this.config.baseURL,
    });
    return ollama(modelId as any);
  }

  /**
   * 重写父类方法以支持动态模型
   */
  getSupportedModels(): ModelInfo[] {
    const shouldRefresh = this.shouldRefreshModels();

    if (shouldRefresh && this.config.enableModelDiscovery) {
      // 异步刷新模型，但立即返回当前可用的模型
      this.refreshModels().catch((error) => {
        if (this.config.verbose) {
          console.warn("模型刷新失败:", error);
        }
      });
    }

    // 合并默认模型和动态发现的模型
    const allModels = [...super.getSupportedModels(), ...this.dynamicModels];

    // 去重（以动态模型为准）
    const uniqueModels = allModels.reduce((acc, model) => {
      const existing = acc.find((m) => m.id === model.id);
      if (!existing) {
        acc.push(model);
      }
      return acc;
    }, [] as ModelInfo[]);

    return uniqueModels;
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Ollama 通常不需要 API 密钥（本地部署）
      // 但我们可以通过尝试连接来验证服务是否可用
      const baseURL = this.config.baseURL || "http://localhost:11434/api";
      const response = await fetch(`${baseURL.replace("/api", "")}/api/tags`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      return response.ok;
    } catch (error) {
      if (this.config.verbose) {
        console.warn("Ollama服务验证失败:", error);
      }
      return false;
    }
  }

  async generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>> {
    try {
      // 对于Ollama，我们不强制要求API密钥，但会验证能力
      this.validateTextGenerationCapability(options.model);

      // 确保模型可用
      await this.ensureModelAvailable(options.model);

      const model = this.getLanguageModel(options.model);

      // 使用标准化消息构建器
      const messages = this.createMessageBuilder()
        .addSystemPrompt(options.systemPrompt || "")
        .addContext(options.context || "")
        .addUserMessage(prompt)
        .build();

      // 日志记录
      if (this.config.verbose) {
        console.log("OllamaAdapter generateText:", {
          model: options.model,
          baseURL: this.config.baseURL,
          stream: options.stream,
        });
      }

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

  // Ollama目前不支持图像生成，但保持接口一致性
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

  /**
   * 手动刷新可用模型列表
   */
  async refreshModels(): Promise<void> {
    try {
      if (this.config.verbose) {
        console.log("正在刷新Ollama模型列表...");
      }

      const baseURL = this.config.baseURL || "http://localhost:11434/api";
      const response = await fetch(`${baseURL.replace("/api", "")}/api/tags`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models || [];

      this.dynamicModels = models.map((model: any) =>
        this.mapOllamaModelToModelInfo(model)
      );
      this.lastModelRefresh = Date.now();

      if (this.config.verbose) {
        console.log(
          `发现 ${this.dynamicModels.length} 个Ollama模型:`,
          this.dynamicModels.map((m) => m.id)
        );
      }
    } catch (error) {
      if (this.config.verbose) {
        console.warn("刷新Ollama模型失败:", error);
      }
      // 刷新失败时保持现有模型列表
      throw new LLMAdapterError(
        `Failed to refresh Ollama models: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "SERVICE_UNAVAILABLE"
      );
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OllamaAdapterConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.config.verbose) {
      console.log("OllamaAdapter配置更新:", this.config);
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): OllamaAdapterConfig {
    return { ...this.config };
  }

  /**
   * 获取本地可用模型的简单列表
   */
  async getLocalModels(): Promise<string[]> {
    try {
      await this.refreshModels();
      return this.dynamicModels.map((model) => model.id);
    } catch (error) {
      if (this.config.verbose) {
        console.warn("获取本地模型列表失败:", error);
      }
      return [];
    }
  }

  /**
   * 检查Ollama服务是否运行
   */
  async isServiceRunning(): Promise<boolean> {
    try {
      const baseURL = this.config.baseURL || "http://localhost:11434/api";
      const response = await fetch(
        `${baseURL.replace("/api", "")}/api/version`,
        {
          method: "GET",
        }
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 确保指定模型可用
   */
  private async ensureModelAvailable(modelId: string): Promise<void> {
    const allModels = this.getSupportedModels();
    const model = allModels.find((m) => m.id === modelId);

    if (!model) {
      // 尝试刷新模型列表
      await this.refreshModels();

      const refreshedModels = this.getSupportedModels();
      const refreshedModel = refreshedModels.find((m) => m.id === modelId);

      if (!refreshedModel) {
        throw new LLMAdapterError(
          `Model ${modelId} is not available in Ollama. Available models: ${refreshedModels
            .map((m) => m.id)
            .join(", ")}`,
          "MODEL_NOT_FOUND"
        );
      }
    }
  }

  /**
   * 判断是否需要刷新模型
   */
  private shouldRefreshModels(): boolean {
    if (!this.config.enableModelDiscovery) return false;

    const now = Date.now();
    const refreshInterval = (this.config.modelRefreshInterval ?? 300) * 1000; // 转换为毫秒

    return now - this.lastModelRefresh > refreshInterval;
  }

  /**
   * 将Ollama模型信息映射为标准ModelInfo格式
   */
  private mapOllamaModelToModelInfo(ollamaModel: any): ModelInfo {
    const modelId = ollamaModel.name || ollamaModel.model;
    const size = ollamaModel.size || 0;
    const modifiedAt = ollamaModel.modified_at;

    // 根据模型名称推断能力
    const isCodeModel = modelId.toLowerCase().includes("code");
    const isLargeModel = size > 7000000000; // 7GB以上认为是大模型

    return {
      id: modelId,
      name: this.formatModelName(modelId),
      description: this.generateModelDescription(modelId, size, modifiedAt),
      capabilities: {
        textGeneration: true,
        imageGeneration: false, // Ollama目前主要支持文本生成
        streaming: true,
        contextLength: this.estimateContextLength(modelId, isLargeModel),
      },
      pricing: {
        inputCostPer1KTokens: 0, // 本地部署无费用
        outputCostPer1KTokens: 0,
      },
    };
  }

  /**
   * 格式化模型名称
   */
  private formatModelName(modelId: string): string {
    // 移除版本标记并美化名称
    const baseName = modelId.split(":")[0];

    // 常见模型名称映射
    const nameMap: Record<string, string> = {
      "llama3.3": "Llama 3.3",
      "llama3.2": "Llama 3.2",
      "llama3.1": "Llama 3.1",
      llama3: "Llama 3",
      llama2: "Llama 2",
      codellama: "Code Llama",
      gemma2: "Gemma 2",
      gemma: "Gemma",
      "qwen2.5": "Qwen 2.5",
      qwen2: "Qwen 2",
      qwen: "Qwen",
      mistral: "Mistral",
      phi3: "Phi-3",
      dolphin: "Dolphin",
      "neural-chat": "Neural Chat",
    };

    return (
      nameMap[baseName] || baseName.charAt(0).toUpperCase() + baseName.slice(1)
    );
  }

  /**
   * 生成模型描述
   */
  private generateModelDescription(
    modelId: string,
    size: number,
    modifiedAt?: string
  ): string {
    const baseName = modelId.split(":")[0].toLowerCase();
    const sizeGB = size ? (size / 1024 ** 3).toFixed(1) + "GB" : "Unknown size";
    const lastModified = modifiedAt
      ? new Date(modifiedAt).toLocaleDateString()
      : "";

    let description = "";

    if (baseName.includes("llama")) {
      description = "Meta's Llama model for general purpose text generation";
    } else if (baseName.includes("code")) {
      description =
        "Specialized model for code generation and programming tasks";
    } else if (baseName.includes("gemma")) {
      description = "Google's Gemma model for various language tasks";
    } else if (baseName.includes("qwen")) {
      description = "Alibaba's Qwen model with multilingual capabilities";
    } else if (baseName.includes("mistral")) {
      description = "Mistral AI's high-performance language model";
    } else if (baseName.includes("phi")) {
      description = "Microsoft's compact and efficient Phi model";
    } else {
      description = "Local Ollama model for text generation";
    }

    return `${description} (${sizeGB}${
      lastModified ? `, updated ${lastModified}` : ""
    })`;
  }

  /**
   * 估算上下文长度
   */
  private estimateContextLength(
    modelId: string,
    isLargeModel: boolean
  ): number {
    const baseName = modelId.toLowerCase();

    // 基于模型名称的上下文长度映射
    if (baseName.includes("llama3.3") || baseName.includes("llama3.2")) {
      return 128000; // 新版Llama支持更长上下文
    }
    if (baseName.includes("qwen2.5")) {
      return 32768; // Qwen 2.5 支持较长上下文
    }
    if (baseName.includes("codellama")) {
      return 16384; // Code Llama 通常支持更长上下文
    }
    if (baseName.includes("gemma2")) {
      return 8192;
    }

    // 默认基于模型大小估算
    return isLargeModel ? 8192 : 4096;
  }
}

/**
 * Ollama 适配器工厂
 */
export class OllamaAdapterFactory implements AdapterFactory {
  private config: OllamaAdapterConfig;

  constructor(config: OllamaAdapterConfig = {}) {
    this.config = config;
  }

  createAdapter(): OllamaAdapter {
    return new OllamaAdapter(this.config);
  }

  getProviderInfo() {
    return {
      id: "ollama",
      name: "Ollama",
      description:
        "Local Ollama models with dynamic model discovery and management",
    };
  }

  /**
   * 更新工厂配置
   */
  updateConfig(config: Partial<OllamaAdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// 自动注册适配器
const registry = AdapterRegistry.getInstance();
registry.register("ollama", new OllamaAdapterFactory());
