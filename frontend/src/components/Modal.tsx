import React, { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, children, footer, onClose }) => {
  useEffect(() => {
    if (isOpen && onClose) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-96 rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-slate-100">{title}</h3>
        <div className="mb-6">{children}</div>
        {footer && <div className="flex gap-3">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;