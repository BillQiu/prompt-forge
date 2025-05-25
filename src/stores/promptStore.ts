import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import { llmService } from "@/services/llm";
import type { TextGenerationOptions, TextResponse } from "@/services/llm";

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
  status: "pending" | "success" | "error";
  timestamp: Date;
  duration?: number;
  error?: string;
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
  }) => Promise<void>;

  updateResponse: (
    responseId: string,
    updates: Partial<PromptResponse>
  ) => void;
  clearHistory: () => void;

  // 工具函数
  getEntryById: (id: string) => PromptEntry | undefined;
}

export const usePromptStore = create<PromptStore>()(
  devtools(
    (set, get) => ({
      entries: [],
      isSubmitting: false,

      submitPrompt: async (data) => {
        const { prompt, providers, models } = data;

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

            const response: PromptResponse = {
              id: responseId,
              promptId,
              providerId,
              model: modelId,
              response: "",
              status: "pending",
              timestamp: new Date(),
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
                stream: false,
              };

              const result = await llmService.generateTextWithStoredKey(
                providerId,
                prompt,
                options
              );

              const duration = Date.now() - startTime;

              if (result.success && result.data) {
                const textResponse = result.data as TextResponse;

                // 更新成功响应
                const updates: Partial<PromptResponse> = {
                  response: textResponse.content,
                  status: "success",
                  duration,
                };

                get().updateResponse(responseId, updates);
              } else {
                // 处理错误
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
