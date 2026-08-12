# kurtar-api — multi-stage Docker build.
#
# BUILD CONTEXT IS THE REPO ROOT, not backend/ — this workspace uses a
# single root package-lock.json (root package.json has
# "workspaces": ["backend"]; backend/ has its own package.json but no
# lockfile of its own), so `npm ci` needs both files visible in the build
# context. Build from the repo root:
#
#   docker build -f backend/Dockerfile -t kurtar-api:local .
#
# (docker-compose / CI build steps below set context: . and
# dockerfile: backend/Dockerfile accordingly.) The repo-root .dockerignore
# applies to this build.
#
# Directory depth inside the image intentionally mirrors the repo layout
# (/app == repo root, /app/backend == backend/) — backend/src/config/env-
# file.ts resolves the top-level .env file via a fixed 3-levels-up walk
# from its own __dirname (dist/config -> dist -> backend -> repo root);
# flattening the image layout would silently break that resolution.

########################################################################
# Stage 1: install + build
########################################################################
FROM node:20-alpine AS build

# APK_REPO_PROTO exists solely so this Dockerfile can still be built on a
# network whose TLS is intercepted by an untrusted MITM proxy in front of
# dl-cdn.alpinelinux.org (apk's HTTPS fetch fails there with "certificate
# verify failed", while plain HTTP to the same mirror works — a known
# issue on this project's own dev network, see docs/plans for context).
# DEFAULT IS https — override with --build-arg APK_REPO_PROTO=http only
# for a local build on such a network; every real build (CI, production)
# uses the default.
ARG APK_REPO_PROTO=https

# Prisma's query engine needs OpenSSL at generate-time (and at runtime,
# see the production stage below).
RUN sed -i "s#https://dl-cdn#${APK_REPO_PROTO}://dl-cdn#" /etc/apk/repositories \
  && apk add --no-cache openssl

WORKDIR /app

# Manifests first for layer caching — `npm ci` is the slowest step and
# should only re-run when a manifest actually changed.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

RUN npm ci --no-audit --no-fund

COPY backend ./backend

WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

########################################################################
# Stage 2: production runtime
########################################################################
FROM node:20-alpine AS production

# See the build stage's ARG comment above — same MITM-workaround, same
# default (https).
ARG APK_REPO_PROTO=https

RUN sed -i "s#https://dl-cdn#${APK_REPO_PROTO}://dl-cdn#" /etc/apk/repositories \
  && apk add --no-cache openssl wget \
  && addgroup -S kurtar && adduser -S kurtar -G kurtar

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json

# --omit=dev: no @nestjs/cli, typescript, ts-jest, etc. in the runtime
# image. Run BEFORE copying the generated Prisma client below so nothing
# this install step touches can clobber it.
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# The generated client (backend/node_modules/.prisma is never used under
# npm workspaces — `prisma generate` writes into the hoisted ROOT
# node_modules, since backend/ has no node_modules of its own).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma

RUN chown -R kurtar:kurtar /app
USER kurtar

EXPOSE 4750

# /api/health is @Public() (see backend/src/modules/health/health.
# controller.ts) — reachable with no auth token, exactly what an
# orchestrator/compose healthcheck needs.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${KURTAR_API_PORT:-4750}/api/health" || exit 1

CMD ["node", "backend/dist/main.js"]
