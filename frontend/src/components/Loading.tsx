import React from "react";
import { useTranslation } from "react-i18next";

interface LoadingProps {
  message?: string;
}

const Loading: React.FC<LoadingProps> = ({ message }) => {
  const { t } = useTranslation();
  const resolvedMessage = message ?? t("common.loading");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-lg bg-slate-800 p-6 shadow-xl">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400"></div>
        <p className="text-sm text-slate-300">{resolvedMessage}</p>
      </div>
    </div>
  );
};

export default Loading;