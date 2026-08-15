# kurtar merchant-web — multi-stage Docker build for the static Vite SPA.
#
# BUILD CONTEXT IS THE REPO ROOT, not apps/merchant-web — same reason as
# backend/Dockerfile: this workspace uses one root package-lock.json, and
# `npm ci` needs every workspace member's package.json present to validate
# the lockfile, even though this image only ever builds merchant-web and
# the two shared packages it depends on. Build from the repo root:
#
#   docker build -f apps/merchant-web/Dockerfile -t kurtar-merchant-web:local .
#
# Mirrors backend/Dockerfile's conventions: multi-stage, non-root runtime
# user, same APK_REPO_PROTO MITM-proxy workaround.

########################################################################
# Stage 1: install + build (shared packages, then this app)
########################################################################
FROM node:20-alpine AS build

ARG APK_REPO_PROTO=https
RUN sed -i "s#https://dl-cdn#${APK_REPO_PROTO}://dl-cdn#" /etc/apk/repositories

WORKDIR /app

# Every workspace member's manifest, for npm ci's lockfile-consistency
# check and for layer caching — `npm ci` is the slowest step and should
# only re-run when a manifest actually changed.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/ui-tokens/package.json ./packages/ui-tokens/package.json
COPY apps/merchant-web/package.json ./apps/merchant-web/package.json
COPY apps/admin-web/package.json ./apps/admin-web/package.json
COPY apps/consumer/package.json ./apps/consumer/package.json
COPY landing/package.json ./landing/package.json

RUN npm ci --no-audit --no-fund

# Full source only for what this image actually builds.
COPY packages/api-client ./packages/api-client
COPY packages/ui-tokens ./packages/ui-tokens
COPY apps/merchant-web ./apps/merchant-web

# @kurtar/ui-tokens and @kurtar/api-client ship compiled dist/ output
# (see each package's own package.json) — build them before merchant-web,
# whose Vite build resolves them via that dist/ output, not their TS
# source.
RUN npm run build -w @kurtar/ui-tokens
RUN npm run build -w @kurtar/api-client
RUN npm run build -w merchant-web

########################################################################
# Stage 2: production runtime — a static file server, nothing else
########################################################################
FROM node:20-alpine AS production

ARG APK_REPO_PROTO=https
RUN sed -i "s#https://dl-cdn#${APK_REPO_PROTO}://dl-cdn#" /etc/apk/repositories \
  && apk add --no-cache wget \
  && addgroup -S kurtar && adduser -S kurtar -G kurtar

WORKDIR /app
ENV NODE_ENV=production

# `serve` is the only runtime dependency a built static SPA needs —
# installed standalone so the runtime image never carries Vite/React/
# TypeScript devDependencies.
RUN npm install --global serve@14 --no-audit --no-fund

COPY --from=build --chown=kurtar:kurtar /app/apps/merchant-web/dist ./dist

USER kurtar
EXPOSE 4756

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:4756/" || exit 1

CMD ["serve", "-s", "dist", "-l", "4756"]
