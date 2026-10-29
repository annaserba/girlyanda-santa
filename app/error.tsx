"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Не удалось загрузить страницу</h1>
      <p className="text-muted-foreground">Попробуйте ещё раз. Если ошибка повторяется, обратитесь к организатору.</p>
      <div className="flex gap-3">
        <Button onClick={reset}>Попробовать снова</Button>
        <Button asChild variant="outline"><Link href="/">На главную</Link></Button>
      </div>
    </main>
  );
}
