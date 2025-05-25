"use client";

import PromptInputForm from "@/components/PromptInputForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Navigation from "@/components/Navigation";

export default function TestFormPage() {
  const handleSubmit = (data: any) => {
    console.log("Form submitted:", data);
    alert(
      `表单提交成功！\n提示词长度: ${
        data.prompt.length
      }\n选择的提供商: ${data.providers.join(
        ", "
      )}\n选择的模型: ${data.models.join(", ")}`
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl">提示词输入表单测试</CardTitle>
              <CardDescription>
                测试AI提示词输入界面的功能，包括表单验证、多选组件和响应式设计
              </CardDescription>
            </CardHeader>
          </Card>

          <PromptInputForm onSubmit={handleSubmit} />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">使用说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">功能特性</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• 支持最多10,000字符的提示词输入</li>
                    <li>• 实时字符计数显示</li>
                    <li>• 多提供商和模型选择</li>
                    <li>• 完整的表单验证</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-foreground">交互说明</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• 先选择AI提供商，再选择模型</li>
                    <li>• 支持多选，点击标签删除选项</li>
                    <li>• 表单验证错误会实时显示</li>
                    <li>• 支持键盘导航和响应式设计</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
