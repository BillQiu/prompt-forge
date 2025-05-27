"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Edit, X, ExternalLink } from "lucide-react";
import { dbHelpers, CustomModel } from "@/services/db";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// 自定义模型表单验证 schema
const customModelSchema = z.object({
  name: z
    .string()
    .min(1, "模型名称不能为空")
    .min(2, "模型名称至少2个字符")
    .max(50, "模型名称不能超过50个字符")
    .regex(
      /^[a-zA-Z0-9\-_\s]+$/,
      "模型名称只能包含字母、数字、连字符、下划线和空格"
    ),
  baseUrl: z
    .string()
    .min(1, "API 基础 URL 不能为空")
    .url("请输入有效的 URL 地址")
    .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
      message: "URL 必须以 http:// 或 https:// 开头",
    }),
  apiKey: z.string().min(1, "API 密钥不能为空"),
  providerType: z.enum(["openai", "anthropic"], {
    errorMap: () => ({ message: "请选择有效的供应商类型" }),
  }),
});

type CustomModelFormData = z.infer<typeof customModelSchema>;

interface CustomModelWithId {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType: string;
  createdAt: Date;
  updatedAt?: Date;
}

// API 连接测试函数
const testApiConnection = async (
  baseUrl: string,
  apiKey: string,
  providerType: string,
  modelName: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const normalizedBaseUrl = baseUrl.endsWith("/")
      ? baseUrl.slice(0, -1)
      : baseUrl;

    if (providerType === "openai") {
      // 测试 OpenAI 格式的 API
      const testUrl = `${normalizedBaseUrl}/chat/completions`;
      const response = await fetch(testUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: "user",
              content: "test",
            },
          ],
          max_tokens: 1,
          stream: false,
        }),
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (response.status >= 200 && response.status < 500) {
        return { success: true };
      } else {
        const errorText = await response.text().catch(() => "未知错误");
        return {
          success: false,
          error: `OpenAI API 响应错误 (${response.status}): ${errorText}`,
        };
      }
    } else if (providerType === "anthropic") {
      // 测试 Anthropic 格式的 API
      const testUrl = `${normalizedBaseUrl}/messages`;
      const response = await fetch(testUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1,
          messages: [
            {
              role: "user",
              content: "test",
            },
          ],
        }),
        signal: AbortSignal.timeout(10000), // 10秒超时
      });

      if (response.status >= 200 && response.status < 500) {
        return { success: true };
      } else {
        const errorText = await response.text().catch(() => "未知错误");
        return {
          success: false,
          error: `Anthropic API 响应错误 (${response.status}): ${errorText}`,
        };
      }
    }

    return { success: false, error: "不支持的供应商类型" };
  } catch (error) {
    console.warn("API connection test failed:", error);
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "连接超时，请检查 URL 是否正确" };
      }
      return { success: false, error: `连接失败: ${error.message}` };
    }
    return { success: false, error: "连接失败，请检查网络或URL是否正确" };
  }
};

export default function CustomModelManager() {
  const [customModels, setCustomModels] = useState<CustomModelWithId[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingModel, setEditingModel] = useState<CustomModelWithId | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<CustomModelWithId | null>(
    null
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CustomModelFormData>({
    resolver: zodResolver(customModelSchema),
    defaultValues: {
      providerType: "openai",
    },
  });

  // 加载自定义模型
  useEffect(() => {
    loadCustomModels();
  }, []);

  const loadCustomModels = async () => {
    try {
      const models = await dbHelpers.getAllCustomModels();
      setCustomModels(models as CustomModelWithId[]);
    } catch (error) {
      console.error("Failed to load custom models:", error);
      if (error instanceof Error) {
        toast.error(`加载失败: ${error.message}`);
      } else {
        toast.error("加载自定义模型失败，请刷新页面重试");
      }
    }
  };

  const handleAddModel = async (data: CustomModelFormData) => {
    try {
      // 首先验证API连接
      const isValid = await testApiConnection(
        data.baseUrl,
        data.apiKey,
        data.providerType,
        data.name
      );
      if (!isValid.success) {
        toast.error("API 连接测试失败，请检查 URL 和密钥是否正确");
        return;
      }

      await dbHelpers.createCustomModel({
        ...data,
        createdAt: new Date(),
      });
      toast.success("自定义模型添加成功");
      reset();
      setShowAddForm(false);
      loadCustomModels();
    } catch (error) {
      console.error("Failed to add custom model:", error);
      if (error instanceof Error && error.message.includes("已存在")) {
        toast.error(error.message);
      } else if (error instanceof Error) {
        toast.error(`添加失败: ${error.message}`);
      } else {
        toast.error("添加自定义模型失败");
      }
    }
  };

  const handleEditModel = async (data: CustomModelFormData) => {
    if (!editingModel) return;

    try {
      // 如果 URL 或密钥发生变化，验证API连接
      if (
        data.baseUrl !== editingModel.baseUrl ||
        data.apiKey !== editingModel.apiKey ||
        data.providerType !== editingModel.providerType
      ) {
        const isValid = await testApiConnection(
          data.baseUrl,
          data.apiKey,
          data.providerType,
          data.name
        );
        if (!isValid.success) {
          toast.error("API 连接测试失败，请检查 URL 和密钥是否正确");
          return;
        }
      }

      await dbHelpers.updateCustomModel(editingModel.id, data);
      toast.success("自定义模型更新成功");
      reset();
      setEditingModel(null);
      loadCustomModels();
    } catch (error) {
      console.error("Failed to update custom model:", error);
      if (error instanceof Error && error.message.includes("已存在")) {
        toast.error(error.message);
      } else if (error instanceof Error) {
        toast.error(`更新失败: ${error.message}`);
      } else {
        toast.error("更新自定义模型失败");
      }
    }
  };

  const handleDeleteModel = (model: CustomModelWithId) => {
    setModelToDelete(model);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteModel = async () => {
    if (!modelToDelete) return;

    try {
      await dbHelpers.deleteCustomModel(modelToDelete.id);
      toast.success(`自定义模型 "${modelToDelete.name}" 删除成功`);
      setDeleteDialogOpen(false);
      setModelToDelete(null);
      loadCustomModels();
    } catch (error) {
      console.error("Failed to delete custom model:", error);
      if (error instanceof Error) {
        toast.error(`删除失败: ${error.message}`);
      } else {
        toast.error("删除自定义模型失败");
      }
    }
  };

  const startEdit = (model: CustomModelWithId) => {
    setEditingModel(model);
    setValue("name", model.name);
    setValue("baseUrl", model.baseUrl);
    setValue("apiKey", model.apiKey);
    setValue("providerType", model.providerType as "openai" | "anthropic");
  };

  const cancelEdit = () => {
    setEditingModel(null);
    reset();
  };

  const cancelAdd = () => {
    setShowAddForm(false);
    reset();
  };

  const getProviderTypeLabel = (providerType: string) => {
    switch (providerType) {
      case "openai":
        return "OpenAI 格式";
      case "anthropic":
        return "Anthropic 格式";
      default:
        return providerType;
    }
  };

  const getProviderTypeBadgeVariant = (providerType: string) => {
    switch (providerType) {
      case "openai":
        return "default" as const;
      case "anthropic":
        return "secondary" as const;
      default:
        return "outline" as const;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>自定义模型管理</CardTitle>
            <CardDescription>
              添加和管理您的自定义 AI 模型。支持 OpenAI 和 Anthropic 格式的
              API。
            </CardDescription>
          </div>
          <Button
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm || editingModel !== null}
          >
            <Plus className="h-4 w-4 mr-2" />
            添加模型
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 添加模型表单 */}
        {showAddForm && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg">添加自定义模型</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit(handleAddModel)}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">模型名称</Label>
                    <Input
                      id="name"
                      placeholder="例如：My Custom GPT"
                      {...register("name")}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="providerType">供应商类型</Label>
                    <Select
                      onValueChange={(value) =>
                        setValue(
                          "providerType",
                          value as "openai" | "anthropic"
                        )
                      }
                      defaultValue="openai"
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择供应商类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI 格式</SelectItem>
                        <SelectItem value="anthropic">
                          Anthropic 格式
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.providerType && (
                      <p className="text-sm text-red-500">
                        {errors.providerType.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="baseUrl">API 基础 URL</Label>
                  <Input
                    id="baseUrl"
                    placeholder="https://api.example.com/v1"
                    {...register("baseUrl")}
                  />
                  {errors.baseUrl && (
                    <p className="text-sm text-red-500">
                      {errors.baseUrl.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey">API 密钥</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="输入您的 API 密钥"
                    {...register("apiKey")}
                  />
                  {errors.apiKey && (
                    <p className="text-sm text-red-500">
                      {errors.apiKey.message}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={cancelAdd}>
                    <X className="h-4 w-4 mr-2" />
                    取消
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "添加中..." : "添加模型"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 编辑模型表单 */}
        {editingModel && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="text-lg">编辑自定义模型</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleSubmit(handleEditModel)}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">模型名称</Label>
                    <Input
                      id="edit-name"
                      placeholder="例如：My Custom GPT"
                      {...register("name")}
                    />
                    {errors.name && (
                      <p className="text-sm text-red-500">
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-providerType">供应商类型</Label>
                    <Select
                      onValueChange={(value) =>
                        setValue(
                          "providerType",
                          value as "openai" | "anthropic"
                        )
                      }
                      value={editingModel.providerType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择供应商类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI 格式</SelectItem>
                        <SelectItem value="anthropic">
                          Anthropic 格式
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.providerType && (
                      <p className="text-sm text-red-500">
                        {errors.providerType.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-baseUrl">API 基础 URL</Label>
                  <Input
                    id="edit-baseUrl"
                    placeholder="https://api.example.com/v1"
                    {...register("baseUrl")}
                  />
                  {errors.baseUrl && (
                    <p className="text-sm text-red-500">
                      {errors.baseUrl.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-apiKey">API 密钥</Label>
                  <Input
                    id="edit-apiKey"
                    type="password"
                    placeholder="输入您的 API 密钥"
                    {...register("apiKey")}
                  />
                  {errors.apiKey && (
                    <p className="text-sm text-red-500">
                      {errors.apiKey.message}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    <X className="h-4 w-4 mr-2" />
                    取消
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "更新中..." : "更新模型"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* 自定义模型列表 */}
        {customModels.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>暂无自定义模型</p>
            <p className="text-sm">
              点击"添加模型"按钮开始添加您的第一个自定义模型
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {customModels.map((model) => (
              <Card key={model.id} className="relative">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">{model.name}</h3>
                        <Badge
                          variant={getProviderTypeBadgeVariant(
                            model.providerType
                          )}
                        >
                          {getProviderTypeLabel(model.providerType)}
                        </Badge>
                      </div>

                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">API URL:</span>
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                            {model.baseUrl}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => window.open(model.baseUrl, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-medium">API 密钥:</span>
                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                            {model.apiKey.substring(0, 8)}...
                            {model.apiKey.slice(-4)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-medium">创建时间:</span>
                          <span>
                            {new Date(model.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {model.updatedAt && (
                          <div className="flex items-center gap-2">
                            <span className="font-medium">更新时间:</span>
                            <span>
                              {new Date(model.updatedAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(model)}
                        disabled={editingModel !== null || showAddForm}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteModel(model)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 删除确认对话框 */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                您确定要删除自定义模型 "{modelToDelete?.name}" 吗？
                <br />
                此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setModelToDelete(null)}>
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteModel}
                className="bg-red-600 hover:bg-red-700"
              >
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
