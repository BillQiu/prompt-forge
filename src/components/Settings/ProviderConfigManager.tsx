"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings, Wrench, Info } from "lucide-react";
import { toast } from "sonner";
import { llmService } from "@/services/llm";
import DynamicConfigForm from "./DynamicConfigForm";
import type { ProviderConfig } from "@/services/llm/BaseAdapter";

interface ProviderConfigManagerProps {
  className?: string;
}

interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
  hasConfig: boolean;
  isConfigured: boolean;
}

export default function ProviderConfigManager({
  className,
}: ProviderConfigManagerProps) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [isLoading, setIsLoading] = useState(true);

  // 加载提供商信息
  useEffect(() => {
    const loadProviders = async () => {
      try {
        setIsLoading(true);
        const availableProviders = llmService.getProviders().map((p) => p.id);

        const providerInfos: ProviderInfo[] = [];
        const loadedConfigs: Record<string, ProviderConfig> = {};

        for (const providerId of availableProviders) {
          const adapter = llmService.getAdapter(providerId);
          if (adapter) {
            const hasConfig = typeof adapter.getConfigSchema === "function";

            // 加载已保存的配置
            let isConfigured = false;
            if (hasConfig) {
              try {
                const savedConfig = await loadProviderConfig(providerId);
                if (savedConfig) {
                  loadedConfigs[providerId] = savedConfig;
                  isConfigured = true;
                }
              } catch (error) {
                console.warn(`Failed to load config for ${providerId}:`, error);
              }
            }

            providerInfos.push({
              id: providerId,
              name: adapter.providerName,
              description: adapter.description,
              hasConfig,
              isConfigured,
            });
          }
        }

        setProviders(providerInfos);
        setConfigs(loadedConfigs);
      } catch (error) {
        console.error("Failed to load providers:", error);
        toast.error("加载提供商信息失败");
      } finally {
        setIsLoading(false);
      }
    };

    loadProviders();
  }, []);

  // 从IndexedDB加载配置
  const loadProviderConfig = async (
    providerId: string
  ): Promise<ProviderConfig | null> => {
    try {
      // 使用数据库服务加载配置
      const { dbHelpers } = await import("@/services/db");
      const configKey = `provider_config_${providerId}`;
      const savedConfig = await dbHelpers.getSetting(configKey);
      return savedConfig || null;
    } catch (error) {
      console.error(`Failed to load config for ${providerId}:`, error);
      return null;
    }
  };

  // 保存配置到IndexedDB
  const saveProviderConfig = async (
    providerId: string,
    config: ProviderConfig
  ): Promise<void> => {
    try {
      const { dbHelpers } = await import("@/services/db");
      const configKey = `provider_config_${providerId}`;
      await dbHelpers.setSetting(configKey, config);

      // 更新本地状态
      setConfigs((prev) => ({
        ...prev,
        [providerId]: config,
      }));

      // 更新提供商配置状态
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId ? { ...p, isConfigured: true } : p
        )
      );

      console.log(`✅ Configuration saved for ${providerId}`);
    } catch (error) {
      console.error(`Failed to save config for ${providerId}:`, error);
      throw error;
    }
  };

  // 重置配置
  const resetProviderConfig = async (providerId: string): Promise<void> => {
    try {
      const { dbHelpers } = await import("@/services/db");
      const configKey = `provider_config_${providerId}`;
      await dbHelpers.deleteSetting(configKey);

      // 更新本地状态
      setConfigs((prev) => {
        const newConfigs = { ...prev };
        delete newConfigs[providerId];
        return newConfigs;
      });

      // 更新提供商配置状态
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId ? { ...p, isConfigured: false } : p
        )
      );

      console.log(`✅ Configuration reset for ${providerId}`);
    } catch (error) {
      console.error(`Failed to reset config for ${providerId}:`, error);
      throw error;
    }
  };

  const handleConfigureProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setIsDialogOpen(true);
  };

  const handleSaveConfig = async (config: ProviderConfig) => {
    if (!selectedProvider) return;

    try {
      await saveProviderConfig(selectedProvider, config);
      setIsDialogOpen(false);
      toast.success(`${selectedProvider} 配置已保存`);
    } catch (error) {
      console.error("Failed to save configuration:", error);
      toast.error("保存配置失败");
      throw error;
    }
  };

  const handleResetConfig = async () => {
    if (!selectedProvider) return;

    try {
      await resetProviderConfig(selectedProvider);
      toast.success(`${selectedProvider} 配置已重置`);
    } catch (error) {
      console.error("Failed to reset configuration:", error);
      toast.error("重置配置失败");
    }
  };

  // 测试配置功能
  const testConfiguration = async (providerId: string) => {
    try {
      toast.info(`测试 ${providerId} 配置中...`);

      // 加载配置
      const savedConfig = await loadProviderConfig(providerId);

      if (!savedConfig) {
        toast.warning(`${providerId} 没有保存的配置`);
        return;
      }

      // 检查API密钥是否存在
      const { apiKeyService } = await import("@/services/apiKeyService");
      const keyResult = await apiKeyService.safeGetApiKey(providerId);

      if (!keyResult.success) {
        toast.error(`${providerId} 缺少API密钥，请先在API密钥管理中配置`);
        return;
      }

      // 进行一个简单的文本生成测试
      const testOptions = {
        model: "", // 将在下面设置
        temperature: savedConfig.textGeneration?.temperature || 0.7,
        maxTokens: 50,
        stream: false,
      };

      // 获取第一个可用模型
      const adapter = llmService.getAdapter(providerId);
      const models = adapter.getSupportedModels();
      if (models.length === 0) {
        toast.error(`${providerId} 没有可用的模型`);
        return;
      }

      testOptions.model = models[0].id;

      const result = await llmService.generateText(
        providerId,
        "测试消息：请简单回复'配置测试成功'",
        testOptions,
        keyResult.apiKey!
      );

      if (result.success) {
        toast.success(`✅ ${providerId} 配置测试成功`);
        console.log("Test result:", result.data);
      } else {
        toast.error(`❌ ${providerId} 配置测试失败: ${result.error?.message}`);
      }
    } catch (error) {
      console.error(`Failed to test ${providerId} configuration:`, error);
      toast.error(`配置测试失败: ${error}`);
    }
  };

  const renderProviderCard = (provider: ProviderInfo) => {
    const adapter = llmService.getAdapter(provider.id);
    if (!adapter) return null;

    return (
      <Card key={provider.id} className="relative">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{provider.name}</CardTitle>
              {provider.hasConfig && (
                <Badge
                  variant={provider.isConfigured ? "default" : "secondary"}
                >
                  {provider.isConfigured ? "已配置" : "未配置"}
                </Badge>
              )}
            </div>
            {provider.hasConfig && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleConfigureProvider(provider.id)}
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                配置
              </Button>
            )}
          </div>
          {provider.description && (
            <CardDescription>{provider.description}</CardDescription>
          )}
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {/* 支持的模型数量 */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="w-4 h-4" />
              <span>支持 {adapter.getSupportedModels().length} 个模型</span>
            </div>

            {/* 配置状态 */}
            {provider.hasConfig ? (
              <div className="flex items-center gap-2 text-sm">
                <Wrench className="w-4 h-4" />
                <span>
                  {provider.isConfigured ? "使用自定义配置" : "使用默认配置"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wrench className="w-4 h-4" />
                <span>无可配置参数</span>
              </div>
            )}

            {/* 测试按钮 */}
            {provider.isConfigured && (
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConfiguration(provider.id)}
                  className="w-full text-xs"
                >
                  测试配置
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const selectedAdapter = selectedProvider
    ? llmService.getAdapter(selectedProvider)
    : null;
  const currentConfig = selectedProvider
    ? configs[selectedProvider]
    : undefined;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>提供商配置</CardTitle>
          <CardDescription>正在加载提供商信息...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle>提供商配置</CardTitle>
          <CardDescription>
            为每个LLM提供商配置特定参数，如温度、最大token数等。这些配置将在API请求中使用。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map(renderProviderCard)}
          </div>
        </CardContent>
      </Card>

      {/* 配置对话框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>配置 {selectedAdapter?.providerName}</DialogTitle>
            <DialogDescription>
              自定义 {selectedAdapter?.providerName}{" "}
              的参数设置。这些设置将应用于所有使用此提供商的API请求。
            </DialogDescription>
          </DialogHeader>

          {selectedAdapter &&
            selectedAdapter.getConfigSchema &&
            selectedAdapter.getDefaultConfig && (
              <DynamicConfigForm
                schema={selectedAdapter.getConfigSchema()}
                defaultValues={selectedAdapter.getDefaultConfig()}
                currentValues={currentConfig}
                onSave={handleSaveConfig}
                onReset={handleResetConfig}
                title={`${selectedAdapter.providerName} 配置`}
                description="调整以下参数以优化API请求的行为"
              />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
