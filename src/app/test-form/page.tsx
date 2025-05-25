"use client";

import { motion } from "framer-motion";
import PromptInputForm from "@/components/PromptInputForm";
import PromptTimelineCard from "@/components/PromptTimelineCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, MessageCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import { usePromptStore } from "@/stores/promptStore";

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

export default function TestFormPage() {
  const { entries, isSubmitting, submitPrompt, clearHistory } =
    usePromptStore();

  const handleSubmit = async (data: any) => {
    try {
      await submitPrompt({
        prompt: data.prompt,
        providers: data.providers,
        models: data.models,
      });
    } catch (error) {
      console.error("Failed to submit prompt:", error);
    }
  };

  const handleClearHistory = () => {
    if (confirm("确定要清除所有历史记录吗？")) {
      clearHistory();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* 页面标题 */}
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">AI 提示词测试平台</CardTitle>
              <CardDescription>
                同时向多个AI提供商发送提示词，比较不同模型的响应结果
              </CardDescription>
            </CardHeader>
          </Card>

          {/* 提示词输入表单 */}
          <PromptInputForm
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />

          {/* 时间轴区域 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>响应时间轴</CardTitle>
                  <CardDescription>
                    查看所有提示词的响应结果，支持复制和重试
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    刷新
                  </Button>
                  {entries.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearHistory}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      清除历史
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="text-muted-foreground text-center">
                    <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-medium mb-2">
                      还没有提示词记录
                    </h3>
                    <p className="text-sm mb-4">在上方输入提示词开始测试吧！</p>
                  </div>
                </div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={containerVariants}
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
                  {entries.map((entry, index) => (
                    <PromptTimelineCard
                      key={entry.id}
                      entry={entry}
                      index={index}
                    />
                  ))}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
