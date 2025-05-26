"use client";

import React, { useState, useEffect } from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Save, RotateCcw, Info } from "lucide-react";
import { toast } from "sonner";
import type { ProviderConfig } from "@/services/llm/BaseAdapter";

interface DynamicConfigFormProps {
  schema: z.ZodSchema<ProviderConfig>;
  defaultValues: ProviderConfig;
  currentValues?: ProviderConfig;
  onSave: (config: ProviderConfig) => Promise<void>;
  onReset?: () => void;
  title: string;
  description?: string;
  className?: string;
}

interface FieldInfo {
  key: string;
  label: string;
  description?: string;
  type: "string" | "number" | "boolean" | "enum" | "array" | "object";
  enumValues?: string[];
  min?: number;
  max?: number;
  defaultValue?: unknown;
  optional?: boolean;
}

export default function DynamicConfigForm({
  schema,
  defaultValues,
  currentValues,
  onSave,
  onReset,
  title,
  description,
  className,
}: DynamicConfigFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["textGeneration"])
  );

  // 解析schema以获取字段信息
  const parseSchema = (schema: z.ZodSchema, prefix = ""): FieldInfo[] => {
    const fields: FieldInfo[] = [];

    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      Object.entries(shape).forEach(([key, fieldSchema]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const fieldInfo = parseFieldSchema(
          fieldSchema as z.ZodSchema,
          fullKey,
          key
        );
        if (fieldInfo) {
          fields.push(fieldInfo);
        }
      });
    }

    return fields;
  };

  const parseFieldSchema = (
    fieldSchema: z.ZodSchema,
    fullKey: string,
    label: string
  ): FieldInfo | null => {
    // 处理可选字段
    if (fieldSchema instanceof z.ZodOptional) {
      const innerField = parseFieldSchema(
        fieldSchema._def.innerType,
        fullKey,
        label
      );
      if (innerField) {
        innerField.optional = true;
      }
      return innerField;
    }

    // 处理默认值
    if (fieldSchema instanceof z.ZodDefault) {
      const innerField = parseFieldSchema(
        fieldSchema._def.innerType,
        fullKey,
        label
      );
      if (innerField) {
        innerField.defaultValue = fieldSchema._def.defaultValue();
      }
      return innerField;
    }

    // 处理对象类型
    if (fieldSchema instanceof z.ZodObject) {
      return {
        key: fullKey,
        label: formatLabel(label),
        type: "object",
      };
    }

    // 处理字符串类型
    if (fieldSchema instanceof z.ZodString) {
      return {
        key: fullKey,
        label: formatLabel(label),
        type: "string",
      };
    }

    // 处理数字类型
    if (fieldSchema instanceof z.ZodNumber) {
      const checks = fieldSchema._def.checks || [];
      const minCheck = checks.find((c) => c.kind === "min") as
        | { value?: number }
        | undefined;
      const maxCheck = checks.find((c) => c.kind === "max") as
        | { value?: number }
        | undefined;

      return {
        key: fullKey,
        label: formatLabel(label),
        type: "number",
        min: minCheck?.value,
        max: maxCheck?.value,
      };
    }

    // 处理布尔类型
    if (fieldSchema instanceof z.ZodBoolean) {
      return {
        key: fullKey,
        label: formatLabel(label),
        type: "boolean",
      };
    }

    // 处理枚举类型
    if (fieldSchema instanceof z.ZodEnum) {
      return {
        key: fullKey,
        label: formatLabel(label),
        type: "enum",
        enumValues: fieldSchema._def.values,
      };
    }

    // 处理数组类型
    if (fieldSchema instanceof z.ZodArray) {
      return {
        key: fullKey,
        label: formatLabel(label),
        type: "array",
      };
    }

    return null;
  };

  const formatLabel = (key: string): string => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const getFieldDescription = (key: string): string | undefined => {
    const descriptions: Record<string, string> = {
      temperature:
        "控制输出的随机性。较低的值使输出更确定，较高的值使输出更随机。",
      maxTokens: "生成的最大token数量。",
      topP: "核采样参数。控制考虑的token概率质量。",
      frequencyPenalty: "频率惩罚。减少重复内容的生成。",
      presencePenalty: "存在惩罚。鼓励谈论新话题。",
      stop: "停止序列。遇到这些字符串时停止生成。",
      size: "生成图像的尺寸。",
      quality: "图像质量。HD质量会消耗更多token。",
      style: "图像风格。Vivid更生动，Natural更自然。",
      numImages: "生成的图像数量。",
      timeout: "API请求超时时间（毫秒）。",
      retryAttempts: "失败时的重试次数。",
      baseURL: "自定义API基础URL（可选）。",
    };

    const fieldKey = key.split(".").pop() || key;
    return descriptions[fieldKey];
  };

  // 初始化表单
  const form = useForm<ProviderConfig>({
    resolver: zodResolver(schema),
    defaultValues: currentValues || defaultValues,
  });

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = form;

  // 监听表单变化
  // const watchedValues = watch();

  useEffect(() => {
    if (currentValues) {
      reset(currentValues);
    }
  }, [currentValues, reset]);

  const onSubmit = async (data: ProviderConfig) => {
    setIsLoading(true);
    try {
      await onSave(data);
      toast.success("配置已保存");
    } catch (error) {
      console.error("Failed to save config:", error);
      toast.error("保存配置失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    reset(defaultValues);
    onReset?.();
    toast.info("配置已重置为默认值");
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // 渲染字段
  const renderField = (field: FieldInfo) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldPath = field.key as any;
    const description = getFieldDescription(field.key);

    if (field.type === "object") {
      // 渲染对象类型作为可折叠部分
      const isExpanded = expandedSections.has(field.key);

      // 获取对象字段的子schema
      let objectSchema: z.ZodSchema | null = null;
      try {
        const keyParts = field.key.split(".");
        let currentSchema: any = schema;

        // 遍历schema结构找到正确的子schema
        for (const part of keyParts) {
          if (currentSchema instanceof z.ZodObject) {
            currentSchema = currentSchema.shape[part];
          } else if (currentSchema instanceof z.ZodDefault) {
            currentSchema = currentSchema._def.innerType;
            if (currentSchema instanceof z.ZodObject) {
              currentSchema = currentSchema.shape[part];
            }
          } else if (currentSchema instanceof z.ZodOptional) {
            currentSchema = currentSchema._def.innerType;
            if (currentSchema instanceof z.ZodObject) {
              currentSchema = currentSchema.shape[part];
            }
          }
        }

        // 处理默认值和可选字段包装
        if (currentSchema instanceof z.ZodDefault) {
          currentSchema = currentSchema._def.innerType;
        }
        if (currentSchema instanceof z.ZodOptional) {
          currentSchema = currentSchema._def.innerType;
        }

        objectSchema = currentSchema;
      } catch (error) {
        console.warn("Failed to parse object schema for", field.key, error);
      }

      const objectFields = objectSchema ? parseSchema(objectSchema, "") : [];

      return (
        <Collapsible
          key={field.key}
          open={isExpanded}
          onOpenChange={() => toggleSection(field.key)}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-4 h-auto"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-medium">{field.label}</span>
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 px-4 pb-4">
            {objectFields.map(renderField)}
          </CollapsibleContent>
        </Collapsible>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={field.key} className="text-sm font-medium">
            {field.label}
            {field.optional && (
              <Badge variant="secondary" className="ml-1 text-xs">
                可选
              </Badge>
            )}
          </Label>
          {description && (
            <div className="group relative">
              <Info className="w-3 h-3 text-muted-foreground cursor-help" />
              <div
                className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-3 py-2 bg-popover text-popover-foreground text-sm rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 max-w-sm text-left border"
                style={{ width: "max-content", maxWidth: "384px" }}
              >
                {description}
              </div>
            </div>
          )}
        </div>

        <Controller
          name={fieldPath}
          control={control}
          render={({ field: formField }) => {
            switch (field.type) {
              case "string":
                if (field.key.includes("stop")) {
                  // 特殊处理stop数组
                  const defaultPlaceholder =
                    field.defaultValue &&
                    Array.isArray(field.defaultValue) &&
                    field.defaultValue.length > 0
                      ? `每行一个停止序列 (默认: ${field.defaultValue.join(
                          ", "
                        )})`
                      : "每行一个停止序列";

                  return (
                    <Textarea
                      {...formField}
                      value={
                        Array.isArray(formField.value)
                          ? formField.value.join("\n")
                          : ""
                      }
                      onChange={(e) => {
                        const lines = e.target.value
                          .split("\n")
                          .filter((line) => line.trim());
                        formField.onChange(lines);
                      }}
                      placeholder={defaultPlaceholder}
                      className="min-h-[80px]"
                    />
                  );
                }
                return (
                  <Input
                    {...formField}
                    type="text"
                    placeholder={field.defaultValue?.toString() || ""}
                  />
                );

              case "number":
                return (
                  <Input
                    {...formField}
                    type="number"
                    min={field.min}
                    max={field.max}
                    step={
                      field.key.includes("temperature") ||
                      field.key.includes("Penalty") ||
                      field.key.includes("topP")
                        ? 0.1
                        : 1
                    }
                    placeholder={field.defaultValue?.toString() || ""}
                    onChange={(e) =>
                      formField.onChange(parseFloat(e.target.value) || 0)
                    }
                  />
                );

              case "boolean":
                return (
                  <Switch
                    checked={formField.value}
                    onCheckedChange={formField.onChange}
                  />
                );

              case "enum":
                return (
                  <Select
                    value={formField.value}
                    onValueChange={formField.onChange}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          field.defaultValue
                            ? `选择选项 (默认: ${field.defaultValue})`
                            : "选择选项"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {field.enumValues?.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );

              default:
                return (
                  <Input
                    {...formField}
                    type="text"
                    placeholder={field.defaultValue?.toString() || ""}
                  />
                );
            }
          }}
        />

        {errors[fieldPath as keyof typeof errors] && (
          <p className="text-sm text-destructive">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(errors[fieldPath as keyof typeof errors] as any)?.message}
          </p>
        )}
      </div>
    );
  };

  const topLevelFields = parseSchema(schema);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {topLevelFields.map(renderField)}

          <div className="flex gap-2 pt-4 border-t">
            <Button
              type="submit"
              disabled={isLoading || !isDirty}
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isLoading ? "保存中..." : "保存配置"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              重置为默认
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
