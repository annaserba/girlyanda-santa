"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { PhoneInput } from "@/components/phone-input";
import { normalizeRussianPhone, RUSSIAN_PHONE_ERROR } from "@/lib/phone";
import { CitySelect } from "@/components/city-select";
import { participantNameSchema } from "@/lib/event-config";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedPhone = normalizeRussianPhone(phone);
    if (!normalizedPhone) {
      setError(RUSSIAN_PHONE_ERROR);
      return;
    }
    if (!city) {
      setError("Выберите город РФ из списка.");
      return;
    }
    const fullName = participantNameSchema.safeParse(name);
    if (!fullName.success) {
      setError(fullName.error.issues[0].message);
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.data,
          email,
          password,
          phone: normalizedPhone,
          city,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Не удалось создать аккаунт.");
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
    <HolidayShell auth contentId="signup-content">
      <main id="signup-content" className="holiday-auth-main">
        <Card className="holiday-auth-card w-full">
          <CardHeader>
            <CardTitle>
              <h1>Регистрация</h1>
            </CardTitle>
            <CardDescription>
              Укажите свой номер телефона, ФИО, город и электронную почту.
              Подойдёт личный или рабочий адрес. После создания аккаунта
              заполните анкету и подтвердите участие в личном кабинете.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={onSubmit}
              aria-busy={loading}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Телефон РФ</Label>
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={setPhone}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">ФИО</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  required
                  maxLength={200}
                  aria-describedby="signup-name-help"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <p
                  id="signup-name-help"
                  className="text-xs text-muted-foreground"
                >
                  Фамилия и имя полностью, отчество — при наличии.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="city">Город РФ</Label>
                <CitySelect
                  value={city}
                  onChange={setCity}
                  disabled={loading}
                />
              </div>
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
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading || !phone || !city}>
                {loading ? "Создаём аккаунт…" : "Зарегистрироваться"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="underline">
                  Войти
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </main>
    </HolidayShell>
  );
}
