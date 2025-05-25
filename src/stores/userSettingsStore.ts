import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

// LLM 提供商配置接口
export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  models: ModelConfig[];
  apiKeyStored: boolean; // 标记是否已存储 API 密钥
}

export interface ModelConfig {
  id: string;
  name: string;
  enabled: boolean;
  // 模型特定参数
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  // 图像生成参数
  quality?: "standard" | "hd";
  style?: "vivid" | "natural";
  size?: "256x256" | "512x512" | "1024x1024" | "1792x1024" | "1024x1792";
}

// 过滤器和排序设置
export interface FilterSettings {
  providers: string[]; // 选中的提供商
  models: string[]; // 选中的模型
  status: string[]; // 选中的状态
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

export interface SortSettings {
  field: "timestamp" | "provider" | "model" | "status";
  direction: "asc" | "desc";
}

export interface UserSettingsState {
  // 提供商配置
  providers: ProviderConfig[];

  // 默认选中的提供商和模型
  defaultProviders: string[];
  defaultModels: { [providerId: string]: string[] };

  // 时间线过滤和排序设置
  filterSettings: FilterSettings;
  sortSettings: SortSettings;

  // 界面偏好
  timelineColumns: 1 | 2 | 4; // 响应式网格列数
  showTimestamps: boolean;
  showProviderBadges: boolean;

  // 导出/导入设置
  exportFormat: "json" | "csv";
  includeMetadata: boolean;

  // 应用设置
  autoSave: boolean;
  confirmBeforeDelete: boolean;
  maxHistoryItems: number;
}

export interface UserSettingsActions {
  // 提供商管理
  updateProvider: (
    providerId: string,
    updates: Partial<ProviderConfig>
  ) => void;
  updateModel: (
    providerId: string,
    modelId: string,
    updates: Partial<ModelConfig>
  ) => void;
  setProviderEnabled: (providerId: string, enabled: boolean) => void;
  setModelEnabled: (
    providerId: string,
    modelId: string,
    enabled: boolean
  ) => void;
  setApiKeyStored: (providerId: string, stored: boolean) => void;

  // 默认选择
  setDefaultProviders: (providers: string[]) => void;
  setDefaultModels: (providerId: string, models: string[]) => void;

  // 过滤器和排序
  updateFilterSettings: (settings: Partial<FilterSettings>) => void;
  updateSortSettings: (settings: Partial<SortSettings>) => void;
  resetFilters: () => void;

  // 界面偏好
  setTimelineColumns: (columns: 1 | 2 | 4) => void;
  setShowTimestamps: (show: boolean) => void;
  setShowProviderBadges: (show: boolean) => void;

  // 应用设置
  setAutoSave: (autoSave: boolean) => void;
  setConfirmBeforeDelete: (confirm: boolean) => void;
  setMaxHistoryItems: (max: number) => void;

  // 重置设置
  resetSettings: () => void;
}

export type UserSettingsStore = UserSettingsState & UserSettingsActions;

const initialState: UserSettingsState = {
  providers: [
    {
      id: "openai",
      name: "OpenAI",
      enabled: true,
      apiKeyStored: false,
      models: [
        // GPT-4.1 系列 - 最新模型
        {
          id: "gpt-4.1",
          name: "GPT-4.1",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gpt-4.1-mini",
          name: "GPT-4.1 Mini",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gpt-4.1-nano",
          name: "GPT-4.1 Nano",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // 推理模型系列
        {
          id: "o3",
          name: "OpenAI o3",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "o4-mini",
          name: "OpenAI o4-mini",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // GPT-4o 系列
        {
          id: "gpt-4o",
          name: "GPT-4o",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // 图像生成模型
        {
          id: "gpt-image-1",
          name: "GPT Image 1",
          enabled: true,
          quality: "standard",
          style: "vivid",
          size: "1024x1024",
        },
        {
          id: "dall-e-3",
          name: "DALL-E 3",
          enabled: true,
          quality: "standard",
          style: "vivid",
          size: "1024x1024",
        },
        {
          id: "dall-e-2",
          name: "DALL-E 2",
          enabled: false, // 上一代模型，默认禁用
          quality: "standard",
          style: "vivid",
          size: "1024x1024",
        },
        // 传统模型
        {
          id: "gpt-4-turbo",
          name: "GPT-4 Turbo",
          enabled: false, // 建议使用 GPT-4.1，默认禁用
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
      ],
    },
    {
      id: "google",
      name: "Google Gemini",
      enabled: true,
      apiKeyStored: false,
      models: [
        // Gemini 2.5 Series - Latest and most advanced
        {
          id: "gemini-2.5-flash-preview-05-20",
          name: "Gemini 2.5 Flash Preview",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gemini-2.5-pro-preview-05-06",
          name: "Gemini 2.5 Pro Preview",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // Gemini 2.0 Series - Next generation features
        {
          id: "gemini-2.0-flash",
          name: "Gemini 2.0 Flash",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gemini-2.0-flash-lite",
          name: "Gemini 2.0 Flash-Lite",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // Gemini 1.5 Series - Proven and reliable
        {
          id: "gemini-1.5-pro",
          name: "Gemini 1.5 Pro",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gemini-1.5-flash",
          name: "Gemini 1.5 Flash",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gemini-1.5-flash-8b",
          name: "Gemini 1.5 Flash-8B",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // Embedding Models
        {
          id: "text-embedding-004",
          name: "Text Embedding 004",
          enabled: false, // Specialized model, disabled by default
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        // Legacy Models
        {
          id: "gemini-pro",
          name: "Gemini Pro (Legacy)",
          enabled: false, // Legacy model, disabled by default
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
      ],
    },
    {
      id: "anthropic",
      name: "Anthropic Claude",
      enabled: true,
      apiKeyStored: false,
      models: [
        {
          id: "claude-3-5-sonnet-20241022",
          name: "Claude 3.5 Sonnet",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "claude-3-opus-20240229",
          name: "Claude 3 Opus",
          enabled: false, // Expensive model, disabled by default
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "claude-3-sonnet-20240229",
          name: "Claude 3 Sonnet",
          enabled: false, // Legacy model, disabled by default
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "claude-3-haiku-20240307",
          name: "Claude 3 Haiku",
          enabled: false, // Legacy model, disabled by default
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
      ],
    },
    {
      id: "ollama",
      name: "Ollama",
      enabled: true,
      apiKeyStored: true, // Ollama doesn't require API key, mark as stored
      models: [
        {
          id: "llama3.2",
          name: "Llama 3.2",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "llama3.2:1b",
          name: "Llama 3.2 1B",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "llama3.1",
          name: "Llama 3.1",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "mistral",
          name: "Mistral",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "phi3",
          name: "Phi-3",
          enabled: true,
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "gemma2",
          name: "Gemma 2",
          enabled: false, // Disabled by default to reduce clutter
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "codellama",
          name: "Code Llama",
          enabled: false, // Specialized model, disabled by default
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
        {
          id: "qwen2.5",
          name: "Qwen 2.5",
          enabled: false, // Disabled by default to reduce clutter
          temperature: 0.7,
          maxTokens: 4096,
          topP: 1,
        },
      ],
    },
  ],
  defaultProviders: ["openai", "google", "anthropic"],
  defaultModels: {
    openai: ["gpt-4.1-mini"],
    google: ["gemini-2.0-flash"],
    anthropic: ["claude-3-5-haiku-20241022"],
    ollama: ["llama3.2"],
  },
  filterSettings: {
    providers: [],
    models: [],
    status: [],
    dateRange: {
      start: null,
      end: null,
    },
  },
  sortSettings: {
    field: "timestamp",
    direction: "desc",
  },
  timelineColumns: 2,
  showTimestamps: true,
  showProviderBadges: true,
  exportFormat: "json",
  includeMetadata: true,
  autoSave: true,
  confirmBeforeDelete: true,
  maxHistoryItems: 1000,
};

export const useUserSettingsStore = create<UserSettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        updateProvider: (providerId, updates) =>
          set(
            (state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? { ...provider, ...updates }
                  : provider
              ),
            }),
            false,
            "updateProvider"
          ),

        updateModel: (providerId, modelId, updates) =>
          set(
            (state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? {
                      ...provider,
                      models: provider.models.map((model) =>
                        model.id === modelId ? { ...model, ...updates } : model
                      ),
                    }
                  : provider
              ),
            }),
            false,
            "updateModel"
          ),

        setProviderEnabled: (providerId, enabled) =>
          set(
            (state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId ? { ...provider, enabled } : provider
              ),
            }),
            false,
            "setProviderEnabled"
          ),

        setModelEnabled: (providerId, modelId, enabled) =>
          set(
            (state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? {
                      ...provider,
                      models: provider.models.map((model) =>
                        model.id === modelId ? { ...model, enabled } : model
                      ),
                    }
                  : provider
              ),
            }),
            false,
            "setModelEnabled"
          ),

        setApiKeyStored: (providerId, stored) =>
          set(
            (state) => ({
              providers: state.providers.map((provider) =>
                provider.id === providerId
                  ? { ...provider, apiKeyStored: stored }
                  : provider
              ),
            }),
            false,
            "setApiKeyStored"
          ),

        setDefaultProviders: (defaultProviders) =>
          set({ defaultProviders }, false, "setDefaultProviders"),

        setDefaultModels: (providerId, models) =>
          set(
            (state) => ({
              defaultModels: {
                ...state.defaultModels,
                [providerId]: models,
              },
            }),
            false,
            "setDefaultModels"
          ),

        updateFilterSettings: (settings) =>
          set(
            (state) => ({
              filterSettings: { ...state.filterSettings, ...settings },
            }),
            false,
            "updateFilterSettings"
          ),

        updateSortSettings: (settings) =>
          set(
            (state) => ({
              sortSettings: { ...state.sortSettings, ...settings },
            }),
            false,
            "updateSortSettings"
          ),

        resetFilters: () =>
          set(
            {
              filterSettings: {
                providers: [],
                models: [],
                status: [],
                dateRange: {
                  start: null,
                  end: null,
                },
              },
            },
            false,
            "resetFilters"
          ),

        setTimelineColumns: (timelineColumns) =>
          set({ timelineColumns }, false, "setTimelineColumns"),

        setShowTimestamps: (showTimestamps) =>
          set({ showTimestamps }, false, "setShowTimestamps"),

        setShowProviderBadges: (showProviderBadges) =>
          set({ showProviderBadges }, false, "setShowProviderBadges"),

        setAutoSave: (autoSave) => set({ autoSave }, false, "setAutoSave"),

        setConfirmBeforeDelete: (confirmBeforeDelete) =>
          set({ confirmBeforeDelete }, false, "setConfirmBeforeDelete"),

        setMaxHistoryItems: (maxHistoryItems) =>
          set({ maxHistoryItems }, false, "setMaxHistoryItems"),

        resetSettings: () => set(initialState, false, "resetSettings"),
      }),
      {
        name: "user-settings-store",
        version: 5,
        migrate: (persistedState: any, version: number) => {
          if (version < 4) {
            // 版本4：更新Google Gemini模型列表，与GeminiAdapter.ts保持一致
            return {
              ...persistedState,
              providers: initialState.providers,
              defaultModels: initialState.defaultModels,
            };
          }
          if (version < 5) {
            // 版本5：更新OpenAI模型列表，添加GPT-4.1系列和o3/o4-mini推理模型
            return {
              ...persistedState,
              providers: initialState.providers,
              defaultModels: initialState.defaultModels,
            };
          }
          return persistedState;
        },
      }
    ),
    {
      name: "user-settings-store",
    }
  )
);
