"use client";

import { useState, type ReactNode, type MouseEvent } from "react";
import {
  adminCityKey,
  filterAdminGarlandPeople,
  type AdminGarlandPerson,
  type AdminGarlandGift,
} from "@/lib/admin-garland";

const PAGE_SIZE = 50;
export function AdminGarlandView({
  children,
  people,
  gifts,
  phase,
}: {
  children: ReactNode;
  people: AdminGarlandPerson[];
  gifts: AdminGarlandGift[];
  phase: "registration" | "gifts";
}) {
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const cities = [
    ...new Map(
      people.map((p) => [adminCityKey(p.city), p.city || "Город не указан"]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ru-RU"));
  const filtered = filterAdminGarlandPeople(people, city, search);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const byId = new Map(people.map((p) => [p.id, p]));
  const incoming = new Map(gifts.map((gift) => [gift.receiverId, gift]));
  const outgoing = new Map(gifts.map((gift) => [gift.giverId, gift]));
  function chooseCity(value: string) {
    setCity(value);
    setSearch("");
    setPage(1);
  }
  function clickCity(event: MouseEvent<HTMLDivElement>) {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !(event.target instanceof Element)
    )
      return;
    const link = event.target.closest("a[data-admin-city]");
    const selected = link?.getAttribute("data-admin-city");
    if (!selected) return;
    event.preventDefault();
    chooseCity(adminCityKey(selected));
    const details = document.getElementById("garland-participants");
    details?.scrollIntoView({ block: "start" });
    details?.focus({ preventScroll: true });
  }
  return (
    <section
      className="garland-admin-overview space-y-5"
      aria-labelledby="admin-garland-heading"
    >
      <h2 id="admin-garland-heading" className="text-2xl font-semibold">
        Участники и подарки по городам
      </h2>
      <p className="garland-admin-note">
        Выберите город на карте или в списке, чтобы увидеть ФИО и пары
        участников.
      </p>
      <div onClick={clickCity}>{children}</div>
      <section aria-labelledby="garland-participants" className="space-y-4">
        <h2
          id="garland-participants"
          tabIndex={-1}
          className="text-xl font-semibold"
        >
          Участники гирлянды
        </h2>
        <div className="garland-admin-controls">
          <label htmlFor="admin-garland-city">
            Город
            <select
              id="admin-garland-city"
              value={city}
              onChange={(e) => chooseCity(e.target.value)}
            >
              <option value="">Все города</option>
              {cities.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="admin-garland-search">
            ФИО или площадка
            <input
              id="admin-garland-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Найти участника"
              autoComplete="off"
            />
          </label>
        </div>
        <p role="status" className="garland-admin-note">
          Показано {filtered.length ? (current - 1) * PAGE_SIZE + 1 : 0}–
          {Math.min(current * PAGE_SIZE, filtered.length)} из {filtered.length}.
          Всего участников: {people.length}.
        </p>
        <div className="garland-admin-grid">
          {filtered
            .slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
            .map((person) => {
              const received = incoming.get(person.id);
              const sent = outgoing.get(person.id);
              return (
                <article
                  key={person.id}
                  className="garland-admin-card space-y-3"
                >
                  <h3 className="text-lg font-semibold">{person.name}</h3>
                  <p className="garland-admin-note">
                    {person.city || "Город не указан"}
                    {person.site ? `, ${person.site}` : ""}
                    {person.shift ? `, смена ${person.shift}` : ""}
                  </p>
                  <p>
                    Трек:{" "}
                    {person.track === "country"
                      ? "Через всю страну"
                      : person.track === "local"
                        ? "Рядом"
                        : "Не выбран"}
                  </p>
                  {phase === "gifts" ? (
                    <dl className="garland-admin-pairs">
                      <div>
                        <dt>Санта</dt>
                        <dd>
                          {received
                            ? (byId.get(received.giverId)?.name ??
                              "Участник не найден")
                            : "Не назначен"}
                        </dd>
                      </div>
                      <div>
                        <dt>Получатель</dt>
                        <dd>
                          {sent
                            ? (byId.get(sent.receiverId)?.name ??
                              "Участник не найден")
                            : "Не назначен"}
                        </dd>
                      </div>
                      <div>
                        <dt>Исходящий подарок</dt>
                        <dd>
                          {!sent
                            ? "Не назначен"
                            : sent.received
                              ? "Получен"
                              : sent.sent
                                ? "Отправлен"
                                : sent.reserveSent
                                  ? "Отправлен резервом"
                                  : "Пока не отправлен"}
                        </dd>
                      </div>
                      <div>
                        <dt>Входящий подарок</dt>
                        <dd>
                          {!received
                            ? "Не назначен"
                            : received.received
                              ? "Получен"
                              : received.reserveSent
                                ? "В пути — резерв"
                                : received.sent
                                  ? "В пути"
                                  : "Ожидает отправки"}
                        </dd>
                      </div>
                      {received && received.reserveState !== "none" && (
                        <div>
                          <dt>Резерв</dt>
                          <dd>
                            {received.reserveState === "requested"
                              ? "Запрошена помощь"
                              : received.reserveState === "assigned"
                                ? "Резерв назначен"
                                : "Вопрос решён"}
                          </dd>
                        </div>
                      )}
                    </dl>
                  ) : (
                    <p>Участие подтверждено. Жеребьёвка ещё не проведена.</p>
                  )}
                </article>
              );
            })}
        </div>
        {!filtered.length && (
          <p className="garland-admin-note">
            {people.length
              ? "Участники не найдены. Измените город или поиск."
              : "Подтверждённых анкет пока нет."}
          </p>
        )}
        {pages > 1 && (
          <nav
            className="garland-admin-pagination"
            aria-label="Страницы участников"
          >
            <button
              type="button"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              Назад
            </button>
            <span>
              Страница {current} из {pages}
            </span>
            <button
              type="button"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              Далее
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}
