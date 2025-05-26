"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DatePickerProps {
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({
  date,
  onDateChange,
  placeholder = "选择日期",
  className,
}: DatePickerProps) {
  const [inputValue, setInputValue] = React.useState("");

  React.useEffect(() => {
    if (date) {
      // Format date as YYYY-MM-DD for input[type="date"]
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      setInputValue(`${year}-${month}-${day}`);
    } else {
      setInputValue("");
    }
  }, [date]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setInputValue(value);

    if (value) {
      const parsedDate = new Date(value);
      if (!isNaN(parsedDate.getTime())) {
        onDateChange?.(parsedDate);
      }
    } else {
      onDateChange?.(undefined);
    }
  };

  const handleClear = () => {
    setInputValue("");
    onDateChange?.(undefined);
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className="relative">
        <Input
          type="date"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="w-full pr-8"
        />
        <CalendarIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
      {inputValue && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="px-2"
        >
          ✕
        </Button>
      )}
    </div>
  );
}

interface DateRangePickerProps {
  startDate?: Date;
  endDate?: Date;
  onStartDateChange?: (date: Date | undefined) => void;
  onEndDateChange?: (date: Date | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  className,
}: DateRangePickerProps) {
  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <div className="flex items-center space-x-2">
        <Label
          htmlFor="start-date"
          className="text-sm font-medium whitespace-nowrap"
        >
          从
        </Label>
        <DatePicker
          date={startDate}
          onDateChange={onStartDateChange}
          placeholder="开始日期"
        />
      </div>
      <div className="flex items-center space-x-2">
        <Label
          htmlFor="end-date"
          className="text-sm font-medium whitespace-nowrap"
        >
          到
        </Label>
        <DatePicker
          date={endDate}
          onDateChange={onEndDateChange}
          placeholder="结束日期"
        />
      </div>
    </div>
  );
}
