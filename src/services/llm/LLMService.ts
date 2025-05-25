import {
  BaseAdapter,
  AdapterFactory,
  TextGenerationOptions,
  ImageGenerationOptions,
  TextResponse,
  ImageResponse,
  StreamChunk,
  ModelInfo,
  LLMAdapterError,
} from "./BaseAdapter";
import { MockAdapterFactory } from "./adapters/MockAdapter";

/**
 * 提供者注册信息
 */
interface ProviderRegistration {
  factory: AdapterFactory;
  instance?: BaseAdapter;
  enabled: boolean;
  lastError?: string;
}

/**
 * LLM 服务配置
 */
interface LLMServiceConfig {
  defaultProvider?: string;
  enableLogging: boolean;
  cacheAdapters: boolean;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * 请求执行结果
 */
interface ExecutionResult<T> {
  success: boolean;
  data?: T;
  error?: LLMAdapterError;
  providerId: string;
  modelId: string;
  duration: number;
}

/**
 * 中央 LLM 服务
 * 管理所有 LLM 提供者适配器，提供统一的访问接口
 */
export class LLMService {
  private providers = new Map<string, ProviderRegistration>();
  private config: LLMServiceConfig = {
    enableLogging: true,
    cacheAdapters: true,
    retryAttempts: 2,
    retryDelay: 1000,
  };

  constructor(config?: Partial<LLMServiceConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // 默认注册 Mock 适配器
    this.registerProvider(new MockAdapterFactory());

    this.log("LLM Service initialized");
  }

  /**
   * 注册新的提供者适配器
   */
  registerProvider(factory: AdapterFactory): void {
    const info = factory.getProviderInfo();

    if (this.providers.has(info.id)) {
      this.log(`Provider ${info.id} already registered, updating...`);
    }

    this.providers.set(info.id, {
      factory,
      enabled: true,
    });

    this.log(`Provider ${info.id} (${info.name}) registered successfully`);
  }

  /**
   * 移除提供者适配器
   */
  unregisterProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    if (removed) {
      this.log(`Provider ${providerId} unregistered`);
    }
    return removed;
  }

  /**
   * 启用或禁用提供者
   */
  setProviderEnabled(providerId: string, enabled: boolean): void {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new LLMAdapterError(`Provider ${providerId} not found`);
    }

    provider.enabled = enabled;
    this.log(`Provider ${providerId} ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * 获取指定提供者的适配器实例
   */
  getAdapter(providerId: string): BaseAdapter {
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new LLMAdapterError(`Provider ${providerId} not found`);
    }

    if (!provider.enabled) {
      throw new LLMAdapterError(`Provider ${providerId} is disabled`);
    }

    // 如果启用缓存且已有实例，直接返回
    if (this.config.cacheAdapters && provider.instance) {
      return provider.instance;
    }

    // 创建新实例
    try {
      const adapter = provider.factory.createAdapter();

      if (this.config.cacheAdapters) {
        provider.instance = adapter;
      }

      this.log(`Created adapter instance for provider ${providerId}`);
      return adapter;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      provider.lastError = errorMessage;
      throw new LLMAdapterError(
        `Failed to create adapter for provider ${providerId}: ${errorMessage}`,
        "ADAPTER_CREATION_ERROR"
      );
    }
  }

  /**
   * 获取所有注册的提供者信息
   */
  getProviders(): Array<{
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    hasInstance: boolean;
    lastError?: string;
  }> {
    return Array.from(this.providers.entries()).map(([id, registration]) => {
      const info = registration.factory.getProviderInfo();
      return {
        id,
        name: info.name,
        description: info.description,
        enabled: registration.enabled,
        hasInstance: !!registration.instance,
        lastError: registration.lastError,
      };
    });
  }

  /**
   * 获取所有可用的模型信息
   */
  getAllModels(): Array<
    ModelInfo & { providerId: string; providerName: string }
  > {
    const allModels: Array<
      ModelInfo & { providerId: string; providerName: string }
    > = [];

    for (const [providerId, registration] of this.providers.entries()) {
      if (!registration.enabled) continue;

      try {
        const adapter = this.getAdapter(providerId);
        const models = adapter.getSupportedModels();

        models.forEach((model) => {
          allModels.push({
            ...model,
            providerId,
            providerName: adapter.providerName,
          });
        });
      } catch (error) {
        this.log(`Failed to get models for provider ${providerId}: ${error}`);
      }
    }

    return allModels;
  }

  /**
   * 验证提供者的 API 密钥
   */
  async validateApiKey(providerId: string, apiKey: string): Promise<boolean> {
    const adapter = this.getAdapter(providerId);

    try {
      const isValid = await adapter.validateApiKey(apiKey);
      this.log(
        `API key validation for ${providerId}: ${isValid ? "valid" : "invalid"}`
      );
      return isValid;
    } catch (error) {
      this.log(`API key validation failed for ${providerId}: ${error}`);
      return false;
    }
  }

  /**
   * 执行文本生成
   */
  async generateText(
    providerId: string,
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<ExecutionResult<TextResponse | ReadableStream<StreamChunk>>> {
    const startTime = Date.now();

    try {
      const adapter = this.getAdapter(providerId);

      this.log(`Generating text with ${providerId} (model: ${options.model})`);

      const result = await this.executeWithRetry(async () => {
        return await adapter.generateText(prompt, options, apiKey);
      });

      const duration = Date.now() - startTime;

      this.log(`Text generation completed for ${providerId} in ${duration}ms`);

      return {
        success: true,
        data: result,
        providerId,
        modelId: options.model,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const llmError =
        error instanceof LLMAdapterError
          ? error
          : new LLMAdapterError(
              `Unexpected error: ${error}`,
              "UNEXPECTED_ERROR"
            );

      this.log(`Text generation failed for ${providerId}: ${llmError.message}`);

      return {
        success: false,
        error: llmError,
        providerId,
        modelId: options.model,
        duration,
      };
    }
  }

  /**
   * 执行图像生成
   */
  async generateImage(
    providerId: string,
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ExecutionResult<ImageResponse[]>> {
    const startTime = Date.now();

    try {
      const adapter = this.getAdapter(providerId);

      if (!adapter.generateImage) {
        throw new LLMAdapterError(
          `Provider ${providerId} does not support image generation`,
          "UNSUPPORTED_OPERATION"
        );
      }

      this.log(`Generating image with ${providerId} (model: ${options.model})`);

      const result = await this.executeWithRetry(async () => {
        return await adapter.generateImage!(prompt, options, apiKey);
      });

      const duration = Date.now() - startTime;

      this.log(`Image generation completed for ${providerId} in ${duration}ms`);

      return {
        success: true,
        data: result,
        providerId,
        modelId: options.model,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const llmError =
        error instanceof LLMAdapterError
          ? error
          : new LLMAdapterError(
              `Unexpected error: ${error}`,
              "UNEXPECTED_ERROR"
            );

      this.log(
        `Image generation failed for ${providerId}: ${llmError.message}`
      );

      return {
        success: false,
        error: llmError,
        providerId,
        modelId: options.model,
        duration,
      };
    }
  }

  /**
   * 检查模型能力支持
   */
  supportsCapability(
    providerId: string,
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean {
    try {
      const adapter = this.getAdapter(providerId);
      return adapter.supportsCapability(modelId, capability);
    } catch (error) {
      this.log(
        `Failed to check capability for ${providerId}/${modelId}: ${error}`
      );
      return false;
    }
  }

  /**
   * 获取模型上下文长度
   */
  getContextLength(providerId: string, modelId: string): number | undefined {
    try {
      const adapter = this.getAdapter(providerId);
      return adapter.getContextLength(modelId);
    } catch (error) {
      this.log(
        `Failed to get context length for ${providerId}/${modelId}: ${error}`
      );
      return undefined;
    }
  }

  /**
   * 获取模型定价信息
   */
  getPricing(
    providerId: string,
    modelId: string
  ):
    | { inputCostPer1KTokens?: number; outputCostPer1KTokens?: number }
    | undefined {
    try {
      const adapter = this.getAdapter(providerId);
      return adapter.getPricing(modelId);
    } catch (error) {
      this.log(`Failed to get pricing for ${providerId}/${modelId}: ${error}`);
      return undefined;
    }
  }

  /**
   * 清除所有适配器实例缓存
   */
  clearCache(): void {
    for (const provider of this.providers.values()) {
      provider.instance = undefined;
    }
    this.log("Adapter cache cleared");
  }

  /**
   * 更新服务配置
   */
  updateConfig(config: Partial<LLMServiceConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("Service configuration updated");
  }

  /**
   * 获取当前配置
   */
  getConfig(): LLMServiceConfig {
    return { ...this.config };
  }

  /**
   * 带重试的执行方法
   */
  private async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(`${error}`);

        // 如果是最后一次尝试，或者是不应重试的错误，直接抛出
        if (
          attempt === this.config.retryAttempts ||
          this.shouldNotRetry(lastError)
        ) {
          throw lastError;
        }

        // 等待后重试
        this.log(
          `Attempt ${attempt + 1} failed, retrying in ${
            this.config.retryDelay
          }ms...`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.retryDelay)
        );
      }
    }

    throw lastError!;
  }

  /**
   * 判断是否不应重试的错误
   */
  private shouldNotRetry(error: Error): boolean {
    if (error instanceof LLMAdapterError) {
      // 对于客户端错误（4xx），不重试
      return (
        error.statusCode !== undefined &&
        error.statusCode >= 400 &&
        error.statusCode < 500
      );
    }
    return false;
  }

  /**
   * 日志记录
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[LLMService] ${new Date().toISOString()} - ${message}`);
    }
  }
}

// 默认导出单例实例
export const llmService = new LLMService();

// 同时导出类以便测试或自定义实例
export { LLMService as LLMServiceClass };
