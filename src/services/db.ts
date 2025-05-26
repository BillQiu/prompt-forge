import Dexie, { Table } from "dexie";

// 数据模型接口
export interface Prompt {
  id?: number;
  timestamp: Date;
  promptText: string;
  mode: "text" | "image"; // 提示类型
  providers: string[]; // 选中的提供商 ID
  models: string[]; // 选中的模型 ID
  status: "pending" | "completed" | "error" | "cancelled";
  metadata?: {
    imageParams?: {
      quality?: "standard" | "hd";
      style?: "vivid" | "natural";
      size?: string;
      numberOfImages?: number;
    };
    textParams?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
    };
  };
}

export interface Response {
  id?: number;
  promptId: number; // 关联的提示 ID
  providerId: string; // 提供商 ID
  model: string; // 模型名称
  responseText?: string; // 文本响应
  imageUrl?: string; // 图像 URL（Base64 或 Blob URL）
  imageData?: Blob; // 图像二进制数据
  timestamp: Date;
  error?: string; // 错误信息
  status: "streaming" | "completed" | "error";
  metadata?: {
    tokensUsed?: number;
    duration?: number; // 响应时间（毫秒）
    finishReason?: string;
  };
}

export interface ApiKey {
  id?: number;
  providerName: string; // 提供商名称
  apiKey: string; // 明文 API 密钥
  name?: string; // 可选的密钥名称
  createdAt: Date;
  lastUsed?: Date;

  // 废弃的加密字段（为了迁移兼容性保留）
  encryptedKey?: string; // 旧的加密密钥字段
  iv?: string; // 旧的初始化向量
  salt?: string; // 旧的加密盐值
  keyId?: string; // 旧的密钥标识符
}

export interface UserSettings {
  id?: number;
  key: string; // 设置键名（唯一）
  value: string; // 设置值（JSON 字符串）
  updatedAt: Date;
}

// 数据库类
export class PromptForgeDB extends Dexie {
  // 表定义
  prompts!: Table<Prompt>;
  responses!: Table<Response>;
  apiKeys!: Table<ApiKey>;
  userSettings!: Table<UserSettings>;

  constructor() {
    super("PromptForgeDB");

    // 数据库版本 1 - 初始结构
    this.version(1).stores({
      prompts: "++id, timestamp, promptText, mode, status",
      responses: "++id, promptId, providerId, model, timestamp, status",
      apiKeys: "++id, providerName, &keyId, createdAt, lastUsed",
      userSettings: "++id, &key, updatedAt",
    });

    // 数据库版本 2 - 迁移到明文API密钥存储
    this.version(2)
      .stores({
        prompts: "++id, timestamp, promptText, mode, status",
        responses: "++id, promptId, providerId, model, timestamp, status",
        apiKeys: "++id, providerName, createdAt, lastUsed", // 移除keyId索引
        userSettings: "++id, &key, updatedAt",
      })
      .upgrade(async (tx) => {
        console.log(
          "🔄 Starting API key migration from encrypted to plaintext..."
        );

        // 获取迁移工具
        const { decryptApiKeyForMigration, MigrationError } = await import(
          "./migrationUtils"
        );

        const apiKeysTable = tx.table("apiKeys");
        const allKeys = await apiKeysTable.toArray();
        let migratedCount = 0;
        let errorCount = 0;

        for (const apiKey of allKeys) {
          try {
            // 检查是否已经是明文格式（新添加的记录）
            if (!apiKey.iv || !apiKey.salt || !apiKey.keyId) {
              // 已经是新格式，只需要重命名字段
              if (apiKey.encryptedKey && !apiKey.apiKey) {
                await apiKeysTable.update(apiKey.id!, {
                  apiKey: apiKey.encryptedKey,
                  encryptedKey: undefined,
                  iv: undefined,
                  salt: undefined,
                  keyId: undefined,
                });
                migratedCount++;
              }
              continue;
            }

            // 尝试解密旧的加密数据
            const decryptedKey = await decryptApiKeyForMigration({
              encryptedData: apiKey.encryptedKey,
              iv: apiKey.iv,
              salt: apiKey.salt,
              keyId: apiKey.keyId,
            });

            // 更新记录：添加明文密钥，移除加密字段
            await apiKeysTable.update(apiKey.id!, {
              apiKey: decryptedKey,
              encryptedKey: undefined,
              iv: undefined,
              salt: undefined,
              keyId: undefined,
            });

            migratedCount++;
            console.log(
              `✅ Migrated API key for provider: ${apiKey.providerName}`
            );
          } catch (error) {
            errorCount++;
            console.error(
              `❌ Failed to migrate API key for ${apiKey.providerName}:`,
              error
            );

            // 对于无法解密的密钥，标记为需要重新输入
            await apiKeysTable.update(apiKey.id!, {
              apiKey: "[Migration Failed - Please Re-enter]",
              encryptedKey: undefined,
              iv: undefined,
              salt: undefined,
              keyId: undefined,
            });
          }
        }

        console.log(
          `🎉 Migration completed! Migrated: ${migratedCount}, Errors: ${errorCount}`
        );
      });
  }
}

// 创建数据库实例
export const db = new PromptForgeDB();

// 数据库初始化和错误处理
export const initializeDatabase = async (): Promise<boolean> => {
  try {
    // 打开数据库
    await db.open();

    // 验证数据库是否正常工作
    await db.prompts.limit(1).toArray();

    console.log("✅ Database initialized successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to initialize database:", error);

    // 尝试删除损坏的数据库并重新创建
    try {
      await db.delete();
      await db.open();
      console.log("✅ Database recreated successfully");
      return true;
    } catch (recreateError) {
      console.error("❌ Failed to recreate database:", recreateError);
      return false;
    }
  }
};

// 数据库操作助手函数
export const dbHelpers = {
  // 提示相关操作
  async createPrompt(promptData: Omit<Prompt, "id">): Promise<number> {
    return await db.prompts.add(promptData);
  },

  async getPrompt(id: number): Promise<Prompt | undefined> {
    return await db.prompts.get(id);
  },

  async updatePromptStatus(
    id: number,
    status: Prompt["status"]
  ): Promise<void> {
    await db.prompts.update(id, { status });
  },

  async getPrompts(options?: {
    limit?: number;
    offset?: number;
    status?: Prompt["status"];
    mode?: Prompt["mode"];
    dateRange?: { start: Date; end: Date };
    providers?: string[];
    models?: string[];
    sortOrder?: "newest" | "oldest";
  }): Promise<Prompt[]> {
    let query = db.prompts.orderBy("timestamp");

    // 根据排序顺序决定是否反转
    if (options?.sortOrder === "oldest") {
      // 保持正序（最旧的在前）
    } else {
      // 默认反序（最新的在前）
      query = query.reverse();
    }

    if (options?.status) {
      query = query.filter((prompt) => prompt.status === options.status);
    }

    if (options?.mode) {
      query = query.filter((prompt) => prompt.mode === options.mode);
    }

    if (options?.providers && options.providers.length > 0) {
      query = query.filter((prompt) =>
        options.providers!.some((provider) =>
          prompt.providers.includes(provider)
        )
      );
    }

    if (options?.models && options.models.length > 0) {
      query = query.filter((prompt) =>
        options.models!.some((model) => prompt.models.includes(model))
      );
    }

    if (options?.dateRange) {
      query = query.filter(
        (prompt) =>
          prompt.timestamp >= options.dateRange!.start &&
          prompt.timestamp <= options.dateRange!.end
      );
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query.toArray();
  },

  async deletePrompt(id: number): Promise<void> {
    await db.transaction("rw", [db.prompts, db.responses], async () => {
      // 先删除相关的响应
      await db.responses.where("promptId").equals(id).delete();
      // 再删除提示
      await db.prompts.delete(id);
    });
  },

  // 响应相关操作
  async createResponse(responseData: Omit<Response, "id">): Promise<number> {
    return await db.responses.add(responseData);
  },

  async updateResponse(id: number, updates: Partial<Response>): Promise<void> {
    await db.responses.update(id, updates);
  },

  async getResponsesForPrompt(promptId: number): Promise<Response[]> {
    return await db.responses.where("promptId").equals(promptId).toArray();
  },

  // API 密钥操作
  async storeApiKey(apiKeyData: Omit<ApiKey, "id">): Promise<number> {
    // 删除同一提供商的旧密钥
    await db.apiKeys
      .where("providerName")
      .equals(apiKeyData.providerName)
      .delete();
    return await db.apiKeys.add(apiKeyData);
  },

  async getApiKey(providerName: string): Promise<ApiKey | undefined> {
    return await db.apiKeys.where("providerName").equals(providerName).first();
  },

  async getAllApiKeys(): Promise<ApiKey[]> {
    return await db.apiKeys.orderBy("createdAt").reverse().toArray();
  },

  async deleteApiKey(providerName: string): Promise<void> {
    await db.apiKeys.where("providerName").equals(providerName).delete();
  },

  async updateApiKeyLastUsed(providerName: string): Promise<void> {
    const apiKey = await db.apiKeys
      .where("providerName")
      .equals(providerName)
      .first();
    if (apiKey) {
      await db.apiKeys.update(apiKey.id!, { lastUsed: new Date() });
    }
  },

  // 用户设置操作
  async setSetting(key: string, value: any): Promise<void> {
    const settingData: Omit<UserSettings, "id"> = {
      key,
      value: JSON.stringify(value),
      updatedAt: new Date(),
    };

    const existing = await db.userSettings.where("key").equals(key).first();
    if (existing) {
      await db.userSettings.update(existing.id!, settingData);
    } else {
      await db.userSettings.add(settingData);
    }
  },

  async getSetting<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const setting = await db.userSettings.where("key").equals(key).first();
    if (setting) {
      try {
        return JSON.parse(setting.value);
      } catch (error) {
        console.error("Failed to parse setting:", key, error);
        return defaultValue;
      }
    }
    return defaultValue;
  },

  async deleteSetting(key: string): Promise<void> {
    await db.userSettings.where("key").equals(key).delete();
  },

  // 数据清理操作
  async clearAllData(): Promise<void> {
    await db.transaction(
      "rw",
      [db.prompts, db.responses, db.userSettings],
      async () => {
        await db.prompts.clear();
        await db.responses.clear();
        await db.userSettings.clear();
        // 注意：API 密钥不会被清除，需要用户手动删除
      }
    );
  },

  async clearOldData(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const oldPrompts = await db.prompts
      .where("timestamp")
      .below(cutoffDate)
      .toArray();

    const oldPromptIds = oldPrompts.map((p) => p.id!);

    // 删除旧响应
    await db.responses.where("promptId").anyOf(oldPromptIds).delete();

    // 删除旧提示
    const deletedCount = await db.prompts
      .where("timestamp")
      .below(cutoffDate)
      .delete();

    return deletedCount;
  },

  // 数据统计
  async getStats(): Promise<{
    totalPrompts: number;
    totalResponses: number;
    totalApiKeys: number;
    databaseSize: string;
  }> {
    const [totalPrompts, totalResponses, totalApiKeys] = await Promise.all([
      db.prompts.count(),
      db.responses.count(),
      db.apiKeys.count(),
    ]);

    // 估算数据库大小（这只是一个粗略估算）
    const estimatedSize =
      (totalPrompts * 500 + totalResponses * 1000 + totalApiKeys * 200) / 1024;
    const databaseSize =
      estimatedSize > 1024
        ? `${(estimatedSize / 1024).toFixed(2)} MB`
        : `${estimatedSize.toFixed(2)} KB`;

    return {
      totalPrompts,
      totalResponses,
      totalApiKeys,
      databaseSize,
    };
  },
};

// 导出数据库实例
export default db;
