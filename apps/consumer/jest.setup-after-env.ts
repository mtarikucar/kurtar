/**
 * WHY package.json's jest block raises `testTimeout` to 20s.
 *
 * Jest's 5s default is a budget for the ASSERTION, and these suites spend
 * most of it on the transform instead: the first render in a file compiles
 * the whole component tree it touches. With a warm cache that is
 * invisible; with a cold one — the state of every fresh clone, and of any
 * CI runner without a cache hit — it blew the budget and four suites
 * failed on timeout alone. So a newcomer's very first `npm test` was red,
 * and green on the second run with no change in between, which is the
 * worst possible first impression: it teaches people to re-run instead of
 * to read.
 *
 * Not a mask over slowness. Nothing here asserts on time; the raised
 * budget only stops the compiler from being counted against the test.
 * Reproduce with `npx jest --clearCache && npm test`.
 */

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
