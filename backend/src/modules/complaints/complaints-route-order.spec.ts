import { Module, ValidationPipe } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { NestExpressApplication } from "@nestjs/platform-express";
import { NextFunction, Request, Response } from "express";
import { ComplaintsModule } from "./complaints.module";
import { ComplaintsService } from "./complaints.service";
import { PrismaModule } from "../../prisma/prisma.module";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../notifications/email/email.service";
import { ReservationsModule } from "../reservations/reservations.module";
import { ReservationsService } from "../reservations/reservations.service";

/**
 * [I3 fix] ComplaintsModule now imports the real ReservationsModule (for
 * ComplaintsService.adminRefund's dependency on
 * ReservationsService.refundRedeemed) — which itself imports PushModule
 * and needs PaymentsFacadeService/OutboxService (both @Global, but only
 * actually registered where PaymentsCoreModule/OutboxCoreModule are part
 * of the compiled graph, which this narrow routing test deliberately
 * never pulls in). Swapped out wholesale via `overrideModule` rather than
 * chasing every transitive provider individually — this test's only job
 * is proving controller REGISTRATION ORDER, nothing about reservations or
 * push.
 */
@Module({
  providers: [
    { provide: ReservationsService, useValue: { refundRedeemed: jest.fn() } },
  ],
  exports: [ReservationsService],
})
class StubReservationsModule {}

/**
 * [Fix round, Critical 1] Regression test for the route-shadowing bug:
 * MerchantComplaintsController's literal `GET /complaints/assigned`
 * (@Controller("complaints/assigned")) and ComplaintsController's
 * parameterized `GET /complaints/:id` (@Controller("complaints")) are TWO
 * DIFFERENT controller classes whose full route paths happen to overlap
 * for the literal string "assigned". Express matches routes in
 * REGISTRATION order (not by "which pattern is more specific"), and Nest
 * registers a module's controllers — and therefore their routes — in the
 * `controllers` array's declared order. If ComplaintsController were
 * registered first, every request to /complaints/assigned would
 * permanently match `:id` with id="assigned" instead.
 *
 * This boots the REAL ComplaintsModule (not a hand-rolled three-route
 * stand-in) so a future reordering of complaints.module.ts's controllers
 * array — by anyone, for any reason — fails this test immediately. Every
 * other constructor dependency (PrismaService/EmailService/ConfigService,
 * needed transitively by ComplaintSlaCronService and EmailModule) is
 * mocked; only ComplaintsService's two methods under test are asserted
 * on, via distinctive mock return values that prove WHICH handler
 * actually ran — not just the HTTP status code, which alone wouldn't
 * distinguish "the correct handler ran and returned 200" from "the wrong
 * handler happened to also return something 200-shaped".
 *
 * Auth guards (JwtAuthGuard/ActorsGuard/MerchantApprovalGuard) are global
 * APP_GUARDs registered by AuthModule in the real app, not exercised here
 * — this test is deliberately scoped to routing/dispatch only (already
 * covered elsewhere: reservations/offers/etc.'s own guard behavior is
 * unit-tested against their services directly, and every controller's
 * @Actors annotation is reviewed by hand). A tiny middleware injects a
 * fake authenticated principal directly onto `req.user` so
 * `@CurrentUser()` has something to read.
 */
describe("Complaints route registration order — regression for the /complaints/assigned shadowing bug", () => {
  let app: NestExpressApplication;
  let server: import("http").Server;
  let baseUrl: string;

  const listAssignedMock = jest.fn();
  const getMineMock = jest.fn();
  const getAssignedMock = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // PrismaModule is imported explicitly (rather than relying on its
      // real @Global() registration, which only takes effect when it's
      // actually part of the compiled graph) purely so PrismaService's
      // token exists to override below — ComplaintSlaCronService (one of
      // ComplaintsModule's own providers) injects it transitively and
      // this test never calls anything that touches the database.
      imports: [
        ComplaintsModule,
        PrismaModule,
        ConfigModule.forRoot({ isGlobal: true }),
      ],
    })
      .overrideModule(ReservationsModule)
      .useModule(StubReservationsModule)
      .overrideProvider(ComplaintsService)
      .useValue({
        create: jest.fn(),
        listMine: jest.fn(),
        getMine: getMineMock,
        listAssigned: listAssignedMock,
        getAssigned: getAssignedMock,
        addMessage: jest.fn(),
        adminList: jest.fn(),
        adminGet: jest.fn(),
        adminResolve: jest.fn(),
        adminEscalate: jest.fn(),
        adminRefund: jest.fn(),
      })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(EmailService)
      .useValue({ sendEmail: jest.fn().mockResolvedValue(true) })
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // Stand-in for what JwtAuthGuard/Passport would normally populate —
      // both @CurrentUser("id") and @CurrentUser("merchantId") read off
      // the same object regardless of which handler ends up invoked.
      (req as unknown as { user: unknown }).user = {
        id: "consumer-or-merchant-user-1",
        actor: "MERCHANT",
        merchantId: "merchant-1",
      };
      next();
    });
    app.setGlobalPrefix("api");
    // Mirrors main.ts's real global pipe so query-param DTO defaults
    // (page=1/pageSize=20) actually hydrate, same as production.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  });

  beforeEach(() => {
    listAssignedMock.mockReset();
    getMineMock.mockReset();
    getAssignedMock.mockReset();
  });

  it("GET /api/complaints/assigned dispatches to MerchantComplaintsController.listAssigned, NOT ComplaintsController's :id handler", async () => {
    listAssignedMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    getMineMock.mockResolvedValue({ WRONG_HANDLER: "this must never appear" });

    const res = await fetch(`${baseUrl}/api/complaints/assigned`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(listAssignedMock).toHaveBeenCalledWith(
      "merchant-1",
      undefined,
      1,
      20,
    );
    expect(getMineMock).not.toHaveBeenCalled();
  });

  it("GET /api/complaints/:id still dispatches to ComplaintsController.getMine for a genuine id", async () => {
    getMineMock.mockResolvedValue({ id: "real-complaint-id", status: "OPEN" });

    const res = await fetch(`${baseUrl}/api/complaints/real-complaint-id`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: "real-complaint-id", status: "OPEN" });
    expect(getMineMock).toHaveBeenCalledWith(
      "consumer-or-merchant-user-1",
      "real-complaint-id",
    );
    expect(listAssignedMock).not.toHaveBeenCalled();
  });

  // [I18 fix] Regression test: merchant-web calls this route (via
  // client.complaints.getAssigned) instead of the CONSUMER-only GET
  // /complaints/:id it used to 403 on. Also proves the three-segment
  // /complaints/assigned/:id doesn't get shadowed by either the
  // two-segment /complaints/:id (ComplaintsController) or the bare
  // /complaints/assigned (MerchantComplaintsController.listAssigned).
  it("GET /api/complaints/assigned/:id dispatches to MerchantComplaintsController.getAssigned, not ComplaintsController's :id handler or listAssigned", async () => {
    getAssignedMock.mockResolvedValue({
      id: "real-complaint-id",
      status: "OPEN",
    });
    getMineMock.mockResolvedValue({ WRONG_HANDLER: "this must never appear" });

    const res = await fetch(
      `${baseUrl}/api/complaints/assigned/real-complaint-id`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ id: "real-complaint-id", status: "OPEN" });
    expect(getAssignedMock).toHaveBeenCalledWith(
      "merchant-1",
      "real-complaint-id",
    );
    expect(getMineMock).not.toHaveBeenCalled();
    expect(listAssignedMock).not.toHaveBeenCalled();
  });
});
