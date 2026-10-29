"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Participant } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CitySelect } from "@/components/city-select";
import { SiteSelect } from "@/components/site-select";
import { canonical, participantNameSchema } from "@/lib/event-config";
import type { SiteOption } from "@/lib/work-sites";

export function ParticipationForm({
  participant: p,
  locked,
  open,
  sites = [],
}: {
  participant: Participant;
  locked: boolean;
  open: boolean;
  sites?: SiteOption[];
}) {
  const router = useRouter();
  const [track, setTrack] = useState(p.track ?? "local");
  const [name, setName] = useState(() => {
    const savedName = participantNameSchema.safeParse(p.name);
    return savedName.success ? savedName.data : "";
  });
  const [consent, setConsent] = useState(!!p.consentAt);
  const [city, setCity] = useState(p.city);
  const [site, setSite] = useState(p.site);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!city) {
      setMessage("Выберите город РФ из списка.");
      return;
    }
    if (track === "local" && !site.trim()) {
      setMessage("Для трека «Рядом» укажите площадку.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const fullName = participantNameSchema.safeParse(name);
    if (consent && !fullName.success) {
      setMessage(fullName.error.issues[0].message);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.success ? fullName.data : name.trim(),
          city: data.get("city"),
          site,
          shift: data.get("shift"),
          track,
          pickupPoint: data.get("pickupPoint") ?? "",
          wishes: data.get("wishes"),
          consent,
          reserveVolunteer: data.get("reserveVolunteer") === "on",
        }),
      });
      const json = await res.json();
      setMessage(
        res.ok
          ? "Анкета сохранена."
          : (json.error ?? "Не удалось сохранить анкету."),
      );
      if (res.ok) {
        if (fullName.success) setName(fullName.data);
        if (typeof json.site === "string") setSite(json.site);
        router.refresh();
      }
    } catch {
      setMessage("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {p.consentAt
          ? "Вы подтвердили участие."
          : "Аккаунт ещё не означает участие. Заполните анкету и подтвердите согласие."}{" "}
        {locked
          ? "Жеребьёвка проведена, данные доставки зафиксированы."
          : !open
            ? "Приём анкет закрыт."
            : "Домашний адрес не указывайте."}
      </p>
      <fieldset disabled={locked || busy} className="space-y-4">
        <div className="space-y-1 text-sm">
          <Label htmlFor="profile-name">ФИО получателя</Label>
          <Input
            id="profile-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={consent}
            maxLength={200}
            aria-describedby="profile-name-help"
          />
          <p id="profile-name-help" className="text-xs text-muted-foreground">
            Фамилия и имя полностью, отчество — при наличии. Ваш Санта увидит
            это имя для передачи подарка.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <Label htmlFor="profile-city">Город</Label>
            <CitySelect
              id="profile-city"
              value={city}
              onChange={(next) => {
                if (canonical(next) !== canonical(city)) setSite("");
                setCity(next);
              }}
              disabled={locked || busy}
            />
          </div>
          <label className="space-y-1 text-sm">
            Трек
            <select
              id="profile-track"
              value={track}
              onChange={(e) => setTrack(e.target.value as "local" | "country")}
              className="h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="local">Рядом</option>
              <option value="country">Через всю страну</option>
            </select>
          </label>
          <div className="space-y-1 text-sm">
            <Label htmlFor="profile-site">
              {track === "local" ? "Площадка" : "Площадка (необязательно)"}
            </Label>
            <SiteSelect
              id="profile-site"
              city={city}
              options={sites}
              value={site}
              onChange={setSite}
              disabled={locked || busy}
              required={track === "local"}
            />
          </div>
          <label className="space-y-1 text-sm">
            Смена (необязательно)
            <Input name="shift" maxLength={120} defaultValue={p.shift} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          {track === "local"
            ? "Укажите площадку для обмена с коллегами. Указанная смена выделяет отдельную группу."
            : "Коллега из другого города. Подготовьте подарок из своего региона и открытку «откуда это»."}
        </p>
        {track === "country" && (
          <label className="block space-y-1 text-sm">
            Пункт выдачи: оператор, город, код или адрес ПВЗ
            <Input
              name="pickupPoint"
              required
              maxLength={500}
              defaultValue={p.pickupPoint}
            />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          Пара пожеланий (необязательно)
          <textarea
            name="wishes"
            maxLength={2000}
            rows={3}
            defaultValue={p.wishes}
            className="w-full rounded-md border bg-background p-2"
          />
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="reserveVolunteer"
            defaultChecked={p.reserveVolunteer}
          />
          Готов(а) помочь как Санта-резерв, если кому-то не дойдёт подарок
        </label>
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Участвую добровольно и согласен(на), что организатор, координатор и
          мой Санта увидят нужные для передачи подарка данные
        </label>
        <p className="text-xs text-muted-foreground">
          Чтобы отказаться до жеребьёвки, снимите согласие и сохраните анкету.
          После жеребьёвки обратитесь к организатору.
        </p>
        <Button disabled={busy || !city || (track === "local" && !site.trim())}>
          {busy ? "Сохраняем…" : "Сохранить анкету"}
        </Button>
      </fieldset>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
