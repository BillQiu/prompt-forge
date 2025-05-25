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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            API 密钥管理
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            安全地管理您的 LLM 提供商 API 密钥
          </p>
        </div>

        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            添加密钥
          </button>
        )}
      </div>

      {/* 添加密钥表单 */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              添加新的 API 密钥
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                reset();
              }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit(handleAddKey)} className="space-y-4">
            {/* 提供商选择 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                提供商 *
              </label>
              <select
                {...register("providerId")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">选择提供商</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              {errors.providerId && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.providerId.message}
                </p>
              )}
            </div>

            {/* 密钥名称（可选） */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                密钥名称（可选）
              </label>
              <input
                type="text"
                {...register("name")}
                placeholder="例如：生产环境密钥"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* API 密钥 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API 密钥 *
              </label>
              <input
                type="password"
                {...register("apiKey")}
                placeholder="输入您的 API 密钥"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              {errors.apiKey && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.apiKey.message}
                </p>
              )}
            </div>

            {/* 提交按钮 */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  reset();
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "保存中..." : "保存密钥"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 已存储的密钥列表 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          已存储的密钥 ({storedKeys.length})
        </h3>

        {storedKeys.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>还没有存储任何 API 密钥</p>
            <p className="text-sm mt-1">点击&ldquo;添加密钥&rdquo;开始添加</p>
          </div>
        ) : (
          <div className="space-y-3">
            {storedKeys.map((key) => (
              <div
                key={key.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {getProviderName(key.providerId)}
                          {key.name && (
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                              ({key.name})
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center space-x-2 mt-1">
                          <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            {showKey[key.id]
                              ? "sk-1234567890abcdef..."
                              : key.maskedKey}
                          </code>
                          <button
                            onClick={() => toggleShowKey(key.id)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            {showKey[key.id] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                    <button
                      onClick={() => {
                        /* TODO: 实现编辑功能 */
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="编辑密钥"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteKey(key.id)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="删除密钥"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 安全提示 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
          🔒 安全提示
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• API 密钥使用 AES-GCM 加密存储在本地浏览器中</li>
          <li>• 密钥不会被发送到任何第三方服务器</li>
          <li>• 仅在调用相应的 LLM 服务时使用</li>
          <li>• 建议定期轮换您的 API 密钥</li>
        </ul>
      </div>
    </div>
  );
}
