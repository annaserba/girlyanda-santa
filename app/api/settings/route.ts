import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, requireAdmin } from "@/lib/api";
import { getOgSettings, setOgSettings } from "@/lib/settings";

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  return NextResponse.json(await getOgSettings());
}

// The optional banner URL may be empty to clear it. The icon is bundled.
const urlOrEmpty = z.union([z.literal(""), z.string().url()]);

const bodySchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    banner: urlOrEmpty.optional(),
  })
  .strict();

export async function PUT(req: NextRequest) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(
      "Проверьте название, описание и ссылку на изображение для предпросмотра.",
    );
  }

  await setOgSettings(parsed.data);
  return NextResponse.json(await getOgSettings());
}
