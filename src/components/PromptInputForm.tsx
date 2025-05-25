"use client";

import { useState, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { llmService } from "@/services/llm";
import MultiSelect, { MultiSelectOption } from "./MultiSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// 定义表单验证模式
const promptFormSchema = z
  .object({
    prompt: z
      .string()
      .min(1, "请输入提示词")
      .max(10000, "提示词不能超过10,000个字符")
      .refine((value) => value.trim().length > 0, "提示词不能只包含空格"),
    providers: z
      .array(z.string())
      .min(1, "请至少选择一个AI提供商")
      .max(10, "最多只能选择10个提供商"),
    models: z
      .array(z.string())
      .min(1, "请至少选择一个模型")
      .max(20, "最多只能选择20个模型")
      .refine((models) => {
        // 验证模型ID格式是否正确 (providerId:modelId)
        return models.every((model) => model.includes(":"));
      }, "模型ID格式不正确"),
  })
  .refine(
    (data) => {
      // 验证选择的模型是否属于选择的提供商
      const selectedProviderIds = new Set(data.providers);
      return data.models.every((model) => {
        const [providerId] = model.split(":");
        return selectedProviderIds.has(providerId);
      });
    },
    {
      message: "选择的模型必须属于已选择的提供商",
      path: ["models"], // 错误显示在models字段
    }
  );

type PromptFormData = z.infer<typeof promptFormSchema>;

interface PromptInputFormProps {
  onSubmit: (data: PromptFormData) => void;
  isSubmitting?: boolean;
}

export default function PromptInputForm({
  onSubmit,
  isSubmitting = false,
}: PromptInputFormProps) {
  const [providerOptions, setProviderOptions] = useState<MultiSelectOption[]>(
    []
  );
  const [modelOptions, setModelOptions] = useState<MultiSelectOption[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
    setValue,
    getValues,
  } = useForm<PromptFormData>({
    resolver: zodResolver(promptFormSchema),
    defaultValues: {
      prompt: "",
      providers: [],
      models: [],
    },
  });

  const prompt = watch("prompt");
  const promptLength = prompt?.length || 0;

  // 初始化提供商选项
  useEffect(() => {
    try {
      const providers = llmService.getProviders();
      const options: MultiSelectOption[] = providers
        .filter((provider) => provider.enabled)
        .map((provider) => ({
          value: provider.id,
          label: provider.name,
          description: provider.description,
        }));
      setProviderOptions(options);
    } catch (error) {
      console.error("Failed to load providers:", error);
    }
  }, []);

  // 当选择的提供商变化时，更新模型选项
  useEffect(() => {
    if (selectedProviders.length === 0) {
      setModelOptions([]);
      setValue("models", []);
      return;
    }

    try {
      const allModels = llmService.getAllModels();
      const filteredModels = allModels.filter((model) =>
        selectedProviders.includes(model.providerId)
      );

      const options: MultiSelectOption[] = filteredModels.map((model) => ({
        value: `${model.providerId}:${model.id}`,
        label: `${model.name} (${model.providerName})`,
        description: model.description,
      }));

      setModelOptions(options);

      // 清除不再可用的模型选择
      const currentModels = getValues("models");
      const validModels = currentModels.filter((modelId) =>
        options.some((option) => option.value === modelId)
      );
      if (validModels.length !== currentModels.length) {
        setValue("models", validModels);
      }
    } catch (error) {
      console.error("Failed to load models:", error);
      setModelOptions([]);
    }
  }, [selectedProviders, setValue, getValues]);

  const handleProviderChange = (providers: string[]) => {
    setSelectedProviders(providers);
    setValue("providers", providers);
  };

  const handleModelChange = (models: string[]) => {
    setValue("models", models);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>AI 提示词测试</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* 提示词输入区域 */}
            <div className="space-y-2">
              <Label htmlFor="prompt">提示词</Label>
              <div className="relative">
                <Textarea
                  {...register("prompt")}
                  id="prompt"
                  placeholder="请输入您的提示词..."
                  className={`min-h-32 resize-y ${
                    errors.prompt ? "border-destructive" : ""
                  }`}
                  disabled={isSubmitting}
                />
                {/* 字符计数器 */}
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background px-1 rounded">
                  {promptLength}/10,000
                </div>
              </div>
              {errors.prompt && (
                <p className="text-sm text-destructive">
                  {errors.prompt.message}
                </p>
              )}
            </div>

            {/* 提供商选择区域 */}
            <div className="space-y-2">
              <Label>AI 提供商</Label>
              <Controller
                name="providers"
                control={control}
                render={({ field }) => (
                  <MultiSelect
                    options={providerOptions}
                    value={field.value}
                    onChange={handleProviderChange}
                    placeholder="选择AI提供商..."
                    disabled={isSubmitting}
                    error={!!errors.providers}
                  />
                )}
              />
              {errors.providers && (
                <p className="text-sm text-destructive">
                  {errors.providers.message}
                </p>
              )}
            </div>

            {/* 模型选择区域 */}
            <div className="space-y-2">
              <Label>模型</Label>
              <Controller
                name="models"
                control={control}
                render={({ field }) => (
                  <MultiSelect
                    options={modelOptions}
                    value={field.value}
                    onChange={handleModelChange}
                    placeholder={
                      selectedProviders.length === 0
                        ? "请先选择提供商"
                        : "选择模型..."
                    }
                    disabled={isSubmitting || selectedProviders.length === 0}
                    error={!!errors.models}
                  />
                )}
              />
              {errors.models && (
                <p className="text-sm text-destructive">
                  {errors.models.message}
                </p>
              )}
            </div>

            {/* 提交按钮 */}
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "发送中..." : "发送提示词"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
