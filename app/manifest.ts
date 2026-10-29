import type { MetadataRoute } from "next";
import { SITE_ICONS } from "@/lib/site-icon";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Гирлянда Тайного Санты",
    short_name: "Тайный Санта",
    description:
      "Новогодний обмен подарками между коллегами: жеребьёвка, пожелания и личный кабинет.",
    lang: "ru",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: SITE_ICONS.small,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: SITE_ICONS.large,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
