import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navigation from "@/components/Navigation";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="container mx-auto py-8 px-4">
        {/* 头部介绍 */}
        <div className="max-w-4xl mx-auto text-center space-y-6 mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Prompt Forge
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            一个强大的AI提示词管理和测试平台，支持多个LLM提供商，让您轻松测试和比较不同AI模型的响应
          </p>

          <div className="flex gap-4 items-center justify-center flex-wrap">
            <Button asChild size="lg">
              <Link href="/timeline">查看时间轴</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/settings">API设置</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/test-form">测试表单</Link>
            </Button>
          </div>
        </div>

        {/* 功能特性 */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🎯 多提供商支持
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                支持OpenAI、Anthropic、Google等主流AI提供商，一站式管理您的API密钥
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                ⚡ 实时响应
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                支持流式响应，实时显示AI生成内容，提供更好的用户体验
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                📊 结果比较
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                同时向多个AI模型发送提示词，方便比较不同模型的响应质量
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🔒 本地存储
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                所有数据本地存储，API密钥加密保护，确保您的隐私安全
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                📱 响应式设计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                适配移动端、平板和桌面设备，随时随地使用AI工具
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🎨 现代界面
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                基于shadcn/ui构建，支持暗色模式，提供优雅的用户界面
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* 技术栈 */}
        <Card className="max-w-4xl mx-auto mb-12">
          <CardHeader className="text-center">
            <CardTitle>技术栈</CardTitle>
            <CardDescription>使用现代Web技术构建的高性能应用</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "Next.js 15",
                "React 19",
                "TypeScript",
                "TailwindCSS",
                "shadcn/ui",
                "Zustand",
                "IndexedDB",
                "React Hook Form",
                "Zod",
              ].map((tech) => (
                <Badge key={tech} variant="secondary">
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 页脚链接 */}
        <footer className="max-w-4xl mx-auto flex gap-6 flex-wrap items-center justify-center text-sm text-muted-foreground">
          <a
            className="flex items-center gap-2 hover:text-foreground transition-colors"
            href="https://nextjs.org/learn"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              aria-hidden
              src="/file.svg"
              alt="File icon"
              width={16}
              height={16}
            />
            Learn
          </a>
          <a
            className="flex items-center gap-2 hover:text-foreground transition-colors"
            href="https://vercel.com/templates?framework=next.js"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              aria-hidden
              src="/window.svg"
              alt="Window icon"
              width={16}
              height={16}
            />
            Examples
          </a>
          <a
            className="flex items-center gap-2 hover:text-foreground transition-colors"
            href="https://github.com/BillQiu/prompt-forge"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              aria-hidden
              src="/globe.svg"
              alt="Globe icon"
              width={16}
              height={16}
            />
            GitHub →
          </a>
        </footer>
      </div>
    </div>
  );
}
