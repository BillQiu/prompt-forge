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
  Clock,
  MessageCircle,
  Zap,
  Copy,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PromptEntry, PromptResponse } from "@/stores/promptStore";
import { usePromptStore } from "@/stores/promptStore";

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

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      variants={cardVariants}
      className="h-full"
    >
      <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-200">
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
              >
                <Copy className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRetry}
                className="h-8 w-8 p-0"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <CardTitle className="text-sm font-medium line-clamp-3 mt-2">
            <MessageCircle className="w-4 h-4 inline mr-2 shrink-0" />
            {truncateText(entry.prompt, 150)}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col space-y-3">
          {/* 响应列表 */}
          <div className="space-y-2 flex-1">
            {entry.responses.map((response) => (
              <ResponseItem key={response.id} response={response} />
            ))}
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
        </div>
        <div className="flex items-center gap-2">
          {response.duration && (
            <span className="text-xs text-muted-foreground">
              {formatDuration(response.duration)}
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
      {response.status === "error" && response.error && (
        <div className="text-xs space-y-1">
          <div className="text-red-600">错误: {response.error}</div>
          {response.error.includes("API密钥") && (
            <div className="text-muted-foreground">
              💡 建议: 请在设置中检查您的API密钥
            </div>
          )}
          {response.error.includes("网络") && (
            <div className="text-muted-foreground">
              💡 建议: 请检查网络连接或稍后重试
            </div>
          )}
          {response.error.includes("频率") && (
            <div className="text-muted-foreground">
              💡 建议: 请稍等片刻再重试
            </div>
          )}
        </div>
      )}

      {/* 等待状态 */}
      {response.status === "pending" && (
        <div className="text-xs text-muted-foreground">正在准备请求...</div>
      )}
    </div>
  );
}
