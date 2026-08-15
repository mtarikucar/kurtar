/** Route path constants — the one place a path string is spelled out, so a
 * renamed path never means hunting every `<Link to="...">` in the app. */
export const ROUTES = {
  login: "/giris",
  signup: "/kayit",
  onboarding: "/baslangic",
  today: "/bugun",
  stores: "/magaza",
  calendar: "/takvim",
  earnings: "/kazanc",
  reputation: "/puanlar",
} as const;
