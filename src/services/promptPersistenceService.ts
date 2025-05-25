import { dbHelpers, type Prompt, type Response } from "./db";
import type { PromptEntry, PromptResponse } from "@/stores/promptStore";

/**
 * 提示和响应数据持久化服务
 * 负责在 promptStore 的内存格式和 IndexedDB 的数据格式之间进行转换和同步
 */
export class PromptPersistenceService {
  private static instance: PromptPersistenceService;
  private isEnabled = true;

  static getInstance(): PromptPersistenceService {
    if (!PromptPersistenceService.instance) {
      PromptPersistenceService.instance = new PromptPersistenceService();
    }
    return PromptPersistenceService.instance;
  }

  /**
   * 启用/禁用自动持久化
   * @param enabled 是否启用
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * 将 PromptEntry 转换为 IndexedDB 的 Prompt 格式
   */
  private convertPromptEntryToDBPrompt(entry: PromptEntry): Omit<Prompt, "id"> {
    return {
      timestamp: entry.timestamp,
      promptText: entry.prompt,
      mode: "text", // 当前仅支持文本模式
      providers: entry.providers,
      models: entry.models,
      status: this.mapPromptStatusToDB(entry.status),
      metadata: {
        textParams: {
          temperature: 0.7, // 默认值，未来可从设置中获取
          maxTokens: 2048,
          topP: 1.0,
        },
      },
    };
  }

  /**
   * 将 PromptResponse 转换为 IndexedDB 的 Response 格式
   */
  private convertPromptResponseToDBResponse(
    response: PromptResponse,
    dbPromptId: number
  ): Omit<Response, "id"> {
    return {
      promptId: dbPromptId,
      providerId: response.providerId,
      model: response.model,
      responseText: response.response,
      timestamp: response.timestamp,
      error: response.error,
      status: this.mapResponseStatusToDB(response.status),
      metadata: {
        duration: response.duration,
        finishReason: response.status === "success" ? "stop" : "error",
        tokensUsed: response.response.length, // 粗略估算，未来可优化
      },
    };
  }

  /**
   * 将 IndexedDB 的 Prompt 转换为 PromptEntry 格式（用于加载）
   */
  private convertDBPromptToPromptEntry(
    dbPrompt: Prompt,
    responses: Response[]
  ): PromptEntry {
    return {
      id: dbPrompt.id!.toString(),
      prompt: dbPrompt.promptText,
      providers: dbPrompt.providers,
      models: dbPrompt.models,
      timestamp: dbPrompt.timestamp,
      status: this.mapPromptStatusFromDB(dbPrompt.status),
      responses: responses.map((response) =>
        this.convertDBResponseToPromptResponse(
          response,
          dbPrompt.id!.toString()
        )
      ),
    };
  }

  /**
   * 将 IndexedDB 的 Response 转换为 PromptResponse 格式
   */
  private convertDBResponseToPromptResponse(
    dbResponse: Response,
    promptId: string
  ): PromptResponse {
    return {
      id: dbResponse.id!.toString(),
      promptId,
      providerId: dbResponse.providerId,
      model: dbResponse.model,
      response: dbResponse.responseText || "",
      status: this.mapResponseStatusFromDB(dbResponse.status),
      timestamp: dbResponse.timestamp,
      duration: dbResponse.metadata?.duration,
      error: dbResponse.error,
      isStreaming: false, // 加载时不再是流式状态
    };
  }

  /**
   * 映射 PromptEntry 状态到数据库状态
   */
  private mapPromptStatusToDB(status: PromptEntry["status"]): Prompt["status"] {
    switch (status) {
      case "pending":
        return "pending";
      case "completed":
        return "completed";
      case "error":
        return "error";
      case "cancelled":
        return "cancelled";
      default:
        return "pending";
    }
  }

  /**
   * 映射数据库状态到 PromptEntry 状态
   */
  private mapPromptStatusFromDB(
    status: Prompt["status"]
  ): PromptEntry["status"] {
    switch (status) {
      case "pending":
        return "pending";
      case "completed":
        return "completed";
      case "error":
        return "error";
      case "cancelled":
        return "cancelled";
      default:
        return "pending";
    }
  }

  /**
   * 映射 PromptResponse 状态到数据库状态
   */
  private mapResponseStatusToDB(
    status: PromptResponse["status"]
  ): Response["status"] {
    switch (status) {
      case "pending":
      case "streaming":
        return "streaming";
      case "success":
        return "completed";
      case "error":
      case "cancelled":
        return "error";
      default:
        return "streaming";
    }
  }

  /**
   * 映射数据库状态到 PromptResponse 状态
   */
  private mapResponseStatusFromDB(
    status: Response["status"]
  ): PromptResponse["status"] {
    switch (status) {
      case "streaming":
        return "streaming";
      case "completed":
        return "success";
      case "error":
        return "error";
      default:
        return "pending";
    }
  }

  /**
   * 保存提示到 IndexedDB
   * @param entry 提示条目
   * @returns 数据库中的提示 ID
   */
  async savePrompt(entry: PromptEntry): Promise<number | null> {
    if (!this.isEnabled) return null;

    try {
      const dbPrompt = this.convertPromptEntryToDBPrompt(entry);
      const promptId = await dbHelpers.createPrompt(dbPrompt);
      console.log(`✅ Prompt saved to IndexedDB with ID: ${promptId}`);
      return promptId;
    } catch (error) {
      console.error("❌ Failed to save prompt to IndexedDB:", error);
      return null;
    }
  }

  /**
   * 更新提示状态
   * @param promptId 数据库提示 ID
   * @param status 新状态
   */
  async updatePromptStatus(
    promptId: number,
    status: PromptEntry["status"]
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const dbStatus = this.mapPromptStatusToDB(status);
      await dbHelpers.updatePromptStatus(promptId, dbStatus);
      console.log(`✅ Prompt ${promptId} status updated to: ${status}`);
    } catch (error) {
      console.error(`❌ Failed to update prompt ${promptId} status:`, error);
    }
  }

  /**
   * 保存响应到 IndexedDB
   * @param response 响应对象
   * @param dbPromptId 关联的数据库提示 ID
   * @returns 数据库中的响应 ID
   */
  async saveResponse(
    response: PromptResponse,
    dbPromptId: number
  ): Promise<number | null> {
    if (!this.isEnabled) return null;

    try {
      const dbResponse = this.convertPromptResponseToDBResponse(
        response,
        dbPromptId
      );
      const responseId = await dbHelpers.createResponse(dbResponse);
      console.log(`✅ Response saved to IndexedDB with ID: ${responseId}`);
      return responseId;
    } catch (error) {
      console.error("❌ Failed to save response to IndexedDB:", error);
      return null;
    }
  }

  /**
   * 更新响应
   * @param responseId 数据库响应 ID
   * @param updates 要更新的字段
   */
  async updateResponse(
    responseId: number,
    updates: Partial<PromptResponse>
  ): Promise<void> {
    if (!this.isEnabled) return;

    try {
      const dbUpdates: Partial<Response> = {};

      if (updates.response !== undefined) {
        dbUpdates.responseText = updates.response;
      }
      if (updates.status !== undefined) {
        dbUpdates.status = this.mapResponseStatusToDB(updates.status);
      }
      if (updates.error !== undefined) {
        dbUpdates.error = updates.error;
      }
      if (updates.duration !== undefined) {
        dbUpdates.metadata = {
          duration: updates.duration,
          finishReason: updates.status === "success" ? "stop" : "error",
          tokensUsed: updates.response?.length || 0,
        };
      }

      if (Object.keys(dbUpdates).length > 0) {
        await dbHelpers.updateResponse(responseId, dbUpdates);
        console.log(`✅ Response ${responseId} updated in IndexedDB`);
      }
    } catch (error) {
      console.error(
        `❌ Failed to update response ${responseId} in IndexedDB:`,
        error
      );
    }
  }

  /**
   * 从 IndexedDB 加载历史数据
   * @param options 加载选项
   * @returns 提示条目数组
   */
  async loadPromptHistory(options?: {
    limit?: number;
    offset?: number;
  }): Promise<PromptEntry[]> {
    try {
      const prompts = await dbHelpers.getPrompts({
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      });

      const entries: PromptEntry[] = [];

      for (const prompt of prompts) {
        if (prompt.id) {
          const responses = await dbHelpers.getResponsesForPrompt(prompt.id);
          const entry = this.convertDBPromptToPromptEntry(prompt, responses);
          entries.push(entry);
        }
      }

      // 只在有数据或调试模式时打印日志
      if (entries.length > 0) {
        console.log(
          `✅ Loaded ${entries.length} prompt entries from IndexedDB`
        );
      } else if (process.env.NEXT_PUBLIC_DEBUG_DB === "true") {
        console.log(`📝 No prompt entries found in IndexedDB`);
      }
      return entries;
    } catch (error) {
      console.error("❌ Failed to load prompt history from IndexedDB:", error);
      return [];
    }
  }

  /**
   * 删除提示及其相关响应
   * @param promptId 数据库提示 ID
   */
  async deletePrompt(promptId: number): Promise<void> {
    if (!this.isEnabled) return;

    try {
      await dbHelpers.deletePrompt(promptId);
      console.log(
        `✅ Prompt ${promptId} and its responses deleted from IndexedDB`
      );
    } catch (error) {
      console.error(
        `❌ Failed to delete prompt ${promptId} from IndexedDB:`,
        error
      );
      throw error;
    }
  }

  /**
   * 清理历史数据
   * @param daysToKeep 保留天数
   */
  async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    try {
      const deletedCount = await dbHelpers.clearOldData(daysToKeep);
      // 只在实际删除了数据或调试模式时打印日志
      if (deletedCount > 0) {
        console.log(`✅ Cleaned up ${deletedCount} old records from IndexedDB`);
      } else if (process.env.NEXT_PUBLIC_DEBUG_DB === "true") {
        console.log(
          `📝 No old records to clean up (keeping ${daysToKeep} days)`
        );
      }
    } catch (error) {
      console.error("❌ Failed to cleanup old data:", error);
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<{
    totalPrompts: number;
    totalResponses: number;
    databaseSize: string;
  }> {
    try {
      const stats = await dbHelpers.getStats();
      return {
        totalPrompts: stats.totalPrompts,
        totalResponses: stats.totalResponses,
        databaseSize: stats.databaseSize,
      };
    } catch (error) {
      console.error("❌ Failed to get database stats:", error);
      return {
        totalPrompts: 0,
        totalResponses: 0,
        databaseSize: "0 MB",
      };
    }
  }
}

// 导出单例实例
export const promptPersistenceService = PromptPersistenceService.getInstance();
