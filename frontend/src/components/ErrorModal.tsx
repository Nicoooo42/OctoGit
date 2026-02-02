import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import Modal from "./Modal";

interface ErrorModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  isOpen,
  title,
  message,
  onClose,
}) => {
  const { t } = useTranslation();
  const finalTitle = title ?? t("common.error");

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      title={finalTitle}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-700"
        >
          {t("common.ok")}
        </button>
      }
    >
      <p className="text-sm text-slate-300">{message}</p>
    </Modal>
  );
};

export default ErrorModal;
