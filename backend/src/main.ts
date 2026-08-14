import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  // rawBody: true additionally populates req.rawBody (a Buffer) alongside
  // the normal parsed req.body — the payments webhook controller needs
  // the raw bytes for provider signature verification
  // (modules/payments-core/payment-provider.interface.ts's
  // parseWebhook(rawBody, headers)); every other route is unaffected.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // docker-compose.prod.yml puts the api container behind a reverse proxy
  // (host nginx or a Cloudflare tunnel) — without this, Express's
  // req.ip resolves to the PROXY's IP for every request, not the real
  // client. ThrottlerGuard (app.module.ts's global APP_GUARD) keys its
  // rate-limit buckets off req.ip, so every request would collapse into
  // ONE global bucket instead of one per client — either locking out every
  // user the moment any single user trips a limit, or (depending on the
  // limit) never meaningfully throttling anyone. `1` trusts exactly one
  // hop (the proxy directly in front of this container), matching the
  // single-reverse-proxy topology docker-compose.prod.yml documents — not
  // an open-ended "trust every X-Forwarded-For hop" which would let a
  // client spoof its own IP by sending that header directly.
  app.set("trust proxy", 1);

  app.use(helmet());
  // Required for the auth module's httpOnly refresh-token cookie (web
  // panel transport) — Express doesn't parse cookies into req.cookies
  // without this.
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Nest calls onModuleDestroy on SIGTERM/SIGINT so connections (DB, Redis —
  // added in later tasks) drain cleanly instead of being cut mid-request.
  app.enableShutdownHooks();

  const port = process.env.KURTAR_API_PORT || 4750;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`kurtar-api listening on http://localhost:${port}/api`);
}

bootstrap().catch((error) => {
  // Fail fast and loud: a bootstrap error (e.g. env validation) must abort
  // the process with a clear message, not hang or surface as a silent 502.
  // eslint-disable-next-line no-console
  console.error("Fatal error during bootstrap:", error);
  process.exit(1);
});
