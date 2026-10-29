"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { parseMemberList } from "@/lib/import-members";

export function MemberImport() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ReturnType<
    typeof parseMemberList
  > | null>(null);
  function check() {
    try {
      setPreview(parseMemberList(text));
      setMessage("");
    } catch (err) {
      setPreview(null);
      setMessage(err instanceof Error ? err.message : "Ошибка списка.");
    }
  }
  async function send() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/participants/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, consentConfirmed: consent }),
      });
      const json = await res.json();
      setMessage(
        res.ok
          ? `Добавлено анкет: ${json.count}.`
          : (json.error ?? "Ошибка импорта."),
      );
      if (res.ok) {
        setText("");
        setPreview(null);
        setConsent(false);
        router.refresh();
      }
    } catch {
      setMessage("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Регистрация списком</h2>
      <p className="text-sm text-muted-foreground">
        Одна строка на человека, без заголовка. Восемь полей:
        ФИО;Почта;Город;Площадка;Смена;Трек;Пункт выдачи;Пожелания. Указывайте
        фамилию и имя полностью, отчество — при наличии. Необязательные почту,
        смену и ПВЗ для «Рядом» оставляйте пустыми между разделителями. Площадка
        обязательна для «Рядом», для «Страны» её можно не указывать. Трек:
        «Рядом» или «Страна». Точка с запятой внутри поля не поддерживается.
      </p>
      <textarea
        aria-label="Список участников"
        rows={5}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        className="w-full rounded-md border bg-background p-2 text-sm"
      />
      <Button variant="outline" type="button" onClick={check}>
        Проверить список
      </Button>
      {preview && (
        <div className="max-h-48 overflow-auto rounded-md border p-3 text-sm">
          <p>К добавлению: {preview.length}</p>
          {preview.slice(0, 20).map((p, i) => (
            <p key={i}>
              {p.name} — {p.city}, {p.site},{" "}
              {p.track === "local" ? "Рядом" : "Страна"}
            </p>
          ))}
          {preview.length > 20 && <p>И ещё {preview.length - 20}…</p>}
        </div>
      )}
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Каждый человек из списка добровольно согласился участвовать и передавать
        нужные для подарка данные. Согласия получены лично.
      </label>
      <Button
        disabled={busy || !consent || !preview?.length || preview.length > 1500}
        onClick={send}
      >
        {busy ? "Добавляем…" : "Добавить проверенные анкеты"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
