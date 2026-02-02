import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { resources } from "./resources";

export const LANGUAGE_STORAGE_KEY = "octogit.language";

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: "en",
      supportedLngs: Object.keys(resources),
      detection: {
        order: ["localStorage", "navigator"],
        caches: ["localStorage"],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY
      },
      interpolation: {
        escapeValue: false
      }
    })
    .catch((error) => {
      console.error("[i18n] Failed to initialize", error);
    });
}

export default i18n;
