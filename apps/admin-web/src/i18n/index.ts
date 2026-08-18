import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import common from "./locales/tr/common.json";
import auth from "./locales/tr/auth.json";
import dashboard from "./locales/tr/dashboard.json";
import merchants from "./locales/tr/merchants.json";
import complaints from "./locales/tr/complaints.json";
import moderation from "./locales/tr/moderation.json";
import settlements from "./locales/tr/settlements.json";
import pricing from "./locales/tr/pricing.json";
import ratings from "./locales/tr/ratings.json";
import exportsNs from "./locales/tr/exports.json";
import invoices from "./locales/tr/invoices.json";

/**
 * One namespace per feature area, structured so an `en` locale can be
 * added later (brief: "structured so en can be added later") by adding an
 * `en` sibling under `resources` with the SAME namespace keys — nothing
 * else in the app changes, since every component calls
 * `useTranslation("<namespace>")` rather than importing a JSON file
 * directly.
 */
export const defaultNS = "common";

export const resources = {
  tr: {
    common,
    auth,
    dashboard,
    merchants,
    complaints,
    moderation,
    settlements,
    pricing,
    ratings,
    invoices,
    exports: exportsNs,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: "tr",
  fallbackLng: "tr",
  defaultNS,
  ns: Object.keys(resources.tr),
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
