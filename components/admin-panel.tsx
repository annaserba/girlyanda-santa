"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2 as LinkIcon,
  Trash2,
  UsersRound,
  Shuffle,
  Mail,
  Settings2,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronRight } from "lucide-react";
import type { Draw, Exclusion, Participant } from "@/lib/db/schema";
import type { OgSettings } from "@/lib/settings";
import type { DrawPairs } from "@/lib/pairings";
import { OgSettingsForm } from "@/components/og-settings";
import { BulkEmailComposer } from "@/components/bulk-email";
import {
  formatPhone,
  normalizeRussianPhone,
  RUSSIAN_PHONE_ERROR,
} from "@/lib/phone";
import { PhoneInput } from "@/components/phone-input";
import { cn } from "@/lib/utils";
import { EventSettings } from "@/components/event-settings";
import { CoordinatorSettings } from "@/components/coordinator-settings";
import { MemberImport } from "@/components/member-import";
import { profileReady, type EventConfig } from "@/lib/event-config";
import Link from "next/link";
import { SiteSettings } from "@/components/site-settings";
import type { SiteOption } from "@/lib/work-sites";

interface UserOption {
  id: string;
  name: string;
  email: string;
}

interface Props {
  participants: Participant[];
  exclusions: Exclusion[];
  pairings: DrawPairs[];
  users: UserOption[];
  og: OgSettings;
  eventConfig: EventConfig;
  scopes: { id: number; userId: string; city: string; site: string }[];
  sites?: SiteOption[];
}

type DrawResponse = {
  draw: Draw;
  assignments?: number;
  rings?: number;
  historyRelaxed?: boolean;
  revealLinks?: { giver: string; url: string }[];
  scheduled?: boolean;
  scheduledAt?: string;
};

export function AdminPanel({
  participants,
  exclusions,
  pairings,
  users,
  og,
  eventConfig,
  scopes,
  sites = [],
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"santa" | "draw" | "mail" | "technical">(
    "santa",
  );
  const [historyOpenId, setHistoryOpenId] = useState<number | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantPage, setParticipantPage] = useState(1);
  const filteredParticipants = participants.filter((p) =>
    `${p.name} ${p.city} ${p.site} ${p.email ?? ""}`
      .toLocaleLowerCase("ru-RU")
      .includes(participantSearch.toLocaleLowerCase("ru-RU")),
  );
  const participantPages = Math.max(
    1,
    Math.ceil(filteredParticipants.length / 50),
  );
  const currentParticipantPage = Math.min(participantPage, participantPages);
  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const participantEmails = participants.flatMap((p) => {
    if (!p.consentAt) return [];
    const email = p.userId ? userById.get(p.userId)?.email : p.email;
    return email ? [email] : [];
  });

  // Accounts not yet tied to any participant — candidates for linking.
  const linkedUserIds = new Set(
    participants.map((p) => p.userId).filter((id): id is string => !!id),
  );
  const linkableUsers = users.filter((u) => !linkedUserIds.has(u.id));

  async function linkParticipant(id: number, userId: string | null) {
    const res = await fetch(`/api/participants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Не удалось привязать аккаунт.");
    }
  }

  /* -------- add participant -------- */
  const [pName, setPName] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pError, setPError] = useState<string | null>(null);

  async function addParticipant(e: React.FormEvent) {
    e.preventDefault();
    setPError(null);
    const normalizedPhone = pPhone ? normalizeRussianPhone(pPhone) : null;
    if (pPhone && !normalizedPhone) {
      setPError(RUSSIAN_PHONE_ERROR);
      return;
    }
    const res = await fetch("/api/participants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: pName,
        phone: normalizedPhone || undefined,
      }),
    });
    if (res.ok) {
      setPName("");
      setPPhone("");
      router.refresh();
    } else {
      const json = await res.json().catch(() => ({}));
      setPError(json.error ?? "Не удалось добавить участника.");
    }
  }

  async function delParticipant(id: number) {
    const res = await fetch(`/api/participants/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Не удалось удалить участника.");
    }
  }

  async function cancelDraw(id: number) {
    if (
      !confirm(
        "Отменить запланированную жеребьёвку? Назначения ещё не созданы.",
      )
    )
      return;
    try {
      const res = await fetch("/api/draw", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) alert(json.error ?? "Не удалось отменить.");
      else router.refresh();
    } catch {
      alert("Нет связи с сервером. Проверьте историю после обновления.");
    }
  }

  /* -------- exclusions -------- */
  const [exA, setExA] = useState("");
  const [exB, setExB] = useState("");

  async function addExclusion(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/exclusions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aId: Number(exA), bId: Number(exB) }),
    });
    if (res.ok) {
      setExA("");
      setExB("");
      router.refresh();
    }
  }

  async function delExclusion(id: number) {
    const res = await fetch(`/api/exclusions/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  /* -------- run draw -------- */
  const [drawName, setDrawName] = useState("");
  const [historyDepth, setHistoryDepth] = useState("0");
  // datetime-local strings ("" = unset)
  const [scheduledAt, setScheduledAt] = useState("");
  const [pairsVisibleAt, setPairsVisibleAt] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DrawResponse | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);

  async function runDraw(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setDrawError(null);
    setResult(null);
    try {
      const res = await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: drawName || "Тайный Санта",
          // Personal results stay in the app; corporate mail is composed separately.
          deliverReveal: true,
          historyDepth: Number(historyDepth) || 0,
          // datetime-local has no timezone; interpret as local, send ISO.
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          pairsVisibleAt: pairsVisibleAt
            ? new Date(pairsVisibleAt).toISOString()
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setDrawError(json.error ?? "Не удалось провести жеребьёвку.");
        return;
      }
      setResult(json);
      router.refresh();
    } catch {
      setDrawError(
        "Не удалось получить ответ сервера. Обновите страницу и проверьте историю: жеребьёвка могла завершиться.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="admin-panel space-y-6">
      <div className="admin-quicklinks flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/garland">
          Общая гирлянда
        </Link>
        <Link className="underline" href="/coordinator">
          Подарки, координаторы и резерв
        </Link>
      </div>
      {/* Tabs */}
      <div
        className="admin-tabs flex flex-wrap gap-1 rounded-md border p-1 text-sm"
        role="group"
        aria-label="Разделы кабинета организатора"
      >
        <button
          type="button"
          onClick={() => setTab("santa")}
          aria-pressed={tab === "santa"}
          className={cn(
            "flex-1 rounded-sm px-3 py-1.5 font-medium transition-colors",
            tab === "santa"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <UsersRound className="size-4" aria-hidden="true" /> Участники
        </button>
        <button
          type="button"
          onClick={() => setTab("draw")}
          aria-pressed={tab === "draw"}
          className={cn(
            "flex-1 rounded-sm px-3 py-1.5 font-medium transition-colors",
            tab === "draw"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Shuffle className="size-4" aria-hidden="true" /> Жеребьёвка
        </button>
        <button
          type="button"
          onClick={() => setTab("mail")}
          aria-pressed={tab === "mail"}
          className={cn(
            "flex-1 rounded-sm px-3 py-1.5 font-medium transition-colors",
            tab === "mail"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Mail className="size-4" aria-hidden="true" /> Рассылка
        </button>
        <button
          type="button"
          onClick={() => setTab("technical")}
          aria-pressed={tab === "technical"}
          className={cn(
            "flex-1 rounded-sm px-3 py-1.5 font-medium transition-colors",
            tab === "technical"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Settings2 className="size-4" aria-hidden="true" /> Настройки
        </button>
      </div>

      {tab === "mail" && (
        <BulkEmailComposer
          addresses={participantEmails}
          config={eventConfig}
          missingEmails={
            participants.filter((p) => p.consentAt).length -
            participantEmails.length
          }
          appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3003"}
        />
      )}

      {tab === "technical" && (
        <div className="space-y-6">
          <EventSettings initial={eventConfig} />
          <SiteSettings sites={sites} />
          <Card>
            <CardContent className="pt-6">
              <CoordinatorSettings
                users={users}
                scopes={scopes}
                sites={sites}
              />
            </CardContent>
          </Card>
          <OgSettingsForm initial={og} />
        </div>
      )}

      {tab === "santa" && (
        <>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm">
                Подтверждённых заполненных анкет:{" "}
                {
                  participants.filter((p) => p.consentAt && profileReady(p))
                    .length
                }
                . Остальные аккаунты и предварительные записи в жеребьёвку не
                попадут.
              </p>
              <MemberImport />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Ссылка и QR-код регистрации</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="break-all text-sm">
                {(
                  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3003"
                ).replace(/\/$/, "")}
                /signup
              </p>
              <img
                src="/api/registration-qr"
                alt="QR-код ссылки на регистрацию"
                width={180}
                height={180}
              />
              <a
                href="/api/registration-qr"
                download="girlyanda-registration.svg"
                className="text-sm underline"
              >
                Скачать QR-код
              </a>
              <p className="text-xs text-muted-foreground">
                Перед публикацией задайте внутренний адрес сайта и пересоберите
                приложение. localhost доступен только на этом компьютере. QR
                формируется внутри контура, без внешнего сервиса.
              </p>
            </CardContent>
          </Card>
          {/* Participants */}
          <Card>
            <CardHeader>
              <CardTitle>Участники ({participants.length})</CardTitle>
              <CardDescription>
                Участники могут зарегистрироваться самостоятельно. Здесь можно
                заранее добавить участников и привязать их аккаунты.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                aria-label="Поиск участника"
                placeholder="Поиск: имя, город, площадка, почта"
                value={participantSearch}
                onChange={(e) => {
                  setParticipantSearch(e.target.value);
                  setParticipantPage(1);
                }}
              />
              <div className="flex items-center justify-between gap-2 text-sm">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentParticipantPage <= 1}
                  onClick={() => setParticipantPage(currentParticipantPage - 1)}
                >
                  Назад
                </Button>
                <span>
                  Страница {currentParticipantPage}/{participantPages}, найдено{" "}
                  {filteredParticipants.length}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={currentParticipantPage >= participantPages}
                  onClick={() => setParticipantPage(currentParticipantPage + 1)}
                >
                  Далее
                </Button>
              </div>
              <ul className="space-y-2">
                {filteredParticipants
                  .slice(
                    (currentParticipantPage - 1) * 50,
                    currentParticipantPage * 50,
                  )
                  .map((p) => {
                    const linkedUser = p.userId
                      ? userById.get(p.userId)
                      : undefined;
                    return (
                      <li
                        key={p.id}
                        className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <span>
                            {p.name}
                            {p.phone ? (
                              <span className="text-muted-foreground">
                                {" "}
                                · {formatPhone(p.phone)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                {" "}
                                · телефон не указан
                              </span>
                            )}
                          </span>
                          <div className="mt-0.5 flex items-center gap-1 text-xs">
                            {linkedUser ? (
                              <>
                                <LinkIcon className="size-3 text-primary" />
                                <span className="text-muted-foreground">
                                  {linkedUser.email}
                                </span>
                                <button
                                  type="button"
                                  className="ml-1 underline text-muted-foreground hover:text-foreground"
                                  onClick={() => linkParticipant(p.id, null)}
                                >
                                  отвязать
                                </button>
                              </>
                            ) : p.userId ? (
                              <span className="text-muted-foreground">
                                Привязанный аккаунт не найден
                              </span>
                            ) : (
                              <span className="text-muted-foreground">
                                Аккаунт не привязан
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.city || "Город не указан"} ·{" "}
                            {p.site || "Площадка не указана"} ·{" "}
                            {p.track === "local"
                              ? "Рядом"
                              : p.track === "country"
                                ? "Страна"
                                : "Трек не выбран"}{" "}
                            ·{" "}
                            {p.consentAt && profileReady(p)
                              ? "Анкета подтверждена"
                              : "Нет подтверждённой анкеты"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!p.userId && (
                            <Select
                              value=""
                              onValueChange={(v) => linkParticipant(p.id, v)}
                              disabled={linkableUsers.length === 0}
                            >
                              <SelectTrigger className="h-8 w-40 text-xs">
                                <SelectValue
                                  placeholder={
                                    linkableUsers.length === 0
                                      ? "Нет свободных аккаунтов"
                                      : "Привязать аккаунт…"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {linkableUsers.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.name} ({u.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => delParticipant(p.id)}
                            aria-label="Удалить"
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              <form
                onSubmit={addParticipant}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Input
                  placeholder="Имя и фамилия"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  required
                />
                <PhoneInput
                  placeholder="Телефон РФ (необязательно)"
                  value={pPhone}
                  onChange={setPPhone}
                />
                <Button type="submit">Добавить</Button>
              </form>
              {pError && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {pError}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Exclusions */}
          <Card>
            <CardHeader>
              <CardTitle>Исключения</CardTitle>
              <CardDescription>
                Участники из одной пары не смогут дарить подарки друг другу.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {exclusions.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Исключений пока нет.
                  </li>
                )}
                {exclusions.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <span>
                      {nameById.get(ex.aId) ?? `#${ex.aId}`} ⇄{" "}
                      {nameById.get(ex.bId) ?? `#${ex.bId}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => delExclusion(ex.id)}
                      aria-label="Удалить"
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={addExclusion}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <Select value={exA} onValueChange={setExA}>
                  <SelectTrigger>
                    <SelectValue placeholder="Первый участник" />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={exB} onValueChange={setExB}>
                  <SelectTrigger>
                    <SelectValue placeholder="Второй участник" />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="submit" disabled={!exA || !exB}>
                  Добавить
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {tab === "draw" && (
        <>
          {/* Run draw */}
          <Card>
            <CardHeader>
              <CardTitle>Провести жеребьёвку</CardTitle>
              <CardDescription>
                Распределяет получателей с учётом исключений, по возможности
                избегает повторений. Участники увидят свои результаты в личном
                кабинете. Общее письмо можно подготовить во вкладке «Рассылка».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={runDraw} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>Название жеребьёвки</Label>
                    <Input
                      placeholder="Новый год 2026"
                      value={drawName}
                      onChange={(e) => setDrawName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Лимит и правило колец</Label>
                    <p className="text-sm">
                      {eventConfig.budget} ₽ ·{" "}
                      {eventConfig.ringPolicy === "tracks"
                        ? "Кольца по трекам"
                        : "Одно кольцо"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Меняются в настройках события. Приём анкет:{" "}
                      {eventConfig.registrationOpen
                        ? "открыт — закройте перед запуском"
                        : "закрыт"}
                      .
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Учитывать прошлые жеребьёвки</Label>
                    <Input
                      type="number"
                      min={0}
                      value={historyDepth}
                      onChange={(e) => setHistoryDepth(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      0 — не учитывать; 1 — последнюю; 2 — две последние и т. д.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Дата жеребьёвки (необязательно)</Label>
                    <DateTimePicker
                      value={scheduledAt}
                      onChange={setScheduledAt}
                      placeholder="Провести сейчас"
                    />
                    <p className="text-xs text-muted-foreground">
                      Оставьте пустым для запуска сейчас. При выборе будущей
                      даты жеребьёвка выполнится в указанное время. Общее письмо
                      отправляется отдельно через корпоративную почту.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Опубликовать все назначения (необязательно)</Label>
                    <DateTimePicker
                      value={pairsVisibleAt}
                      onChange={setPairsVisibleAt}
                      placeholder="Не публиковать"
                    />
                    <p className="text-xs text-muted-foreground">
                      В указанное время все участники смогут увидеть, кто кому
                      дарит. Оставьте поле пустым, чтобы сохранить назначения в
                      тайне.
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Каждый участник дарит подарок другому человеку. Получить
                  собственное имя в жеребьёвке нельзя. Взаимные пары исключены,
                  в каждой замкнутой группе нужно минимум три участника.
                </p>
                <Button type="submit" disabled={running}>
                  {running ? "Проводим жеребьёвку…" : "Провести жеребьёвку 🎲"}
                </Button>
              </form>

              {drawError && (
                <p className="mt-4 text-sm text-destructive">{drawError}</p>
              )}

              {result && (
                <div className="mt-4 space-y-3 rounded-md border p-4 text-sm">
                  {result.scheduled ? (
                    <p className="font-medium">
                      Жеребьёвка «{result.draw.name}» запланирована на{" "}
                      {result.scheduledAt
                        ? new Date(result.scheduledAt).toLocaleString("ru-RU")
                        : "позже"}
                      . Результаты появятся в личных кабинетах. Общее письмо
                      отправьте отдельно через вкладку «Рассылка».
                    </p>
                  ) : (
                    <p className="font-medium">
                      Жеребьёвка «{result.draw.name}». Назначений:{" "}
                      {result.assignments}.
                      {result.rings != null && ` Колец: ${result.rings}.`}
                    </p>
                  )}
                  {result.historyRelaxed && (
                    <p>
                      Прошлые назначения пришлось повторить. Треки, запрет
                      подарка себе и исключения соблюдены.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle>История жеребьёвок</CardTitle>
              <CardDescription>
                Прошлые назначения учитываются при новых жеребьёвках. Полный
                список доступен после выбранного времени публикации.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pairings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Жеребьёвок пока нет.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {pairings.map(({ draw: d, pairs }) => {
                    const pending =
                      d.status !== "completed" && d.scheduledAt != null;
                    // Pairs are inspectable only once they're revealed (date
                    // passed); never-revealed / future draws stay hidden.
                    const visible =
                      d.pairsVisibleAt != null &&
                      new Date(d.pairsVisibleAt).getTime() <= Date.now();
                    const clickable = !pending && visible && pairs.length > 0;
                    const meta = pending ? (
                      <>
                        Запланировано ·{" "}
                        {new Date(d.scheduledAt!).toLocaleString("ru-RU")}
                      </>
                    ) : (
                      <>
                        Результаты в личном кабинете
                        {d.budget != null ? ` · бюджет ${d.budget}` : ""} ·{" "}
                        {new Date(
                          d.executedAt ?? d.createdAt,
                        ).toLocaleDateString("ru-RU")}
                        {!pending &&
                          (d.pairsVisibleAt == null
                            ? " · назначения скрыты"
                            : !visible
                              ? ` · публикация назначений ${new Date(
                                  d.pairsVisibleAt,
                                ).toLocaleDateString("ru-RU")}`
                              : "")}
                      </>
                    );
                    const inner = (
                      <>
                        <span>
                          <span className="font-medium">{d.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {meta}
                          </span>
                        </span>
                        {clickable && (
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        )}
                      </>
                    );
                    return (
                      <li key={d.id}>
                        {clickable ? (
                          <button
                            type="button"
                            onClick={() => setHistoryOpenId(d.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-accent"
                          >
                            {inner}
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                            {inner}
                          </div>
                        )}
                        {pending && (
                          <Button
                            className="mt-1"
                            size="sm"
                            variant="outline"
                            onClick={() => cancelDraw(d.id)}
                          >
                            Отменить запланированную жеребьёвку
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* History pairs modal */}
          <Dialog
            open={historyOpenId !== null}
            onOpenChange={(o) => !o && setHistoryOpenId(null)}
          >
            <DialogContent>
              {(() => {
                const entry = pairings.find((p) => p.draw.id === historyOpenId);
                if (!entry) return null;
                const d = entry.draw;
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>{d.name}</DialogTitle>
                    </DialogHeader>
                    <ul className="space-y-1 text-sm">
                      {entry.pairs.map((p, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded-md border px-3 py-1.5"
                        >
                          <span className="font-medium">{p.giver}</span>
                          <span className="text-muted-foreground">→</span>
                          <span>{p.receiver}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
