/**
 * 基础适配器接口，定义所有 LLM 提供者适配器的通用契约
 */

// 生成选项的基础类型
export interface BaseGenerationOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any; // 允许提供者特定的选项
}

// 文本生成特定选项
export interface TextGenerationOptions extends BaseGenerationOptions {
  stream?: boolean;
  systemPrompt?: string;
  context?: string;
}

// 图像生成特定选项
export interface ImageGenerationOptions extends BaseGenerationOptions {
  size?: string;
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  numImages?: number;
  aspectRatio?: string;
}

// 响应类型
export interface TextResponse {
  content: string;
  metadata?: {
    model: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    finishReason?: string;
    [key: string]: any;
  };
}

export interface ImageResponse {
  url: string;
  metadata?: {
    model: string;
    revisedPrompt?: string;
    size?: string;
    quality?: string;
    style?: string;
    [key: string]: any;
  };
}

// 流式响应块
export interface StreamChunk {
  content: string;
  isComplete: boolean;
  metadata?: {
    [key: string]: any;
  };
}

// 错误类型
export class LLMAdapterError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = "LLMAdapterError";
  }
}

// 模型信息
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  capabilities: {
    textGeneration: boolean;
    imageGeneration: boolean;
    streaming: boolean;
    contextLength?: number;
  };
  pricing?: {
    inputCostPer1KTokens?: number;
    outputCostPer1KTokens?: number;
  };
}

/**
 * LLM 提供者适配器的基础接口
 * 所有具体的提供者适配器都必须实现这个接口
 */
export interface BaseAdapter {
  /** 提供者标识符，如 'openai', 'anthropic', 'google' */
  readonly providerId: string;

  /** 提供者显示名称 */
  readonly providerName: string;

  /** 提供者描述 */
  readonly description?: string;

  /**
   * 获取支持的模型列表
   * @returns 支持的模型信息数组
   */
  getSupportedModels(): ModelInfo[];

  /**
   * 验证 API 密钥是否有效
   * @param apiKey API 密钥
   * @returns 是否有效
   */
  validateApiKey(apiKey: string): Promise<boolean>;

  /**
   * 生成文本响应
   * @param prompt 用户提示词
   * @param options 生成选项
   * @param apiKey API 密钥
   * @returns 文本响应或流式响应
   */
  generateText(
    prompt: string,
    options: TextGenerationOptions,
    apiKey: string
  ): Promise<TextResponse | ReadableStream<StreamChunk>>;

  /**
   * 生成图像
   * @param prompt 图像描述提示词
   * @param options 生成选项
   * @param apiKey API 密钥
   * @returns 图像响应数组
   */
  generateImage?(
    prompt: string,
    options: ImageGenerationOptions,
    apiKey: string
  ): Promise<ImageResponse[]>;

  /**
   * 检查模型是否支持指定功能
   * @param modelId 模型 ID
   * @param capability 功能类型
   * @returns 是否支持
   */
  supportsCapability(
    modelId: string,
    capability: "textGeneration" | "imageGeneration" | "streaming"
  ): boolean;

  /**
   * 获取模型的上下文长度限制
   * @param modelId 模型 ID
   * @returns 上下文长度，如果未知则返回 undefined
   */
  getContextLength(modelId: string): number | undefined;

  /**
   * 获取模型的定价信息
   * @param modelId 模型 ID
   * @returns 定价信息，如果未知则返回 undefined
   */
  getPricing(
    modelId: string
  ):
    | { inputCostPer1KTokens?: number; outputCostPer1KTokens?: number }
    | undefined;
}

/**
 * 适配器工厂接口
 * 用于创建适配器实例
 */
export interface AdapterFactory {
  /**
   * 创建适配器实例
   * @returns 适配器实例
   */
  createAdapter(): BaseAdapter;

  /**
   * 获取提供者信息
   * @returns 提供者基本信息
   */
  getProviderInfo(): {
    id: string;
    name: string;
    description?: string;
  };
}
