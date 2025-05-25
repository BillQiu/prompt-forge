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
}

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

      // 如果提供商已配置，尝试获取可用模型
      if (provider.apiKeyStored) {
        await checkProviderConnection(status);
      } else {
        // 未配置时显示默认模型
        status.availableModels = provider.models.map((m) => m.id);
      }

      statuses.push(status);
    }

    setProviderStatuses(statuses);
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
  };

  const handleModelToggle = (
    providerId: string,
    modelId: string,
    enabled: boolean
  ) => {
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
        <div className="grid gap-4">
          {providerStatuses.map((status) => {
            const provider = providers.find((p) => p.id === status.id);
            if (!provider) return null;

            const isExpanded = expandedProviders.has(status.id);
            const availableModelConfigs = provider.models.filter((model) =>
              status.availableModels.includes(model.id)
            );

            return (
              <Card key={status.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-full",
                          provider.enabled
                            ? "bg-primary/10 text-primary"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                        )}
                      >
                        {getProviderStatusIcon(status)}
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {provider.name}
                          <Badge
                            variant={provider.enabled ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {provider.enabled ? "启用" : "禁用"}
                          </Badge>
                        </CardTitle>
                        <CardDescription
                          className={getProviderStatusColor(status)}
                        >
                          {getProviderStatusText(status)}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* 刷新按钮 */}
                      {status.configured && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRefreshProvider(status.id)}
                              disabled={refreshingProvider === status.id}
                            >
                              <RefreshCw
                                className={cn(
                                  "w-4 h-4",
                                  refreshingProvider === status.id &&
                                    "animate-spin"
                                )}
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>刷新连接状态</TooltipContent>
                        </Tooltip>
                      )}

                      {/* 启用/禁用开关 */}
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={provider.enabled}
                          onCheckedChange={(enabled: boolean) =>
                            handleProviderToggle(status.id, enabled)
                          }
                        />
                        <Label className="text-sm">启用</Label>
                      </div>

                      {/* 展开/收起按钮 */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleProviderExpanded(status.id)}
                          >
                            {isExpanded ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </Collapsible>
                    </div>
                  </div>

                  {/* 模型统计 */}
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-2">
                    <span>可用模型: {status.availableModels.length}</span>
                    <span>已启用: {status.enabledModels.length}</span>
                  </div>
                </CardHeader>

                {/* 模型详情（可展开） */}
                <Collapsible open={isExpanded}>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      {status.configured && status.connected ? (
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium">可用模型配置</h4>
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
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
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
                                    handleModelToggle(
                                      status.id,
                                      model.id,
                                      enabled
                                    )
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
                  </CollapsibleContent>
                </Collapsible>
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
