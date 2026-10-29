import Link from "next/link";
import { Gift } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AdminHolidayLights } from "@/components/admin-holiday-lights";
import { HolidayThemeProvider } from "@/components/holiday-theme";

export function HolidayShell({
  children,
  contentId,
  auth = false,
  skipLabel = "К основному содержимому",
}: {
  children: ReactNode;
  contentId: string;
  auth?: boolean;
  skipLabel?: string;
}) {
  return (
    <HolidayThemeProvider>
      <div
        className={cn("admin-holiday holiday-theme", auth && "holiday-auth")}
      >
        <a className="admin-holiday-skip" href={"#" + contentId}>
          {skipLabel}
        </a>
        <AdminHolidayLights />
        <div
          className={cn(
            "admin-holiday-container",
            auth && "holiday-auth-container",
          )}
        >
          {auth && (
            <header className="holiday-auth-brand">
              <Link href="/" aria-label="Гирлянда Тайного Санты — на главную">
                <span className="admin-holiday-emblem" aria-hidden="true">
                  <Gift className="size-6" />
                </span>
                <span>Гирлянда Тайного Санты</span>
              </Link>
              <p>Праздник начинается с маленького доброго дела</p>
            </header>
          )}
          {children}
          {auth && (
            <p className="holiday-auth-back">
              <Link href="/">На главную</Link>
            </p>
          )}
        </div>
      </div>
    </HolidayThemeProvider>
  );
}

export function HolidayPageHeader({
  title,
  icon,
  actions,
}: {
  title: ReactNode;
  icon: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-holiday-header">
      <div className="admin-holiday-identity">
        <span className="admin-holiday-emblem" aria-hidden="true">
          {icon}
        </span>
        <div className="holiday-header-text">
          <p className="admin-holiday-kicker">Гирлянда Тайного Санты</p>
          <h1>{title}</h1>
        </div>
      </div>
      {actions && (
        <nav className="holiday-header-actions" aria-label="Навигация кабинета">
          {actions}
        </nav>
      )}
    </header>
  );
}
