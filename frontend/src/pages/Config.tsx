import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Loading from '../components/Loading';
import type { BackendResponse } from '../types/git';
import { getBciGit, tryGetBciGit, isSuccess } from '../utils/bciGit';

const stringOr = (response: BackendResponse<string>, fallback: string): string =>
  (isSuccess(response) && response.data ? response.data : fallback);

const booleanOr = (response: BackendResponse<string>, fallback = false): boolean =>
  (isSuccess(response) ? response.data === 'true' : fallback);

const Config: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');
  const [gitlabToken, setGitlabToken] = useState('');
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [copilotCliUrl, setCopilotCliUrl] = useState('localhost:4321');
  const [copilotModel, setCopilotModel] = useState('gpt-4.1');
  const [copilotSystemPrompt, setCopilotSystemPrompt] = useState('');
  const [copilotServerStatus, setCopilotServerStatus] = useState<string | null>(null);
  const [copilotServerBusy, setCopilotServerBusy] = useState(false);
  const [copilotServerAutostart, setCopilotServerAutostart] = useState(false);
  const [periodicFetchEnabled, setPeriodicFetchEnabled] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const bciGit = tryGetBciGit();
      if (!bciGit) {
        return;
      }
      const [usernameResult, emailResult, gitlabUrlResult, gitlabTokenResult] = await Promise.all([
        bciGit.getGitConfig('user.name'),
        bciGit.getGitConfig('user.email'),
        bciGit.getGitLabConfig('url'),
        bciGit.getGitLabConfig('token')
      ]);
      const [enabledResult, cliUrlResult, modelResult, systemPromptResult, autostartResult] = await Promise.all([
        bciGit.getCopilotConfig('enabled'),
        bciGit.getCopilotConfig('cli_url'),
        bciGit.getCopilotConfig('model'),
        bciGit.getCopilotConfig('system'),
        bciGit.getCopilotConfig('server_autostart')
      ]);
      setUsername(stringOr(usernameResult, ''));
      setEmail(stringOr(emailResult, ''));
      setGitlabUrl(stringOr(gitlabUrlResult, 'https://gitlab.com'));
      setGitlabToken(stringOr(gitlabTokenResult, ''));
      setCopilotEnabled(booleanOr(enabledResult));
      setCopilotCliUrl(stringOr(cliUrlResult, 'localhost:4321'));
      setCopilotModel(stringOr(modelResult, 'gpt-4.1'));
      setCopilotServerAutostart(booleanOr(autostartResult));
      const systemPromptValue = stringOr(systemPromptResult, '');
      setCopilotSystemPrompt(systemPromptValue || t('config.copilot.systemPromptPlaceholder'));

      const periodicFetchResult = await bciGit.getAppConfig('periodic_fetch_enabled');
      setPeriodicFetchEnabled(booleanOr(periodicFetchResult));
    } catch (e) {
      console.error('Erreur lors du chargement de la config:', e);
    }
  }, [t]);

  useEffect(() => {
    // Load every config bucket up front to minimize IPC chatter once the form renders.
    void loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setStatus(null);
    setLoading(true);
    try {
      const bciGit = getBciGit();
      await Promise.all([
        bciGit.setGitConfig('user.name', username, false),
        bciGit.setGitConfig('user.email', email, false),
        bciGit.setAppConfig('default_user_name', username),
        bciGit.setAppConfig('default_user_email', email),
        bciGit.setGitLabConfig('url', gitlabUrl),
        bciGit.setGitLabConfig('token', gitlabToken),
        bciGit.setCopilotConfig('enabled', copilotEnabled ? 'true' : 'false'),
        bciGit.setCopilotConfig('cli_url', copilotCliUrl),
        bciGit.setCopilotConfig('model', copilotModel),
        bciGit.setCopilotConfig('system', copilotSystemPrompt),
        bciGit.setCopilotConfig('server_autostart', copilotServerAutostart ? 'true' : 'false'),
        bciGit.setAppConfig('periodic_fetch_enabled', periodicFetchEnabled ? 'true' : 'false')
      ]);
      setStatus({ type: 'success', message: t('config.status.success') });
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : t('config.status.error');
      setStatus({ type: 'error', message: `${t('config.status.error')}: ${errorMessage}` });
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setGitlabStatus(t('config.gitlab.testing'));
    try {
      const bciGit = getBciGit();
      // Sauvegarder d'abord
      await Promise.all([
        bciGit.setGitLabConfig('url', gitlabUrl),
        bciGit.setGitLabConfig('token', gitlabToken)
      ]);
      
      const result = await bciGit.testGitLabConnection();
      if (result.success) {
        if (result.data?.success) {
          const user = result.data.user;
          setGitlabStatus(t('config.gitlab.statusSuccess', { name: user?.name ?? '—', username: user?.username ?? '—' }));
          return;
        }
        setGitlabStatus(t('config.gitlab.statusFailure', { message: result.data?.error || t('config.gitlab.unknownError') }));
        return;
      }
      setGitlabStatus(t('config.gitlab.statusFailure', { message: result.error || t('config.gitlab.unknownError') }));
    } catch (e) {
      const message = e instanceof Error ? e.message : t('config.gitlab.unknownError');
      setGitlabStatus(t('config.gitlab.statusFailure', { message }));
      console.error(e);
    }
  };

  const parsePort = (value: string): number => {
    const trimmed = value.trim();
    if (!trimmed) return 4321;
    const match = trimmed.match(/:(\d{2,5})$/);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : 4321;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 4321;
  };

  const handleStartCopilotServer = async () => {
    setCopilotServerBusy(true);
    setCopilotServerStatus(t('config.copilot.serverStarting'));
    try {
      const bciGit = getBciGit();
      const port = parsePort(copilotCliUrl);
      const result = await bciGit.startCopilotServer(port);
      if (result.success) {
        if (result.data.started) {
          setCopilotServerStatus(t('config.copilot.serverStarted', { pid: result.data.pid ?? '—' }));
        } else {
          setCopilotServerStatus(t('config.copilot.serverAlreadyRunning', { pid: result.data.pid ?? '—' }));
        }
        return;
      }
      setCopilotServerStatus(t('config.copilot.serverStartError', { message: result.error }));
    } catch (e) {
      const message = e instanceof Error ? e.message : t('config.status.error');
      setCopilotServerStatus(t('config.copilot.serverStartError', { message }));
    } finally {
      setCopilotServerBusy(false);
    }
  };

  const handleStopCopilotServer = async () => {
    setCopilotServerBusy(true);
    setCopilotServerStatus(t('config.copilot.serverStopping'));
    try {
      const bciGit = getBciGit();
      const result = await bciGit.stopCopilotServer();
      if (result.success) {
        if (result.data.stopped) {
          setCopilotServerStatus(t('config.copilot.serverStopped', { pid: result.data.pid ?? '—' }));
        } else {
          setCopilotServerStatus(t('config.copilot.serverNotRunning'));
        }
        return;
      }
      setCopilotServerStatus(t('config.copilot.serverStopError', { message: result.error }));
    } catch (e) {
      const message = e instanceof Error ? e.message : t('config.status.error');
      setCopilotServerStatus(t('config.copilot.serverStopError', { message }));
    } finally {
      setCopilotServerBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header sticky avec navigation et actions */}
      <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-600"
              onClick={() => navigate("/repo")}
              type="button"
            >
              {t('config.backButton')}
            </button>
            <h1 className="text-2xl font-bold">{t('config.title')}</h1>
          </div>
          <div className="flex items-center gap-3">
            {status && (
              <span className={`text-sm px-3 py-1 rounded ${status.type === 'error' ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
                {status.message}
              </span>
            )}
            <button
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              onClick={handleSave}
              disabled={loading}
            >
              {t('config.saveButton')}
            </button>
          </div>
        </div>
      </div>
      
      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto">
      
      {/* Section Git */}
      <div className="mb-8 p-6 bg-slate-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-cyan-300">{t('config.git.title')}</h2>
        <div className="mb-4">
          <label htmlFor="username" className="block mb-1 font-medium">{t('config.git.usernameLabel')}</label>
          <input
            id="username"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t('config.git.usernamePlaceholder')}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="email" className="block mb-1 font-medium">{t('config.git.emailLabel')}</label>
          <input
            id="email"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('config.git.emailPlaceholder')}
          />
        </div>
        <div className="mb-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              checked={periodicFetchEnabled}
              onChange={(e) => setPeriodicFetchEnabled(e.target.checked)}
            />
            {t('config.git.fetchLabel')}
          </label>
          <p className="text-xs text-slate-400 mt-1">{t('config.git.fetchDescription')}</p>
        </div>
      </div>

      {/* Section GitLab */}
      <div className="mb-8 p-6 bg-slate-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">{t('config.gitlab.title')}</h2>
        <div className="mb-4">
          <label htmlFor="gitlabUrl" className="block mb-1 font-medium">{t('config.gitlab.urlLabel')}</label>
          <input
            id="gitlabUrl"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
            type="text"
            value={gitlabUrl}
            onChange={e => setGitlabUrl(e.target.value)}
            placeholder={t('config.gitlab.urlPlaceholder')}
          />
          <p className="text-xs text-slate-400 mt-1">{t('config.gitlab.urlHelp')}</p>
        </div>
        <div className="mb-4">
          <label htmlFor="gitlabToken" className="block mb-1 font-medium">{t('config.gitlab.tokenLabel')}</label>
          <input
            id="gitlabToken"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100 font-mono"
            type="password"
            value={gitlabToken}
            onChange={e => setGitlabToken(e.target.value)}
            placeholder={t('config.gitlab.tokenPlaceholder')}
          />
          <p className="text-xs text-slate-400 mt-1">
            {t('config.gitlab.tokenHelp')}
          </p>
        </div>
        <button
          type="button"
          className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 mb-4"
          onClick={handleTestConnection}
        >
          {t('config.gitlab.testButton')}
        </button>
        {gitlabStatus && (
          <div className={`text-sm p-3 rounded ${gitlabStatus.includes('✅') ? 'bg-green-900/30 text-green-300' : 'bg-amber-900/30 text-amber-300'}`}>
            {gitlabStatus}
          </div>
        )}
      </div>

      {/* Section Copilot */}
      <div className="mb-8 p-6 bg-slate-800 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-emerald-300">{t('config.copilot.title')}</h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              checked={copilotEnabled}
              onChange={(e) => setCopilotEnabled(e.target.checked)}
            />
            {t('config.copilot.enableLabel')}
          </label>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          {t('config.copilot.description')}
        </p>
        <div className="mb-6 rounded border border-emerald-500/40 bg-emerald-900/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-semibold text-emerald-200">
            {t('config.copilot.serverModeTitle')}
          </p>
          <p className="mt-1 text-emerald-100/90">
            {t('config.copilot.serverModeDescription')}
          </p>
          <a
            className="mt-2 inline-block text-emerald-200 underline decoration-emerald-400/70 underline-offset-2 hover:text-emerald-100"
            href="https://github.com/github/copilot-sdk/blob/main/docs/getting-started.md#running-the-cli-in-server-mode"
            target="_blank"
            rel="noreferrer"
          >
            {t('config.copilot.serverModeLinkLabel')}
          </a>
        </div>
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              onClick={handleStartCopilotServer}
              disabled={copilotServerBusy}
            >
              {t('config.copilot.serverStartButton')}
            </button>
            <button
              type="button"
              className="w-full rounded border border-emerald-500/60 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-900/30 disabled:opacity-50"
              onClick={handleStopCopilotServer}
              disabled={copilotServerBusy}
            >
              {t('config.copilot.serverStopButton')}
            </button>
          </div>
          {copilotServerStatus && (
            <div className="rounded bg-emerald-900/20 px-3 py-2 text-xs text-emerald-200">
              {copilotServerStatus}
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-sm text-slate-200 mt-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              checked={copilotServerAutostart}
              onChange={(e) => setCopilotServerAutostart(e.target.checked)}
              disabled={!copilotEnabled}
            />
            {t('config.copilot.serverAutostart')}
          </label>
          <p className="text-xs text-slate-400 mt-1">{t('config.copilot.serverAutostartDescription')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="copilotCliUrl" className="block mb-1 font-medium">{t('config.copilot.urlLabel')}</label>
            <input
              id="copilotCliUrl"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="text"
              value={copilotCliUrl}
              onChange={(e) => setCopilotCliUrl(e.target.value)}
              placeholder={t('config.copilot.urlPlaceholder')}
              disabled={!copilotEnabled}
            />
          </div>
          <div>
            <label htmlFor="copilotModel" className="block mb-1 font-medium">{t('config.copilot.modelLabel')}</label>
            <input
              id="copilotModel"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="text"
              value={copilotModel}
              onChange={(e) => setCopilotModel(e.target.value)}
              placeholder={t('config.copilot.modelPlaceholder')}
              disabled={!copilotEnabled}
            />
          </div>
        </div>
        <div className="mb-4">
          <label htmlFor="copilotSystemPrompt" className="block mb-1 font-medium">{t('config.copilot.systemPromptPlaceholder')}</label>
          <textarea
            id="copilotSystemPrompt"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100 font-mono"
            value={copilotSystemPrompt}
            onChange={e => setCopilotSystemPrompt(e.target.value)}
            placeholder=""
            rows={3}
            disabled={!copilotEnabled}
          />
          <p className="text-xs text-slate-400 mt-1">{t('config.copilot.systemPromptHelp')}</p>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          {t('config.copilot.tip')}
        </p>
      </div>
        </div>
      </div>
      {loading && <Loading message={t('config.loadingMessage')} />}
    </div>
  );
};

export default Config;
