"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Clock,
  MessageCircle,
  Zap,
  Copy,
  RotateCcw,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Award,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PromptEntry, PromptResponse } from "@/stores/promptStore";
import { usePromptStore } from "@/stores/promptStore";
import { useState, useMemo } from "react";
import { useConversationModalStore } from "@/stores/modalStore";

interface PromptTimelineCardProps {
  entry: PromptEntry;
  index?: number;
}

const cardVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      delay: index * 0.1,
      ease: [0.4, 0.0, 0.2, 1],
    },
  }),
  hover: {
    y: -4,
    scale: 1.02,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
};

export default function PromptTimelineCard({
  entry,
  index = 0,
}: PromptTimelineCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { deleteEntry } = usePromptStore();
  const { openModal } = useConversationModalStore();

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "error":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "cancelled":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板", {
        description: "内容已成功复制",
        duration: 2000,
      });
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("复制失败", {
        description: "无法访问剪贴板，请手动复制",
        duration: 3000,
      });
    }
  };

  const handleRetry = async () => {
    try {
      // 重新提交相同的提示词
      await usePromptStore.getState().submitPrompt({
        prompt: entry.prompt,
        providers: entry.providers,
        models: entry.models,
      });

      toast.success("重新提交成功", {
        description: "正在重新生成响应...",
        duration: 2000,
      });
    } catch (error) {
      console.error("Failed to retry prompt:", error);
      toast.error("重试失败", {
        description: "无法重新提交请求，请稍后再试",
        duration: 3000,
      });
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    try {
      console.log(`🗑️ UI: Starting delete for entry ${entry.id}`);
      await deleteEntry(entry.id);
      setShowDeleteDialog(false);
      console.log(`✅ UI: Delete completed for entry ${entry.id}`);
      toast.success("对话已删除", {
        description: "对话记录已成功删除",
        duration: 2000,
      });
    } catch (error) {
      console.error("❌ UI: Failed to delete entry:", error);
      setShowDeleteDialog(false); // 关闭对话框即使失败
      toast.error("删除失败", {
        description: "无法删除对话记录，请稍后再试",
        duration: 3000,
      });
    }
  };

  // 计算整体状态
  const overallStatus =
    entry.status === "pending" ||
    entry.responses.some((r) => r.status === "streaming")
      ? "pending"
      : entry.responses.some((r) => r.status === "success")
      ? "success"
      : entry.responses.every((r) => r.status === "cancelled")
      ? "cancelled"
      : "error";

  // 性能统计
  const performanceStats = useMemo(() => {
    const completedResponses = entry.responses.filter(
      (r) => r.status === "success" && r.duration
    );
    if (completedResponses.length === 0) return null;

    const durations = completedResponses.map((r) => r.duration!);
    const avgDuration =
      durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const fastestDuration = Math.min(...durations);
    const slowestDuration = Math.max(...durations);
    const fastestProvider = completedResponses.find(
      (r) => r.duration === fastestDuration
    );

    return {
      avgDuration,
      fastestDuration,
      slowestDuration,
      fastestProvider: fastestProvider?.providerId,
      totalCompleted: completedResponses.length,
      totalRequested: entry.responses.length,
    };
  }, [entry.responses]);

  // 响应长度统计
  const responseStats = useMemo(() => {
    const successfulResponses = entry.responses.filter(
      (r) => r.status === "success" && r.response
    );
    if (successfulResponses.length === 0) return null;

    const lengths = successfulResponses.map((r) => r.response.length);
    const avgLength = lengths.reduce((sum, l) => sum + l, 0) / lengths.length;
    const longestLength = Math.max(...lengths);
    const shortestLength = Math.min(...lengths);

    return {
      avgLength: Math.round(avgLength),
      longestLength,
      shortestLength,
      responses: successfulResponses.length,
    };
  }, [entry.responses]);

  // 处理卡片点击
  const handleCardClick = () => {
    openModal(entry);
  };

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      variants={cardVariants}
      className="h-full"
    >
      <Card
        className="h-full flex flex-col hover:shadow-lg transition-shadow duration-200 cursor-pointer"
        onClick={handleCardClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Badge variant="secondary" className="shrink-0">
                {entry.providers.length} 提供商
              </Badge>
              <Badge
                className={cn("shrink-0", getStatusColor(overallStatus))}
                variant="outline"
              >
                {overallStatus === "pending"
                  ? "处理中"
                  : overallStatus === "success"
                  ? "完成"
                  : overallStatus === "cancelled"
                  ? "已取消"
                  : "错误"}
              </Badge>
            </div>
            <div className="flex gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(entry.prompt)}
                className="h-8 w-8 p-0"
                title="复制提示词"
              >
                <Copy className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetry}
                className="h-8 w-8 p-0"
                title="重新提交"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="删除对话"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <CardTitle className="text-sm font-medium line-clamp-3 mt-2">
            <MessageCircle className="w-4 h-4 inline mr-2 shrink-0" />
            {truncateText(entry.prompt, 150)}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col space-y-3">
          {/* 性能统计 */}
          {performanceStats && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <BarChart3 className="w-3 h-3" />
                性能概览
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <Award className="w-3 h-3 text-green-600" />
                  <span>
                    最快: {formatDuration(performanceStats.fastestDuration)}
                  </span>
                  {performanceStats.fastestProvider && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {performanceStats.fastestProvider}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-blue-600" />
                  <span>
                    平均: {formatDuration(performanceStats.avgDuration)}
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {performanceStats.totalCompleted}/
                {performanceStats.totalRequested} 完成
                {responseStats && (
                  <span className="ml-2">
                    平均 {responseStats.avgLength} 字符
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 响应列表 */}
          <div className="space-y-2 flex-1">
            {isExpanded
              ? entry.responses.map((response) => (
                  <ResponseItem key={response.id} response={response} />
                ))
              : entry.responses
                  .slice(0, 2)
                  .map((response) => (
                    <ResponseItem key={response.id} response={response} />
                  ))}

            {/* 展开/收起按钮 */}
            {entry.responses.length > 2 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full h-8 text-xs"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3 mr-1" />
                    收起 ({entry.responses.length - 2} 个响应)
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 mr-1" />
                    展开查看 {entry.responses.length - 2} 个响应
                  </>
                )}
              </Button>
            )}
          </div>

          {/* 底部信息 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(entry.timestamp)}
            </div>
            <div className="text-xs">{entry.models.length} 个模型</div>
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除对话</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个对话记录吗？此操作不可撤销，将同时删除所有相关的响应数据。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

// 响应项组件
function ResponseItem({ response }: { response: PromptResponse }) {
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <Zap className="w-3 h-3 text-green-600" />;
      case "error":
        return <AlertCircle className="w-3 h-3 text-red-600" />;
      case "pending":
        return (
          <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
        );
      case "streaming":
        return (
          <div className="w-3 h-3 rounded-full bg-blue-400 animate-pulse" />
        );
      case "cancelled":
        return <AlertCircle className="w-3 h-3 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string, isStreaming?: boolean) => {
    switch (status) {
      case "success":
        return "完成";
      case "error":
        return "错误";
      case "pending":
        return "等待中";
      case "streaming":
        return isStreaming ? "流式生成中..." : "流式完成";
      case "cancelled":
        return "已取消";
      default:
        return status;
    }
  };

  const copyResponse = async () => {
    try {
      await navigator.clipboard.writeText(response.response);
      toast.success("响应已复制", {
        description: `${response.providerId} ${response.model} 的响应已复制到剪贴板`,
        duration: 2000,
      });
    } catch (error) {
      console.error("Failed to copy response:", error);
      toast.error("复制失败", {
        description: "无法复制响应内容",
        duration: 3000,
      });
    }
  };

  const handleCancel = () => {
    if (response.status === "streaming" && response.isStreaming) {
      usePromptStore.getState().cancelResponse(response.id);
      toast.info("正在取消响应", {
        description: "流式响应将在下一个数据块后停止",
        duration: 2000,
      });
    }
  };

  // 获取性能等级
  const getPerformanceLevel = (duration: number) => {
    if (duration < 1000)
      return { level: "excellent", color: "text-green-600", label: "优秀" };
    if (duration < 3000)
      return { level: "good", color: "text-blue-600", label: "良好" };
    if (duration < 5000)
      return { level: "average", color: "text-yellow-600", label: "一般" };
    return { level: "slow", color: "text-red-600", label: "较慢" };
  };

  const performanceLevel = response.duration
    ? getPerformanceLevel(response.duration)
    : null;

  // 获取错误类型
  const getErrorCategory = (error: string) => {
    if (error.includes("API密钥") || error.includes("API key")) {
      return { category: "auth", icon: "🔑", title: "认证错误" };
    }
    if (
      error.includes("网络") ||
      error.includes("network") ||
      error.includes("timeout")
    ) {
      return { category: "network", icon: "🌐", title: "网络错误" };
    }
    if (
      error.includes("频率") ||
      error.includes("rate") ||
      error.includes("quota")
    ) {
      return { category: "rate", icon: "⏱️", title: "限额错误" };
    }
    if (error.includes("模型") || error.includes("model")) {
      return { category: "model", icon: "🤖", title: "模型错误" };
    }
    return { category: "other", icon: "❌", title: "其他错误" };
  };

  const errorCategory = response.error
    ? getErrorCategory(response.error)
    : null;

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon(response.status)}
          <span className="text-xs font-medium">{response.providerId}</span>
          <span className="text-xs text-muted-foreground">
            {response.model}
          </span>
          {response.status === "streaming" && response.isStreaming && (
            <span className="text-xs text-blue-600 animate-pulse">
              正在生成...
            </span>
          )}
          {/* 性能等级指示器 */}
          {performanceLevel && response.status === "success" && (
            <Badge
              variant="outline"
              className={`text-[10px] px-1 py-0 ${performanceLevel.color}`}
            >
              {performanceLevel.label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {response.duration && (
            <span
              className={`text-xs ${
                performanceLevel?.color || "text-muted-foreground"
              }`}
            >
              {formatDuration(response.duration)}
            </span>
          )}
          {/* 响应长度 */}
          {response.status === "success" && response.response && (
            <span className="text-xs text-muted-foreground">
              {response.response.length}字
            </span>
          )}
          {/* 取消按钮 */}
          {response.status === "streaming" && response.isStreaming && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
              title="取消响应"
            >
              <AlertCircle className="w-3 h-3" />
            </Button>
          )}
          {/* 复制按钮 */}
          {(response.status === "success" ||
            (response.status === "streaming" && response.response) ||
            (response.status === "cancelled" && response.response)) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={copyResponse}
              className="h-6 w-6 p-0"
            >
              <Copy className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* 成功状态：显示完整响应 */}
      {response.status === "success" && response.response && (
        <div className="text-xs text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
          {response.response}
        </div>
      )}

      {/* 流式状态：显示当前累积的响应，带有实时更新效果 */}
      {response.status === "streaming" && (
        <div className="text-xs text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
          {response.response}
          {response.isStreaming && (
            <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1" />
          )}
        </div>
      )}

      {/* 取消状态：显示已取消的部分响应 */}
      {response.status === "cancelled" && (
        <div className="text-xs space-y-1">
          <div className="text-gray-600">已取消</div>
          {response.response && (
            <div className="text-foreground whitespace-pre-wrap max-h-32 overflow-y-auto opacity-75">
              {response.response}
            </div>
          )}
        </div>
      )}

      {/* 错误状态 */}
      {response.status === "error" && response.error && errorCategory && (
        <div className="text-xs space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{errorCategory.icon}</span>
            <span className="font-medium text-red-600">
              {errorCategory.title}
            </span>
          </div>
          <div className="text-red-600 text-[11px] leading-relaxed">
            {response.error}
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded p-2 text-[11px]">
            {errorCategory.category === "auth" && (
              <div className="text-muted-foreground">
                💡 <strong>建议:</strong> 请在设置页面检查并更新您的API密钥
              </div>
            )}
            {errorCategory.category === "network" && (
              <div className="text-muted-foreground">
                💡 <strong>建议:</strong> 检查网络连接，稍后重试或联系服务提供商
              </div>
            )}
            {errorCategory.category === "rate" && (
              <div className="text-muted-foreground">
                💡 <strong>建议:</strong>{" "}
                请稍等片刻再重试，或考虑升级您的API计划
              </div>
            )}
            {errorCategory.category === "model" && (
              <div className="text-muted-foreground">
                💡 <strong>建议:</strong> 尝试选择其他可用模型或检查模型名称
              </div>
            )}
            {errorCategory.category === "other" && (
              <div className="text-muted-foreground">
                💡 <strong>建议:</strong> 请检查请求参数或联系技术支持
              </div>
            )}
          </div>
        </div>
      )}

      {/* 等待状态 */}
      {response.status === "pending" && (
        <div className="text-xs text-muted-foreground">正在准备请求...</div>
      )}
    </div>
  );
}
