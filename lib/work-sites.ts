import { canonical } from "./event-config";

export interface SiteOption {
  id: number;
  city: string;
  name: string;
}

export function cleanSiteName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function searchSites(options: SiteOption[], city: string, query = "") {
  const cityKey = canonical(city);
  const text = canonical(query);
  return options
    .filter(
      (site) =>
        canonical(site.city) === cityKey && canonical(site.name).includes(text),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
}
