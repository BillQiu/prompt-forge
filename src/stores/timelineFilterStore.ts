import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type StatusFilter =
  | "all"
  | "pending"
  | "success"
  | "error"
  | "cancelled";
export type ProviderFilter = "all" | string;
export type ModelFilter = "all" | string;
export type SortOrder = "newest" | "oldest";

export interface FilterState {
  // 过滤器状态
  statusFilter: StatusFilter;
  providerFilter: ProviderFilter;
  modelFilter: ModelFilter;
  startDate?: Date;
  endDate?: Date;

  // 排序状态
  sortOrder: SortOrder;

  // 操作
  setStatusFilter: (status: StatusFilter) => void;
  setProviderFilter: (provider: ProviderFilter) => void;
  setModelFilter: (model: ModelFilter) => void;
  setDateRange: (startDate?: Date, endDate?: Date) => void;
  setSortOrder: (order: SortOrder) => void;
  clearFilters: () => void;

  // 工具函数
  hasActiveFilters: () => boolean;
}

const initialState = {
  statusFilter: "all" as StatusFilter,
  providerFilter: "all" as ProviderFilter,
  modelFilter: "all" as ModelFilter,
  startDate: undefined,
  endDate: undefined,
  sortOrder: "newest" as SortOrder,
};

export const useTimelineFilterStore = create<FilterState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        setStatusFilter: (status) =>
          set({ statusFilter: status }, false, "setStatusFilter"),

        setProviderFilter: (provider) =>
          set({ providerFilter: provider }, false, "setProviderFilter"),

        setModelFilter: (model) =>
          set({ modelFilter: model }, false, "setModelFilter"),

        setDateRange: (startDate, endDate) =>
          set({ startDate, endDate }, false, "setDateRange"),

        setSortOrder: (order) =>
          set({ sortOrder: order }, false, "setSortOrder"),

        clearFilters: () =>
          set(
            {
              ...initialState,
            },
            false,
            "clearFilters"
          ),

        hasActiveFilters: () => {
          const state = get();
          return (
            state.statusFilter !== "all" ||
            state.providerFilter !== "all" ||
            state.modelFilter !== "all" ||
            state.startDate !== undefined ||
            state.endDate !== undefined
          );
        },
      }),
      {
        name: "timeline-filter-storage",
        // 仅保存基本的过滤状态，日期过滤器在会话重启时重置
        partialize: (state) => ({
          statusFilter: state.statusFilter,
          providerFilter: state.providerFilter,
          modelFilter: state.modelFilter,
          sortOrder: state.sortOrder,
        }),
      }
    ),
    { name: "timelineFilterStore" }
  )
);
