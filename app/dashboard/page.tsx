import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Gift } from "lucide-react";
import { db, first, schema } from "@/lib/db";
import { getCurrentUser, getOrCreateParticipant, isAdmin } from "@/lib/session";
import { getMyMatchHistory, getVisiblePairings } from "@/lib/pairings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";
import { WishlistEditor } from "@/components/wishlist-editor";
import { PhoneEditor } from "@/components/phone-editor";
import { PairingsCards } from "@/components/pairings-cards";
import { ParticipationForm } from "@/components/participation-form";
import { GiftActions } from "@/components/gift-actions";
import { RecipientDetails } from "@/lib/gift-display";
import { getEventConfig } from "@/lib/event-settings";
import { staffAccess } from "@/lib/staff";
import { HolidayPageHeader, HolidayShell } from "@/components/holiday-shell";
import { getSiteOptions } from "@/lib/sites";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const participant = await getOrCreateParticipant();
  const admin = await isAdmin();
  const config = await getEventConfig();
  const staff = await staffAccess();
  const sites = await getSiteOptions();
  const currentDraws = db
    .select({ id: schema.draw.id })
    .from(schema.draw)
    .where(eq(schema.draw.garlandVersion, 1));
  const incoming = participant
    ? await first(
        db
          .select()
          .from(schema.assignment)
          .where(
            and(
              eq(schema.assignment.receiverId, participant.id),
              inArray(schema.assignment.drawId, currentDraws),
            ),
          )
          .orderBy(desc(schema.assignment.createdAt))
          .limit(1),
      )
    : undefined;
  const reserveTasks = participant
    ? await db
        .select()
        .from(schema.assignment)
        .where(eq(schema.assignment.reserveVolunteerId, participant.id))
    : [];
  const reservePeople = reserveTasks.length
    ? await db.select().from(schema.participant)
    : [];

  const wishlist = participant
    ? await db
        .select()
        .from(schema.wishlistItem)
        .where(eq(schema.wishlistItem.participantId, participant.id))
    : [];

  // Most recent assignment where this participant is the giver.
  const latest = participant
    ? await first(
        db
          .select()
          .from(schema.assignment)
          .where(
            and(
              eq(schema.assignment.giverId, participant.id),
              inArray(schema.assignment.drawId, currentDraws),
            ),
          )
          .orderBy(desc(schema.assignment.createdAt)),
      )
    : undefined;

  const myDraw = latest
    ? await first(
        db.select().from(schema.draw).where(eq(schema.draw.id, latest.drawId)),
      )
    : undefined;

  // The person this user is gifting to, plus their wishlist. The dashboard
  // is authenticated, so we can show the match directly here regardless of
  // the draw's delivery mode (no token / preview limit applies).
  const receiver = latest
    ? await first(
        db
          .select()
          .from(schema.participant)
          .where(eq(schema.participant.id, latest.receiverId)),
      )
    : undefined;

  // Draws whose full pairing list has been made public.
  const visiblePairings = await getVisiblePairings();

  // This participant's own match history (always visible to themselves).
  const myHistory = participant ? await getMyMatchHistory(participant.id) : [];
  // Older matches beyond the current "ready" card up top.
  const pastMatches = myHistory.filter((m) => m.drawId !== latest?.drawId);

  return (
    <HolidayShell contentId="dashboard-content">
      <HolidayPageHeader
        title={<>Здравствуйте, {user.name}!</>}
        icon={<Gift className="size-6" />}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/garland">Гирлянда</Link>
            </Button>
            {(admin || !!staff?.scopes.length) && (
              <Button asChild variant="outline" size="sm">
                <Link href="/coordinator">Координатор</Link>
              </Button>
            )}
            {admin && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">Организатор</Link>
              </Button>
            )}
            <SignOutButton />
          </>
        }
      />
      <main id="dashboard-content" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Моё участие</CardTitle>
            <CardDescription>
              Лимит подарка: {config.budget} ₽. Отправить до{" "}
              {config.sendDeadline.split("-").reverse().join(".")}, получить до{" "}
              {config.receiveDeadline.split("-").reverse().join(".")}. Участие
              добровольное.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {participant && (
              <ParticipationForm
                participant={participant}
                locked={!!latest || !!incoming}
                open={config.registrationOpen}
                sites={sites}
              />
            )}
          </CardContent>
        </Card>

        {latest && myDraw && receiver && (
          <Card>
            <CardHeader>
              <CardTitle>Ваш получатель уже определён 🎉</CardTitle>
              <CardDescription>
                {myDraw.name}: ваш получатель и данные для передачи подарка.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RecipientDetails
                person={receiver}
                local={participant?.track === "local"}
              />
              {myDraw.budget != null && (
                <p className="text-sm text-muted-foreground">
                  Бюджет: <span className="font-medium">{myDraw.budget}</span>
                </p>
              )}

              <GiftActions
                id={latest.id}
                mode="giver"
                sent={!!latest.sentAt}
                received={!!latest.receivedAt}
                reserveState={latest.reserveState}
              />
              {latest.deliveryNote && (
                <p className="text-sm">Передача: {latest.deliveryNote}</p>
              )}
            </CardContent>
          </Card>
        )}

        {incoming && (
          <Card>
            <CardHeader>
              <CardTitle>Мой входящий подарок</CardTitle>
              <CardDescription>
                Имя вашего Санты остаётся в тайне. Только получатель или
                координатор может подтвердить получение.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {incoming.deliveryNote && (
                <p className="text-sm">Как получить: {incoming.deliveryNote}</p>
              )}
              <GiftActions
                id={incoming.id}
                mode="receiver"
                sent={!!incoming.sentAt || !!incoming.reserveSentAt}
                received={!!incoming.receivedAt}
                reserveState={incoming.reserveState}
              />
            </CardContent>
          </Card>
        )}
        {reserveTasks
          .filter((t) => !t.receivedAt)
          .map((task) => {
            const person = reservePeople.find((p) => p.id === task.receiverId);
            return (
              <Card key={task.id}>
                <CardHeader>
                  <CardTitle>Задание Санта-резерва</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {person && (
                    <RecipientDetails
                      person={person}
                      local={person.track === "local"}
                    />
                  )}
                  {task.reserveSentAt ? (
                    <p className="text-sm">
                      Резервный подарок подготовлен / отправлен. Ждём
                      подтверждения получателя.
                    </p>
                  ) : (
                    <GiftActions
                      id={task.id}
                      mode="reserve"
                      sent={!!task.sentAt}
                      received={false}
                      reserveState={task.reserveState}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        {pastMatches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Мои прошлые жеребьёвки 🎄</CardTitle>
              <CardDescription>
                Кому вы дарили подарки в предыдущих жеребьёвках.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {pastMatches.map((m) => (
                  <li
                    key={m.drawId}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span>
                      <span className="font-medium">{m.drawName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(m.date).toLocaleDateString("ru-RU")}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="text-muted-foreground">→ </span>
                      <span className="font-medium">{m.receiver}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {visiblePairings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Опубликованные результаты 📜</CardTitle>
              <CardDescription>
                Организатор открыл результаты этих жеребьёвок. Выберите
                жеребьёвку, чтобы посмотреть назначения.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PairingsCards pairings={visiblePairings} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Мои пожелания</CardTitle>
            <CardDescription>
              Ваш Тайный Санта увидит этот список. Поделитесь идеями для
              подарка.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WishlistEditor initial={wishlist} />
          </CardContent>
        </Card>

        {participant && (
          <Card>
            <CardHeader>
              <CardTitle>Контактный телефон</CardTitle>
              <CardDescription>
                Номер телефона, указанный при регистрации. При необходимости его
                можно обновить.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PhoneEditor
                participantId={participant.id}
                initialPhone={participant.phone}
              />
            </CardContent>
          </Card>
        )}
      </main>
    </HolidayShell>
  );
}
