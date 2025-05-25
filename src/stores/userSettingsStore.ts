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
        {
          id: "dall-e-3",
          name: "DALL-E 3",
          enabled: true,
          quality: "standard",
          style: "vivid",
          size: "1024x1024",
        },
      ],
    },
  ],
  defaultProviders: ["openai"],
  defaultModels: {
    openai: ["gpt-4o"],
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
        version: 1,
      }
    ),
    {
      name: "user-settings-store",
    }
  )
);
