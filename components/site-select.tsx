"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { canonical } from "@/lib/event-config";
import { cleanSiteName, searchSites, type SiteOption } from "@/lib/work-sites";
import { cn } from "@/lib/utils";

export function SiteSelect({
  value,
  onChange,
  city,
  options,
  disabled = false,
  required = false,
  allowCreate = true,
  id = "site",
  name = "site",
}: {
  value: string;
  onChange: (value: string) => void;
  city: string;
  options: SiteOption[];
  disabled?: boolean;
  required?: boolean;
  allowCreate?: boolean;
  id?: string;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inactive = disabled || !city;
  const sites = searchSites(options, city, query);
  const selected = searchSites(options, city).find(
    (s) => canonical(s.name) === canonical(value),
  );
  const candidate = cleanSiteName(query);
  const canCreate =
    allowCreate &&
    candidate.length > 0 &&
    candidate.length <= 120 &&
    !sites.some((s) => canonical(s.name) === canonical(candidate));
  useEffect(() => {
    if (inactive) {
      setOpen(false);
      setQuery("");
    }
  }, [inactive]);
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }
  function choose(next: string) {
    if (inactive) return;
    onChange(next);
    changeOpen(false);
  }
  return (
    <>
      <Popover open={open && !inactive} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            data-slot="select-trigger"
            role="combobox"
            aria-expanded={open && !inactive}
            aria-haspopup="dialog"
            aria-required={required}
            disabled={inactive}
            className={cn(
              "h-11 w-full min-w-0 justify-between px-3 text-left text-base font-normal md:text-sm",
              !value && "text-muted-foreground",
            )}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                changeOpen(true);
              }
            }}
          >
            <span className="min-w-0 truncate">
              {selected?.name ||
                value ||
                (city
                  ? allowCreate
                    ? "Выберите или добавьте площадку"
                    : "Выберите площадку"
                  : "Сначала выберите город")}
            </span>
            <ChevronsUpDown
              className="shrink-0 opacity-50"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="city-select-popover w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden p-0"
          collisionPadding={12}
        >
          <Command shouldFilter={false} label="Выбор площадки">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={
                allowCreate
                  ? "Найти или ввести новую площадку…"
                  : "Поиск площадки…"
              }
              aria-label="Поиск площадки"
              maxLength={120}
              className="h-11"
            />
            <CommandList
              className="overscroll-contain"
              style={{
                maxHeight:
                  "min(18rem, calc(var(--radix-popover-content-available-height, 24rem) - 4rem))",
              }}
            >
              <CommandGroup>
                {!required && value && (
                  <CommandItem value="clear" onSelect={() => choose("")}>
                    Не указывать площадку
                  </CommandItem>
                )}
                {sites.slice(0, 100).map((site) => (
                  <CommandItem
                    key={site.id}
                    value={String(site.id)}
                    onSelect={() => choose(site.name)}
                    className="cursor-pointer px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 whitespace-normal">
                      {site.name}
                    </span>
                    <Check
                      className={
                        canonical(value) === canonical(site.name)
                          ? "opacity-100"
                          : "opacity-0"
                      }
                      aria-hidden="true"
                    />
                  </CommandItem>
                ))}
                {canCreate && (
                  <CommandItem
                    value="create"
                    onSelect={() => choose(candidate)}
                    className="cursor-pointer px-3 py-2"
                  >
                    <Plus aria-hidden="true" />
                    Добавить «{candidate}»
                  </CommandItem>
                )}
              </CommandGroup>
              {!sites.length && !canCreate && (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {allowCreate
                    ? "Введите название новой площадки."
                    : "Других площадок в этом городе нет."}
                </p>
              )}
            </CommandList>
            {sites.length > 100 && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                Уточните название — показаны первые 100 площадок.
              </p>
            )}
            {allowCreate && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                Новая площадка появится в списке после сохранения формы.
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name} value={value} disabled={inactive} />
    </>
  );
}
