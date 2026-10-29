"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  REGISTRATION_CITY_OPTIONS,
  searchRegistrationCities,
} from "@/lib/registration-cities";
import { cn } from "@/lib/utils";

const VISIBLE_CITY_LIMIT = 100;

export function CitySelect({
  value,
  onChange,
  disabled = false,
  id = "city",
  name = "city",
}: {
  value: string;
  onChange: (city: string) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = REGISTRATION_CITY_OPTIONS.find(
    (city) => city.value === value,
  );
  const matches = useMemo(() => searchRegistrationCities(query), [query]);
  const cities = (
    !query.trim() && selected
      ? [selected, ...matches.filter((city) => city.value !== value)]
      : matches
  ).slice(0, VISIBLE_CITY_LIMIT);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setQuery("");
    }
  }, [disabled]);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  return (
    <>
      <Popover open={open && !disabled} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            data-slot="select-trigger"
            role="combobox"
            aria-expanded={open && !disabled}
            aria-haspopup="dialog"
            aria-required="true"
            disabled={disabled}
            title={selected?.label || value || undefined}
            className={cn(
              "h-11 w-full min-w-0 justify-between px-3 text-left text-base font-normal md:text-sm",
              !value && "text-muted-foreground",
            )}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span className="min-w-0 truncate">
              {selected?.label || value || "Выберите город РФ"}
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
          <Command shouldFilter={false} label="Выбор города">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Город или регион…"
              aria-label="Поиск города или региона"
              autoComplete="off"
              className="h-11"
            />
            <CommandList
              style={{
                maxHeight:
                  "min(18rem, calc(var(--radix-popover-content-available-height, 24rem) - 4rem))",
              }}
              className="overscroll-contain"
            >
              <CommandEmpty>Город не найден. Уточните название.</CommandEmpty>
              <CommandGroup>
                {cities.map((city) => (
                  <CommandItem
                    key={city.value}
                    value={city.value}
                    className="cursor-pointer px-3 py-2"
                    onSelect={() => {
                      if (disabled) return;
                      onChange(city.value);
                      changeOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 whitespace-normal">
                      {city.label}
                    </span>
                    <Check
                      className={
                        value === city.value ? "opacity-100" : "opacity-0"
                      }
                      aria-hidden="true"
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {matches.length > VISIBLE_CITY_LIMIT && (
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                Уточните город или регион — показаны первые {VISIBLE_CITY_LIMIT}
                .
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name} value={value} disabled={disabled} />
    </>
  );
}
