import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { auth } from "@/lib/auth";
import { russianPhoneSchema } from "@/lib/phone-schema";
import { authErrorMessage } from "@/lib/auth-errors";
import { registrationCitySchema } from "@/lib/registration-city-schema";

const signupSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8),
  phone: russianPhoneSchema,
  city: registrationCitySchema,
});

export async function POST(req: NextRequest) {
  const parsed = signupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues.find((issue) => issue.path[0] === "phone")
            ?.message ??
          parsed.error.issues.find((issue) => issue.path[0] === "city")
            ?.message ??
          "Проверьте введённые данные.",
      },
      { status: 400 },
    );
  }

  const { name, email, password, phone, city } = parsed.data;

  // Create the user via better-auth (nextCookies plugin sets cookies automatically).
  let userId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
    });
    userId = result?.user?.id;
  } catch (err: unknown) {
    const message = authErrorMessage(
      err,
      "Не удалось создать аккаунт. Проверьте данные или попробуйте позже.",
    );
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json(
      { error: "Не удалось создать аккаунт." },
      { status: 500 },
    );
  }

  // Phone/email are not verified ownership proofs. Never let a new account
  // claim an imported participant and secret result by guessing their phone.
  // The organiser may link accounts explicitly after an identity check.
  await db
    .insert(schema.participant)
    .values({ userId, name, email, phone, city });

  return NextResponse.json({ ok: true });
}
