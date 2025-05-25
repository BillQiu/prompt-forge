import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import { llmService } from "@/services/llm";
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
}

interface PromptStore {
  // 状态
  entries: PromptEntry[];
  isSubmitting: boolean;

  // 操作
  submitPrompt: (data: {
    prompt: string;
    providers: string[];
    models: string[];
    enableStreaming?: boolean;
  }) => Promise<void>;

  updateResponse: (
    responseId: string,
    updates: Partial<PromptResponse>
  ) => void;

  appendStreamContent: (responseId: string, content: string) => void;

  cancelResponse: (responseId: string) => void;

  clearHistory: () => void;

  // 工具函数
  getEntryById: (id: string) => PromptEntry | undefined;

  // 处理流式响应的新方法
  handleStreamResponse: (
    stream: ReadableStream<StreamChunk>,
    responseId: string,
    startTime: number
  ) => Promise<void>;
}

export const usePromptStore = create<PromptStore>()(
  devtools(
    (set, get) => ({
      entries: [],
      isSubmitting: false,

      submitPrompt: async (data) => {
        const { prompt, providers, models, enableStreaming = true } = data;

        set({ isSubmitting: true });

        try {
          // 创建提示记录
          const promptId = crypto.randomUUID();
          const promptEntry: PromptEntry = {
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
      },

      appendStreamContent: (responseId, content) => {
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
      },

      clearHistory: () => {
        set({ entries: [] });
      },

      getEntryById: (id) => {
        return get().entries.find((entry) => entry.id === id);
      },
    }),
    {
      name: "prompt-store",
    }
  )
);
