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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiteSelect } from "@/components/site-select";
import { canonical } from "@/lib/event-config";
import type { SiteOption } from "@/lib/work-sites";

export function SiteSettings({ sites }: { sites: SiteOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<{
    source: SiteOption;
    action: "rename" | "merge";
  } | null>(null);
  const [name, setName] = useState("");
  const [targetName, setTargetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const matches = sites.filter((site) =>
    canonical(site.city + " " + site.name).includes(canonical(search)),
  );
  const targets = edit
    ? sites.filter(
        (s) =>
          s.id !== edit.source.id &&
          canonical(s.city) === canonical(edit.source.city),
      )
    : [];
  const target = targets.find(
    (s) => canonical(s.name) === canonical(targetName),
  );
  function start(source: SiteOption, action: "rename" | "merge") {
    setEdit({ source, action });
    setName(source.name);
    setTargetName("");
    setError("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit || (edit.action === "merge" && !target)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          edit.action === "rename"
            ? { action: "rename", sourceId: edit.source.id, name }
            : {
                action: "merge",
                sourceId: edit.source.id,
                targetId: target!.id,
              },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось изменить площадку.");
        return;
      }
      setMessage(
        edit.action === "rename"
          ? "Площадка переименована."
          : "Площадки объединены.",
      );
      setEdit(null);
      router.refresh();
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Площадки</CardTitle>
        <CardDescription>
          Регистр букв, лишние пробелы и «ё/е» не создают новую площадку.
          Одинаковые названия в разных городах считаются отдельно.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="site-search">Найти площадку</Label>
        <Input
          id="site-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Город или название площадки"
        />
        <ul className="max-h-96 space-y-2 overflow-y-auto">
          {matches.map((site) => (
            <li
              key={site.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
            >
              <span>
                {site.city} — <strong>{site.name}</strong>
              </span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => start(site, "rename")}
                >
                  Переименовать
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !sites.some(
                      (s) =>
                        s.id !== site.id &&
                        canonical(s.city) === canonical(site.city),
                    )
                  }
                  onClick={() => start(site, "merge")}
                >
                  Объединить
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {!matches.length && (
          <p className="text-sm text-muted-foreground">
            {sites.length
              ? "Площадки не найдены."
              : "Площадки появятся после заполнения анкет или назначения координаторов."}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <Dialog
          open={!!edit}
          onOpenChange={(open) => {
            if (!open && !busy) setEdit(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {edit?.action === "rename"
                  ? "Переименовать площадку"
                  : "Объединить площадки"}
              </DialogTitle>
            </DialogHeader>
            {edit && (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-sm">
                  {edit.source.city} — {edit.source.name}
                </p>
                {edit.action === "rename" ? (
                  <div className="space-y-2">
                    <Label htmlFor="site-new-name">Новое название</Label>
                    <Input
                      id="site-new-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={120}
                      disabled={busy}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="site-merge-target">
                      Объединить с площадкой
                    </Label>
                    <SiteSelect
                      id="site-merge-target"
                      city={edit.source.city}
                      options={targets}
                      value={targetName}
                      onChange={setTargetName}
                      allowCreate={false}
                      required
                      disabled={busy}
                    />
                    <p className="text-sm text-muted-foreground">
                      Анкеты перейдут на выбранную площадку. Координаторы обеих
                      площадок получат доступ ко всей объединённой группе.
                      Выданные пары сохранятся.
                    </p>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button
                  disabled={
                    busy || (edit.action === "rename" ? !name.trim() : !target)
                  }
                >
                  {busy
                    ? "Сохраняем…"
                    : edit.action === "rename"
                      ? "Сохранить название"
                      : "Объединить площадки"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
