#!/bin/sh
set -eu
umask 077

SANTA_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$SANTA_ROOT"
SANTA_SERVER_URL=${1:-}
case "$SANTA_SERVER_URL" in
  http://*|https://*) ;;
  *) echo "Укажите полный адрес сайта: sh deployment/install-server.sh http://SERVER:3003" >&2; exit 1 ;;
esac
case "$SANTA_SERVER_URL" in
  *[!a-zA-Z0-9.:/_-]*|*'@'*|*'?'*|*'#'*) echo "Используйте адрес без пробелов, логина, параметров и фрагмента." >&2; exit 1 ;;
esac
SANTA_SERVER_URL=${SANTA_SERVER_URL%/}
SANTA_HOST=${SANTA_SERVER_URL#*://}
case "$SANTA_HOST" in
  ""|:*|localhost|localhost:*|127.*|*/*) echo "Укажите доступный участникам адрес сервера без пути." >&2; exit 1 ;;
esac
[ -f .env ] || { echo "Файл .env отсутствует." >&2; exit 1; }
docker compose version >/dev/null
[ "$(docker info --format '{{.OSType}}')" = linux ] || { echo "Нужен Docker с Linux-контейнерами." >&2; exit 1; }
export SANTA_SERVER_URL

SANTA_ENV_TEMP=$(mktemp "$SANTA_ROOT/.env.server.XXXXXX")
trap 'rm -f "$SANTA_ENV_TEMP"' EXIT HUP INT TERM
awk '
  BEGIN { auth = 0; app = 0 }
  /^BETTER_AUTH_URL=/ { print "BETTER_AUTH_URL=" ENVIRON["SANTA_SERVER_URL"]; auth = 1; next }
  /^NEXT_PUBLIC_APP_URL=/ { print "NEXT_PUBLIC_APP_URL=" ENVIRON["SANTA_SERVER_URL"]; app = 1; next }
  { print }
  END {
    if (!auth) print "BETTER_AUTH_URL=" ENVIRON["SANTA_SERVER_URL"]
    if (!app) print "NEXT_PUBLIC_APP_URL=" ENVIRON["SANTA_SERVER_URL"]
  }
' .env > "$SANTA_ENV_TEMP"
chmod 600 "$SANTA_ENV_TEMP"
mv "$SANTA_ENV_TEMP" .env
trap - EXIT HUP INT TERM

santa_compose() {
  docker compose --env-file "$SANTA_ROOT/.env" --project-directory "$SANTA_ROOT" -f "$SANTA_ROOT/deployment/server-compose.yml" "$@"
}
case "${SANTA_INSTALL_MODE:-build}" in
  build) santa_compose build app ;;
  registry) santa_compose pull app ;;
  *) echo "SANTA_INSTALL_MODE должен быть build или registry." >&2; exit 1 ;;
esac
santa_compose up -d --no-build db
SANTA_ATTEMPT=0
until santa_compose exec -T db sh -c 'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; do
  SANTA_ATTEMPT=$((SANTA_ATTEMPT + 1))
  [ "$SANTA_ATTEMPT" -lt 60 ] || { echo "PostgreSQL не запустился." >&2; exit 1; }
  sleep 1
done
santa_compose run --rm -T --no-deps --pull never app node dist-migrate.cjs
SANTA_USERS=$(santa_compose exec -T db sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\''SELECT count(*) FROM "user"'\''')
if [ "$SANTA_USERS" = 0 ]; then
  SANTA_ADMIN_BOOTSTRAP_FILE=${SANTA_ADMIN_BOOTSTRAP_FILE:-$SANTA_ROOT/deployment/private/admins.sql}
  [ -f "$SANTA_ADMIN_BOOTSTRAP_FILE" ] || {
    echo "Нужен SQL-файл администраторов: передайте его через SANTA_ADMIN_BOOTSTRAP_FILE. Приложение пока не запущено." >&2; exit 1;
  }
  santa_compose exec -T db sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$SANTA_ADMIN_BOOTSTRAP_FILE"
  echo "Администраторы восстановлены с прежними паролями."
else
  echo "В базе уже есть аккаунты: повторный перенос администраторов пропущен."
fi
santa_compose up -d --no-build --pull never app
santa_compose ps
echo "Приложение запущено. Адрес для участников: $SANTA_SERVER_URL"
