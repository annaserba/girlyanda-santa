import type { Metadata } from "next";
import "./globals.css";
import "flag-icons/css/flag-icons.min.css";
import "react-day-picker/style.css";
import { getOgSettings } from "@/lib/settings";
import { SITE_ICONS } from "@/lib/site-icon";

export async function generateMetadata(): Promise<Metadata> {
  const og = await getOgSettings();
  const images = og.banner ? [{ url: og.banner }] : undefined;
  return {
    title: og.title,
    description: og.description,
    icons: {
      icon: [
        { url: SITE_ICONS.favicon, sizes: "32x32", type: "image/png" },
        { url: SITE_ICONS.small, sizes: "192x192", type: "image/png" },
      ],
      shortcut: SITE_ICONS.favicon,
      apple: { url: SITE_ICONS.apple, sizes: "180x180", type: "image/png" },
    },
    openGraph: {
      locale: "ru_RU",
      title: og.title,
      description: og.description,
      images,
    },
    twitter: {
      card: og.banner ? "summary_large_image" : "summary",
      title: og.title,
      description: og.description,
      images: og.banner ? [og.banner] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
