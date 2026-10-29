"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { GiftAction } from "@/lib/gift-rules";
import { giftKindLabels } from "@/lib/event-config";
import { Input } from "@/components/ui/input";

export function GiftActions({
  id,
  mode,
  sent,
  received,
  reserveState,
  volunteers = [],
}: {
  id: number;
  mode: "giver" | "receiver" | "staff" | "reserve";
  sent: boolean;
  received: boolean;
  reserveState: string;
  volunteers?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("physical");
  const [note, setNote] = useState("");
  const [volunteer, setVolunteer] = useState("");
  async function act(action: GiftAction) {
    if (
      action === "received" &&
      !confirm("Вы действительно получили подарок? На карте загорится огонёк.")
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/gifts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          kind,
          note,
          ...(volunteer ? { volunteerId: Number(volunteer) } : {}),
        }),
      });
      const json = await res.json();
      setMessage(
        res.ok ? "Отметка сохранена." : (json.error ?? "Ошибка сохранения."),
      );
      if (res.ok) router.refresh();
    } catch {
      setMessage("Нет связи с сервером. Попробуйте снова.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {received
          ? "✓ Подарок получен, огонёк зажжён"
          : sent
            ? "Подарок отправлен, ждём получения"
            : "Подарок ещё не отмечен как отправленный"}
      </p>
      {reserveState !== "none" && (
        <p className="text-sm">
          Резерв:{" "}
          {reserveState === "requested"
            ? "нужна помощь"
            : reserveState === "assigned"
              ? "помощник назначен"
              : "вопрос закрыт"}
        </p>
      )}
      {!received && (
        <>
          {((mode === "giver" && !sent) || mode === "reserve") && (
            <>
              <label className="block text-sm">
                Формат подарка
                <select
                  className="w-full rounded-md border bg-background p-2"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  {Object.entries(giftKindLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Как получить (трек отправления, код ПВЗ или время вручения)
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  placeholder="Без домашнего адреса"
                />
              </label>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  act(mode === "reserve" ? "reserve_sent" : "sent")
                }
              >
                {mode === "reserve"
                  ? "Резервный подарок подготовлен / отправлен"
                  : "Подарок отправлен / передан"}
              </Button>
            </>
          )}
          {(mode === "receiver" || mode === "staff") && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => act("received")}>
                Подарок получен — зажечь огонёк
              </Button>
              {reserveState === "none" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act("request_reserve")}
                >
                  Нужна помощь резерва
                </Button>
              )}
            </div>
          )}
          {mode === "staff" && reserveState === "requested" && (
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Доброволец резерва"
                value={volunteer}
                onChange={(e) => setVolunteer(e.target.value)}
                className="rounded-md border bg-background p-2 text-sm"
              >
                <option value="">Выберите добровольца</option>
                {volunteers.map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={busy || !volunteer}
                onClick={() => act("assign_reserve")}
              >
                Назначить помощника
              </Button>
            </div>
          )}
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
