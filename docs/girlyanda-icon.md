# Значок «Гирлянды Тайного Санты»

Создан 29 октября 2026 года встроенной генерацией изображений (`image_gen`), без CLI/API-ключа. Тема: подарок и огоньки гирлянды, без надписей. Изображение сохранено в проекте; производные PNG уменьшены до стандартных размеров без изменения композиции.

Файлы относительно корня проекта:

- `public/girlyanda-icon.png` — исходный квадратный значок.
- `public/girlyanda-icon-32.png` — значок вкладки браузера.
- `public/girlyanda-icon-180.png` — Apple touch icon.
- `public/girlyanda-icon-192.png` — значок приложения и предпросмотр в настройках.
- `public/girlyanda-icon-512.png` — крупный значок приложения.

Все ссылки локальные и определены в `lib/site-icon.ts`. Поле «Ссылка на значок» удалено; старое значение `og.icon` в БД не удаляется, но не читается и не влияет на оформление. По последующему запросу пользователя из формы оформления удалены также ссылка на баннер и его предпросмотр: редактируется только название, показывается встроенный значок. Форма отправляет только название и не перезаписывает прежние значения метаданных. В manifest значки имеют `purpose: any`, поскольку изображение не предназначено для принудительной обрезки маской.

Исходное изображение включено в `public/girlyanda-icon.png`.

## Итоговый промпт

Use case: logo-brand. Asset type: square application icon and browser favicon for a Russian corporate Secret Santa app named «Гирлянда Тайного Санты». Create one original polished icon, not a mockup or contact sheet. Subject: one large, immediately recognizable wrapped gift with a bow, combined with a short curved garland of three warm glowing bulbs. Simple bold silhouette, thick clean shapes, high contrast, very little detail, readable at 32 px. Modern friendly festive flat illustration with subtle depth, professional not childish. Center the complete symbol inside the central 70 percent safe area of a square canvas; full-bleed solid dark evergreen background, no outer rounded-corner cutout. Warm bright ribbon and gift contrast naturally with the dark background. No text, letters, numbers, watermark, company logos, Santa face, map, UI, or extra ornaments. Output a finished square app-icon artwork only.
