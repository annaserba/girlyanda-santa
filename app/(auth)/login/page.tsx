"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authErrorMessage } from "@/lib/auth-errors";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HolidayShell } from "@/components/holiday-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await signIn.email({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setError(
          authErrorMessage(error, "Не удалось войти. Попробуйте ещё раз."),
        );
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(
        "Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <HolidayShell auth contentId="login-content">
      <main id="login-content" className="holiday-auth-main">
        <Card className="holiday-auth-card w-full">
          <CardHeader>
            <CardTitle>
              <h1>Вход</h1>
            </CardTitle>
            <CardDescription>
              Войдите в свой кабинет Тайного Санты.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onSubmit}
              aria-busy={loading}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Электронная почта</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Входим…" : "Войти"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Нет аккаунта?{" "}
                <Link href="/signup" className="underline">
                  Зарегистрироваться
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </HolidayShell>
  );
}
