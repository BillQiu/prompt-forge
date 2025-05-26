"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Plus, Trash2, Edit, X } from "lucide-react";
import { useUserSettingsStore } from "@/stores/userSettingsStore";
import { dbHelpers } from "@/services/db";
import { maskApiKey } from "@/services/encryption";
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

      const storedKeysData: StoredApiKey[] = apiKeys.map((apiKey) => {
        // 检查是否有明文密钥字段或者已经改为明文存储
        const hasPlaintextKey = apiKey.apiKey;
        const isNewPlaintextFormat = !apiKey.iv || !apiKey.salt; // 新格式没有iv和salt
        const key = hasPlaintextKey ? apiKey.apiKey : apiKey.encryptedKey || "";

        return {
          id: apiKey.id?.toString() || "",
          providerId: apiKey.providerName,
          name: apiKey.name,
          maskedKey:
            hasPlaintextKey || isNewPlaintextFormat
              ? maskApiKey(key)
              : "[需要迁移]",
          createdAt: apiKey.createdAt,
          lastUsed: apiKey.lastUsed,
        };
      });

      setStoredKeys(storedKeysData);

      // 同步 apiKeyStored 状态到 userSettingsStore
      const storedProviderIds = new Set(apiKeys.map((key) => key.providerName));
      providers.forEach((provider) => {
        const hasStoredKey = storedProviderIds.has(provider.id);
        if (provider.apiKeyStored !== hasStoredKey) {
          setApiKeyStored(provider.id, hasStoredKey);
        }
      });
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

        await dbHelpers.storeApiKey({
          providerName: data.providerId,
          apiKey: data.serverUrl,
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
          description: "服务器URL已成功保存（明文存储）",
        });
      } else {
        // 其他提供商：明文存储API密钥
        if (!data.apiKey) {
          throw new Error("API 密钥是必需的");
        }

        await dbHelpers.storeApiKey({
          providerName: data.providerId,
          apiKey: data.apiKey,
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

        console.log("✅ API key added successfully (plaintext)");
        toast.success("API密钥已保存", {
          description: `${getProviderName(
            data.providerId
          )} API密钥已成功保存（明文存储）`,
        });
      }

      reset();
      setShowAddForm(false);
    } catch (error) {
      console.error("Failed to add API key:", error);

      let errorMessage = "保存配置时出错";
      if (error instanceof Error) {
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
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* 标题和添加按钮 */}
      <Card className="border-none shadow-md bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-col sm:flex-row gap-4">
            <div>
              <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-900 dark:from-slate-200 dark:to-white">
                提供商配置管理
              </CardTitle>
              <CardDescription className="text-base mt-2">
                安全地管理您的 LLM 提供商 API 密钥和服务器配置
              </CardDescription>
            </div>
            <div className="flex space-x-2">
              {!showAddForm && (
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-slate-950 dark:from-slate-600 dark:to-slate-800 transition-all duration-200 hover:shadow-lg"
                >
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
                  className="border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600"
                >
                  清除缓存
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 提供商状态概览 */}
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            提供商状态概览
          </CardTitle>
          <CardDescription>查看各个提供商的配置状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {providers.map((provider) => {
              const hasKey = provider.apiKeyStored;
              return (
                <div
                  key={provider.id}
                  className={cn(
                    "flex items-center space-x-3 p-4 rounded-xl border transition-all duration-200",
                    hasKey
                      ? "bg-gradient-to-br from-green-50 to-emerald-50 border-emerald-200 dark:from-emerald-950/30 dark:to-green-950/30 dark:border-emerald-800/50 hover:shadow-md hover:shadow-emerald-100/50 dark:hover:shadow-emerald-900/20"
                      : "bg-gradient-to-br from-slate-50 to-gray-50 border-gray-200 dark:from-slate-950 dark:to-gray-900 dark:border-gray-800 hover:shadow-sm"
                  )}
                >
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full flex-shrink-0",
                      hasKey
                        ? "bg-emerald-500 shadow-sm shadow-emerald-200 dark:shadow-emerald-900"
                        : "bg-gray-400"
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{provider.name}</p>
                    <p
                      className={cn(
                        "text-xs",
                        hasKey
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-gray-500 dark:text-gray-400"
                      )}
                    >
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
        <Card className="border-slate-200 dark:border-slate-800 shadow-lg animate-in fade-in duration-300 slide-in-from-top-4">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold text-slate-800 dark:text-slate-200">
                添加新的提供商配置
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowAddForm(false);
                  reset();
                }}
                className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit(handleAddKey)} className="space-y-5">
              {/* 提供商选择 */}
              <div className="space-y-2">
                <Label
                  htmlFor="providerId"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  提供商 *
                </Label>
                <div className="relative">
                  <select
                    {...register("providerId")}
                    className="appearance-none flex h-11 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1 focus-visible:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors dark:focus-visible:ring-slate-600 dark:text-slate-200"
                  >
                    <option value="">选择提供商</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
                {errors.providerId && (
                  <p className="text-sm text-red-500 mt-1 flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-red-500"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" x2="12" y1="8" y2="12" />
                      <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                    {errors.providerId.message}
                  </p>
                )}
              </div>

              {/* 密钥名称（可选） */}
              <div className="space-y-2">
                <Label
                  htmlFor="name"
                  className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center"
                >
                  {selectedProvider === "ollama" ? "配置名称" : "密钥名称"}
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400 font-normal">
                    (可选)
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    {...register("name")}
                    placeholder={
                      selectedProvider === "ollama"
                        ? "例如：本地服务器"
                        : "例如：生产环境密钥"
                    }
                    className="h-11 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 border-slate-300 dark:border-slate-700 pl-4 transition-colors"
                  />
                  <div className="absolute right-0 inset-y-0 flex items-center pr-3 pointer-events-none text-slate-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 根据提供商类型显示不同的配置字段 */}
              {selectedProvider === "ollama" ? (
                /* Ollama 服务器URL配置 */
                <div className="space-y-2">
                  <Label
                    htmlFor="serverUrl"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center"
                  >
                    服务器URL <span className="ml-1 text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      {...register("serverUrl")}
                      placeholder="http://localhost:11434/api"
                      defaultValue="http://localhost:11434/api"
                      className="h-11 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 border-slate-300 dark:border-slate-700 pl-10 transition-colors"
                    />
                    <div className="absolute left-0 inset-y-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="M10 2v4" />
                        <path d="M14 2v4" />
                        <path d="M10 16v4" />
                        <path d="M14 16v4" />
                        <path d="M2 10h20" />
                        <path d="M2 14h20" />
                      </svg>
                    </div>
                  </div>
                  {errors.serverUrl && (
                    <p className="text-sm text-red-500 mt-1 flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-red-500"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" x2="12" y1="8" y2="12" />
                        <line x1="12" x2="12.01" y1="16" y2="16" />
                      </svg>
                      {errors.serverUrl.message}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" x2="12" y1="16" y2="16" />
                      <line x1="12" x2="12" y1="8" y2="12" />
                    </svg>
                    请确保Ollama服务器正在运行并可访问
                  </p>
                </div>
              ) : selectedProvider ? (
                /* 其他提供商的API密钥配置 */
                <div className="space-y-2">
                  <Label
                    htmlFor="apiKey"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center"
                  >
                    API 密钥 <span className="ml-1 text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="password"
                      {...register("apiKey")}
                      placeholder={`输入您的 ${getProviderName(
                        selectedProvider
                      )} API 密钥`}
                      className="h-11 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-600 border-slate-300 dark:border-slate-700 pl-10 transition-colors"
                    />
                    <div className="absolute left-0 inset-y-0 flex items-center pl-3 pointer-events-none text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 13V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
                        <path d="M16.5 9.4 7.55 4.24" />
                        <polyline points="3.29 7 12 12 20.71 7" />
                        <line x1="12" x2="12" y1="22" y2="12" />
                        <circle cx="18.5" cy="15.5" r="2.5" />
                        <path d="M20.27 17.27 22 19" />
                      </svg>
                    </div>
                  </div>
                  {errors.apiKey && (
                    <p className="text-sm text-red-500 mt-1 flex items-center gap-1.5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-red-500"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" x2="12" y1="8" y2="12" />
                        <line x1="12" x2="12.01" y1="16" y2="16" />
                      </svg>
                      {errors.apiKey.message}
                    </p>
                  )}
                  {selectedProvider === "google" && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="flex items-center gap-1.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" x2="12" y1="16" y2="16" />
                          <line x1="12" x2="12" y1="8" y2="12" />
                        </svg>
                        从{" "}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Google AI Studio
                        </a>{" "}
                        获取您的 API 密钥
                      </p>
                      <ul className="mt-2 space-y-1 pl-5">
                        <li className="list-disc">API 密钥应以 "AI" 开头</li>
                        <li className="list-disc">长度通常为 39 个字符</li>
                      </ul>
                    </div>
                  )}
                  {selectedProvider === "anthropic" && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="flex items-center gap-1.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" x2="12" y1="16" y2="16" />
                          <line x1="12" x2="12" y1="8" y2="12" />
                        </svg>
                        从{" "}
                        <a
                          href="https://console.anthropic.com/account/keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Anthropic Console
                        </a>{" "}
                        获取您的 API 密钥
                      </p>
                      <ul className="mt-2 space-y-1 pl-5">
                        <li className="list-disc">
                          API 密钥应以 "sk-ant-" 开头
                        </li>
                        <li className="list-disc">长度通常为 100+ 个字符</li>
                      </ul>
                    </div>
                  )}
                  {selectedProvider === "openai" && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 mt-2 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                      <p className="flex items-center gap-1.5">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" x2="12" y1="16" y2="16" />
                          <line x1="12" x2="12" y1="8" y2="12" />
                        </svg>
                        从{" "}
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          OpenAI Platform
                        </a>{" "}
                        获取您的 API 密钥
                      </p>
                      <ul className="mt-2 space-y-1 pl-5">
                        <li className="list-disc">API 密钥应以 "sk-" 开头</li>
                        <li className="list-disc">长度通常为 50+ 个字符</li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              {/* 提交按钮 */}
              <div className="flex justify-end space-x-3 pt-5 border-t border-slate-200 dark:border-slate-800 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    reset();
                  }}
                  className="border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600 h-11 px-5 transition-colors"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-800 hover:to-slate-950 dark:from-slate-600 dark:to-slate-800 transition-all duration-200 h-11 px-6"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      保存中...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                      保存配置
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* 已存储的密钥列表 */}
      <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold text-slate-800 dark:text-slate-200">
            已存储的配置 ({storedKeys.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storedKeys.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
              <p className="text-lg">还没有存储任何提供商配置</p>
              <p className="text-sm mt-2">点击"添加配置"开始添加</p>
            </div>
          ) : (
            <div className="space-y-4">
              {storedKeys.map((key) => (
                <Card
                  key={key.id}
                  className="p-5 border-slate-200 dark:border-slate-800 hover:shadow-md transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="flex items-center justify-between flex-col sm:flex-row gap-3">
                    <div className="flex-1 w-full">
                      <div className="flex items-center space-x-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium px-3 py-1"
                            >
                              {getProviderName(key.providerId)}
                            </Badge>
                            {key.name && (
                              <span className="text-sm text-slate-500 dark:text-slate-400">
                                ({key.name})
                              </span>
                            )}
                          </h4>
                          <div className="flex items-center space-x-2 mt-3">
                            <code className="text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md font-mono">
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
                                className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                {showKey[key.id] ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
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

                    <div className="flex items-center space-x-2 ml-auto">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          /* TODO: 实现编辑功能 */
                        }}
                        title="编辑密钥"
                        className="rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteKey(key.id)}
                        title="删除密钥"
                        className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full"
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
      <Card className="border-slate-300 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-slate-800 dark:text-slate-200">
            🔒 安全提示
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-2 pl-1">
            <li className="flex items-start gap-2">
              <span className="text-slate-400">•</span>
              <span>API 密钥和配置存储在本地浏览器的 IndexedDB 中</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400">•</span>
              <span>所有配置信息不会被发送到任何第三方服务器</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400">•</span>
              <span>仅在调用相应的 LLM 服务时使用</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400">•</span>
              <span>建议定期轮换您的 API 密钥</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-400">•</span>
              <span>Ollama 无需 API 密钥，仅需配置本地服务器地址</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-slate-200 dark:border-slate-800 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl text-slate-800 dark:text-slate-200">
              确认删除
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
              确定要删除这个提供商配置吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteKey}
              className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white transition-colors"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
