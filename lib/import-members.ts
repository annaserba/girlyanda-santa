import { z } from "zod";
import { canonical, profileSchema } from "./event-config";

export const importMemberSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.union([z.literal(""), z.string().trim().email().toLowerCase()]),
  })
  .and(profileSchema);
export function parseMemberList(text: string) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const fields = line.split(";").map((f) => f.trim());
      if (fields.length !== 8)
        throw new Error(
          `Строка ${index + 1}: требуется 8 полей, разделённых точкой с запятой.`,
        );
      const [name, email, city, site, shift, trackText, pickupPoint, wishes] =
        fields;
      const track =
        canonical(trackText) === "рядом"
          ? "local"
          : ["страна", "через всю страну", "country"].includes(
                canonical(trackText),
              )
            ? "country"
            : trackText;
      const parsed = importMemberSchema.safeParse({
        name,
        email,
        city,
        site,
        shift,
        track,
        pickupPoint,
        wishes,
        consent: true,
        reserveVolunteer: false,
      });
      if (!parsed.success)
        throw new Error(
          `Строка ${index + 1}: проверьте имя, почту, город, площадку (обязательна для «Рядом»), трек, ПВЗ и пожелания.`,
        );
      return parsed.data;
    });
}
export function memberIdentity(p: {
  name: string;
  city: string;
  site: string;
  shift: string;
}) {
  return JSON.stringify([p.name, p.city, p.site, p.shift].map(canonical));
}
