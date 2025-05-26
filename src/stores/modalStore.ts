import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { PromptEntry } from "./promptStore";

export interface ConversationModalState {
  // 模态框是否打开
  isOpen: boolean;

  // 是否全屏模式
  isFullscreen: boolean;

  // 当前选中的对话
  currentConversation: PromptEntry | null;

  // 当前选中的模型（用于底部输入框）
  selectedModel: string | null;

  // 广播模式（顶部）输入
  broadcastInput: string;

  // 单独对话（底部）输入
  individualInput: string;

  // 是否正在发送消息
  isSending: boolean;

  // 是否显示模型配置
  showModelConfig: boolean;
}

export interface ConversationModalActions {
  // 打开模态框
  openModal: (conversation: PromptEntry) => void;

  // 关闭模态框
  closeModal: () => void;

  // 切换全屏模式
  toggleFullscreen: () => void;

  // 设置当前对话
  setCurrentConversation: (conversation: PromptEntry) => void;

  // 选择模型
  selectModel: (modelKey: string) => void;

  // 设置广播输入内容
  setBroadcastInput: (text: string) => void;

  // 设置单独对话输入内容
  setIndividualInput: (text: string) => void;

  // 设置发送状态
  setSending: (isSending: boolean) => void;

  // 切换模型配置显示
  toggleModelConfig: () => void;

  // 重置状态
  reset: () => void;
}

export type ConversationModalStore = ConversationModalState &
  ConversationModalActions;

// 初始状态
const initialState: ConversationModalState = {
  isOpen: false,
  isFullscreen: false,
  currentConversation: null,
  selectedModel: null,
  broadcastInput: "",
  individualInput: "",
  isSending: false,
  showModelConfig: false,
};

export const useConversationModalStore = create<ConversationModalStore>()(
  devtools(
    (set) => ({
      ...initialState,

      openModal: (conversation) =>
        set(
          {
            isOpen: true,
            currentConversation: conversation,
            selectedModel:
              conversation.models.length > 0 ? conversation.models[0] : null,
          },
          false,
          "openModal"
        ),

      closeModal: () =>
        set(
          {
            isOpen: false,
            isFullscreen: false,
            broadcastInput: "",
            individualInput: "",
            showModelConfig: false,
          },
          false,
          "closeModal"
        ),

      toggleFullscreen: () =>
        set(
          (state) => ({ isFullscreen: !state.isFullscreen }),
          false,
          "toggleFullscreen"
        ),

      setCurrentConversation: (conversation) =>
        set(
          { currentConversation: conversation },
          false,
          "setCurrentConversation"
        ),

      selectModel: (modelKey) =>
        set({ selectedModel: modelKey }, false, "selectModel"),

      setBroadcastInput: (text) =>
        set(
          (state) => {
            // 如果广播输入框有内容，清空单独对话输入框
            if (text && state.individualInput) {
              return { broadcastInput: text, individualInput: "" };
            }
            return { broadcastInput: text };
          },
          false,
          "setBroadcastInput"
        ),

      setIndividualInput: (text) =>
        set(
          (state) => {
            // 如果单独对话输入框有内容，清空广播输入框
            if (text && state.broadcastInput) {
              return { individualInput: text, broadcastInput: "" };
            }
            return { individualInput: text };
          },
          false,
          "setIndividualInput"
        ),

      setSending: (isSending) => set({ isSending }, false, "setSending"),

      toggleModelConfig: () =>
        set(
          (state) => ({ showModelConfig: !state.showModelConfig }),
          false,
          "toggleModelConfig"
        ),

      reset: () => set(initialState, false, "reset"),
    }),
    {
      name: "conversation-modal-store",
    }
  )
);
