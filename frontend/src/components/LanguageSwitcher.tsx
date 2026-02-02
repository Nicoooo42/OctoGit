import React from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n/config";
import { LANGUAGE_STORAGE_KEY } from "../i18n/config";
import { supportedLanguages } from "../i18n/resources";

const LanguageSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = event.target.value;
    void i18n.changeLanguage(newLanguage);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
    } catch (error) {
      console.warn("[i18n] unable to persist language", error);
    }
  };

  return (
    <label className="flex items-center gap-1 text-xs text-slate-400" title={t("language.switcherAria") ?? undefined}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={currentLanguage}
        onChange={handleChange}
        onMouseDown={(event) => event.stopPropagation()}
        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-300 focus:border-cyan-400 focus:outline-none"
        aria-label={t("language.switcherAria") ?? undefined}
      >
        {supportedLanguages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
};

export default LanguageSwitcher;
