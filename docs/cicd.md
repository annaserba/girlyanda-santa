# CI/CD

## GitHub

`.github/workflows/ci.yml` запускается при push и pull request:
проверяет TypeScript и unit/SSR-тесты, выполняет интеграционные тесты
в отдельной PostgreSQL и собирает production-версию Next.js.
Права workflow ограничены чтением репозитория; развёртывание и публикация образов
в GitHub не настроены. Реальные учётные данные для этих проверок не нужны.

## Корпоративный GitLab

`.gitlab-ci.yml` включает `deployment/gitlab_ci/.gitlab-ci.yml`.
Pipeline использует общий проект `main/template/common_gitlab_ci` и требует
доступа к нему в вашей инсталляции GitLab. На github.com этот include не выполняется.
Локально включён Helm chart `nxs-universal-chart` 2.8.2 с исходной лицензией.

| Источник               | Проверки                               | Образ                      | Развёртывание при включённом CD |
| ---------------------- | -------------------------------------- | -------------------------- | ------------------------------- |
| Любая ветка / MR       | TypeScript, unit/SSR, PostgreSQL, Helm | —                          | —                               |
| `dev`                  | Все                                    | Полный commit SHA          | Argo CD автоматически           |
| `main`                 | Все                                    | Полный SHA, ручная сборка  | Ручное                          |
| Защищённый release tag | Все                                    | Release tag, ручная сборка | Ручное                          |

Образы собираются только после проверок. Код и образ привязаны к одному SHA/tag.
Изменения окружения сериализованы через `resource_group`.
Production jobs требуют ручного запуска и защищённого тега.

## Настройки платформы

- `REGISTRY` и `REGISTRY_IMAGE_DEV/TEST/PROD`: registry и пути образов.
- `CI_ENV_URL_DEV/TEST/PROD`: HTTPS origins приложения, одинаковые при сборке и запуске.
- `DEPLOY_REPOSITORY_URL`: при необходимости переопределяет URL текущего проекта.
- `KUBE_NAMESPACE_DEV/TEST/PROD`, `VAULT_PATH_DEV/TEST/PROD`: окружения и пути секретов.
- `ARGOCD_SERVER`, `ARGOCD_TOKEN`: сервер Argo CD и защищённая masked-переменная токена.
- `NPM_REGISTRY`, `NODE_IMAGE`, `ALPINE_MIRROR`: зеркала зависимостей и базовых образов.
- `GIRLYANDA_ENABLE_CD`: по умолчанию `false`; включается после настройки платформы.

Проверьте точные имена build credentials в общем GitLab-шаблоне.
Задайте переменные через защищённые настройки CI/Vault, не через Git.
Перед запуском проверьте pipeline в GitLab CI Lint с раскрытием includes:
общий шаблон не входит в этот репозиторий.

## Helm, Vault и Argo CD

`deployment/argocd/render.mjs` создаёт манифест конкретной ревизии в
`.local-deployment/`. Исходные шаблоны с `__TOKENS__` напрямую не применяются.
Неполные адреса и небезопасные origins отклоняются.

`deployment/argocd/deploy.mjs` обращается к Argo API только при явно включённом CD.
В dev обновляет Application с автоматической синхронизацией; test/prod запускаются вручную.
Prune не запрашивается. Kubernetes credentials в репозитории не хранятся.

Платформенная команда должна предоставить namespace, image pull secret,
External Secrets/Vault store, отдельную PostgreSQL и доступ Argo к Git.
Миграции выполняются отдельным init-процессом перед запуском приложения.
Расписание жеребьёвок работает внутри приложения; values используют одну реплику и Recreate.

Локальные проверки renderer и publisher покрыты тестами. Доступ к корпоративному
GitLab, Vault, registry и Argo требуется проверить в целевом контуре.
