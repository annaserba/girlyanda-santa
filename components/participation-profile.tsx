"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type { Participant } from "@/lib/db/schema";
import type { SiteOption } from "@/lib/work-sites";
import { ParticipationForm } from "@/components/participation-form";
import { Button } from "@/components/ui/button";

export function ParticipationProfile({
  participant,
  locked,
  open,
  sites = [],
}: {
  participant: Participant;
  locked: boolean;
  open: boolean;
  sites?: SiteOption[];
}) {
  const [saved, setSaved] = useState(participant);
  const [editing, setEditing] = useState(
    !participant.track && !participant.consentAt,
  );
  const [message, setMessage] = useState("");
  useEffect(() => setSaved(participant), [participant]);

  const canEdit = !locked && (open || !!saved.consentAt);
  const hasProfile = !!saved.track || !!saved.consentAt;
  if (editing && canEdit)
    return (
      <ParticipationForm
        participant={saved}
        locked={false}
        open={open}
        sites={sites}
        onSaved={(updated) => {
          setSaved(updated);
          setEditing(false);
          setMessage("Анкета сохранена.");
        }}
        onCancel={hasProfile ? () => setEditing(false) : undefined}
      />
    );

  const fields = [
    ["ФИО получателя", saved.name],
    ["Город", saved.city],
    ["Трек", saved.track === "country" ? "Через всю страну" : "Рядом"],
    ["Площадка", saved.site || "Не указана"],
    ["Смена", saved.shift || "Не указана"],
    ...(saved.track === "country"
      ? [["Пункт выдачи", saved.pickupPoint || "Не указан"]]
      : []),
    ["Пара пожеланий", saved.wishes || "Не указаны"],
    ["Санта-резерв", saved.reserveVolunteer ? "Готов(а) помочь" : "Нет"],
    ["Согласие на участие", saved.consentAt ? "Подтверждено" : "Не дано"],
  ];

  return (
    <section aria-labelledby="my-profile-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="my-profile-title" className="font-medium">
          {hasProfile ? "Ваша анкета" : "Анкета ещё не подана"}
        </h3>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setMessage("");
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" />
            {hasProfile ? "Редактировать анкету" : "Заполнить анкету"}
          </Button>
        )}
      </div>
      {hasProfile && (
        <>
          <p className="text-sm font-medium text-primary">
            {saved.consentAt
              ? "Участие подтверждено"
              : "Участие не подтверждено"}
          </p>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.map(([label, value]) => (
              <div key={label} className="min-w-0 space-y-1">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <p className="text-sm text-muted-foreground">
        {locked
          ? "Жеребьёвка проведена. Анкета доступна для просмотра. Для исправлений обратитесь к организатору."
          : canEdit
            ? "До жеребьёвки можно изменить анкету или отказаться от участия: снимите согласие и сохраните изменения."
            : "Приём новых анкет закрыт."}
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
