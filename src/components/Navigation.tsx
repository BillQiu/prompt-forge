"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Home, Settings, TestTube } from "lucide-react";

const navigationItems = [
  {
    href: "/",
    label: "首页",
    icon: Home,
  },
  {
    href: "/settings",
    label: "设置",
    icon: Settings,
  },
  {
    href: "/test-form",
    label: "测试表单",
    icon: TestTube,
  },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <Card className="fixed top-4 left-4 z-50">
      <CardContent className="p-2">
        <nav className="flex flex-col gap-1">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "justify-start gap-2 min-w-[100px]",
                  isActive && "bg-primary text-primary-foreground"
                )}
              >
                <Link href={item.href}>
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </CardContent>
    </Card>
  );
}
