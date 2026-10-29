"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CoordinatorSettings({
  users,
  scopes,
}: {
  users: { id: string; name: string; email: string }[];
  scopes: { id: number; userId: string; city: string; site: string }[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function request(method: string, data: object) {
    setBusy(true);
    try {
      const res = await fetch("/api/coordinators", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      setMessage(res.ok ? "Доступ обновлён." : (json.error ?? "Ошибка."));
      if (res.ok) router.refresh();
    } catch {
      setMessage("Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Координаторы площадок</h2>
      <p className="text-sm text-muted-foreground">
        Выберите уже созданный аккаунт. Координатор получает доступ только к
        указанной площадке через /coordinator. Город и площадка в анкетах должны
        совпадать с назначением.
      </p>
      <ul className="space-y-2 text-sm">
        {scopes.map((s) => (
          <li key={s.id} className="flex flex-wrap justify-between gap-2">
            {users.find((u) => u.id === s.userId)?.email} — {s.city}, {s.site}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => request("DELETE", { id: s.id })}
            >
              Отозвать доступ
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void request("POST", Object.fromEntries(f));
        }}
      >
        <select
          aria-label="Аккаунт координатора"
          name="userId"
          required
          className="w-full rounded-md border bg-background p-2 text-sm"
        >
          <option value="">Аккаунт координатора</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {u.email}
            </option>
          ))}
        </select>
        <Input
          name="city"
          aria-label="Город координатора"
          placeholder="Город"
          required
          maxLength={120}
        />
        <Input
          name="site"
          aria-label="Площадка координатора"
          placeholder="Площадка"
          required
          maxLength={120}
        />
        <Button disabled={busy}>Назначить координатора</Button>
      </form>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
