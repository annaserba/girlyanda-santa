import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Phone helpers. Numbers are stored in international format,
 * digits only, no `+` — the country dial code immediately followed by the
 * subscriber number, e.g. `79991234567`.
 *
 * New input is Russian-only. Legacy dial codes remain available for displaying
 * existing contacts without rewriting saved data.
 */

export interface DialCode {
  /** country name shown in the picker */
  label: string;
  /** numeric dial code, digits only, no leading `+` */
  code: string;
  /**
   * ISO 3166-1 alpha-2 code, lowercase. Drives the SVG flag via the
   * flag-icons class `fi fi-${iso2}` (renders on desktop, unlike emoji
   * regional-indicator flags which Windows browsers don't support).
   */
  iso2: string;
}

/**
 * Legacy dial codes, retained for displaying already stored numbers.
 * New input is restricted by normalizeRussianPhone(). When several
 * countries share a dial code (e.g. +1, +44, +7) the first entry wins as
 * the displayed flag.
 */
export const DIAL_CODES: DialCode[] = [
  { label: "Португалия", code: "351", iso2: "pt" },
  { label: "Бразилия", code: "55", iso2: "br" },
  { label: "Испания", code: "34", iso2: "es" },
  { label: "Франция", code: "33", iso2: "fr" },
  { label: "Германия", code: "49", iso2: "de" },
  { label: "Италия", code: "39", iso2: "it" },
  { label: "Великобритания", code: "44", iso2: "gb" },
  { label: "Ирландия", code: "353", iso2: "ie" },
  { label: "Нидерланды", code: "31", iso2: "nl" },
  { label: "Бельгия", code: "32", iso2: "be" },
  { label: "Швейцария", code: "41", iso2: "ch" },
  { label: "Австрия", code: "43", iso2: "at" },
  { label: "Люксембург", code: "352", iso2: "lu" },
  { label: "Дания", code: "45", iso2: "dk" },
  { label: "Швеция", code: "46", iso2: "se" },
  { label: "Норвегия", code: "47", iso2: "no" },
  { label: "Финляндия", code: "358", iso2: "fi" },
  { label: "Польша", code: "48", iso2: "pl" },
  { label: "Чехия", code: "420", iso2: "cz" },
  { label: "Греция", code: "30", iso2: "gr" },
  { label: "Румыния", code: "40", iso2: "ro" },
  { label: "Украина", code: "380", iso2: "ua" },
  { label: "Россия", code: "7", iso2: "ru" },
  { label: "Турция", code: "90", iso2: "tr" },
  { label: "США / Канада", code: "1", iso2: "us" },
  { label: "Мексика", code: "52", iso2: "mx" },
  { label: "Аргентина", code: "54", iso2: "ar" },
  { label: "Чили", code: "56", iso2: "cl" },
  { label: "Колумбия", code: "57", iso2: "co" },
  { label: "Ангола", code: "244", iso2: "ao" },
  { label: "Мозамбик", code: "258", iso2: "mz" },
  { label: "Кабо-Верде", code: "238", iso2: "cv" },
  { label: "ЮАР", code: "27", iso2: "za" },
  { label: "Индия", code: "91", iso2: "in" },
  { label: "Китай", code: "86", iso2: "cn" },
  { label: "Япония", code: "81", iso2: "jp" },
  { label: "Южная Корея", code: "82", iso2: "kr" },
  { label: "Австралия", code: "61", iso2: "au" },
  { label: "ОАЭ", code: "971", iso2: "ae" },
];

/** Look up the first dial-code entry whose numeric code matches. */
export function dialCodeInfo(code: string): DialCode | undefined {
  const c = digitsOnly(code);
  return DIAL_CODES.find((d) => d.code === c);
}

/** Default dial code for new numbers (matches the original placeholder). */
export const DEFAULT_DIAL_CODE = "7";

/** Strip everything that isn't a digit. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

export const RUSSIAN_PHONE_ERROR =
  "Введите корректный номер телефона РФ: +7 и 10 цифр.";

/** Validate the numbering plan, not just +7 (which is shared with Kazakhstan). */
export function normalizeRussianPhone(input: string): string | null {
  const value = input.trim();
  if (!/^\+?[\d\s().-]+$/.test(value)) return null;

  let digits = digitsOnly(value);
  if (!value.startsWith("+")) {
    if (digits.length === 10) digits = `7${digits}`;
    else if (digits.length === 11 && digits.startsWith("8"))
      digits = `7${digits.slice(1)}`;
  }
  if (!/^7\d{10}$/.test(digits)) return null;

  const phone = parsePhoneNumberFromString(`+${digits}`);
  return phone?.country === "RU" && phone.isValid() ? digits : null;
}

/**
 * Split a stored number into a known dial code + local number. Picks the
 * longest matching code from {@link DIAL_CODES}; falls back to
 * {@link DEFAULT_DIAL_CODE} with the whole thing as the local number when
 * nothing matches.
 */
export function splitPhone(stored: string | null | undefined): {
  code: string;
  number: string;
} {
  const digits = digitsOnly(stored ?? "");
  if (!digits) return { code: DEFAULT_DIAL_CODE, number: "" };

  const match = [...DIAL_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((d) => digits.startsWith(d.code));

  if (match) {
    return { code: match.code, number: digits.slice(match.code.length) };
  }
  return { code: DEFAULT_DIAL_CODE, number: digits };
}

/** Join a dial code + local number into the stored format, digits only. */
export function joinPhone(code: string, number: string): string {
  return `${digitsOnly(code)}${digitsOnly(number)}`;
}

/**
 * Format a stored phone number for display: "+351 968 392 900".
 * The local number is split into groups of 3 digits separated by spaces.
 */
export function formatPhone(stored: string | null | undefined): string {
  if (!stored) return "";
  const { code, number } = splitPhone(stored);
  const formatted = number.replace(/(\d{3})(?=\d)/g, "$1 ");
  return `+${code} ${formatted}`;
}
