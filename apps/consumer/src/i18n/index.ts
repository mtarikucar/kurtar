import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import tr from "./tr.json";
import en from "./en.json";

/**
 * `tr` is the only UI language shipped for launch (the brief: "UI language
 * Turkish"), but the resource tree is keyed by locale from day one so
 * adding `en` support later is a translation-only change — no restructure.
 * No device-locale auto-detection: kurtar is Turkey-only for now, so
 * defaulting straight to `tr` (rather than wiring expo-localization)
 * avoids a mismatched-language first impression for a device that happens
 * to be set to a different system language.
 */
void i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: "tr",
  fallbackLng: "tr",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
