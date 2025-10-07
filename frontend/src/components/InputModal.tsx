import React, { useEffect, useRef, useState } from "react";

interface InputModalProps {
  isOpen: boolean;
  title: string;
  placeholder: string;
  defaultValue?: string;
  checkboxLabel?: string;
  onConfirm: (value: string, checked?: boolean) => void;
  onCancel: () => void;
}

const InputModal: React.FC<InputModalProps> = ({
  isOpen,
  title,
  placeholder,
  defaultValue = "",
  checkboxLabel,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const [checked, setChecked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      setChecked(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, defaultValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim(), checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-96 rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">{title}</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
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
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-600"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-700 disabled:opacity-50"
              disabled={!value.trim()}
            >
              Confirmer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InputModal;