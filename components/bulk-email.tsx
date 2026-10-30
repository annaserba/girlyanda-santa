"use client";

import { useEffect, useState } from "react";
import { Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildBulkMailto, parseRecipients } from "@/lib/bulk-email";
import { EVENT_DEFAULTS, type EventConfig } from "@/lib/event-config";

interface Props {
  addresses: string[];
  missingEmails: number;
  appUrl?: string;
  config?: EventConfig;
}

const textareaClassName =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function BulkEmailComposer({
  addresses,
  missingEmails,
  appUrl = "",
  config = EVENT_DEFAULTS,
}: Props) {
  const [customRecipients, setCustomRecipients] = useState<string | null>(null);
  const [subject, setSubject] = useState(
    "Гирлянда Тайного Санты: результаты жеребьёвки",
  );
  const [body, setBody] = useState(
    `Здравствуйте!\n\nЖеребьёвка «Гирлянды Тайного Санты» завершена.\n\nЧтобы узнать своего получателя и его пожелания, войдите в личный кабинет:\n${appUrl.replace(/\/$/, "")}/dashboard\n\nИспользуйте свою учётную запись. Пожалуйста, сохраните имя получателя в тайне.\n\nОрганизаторы «Гирлянды Тайного Санты»`,
  );
  const [copyStatus, setCopyStatus] = useState("");
  const [currentUrl, setCurrentUrl] = useState(appUrl);
  useEffect(() => {
    const origin = window.location.origin;
    setCurrentUrl(origin);
    setBody((text) =>
      text.replace(
        `${appUrl.replace(/\/$/, "")}/dashboard`,
        `${origin}/dashboard`,
      ),
    );
  }, [appUrl]);
  const recipients = customRecipients ?? addresses.join("\n");
  const parsed = parseRecipients(recipients);
  const mailto = buildBulkMailto(recipients, subject, body);
  function template(kind: "invite" | "result" | "reminder" | "finale") {
    const base = currentUrl.replace(/\/$/, "");
    const texts = {
      invite: [
        "Гирлянда Тайного Санты: приглашаем участвовать",
        `Здравствуйте!\n\nУчастие добровольное. Зарегистрируйтесь и подтвердите анкету до ${config.registrationDeadline}:\n${base}/signup\n\nВыберите «Рядом» или «Через всю страну». Лимит подарка ${config.budget} ₽. Домашние адреса не собираем. Можно зарегистрироваться через координатора площадки.\n\nОрганизаторы «Гирлянды Тайного Санты»`,
      ],
      result: [
        "Гирлянда Тайного Санты: результаты жеребьёвки",
        `Здравствуйте!\n\nЖеребьёвка завершена. Ваш получатель, пожелания и место передачи доступны только в личном кабинете:\n${base}/dashboard\n\nОтправьте подарок до ${config.sendDeadline}, подтвердите получение до ${config.receiveDeadline}. Лимит ${config.budget} ₽. Сохраняйте имя получателя в тайне.\n\nОрганизаторы «Гирлянды Тайного Санты»`,
      ],
      reminder: [
        "Гирлянда Тайного Санты: напоминание о сроках",
        `Здравствуйте!\n\nОтправьте подарок до ${config.sendDeadline}. Получив подарок, отметьте это в кабинете до ${config.receiveDeadline}, чтобы зажечь огонёк. Если подарок не доходит, запросите помощь резерва.\n${base}/dashboard\n\nОрганизаторы «Гирлянды Тайного Санты»`,
      ],
      finale: [
        "Гирлянда Тайного Санты: итоги",
        `Здравствуйте!\n\nСпасибо за участие! Посмотрите, сколько огоньков зажглось на общей карте:\n${base}/#garland\n\nЕсли ещё не получили подарок, сообщите координатору или запросите помощь в кабинете.\n${base}/dashboard\n\nОрганизаторы «Гирлянды Тайного Санты»`,
      ],
    };
    setSubject(texts[kind][0]);
    setBody(texts[kind][1]);
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label}: скопировано.`);
    } catch {
      setCopyStatus(
        "Браузер не разрешил копирование. Выделите текст в соответствующем поле и скопируйте вручную.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Одно письмо всем участникам</CardTitle>
        <CardDescription>
          Подготовьте общее письмо в корпоративной почте. Адреса попадут в
          скрытую копию (BCC), а каждый участник увидит свой результат после
          входа в личный кабинет.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["invite", "Приглашение"],
              ["result", "Результаты"],
              ["reminder", "Напоминание"],
              ["finale", "Итоги"],
            ] as const
          ).map(([key, title]) => (
            <Button
              key={key}
              size="sm"
              variant="outline"
              onClick={() => template(key)}
            >
              {title}
            </Button>
          ))}
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p>
            Откроется почтовая программа по умолчанию. Выберите корпоративный
            ящик отправителя, проверьте письмо и нажмите «Отправить». Интернет и
            SMTP-настройки в приложении не требуются.
          </p>
          <p className="mt-2 text-muted-foreground">
            Всем придёт одинаковый текст. Не вставляйте сюда персональные
            результаты жеребьёвки или индивидуальные секретные ссылки.
          </p>
        </div>

        {missingEmails > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            У подтвердивших участие людей не указана доступная почта:{" "}
            {missingEmails}. Добавьте их корпоративные адреса в список ниже.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="bulk-recipients">
              Скрытая копия (BCC): {parsed.addresses.length} адресов
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!mailto}
              onClick={() => copy(parsed.addresses.join("; "), "Адреса BCC")}
            >
              <Copy /> Скопировать BCC
            </Button>
          </div>
          <textarea
            id="bulk-recipients"
            rows={5}
            className={textareaClassName}
            value={recipients}
            onChange={(event) => setCustomRecipients(event.target.value)}
            placeholder="ivan@example.invalid; anna@example.invalid"
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={parsed.invalid.length > 0}
            aria-describedby="bulk-recipients-help"
          />
          <p
            id="bulk-recipients-help"
            className="text-xs text-muted-foreground"
          >
            Адреса зарегистрированных участников подставлены автоматически.
            Можно вставить свой список через запятую, точку с запятой или с
            новой строки. Повторы удаляются. Ручные изменения сохраняются только
            до обновления страницы.
          </p>
          {parsed.invalid.length > 0 && (
            <p role="alert" className="break-words text-sm text-destructive">
              Исправьте адреса: {parsed.invalid.slice(0, 5).join(", ")}
              {parsed.invalid.length > 5 ? "…" : ""}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="bulk-subject">Тема</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copy(subject, "Тема")}
            >
              <Copy /> Скопировать тему
            </Button>
          </div>
          <Input
            id="bulk-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="bulk-body">Общий текст письма</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copy(body, "Текст письма")}
            >
              <Copy /> Скопировать текст
            </Button>
          </div>
          <textarea
            id="bulk-body"
            rows={10}
            className={textareaClassName}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Ссылки в шаблонах ведут на текущий сайт. Используйте адрес,
            доступный сотрудникам в контуре.
          </p>
          <p className="text-xs text-muted-foreground">
            Список рассылки не создаёт аккаунты. Чтобы увидеть результат,
            участник должен быть зарегистрирован и включён в жеребьёвку.
          </p>
        </div>

        {mailto && mailto.length > 2000 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Ссылка длинная и может не открыться в вашей почтовой программе. В
            таком случае создайте одно письмо вручную и скопируйте BCC, тему и
            текст кнопками выше. Допустимое количество адресатов в одном письме
            определяет корпоративный почтовый сервер.
          </p>
        )}

        {mailto ? (
          <Button asChild>
            <a href={mailto}>
              <Mail /> Открыть одно письмо ({parsed.addresses.length})
            </a>
          </Button>
        ) : (
          <Button type="button" disabled>
            <Mail /> Добавьте корректные адреса
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Приложение только подготавливает письмо и не получает подтверждения
          его отправки или доставки.
        </p>
        <p role="status" aria-live="polite" className="text-sm">
          {copyStatus}
        </p>
      </CardContent>
    </Card>
  );
}
