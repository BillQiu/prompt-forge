import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface UIState {
  // 应用模式：text 用于文本提示，image 用于图像生成
  mode: "text" | "image";

  // 加载状态
  isLoading: boolean;

  // 侧边栏状态
  sidebarOpen: boolean;

  // 主题设置
  theme: "light" | "dark" | "system";

  // 错误状态
  error: string | null;

  // 提示框状态
  toastMessage: string | null;
  toastType: "success" | "error" | "info" | "warning" | null;
}

export interface UIActions {
  // 模式切换
  setMode: (mode: "text" | "image") => void;

  // 加载状态
  setLoading: (loading: boolean) => void;

  // 侧边栏控制
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // 主题设置
  setTheme: (theme: "light" | "dark" | "system") => void;

  // 错误处理
  setError: (error: string | null) => void;
  clearError: () => void;

  // 提示框控制
  showToast: (
    message: string,
    type: "success" | "error" | "info" | "warning"
  ) => void;
  hideToast: () => void;

  // 重置所有状态
  reset: () => void;
}

export type UIStore = UIState & UIActions;

const initialState: UIState = {
  mode: "text",
  isLoading: false,
  sidebarOpen: false,
  theme: "system",
  error: null,
  toastMessage: null,
  toastType: null,
};

export const useUIStore = create<UIStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setMode: (mode) => set({ mode }, false, "setMode"),

      setLoading: (isLoading) => set({ isLoading }, false, "setLoading"),

      setSidebarOpen: (sidebarOpen) =>
        set({ sidebarOpen }, false, "setSidebarOpen"),
      toggleSidebar: () =>
        set(
          (state) => ({ sidebarOpen: !state.sidebarOpen }),
          false,
          "toggleSidebar"
        ),

      setTheme: (theme) => set({ theme }, false, "setTheme"),

      setError: (error) => set({ error }, false, "setError"),
      clearError: () => set({ error: null }, false, "clearError"),

      showToast: (toastMessage, toastType) =>
        set({ toastMessage, toastType }, false, "showToast"),
      hideToast: () =>
        set({ toastMessage: null, toastType: null }, false, "hideToast"),

      reset: () => set(initialState, false, "reset"),
    }),
    {
      name: "ui-store",
    }
  )
);
