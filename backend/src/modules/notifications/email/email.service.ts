import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import * as fsp from "fs/promises";
import * as path from "path";
import * as Handlebars from "handlebars";
import { maskEmail } from "../../../common/helpers/pii-mask.helper";

Handlebars.registerHelper("currentYear", () => new Date().getFullYear());

export interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

/**
 * nodemailer + Handlebars email sender — port of kds's
 * backend/src/common/services/email.service.ts, with ONE deliberate
 * behavioral deviation: kds degrades to a log-only transport in EVERY
 * environment when SMTP isn't configured (logging an error in production
 * but still returning `true`, i.e. "sent"). The Task 7 brief instead wants
 * kurtar's boot to REFUSE a log-only transport in production — the same
 * fail-fast posture SmsService/MockPaymentProvider already enforce for
 * their own "no real delivery configured" case, so a prod deploy with no
 * SMTP configured cannot silently pretend to send merchant/consumer email.
 * Dev/test/staging without SMTP still gets the log-only mock (masked
 * recipient, no body/context leaked into logs — same PII discipline as
 * kds's iter-97 fix).
 *
 * Env vars mirror kds 1:1: EMAIL_HOST/EMAIL_PORT/EMAIL_USER/
 * EMAIL_PASSWORD/EMAIL_FROM/APP_NAME.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter?: Transporter;
  private readonly templatesPath: string;
  private readonly templateCache = new Map<
    string,
    HandlebarsTemplateDelegate
  >();
  private layoutPartialRegistered = false;

  constructor(private readonly configService: ConfigService) {
    // process.cwd(), not __dirname — matches kds (bundled prod builds run
    // from backend/, same as this repo's `npm run dev -w backend` /
    // `node dist/main.js`; see config/env-file.ts for the analogous
    // reasoning already established in this codebase).
    this.templatesPath = path.join(process.cwd(), "templates/emails");
    this.transporter = this.initializeTransporter();
  }

  private initializeTransporter(): Transporter | undefined {
    const host = this.configService.get<string>("EMAIL_HOST");
    const port = this.configService.get<number>("EMAIL_PORT");
    const user = this.configService.get<string>("EMAIL_USER");
    const pass = this.configService.get<string>("EMAIL_PASSWORD");
    const isProduction = process.env.NODE_ENV === "production";

    if (!host || !user || !pass) {
      if (isProduction) {
        throw new Error(
          "Refusing to boot: EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD are not " +
            "fully configured in production. A log-only mail transport is " +
            "not allowed in production — configure SMTP credentials.",
        );
      }
      this.logger.warn(
        "Email is not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD missing) — emails will be logged, not sent (NON-PRODUCTION ONLY).",
      );
      return undefined;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      // [Fix round 2, leg (b)] Explicit, bounded timeouts — an outbox
      // handler (MerchantStatusEmailHandler / OfferCancelledMerchantEmailHandler)
      // calling sendMail() is bound by the SAME "handler runtime must stay
      // well under the outbox worker's lease" reasoning as
      // ExpoPushProvider's fetch timeout. nodemailer's own defaults are
      // not unbounded, but making them explicit here keeps that guarantee
      // visible in one place rather than relying on a library default.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transporter.verify((error) => {
      if (error) {
        this.logger.error(`Email transporter verification failed: ${error}`);
      } else {
        this.logger.log("Email transporter is ready to send emails");
      }
    });
    return transporter;
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    const { to, subject, template, context } = options;
    let html: string;
    try {
      html = await this.compileTemplate(template, context);
    } catch (error) {
      this.logger.error(`Failed to compile template ${template}: ${error}`);
      throw new Error(`Email template ${template} not found or invalid`);
    }

    if (!this.transporter) {
      // Mock mode only ever reaches here in non-production
      // (initializeTransporter already refuses to boot without one in
      // production) — masked recipient, no context/body logged.
      this.logger.log(`[EMAIL MOCK] To: ${maskEmail(to)}`);
      this.logger.log(`[EMAIL MOCK] Subject: ${subject}`);
      this.logger.log(`[EMAIL MOCK] Template: ${template}`);
      this.logger.log(
        `[EMAIL MOCK] Context keys: ${Object.keys(context).join(", ")}`,
      );
      return true;
    }

    try {
      const from =
        this.configService.get<string>("EMAIL_FROM") ||
        this.configService.get<string>("EMAIL_USER");
      const appName = this.configService.get<string>("APP_NAME") || "Kurtar";
      const info = await this.transporter.sendMail({
        from: `"${appName}" <${from}>`,
        to,
        subject,
        html,
      });
      this.logger.log(
        `Email sent to ${maskEmail(to)}. Message ID: ${info.messageId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${maskEmail(to)}: ${error}`);
      return false;
    }
  }

  private async compileTemplate(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const compiled = await this.loadTemplate(templateName);
    return compiled(context);
  }

  private async loadTemplate(
    templateName: string,
  ): Promise<HandlebarsTemplateDelegate> {
    const cached = this.templateCache.get(templateName);
    if (cached) return cached;
    await this.ensureLayoutPartialRegistered();
    const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
    const source = await fsp.readFile(templatePath, "utf-8");
    const compiled = Handlebars.compile(source);
    this.templateCache.set(templateName, compiled);
    return compiled;
  }

  /**
   * Every content template (`{{#> layout title="..."}}...{{/layout}}`)
   * needs the shared "layout" block partial registered first — a
   * process-wide Handlebars.registerPartial call, done at most once (the
   * `layoutPartialRegistered` guard), matching registerHelper("currentYear")'s
   * existing module-load-time registration style. Swallowed if
   * templates/emails/layout.hbs doesn't exist (e.g. a test fixture
   * directory with no layout of its own) — a content template that
   * genuinely needs it then fails with Handlebars' own clear
   * "the partial layout could not be found" error rather than this method
   * throwing a confusing ENOENT first.
   */
  private async ensureLayoutPartialRegistered(): Promise<void> {
    if (this.layoutPartialRegistered) return;
    try {
      const layoutPath = path.join(this.templatesPath, "layout.hbs");
      const source = await fsp.readFile(layoutPath, "utf-8");
      Handlebars.registerPartial("layout", source);
    } catch {
      // No layout.hbs at this templatesPath — fine, see doc comment above.
    }
    this.layoutPartialRegistered = true;
  }
}
