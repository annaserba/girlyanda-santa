/** Better Auth sends stable error codes; keep its English diagnostics out of the UI. */
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Неверная почта или пароль.",
  INVALID_PASSWORD: "Неверный пароль.",
  INVALID_EMAIL: "Проверьте адрес электронной почты.",
  USER_NOT_FOUND: "Неверная почта или пароль.",
  USER_ALREADY_EXISTS: "Аккаунт с такой почтой уже существует. Попробуйте войти.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "Аккаунт с такой почтой уже существует. Попробуйте войти.",
  PASSWORD_TOO_SHORT: "Пароль должен содержать не менее 8 символов.",
  PASSWORD_TOO_LONG: "Пароль слишком длинный.",
  EMAIL_NOT_VERIFIED: "Подтвердите адрес электронной почты.",
  TOO_MANY_REQUESTS: "Слишком много попыток. Попробуйте немного позже.",
  SESSION_EXPIRED: "Срок действия сессии истёк. Войдите ещё раз.",
  UNAUTHORIZED: "Сначала войдите в аккаунт.",
  FORBIDDEN: "Недостаточно прав для этого действия.",
  USER_BANNED: "Аккаунт заблокирован. Обратитесь к организатору.",
  BANNED_USER: "Аккаунт заблокирован. Обратитесь к организатору.",
  FAILED_TO_CREATE_USER: "Не удалось создать аккаунт. Попробуйте ещё раз.",
};

export function authErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const value = error as { code?: unknown; body?: { code?: unknown }; status?: unknown };
  const code = value.code ?? value.body?.code;
  if (typeof code === "string" && messages[code]) return messages[code];
  if (value.status === 429) return messages.TOO_MANY_REQUESTS;
  return fallback;
}
