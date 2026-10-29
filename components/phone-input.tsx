"use client";
import "react-phone-number-input/style.css";
import ruLabels from "react-phone-number-input/locale/ru.json";
import type { Value } from "react-phone-number-input";
import { PhoneInput as ReuiPhoneInput } from "@/components/reui/phone-input";
import { digitsOnly, normalizeRussianPhone } from "@/lib/phone";

/**
 * App phone field. Thin wrapper around the ReUI phone input that keeps the
 * app's storage contract: `value`/`onChange` are international digits only,
 * no `+` (e.g. "79991234567"), while the ReUI component works in E.164.
 * Country and dial code are fixed; final numbering-plan validation is server-side.
 */
export function PhoneInput({
  value,
  onChange,
  required,
  id,
  placeholder = "Номер телефона РФ",
}: {
  value: string;
  onChange: (stored: string) => void;
  required?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const e164 = value ? (`+${digitsOnly(value)}` as Value) : undefined;

  return (
    <ReuiPhoneInput
      international
      defaultCountry="RU"
      countries={["RU"]}
      addInternationalOption={false}
      countryCallingCodeEditable={false}
      countrySelectProps={{ disabled: true }}
      labels={ruLabels}
      value={e164}
      required={required}
      id={id}
      aria-label="Телефон РФ"
      autoComplete="tel"
      placeholder={placeholder}
      onChange={(v) => onChange(digitsOnly(v ?? ""))}
      onPaste={(event) => {
        const phone = normalizeRussianPhone(
          event.clipboardData.getData("text"),
        );
        if (phone) {
          event.preventDefault();
          onChange(phone);
        }
      }}
    />
  );
}
