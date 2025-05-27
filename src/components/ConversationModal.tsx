"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageCircle,
  Send,
  Maximize,
  Minimize,
  Clock,
  Zap,
  Copy,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConversationModalStore } from "@/stores/modalStore";
import { usePromptStore } from "@/stores/promptStore";
import type { PromptResponse } from "@/stores/promptStore";

interface ModelConversation {
  modelKey: string;
  providerId: string;
  modelId: string;
  responses: (PromptResponse & { prompt: string })[];
}

export default function ConversationModal() {
  const {
    isOpen,
    isFullscreen,
    currentConversation: modalConversation,
    closeModal,
    toggleFullscreen,
  } = useConversationModalStore();

  const { submitPrompt, entries } = usePromptStore();

  // 从prompt store中获取最新的对话数据
  const currentConversation = modalConversation
    ? entries.find((entry) => entry.id === modalConversation.id) ||
      modalConversation
    : null;
  const [modelInputs, setModelInputs] = useState<Record<string, string>>({});
  const [isSending, setIsSending] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  // 计算模态框样式（默认或全屏）
  const modalStyles = cn({
    "w-full max-w-[90vw] h-[80vh] max-h-[90vh]": !isFullscreen,
    "w-[99vw] h-[99vh] max-w-none max-h-none": isFullscreen,
  });

  // 格式化时间
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  // 格式化响应时间
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // 复制到剪贴板
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch (error) {
      toast.error("复制失败");
    }
  };

  // 发送广播消息到所有模型
  const handleBroadcastMessage = async () => {
    const input = modelInputs["broadcast"]?.trim();
    if (
      !input ||
      Object.values(isSending).some(Boolean) ||
      !currentConversation
    )
      return;

    try {
      // 设置所有模型为发送中状态
      const newSendingState: Record<string, boolean> = {};
      currentConversation.models.forEach((modelKey) => {
        newSendingState[modelKey] = true;
      });
      setIsSending(newSendingState);

      // 为每个模型单独发送，以包含各自的对话历史
      const sendPromises = currentConversation.models.map(async (modelKey) => {
        const [providerId] = modelKey.split(":");
        const contextualPrompt = buildContextualPrompt(modelKey, input);

        return submitPrompt({
          prompt: contextualPrompt,
          providers: [providerId],
          models: [modelKey],
          continueConversation: currentConversation.id,
          userMessage: input, // 传递用户的原始输入用于UI显示
        });
      });

      await Promise.all(sendPromises);

      // 清空输入框
      setModelInputs({ ...modelInputs, broadcast: "" });
      toast.success("消息已发送到所有模型");
    } catch (error) {
      console.error("Failed to send broadcast message:", error);
      toast.error("发送失败");
    } finally {
      // 重置发送状态
      setIsSending({});
    }
  };

  // 构建包含对话历史的完整提示
  const buildContextualPrompt = (
    modelKey: string,
    newMessage: string
  ): string => {
    if (!currentConversation) return newMessage;

    const [providerId, modelId] = modelKey.split(":");

    // 获取该模型的对话历史
    const modelResponses = currentConversation.responses
      .filter((r) => r.providerId === providerId && r.model === modelId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (modelResponses.length === 0) {
      // 如果没有历史记录，返回新消息
      return newMessage;
    }

    // 构建对话历史
    let contextualPrompt = "";

    modelResponses.forEach((response) => {
      // 添加用户消息
      const userPrompt = response.prompt || currentConversation.prompt;
      contextualPrompt += `用户: ${userPrompt}\n\n`;

      // 添加AI响应
      if (response.response && response.status === "success") {
        contextualPrompt += `助手: ${response.response}\n\n`;
      }
    });

    // 添加新的用户消息
    contextualPrompt += `用户: ${newMessage}`;

    return contextualPrompt;
  };

  // 发送消息到特定模型
  const handleSendMessage = async (modelKey: string) => {
    const input = modelInputs[modelKey]?.trim();
    if (!input || isSending[modelKey] || !currentConversation) return;

    const [providerId, modelId] = modelKey.split(":");

    try {
      setIsSending({ ...isSending, [modelKey]: true });

      // 构建包含对话历史的完整提示
      const contextualPrompt = buildContextualPrompt(modelKey, input);

      await submitPrompt({
        prompt: contextualPrompt,
        providers: [providerId],
        models: [modelKey],
        continueConversation: currentConversation.id, // 传递对话ID以继续现有对话
        userMessage: input, // 传递用户的原始输入用于UI显示
      });

      // 清空输入框
      setModelInputs({ ...modelInputs, [modelKey]: "" });
      toast.success(`消息已发送到 ${modelId}`);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("发送失败");
    } finally {
      setIsSending({ ...isSending, [modelKey]: false });
    }
  };

  // 更新输入内容
  const updateInput = (modelKey: string, value: string) => {
    setModelInputs({ ...modelInputs, [modelKey]: value });
  };

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "error":
        return "bg-red-100 text-red-800";
      case "pending":
      case "streaming":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <Zap className="w-3 h-3" />;
      case "error":
        return <AlertCircle className="w-3 h-3" />;
      case "pending":
      case "streaming":
        return <Clock className="w-3 h-3" />;
      default:
        return <MessageCircle className="w-3 h-3" />;
    }
  };

  if (!isOpen || !currentConversation) return null;

  // 组织每个模型的对话历史
  const modelConversations: ModelConversation[] =
    currentConversation.models.map((modelKey) => {
      const [providerId, modelId] = modelKey.split(":");

      // 获取该模型的所有响应，使用响应中存储的提示词
      const responses = currentConversation.responses
        .filter((r) => r.providerId === providerId && r.model === modelId)
        .map((r) => ({
          ...r,
          prompt: r.prompt || currentConversation.prompt, // 优先使用响应中的提示词，回退到对话的原始提示词
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        modelKey,
        providerId,
        modelId,
        responses,
      };
    });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className={modalStyles}>
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-lg">
              <MessageCircle className="inline-block mr-2 h-5 w-5" />
              多模型对话
            </DialogTitle>
            <Badge className="ml-2">
              {currentConversation.responses.length} 个响应
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? "退出全屏" : "全屏显示"}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </div>
        </DialogHeader>

        {/* 统一输入区域 */}
        <div className="flex-none p-4 bg-secondary/30 rounded-lg mb-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">向所有模型发送消息</div>
            <div className="flex gap-2">
              <Textarea
                value={modelInputs["broadcast"] || ""}
                onChange={(e) => updateInput("broadcast", e.target.value)}
                placeholder="输入消息将同时发送给所有选中的模型..."
                className="min-h-[60px] resize-none"
                disabled={Object.values(isSending).some(Boolean)}
              />
              <Button
                onClick={handleBroadcastMessage}
                disabled={
                  !modelInputs["broadcast"]?.trim() ||
                  Object.values(isSending).some(Boolean)
                }
                className="self-end"
              >
                {Object.values(isSending).some(Boolean) ? (
                  <div className="animate-pulse">发送中...</div>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" /> 发送
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* 横向滚动的模型对话区域 */}
        <div className="flex-1 overflow-hidden min-h-0">
          <div
            ref={scrollRef}
            className={cn(
              "h-full flex gap-4 p-4 overflow-x-auto overflow-y-hidden",
              // 当模型数量少时，居中显示而不是左对齐
              modelConversations.length <= 3 ? "justify-center" : ""
            )}
            style={{ scrollSnapType: "x mandatory" }}
          >
            {modelConversations.map((conversation) => (
              <motion.div
                key={conversation.modelKey}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-none w-80 h-full"
                style={{ scrollSnapAlign: "start" }}
              >
                <Card className="h-full flex flex-col">
                  {/* 模型头部 */}
                  <CardHeader className="flex-none border-b py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {conversation.modelId}
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {conversation.providerId}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {conversation.responses.length} 条对话
                    </div>
                  </CardHeader>

                  {/* 对话历史 - 固定高度，内部滚动 */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <ScrollArea className="flex-1 px-3">
                      <div className="space-y-3 py-3">
                        {conversation.responses.map((response, index) => (
                          <div key={index} className="space-y-2">
                            {/* 用户消息 */}
                            <div className="flex justify-end">
                              <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[85%] break-words">
                                <p className="text-xs whitespace-pre-wrap break-words">
                                  {response.prompt}
                                </p>
                                <div className="text-xs opacity-70 mt-1">
                                  {formatTime(response.timestamp)}
                                </div>
                              </div>
                            </div>

                            {/* AI响应 */}
                            <div className="flex justify-start">
                              <div className="bg-muted rounded-lg px-3 py-2 max-w-[85%] break-words">
                                <div className="flex items-center gap-1 mb-2 flex-wrap">
                                  <Badge
                                    className={cn(
                                      "text-xs h-5 flex-shrink-0",
                                      getStatusColor(response.status)
                                    )}
                                  >
                                    {getStatusIcon(response.status)}
                                    <span className="ml-1">
                                      {response.status === "success"
                                        ? "完成"
                                        : response.status === "error"
                                        ? "错误"
                                        : "处理中"}
                                    </span>
                                  </Badge>
                                  {response.duration && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs h-5 flex-shrink-0"
                                    >
                                      {formatDuration(response.duration)}
                                    </Badge>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 ml-auto flex-shrink-0"
                                    onClick={() =>
                                      copyToClipboard(response.response || "")
                                    }
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                </div>
                                {response.response && (
                                  <p className="text-xs whitespace-pre-wrap break-words">
                                    {response.response}
                                  </p>
                                )}
                                {response.error && (
                                  <p className="text-xs text-red-600 break-words">
                                    错误: {response.error}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>

                    {/* 每个模型的输入区域 - 固定在底部 */}
                    <div className="flex-none p-3 border-t bg-background">
                      <div className="flex gap-2">
                        <Textarea
                          placeholder={`向 ${conversation.modelId} 发送消息...`}
                          value={modelInputs[conversation.modelKey] || ""}
                          onChange={(e) =>
                            updateInput(conversation.modelKey, e.target.value)
                          }
                          className="flex-1 resize-none min-h-[50px] max-h-[100px] text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              handleSendMessage(conversation.modelKey);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            handleSendMessage(conversation.modelKey)
                          }
                          disabled={
                            !modelInputs[conversation.modelKey]?.trim() ||
                            isSending[conversation.modelKey]
                          }
                          className="self-end flex-shrink-0"
                        >
                          <Send className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Ctrl/Cmd + Enter 发送
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
