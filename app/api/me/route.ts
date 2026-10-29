import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, first, schema } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { getOrCreateParticipant } from "@/lib/session";
import { optionalRussianPhoneSchema } from "@/lib/phone-schema";

const schemaBody = z.object({
  phone: optionalRussianPhoneSchema,
});

export async function PUT(req: NextRequest) {
  const participant = await getOrCreateParticipant();
  if (!participant) {
    return NextResponse.json(
      { error: "Сначала войдите в аккаунт." },
      { status: 401 },
    );
  }

  const parsed = schemaBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return badRequest(
      parsed.error.issues.find((issue) => issue.path[0] === "phone")?.message ??
        "Проверьте введённые данные.",
    );

  const updated = await first(
    db
      .update(schema.participant)
      .set({ phone: parsed.data.phone || null })
      .where(eq(schema.participant.id, participant.id))
      .returning(),
  );

  return NextResponse.json(updated);
}
