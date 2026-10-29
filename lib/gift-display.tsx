import type { Participant } from "@/lib/db/schema";
import { formatPhone } from "@/lib/phone";
export function RecipientDetails({
  person,
  local,
}: {
  person: Participant;
  local: boolean;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-lg font-semibold">{person.name}</p>
      <p>
        {person.city}, {person.site}
        {person.shift ? `, смена ${person.shift}` : ""}
      </p>
      {person.phone && <p>Контакт для передачи: {formatPhone(person.phone)}</p>}
      <p>
        {local
          ? "Передайте из рук в руки на площадке."
          : `Пункт выдачи: ${person.pickupPoint || "уточните у координатора"}`}
      </p>
      {!local && (
        <p className="text-muted-foreground">
          Подарок из своего региона и открытка «откуда это». Данные для
          оформления доставки при необходимости уточните через координатора.
        </p>
      )}
      <p className="whitespace-pre-wrap">
        Пожелания: {person.wishes || "не указаны"}
      </p>
    </div>
  );
}
