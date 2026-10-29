import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { sameSite } from "@/lib/event-config";

export async function staffAccess() {
  const user = await getCurrentUser();
  if (!user) return null;
  const scopes =
    user.role === "admin"
      ? []
      : await db
          .select()
          .from(schema.coordinatorScope)
          .where(eq(schema.coordinatorScope.userId, user.id));
  return { user, admin: user.role === "admin", scopes };
}
export function managesSite(
  access: NonNullable<Awaited<ReturnType<typeof staffAccess>>>,
  participant: { city: string; site: string },
) {
  return access.admin || access.scopes.some((s) => sameSite(s, participant));
}
