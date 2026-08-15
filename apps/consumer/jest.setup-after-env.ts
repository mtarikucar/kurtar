// Runs AFTER the test framework is installed (unlike jest.setup.ts's
// `setupFiles`, which runs before `afterEach`/`describe` etc. exist) —
// this is where per-test lifecycle hooks belong.

// Safety net: a test that installs fake timers (otp-screen.test.tsx's
// resend-cooldown specs) but throws before its own `jest.useRealTimers()`
// would otherwise leave every LATER test file's real setInterval/setTimeout
// calls silently faked — this restores real timers unconditionally after
// every test, regardless of how it ended.
afterEach(() => {
  jest.useRealTimers();
});
