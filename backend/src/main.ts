import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
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
