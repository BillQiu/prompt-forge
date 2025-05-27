import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import { llmService } from "@/services/llm";
import { promptPersistenceService } from "@/services/promptPersistenceService";
import type {
  TextGenerationOptions,
  TextResponse,
  StreamChunk,
} from "@/services/llm";

export interface PromptEntry {
  id: string;
  prompt: string;
  providers: string[];
  models: string[];
  timestamp: Date;
  status: "pending" | "completed" | "error" | "cancelled";
  responses: PromptResponse[];
}

export interface PromptResponse {
  id: string;
  promptId: string;
  providerId: string;
  model: string;
  response: string;
  status: "pending" | "success" | "error" | "streaming" | "cancelled";
  timestamp: Date;
  duration?: number;
  error?: string;
  isStreaming?: boolean;
  abortController?: AbortController;
  prompt?: string; // 对应的提示词，用于继续对话时显示
}

interface PromptStore {
  // 状态
  entries: PromptEntry[];
  isSubmitting: boolean;
  isLoading: boolean;

  // ID映射：内存ID -> 数据库ID
  promptIdMap: Map<string, number>;
  responseIdMap: Map<string, number>;

  // 防抖更新映射：responseId -> 定时器ID
  debounceTimers: Map<string, NodeJS.Timeout>;

  // 操作
  submitPrompt: (data: {
    prompt: string;
    providers: string[];
    models: string[];
    enableStreaming?: boolean;
    continueConversation?: string; // 可选的对话ID，用于继续现有对话
    userMessage?: string; // 用户的原始输入，用于UI显示
  }) => Promise<void>;

  updateResponse: (
    responseId: string,
    updates: Partial<PromptResponse>
  ) => void;

  appendStreamContent: (responseId: string, content: string) => void;

  cancelResponse: (responseId: string) => void;

  clearHistory: () => void;

  deleteEntry: (entryId: string) => Promise<void>;

  // 数据持久化相关
  loadHistoryFromDB: (options?: {
    limit?: number;
    offset?: number;
  }) => Promise<void>;

  refreshFromDB: () => Promise<void>;

  // 工具函数
  getEntryById: (id: string) => PromptEntry | undefined;

  // 处理流式响应的新方法
  handleStreamResponse: (
    stream: ReadableStream<StreamChunk>,
    responseId: string,
    startTime: number
  ) => Promise<void>;

  // 强制同步响应到数据库
  flushResponseToDatabase: (responseId: string) => Promise<void>;
}

export const usePromptStore = create<PromptStore>()(
  devtools(
    (set, get) => ({
      entries: [],
      isSubmitting: false,
      isLoading: false,
      promptIdMap: new Map(),
      responseIdMap: new Map(),
      debounceTimers: new Map(),

      submitPrompt: async (data) => {
        const {
          prompt,
          providers,
          models,
          enableStreaming = true,
          continueConversation,
          userMessage,
        } = data;

        set({ isSubmitting: true });

        try {
          let promptId: string;
          let promptEntry: PromptEntry;

          if (continueConversation) {
            // 继续现有对话
            const existingEntry = get().entries.find(
              (e) => e.id === continueConversation
            );
            if (!existingEntry) {
              throw new Error("找不到指定的对话记录");
            }

            promptId = existingEntry.id;
            promptEntry = existingEntry;

            // 更新对话状态为处理中
            set((state) => ({
              entries: state.entries.map((entry) =>
                entry.id === promptId
                  ? { ...entry, status: "pending" as const }
                  : entry
              ),
            }));
          } else {
            // 创建新的提示记录
            promptId = crypto.randomUUID();
            promptEntry = {
              id: promptId,
              prompt,
              providers,
              models,
              timestamp: new Date(),
              status: "pending",
              responses: [],
            };

            // 添加到状态
            set((state) => ({
              entries: [promptEntry, ...state.entries],
            }));

            // 保存提示到 IndexedDB
            const savedPromptId = await promptPersistenceService.savePrompt(
              promptEntry
            );
            if (savedPromptId) {
              // 存储ID映射
              set((state) => {
                const newPromptIdMap = new Map(state.promptIdMap);
                newPromptIdMap.set(promptId, savedPromptId);
                return { promptIdMap: newPromptIdMap };
              });
            }
          }

          // 为每个模型创建响应任务
          const responsePromises = models.map(async (modelKey) => {
            const [providerId, modelId] = modelKey.split(":");
            const responseId = crypto.randomUUID();
            const startTime = Date.now();

            const abortController = new AbortController();
            const response: PromptResponse = {
              id: responseId,
              promptId,
              providerId,
              model: modelId,
              response: "",
              status: enableStreaming ? "streaming" : "pending",
              timestamp: new Date(),
              isStreaming: enableStreaming,
              abortController,
              prompt: userMessage || prompt, // 优先使用用户原始输入，回退到完整提示
            };

            // 添加到状态
            set((state) => {
              const updatedEntries = state.entries.map((entry) =>
                entry.id === promptId
                  ? { ...entry, responses: [...entry.responses, response] }
                  : entry
              );
              return { entries: updatedEntries };
            });

            // 保存响应到 IndexedDB（如果提示已保存）
            const dbPromptId = get().promptIdMap.get(promptId);
            if (dbPromptId) {
              const dbResponseId = await promptPersistenceService.saveResponse(
                response,
                dbPromptId
              );
              if (dbResponseId) {
                // 存储响应ID映射
                set((state) => {
                  const newResponseIdMap = new Map(state.responseIdMap);
                  newResponseIdMap.set(responseId, dbResponseId);
                  return { responseIdMap: newResponseIdMap };
                });
              }
            }

            try {
              // 调用LLM服务
              const options: TextGenerationOptions = {
                model: modelId,
                temperature: 0.7,
                maxTokens: 2048,
                stream: enableStreaming,
              };

              const result = await llmService.generateTextWithStoredKey(
                providerId,
                prompt,
                options
              );

              if (result.success && result.data) {
                if (enableStreaming && result.data instanceof ReadableStream) {
                  // 处理流式响应
                  await get().handleStreamResponse(
                    result.data,
                    responseId,
                    startTime
                  );
                } else if (
                  !enableStreaming &&
                  typeof result.data === "object"
                ) {
                  // 处理常规响应
                  const textResponse = result.data as TextResponse;
                  const duration = Date.now() - startTime;

                  const updates: Partial<PromptResponse> = {
                    response: textResponse.content,
                    status: "success",
                    duration,
                  };

                  get().updateResponse(responseId, updates);
                }
              } else {
                // 处理错误
                const duration = Date.now() - startTime;
                const errorMessage = result.error?.message || "Unknown error";

                const updates: Partial<PromptResponse> = {
                  status: "error",
                  error: errorMessage,
                  duration,
                };

                get().updateResponse(responseId, updates);
              }
            } catch (error) {
              const duration = Date.now() - startTime;
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";

              const updates: Partial<PromptResponse> = {
                status: "error",
                error: errorMessage,
                duration,
              };

              get().updateResponse(responseId, updates);
            }
          });

          // 等待所有响应完成
          const results = await Promise.allSettled(responsePromises);

          // 更新提示状态为完成
          set((state) => {
            const updatedEntries = state.entries.map((entry) =>
              entry.id === promptId
                ? { ...entry, status: "completed" as const }
                : entry
            );
            return { entries: updatedEntries };
          });

          // 同时更新 IndexedDB 中的提示状态
          const promptDbId = get().promptIdMap.get(promptId);
          if (promptDbId) {
            promptPersistenceService.updatePromptStatus(
              promptDbId,
              "completed"
            );
          }

          // 显示完成通知
          const successCount = results.filter(
            (r) => r.status === "fulfilled"
          ).length;
          const errorCount = results.filter(
            (r) => r.status === "rejected"
          ).length;

          // 统计错误类型
          const errorResponses =
            get()
              .entries.find((e) => e.id === promptId)
              ?.responses.filter((r) => r.status === "error") || [];

          const errorTypes = new Set(
            errorResponses.map((r) => {
              if (r.error?.includes("API密钥")) return "API密钥问题";
              if (r.error?.includes("网络")) return "网络连接问题";
              if (r.error?.includes("超时")) return "请求超时";
              if (r.error?.includes("频率")) return "请求频率限制";
              return "其他错误";
            })
          );

          if (successCount > 0 && errorCount === 0) {
            toast.success("所有响应已完成", {
              description: `成功获得 ${successCount} 个模型的响应`,
            });
          } else if (successCount > 0 && errorCount > 0) {
            const errorTypesStr = Array.from(errorTypes).join("、");
            toast.warning("部分响应完成", {
              description: `${successCount} 个成功，${errorCount} 个失败 (${errorTypesStr})`,
            });
          } else {
            const errorTypesStr = Array.from(errorTypes).join("、");
            toast.error("所有请求失败", {
              description: errorTypesStr || "请检查API密钥设置或网络连接",
            });
          }
        } catch (error) {
          console.error("Failed to submit prompt:", error);
          toast.error("提交失败", {
            description:
              error instanceof Error ? error.message : "未知错误，请稍后重试",
          });
        } finally {
          set({ isSubmitting: false });
        }
      },

      // 处理流式响应的新方法
      handleStreamResponse: async (
        stream: ReadableStream<StreamChunk>,
        responseId: string,
        startTime: number
      ) => {
        const reader = stream.getReader();
        let fullContent = "";
        let isCancelled = false;

        // 检查是否已被取消
        const checkCancellation = () => {
          const response = get()
            .entries.flatMap((e) => e.responses)
            .find((r) => r.id === responseId);
          return response?.status === "cancelled";
        };

        try {
          while (true) {
            // 检查取消状态
            if (checkCancellation()) {
              isCancelled = true;
              break;
            }

            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // 再次检查取消状态
            if (checkCancellation()) {
              isCancelled = true;
              break;
            }

            if (value.content) {
              fullContent += value.content;
              // 使用requestAnimationFrame确保UI更新不阻塞
              requestAnimationFrame(() => {
                get().appendStreamContent(responseId, value.content);
              });
            }

            if (value.isComplete) {
              // 流结束，更新最终状态
              const duration = Date.now() - startTime;
              get().updateResponse(responseId, {
                status: "success",
                duration,
                isStreaming: false,
              });
              break;
            }
          }

          // 如果被取消，不更新为成功状态
          if (isCancelled) {
            const duration = Date.now() - startTime;
            get().updateResponse(responseId, {
              status: "cancelled",
              duration,
              isStreaming: false,
            });
          }
        } catch (error) {
          const duration = Date.now() - startTime;
          let errorMessage = "Stream error";

          if (error instanceof Error) {
            if (error.name === "AbortError") {
              errorMessage = "请求已取消";
            } else {
              errorMessage = error.message;
            }
          }

          get().updateResponse(responseId, {
            status: isCancelled ? "cancelled" : "error",
            error: errorMessage,
            duration,
            isStreaming: false,
          });
        } finally {
          // 清理防抖定时器
          const store = get();
          const existingTimer = store.debounceTimers.get(responseId);
          if (existingTimer) {
            clearTimeout(existingTimer);
            set((state) => {
              const newTimers = new Map(state.debounceTimers);
              newTimers.delete(responseId);
              return { debounceTimers: newTimers };
            });
          }

          // 确保最终状态同步到数据库
          await get().flushResponseToDatabase(responseId);

          // 确保资源清理
          try {
            reader.releaseLock();
          } catch (e) {
            console.warn("Failed to release stream reader:", e);
          }
        }
      },

      updateResponse: (responseId, updates) => {
        set((state) => {
          const updatedEntries = state.entries.map((entry) => ({
            ...entry,
            responses: entry.responses.map((response) =>
              response.id === responseId
                ? { ...response, ...updates }
                : response
            ),
          }));
          return { entries: updatedEntries };
        });

        // 同时更新 IndexedDB
        const dbResponseId = get().responseIdMap.get(responseId);
        if (dbResponseId) {
          promptPersistenceService.updateResponse(dbResponseId, updates);
        }
      },

      appendStreamContent: (responseId, content) => {
        // 立即更新内存状态
        set((state) => {
          const updatedEntries = state.entries.map((entry) => ({
            ...entry,
            responses: entry.responses.map((response) =>
              response.id === responseId
                ? { ...response, response: response.response + content }
                : response
            ),
          }));
          return { entries: updatedEntries };
        });

        // 防抖更新数据库（避免频繁写入）
        const store = get();
        const existingTimer = store.debounceTimers.get(responseId);

        // 清除之前的定时器
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // 设置新的防抖定时器（500ms 延迟）
        const newTimer = setTimeout(async () => {
          console.log(`⏰ Debounce timer triggered for response ${responseId}`);
          await store.flushResponseToDatabase(responseId);
          // 清理定时器映射
          set((state) => {
            const newTimers = new Map(state.debounceTimers);
            newTimers.delete(responseId);
            return { debounceTimers: newTimers };
          });
        }, 500);

        // 存储新定时器
        set((state) => {
          const newTimers = new Map(state.debounceTimers);
          newTimers.set(responseId, newTimer);
          return { debounceTimers: newTimers };
        });
      },

      cancelResponse: (responseId) => {
        set((state) => {
          const updatedEntries = state.entries.map((entry) => ({
            ...entry,
            responses: entry.responses.map((response) =>
              response.id === responseId
                ? {
                    ...response,
                    status: "cancelled" as const,
                    isStreaming: false,
                  }
                : response
            ),
          }));
          return { entries: updatedEntries };
        });

        // 清理防抖定时器
        const store = get();
        const existingTimer = store.debounceTimers.get(responseId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          set((state) => {
            const newTimers = new Map(state.debounceTimers);
            newTimers.delete(responseId);
            return { debounceTimers: newTimers };
          });
        }

        // 立即同步取消状态到数据库
        setTimeout(() => {
          get().flushResponseToDatabase(responseId);
        }, 0);
      },

      clearHistory: () => {
        set({ entries: [] });
      },

      deleteEntry: async (entryId) => {
        try {
          console.log(`🗑️ Attempting to delete entry: ${entryId}`);

          // 获取数据库 ID
          const dbPromptId = get().promptIdMap.get(entryId);
          console.log(`📋 Database prompt ID: ${dbPromptId}`);

          // 获取要删除的条目信息（用于日志）
          const entryToDelete = get().entries.find(
            (entry) => entry.id === entryId
          );
          if (!entryToDelete) {
            throw new Error(`Entry with ID ${entryId} not found in memory`);
          }

          console.log(
            `📝 Entry to delete: "${entryToDelete.prompt.substring(0, 50)}..."`
          );

          // 从数据库删除
          if (dbPromptId) {
            console.log(`🗄️ Deleting from database with ID: ${dbPromptId}`);
            await promptPersistenceService.deletePrompt(dbPromptId);
            console.log(`✅ Successfully deleted from database`);
          } else {
            console.warn(
              `⚠️ No database ID found for entry ${entryId}, skipping database deletion`
            );
          }

          // 从内存状态中删除
          set((state) => ({
            entries: state.entries.filter((entry) => entry.id !== entryId),
            promptIdMap: (() => {
              const newMap = new Map(state.promptIdMap);
              newMap.delete(entryId);
              return newMap;
            })(),
            responseIdMap: (() => {
              // 删除相关的响应 ID 映射
              const newMap = new Map(state.responseIdMap);
              entryToDelete.responses.forEach((response) => {
                newMap.delete(response.id);
              });
              return newMap;
            })(),
          }));

          console.log(
            `✅ Entry ${entryId} deleted successfully from memory and database`
          );
        } catch (error) {
          console.error(`❌ Failed to delete entry ${entryId}:`, error);
          throw error;
        }
      },

      getEntryById: (id) => {
        return get().entries.find((entry) => entry.id === id);
      },

      loadHistoryFromDB: async (options) => {
        set({ isLoading: true });
        try {
          const entries = await promptPersistenceService.loadPromptHistory(
            options
          );

          // 重新建立 ID 映射关系
          const promptIdMap = new Map<string, number>();
          const responseIdMap = new Map<string, number>();

          entries.forEach((entry) => {
            // 从数据库加载的条目，其 ID 就是数据库 ID 的字符串形式
            const dbPromptId = parseInt(entry.id);
            if (!isNaN(dbPromptId)) {
              promptIdMap.set(entry.id, dbPromptId);
            }

            entry.responses.forEach((response) => {
              const dbResponseId = parseInt(response.id);
              if (!isNaN(dbResponseId)) {
                responseIdMap.set(response.id, dbResponseId);
              }
            });
          });

          set({
            entries,
            isLoading: false,
            promptIdMap,
            responseIdMap,
            debounceTimers: new Map(), // 重置防抖定时器
          });

          // 只在有数据或调试模式时打印日志
          if (entries.length > 0) {
            console.log(`✅ Loaded ${entries.length} entries from IndexedDB`);
            console.log(
              `✅ Rebuilt ID mappings: ${promptIdMap.size} prompts, ${responseIdMap.size} responses`
            );
          } else if (process.env.NEXT_PUBLIC_DEBUG_DB === "true") {
            console.log(`📝 No entries found in IndexedDB`);
          }
        } catch (error) {
          console.error("❌ Failed to load history from IndexedDB:", error);
          set({ isLoading: false });
        }
      },

      refreshFromDB: async () => {
        await get().loadHistoryFromDB({ limit: 50 });
      },

      flushResponseToDatabase: async (responseId: string) => {
        const dbResponseId = get().responseIdMap.get(responseId);
        if (!dbResponseId) return;

        const response = get()
          .entries.flatMap((e) => e.responses)
          .find((r) => r.id === responseId);

        if (!response) return;

        try {
          await promptPersistenceService.updateResponse(dbResponseId, {
            response: response.response,
            status: response.status,
            duration: response.duration,
            error: response.error,
          });
          console.log(`💾 Flushed response ${responseId} to database`);
        } catch (error) {
          console.error(`❌ Failed to flush response ${responseId}:`, error);
        }
      },
    }),
    {
      name: "prompt-store",
    }
  )
);
