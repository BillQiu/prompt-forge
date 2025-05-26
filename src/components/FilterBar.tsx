"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-picker";
import { useTimelineFilterStore } from "@/stores/timelineFilterStore";
import type {
  StatusFilter,
  ProviderFilter,
  ModelFilter,
  SortOrder,
} from "@/stores/timelineFilterStore";

interface FilterBarProps {
  availableProviders: string[];
  availableModels: string[];
  totalCount: number;
  filteredCount: number;
  className?: string;
}

export default function FilterBar({
  availableProviders,
  availableModels,
  totalCount,
  filteredCount,
  className,
}: FilterBarProps) {
  const {
    statusFilter,
    providerFilter,
    modelFilter,
    startDate,
    endDate,
    sortOrder,
    setStatusFilter,
    setProviderFilter,
    setModelFilter,
    setDateRange,
    setSortOrder,
    clearFilters,
    hasActiveFilters,
  } = useTimelineFilterStore();

  const handleStatusChange = (value: string) => {
    setStatusFilter(value as StatusFilter);
  };

  const handleProviderChange = (value: string) => {
    setProviderFilter(value as ProviderFilter);
  };

  const handleModelChange = (value: string) => {
    setModelFilter(value as ModelFilter);
  };

  const handleSortToggle = () => {
    setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
  };

  const getSortIcon = () => {
    if (sortOrder === "newest") {
      return <ArrowDown className="w-4 h-4" />;
    }
    return <ArrowUp className="w-4 h-4" />;
  };

  const getSortLabel = () => {
    return sortOrder === "newest" ? "最新在前" : "最旧在前";
  };

  return (
    <div className={className}>
      <div className="flex flex-col gap-4">
        {/* 第一行：主要过滤器 */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium">过滤:</span>
          </div>

          {/* 状态过滤器 */}
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              <SelectItem value="pending">进行中</SelectItem>
              <SelectItem value="success">已完成</SelectItem>
              <SelectItem value="error">错误</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>

          {/* 提供商过滤器 */}
          <Select value={providerFilter} onValueChange={handleProviderChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="提供商" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有提供商</SelectItem>
              {availableProviders.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 模型过滤器 */}
          <Select value={modelFilter} onValueChange={handleModelChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="模型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有模型</SelectItem>
              {availableModels.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 排序控制 */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4" />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSortToggle}
              className="flex items-center gap-2"
            >
              {getSortIcon()}
              {getSortLabel()}
            </Button>
          </div>

          {/* 清除过滤器按钮 */}
          {hasActiveFilters() && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              清除过滤器
            </Button>
          )}

          {/* 结果计数 */}
          <div className="ml-auto text-sm text-muted-foreground">
            显示 {filteredCount} / {totalCount} 项
          </div>
        </div>

        {/* 第二行：日期范围过滤器 */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">时间范围:</span>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(date) => setDateRange(date, endDate)}
            onEndDateChange={(date) => setDateRange(startDate, date)}
          />
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange(undefined, undefined)}
            >
              <X className="w-4 h-4 mr-1" />
              清除时间
            </Button>
          )}
        </div>

        {/* 活跃过滤器标签 */}
        {hasActiveFilters() && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">活跃过滤器:</span>

            {statusFilter !== "all" && (
              <Badge variant="secondary" className="flex items-center gap-1">
                状态: {statusFilter}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => setStatusFilter("all")}
                />
              </Badge>
            )}

            {providerFilter !== "all" && (
              <Badge variant="secondary" className="flex items-center gap-1">
                提供商: {providerFilter}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => setProviderFilter("all")}
                />
              </Badge>
            )}

            {modelFilter !== "all" && (
              <Badge variant="secondary" className="flex items-center gap-1">
                模型: {modelFilter}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => setModelFilter("all")}
                />
              </Badge>
            )}

            {startDate && (
              <Badge variant="secondary" className="flex items-center gap-1">
                开始: {startDate.toLocaleDateString()}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => setDateRange(undefined, endDate)}
                />
              </Badge>
            )}

            {endDate && (
              <Badge variant="secondary" className="flex items-center gap-1">
                结束: {endDate.toLocaleDateString()}
                <X
                  className="w-3 h-3 cursor-pointer"
                  onClick={() => setDateRange(startDate, undefined)}
                />
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
