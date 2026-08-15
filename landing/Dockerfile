# kurtar landing — multi-stage Docker build for the Next.js standalone
# server.
#
# BUILD CONTEXT IS THE REPO ROOT, not landing/ — same reason as backend/
# Dockerfile and the other two frontend Dockerfiles: one root package-
# lock.json, `npm ci` needs every workspace member's manifest present.
# Build from the repo root:
#
#   docker build -f landing/Dockerfile -t kurtar-landing:local .
#
# next.config.ts's `output: "standalone"` + `outputFileTracingRoot`
# (pointed at the repo root, since this is an npm workspace) is what
# makes `.next/standalone/` a minimal, self-contained server — verified
# empirically: this app's only `@kurtar/*` usage is inside a "use client"
# component, so the standalone server bundle needs neither package at
# runtime (they're already inlined into the CLIENT chunks under .next/
# static by Next's bundler). If Task 13 later adds a Server
# Component/Route Handler that imports @kurtar/api-client directly, check
# `.next/standalone/node_modules/@kurtar/` actually appears — if Next's
# tracer doesn't pick it up, this Dockerfile's build stage will need an
# explicit `npm run build -w @kurtar/api-client` COPY step added, same as
# the other two frontend Dockerfiles already do.

########################################################################
# Stage 1: install + build
########################################################################
FROM node:20-alpine AS build

ARG APK_REPO_PROTO=https
RUN sed -i "s#https://dl-cdn#${APK_REPO_PROTO}://dl-cdn#" /etc/apk/repositories

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/ui-tokens/package.json ./packages/ui-tokens/package.json
COPY apps/merchant-web/package.json ./apps/merchant-web/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY apps/consumer/package.json ./apps/consumer/package.json
COPY landing/package.json ./landing/package.json

RUN npm ci --no-audit --no-fund

COPY packages/api-client ./packages/api-client
COPY packages/ui-tokens ./packages/ui-tokens
COPY landing ./landing

# NEXT_PUBLIC_ vars are inlined into the client bundle at BUILD time —
# pass the real value via --build-arg on release, defaulting to the local
# dev backend so a bare `docker build` here still succeeds.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4750
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

RUN npm run build -w @kurtar/ui-tokens
RUN npm run build -w @kurtar/api-client
RUN npm run build -w landing

########################################################################
# Stage 2: production runtime — Next's standalone server
########################################################################
FROM node:20-alpine AS production

ARG APK_REPO_PROTO=https
RUN sed -i "s#https://dl-cdn#${APK_REPO_PROTO}://dl-cdn#" /etc/apk/repositories \
  && apk add --no-cache wget \
  && addgroup -S kurtar && adduser -S kurtar -G kurtar

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4758
ENV HOSTNAME=0.0.0.0

COPY --from=build --chown=kurtar:kurtar /app/landing/.next/standalone ./
COPY --from=build --chown=kurtar:kurtar /app/landing/.next/static ./landing/.next/static
COPY --from=build --chown=kurtar:kurtar /app/landing/public ./landing/public

USER kurtar
EXPOSE 4758

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:4758/" || exit 1

CMD ["node", "landing/server.js"]
