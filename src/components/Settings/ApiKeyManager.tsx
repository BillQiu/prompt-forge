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

// API 密钥表单验证 schema
const apiKeySchema = z.object({
  providerId: z.string().min(1, "请选择提供商"),
  apiKey: z
    .string()
    .min(1, "API 密钥不能为空")
    .min(10, "API 密钥长度至少 10 个字符"),
  name: z.string().optional(),
});

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

  const { providers, setApiKeyStored } = useUserSettingsStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
  });

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
      // 使用加密服务加密 API 密钥
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

      reset();
      setShowAddForm(false);

      console.log("✅ API key added and encrypted successfully");
    } catch (error) {
      console.error("Failed to add API key:", error);

      let errorMessage = "保存 API 密钥时出错";
      if (error instanceof EncryptionError) {
        errorMessage = "加密 API 密钥失败：" + error.message;
      }

      // 显示用户友好的错误消息
      alert(errorMessage);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("确定要删除这个 API 密钥吗？此操作不可撤销。")) {
      return;
    }

    try {
      const keyToDelete = storedKeys.find((k) => k.id === keyId);
      if (keyToDelete) {
        // 从 IndexedDB 删除
        await dbHelpers.deleteApiKey(keyToDelete.providerId);

        // 更新状态
        setApiKeyStored(keyToDelete.providerId, false);
        setStoredKeys((prev) => prev.filter((k) => k.id !== keyId));

        console.log("✅ API key deleted successfully");
      }
    } catch (error) {
      console.error("Failed to delete API key:", error);
      alert("删除 API 密钥时出错");
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
              <CardTitle className="text-2xl">API 密钥管理</CardTitle>
              <CardDescription>
                安全地管理您的 LLM 提供商 API 密钥
              </CardDescription>
            </div>
            {!showAddForm && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="w-4 h-4 mr-2" />
                添加密钥
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* 添加密钥表单 */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">添加新的 API 密钥</CardTitle>
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
                <Label htmlFor="name">密钥名称（可选）</Label>
                <Input {...register("name")} placeholder="例如：生产环境密钥" />
              </div>

              {/* API 密钥 */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">API 密钥 *</Label>
                <Input
                  type="password"
                  {...register("apiKey")}
                  placeholder="输入您的 API 密钥"
                />
                {errors.apiKey && (
                  <p className="text-sm text-destructive">
                    {errors.apiKey.message}
                  </p>
                )}
              </div>

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
                  {isSubmitting ? "保存中..." : "保存密钥"}
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
            已存储的密钥 ({storedKeys.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storedKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>还没有存储任何 API 密钥</p>
              <p className="text-sm mt-1">点击"添加密钥"开始添加</p>
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
                              {showKey[key.id]
                                ? "sk-1234567890abcdef..."
                                : key.maskedKey}
                            </code>
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
            <li>• API 密钥使用 AES-GCM 加密存储在本地浏览器中</li>
            <li>• 密钥不会被发送到任何第三方服务器</li>
            <li>• 仅在调用相应的 LLM 服务时使用</li>
            <li>• 建议定期轮换您的 API 密钥</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
