"use client";
import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarClock, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Calendar + time picker that reads/writes a `datetime-local` string
 * ("YYYY-MM-DDTHH:mm", local time, no timezone) — same contract as a native
 * <input type="datetime-local">, so callers convert with `new Date(value)`.
 */

function parse(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: "" };
  const [d, t = ""] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return { date: undefined, time: t };
  return { date: new Date(y, m - 1, day), time: t.slice(0, 5) };
}

function build(date: Date | undefined, time: string): string {
  if (!date) return "";
  const t = time || "12:00";
  return `${format(date, "yyyy-MM-dd")}T${t}`;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Выберите дату и время",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { date, time } = parse(value);

  const label = value
    ? (() => {
        const dt = new Date(value);
        return isNaN(dt.getTime())
          ? value
          : format(dt, "d MMMM yyyy, HH:mm", { locale: ru });
      })()
    : "";

  return (
    <div
      data-slot="datetime-picker"
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex-1 truncate text-left outline-none",
              !value && "text-muted-foreground",
            )}
          >
            {label || placeholder}
          </button>
        </PopoverTrigger>
        <PopoverContent className="space-y-3">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={date}
            onSelect={(d) => onChange(build(d ?? undefined, time))}
            autoFocus
          />
          <div className="flex items-center gap-2 border-t pt-3">
            <span className="text-sm text-muted-foreground">Время</span>
            <input
              type="time"
              aria-label="Время"
              value={time}
              onChange={(e) => onChange(build(date, e.target.value))}
              className="ml-auto rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          aria-label="Очистить дату"
          onClick={() => onChange("")}
          className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
