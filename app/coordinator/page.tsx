import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, first, schema } from "@/lib/db";
import { staffAccess, managesSite } from "@/lib/staff";
import { getEventConfig } from "@/lib/event-settings";
import { GiftActions } from "@/components/gift-actions";
import { MemberImport } from "@/components/member-import";
import { RecipientDetails } from "@/lib/gift-display";
import { giftKindLabels } from "@/lib/event-config";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HolidayPageHeader, HolidayShell } from "@/components/holiday-shell";

export default async function CoordinatorPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const access = await staffAccess();
  if (!access) redirect("/login");
  if (!access.admin && !access.scopes.length) redirect("/dashboard");
  const config = await getEventConfig();
  const query = await searchParams;
  const filter = ["late", "reserve"].includes(query.status ?? "")
    ? query.status!
    : "all";
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.page) || 1)),
  );
  const people = await db.select().from(schema.participant);
  const byId = new Map(people.map((p) => [p.id, p]));
  const mine = people.filter((p) => managesSite(access, p));
  const draw = await first(
    db
      .select()
      .from(schema.draw)
      .where(
        and(
          eq(schema.draw.status, "completed"),
          eq(schema.draw.garlandVersion, 1),
        ),
      )
      .orderBy(desc(schema.draw.executedAt))
      .limit(1),
  );
  const gifts = draw
    ? await db
        .select()
        .from(schema.assignment)
        .where(eq(schema.assignment.drawId, draw.id))
    : [];
  const incoming = new Map(gifts.map((g) => [g.receiverId, g]));
  const outgoing = new Map(gifts.map((g) => [g.giverId, g]));
  const late = (g: (typeof gifts)[number]) =>
    !g.receivedAt &&
    ((!g.sentAt &&
      Date.now() >
        new Date(`${config.sendDeadline}T23:59:59+03:00`).getTime()) ||
      Date.now() >
        new Date(`${config.receiveDeadline}T23:59:59+03:00`).getTime());
  const scopedGifts = gifts.filter(
    (g) =>
      byId.get(g.receiverId) && managesSite(access, byId.get(g.receiverId)!),
  );
  const volunteers = people
    .filter((p) => p.reserveVolunteer && p.consentAt)
    .map((p) => ({ id: p.id, name: `${p.name} (${p.city})` }));
  const list = mine.filter((p) => {
    const gift = incoming.get(p.id);
    return (
      filter === "all" ||
      (!!gift &&
        (filter === "late"
          ? late(gift)
          : gift.reserveState !== "none" && gift.reserveState !== "resolved"))
    );
  });
  const pages = Math.max(1, Math.ceil(list.length / 30));
  const current = Math.min(page, pages);
  return (
    <HolidayShell contentId="coordinator-content">
      <HolidayPageHeader
        title="Площадка, подарки и Санта-резерв"
        icon={<MapPin className="size-6" />}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Мой кабинет</Link>
            </Button>
            {access.admin && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">Организатор</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/garland">Гирлянда</Link>
            </Button>
          </>
        }
      />
      <main id="coordinator-content" className="space-y-6">
        <p className="text-sm">
          {access.admin
            ? "Все площадки"
            : `Ваши площадки: ${access.scopes.map((s) => `${s.city}, ${s.site}`).join("; ")}`}
          . Получено: {scopedGifts.filter((g) => g.receivedAt).length}/
          {scopedGifts.length}. Задержек: {scopedGifts.filter(late).length}.
          Запросов в резерв:{" "}
          {scopedGifts.filter((g) => g.reserveState === "requested").length}.
        </p>
        <p className="text-sm text-muted-foreground">
          Отправка до {config.sendDeadline}, получение до{" "}
          {config.receiveDeadline}, включительно по МСК. Резерв назначается
          человеком после проверки: повторный подарок не отправляется
          автоматически. Финансирование фонда согласуется отдельно.
        </p>
        {config.registrationOpen && (
          <section className="holiday-coordinator-card rounded-lg border p-4">
            <MemberImport />
          </section>
        )}
        <nav
          className="holiday-coordinator-filters flex gap-4 text-sm"
          aria-label="Фильтр подарков"
        >
          <Link
            href="/coordinator"
            aria-current={filter === "all" ? "page" : undefined}
          >
            Все участники
          </Link>
          <Link
            href="/coordinator?status=late"
            aria-current={filter === "late" ? "page" : undefined}
          >
            Задержки
          </Link>
          <Link
            href="/coordinator?status=reserve"
            aria-current={filter === "reserve" ? "page" : undefined}
          >
            Резерв
          </Link>
        </nav>
        <p className="text-sm">
          Показано {list.length ? (current - 1) * 30 + 1 : 0}–
          {Math.min(current * 30, list.length)} из {list.length}. Жеребьёвка:{" "}
          {draw?.name ?? "ещё не проведена"}.
        </p>
        {list.slice((current - 1) * 30, current * 30).map((p) => {
          const received = incoming.get(p.id);
          const sent = outgoing.get(p.id);
          const receiver = sent ? byId.get(sent.receiverId) : undefined;
          return (
            <article
              key={p.id}
              className="holiday-coordinator-card space-y-4 rounded-lg border p-4"
            >
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {p.city}, {p.site}
                  {p.shift ? `, ${p.shift}` : ""} ·{" "}
                  {p.userId ? "Есть аккаунт" : "Результат передаёт координатор"}{" "}
                  ·{" "}
                  {p.consentAt
                    ? "Участие подтверждено"
                    : "Нет согласия, не участвует"}
                </p>
              </div>
              {received ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Входящий подарок {late(received) ? "— срок нарушен" : ""}
                  </h3>
                  <p className="text-sm">
                    Формат: {giftKindLabels[received.giftKind]}.{" "}
                    {received.deliveryNote &&
                      `Передача: ${received.deliveryNote}`}
                  </p>
                  {received.reserveVolunteerId && (
                    <p className="text-sm">
                      Помощник:{" "}
                      {byId.get(received.reserveVolunteerId)?.name ??
                        "аккаунт удалён"}
                      {received.reserveSentAt
                        ? ", резервный подарок подготовлен / отправлен"
                        : ""}
                    </p>
                  )}
                  <GiftActions
                    id={received.id}
                    mode="staff"
                    sent={!!received.sentAt || !!received.reserveSentAt}
                    received={!!received.receivedAt}
                    reserveState={received.reserveState}
                    volunteers={
                      received.reserveState === "requested"
                        ? volunteers.filter((v) => v.id !== p.id)
                        : []
                    }
                  />
                  {received.reserveState === "assigned" &&
                    !received.reserveSentAt &&
                    !received.receivedAt && (
                      <details>
                        <summary className="cursor-pointer text-sm">
                          Отметить подготовку подарка за помощника без аккаунта
                        </summary>
                        <div className="mt-2">
                          <GiftActions
                            id={received.id}
                            mode="reserve"
                            sent={!!received.sentAt}
                            received={false}
                            reserveState={received.reserveState}
                          />
                        </div>
                      </details>
                    )}
                </section>
              ) : (
                <p className="text-sm text-muted-foreground">
                  В текущей жеребьёвке не участвует.
                </p>
              )}
              {sent && receiver && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Персональный результат для {p.name} — передать лично
                  </summary>
                  <div className="mt-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Не публикуйте этот результат в общей рассылке.
                    </p>
                    <RecipientDetails
                      person={receiver}
                      local={p.track === "local"}
                    />
                    <GiftActions
                      id={sent.id}
                      mode="giver"
                      sent={!!sent.sentAt}
                      received={!!sent.receivedAt}
                      reserveState={sent.reserveState}
                    />
                  </div>
                </details>
              )}
            </article>
          );
        })}
        {!list.length && <p>Участников с выбранным условием нет.</p>}
        <nav
          className="flex justify-between text-sm"
          aria-label="Страницы участников"
        >
          {current > 1 ? (
            <Link
              className="underline"
              href={`/coordinator?status=${filter}&page=${current - 1}`}
            >
              Назад
            </Link>
          ) : (
            <span />
          )}
          {current < pages && (
            <Link
              className="underline"
              href={`/coordinator?status=${filter}&page=${current + 1}`}
            >
              Далее
            </Link>
          )}
        </nav>
      </main>
    </HolidayShell>
  );
}
