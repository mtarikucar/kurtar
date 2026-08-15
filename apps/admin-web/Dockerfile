# kurtar admin-web — multi-stage Docker build for the static Vite SPA.
# See apps/merchant-web/Dockerfile's header comment — identical reasoning
# (repo-root build context, npm ci lockfile-consistency, shared packages
# built before the app that depends on them). Build from the repo root:
#
#   docker build -f apps/admin-web/Dockerfile -t kurtar-admin-web:local .

########################################################################
# Stage 1: install + build (shared packages, then this app)
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
COPY apps/admin-web ./apps/admin-web

RUN npm run build -w @kurtar/ui-tokens
RUN npm run build -w @kurtar/api-client
RUN npm run build -w admin-web

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

RUN npm install --global serve@14 --no-audit --no-fund

COPY --from=build --chown=kurtar:kurtar /app/apps/admin-web/dist ./dist

USER kurtar
EXPOSE 4757

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:4757/" || exit 1

CMD ["serve", "-s", "dist", "-l", "4757"]
