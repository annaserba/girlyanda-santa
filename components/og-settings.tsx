"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OgSettings } from "@/lib/settings";
import { SITE_ICONS } from "@/lib/site-icon";

export function OgSettingsForm({ initial }: { initial: OgSettings }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Не удалось сохранить настройки.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Название и оформление сайта</CardTitle>
        <CardDescription>
          Название отображается на главной странице и в карточке ссылки. Значок
          приложения встроен в сайт и работает без внешних сервисов.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Название</Label>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              placeholder="Гирлянда Тайного Санты"
              required
            />
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SITE_ICONS.small}
              width={64}
              height={64}
              alt="Значок Гирлянды Тайного Санты: подарок с огоньками"
              className="size-16 rounded-xl"
            />
            <p className="text-sm text-muted-foreground">
              Значок приложения — подарок с огоньками гирлянды. Хранится на этом
              сервере.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={busy}>
            {saved
              ? "Сохранено ✓"
              : busy
                ? "Сохраняем…"
                : "Сохранить настройки"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
