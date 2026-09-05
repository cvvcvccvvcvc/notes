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

До загрузки изменений локально обязательны:

```sh
npm run format
npm run lint
npm run typecheck
npm test
npm run build
```

Исходники копируются в отдельный каталог Notes без `.git`, `node_modules`,
`dist` и env-файлов. На сервере:

```sh
cd /root/life-notes/deploy
docker compose config --quiet
docker compose build app
docker compose up -d app
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

До автоматизации используйте согласованную копию при остановленных записях:

1. Создать закрытый каталог `/root/life-notes-backups`.
2. Остановить только `life-notes-app-1`.
3. Скопировать всё содержимое volume `life-notes_notes_data` в новый
   датированный каталог backup, включая возможные `-wal` и `-shm`; один основной
   файл не является полной копией.
4. Сразу снова запустить Notes и проверить health.
5. Открыть копию отдельно, выполнить SQLite `integrity_check` и проверить
   revision, затем перенести зашифрованную копию с сервера.

Обычное копирование работающего SQLite-файла не считается backup. Сервер не
должен становиться единственной копией важных данных до проверки восстановления.

## Откат

Образ помечается неизменяемым `NOTES_IMAGE_TAG`. Для отката вернуть прошлый tag
в `.env` и выполнить `docker compose up -d app`; Caddy и Vocabulary не трогать.
Если менялась схема, сначала остановить Notes и восстановить проверенную копию.
Первоначальный Caddy-маршрут можно вернуть из сохранённого backup только после
`caddy validate`, затем применить через `caddy reload`.
