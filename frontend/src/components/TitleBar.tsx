import React from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

const TitleBar: React.FC = () => {
  const { t } = useTranslation();

  const handleMinimize = () => {
    window.BciGit.minimizeWindow();
  };

  const handleMaximize = () => {
    window.BciGit.maximizeWindow();
  };

  const handleClose = () => {
    window.BciGit.closeWindow();
  };

  const handleDoubleClick = () => {
    window.BciGit.maximizeWindow();
  };

  return (
    <div
      className="flex items-center justify-between bg-slate-800 px-4 py-2 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
      <div className="flex items-center gap-3">
        <div className="text-sm font-semibold text-slate-200">{t('common.appName')}</div>
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <LanguageSwitcher />
        </div>
      </div>
      <div className="flex space-x-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded"
          title={t('titleBar.minimize')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2 6h8v1H2z" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-8 flex items-center justify-center hover:bg-slate-700 rounded"
          title={t('titleBar.maximize')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3 3v6h6V3H3zm1 1h4v4H4V4z" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-8 flex items-center justify-center hover:bg-red-600 rounded"
          title={t('titleBar.close')}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;