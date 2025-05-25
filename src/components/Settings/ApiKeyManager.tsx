"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Plus, Trash2, Edit, X } from "lucide-react";
import { useUserSettingsStore } from "@/stores/userSettingsStore";
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  EncryptionError,
} from "@/services/encryption";
import { dbHelpers } from "@/services/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// API 密钥表单验证 schema
const apiKeySchema = z
  .object({
    providerId: z.string().min(1, "请选择提供商"),
    apiKey: z
      .string()
      .min(1, "API 密钥不能为空")
      .min(10, "API 密钥长度至少 10 个字符")
      .optional(),
    serverUrl: z.string().url("请输入有效的服务器URL").optional(),
    name: z.string().optional(),
  })
  .refine(
    (data) => {
      // Ollama 需要服务器URL，其他提供商需要API密钥
      if (data.providerId === "ollama") {
        return !!data.serverUrl;
      }
      return !!data.apiKey;
    },
    {
      message: "请提供必要的配置信息",
      path: ["apiKey"], // 错误显示在apiKey字段
    }
  )
  .refine(
    (data) => {
      // 提供商特定的API密钥格式验证
      if (!data.apiKey || data.providerId === "ollama") return true;

      switch (data.providerId) {
        case "google":
          // Google AI Studio API keys typically start with "AI"
          return data.apiKey.startsWith("AI") && data.apiKey.length >= 39;
        case "anthropic":
          // Anthropic API keys start with "sk-ant-"
          return data.apiKey.startsWith("sk-ant-") && data.apiKey.length >= 100;
        case "openai":
          // OpenAI API keys start with "sk-"
          return data.apiKey.startsWith("sk-") && data.apiKey.length >= 50;

        default:
          return true;
      }
    },
    (data) => {
      if (!data.apiKey || data.providerId === "ollama")
        return { message: "API密钥格式不正确" };

      switch (data.providerId) {
        case "google":
          return { message: "Google API密钥应以 'AI' 开头，长度至少39个字符" };
        case "anthropic":
          return {
            message: "Anthropic API密钥应以 'sk-ant-' 开头，长度至少100个字符",
          };
        case "openai":
          return { message: "OpenAI API密钥应以 'sk-' 开头，长度至少50个字符" };

        default:
          return { message: "API密钥格式不正确" };
      }
    }
  );

type ApiKeyFormData = z.infer<typeof apiKeySchema>;

interface StoredApiKey {
  id: string;
  providerId: string;
  name?: string;
  maskedKey: string;
  createdAt: Date;
  lastUsed?: Date;
}

export default function ApiKeyManager() {
  const [storedKeys, setStoredKeys] = useState<StoredApiKey[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showKey, setShowKey] = useState<{ [keyId: string]: boolean }>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("");

  const { providers, setApiKeyStored } = useUserSettingsStore();

  // 临时调试功能：清除缓存
  const clearCache = () => {
    localStorage.removeItem("user-settings-store");
    window.location.reload();
  };

  // 调试信息
  console.log("Current providers:", providers);
  console.log("Providers count:", providers.length);
  console.log(
    "Provider IDs:",
    providers.map((p) => p.id)
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
  });

  // 监听提供商选择变化
  const watchedProviderId = watch("providerId");

  React.useEffect(() => {
    setSelectedProvider(watchedProviderId || "");
  }, [watchedProviderId]);

  // 加载已存储的 API 密钥
  useEffect(() => {
    loadStoredKeys();
  }, []);

  const loadStoredKeys = async () => {
    try {
      // 从 IndexedDB 加载所有 API 密钥
      const apiKeys = await dbHelpers.getAllApiKeys();

      const storedKeysData: StoredApiKey[] = await Promise.all(
        apiKeys.map(async (apiKey) => {
          try {
            // 解密 API 密钥来生成掩码
            const decryptedKey = await decryptApiKey({
              encryptedData: apiKey.encryptedKey,
              iv: apiKey.iv,
              salt: apiKey.salt || "", // 兼容旧数据
              keyId: apiKey.keyId,
            });

            return {
              id: apiKey.id?.toString() || "",
              providerId: apiKey.providerName,
              name: apiKey.name,
              maskedKey: maskApiKey(decryptedKey),
              createdAt: apiKey.createdAt,
              lastUsed: apiKey.lastUsed,
            };
          } catch (error) {
            console.error(
              `Failed to decrypt key for ${apiKey.providerName}:`,
              error
            );
            // 返回错误状态的密钥
            return {
              id: apiKey.id?.toString() || "",
              providerId: apiKey.providerName,
              name: apiKey.name,
              maskedKey: "[加密错误]",
              createdAt: apiKey.createdAt,
              lastUsed: apiKey.lastUsed,
            };
          }
        })
      );

      setStoredKeys(storedKeysData);
    } catch (error) {
      console.error("Failed to load stored keys:", error);
      setStoredKeys([]);
    }
  };

  const handleAddKey = async (data: ApiKeyFormData) => {
    try {
      if (data.providerId === "ollama") {
        // Ollama 特殊处理：存储服务器URL
        if (!data.serverUrl) {
          throw new Error("Ollama 服务器URL是必需的");
        }

        // 对于Ollama，我们存储服务器URL而不是API密钥
        const encryptedData = await encryptApiKey(
          data.serverUrl,
          data.providerId
        );

        await dbHelpers.storeApiKey({
          providerName: data.providerId,
          encryptedKey: encryptedData.encryptedData,
          iv: encryptedData.iv,
          salt: encryptedData.salt,
          keyId: encryptedData.keyId,
          name: data.name,
          createdAt: new Date(),
        });

        // 更新状态
        const newKey: StoredApiKey = {
          id: Date.now().toString(),
          providerId: data.providerId,
          name: data.name,
          maskedKey: `${data.serverUrl.substring(0, 20)}...`,
          createdAt: new Date(),
        };

        setStoredKeys((prev) => [...prev, newKey]);
        setApiKeyStored(data.providerId, true);

        console.log("✅ Ollama server URL saved successfully");
        toast.success("Ollama服务器配置已保存", {
          description: "服务器URL已成功加密存储",
        });
      } else {
        // 其他提供商：使用加密服务加密 API 密钥
        if (!data.apiKey) {
          throw new Error("API 密钥是必需的");
        }

        const encryptedData = await encryptApiKey(data.apiKey, data.providerId);

        // 存储到 IndexedDB
        await dbHelpers.storeApiKey({
          providerName: data.providerId,
          encryptedKey: encryptedData.encryptedData,
          iv: encryptedData.iv,
          salt: encryptedData.salt,
          keyId: encryptedData.keyId,
          name: data.name,
          createdAt: new Date(),
        });

        // 更新状态
        const newKey: StoredApiKey = {
          id: Date.now().toString(),
          providerId: data.providerId,
          name: data.name,
          maskedKey: maskApiKey(data.apiKey),
          createdAt: new Date(),
        };

        setStoredKeys((prev) => [...prev, newKey]);
        setApiKeyStored(data.providerId, true);

        console.log("✅ API key added and encrypted successfully");
        toast.success("API密钥已保存", {
          description: `${getProviderName(
            data.providerId
          )} API密钥已成功加密存储`,
        });
      }

      reset();
      setShowAddForm(false);
    } catch (error) {
      console.error("Failed to add API key:", error);

      let errorMessage = "保存配置时出错";
      if (error instanceof EncryptionError) {
        errorMessage = "加密配置失败：" + error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      // 显示用户友好的错误消息
      toast.error("保存配置失败", {
        description: errorMessage,
      });
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setKeyToDelete(keyId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteKey = async () => {
    if (!keyToDelete) return;

    try {
      const keyToDeleteObj = storedKeys.find((k) => k.id === keyToDelete);
      if (keyToDeleteObj) {
        // 从 IndexedDB 删除
        await dbHelpers.deleteApiKey(keyToDeleteObj.providerId);

        // 更新状态
        setApiKeyStored(keyToDeleteObj.providerId, false);
        setStoredKeys((prev) => prev.filter((k) => k.id !== keyToDelete));

        toast.success("提供商配置已删除", {
          description: "配置已成功从您的设备中移除",
        });
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
      toast.error("删除 API 密钥时出错", {
        description: "无法删除密钥，请稍后重试",
      });
    } finally {
      setDeleteDialogOpen(false);
      setKeyToDelete(null);
    }
  };

  const toggleShowKey = (keyId: string) => {
    setShowKey((prev) => ({
      ...prev,
      [keyId]: !prev[keyId],
    }));
  };

  const getProviderName = (providerId: string) => {
    return providers.find((p) => p.id === providerId)?.name || providerId;
  };

  return (
    <div className="space-y-6">
      {/* 标题和添加按钮 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl">提供商配置管理</CardTitle>
              <CardDescription>
                安全地管理您的 LLM 提供商 API 密钥和服务器配置
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              {!showAddForm && (
                <Button onClick={() => setShowAddForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  添加配置
                </Button>
              )}
              {/* 临时调试按钮 */}
              {process.env.NODE_ENV === "development" && (
                <Button
                  variant="outline"
                  onClick={clearCache}
                  title="清除缓存并刷新（调试用）"
                >
                  清除缓存
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 提供商状态概览 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">提供商状态概览</CardTitle>
          <CardDescription>查看各个提供商的配置状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {providers.map((provider) => {
              const hasKey = provider.apiKeyStored;
              return (
                <div
                  key={provider.id}
                  className={cn(
                    "flex items-center space-x-3 p-3 rounded-lg border",
                    hasKey
                      ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                      : "bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700"
                  )}
                >
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      hasKey ? "bg-green-500" : "bg-gray-400"
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {hasKey ? "已配置" : "未配置"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 添加密钥表单 */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">添加新的提供商配置</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowAddForm(false);
                  reset();
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(handleAddKey)} className="space-y-4">
              {/* 提供商选择 */}
              <div className="space-y-2">
                <Label htmlFor="providerId">提供商 *</Label>
                <select
                  {...register("providerId")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">选择提供商</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
                {errors.providerId && (
                  <p className="text-sm text-destructive">
                    {errors.providerId.message}
                  </p>
                )}
              </div>

              {/* 密钥名称（可选） */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  {selectedProvider === "ollama"
                    ? "配置名称（可选）"
                    : "密钥名称（可选）"}
                </Label>
                <Input
                  {...register("name")}
                  placeholder={
                    selectedProvider === "ollama"
                      ? "例如：本地服务器"
                      : "例如：生产环境密钥"
                  }
                />
              </div>

              {/* 根据提供商类型显示不同的配置字段 */}
              {selectedProvider === "ollama" ? (
                /* Ollama 服务器URL配置 */
                <div className="space-y-2">
                  <Label htmlFor="serverUrl">服务器URL *</Label>
                  <Input
                    {...register("serverUrl")}
                    placeholder="http://localhost:11434/api"
                    defaultValue="http://localhost:11434/api"
                  />
                  {errors.serverUrl && (
                    <p className="text-sm text-destructive">
                      {errors.serverUrl.message}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    请确保Ollama服务器正在运行并可访问
                  </p>
                </div>
              ) : selectedProvider ? (
                /* 其他提供商的API密钥配置 */
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API 密钥 *</Label>
                  <Input
                    type="password"
                    {...register("apiKey")}
                    placeholder={`输入您的 ${getProviderName(
                      selectedProvider
                    )} API 密钥`}
                  />
                  {errors.apiKey && (
                    <p className="text-sm text-destructive">
                      {errors.apiKey.message}
                    </p>
                  )}
                  {selectedProvider === "google" && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        从{" "}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Google AI Studio
                        </a>{" "}
                        获取您的 API 密钥
                      </p>
                      <p>• API 密钥应以 "AI" 开头</p>
                      <p>• 长度通常为 39 个字符</p>
                    </div>
                  )}
                  {selectedProvider === "anthropic" && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        从{" "}
                        <a
                          href="https://console.anthropic.com/account/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Anthropic Console
                        </a>{" "}
                        获取您的 API 密钥
                      </p>
                      <p>• API 密钥应以 "sk-ant-" 开头</p>
                      <p>• 长度通常为 100+ 个字符</p>
                    </div>
                  )}
                  {selectedProvider === "openai" && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        从{" "}
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          OpenAI Platform
                        </a>{" "}
                        获取您的 API 密钥
                      </p>
                      <p>• API 密钥应以 "sk-" 开头</p>
                      <p>• 长度通常为 50+ 个字符</p>
                    </div>
                  )}
                </div>
              ) : null}

              {/* 提交按钮 */}
              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    reset();
                  }}
                >
                  取消
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "保存中..." : "保存配置"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 已存储的密钥列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            已存储的配置 ({storedKeys.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storedKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>还没有存储任何提供商配置</p>
              <p className="text-sm mt-1">点击"添加配置"开始添加</p>
            </div>
          ) : (
            <div className="space-y-3">
              {storedKeys.map((key) => (
                <Card key={key.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground flex items-center gap-2">
                            <Badge variant="secondary">
                              {getProviderName(key.providerId)}
                            </Badge>
                            {key.name && (
                              <span className="text-sm text-muted-foreground">
                                ({key.name})
                              </span>
                            )}
                          </h4>
                          <div className="flex items-center space-x-2 mt-2">
                            <code className="text-sm bg-muted px-2 py-1 rounded">
                              {key.providerId === "ollama"
                                ? key.maskedKey // Ollama显示服务器URL
                                : showKey[key.id]
                                ? "sk-1234567890abcdef..."
                                : key.maskedKey}
                            </code>
                            {key.providerId !== "ollama" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleShowKey(key.id)}
                              >
                                {showKey[key.id] ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            创建于 {key.createdAt.toLocaleDateString()}
                            {key.lastUsed && (
                              <span className="ml-3">
                                最后使用 {key.lastUsed.toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          /* TODO: 实现编辑功能 */
                        }}
                        title="编辑密钥"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteKey(key.id)}
                        title="删除密钥"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 安全提示 */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            🔒 安全提示
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-foreground space-y-1">
            <li>• API 密钥和配置使用 AES-GCM 加密存储在本地浏览器中</li>
            <li>• 所有配置信息不会被发送到任何第三方服务器</li>
            <li>• 仅在调用相应的 LLM 服务时使用</li>
            <li>• 建议定期轮换您的 API 密钥</li>
            <li>• Ollama 无需 API 密钥，仅需配置本地服务器地址</li>
          </ul>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个提供商配置吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteKey}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
