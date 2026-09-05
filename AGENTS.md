# AGENTS.md

## Назначение и безопасность

Это однопользовательское offline-first приложение. Делайте наименьшее полное
изменение и сохраняйте уже записанные локальные данные при обновлениях схемы.

Production-цель — отдельный сервис на Selectel рядом с Vocabulary. Не меняйте,
не перезапускайте и не используйте данные, контейнер, volume, порт или домен
Vocabulary. Не коммитьте секреты, ключи, cookie и реальные пароли. Перед
операционными действиями прочитайте [docs/operations.md](docs/operations.md).

## Инварианты

- Сначала локальная запись в IndexedDB, затем необязательная синхронизация;
  отсутствие сети не блокирует работу.
- ID дела сохраняется при переносах между расписанием и «Делами».
- В полночь незавершённые дела прошедшего дня переходят в «Дела», а открытый
  интервал завершается границей суток. Они не удаляются и не попадают в историю.
- Завершение создаёт историю; удаление без истории не должно её создавать.
- Серверная запись только по optimistic revision/CAS. Silent last-write-wins
  запрещён: конфликт сохраняет обе версии и требует явного разрешения.
- Публичная регистрация не нужна. Долгий вход — через защищённую remember-me
  cookie; пароль и токен сессии нельзя хранить в доступном JavaScript хранилище.

## Куда идти

| Задача | Сначала читать | Владеющий код |
| --- | --- | --- |
| Поведение расписания, дел, заметок, истории | [docs/product.md](docs/product.md) | `lib/task-operations.ts`, `lib/note-operations.ts`, `features/tasks`, `features/notes`, `features/history`, `lib/data.ts` |
| Локальные данные, rollover, совместимость | [docs/architecture.md](docs/architecture.md) | `src/shared/data-schema.ts`, `lib/storage.ts`, `lib/initial-data.ts`, `lib/migrations.ts`, `lib/rollover.ts` |
| Drag-and-drop и горячие клавиши | [docs/product.md](docs/product.md) | `features/tasks`, `features/notes`, `features/templates`, `lib/sorting.tsx`, `lib/note-editor.tsx` |
| Offline shell | [docs/architecture.md](docs/architecture.md) | `public/service-worker.js` |
| Sync и auth | [docs/architecture.md](docs/architecture.md) | `hooks/use-synced-app-data.ts`, `lib/sync/reconcile.ts`, `lib/sync/merge.ts`, `src/server`, `src/shared/sync-schema.ts` |
| Deploy, backup, rollback | [docs/operations.md](docs/operations.md) | только проверенные deploy-файлы репозитория |

`../docs` — исследовательский архив, не источник истины. Реализация владеет
текущими деталями; эти документы владеют только контрактами и процедурами.

## Проверка

Запустите `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` и вручную проверьте
затронутый сценарий. Для данных и sync отдельно проверьте перезапуск вкладки,
работу без сети, восстановление соединения и CAS-конфликт.

## Коммиты

После каждого законченного и проверенного изменения делайте отдельный
гранулярный коммит. Не смешивайте независимые исправления, рефакторинги и
изменения поведения. Перед коммитом запускайте проверки, пропорциональные
изменению; перед публикацией — полный набор из раздела выше. Не коммитьте
незавершённую или непроверенную работу.

## Ветки и релизы

Обычная разработка идёт в `dev`. `main` представляет production и меняется
только при явном выпуске версии; каждый push в `main` после успешного CI
автоматически разворачивается на сервер. Не коммитьте новую работу напрямую в
`main`.

Перед release следуйте [docs/versioning.md](docs/versioning.md): один раз
обновите SemVer на `dev`, выполните полный `npm run verify`, затем влейте `dev` в
`main`. Тег ставится только на уже успешно развёрнутый commit.
