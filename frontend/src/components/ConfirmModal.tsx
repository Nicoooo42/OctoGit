import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const finalConfirmLabel = confirmLabel ?? t("common.confirm");
  const finalCancelLabel = cancelLabel ?? t("common.cancel");
  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          onConfirm();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onConfirm]);

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
            {finalCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-700"
          >
            {finalConfirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-300">{message}</p>
    </Modal>
  );
};

export default ConfirmModal;