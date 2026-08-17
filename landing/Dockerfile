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
# makes `.next/standalone/` a minimal, self-contained server.
#
# UPDATE (task-13): lib/impact.ts now imports @kurtar/api-client from a
# Server Component (app/[locale]/page.tsx, the home page's live impact
# counter) — no longer confined to a "use client" component as this
# comment previously assumed. That page is statically generated (SSG)
# but uses `fetch(..., { next: { revalidate: 300 } })`, which makes it
# eligible for ISR: the STANDALONE SERVER re-executes this exact code
# path in the background once the cache window elapses, not just once
# at build time. Verified empirically that Next's output file tracer does
# NOT pick up `@kurtar/api-client` into `.next/standalone/node_modules/`
# on its own (grepped the built standalone output — zero "@kurtar"
# matches) — so the explicit copy step below is required, not optional;
# omitting it would make the home page's live counter silently start
# throwing (and therefore never refresh past its first revalidate) the
# moment the container has been up for 5 minutes. `@kurtar/api-client`
# itself declares zero runtime "dependencies" of its own (see its
# package.json), so its built dist/ is the only thing that needs to land
# in the runtime image's node_modules — no transitive package graph to
# chase.

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

# See this file's top comment ("UPDATE (task-13)") — Next's tracer does
# not include this package in the standalone output on its own. Node's
# module resolution walks up from /app/landing/server.js and finds
# /app/node_modules first, matching where every other runtime dependency
# (next, react, react-dom) already landed above.
COPY --from=build --chown=kurtar:kurtar /app/packages/api-client/dist ./node_modules/@kurtar/api-client/dist
COPY --from=build --chown=kurtar:kurtar /app/packages/api-client/package.json ./node_modules/@kurtar/api-client/package.json

USER kurtar
EXPOSE 4758

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:4758/" || exit 1

CMD ["node", "landing/server.js"]
