"use client";

import { motion } from "framer-motion";
import PromptTimelineCard from "./PromptTimelineCard";
import FilterBar from "./FilterBar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Plus, MessageCircle, BarChart3 } from "lucide-react";
import { usePromptStore } from "@/stores/promptStore";
import { useTimelineFilter } from "@/hooks/useTimelineFilter";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.3,
      staggerChildren: 0.1,
    },
  },
};

interface TimelineViewProps {
  className?: string;
}

export default function TimelineView({ className }: TimelineViewProps) {
  const router = useRouter();
  const { entries, isSubmitting, isLoading, loadHistoryFromDB } =
    usePromptStore();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);

  // 使用新的过滤和排序hook
  const { availableProviders, availableModels, filteredEntries, stats } =
    useTimelineFilter(entries);

  // 在组件挂载时加载历史数据
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadError(null);
        await loadHistoryFromDB({ limit: 50 });
        setHasInitialLoaded(true);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "加载历史数据失败";
        setLoadError(errorMessage);
        setHasInitialLoaded(true);
        console.error("Failed to load timeline data:", error);
      }
    };

    // 只在还没有初始加载过且不在加载中时才加载数据
    if (!hasInitialLoaded && !isLoading) {
      loadData();
    }
  }, [hasInitialLoaded, isLoading, loadHistoryFromDB]);

  const handleRefresh = async () => {
    try {
      setLoadError(null);
      await loadHistoryFromDB({ limit: 50 });
      setHasInitialLoaded(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "刷新数据失败";
      setLoadError(errorMessage);
      console.error("Failed to refresh timeline data:", error);
    }
  };

  const handleNewPrompt = () => {
    router.push("/test-form");
  };

  return (
    <div className={className}>
      {/* 头部操作区域 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                AI 响应时间轴
              </CardTitle>
              <CardDescription>
                查看所有AI对话历史，支持多提供商和模型比较
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
                />
                {isLoading
                  ? "加载中..."
                  : !hasInitialLoaded
                  ? "加载数据"
                  : entries.length === 0
                  ? "重新加载"
                  : "刷新"}
              </Button>
              <Button size="sm" onClick={handleNewPrompt}>
                <Plus className="w-4 h-4 mr-2" />
                新对话
              </Button>
            </div>
          </div>

          {/* 统计信息 */}
          {entries.length > 0 && (
            <div className="flex gap-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">总计: {stats.total}</Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                  进行中: {stats.pending}
                </Badge>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  已完成: {stats.completed}
                </Badge>
                <Badge variant="outline" className="bg-red-50 text-red-700">
                  错误: {stats.errors}
                </Badge>
              </div>
            </div>
          )}
        </CardHeader>

        {/* 过滤器组件 */}
        {entries.length > 0 && (
          <CardContent className="pt-0">
            <FilterBar
              availableProviders={availableProviders}
              availableModels={availableModels}
              totalCount={stats.total}
              filteredCount={stats.filtered}
            />
          </CardContent>
        )}
      </Card>

      {/* 错误状态显示 */}
      {loadError && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-700">
              <div className="text-red-500">⚠️</div>
              <div>
                <p className="font-medium">数据加载失败</p>
                <p className="text-sm text-red-600">{loadError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
                className="ml-auto"
              >
                重试
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 时间轴网格 */}
      {filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-muted-foreground text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              {entries.length === 0 ? (
                <>
                  <h3 className="text-lg font-medium mb-2">
                    {!hasInitialLoaded
                      ? "正在加载对话记录..."
                      : "还没有对话记录"}
                  </h3>
                  <p className="text-sm mb-4">
                    {!hasInitialLoaded
                      ? "请稍候..."
                      : "开始您的第一次AI对话吧！"}
                  </p>
                  {hasInitialLoaded && (
                    <Button onClick={handleNewPrompt}>
                      <Plus className="w-4 h-4 mr-2" />
                      创建新对话
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium mb-2">
                    没有符合条件的记录
                  </h3>
                  <p className="text-sm mb-4">尝试调整过滤条件</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
        >
          {filteredEntries.map((entry, index) => (
            <PromptTimelineCard key={entry.id} entry={entry} index={index} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
