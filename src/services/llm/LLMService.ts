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
  ProviderConfig,
} from "./BaseAdapter";
import { AdapterRegistry } from "./adapters/AdapterRegistry";
import { apiKeyService } from "../apiKeyService";

// 自动注册所有适配器
import "./adapters/MockAdapter";
import "./adapters/OpenAIAdapter";
import "./adapters/ClaudeAdapter";
import "./adapters/GeminiAdapter";
import "./adapters/OllamaAdapter";

/**
 * 提供者注册信息
 */
interface ProviderRegistration {
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
 * 使用 AdapterRegistry 系统进行统一管理
 */
export class LLMService {
  private registry: AdapterRegistry;
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

    // 使用单例注册表
    this.registry = AdapterRegistry.getInstance();

    // 初始化所有注册的提供者
    this.initializeProviders();

    this.log("LLM Service initialized");
  }

  /**
   * 初始化所有注册的提供者
   */
  private initializeProviders(): void {
    const providerIds = this.registry.getProviderIds();

    for (const providerId of providerIds) {
      this.providers.set(providerId, {
        enabled: true,
      });

      const factory = this.registry.getFactory(providerId);
      if (factory) {
        const info = factory.getProviderInfo();
        this.log(
          `Provider ${providerId} (${info.name}) registered successfully`
        );
      }
    }
  }

  /**
   * 注册新的提供者适配器 (向后兼容)
   */
  registerProvider(factory: AdapterFactory): void {
    const info = factory.getProviderInfo();

    // 注册到全局注册表
    this.registry.register(info.id, factory);

    // 更新本地提供者映射
    this.providers.set(info.id, {
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
   * 加载提供商配置
   */
  private async loadProviderConfig(
    providerId: string
  ): Promise<ProviderConfig | null> {
    try {
      const { dbHelpers } = await import("../db");
      const configKey = `provider_config_${providerId}`;
      const savedConfig = await dbHelpers.getSetting(configKey);
      return savedConfig || null;
    } catch (error) {
      this.log(`Failed to load config for provider ${providerId}: ${error}`);
      return null;
    }
  }

  /**
   * 合并默认配置和保存的配置
   */
  private mergeProviderConfig(
    adapter: BaseAdapter,
    savedConfig: ProviderConfig | null,
    options: TextGenerationOptions | ImageGenerationOptions
  ): TextGenerationOptions | ImageGenerationOptions {
    // 如果适配器不支持配置或没有保存的配置，直接返回原始选项
    if (!adapter.getDefaultConfig || !savedConfig) {
      return options;
    }

    try {
      const defaultConfig = adapter.getDefaultConfig();
      const mergedConfig = { ...defaultConfig, ...savedConfig };

      // 根据配置类型合并参数
      if ("stream" in options) {
        // 文本生成选项
        const textOptions = options as TextGenerationOptions;
        const textConfig = mergedConfig.textGeneration || {};

        return {
          ...textOptions,
          temperature: textConfig.temperature ?? textOptions.temperature,
          maxTokens: textConfig.maxTokens ?? textOptions.maxTokens,
          // 添加其他参数的合并逻辑
        };
      } else {
        // 图像生成选项
        const imageOptions = options as ImageGenerationOptions;
        const imageConfig = mergedConfig.imageGeneration || {};

        return {
          ...imageOptions,
          size: imageConfig.size ?? imageOptions.size,
          quality: imageConfig.quality ?? imageOptions.quality,
          // 添加其他参数的合并逻辑
        };
      }
    } catch (error) {
      this.log(`Failed to merge provider config: ${error}`);
      return options;
    }
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

    // 使用注册表创建新实例
    try {
      const adapter = this.registry.createAdapter(providerId);

      if (!adapter) {
        throw new Error(`No factory found for provider ${providerId}`);
      }

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
      const factory = this.registry.getFactory(id);
      const info = factory?.getProviderInfo() || {
        name: id,
        description: undefined,
      };

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
   * 自动获取API密钥并执行文本生成
   */
  async generateTextWithStoredKey(
    providerId: string,
    prompt: string,
    options: TextGenerationOptions
  ): Promise<ExecutionResult<TextResponse | ReadableStream<StreamChunk>>> {
    try {
      // 从安全存储中获取API密钥
      const keyResult = await apiKeyService.safeGetApiKey(providerId);

      if (!keyResult.success) {
        const duration = 0;
        return {
          success: false,
          error: new LLMAdapterError(
            keyResult.userMessage ||
              `Failed to retrieve API key for ${providerId}`,
            keyResult.error || "API_KEY_ERROR",
            401
          ),
          providerId,
          modelId: options.model,
          duration,
        };
      }

      // 使用检索到的API密钥生成文本
      const result = await this.generateText(
        providerId,
        prompt,
        options,
        keyResult.apiKey!
      );

      // 清理敏感数据
      apiKeyService.clearSensitiveData();

      return result;
    } catch (error) {
      const llmError =
        error instanceof LLMAdapterError
          ? error
          : new LLMAdapterError(
              `Failed to generate text with stored key: ${error}`,
              "UNEXPECTED_ERROR"
            );

      return {
        success: false,
        error: llmError,
        providerId,
        modelId: options.model,
        duration: 0,
      };
    }
  }

  /**
   * 执行文本生成（需要手动传入API密钥）
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

      // 加载和合并提供商配置
      const savedConfig = await this.loadProviderConfig(providerId);
      const mergedOptions = this.mergeProviderConfig(
        adapter,
        savedConfig,
        options
      ) as TextGenerationOptions;

      this.log(
        `Generating text with ${providerId} (model: ${mergedOptions.model})`
      );

      const result = await this.executeWithRetry(async () => {
        return await adapter.generateText(prompt, mergedOptions, apiKey);
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
   * 自动获取API密钥并执行图像生成
   */
  async generateImageWithStoredKey(
    providerId: string,
    prompt: string,
    options: ImageGenerationOptions
  ): Promise<ExecutionResult<ImageResponse[]>> {
    try {
      // 从安全存储中获取API密钥
      const keyResult = await apiKeyService.safeGetApiKey(providerId);

      if (!keyResult.success) {
        const duration = 0;
        return {
          success: false,
          error: new LLMAdapterError(
            keyResult.userMessage ||
              `Failed to retrieve API key for ${providerId}`,
            keyResult.error || "API_KEY_ERROR",
            401
          ),
          providerId,
          modelId: options.model,
          duration,
        };
      }

      // 使用检索到的API密钥生成图像
      const result = await this.generateImage(
        providerId,
        prompt,
        options,
        keyResult.apiKey!
      );

      // 清理敏感数据
      apiKeyService.clearSensitiveData();

      return result;
    } catch (error) {
      const llmError =
        error instanceof LLMAdapterError
          ? error
          : new LLMAdapterError(
              `Failed to generate image with stored key: ${error}`,
              "UNEXPECTED_ERROR"
            );

      return {
        success: false,
        error: llmError,
        providerId,
        modelId: options.model,
        duration: 0,
      };
    }
  }

  /**
   * 执行图像生成（需要手动传入API密钥）
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

      // 加载和合并提供商配置
      const savedConfig = await this.loadProviderConfig(providerId);
      const mergedOptions = this.mergeProviderConfig(
        adapter,
        savedConfig,
        options
      ) as ImageGenerationOptions;

      this.log(
        `Generating image with ${providerId} (model: ${mergedOptions.model})`
      );

      const result = await this.executeWithRetry(async () => {
        return await adapter.generateImage!(prompt, mergedOptions, apiKey);
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
   * 检查提供者连接状态
   */
  async checkProviderHealth(providerId: string): Promise<{
    healthy: boolean;
    message: string;
    latency?: number;
  }> {
    const startTime = Date.now();

    try {
      const adapter = this.getAdapter(providerId);

      // 尝试获取API密钥
      const keyResult = await apiKeyService.safeGetApiKey(providerId);
      if (!keyResult.success) {
        return {
          healthy: false,
          message: keyResult.userMessage || "API密钥未配置",
        };
      }

      // 验证API密钥
      const isValid = await adapter.validateApiKey(keyResult.apiKey!);
      const latency = Date.now() - startTime;

      if (isValid) {
        return {
          healthy: true,
          message: "连接正常",
          latency,
        };
      } else {
        return {
          healthy: false,
          message: "API密钥验证失败",
          latency,
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "未知错误";

      return {
        healthy: false,
        message: `连接失败: ${errorMessage}`,
        latency,
      };
    }
  }

  /**
   * 检查所有启用提供者的健康状态
   */
  async checkAllProvidersHealth(): Promise<
    Record<
      string,
      {
        healthy: boolean;
        message: string;
        latency?: number;
      }
    >
  > {
    const results: Record<
      string,
      {
        healthy: boolean;
        message: string;
        latency?: number;
      }
    > = {};

    const enabledProviders = Array.from(this.providers.entries())
      .filter(([_, registration]) => registration.enabled)
      .map(([id]) => id);

    await Promise.allSettled(
      enabledProviders.map(async (providerId) => {
        const health = await this.checkProviderHealth(providerId);
        results[providerId] = health;
      })
    );

    return results;
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
