import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_ICONS } from "@/lib/site-icon";

export function FestiveShell({
  children,
  signedIn,
  organizer = false,
  siteTitle,
}: {
  children: ReactNode;
  signedIn: boolean;
  organizer?: boolean;
  siteTitle: string;
}) {
  return (
    <div className="festive-shell">
      <a className="festive-skip" href="#main-content">
        К содержимому
      </a>
      <header className="festive-header festive-container">
        <Link
          className="festive-brand"
          href="/"
          aria-label={`${siteTitle} — главная`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SITE_ICONS.small}
            width={42}
            height={42}
            alt=""
            className="festive-brand-icon"
          />
          <span>{siteTitle}</span>
        </Link>
        <nav className="festive-nav" aria-label="Основная навигация">
          <Link href="/#how">Как участвовать</Link>
          <Link href="/#garland">Карта гирлянды</Link>
          {organizer && <Link href="/garland">Карта организатора</Link>}
          {organizer && <Link href="/admin">Организатору</Link>}
          <Link
            className="festive-nav-account"
            href={signedIn ? "/dashboard" : "/login"}
          >
            {signedIn ? "Личный кабинет" : "Войти"}
          </Link>
        </nav>
      </header>
      <main id="main-content" className="festive-main festive-container">
        {children}
      </main>
      <footer className="festive-footer festive-container">
        <p>{siteTitle}</p>
        <p>Одна общая карта. Каждый полученный подарок — новый огонёк.</p>
      </footer>
    </div>
  );
}
