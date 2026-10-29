import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, first, schema } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { staffAccess, managesSite } from "@/lib/staff";
import { mayUpdateGift } from "@/lib/gift-rules";

const bodySchema = z.object({
  action: z.enum([
    "sent",
    "received",
    "request_reserve",
    "assign_reserve",
    "reserve_sent",
  ]),
  kind: z.enum(["physical", "skill", "certificate"]).optional(),
  note: z.string().trim().max(1000).optional(),
  volunteerId: z.number().int().positive().optional(),
});
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await staffAccess();
  if (!access)
    return NextResponse.json(
      { error: "Сначала войдите в аккаунт." },
      { status: 401 },
    );
  const id = Number((await params).id);
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!Number.isSafeInteger(id) || id < 1 || !body.success)
    return badRequest("Проверьте действие с подарком.");
  const cfg = body.data;
  const result = await db.transaction(async (tx) => {
    const [gift] = await tx
      .select()
      .from(schema.assignment)
      .where(eq(schema.assignment.id, id))
      .for("update");
    if (!gift) return { error: "Подарок не найден.", status: 404 };
    const participants = await tx.select().from(schema.participant);
    const giver = participants.find((p) => p.id === gift.giverId)!;
    const receiver = participants.find((p) => p.id === gift.receiverId)!;
    const volunteer = participants.find(
      (p) => p.id === gift.reserveVolunteerId,
    );
    const rights = {
      giver: giver.userId === access.user.id,
      receiver: receiver.userId === access.user.id,
      giverStaff: managesSite(access, giver),
      receiverStaff: managesSite(access, receiver),
      reserve: volunteer?.userId === access.user.id,
    };
    if (!mayUpdateGift(cfg.action, rights))
      return { error: "У вас нет доступа к этому действию.", status: 403 };
    if (gift.receivedAt)
      return cfg.action === "received"
        ? null
        : { error: "Получение уже подтверждено.", status: 409 };
    let change: Partial<typeof schema.assignment.$inferInsert> = {};
    if (cfg.action === "sent") {
      if (gift.sentAt) return null;
      change = {
        sentAt: new Date(),
        giftKind: cfg.kind ?? gift.giftKind,
        deliveryNote: cfg.note ?? gift.deliveryNote,
      };
    } else if (cfg.action === "received") {
      change = {
        receivedAt: new Date(),
        reserveState: gift.reserveState === "none" ? "none" : "resolved",
      };
    } else if (cfg.action === "request_reserve") {
      if (gift.reserveState !== "none") return null;
      change = { reserveState: "requested" };
    } else if (cfg.action === "assign_reserve") {
      if (gift.reserveState === "assigned")
        return { error: "Помощник уже назначен.", status: 409 };
      if (gift.reserveState !== "requested")
        return { error: "Сначала создайте запрос в резерв.", status: 409 };
      const chosen = participants.find((p) => p.id === cfg.volunteerId);
      if (
        !chosen?.consentAt ||
        !chosen.reserveVolunteer ||
        chosen.id === receiver.id
      )
        return {
          error: "Выберите добровольца резерва, кроме самого получателя.",
          status: 400,
        };
      change = { reserveState: "assigned", reserveVolunteerId: chosen.id };
    } else {
      if (gift.reserveState !== "assigned")
        return { error: "Помощник резерва ещё не назначен.", status: 409 };
      if (gift.reserveSentAt) return null;
      change = {
        reserveSentAt: new Date(),
        deliveryNote: cfg.note ?? gift.deliveryNote,
        giftKind: cfg.kind ?? gift.giftKind,
      };
    }
    await tx
      .update(schema.assignment)
      .set(change)
      .where(eq(schema.assignment.id, id));
    await tx
      .insert(schema.giftAudit)
      .values({
        assignmentId: id,
        actorId: access.user.id,
        action: cfg.action,
      });
    return null;
  });
  return result
    ? NextResponse.json({ error: result.error }, { status: result.status })
    : NextResponse.json({ ok: true });
}
