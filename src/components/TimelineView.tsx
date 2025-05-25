"use client";

import { motion } from "framer-motion";
import TimelineCard, { type TimelineEntry } from "./TimelineCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, MessageCircle } from "lucide-react";

// Mock数据 - 在实际应用中，这将来自API或状态管理
const mockTimelineData: TimelineEntry[] = [
  {
    id: "1",
    prompt: "请帮我写一个关于人工智能在医疗领域应用的文章摘要",
    response:
      "人工智能在医疗领域的应用正在revolutionizing传统医疗实践。从影像诊断到药物发现，AI技术正在提升诊断精度、降低医疗成本并改善患者体验。机器学习算法可以分析大量医疗数据，识别疾病模式，辅助医生做出更准确的诊断决策...",
    provider: "OpenAI",
    model: "gpt-4-turbo",
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5分钟前
    status: "success",
    duration: 2340,
  },
  {
    id: "2",
    prompt: "如何使用React和TypeScript构建一个现代化的Web应用？",
    response:
      "构建现代化React+TypeScript应用需要考虑以下几个关键方面：1. 项目结构和工具链设置 2. 类型安全的组件开发 3. 状态管理策略 4. 性能优化技巧...",
    provider: "Anthropic",
    model: "claude-3-5-sonnet",
    timestamp: new Date(Date.now() - 1000 * 60 * 15), // 15分钟前
    status: "success",
    duration: 1890,
  },
  {
    id: "3",
    prompt: "请解释什么是区块链技术，它有哪些实际应用场景？",
    response:
      "区块链是一种分布式数据库技术，通过密码学和共识机制确保数据的不可篡改性。主要应用场景包括：加密货币、供应链追溯、数字身份验证、智能合约等。它的核心优势在于去中心化、透明性和安全性...",
    provider: "Google",
    model: "gemini-pro",
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30分钟前
    status: "success",
    duration: 3120,
  },
  {
    id: "4",
    prompt: "生成一个创意的产品营销方案，针对年轻人市场",
    response:
      "针对Z世代的创意营销策略应该注重社交媒体互动、UGC内容生成、影响者合作以及体验式营销。建议采用短视频平台、虚拟体验、限量版产品和社区建设等方式...",
    provider: "OpenAI",
    model: "gpt-4",
    timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45分钟前
    status: "success",
    duration: 2800,
  },
  {
    id: "5",
    prompt: "设计一个用户友好的移动应用界面，提供最佳的用户体验",
    response: "",
    provider: "Anthropic",
    model: "claude-3-haiku",
    timestamp: new Date(Date.now() - 1000 * 60 * 2), // 2分钟前
    status: "pending",
    duration: undefined,
  },
  {
    id: "6",
    prompt: "分析当前市场趋势，预测下一年的技术发展方向",
    response: "无法连接到服务器，请稍后重试。",
    provider: "Google",
    model: "gemini-ultra",
    timestamp: new Date(Date.now() - 1000 * 60 * 8), // 8分钟前
    status: "error",
    duration: 5000,
  },
];

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
  const handleRefresh = () => {
    // TODO: 实现刷新功能
    console.log("刷新时间轴数据");
  };

  const handleNewPrompt = () => {
    // TODO: 跳转到新提示词页面或打开模态框
    console.log("创建新提示词");
  };

  return (
    <div className={className}>
      {/* 头部操作区域 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>提示词时间轴</CardTitle>
              <CardDescription>
                查看所有AI对话历史，支持多提供商和模型比较
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新
              </Button>
              <Button size="sm" onClick={handleNewPrompt}>
                <Plus className="w-4 h-4 mr-2" />
                新对话
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 时间轴网格 */}
      {mockTimelineData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-muted-foreground text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">还没有对话记录</h3>
              <p className="text-sm mb-4">开始您的第一次AI对话吧！</p>
              <Button onClick={handleNewPrompt}>
                <Plus className="w-4 h-4 mr-2" />
                创建新对话
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
        >
          {mockTimelineData.map((entry, index) => (
            <TimelineCard key={entry.id} entry={entry} index={index} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
