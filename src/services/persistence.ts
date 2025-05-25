import { db, dbHelpers, initializeDatabase } from "./db";

// 保存状态到 IndexedDB
export const saveToIndexedDB = async (
  state: any,
  key: string
): Promise<void> => {
  try {
    await dbHelpers.setSetting(key, state);
  } catch (error) {
    console.error(`Failed to save state ${key} to IndexedDB:`, error);
  }
};

// 从 IndexedDB 加载状态
export const loadFromIndexedDB = async (key: string): Promise<any> => {
  try {
    return await dbHelpers.getSetting(key);
  } catch (error) {
    console.error(`Failed to load state ${key} from IndexedDB:`, error);
    return null;
  }
};

// 数据库初始化和应用启动服务
export class AppInitializationService {
  private static instance: AppInitializationService;
  private isInitialized = false;
  private initPromise: Promise<boolean> | null = null;

  static getInstance(): AppInitializationService {
    if (!AppInitializationService.instance) {
      AppInitializationService.instance = new AppInitializationService();
    }
    return AppInitializationService.instance;
  }

  async initialize(): Promise<boolean> {
    // 如果已经初始化或正在初始化，返回现有的 Promise
    if (this.isInitialized) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.performInitialization();
    return this.initPromise;
  }

  private async performInitialization(): Promise<boolean> {
    try {
      console.log("🚀 Initializing Prompt Forge application...");

      // 1. 初始化数据库
      const dbInitialized = await initializeDatabase();
      if (!dbInitialized) {
        throw new Error("Failed to initialize database");
      }

      // 2. 检查数据库健康状态
      await this.checkDatabaseHealth();

      // 3. 迁移旧数据（如果需要）
      await this.migrateDataIfNeeded();

      // 4. 清理过期数据
      await this.cleanupExpiredData();

      this.isInitialized = true;
      console.log("✅ Application initialized successfully");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize application:", error);
      this.initPromise = null;
      return false;
    }
  }

  private async checkDatabaseHealth(): Promise<void> {
    try {
      // 测试基本的数据库操作
      const stats = await dbHelpers.getStats();
      console.log("📊 Database stats:", stats);

      // 验证所有表都可访问
      await Promise.all([
        db.prompts.limit(1).toArray(),
        db.responses.limit(1).toArray(),
        db.apiKeys.limit(1).toArray(),
        db.userSettings.limit(1).toArray(),
      ]);

      console.log("✅ Database health check passed");
    } catch (error) {
      console.error("❌ Database health check failed:", error);
      throw error;
    }
  }

  private async migrateDataIfNeeded(): Promise<void> {
    try {
      // 检查是否需要数据迁移
      const currentVersion = await dbHelpers.getSetting("app_version", "0.0.0");
      const targetVersion = "0.1.0"; // 当前应用版本

      if (currentVersion !== targetVersion) {
        console.log(
          `🔄 Migrating data from ${currentVersion} to ${targetVersion}`
        );

        // 这里可以添加具体的数据迁移逻辑
        // 例如：
        // if (currentVersion === '0.0.0') {
        //   await this.migrateFromV0ToV1()
        // }

        // 更新版本号
        await dbHelpers.setSetting("app_version", targetVersion);
        console.log("✅ Data migration completed");
      }
    } catch (error) {
      console.error("❌ Data migration failed:", error);
      throw error;
    }
  }

  private async cleanupExpiredData(): Promise<void> {
    try {
      // 获取用户设置的数据保留天数，默认 30 天
      const retentionDays = await dbHelpers.getSetting(
        "data_retention_days",
        30
      );

      if (retentionDays && retentionDays > 0) {
        const deletedCount = await dbHelpers.clearOldData(retentionDays);
        if (deletedCount > 0) {
          console.log(`🧹 Cleaned up ${deletedCount} old records`);
        }
      }
    } catch (error) {
      console.error("❌ Data cleanup failed:", error);
      // 不抛出错误，因为清理失败不应该阻止应用启动
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async waitForInitialization(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    return this.initialize();
  }
}

// 应用状态管理器
export class AppStateManager {
  private static instance: AppStateManager;

  static getInstance(): AppStateManager {
    if (!AppStateManager.instance) {
      AppStateManager.instance = new AppStateManager();
    }
    return AppStateManager.instance;
  }

  // 同步用户设置到 IndexedDB
  async syncUserSettings(settings: any): Promise<void> {
    try {
      await dbHelpers.setSetting("user_settings", settings);
    } catch (error) {
      console.error("Failed to sync user settings:", error);
    }
  }

  // 从 IndexedDB 加载用户设置
  async loadUserSettings(): Promise<any> {
    try {
      return await dbHelpers.getSetting("user_settings", null);
    } catch (error) {
      console.error("Failed to load user settings:", error);
      return null;
    }
  }

  // 导出所有应用数据
  async exportAppData(): Promise<{
    prompts: any[];
    responses: any[];
    userSettings: any;
    exportDate: string;
    version: string;
  }> {
    try {
      const [prompts, responses, settings] = await Promise.all([
        dbHelpers.getPrompts(),
        db.responses.toArray(),
        this.loadUserSettings(),
      ]);

      return {
        prompts: prompts.map((p) => ({
          ...p,
          timestamp: p.timestamp.toISOString(),
        })),
        responses: responses.map((r) => ({
          ...r,
          timestamp: r.timestamp.toISOString(),
        })),
        userSettings: settings,
        exportDate: new Date().toISOString(),
        version: "0.1.0",
      };
    } catch (error) {
      console.error("Failed to export app data:", error);
      throw error;
    }
  }

  // 导入应用数据
  async importAppData(
    data: any,
    options: {
      overwrite?: boolean;
      mergeSettings?: boolean;
    } = {}
  ): Promise<void> {
    try {
      // 验证数据格式
      if (!data.prompts || !data.responses) {
        throw new Error("Invalid data format");
      }

      await db.transaction(
        "rw",
        [db.prompts, db.responses, db.userSettings],
        async () => {
          if (options.overwrite) {
            // 清除现有数据（除了 API 密钥）
            await db.prompts.clear();
            await db.responses.clear();
            if (!options.mergeSettings) {
              await db.userSettings.where("key").notEqual("api_keys").delete();
            }
          }

          // 导入提示数据
          for (const prompt of data.prompts) {
            await db.prompts.add({
              ...prompt,
              timestamp: new Date(prompt.timestamp),
            });
          }

          // 导入响应数据
          for (const response of data.responses) {
            await db.responses.add({
              ...response,
              timestamp: new Date(response.timestamp),
            });
          }

          // 导入用户设置
          if (
            data.userSettings &&
            (options.overwrite || options.mergeSettings)
          ) {
            await dbHelpers.setSetting("user_settings", data.userSettings);
          }
        }
      );

      console.log("✅ Data import completed successfully");
    } catch (error) {
      console.error("❌ Failed to import app data:", error);
      throw error;
    }
  }
}

// 导出服务实例
export const appInitService = AppInitializationService.getInstance();
export const appStateManager = AppStateManager.getInstance();
