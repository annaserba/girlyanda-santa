"use client";

import { useEffect, useState } from "react";

export function RegistrationQr() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const signupUrl = origin ? new URL("/signup", origin).toString() : "/signup";
  const qrUrl = origin
    ? `/api/registration-qr?origin=${encodeURIComponent(origin)}`
    : null;

  return (
    <div className="space-y-3">
      <a href={signupUrl} className="block break-all text-sm">
        {origin ? signupUrl : "Ссылка на регистрацию"}
      </a>
      {qrUrl ? (
        <>
          <img
            src={qrUrl}
            alt="QR-код ссылки на регистрацию"
            width={180}
            height={180}
          />
          <a
            href={qrUrl}
            download="girlyanda-registration.svg"
            className="inline-block text-sm underline"
          >
            Скачать QR-код
          </a>
        </>
      ) : (
        <div
          className="flex h-[180px] w-[180px] items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          Формируем QR-код…
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Ссылка и QR-код ведут на регистрацию на текущем сайте. QR формируется
        внутри контура, без внешнего сервиса.
      </p>
    </div>
  );
}
