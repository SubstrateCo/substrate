# Builds the renderer and serves it with Caddy. Caddy forwards /api and /desktop to the API
# over the private network, so the browser app keeps same-origin API requests.
FROM oven/bun:1.4.4 AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --filter @substrate/web build

FROM caddy:2.11-alpine
COPY deploy/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
