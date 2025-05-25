"use client";

import React, { useState, useEffect } from "react";
import {
  Check,
  X,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useUserSettingsStore } from "@/stores/userSettingsStore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";

// 导入适配器工厂来获取实际可用的模型
import { GeminiAdapterFactory } from "@/services/llm/adapters/GeminiAdapter";
import { ClaudeAdapterFactory } from "@/services/llm/adapters/ClaudeAdapter";
import { OllamaAdapterFactory } from "@/services/llm/adapters/OllamaAdapter";
import { OpenAIAdapterFactory } from "@/services/llm/adapters/OpenAIAdapter";
import { dbHelpers } from "@/services/db";
import { decryptApiKey } from "@/services/encryption";

interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  connected: boolean;
  availableModels: string[];
  enabledModels: string[];
  loading: boolean;
  error?: string;
  lastChecked?: number; // 添加缓存时间戳
}

// 缓存状态的持续时间（5分钟）
const CACHE_DURATION = 5 * 60 * 1000;

export default function ProviderManagement() {
  const {
    providers,
    setProviderEnabled,
    setModelEnabled,
    updateProvider,
    updateModel,
  } = useUserSettingsStore();

  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>(
    []
  );
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(
    null
  );
  const [showAllProviders, setShowAllProviders] = useState(false);

  // 初始化提供商状态
  useEffect(() => {
    initializeProviderStatuses();
  }, [providers]);

  const initializeProviderStatuses = async () => {
    const statuses: ProviderStatus[] = [];

    for (const provider of providers) {
      const status: ProviderStatus = {
        id: provider.id,
        name: provider.name,
        configured: provider.apiKeyStored,
        connected: false,
        availableModels: [],
        enabledModels: provider.models
          .filter((m) => m.enabled)
          .map((m) => m.id),
        loading: false,
      };

      // 检查缓存的连接状态
      const cachedStatus = getCachedProviderStatus(provider.id);
      if (cachedStatus && isCacheValid(cachedStatus.lastChecked)) {
        Object.assign(status, cachedStatus);
      } else if (provider.apiKeyStored) {
        // 只有在缓存无效且已配置API密钥时才检查连接
        await checkProviderConnection(status);
      } else {
        // 未配置时显示默认模型
        status.availableModels = provider.models.map((m) => m.id);
      }

      statuses.push(status);
    }

    setProviderStatuses(statuses);
  };

  // 缓存相关函数
  const getCachedProviderStatus = (
    providerId: string
  ): ProviderStatus | null => {
    try {
      const cached = localStorage.getItem(`provider_status_${providerId}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  const setCachedProviderStatus = (status: ProviderStatus) => {
    try {
      const statusWithTimestamp = {
        ...status,
        lastChecked: Date.now(),
      };
      localStorage.setItem(
        `provider_status_${status.id}`,
        JSON.stringify(statusWithTimestamp)
      );
    } catch {
      // 忽略存储错误
    }
  };

  const isCacheValid = (lastChecked?: number): boolean => {
    if (!lastChecked) return false;
    return Date.now() - lastChecked < CACHE_DURATION;
  };

  const checkProviderConnection = async (status: ProviderStatus) => {
    try {
      status.loading = true;
      setProviderStatuses((prev) =>
        prev.map((s) => (s.id === status.id ? { ...status } : s))
      );

      let adapter: any;
      let configValue = "";

      // 获取存储的配置
      const storedKey = await dbHelpers.getApiKey(status.id);
      if (storedKey) {
        configValue = await decryptApiKey({
          encryptedData: storedKey.encryptedKey,
          iv: storedKey.iv,
          salt: storedKey.salt || "",
          keyId: storedKey.keyId,
        });
      }

      // 创建适配器实例
      switch (status.id) {
        case "openai":
          adapter = new OpenAIAdapterFactory().createAdapter();
          break;
        case "google":
          adapter = new GeminiAdapterFactory().createAdapter();
          break;
        case "anthropic":
          adapter = new ClaudeAdapterFactory().createAdapter();
          break;
        case "ollama":
          adapter = new OllamaAdapterFactory().createAdapter();
          break;
      }

      if (adapter && configValue) {
        // 验证连接并获取可用模型
        let isValid = false;

        if (status.id === "ollama") {
          // Ollama 不需要API密钥验证，只需要检查服务器连接
          // 这里我们假设如果有配置就是有效的
          isValid = true;
        } else {
          // 其他提供商验证API密钥
          isValid = (await adapter.validateApiKey?.(configValue)) || false;
        }

        if (isValid) {
          const models = adapter.getSupportedModels?.() || [];
          status.connected = true;
          status.availableModels = models.map((m: any) => m.id);
          status.error = undefined;
        } else {
          status.connected = false;
          status.error = "无法验证API密钥";
        }
      } else {
        status.connected = false;
        status.error = "缺少配置信息";
      }
    } catch (error) {
      console.error(`Failed to check ${status.id} connection:`, error);
      status.connected = false;
      status.error = error instanceof Error ? error.message : "连接失败";
    } finally {
      status.loading = false;
      // 缓存状态
      setCachedProviderStatus(status);
      setProviderStatuses((prev) =>
        prev.map((s) => (s.id === status.id ? { ...status } : s))
      );
    }
  };

  const handleRefreshProvider = async (providerId: string) => {
    setRefreshingProvider(providerId);
    const status = providerStatuses.find((s) => s.id === providerId);
    if (status) {
      await checkProviderConnection(status);
    }
    setRefreshingProvider(null);
  };

  const handleProviderToggle = async (providerId: string, enabled: boolean) => {
    try {
      setProviderEnabled(providerId, enabled);

      if (enabled) {
        // 启用提供商时，检查连接状态
        const status = providerStatuses.find((s) => s.id === providerId);
        if (status && status.configured) {
          await checkProviderConnection(status);
        }
      }

      toast.success(
        `${providers.find((p) => p.id === providerId)?.name} ${
          enabled ? "已启用" : "已禁用"
        }`
      );
    } catch (error) {
      console.error("Failed to toggle provider:", error);
      toast.error("操作失败，请重试");
    }
  };

  const handleModelToggle = (
    providerId: string,
    modelId: string,
    enabled: boolean
  ) => {
    try {
      setModelEnabled(providerId, modelId, enabled);

      // 更新本地状态
      setProviderStatuses((prev) =>
        prev.map((status) => {
          if (status.id === providerId) {
            return {
              ...status,
              enabledModels: enabled
                ? [...status.enabledModels, modelId]
                : status.enabledModels.filter((id) => id !== modelId),
            };
          }
          return status;
        })
      );

      const provider = providers.find((p) => p.id === providerId);
      const model = provider?.models.find((m) => m.id === modelId);
      toast.success(`${model?.name} ${enabled ? "已启用" : "已禁用"}`);
    } catch (error) {
      console.error("Failed to toggle model:", error);
      toast.error("操作失败，请重试");
    }
  };

  const toggleProviderExpanded = (providerId: string) => {
    setExpandedProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(providerId)) {
        newSet.delete(providerId);
      } else {
        newSet.add(providerId);
      }
      return newSet;
    });
  };

  const getProviderStatusColor = (status: ProviderStatus) => {
    if (!status.configured) return "text-gray-500";
    if (status.loading) return "text-yellow-500";
    if (status.connected) return "text-green-500";
    return "text-red-500";
  };

  const getProviderStatusIcon = (status: ProviderStatus) => {
    if (!status.configured) return <X className="w-4 h-4" />;
    if (status.loading) return <RefreshCw className="w-4 h-4 animate-spin" />;
    if (status.connected) return <Check className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  const getProviderStatusText = (status: ProviderStatus) => {
    if (!status.configured) return "未配置";
    if (status.loading) return "检查中...";
    if (status.connected) return "已连接";
    return status.error || "连接失败";
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* 页面标题 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <Settings className="w-6 h-6" />
              提供商和模型管理
            </CardTitle>
            <CardDescription>
              管理LLM提供商配置、查看连接状态并控制可用模型
            </CardDescription>
          </CardHeader>
        </Card>

        {/* 提供商列表 */}
        <div className="space-y-4">
          {/* 横向网格布局 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {providerStatuses
              .slice(0, showAllProviders ? undefined : 4)
              .map((status) => {
                const provider = providers.find((p) => p.id === status.id);
                if (!provider) return null;

                return (
                  <Card
                    key={status.id}
                    className={cn(
                      "transition-all duration-200 hover:shadow-md cursor-pointer",
                      provider.enabled
                        ? "border-primary/20 bg-primary/5"
                        : "border-border"
                    )}
                    onClick={() => toggleProviderExpanded(status.id)}
                  >
                    <CardHeader className="pb-4">
                      {/* 状态图标和提供商名称 */}
                      <div className="flex items-center justify-between">
                        <div
                          className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-full",
                            provider.enabled
                              ? "bg-primary/10 text-primary"
                              : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                          )}
                        >
                          {getProviderStatusIcon(status)}
                        </div>
                        <Badge
                          variant={provider.enabled ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {provider.enabled ? "启用" : "禁用"}
                        </Badge>
                      </div>

                      {/* 提供商名称 */}
                      <div>
                        <CardTitle className="text-base font-semibold">
                          {provider.name}
                        </CardTitle>
                        <CardDescription
                          className={cn(
                            "text-xs",
                            getProviderStatusColor(status)
                          )}
                        >
                          {getProviderStatusText(status)}
                        </CardDescription>
                      </div>

                      {/* 模型统计 */}
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>模型: {status.availableModels.length}</span>
                        <span>启用: {status.enabledModels.length}</span>
                      </div>

                      {/* 控制按钮 */}
                      <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center space-x-1">
                          {/* 刷新按钮 */}
                          {status.configured && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRefreshProvider(status.id);
                                  }}
                                  disabled={refreshingProvider === status.id}
                                >
                                  <RefreshCw
                                    className={cn(
                                      "w-3 h-3",
                                      refreshingProvider === status.id &&
                                        "animate-spin"
                                    )}
                                  />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>刷新</TooltipContent>
                            </Tooltip>
                          )}
                        </div>

                        {/* 启用/禁用开关 */}
                        <Switch
                          checked={provider.enabled}
                          onCheckedChange={(enabled) => {
                            handleProviderToggle(status.id, enabled);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
          </div>

          {/* 更多按钮 */}
          {providerStatuses.length > 4 && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setShowAllProviders(!showAllProviders)}
              >
                {showAllProviders ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    收起
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    显示更多 ({providerStatuses.length - 4} 个)
                  </>
                )}
              </Button>
            </div>
          )}

          {/* 展开的提供商详情 */}
          {Array.from(expandedProviders).map((providerId) => {
            const status = providerStatuses.find((s) => s.id === providerId);
            const provider = providers.find((p) => p.id === providerId);
            if (!status || !provider) return null;

            const availableModelConfigs = provider.models.filter((model) =>
              status.availableModels.includes(model.id)
            );

            return (
              <Card key={`expanded-${providerId}`} className="mt-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {provider.name} 模型配置
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleProviderExpanded(providerId)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {status.configured && status.connected ? (
                    <div className="space-y-3">
                      <div className="grid gap-2">
                        {availableModelConfigs.map((model) => (
                          <div
                            key={model.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {model.name}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {model.id}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {model.temperature &&
                                  `温度: ${model.temperature} • `}
                                {model.maxTokens &&
                                  `最大令牌: ${model.maxTokens}`}
                              </div>
                            </div>
                            <Switch
                              checked={model.enabled}
                              onCheckedChange={(enabled: boolean) =>
                                handleModelToggle(status.id, model.id, enabled)
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : !status.configured ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>请先在下方的API密钥管理中配置此提供商</p>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>无法连接到此提供商</p>
                      {status.error && (
                        <p className="text-xs mt-1 text-red-500">
                          {status.error}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* 全局操作 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">全局操作</CardTitle>
            <CardDescription>批量管理所有提供商和模型</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  providers.forEach((provider) => {
                    if (provider.apiKeyStored) {
                      setProviderEnabled(provider.id, true);
                    }
                  });
                  toast.success("已启用所有已配置的提供商");
                }}
              >
                启用所有已配置提供商
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  providers.forEach((provider) => {
                    setProviderEnabled(provider.id, false);
                  });
                  toast.success("已禁用所有提供商");
                }}
              >
                禁用所有提供商
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  providerStatuses.forEach((status) => {
                    if (status.configured) {
                      handleRefreshProvider(status.id);
                    }
                  });
                  toast.success("正在刷新所有提供商连接状态");
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                刷新所有连接
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
