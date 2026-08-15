import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "./locales/tr/common.json";
import nav from "./locales/tr/nav.json";
import auth from "./locales/tr/auth.json";
import onboarding from "./locales/tr/onboarding.json";
import today from "./locales/tr/today.json";
import stores from "./locales/tr/stores.json";
import calendar from "./locales/tr/calendar.json";
import earnings from "./locales/tr/earnings.json";
import reputation from "./locales/tr/reputation.json";
import errors from "./locales/tr/errors.json";

/**
 * i18next bootstrap — Turkish only for now, but structured so a second
 * `resources.en.*` block slots in later with zero refactoring: every
 * screen already calls `useTranslation("<namespace>")` and reads keys via
 * `t(...)`, never a hardcoded string (per the task brief). Namespaces
 * mirror the app's feature folders 1:1 so a translator (or a future `en`
 * pass) can find the right file without hunting.
 */
export const defaultNS = "common";

void i18n.use(initReactI18next).init({
  lng: "tr",
  fallbackLng: "tr",
  defaultNS,
  ns: [
    "common",
    "nav",
    "auth",
    "onboarding",
    "today",
    "stores",
    "calendar",
    "earnings",
    "reputation",
    "errors",
  ],
  resources: {
    tr: {
      common,
      nav,
      auth,
      onboarding,
      today,
      stores,
      calendar,
      earnings,
      reputation,
      errors,
    },
  },
  interpolation: { escapeValue: false },
  // Deliberately the i18next DEFAULT (true) — shared/errors.ts's
  // getErrorMessage relies on `t(key, { defaultValue: "" })` resolving to a
  // real empty string for a missing errorCode key (its signal to fall back
  // to the generic message); `returnEmptyString: false` would make i18next
  // return the raw key instead, breaking that fallback silently.
  returnEmptyString: true,
});

export default i18n;
