import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolveEnvFilePath } from "./config/env-file";
import { validate } from "./config/env.validation";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The repo's .env.example (and any .env an operator creates from it)
      // lives at the repo root, but `npm run dev -w backend` runs with cwd
      // = backend/ — @nestjs/config's default cwd-relative lookup would
      // miss it. See config/env-file.ts for the full story.
      envFilePath: resolveEnvFilePath(),
      validate,
    }),
    HealthModule,
  ],
})
export class AppModule {}
