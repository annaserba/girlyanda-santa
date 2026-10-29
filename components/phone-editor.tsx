"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/phone-input";
import { normalizeRussianPhone, RUSSIAN_PHONE_ERROR } from "@/lib/phone";

export function PhoneEditor({
  participantId,
  initialPhone,
}: {
  participantId: number;
  initialPhone: string | null;
}) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedPhone = phone ? normalizeRussianPhone(phone) : null;
    if (phone && !normalizedPhone) {
      setError(RUSSIAN_PHONE_ERROR);
      return;
    }
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      if (res.ok) setSaved(true);
      else {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Не удалось сохранить телефон.");
      }
    } catch {
      setError("Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
    void participantId;
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <PhoneInput
        value={phone}
        onChange={(v) => {
          setPhone(v);
          setSaved(false);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {saved ? "Сохранено ✓" : busy ? "Сохраняем…" : "Сохранить телефон"}
      </Button>
    </form>
  );
}
