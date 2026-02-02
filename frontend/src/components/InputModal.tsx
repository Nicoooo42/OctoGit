import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import Modal from "./Modal";

interface InputModalProps {
  isOpen: boolean;
  title: string;
  placeholder: string;
  defaultValue?: string;
  checkboxLabel?: string;
  onConfirm: (value: string, checked?: boolean) => void;
  onCancel: () => void;
  /** If provided, enables AI suggestions with this callback */
  onGenerateSuggestions?: () => Promise<string[]>;
  /** Label for AI generate button */
  aiButtonLabel?: string;
  /** Label shown while generating */
  aiLoadingLabel?: string;
  /** Title for suggestions section */
  aiSuggestionsTitle?: string;
}

const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  title,
  placeholder,
  defaultValue = "",
  checkboxLabel,
  onConfirm,
  onCancel,
  onGenerateSuggestions,
  aiButtonLabel,
  aiLoadingLabel,
  aiSuggestionsTitle,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  const [checked, setChecked] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setChecked(false);
      setSuggestions([]);
      setSuggestionsError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultValue]);

  const handleGenerateSuggestions = async () => {
    if (!onGenerateSuggestions) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const result = await onGenerateSuggestions();
      setSuggestions(result);
      if (!value.trim() && result[0]) {
        setValue(result[0]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSuggestionsError(message);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim(), checked);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            form="input-form"
            className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-700 disabled:opacity-50"
            disabled={!value.trim()}
          >
            {t("common.confirm")}
          </button>
        </>
      }
    >
      <form id="input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
        />
        {onGenerateSuggestions && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleGenerateSuggestions}
              disabled={suggestionsLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {suggestionsLoading
                ? (aiLoadingLabel ?? t("sidebar.branchSuggestionsGenerating"))
                : (aiButtonLabel ?? t("sidebar.branchSuggestionsGenerate"))}
            </button>
            {suggestionsError && (
              <p className="mt-2 text-xs text-rose-300">{suggestionsError}</p>
            )}
            {suggestions.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-2">
                <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  {aiSuggestionsTitle ?? t("sidebar.branchSuggestionsTitle")}
                </div>
                <div className="flex flex-col gap-1">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setValue(suggestion)}
                      className="w-full rounded-md border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-left text-xs text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {checkboxLabel && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
            />
            {checkboxLabel}
          </label>
        )}
      </form>
    </Modal>
  );
};

export default InputModal;