import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { db, schema } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { getOgSettings } from "@/lib/settings";
import { getAllPairings } from "@/lib/pairings";
import { Button } from "@/components/ui/button";
import { AdminPanel } from "@/components/admin-panel";
import { getEventConfig } from "@/lib/event-settings";
import { HolidayPageHeader, HolidayShell } from "@/components/holiday-shell";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdmin())) redirect("/dashboard");

  const participants = await db.select().from(schema.participant);
  const exclusions = await db.select().from(schema.exclusion);
  const users = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.user);
  const og = await getOgSettings();
  const pairings = await getAllPairings();
  const eventConfig = await getEventConfig();
  const scopes = await db.select().from(schema.coordinatorScope);

  return (
    <HolidayShell contentId="admin-content" skipLabel="К управлению событием">
      <HolidayPageHeader
        title="Кабинет организатора"
        icon={<ShieldCheck className="size-6" />}
        actions={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="admin-holiday-account"
          >
            <Link href="/dashboard">Мой кабинет</Link>
          </Button>
        }
      />

      <main id="admin-content">
        <AdminPanel
          participants={participants}
          exclusions={exclusions}
          pairings={pairings}
          users={users}
          og={og}
          eventConfig={eventConfig}
          scopes={scopes}
        />
      </main>
    </HolidayShell>
  );
}
