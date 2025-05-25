"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: boolean;
  allowSearch?: boolean;
}

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "请选择...",
  disabled = false,
  className = "",
  error = false,
  allowSearch = false,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 筛选选项 - 只有在允许搜索时才进行筛选
  const filteredOptions = allowSearch
    ? options.filter((option) => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        return (
          option.label.toLowerCase().includes(searchLower) ||
          (option.description &&
            option.description.toLowerCase().includes(searchLower))
        );
      })
    : options;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm(""); // 关闭时清空搜索
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 当下拉菜单打开时，聚焦搜索输入框（仅在允许搜索时）
  useEffect(() => {
    if (isOpen && allowSearch && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, allowSearch]);

  const handleToggleOption = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleRemoveOption = (optionValue: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  const selectedOptions = options.filter((option) =>
    value.includes(option.value)
  );

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* 主输入区域 */}
      <div
        className={cn(
          "flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-destructive focus:ring-destructive",
          isOpen && "ring-2 ring-ring ring-offset-2",
          disabled && "cursor-not-allowed opacity-50"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex-1 flex flex-wrap gap-1">
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {option.label}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => handleRemoveOption(option.value, e)}
                      className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X size={12} />
                    </button>
                  )}
                </Badge>
              ))
            )}
          </div>
          <ChevronDown
            size={16}
            className={cn(
              "text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </div>

      {/* 下拉选项 */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-60 overflow-hidden">
          {/* 搜索输入框 - 仅在允许搜索时显示 */}
          {allowSearch && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchInputRef}
                  type="text"
                  placeholder="搜索选项..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* 选项列表 */}
          <div
            className={
              allowSearch
                ? "max-h-48 overflow-y-auto"
                : "max-h-60 overflow-y-auto"
            }
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {allowSearch && searchTerm ? "未找到匹配的选项" : "暂无选项"}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = value.includes(option.value);
                return (
                  <div
                    key={option.value}
                    className={cn(
                      "px-3 py-2 cursor-pointer transition-colors text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent text-accent-foreground"
                    )}
                    onClick={() => handleToggleOption(option.value)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">
                          {option.label}
                        </div>
                        {option.description && (
                          <div className="text-xs text-muted-foreground">
                            {option.description}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check size={16} className="text-primary" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
