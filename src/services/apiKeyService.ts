import { dbHelpers } from "./db";
import { decryptApiKey, EncryptionError } from "./encryption";

/**
 * API 密钥服务
 * 提供从安全存储中检索和管理API密钥的功能
 */
export class ApiKeyService {
  private static instance: ApiKeyService;

  private constructor() {}

  public static getInstance(): ApiKeyService {
    if (!ApiKeyService.instance) {
      ApiKeyService.instance = new ApiKeyService();
    }
    return ApiKeyService.instance;
  }

  /**
   * 从安全存储中获取指定提供商的API密钥
   * @param providerId 提供商ID（如'openai'）
   * @returns 解密后的API密钥，如果不存在则返回null
   * @throws {Error} 当解密失败时抛出错误
   */
  async getApiKey(providerId: string): Promise<string | null> {
    try {
      // 从IndexedDB获取加密的API密钥
      const apiKeyData = await dbHelpers.getApiKey(providerId);

      if (!apiKeyData) {
        console.warn(`No API key found for provider: ${providerId}`);
        return null;
      }

      // 解密API密钥
      const decryptedKey = await decryptApiKey({
        encryptedData: apiKeyData.encryptedKey,
        iv: apiKeyData.iv,
        salt: apiKeyData.salt || "", // 兼容旧数据
        keyId: apiKeyData.keyId,
      });

      // 更新最后使用时间
      await dbHelpers.updateApiKeyLastUsed(providerId);

      console.log(`✅ Successfully retrieved API key for ${providerId}`);
      return decryptedKey;
    } catch (error) {
      console.error(`Failed to retrieve API key for ${providerId}:`, error);

      if (error instanceof EncryptionError) {
        throw new Error(
          `Failed to decrypt API key for ${providerId}: ${error.message}`
        );
      }

      throw new Error(
        `Failed to retrieve API key for ${providerId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * 检查指定提供商是否已存储API密钥
   * @param providerId 提供商ID
   * @returns 是否存储了API密钥
   */
  async hasApiKey(providerId: string): Promise<boolean> {
    try {
      const apiKeyData = await dbHelpers.getApiKey(providerId);
      return !!apiKeyData;
    } catch (error) {
      console.error(
        `Failed to check API key existence for ${providerId}:`,
        error
      );
      return false;
    }
  }

  /**
   * 获取所有已存储API密钥的提供商列表
   * @returns 提供商ID数组
   */
  async getStoredProviders(): Promise<string[]> {
    try {
      const apiKeys = await dbHelpers.getAllApiKeys();
      return apiKeys.map((key) => key.providerName);
    } catch (error) {
      console.error("Failed to get stored providers:", error);
      return [];
    }
  }

  /**
   * 安全地获取API密钥，包含错误处理和用户友好的错误消息
   * @param providerId 提供商ID
   * @returns 包含密钥或错误信息的结果对象
   */
  async safeGetApiKey(providerId: string): Promise<{
    success: boolean;
    apiKey?: string;
    error?: string;
    userMessage?: string;
  }> {
    try {
      const apiKey = await this.getApiKey(providerId);

      if (!apiKey) {
        return {
          success: false,
          error: "API_KEY_NOT_FOUND",
          userMessage: `请先在设置中配置 ${providerId.toUpperCase()} 的 API 密钥`,
        };
      }

      return {
        success: true,
        apiKey,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: "DECRYPTION_FAILED",
        userMessage: `无法解密 ${providerId.toUpperCase()} API 密钥，请重新设置`,
      };
    }
  }

  /**
   * 验证API密钥格式（基础检查）
   * @param providerId 提供商ID
   * @param apiKey API密钥
   * @returns 是否格式正确
   */
  validateApiKeyFormat(providerId: string, apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== "string") {
      return false;
    }

    switch (providerId) {
      case "openai":
        // OpenAI API密钥通常以sk-开头，长度在40-60字符之间
        return (
          apiKey.startsWith("sk-") && apiKey.length >= 40 && apiKey.length <= 60
        );

      case "anthropic":
        // Anthropic API密钥通常以sk-ant-开头
        return apiKey.startsWith("sk-ant-") && apiKey.length >= 40;

      case "google":
        // Google API密钥格式较为灵活
        return apiKey.length >= 20;

      default:
        // 对于未知提供商，只检查基本长度
        return apiKey.length >= 10;
    }
  }

  /**
   * 清理内存中的敏感数据（在API调用完成后调用）
   * 注意：JavaScript中无法真正清除内存，但这是一个最佳实践
   */
  clearSensitiveData(): void {
    // 触发垃圾回收建议（浏览器可能会忽略）
    if (typeof window !== "undefined" && "gc" in window) {
      try {
        (window as any).gc();
      } catch (e) {
        // 忽略错误，gc可能不可用
      }
    }
  }
}

// 导出单例实例
export const apiKeyService = ApiKeyService.getInstance();

// 便捷函数导出
export const getApiKey = (providerId: string) =>
  apiKeyService.getApiKey(providerId);
export const hasApiKey = (providerId: string) =>
  apiKeyService.hasApiKey(providerId);
export const safeGetApiKey = (providerId: string) =>
  apiKeyService.safeGetApiKey(providerId);
