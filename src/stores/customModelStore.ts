import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { dbHelpers, CustomModel } from "@/services/db";

export interface CustomModelWithId extends CustomModel {
  id: number;
}

export interface CustomModelState {
  customModels: CustomModelWithId[];
  isLoading: boolean;
  error: string | null;
}

export interface CustomModelActions {
  loadCustomModels: () => Promise<void>;
  addCustomModel: (model: Omit<CustomModel, "id">) => Promise<void>;
  updateCustomModel: (
    id: number,
    updates: Partial<CustomModel>
  ) => Promise<void>;
  deleteCustomModel: (id: number) => Promise<void>;
  clearError: () => void;
}

export type CustomModelStore = CustomModelState & CustomModelActions;

export const useCustomModelStore = create<CustomModelStore>()(
  devtools(
    (set, get) => ({
      customModels: [],
      isLoading: false,
      error: null,

      loadCustomModels: async () => {
        set({ isLoading: true, error: null });
        try {
          const models = await dbHelpers.getAllCustomModels();
          // 过滤掉没有 id 的模型（理论上不应该发生）
          const modelsWithId = models.filter(
            (model): model is CustomModelWithId => model.id !== undefined
          );
          set({ customModels: modelsWithId, isLoading: false });
        } catch (error) {
          console.error("Failed to load custom models:", error);
          set({
            error:
              error instanceof Error ? error.message : "加载自定义模型失败",
            isLoading: false,
          });
        }
      },

      addCustomModel: async (model) => {
        set({ isLoading: true, error: null });
        try {
          const id = await dbHelpers.createCustomModel(model);
          const newModel = { ...model, id };
          set((state) => ({
            customModels: [...state.customModels, newModel],
            isLoading: false,
          }));
        } catch (error) {
          console.error("Failed to add custom model:", error);
          set({
            error:
              error instanceof Error ? error.message : "添加自定义模型失败",
            isLoading: false,
          });
          throw error;
        }
      },

      updateCustomModel: async (id, updates) => {
        set({ isLoading: true, error: null });
        try {
          await dbHelpers.updateCustomModel(id, updates);
          set((state) => ({
            customModels: state.customModels.map((model) =>
              model.id === id ? { ...model, ...updates } : model
            ),
            isLoading: false,
          }));
        } catch (error) {
          console.error("Failed to update custom model:", error);
          set({
            error:
              error instanceof Error ? error.message : "更新自定义模型失败",
            isLoading: false,
          });
          throw error;
        }
      },

      deleteCustomModel: async (id) => {
        set({ isLoading: true, error: null });
        try {
          await dbHelpers.deleteCustomModel(id);
          set((state) => ({
            customModels: state.customModels.filter((model) => model.id !== id),
            isLoading: false,
          }));
        } catch (error) {
          console.error("Failed to delete custom model:", error);
          set({
            error:
              error instanceof Error ? error.message : "删除自定义模型失败",
            isLoading: false,
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "custom-model-store",
    }
  )
);
