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
  encryptedKey: string; // 加密后的 API 密钥
  iv: string; // 初始化向量
  salt: string; // 加密盐值
  keyId: string; // 密钥标识符
  name?: string; // 可选的密钥名称
  createdAt: Date;
  lastUsed?: Date;
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

    // 数据库版本 2 - 添加索引优化（如果需要的话）
    // this.version(2).stores({
    //   prompts: '++id, timestamp, promptText, mode, status, [providers+models]',
    //   responses: '++id, promptId, providerId, model, timestamp, status, [promptId+providerId]',
    //   apiKeys: '++id, providerName, &keyId, createdAt, lastUsed',
    //   userSettings: '++id, &key, updatedAt'
    // })
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
  }): Promise<Prompt[]> {
    let query = db.prompts.orderBy("timestamp").reverse();

    if (options?.status) {
      query = query.filter((prompt) => prompt.status === options.status);
    }

    if (options?.mode) {
      query = query.filter((prompt) => prompt.mode === options.mode);
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
