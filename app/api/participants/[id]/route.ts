import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, first, schema } from "@/lib/db";
import { badRequest, requireAdmin } from "@/lib/api";
import { optionalRussianPhoneSchema } from "@/lib/phone-schema";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: optionalRussianPhoneSchema,
  // Associate (or clear, with null) the participant with a user account.
  userId: z.string().min(1).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const id = Number((await params).id);
  if (Number.isNaN(id)) return badRequest("Некорректный идентификатор.");

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest(
      parsed.error.issues.find((issue) => issue.path[0] === "phone")?.message ??
        "Проверьте введённые данные.",
    );

  // When linking to a user account, validate the user exists and isn't
  // already tied to a different participant (one participant per user).
  if (parsed.data.userId) {
    const userId = parsed.data.userId;
    const userExists = await first(
      db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, userId)),
    );
    if (!userExists) return badRequest("Такого аккаунта не существует.");

    const taken = await first(
      db
        .select({ id: schema.participant.id })
        .from(schema.participant)
        .where(
          and(
            eq(schema.participant.userId, userId),
            ne(schema.participant.id, id),
          ),
        ),
    );
    if (taken) {
      return badRequest("Этот аккаунт уже привязан к другому участнику.");
    }
  }

  const updated = await first(
    db
      .update(schema.participant)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.phone !== undefined
          ? { phone: parsed.data.phone || null }
          : {}),
        ...(parsed.data.userId !== undefined
          ? { userId: parsed.data.userId }
          : {}),
      })
      .where(eq(schema.participant.id, id))
      .returning(),
  );

  if (!updated) return badRequest("Участник не найден.");
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const id = Number((await params).id);
  if (Number.isNaN(id)) return badRequest("Некорректный идентификатор.");

  const assigned = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(2026, 1)`);
    const gift = await first(
      tx
        .select({ id: schema.assignment.id })
        .from(schema.assignment)
        .where(
          or(
            eq(schema.assignment.giverId, id),
            eq(schema.assignment.receiverId, id),
            eq(schema.assignment.reserveVolunteerId, id),
          ),
        )
        .limit(1),
    );
    if (gift) return true;
    await tx.delete(schema.participant).where(eq(schema.participant.id, id));
    return false;
  });
  if (assigned)
    return badRequest(
      "Участник уже связан с подарками. Удаление разрушит гирлянду; обратитесь к организатору для замены через резерв.",
    );
  return NextResponse.json({ ok: true });
}
