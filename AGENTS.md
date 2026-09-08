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
- ID дела сохраняется при переносах между расписанием и проектами.
- В полночь незавершённые дела прошедшего дня возвращаются в прежний проект,
  если он известен, иначе в «Не разобрано»; открытый интервал завершается
  границей суток. Дела не удаляются и не попадают в историю.
- Завершение создаёт историю; удаление без истории не должно её создавать.
- Серверная запись только по optimistic revision/CAS. Silent last-write-wins
  запрещён: конфликт сохраняет обе версии и требует явного разрешения.
- Публичная регистрация не нужна. Долгий вход — через защищённую remember-me
  cookie; пароль и токен сессии нельзя хранить в доступном JavaScript хранилище.

## Куда идти

| Задача | Сначала читать | Владеющий код |
| --- | --- | --- |
| Расписание, проекты и дела | [docs/product.md](docs/product.md) | `features/tasks`, `lib/task-operations.ts`, `lib/day-timeline.ts`, `lib/task-text.tsx` |
| Правила и шаблон месяцев | [docs/product.md](docs/product.md) | `features/rules`, `features/templates`, `lib/rule-operations.ts`, `lib/month-template.ts` |
| Заметки и изображения | [docs/product.md](docs/product.md) | `features/notes`, `lib/note-operations.ts`, `lib/note-attachments.ts`, `lib/note-editor.tsx` |
| Цели, итоги и история | [docs/product.md](docs/product.md) | `features/reviews`, `lib/review-operations.ts` |
| Локальные данные, rollover, совместимость | [docs/architecture.md](docs/architecture.md) | `src/shared/data-schema.ts`, `lib/storage.ts`, `lib/initial-data.ts`, `lib/migrations.ts`, `lib/rollover.ts` |
| Общие редакторы, drag-and-drop и горячие клавиши | [docs/architecture.md](docs/architecture.md) | `lib/sorting.tsx`, `lib/task-text.tsx`, `lib/note-editor.tsx`, `components/markdown-editor.tsx`, затем владеющий `features/*` |
| Offline shell | [docs/architecture.md](docs/architecture.md) | `public/service-worker.js` |
| Sync и auth | [docs/architecture.md](docs/architecture.md) | `hooks/use-synced-app-data.ts`, `lib/sync/reconcile.ts`, `lib/sync/merge.ts`, `src/server`, `src/shared/sync-schema.ts` |
| Deploy, backup, rollback | [docs/operations.md](docs/operations.md) | только проверенные deploy-файлы репозитория |

## Проверка

Выбирайте минимальные проверки пропорционально риску; полный локальный gate —
`npm run verify`, он совпадает с CI. `npm run format` применяет форматирование,
но не заменяет gate. Локальный preview остаётся вспомогательным инструментом:
запускайте его только по явному запросу. Для данных и sync отдельно проверьте
перезапуск вкладки, работу без сети, восстановление соединения и CAS-конфликт.

## Коммиты

После каждого законченного и проверенного изменения делайте отдельный
гранулярный коммит. Не смешивайте независимые исправления, рефакторинги и
изменения поведения. Перед коммитом запускайте проверки, пропорциональные
изменению; перед публикацией — полный набор из раздела выше. Не коммитьте
незавершённую или непроверенную работу.

## Ветки и релизы

Сейчас используется только `main`: делайте законченные проверенные коммиты прямо
в него и не используйте `dev`. Не отправляйте изменения в remote без явного
запроса на публикацию. Каждый push в `main` после успешного CI автоматически
разворачивается на сервер.

Перед release следуйте [docs/versioning.md](docs/versioning.md): обновите SemVer,
выполните полный `npm run verify` и только затем отправьте `main`. Тег ставится
только на уже успешно развёрнутый commit.
