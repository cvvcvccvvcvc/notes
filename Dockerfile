FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ARG NOTES_VERSION=0.0.0
ARG NOTES_GIT_SHA=unknown
LABEL org.opencontainers.image.title="Life Notes" \
  org.opencontainers.image.version="$NOTES_VERSION" \
  org.opencontainers.image.revision="$NOTES_GIT_SHA"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./dist/migrations
RUN mkdir -p /app/var && chown -R node:node /app
USER node
EXPOSE 8788
CMD ["node", "dist/server/server/index.js"]
