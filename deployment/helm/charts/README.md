# Общий chart

Включён локальный снимок nxs-universal-chart 2.8.2 из
`main/gpn_forminput_backend/deployment/helm/charts/nxs-universal-chart`.
Это тот же chart и схема values, что используются в проектах папки main.
Шаблоны не изменены, сохранена Apache-2.0 лицензия в LICENSE.
Снимок включён в репозиторий, чтобы Argo CD не скачивал chart или Git submodule
из интернета при развёртывании в закрытом контуре.
Обновлять отдельно, с повторной проверкой всех окружений.
