"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventConfig } from "@/lib/event-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export function EventSettings({ initial }: { initial: EventConfig }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const locations = String(f.get("locations"))
        .split(/\r?\n/)
        .filter((v) => v.trim())
        .map((line) => {
          const [city, lat, lon, extra] = line.split(";").map((v) => v.trim());
          if (!city || !lat || !lon || extra !== undefined)
            throw new Error(
              "Координаты: Город;широта;долгота, одна строка на город.",
            );
          return { city, latitude: Number(lat), longitude: Number(lon) };
        });
      const res = await fetch("/api/event", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationOpen: f.get("registrationOpen") === "on",
          budget: Number(f.get("budget")),
          ringPolicy: f.get("ringPolicy"),
          mapPublished: f.get("mapPublished") === "on",
          locations,
          ...Object.fromEntries(
            [
              "registrationDeadline",
              "drawDate",
              "sendDeadline",
              "receiveDeadline",
              "finaleDate",
            ].map((key) => [key, f.get(key)]),
          ),
        }),
      });
      const json = await res.json();
      setMessage(
        res.ok ? "Настройки сохранены." : (json.error ?? "Ошибка сохранения."),
      );
      if (res.ok) router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка соединения.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Правила события</CardTitle>
        <CardDescription>
          Даты и 1000 ₽ взяты из предложения и требуют согласования. Закройте
          приём анкет перед жеребьёвкой. Правила сохраняются при создании
          жеребьёвки, состав анкет проверяется при запуске.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <label className="flex gap-2 text-sm">
            <input
              name="registrationOpen"
              type="checkbox"
              defaultChecked={initial.registrationOpen}
            />
            Приём анкет открыт (закрывается вручную)
          </label>
          <label className="block text-sm">
            Лимит подарка, ₽
            <Input
              name="budget"
              type="number"
              min={0}
              max={100000}
              required
              defaultValue={initial.budget}
            />
          </label>
          <label className="block text-sm">
            Правило колец
            <select
              name="ringPolicy"
              defaultValue={initial.ringPolicy}
              className="w-full rounded-md border bg-background p-2"
            >
              <option value="single">Одно кольцо на всех</option>
              <option value="tracks">Кольца по трекам и площадкам</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Одно кольцо: «Рядом» дарит внутри площадки, но может получить
            подарок из другого города. Кольца по трекам: «Рядом» дарит и
            получает внутри своей группы, межгород — отдельное кольцо. В каждой
            замкнутой группе нужно минимум 3 человека. Правила не ослабляются
            автоматически.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["registrationDeadline", "Регистрация до"],
                ["drawDate", "Жеребьёвка"],
                ["sendDeadline", "Отправить до"],
                ["receiveDeadline", "Получить до"],
                ["finaleDate", "Финал"],
              ] as const
            ).map(([key, title]) => (
              <label key={key} className="block text-sm">
                {title}
                <Input
                  type="date"
                  required
                  name={key}
                  defaultValue={initial[key]}
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Даты — сроки для участников и контроля задержек, они не запускают
            рассылку и не закрывают форму сами. Время автоматической жеребьёвки
            задаётся в её форме.
          </p>
          <label className="block space-y-1 text-sm">
            Реальные города для карты: Город;широта;долгота
            <textarea
              name="locations"
              rows={4}
              className="w-full rounded-md border bg-background p-2"
              defaultValue={initial.locations
                .map((l) => `${l.city};${l.latitude};${l.longitude}`)
                .join("\n")}
            />
          </label>
          <label className="flex gap-2 text-sm">
            <input
              name="mapPublished"
              type="checkbox"
              defaultChecked={initial.mapPublished}
            />
            Показывать обезличенную карту без входа на главной и на /garland
            (для портала и офисных экранов)
          </label>
          <Button disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить правила"}
          </Button>
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
