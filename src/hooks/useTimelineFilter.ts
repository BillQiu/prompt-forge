import { useMemo } from "react";
import type { PromptEntry } from "@/stores/promptStore";
import { useTimelineFilterStore } from "@/stores/timelineFilterStore";

export function useTimelineFilter(entries: PromptEntry[]) {
  const {
    statusFilter,
    providerFilter,
    modelFilter,
    startDate,
    endDate,
    sortOrder,
  } = useTimelineFilterStore();

  // 计算可用的提供商和模型列表
  const availableProviders = useMemo(() => {
    const providers = new Set<string>();
    entries.forEach((entry) => {
      entry.providers.forEach((provider) => providers.add(provider));
    });
    return Array.from(providers).sort();
  }, [entries]);

  const availableModels = useMemo(() => {
    const models = new Set<string>();
    entries.forEach((entry) => {
      entry.models.forEach((model) => models.add(model));
    });
    return Array.from(models).sort();
  }, [entries]);

  // 过滤和排序条目
  const filteredAndSortedEntries = useMemo(() => {
    let filtered = entries.filter((entry) => {
      // 状态过滤
      if (statusFilter !== "all") {
        const overallStatus =
          entry.status === "pending" ||
          entry.responses.some((r) => r.status === "streaming")
            ? "pending"
            : entry.responses.some((r) => r.status === "success")
            ? "success"
            : entry.responses.every((r) => r.status === "cancelled")
            ? "cancelled"
            : "error";

        if (overallStatus !== statusFilter) return false;
      }

      // 提供商过滤
      if (providerFilter !== "all") {
        if (!entry.providers.includes(providerFilter)) return false;
      }

      // 模型过滤
      if (modelFilter !== "all") {
        if (!entry.models.includes(modelFilter)) return false;
      }

      // 日期范围过滤
      if (startDate || endDate) {
        const entryDate = new Date(entry.timestamp);

        // 移除时间部分，只比较日期
        const entryDateOnly = new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate()
        );

        if (startDate) {
          const startDateOnly = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate()
          );
          if (entryDateOnly < startDateOnly) return false;
        }

        if (endDate) {
          const endDateOnly = new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate()
          );
          if (entryDateOnly > endDateOnly) return false;
        }
      }

      return true;
    });

    // 排序
    filtered.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();

      if (sortOrder === "newest") {
        return timeB - timeA; // 最新的在前
      } else {
        return timeA - timeB; // 最旧的在前
      }
    });

    return filtered;
  }, [
    entries,
    statusFilter,
    providerFilter,
    modelFilter,
    startDate,
    endDate,
    sortOrder,
  ]);

  // 统计信息
  const stats = useMemo(() => {
    const total = entries.length;
    const filtered = filteredAndSortedEntries.length;
    const pending = entries.filter(
      (entry) =>
        entry.status === "pending" ||
        entry.responses.some((r) => r.status === "streaming")
    ).length;
    const completed = entries.filter((entry) =>
      entry.responses.some((r) => r.status === "success")
    ).length;
    const errors = entries.filter(
      (entry) =>
        entry.responses.some((r) => r.status === "error") &&
        !entry.responses.some((r) => r.status === "success")
    ).length;

    return { total, filtered, pending, completed, errors };
  }, [entries, filteredAndSortedEntries]);

  return {
    availableProviders,
    availableModels,
    filteredEntries: filteredAndSortedEntries,
    stats,
  };
}
