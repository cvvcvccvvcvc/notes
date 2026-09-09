# Эксплуатация

## Production

- URL: `https://notes.135-106-167-202.sslip.io`
- host: Selectel `135.106.167.202`
- source: `/root/life-notes`
- compose project: `life-notes`
- app container: `life-notes-app-1`
- data volume: `life-notes_notes_data`
- reverse proxy: существующий `deploy-caddy-1`, сеть `deploy_default`

Notes использует отдельный контейнер и SQLite volume. Контейнер, образ, база и
volume Vocabulary запрещены для изменений. Caddy разрешено только валидировать и
перезагружать без остановки; его исходный файл находится в
`/root/TheVocabularyApp/the-vocabulary-app-web/deploy/Caddyfile`.

## Секреты

Production-переменные находятся только в `/root/life-notes/deploy/.env` с
правами `0600`. В Git хранится лишь `.env.example`. Значение scrypt hash содержит
`$`; в Compose env-файле каждый такой символ записывается как `$$`, иначе Compose
попытается подставить переменную и испортит hash.

Пароль превращается в hash командой `npm run password:hash -- <password>`.
Session secret должен быть случайным и содержать не меньше 32 символов. После
замены пароля или secret все доверенные устройства входят заново.

## Проверка и обновление

Локальная полная проверка:

```sh
npm run verify
```

`.github/workflows/deploy.yml` запускает ту же проверку для push в `main`.
Развёртывание выполняется только для успешно проверенного commit в `main`.
`main` является единственной рабочей веткой; push допустим только по явному
запросу на публикацию и после локального `verify`.
Workflow:

1. создаёт согласованный зашифрованный backup;
2. проверяет, что целевой commit принадлежит `origin/main`;
3. собирает образ с неизменяемым Git SHA tag и labels версии/revision;
4. заменяет только контейнер Notes и ждёт его health-check;
5. проверяет публичный `/healthz`;
6. при ошибке возвращает предыдущий checkout и образ.

Production checkout находится в `/root/life-notes`, а секретный `.env` остаётся
неотслеживаемым файлом с правами `0600`. Workflow не перезапускает Caddy и не
обращается к контейнерам или данным Vocabulary.

### GitHub Actions

Workflow использует GitHub environment `production` и два environment secret:

| Secret | Содержимое |
| --- | --- |
| `DEPLOY_SSH_KEY` | полный отдельный приватный SSH-ключ Notes |
| `DEPLOY_KNOWN_HOSTS` | проверенный `ssh-keyscan` для production host |

Если secrets отсутствуют, CI остаётся рабочим, но deploy явно пропускается.
Environment допускает deploy только из ветки `main`.
Значения обоих secrets доступны только шагу настройки SSH; checkout, чтение
production-конфигурации и запуск удалённого deploy не получают их в окружении.
Ключ Notes не переиспользуется для Vocabulary и хранится только в GitHub и на
доверенном recovery-устройстве. Публичная топология находится в
`deploy/production.env`.

### Ручной повтор deploy

Ручное обновление допустимо только для повтора уже проверенного `main`:

```sh
cd /root/life-notes
git fetch origin main
git checkout --detach origin/main
export NOTES_IMAGE_TAG="$(git rev-parse HEAD)"
export NOTES_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -1)"
export NOTES_GIT_SHA="$NOTES_IMAGE_TAG"
systemctl start life-notes-backup.service
docker compose -f deploy/compose.yml config --quiet
docker compose -f deploy/compose.yml build app
docker compose -f deploy/compose.yml up -d --no-deps app
docker inspect --format '{{.State.Health.Status}}' life-notes-app-1
```

Проверить `GET /healthz`, redirect `/` на `/login`, реальный вход и
`GET /api/sync`. После обновления отдельно проверить запись offline и последующую
синхронизацию двух устройств. Vocabulary до и после обновления должен отвечать
на своём домене.

## Caddy

Перед первым изменением создана копия
`Caddyfile.backup-before-notes-20260905`. Новый Caddyfile сначала проверяется в
контейнере через `caddy validate`, затем применяется через `caddy reload`. Не
перезапускать proxy целиком. Notes-маршрут хранится также в
`deploy/Caddyfile.notes`.

## Резервная копия данных

Production ежедневно создаёт согласованный SQLite snapshot через `.backup` и
отправляет его в отдельный приватный Selectel S3 bucket с помощью Restic. Restic
шифрует содержимое до отправки. После загрузки job скачивает последний snapshot
во временный каталог и выполняет SQLite `integrity_check`; только после успешного
восстановления применяется retention и запускается итоговая проверка repository.
Успешная загрузка без успешного восстановления не считается готовым backup.

В репозитории находятся:

- `deploy/backup/life-notes-backup` — snapshot, retention и restore check;
- `deploy/backup/life-notes-backup.service` — одноразовый systemd job;
- `deploy/backup/life-notes-backup.timer` — ежедневный запуск;
- `deploy/backup/life-notes-backup.env.example` — только форма конфигурации.

Production-конфигурация хранится в `/etc/life-notes-backup.env`, пароль Restic —
в `/root/.config/life-notes-backup/restic-password`; оба файла имеют права
`0600` и не входят в Git. Recovery-копия пароля должна храниться вне сервера.
Потеря этого пароля делает зашифрованные snapshots невосстановимыми.

S3-ключ должен принадлежать отдельному сервисному пользователю с ролью
`s3.bucket.user` и политикой, разрешающей доступ только к bucket Notes. Не
использовать постоянно ключ владельца аккаунта или ключ другого приложения.
После ротации заменить только `AWS_ACCESS_KEY_ID` и `AWS_SECRET_ACCESS_KEY` в
`/etc/life-notes-backup.env` и сразу вручную запустить service для проверки.

Политика хранения: 14 дневных, 8 недельных, 12 месячных и 3 годовых snapshot.
Проверка состояния:

```sh
systemctl status life-notes-backup.timer
systemctl status life-notes-backup.service
journalctl -u life-notes-backup.service -n 50 --no-pager
```

Для ручного восстановления отключить запись в приложение, загрузить выбранный
snapshot через `restic restore`, проверить восстановленный файл командой
`sqlite3 <path> 'PRAGMA integrity_check;'` и только затем заменить содержимое
volume. Никогда не восстанавливать поверх работающего контейнера и не запускать
`forget` или `prune`, пока расследуется повреждение repository.

Аварийная локальная копия всего volume перед рискованным deploy по-прежнему
создаётся отдельно. Копирование одного работающего SQLite-файла не считается
согласованным backup: используйте `.backup` либо копируйте весь volume вместе с
`-wal` и `-shm` при остановленных записях.

## Откат

Образ помечается полным Git SHA, а его labels содержат SemVer и тот же revision.
При неуспешном автоматическом health-check workflow возвращает предыдущий Git
checkout и образ. Для ручного отката выбрать предыдущий production-тег, сделать
detached checkout и запустить его существующий SHA-образ через
`NOTES_IMAGE_TAG=<sha> docker compose -f deploy/compose.yml up -d --no-deps app`.

Автоматический rollback не откатывает данные. Если release содержал
несовместимую миграцию схемы, сначала остановить запись в Notes и восстановить
проверенный предрелизный backup. Caddy и Vocabulary не трогать. Первоначальный
Caddy-маршрут можно вернуть из сохранённой копии только после `caddy validate`,
затем применить через `caddy reload`.
