import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getEventConfig } from "@/lib/event-settings";
import { getGarlandSnapshot } from "@/lib/garland-snapshot";
import { GarlandOverview } from "@/components/garland-overview";
import { FestiveShell } from "@/components/festive-shell";
import { getOgSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, config, appearance] = await Promise.all([
    getCurrentUser(),
    getEventConfig(),
    getOgSettings(),
  ]);
  const snapshot =
    config.mapPublished || user ? await getGarlandSnapshot(config) : null;
  const dateLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const dates = [
    { title: "Анкеты до", date: config.registrationDeadline },
    { title: "Жеребьёвка", date: config.drawDate },
    { title: "Отправляем до", date: config.sendDeadline },
    { title: "Получаем до", date: config.receiveDeadline },
  ];
  const steps = [
    {
      title: "Заполните анкету",
      text: "Выберите трек и расскажите о своих пожеланиях. Участие добровольное.",
      icon: "link",
    },
    {
      title: "Узнайте получателя",
      text: "После жеребьёвки в личном кабинете появится коллега, которому вы дарите подарок.",
      icon: "people",
    },
    {
      title: "Передайте подарок",
      text: "Вручите его на своей площадке или отправьте в пункт выдачи в другом городе.",
      icon: "send",
    },
    {
      title: "Зажгите огонёк",
      text: "Подтвердите получение своего подарка. На общей карте станет на один огонёк больше.",
      icon: "globe",
    },
  ];

  return (
    <FestiveShell
      siteTitle={appearance.title}
      signedIn={!!user}
      organizer={user?.role === "admin"}
    >
      <section className="festive-hero" aria-labelledby="welcome-heading">
        <div className="festive-hero-copy">
          <p className="festive-eyebrow">Новогодний обмен подарками</p>
          <h1 id="welcome-heading">{appearance.title}</h1>
          <p className="festive-hero-lead">
            Одна гирлянда, которую зажигает каждый подарок.
          </p>
          <p className="festive-hero-description">
            Подарите немного праздника коллеге со своей площадки или из другого
            города. Каждый полученный подарок зажигает огонёк на общей карте.
          </p>
          <div className="festive-actions">
            <Link
              className="festive-button festive-button--primary"
              href={user ? "/dashboard" : "/signup"}
            >
              {user ? "Мой подарок и анкета" : "Зарегистрироваться"}
            </Link>
            <a
              className="festive-button festive-button--secondary"
              href="#garland"
            >
              Посмотреть гирлянду
            </a>
          </div>
          <p className="festive-hero-note">
            Участие добровольное. Лимит подарка —{" "}
            {config.budget.toLocaleString("ru-RU")} ₽.
          </p>
        </div>
        <div className="festive-hero-art" aria-hidden="true">
          {/* Original decorative artwork from slide 3, not a progress indicator. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/festive/gift-ring.png"
            width={900}
            height={900}
            alt=""
            fetchPriority="high"
          />
        </div>
      </section>

      <dl className="festive-dates" aria-label="Даты события">
        {dates.map(({ title, date }) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>
              <time dateTime={date}>{dateLabel(date)}</time>
            </dd>
          </div>
        ))}
      </dl>
      <p className="festive-calendar-note">
        Плановые сроки. Актуальные даты уточняйте у организатора.
      </p>

      <section className="festive-tracks" aria-labelledby="tracks-heading">
        <h2 id="tracks-heading">Два способа подарить праздник</h2>
        <div className="festive-track-grid">
          <article className="festive-track festive-track--near">
            <p className="festive-track-kicker">На своей площадке</p>
            <h3>Рядом</h3>
            <p>
              Подарок коллеге с вашей площадки или из вашей смены. Вручите его
              лично, без посылок и ожидания доставки.
            </p>
          </article>
          <article className="festive-track festive-track--country">
            <p className="festive-track-kicker">Коллеге из другого города</p>
            <h3>Через всю страну</h3>
            <p>
              Отправьте подарок через пункт выдачи. Добавьте что-нибудь из
              своего региона и открытку с рассказом, откуда приехал ваш подарок.
            </p>
          </article>
        </div>
      </section>

      <div id="garland" className="festive-map-section">
        {snapshot ? (
          <GarlandOverview snapshot={snapshot} config={config} />
        ) : (
          <section className="festive-map-locked">
            <h2>Общая карта гирлянды</h2>
            <p>
              Карта доступна участникам после входа. Публичный просмотр включает
              организатор.
            </p>
            <Link
              className="festive-button festive-button--primary"
              href="/login"
            >
              Войти и посмотреть
            </Link>
          </section>
        )}
      </div>

      <section id="how" className="festive-how" aria-labelledby="how-heading">
        <p className="festive-eyebrow">От анкеты до огонька</p>
        <h2 id="how-heading">Праздник начинается с вас</h2>
        <ol className="festive-steps">
          {steps.map((step, i) => (
            <li key={step.title}>
              <div className="festive-step-top">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/festive/${step.icon}.png`}
                  width={36}
                  height={36}
                  alt=""
                  loading="lazy"
                />
                <span>0{i + 1}</span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </FestiveShell>
  );
}
