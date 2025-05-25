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
import { Clock, MessageCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TimelineEntry {
  id: string;
  prompt: string;
  response: string;
  provider: string;
  model: string;
  timestamp: Date;
  status: "success" | "error" | "pending";
  duration?: number; // 响应时间（毫秒）
}

interface TimelineCardProps {
  entry: TimelineEntry;
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

export default function TimelineCard({ entry, index = 0 }: TimelineCardProps) {
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
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
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
      <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-200 cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Badge variant="secondary" className="shrink-0">
                {entry.provider}
              </Badge>
              <span className="text-xs text-muted-foreground truncate">
                {entry.model}
              </span>
            </div>
            <Badge
              className={cn("shrink-0 ml-2", getStatusColor(entry.status))}
              variant="outline"
            >
              {entry.status}
            </Badge>
          </div>

          <CardTitle className="text-sm font-medium line-clamp-2 mt-2">
            <MessageCircle className="w-4 h-4 inline mr-2 shrink-0" />
            {truncateText(entry.prompt, 120)}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col">
          <CardDescription className="flex-1 text-sm line-clamp-4 mb-4">
            {truncateText(entry.response, 200)}
          </CardDescription>

          <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto pt-2 border-t">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTime(entry.timestamp)}
            </div>

            {entry.duration && (
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {formatDuration(entry.duration)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
