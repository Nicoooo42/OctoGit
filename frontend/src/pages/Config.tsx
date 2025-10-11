import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Loading from '../components/Loading';

const Config: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');
  const [gitlabToken, setGitlabToken] = useState('');
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
  const [ollamaModel, setOllamaModel] = useState('llama2');
  const [ollamaTemperature, setOllamaTemperature] = useState('0.7');
  const [ollamaNumPredict, setOllamaNumPredict] = useState('100');
  const [ollamaNumCtx, setOllamaNumCtx] = useState('2048');
  const [ollamaTopP, setOllamaTopP] = useState('0.9');
  const [ollamaTopK, setOllamaTopK] = useState('40');
  const [ollamaSystemPrompt, setOllamaSystemPrompt] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      if (!window.BciGit) return;
      const [usernameResult, emailResult, gitlabUrlResult, gitlabTokenResult] = await Promise.all([
        window.BciGit.getGitConfig('user.name'),
        window.BciGit.getGitConfig('user.email'),
        window.BciGit.getGitLabConfig('url'),
        window.BciGit.getGitLabConfig('token')
      ]);
      const [enabledResult, urlResult, modelResult, temperatureResult, numPredictResult, numCtxResult, topPResult, topKResult, systemPromptResult] = await Promise.all([
        window.BciGit.getOllamaConfig('enabled'),
        window.BciGit.getOllamaConfig('url'),
        window.BciGit.getOllamaConfig('model'),
        window.BciGit.getOllamaConfig('temperature'),
        window.BciGit.getOllamaConfig('num_predict'),
        window.BciGit.getOllamaConfig('num_ctx'),
        window.BciGit.getOllamaConfig('top_p'),
        window.BciGit.getOllamaConfig('top_k'),
        window.BciGit.getOllamaConfig('system')
      ]);
      setUsername(usernameResult.success ? usernameResult.data : '');
      setEmail(emailResult.success ? emailResult.data : '');
      setGitlabUrl(gitlabUrlResult.success && gitlabUrlResult.data ? gitlabUrlResult.data : 'https://gitlab.com');
      setGitlabToken(gitlabTokenResult.success ? gitlabTokenResult.data : '');
      setOllamaEnabled(enabledResult.success ? enabledResult.data === 'true' : false);
      setOllamaUrl(urlResult.success && urlResult.data ? urlResult.data : 'http://localhost:11434');
      setOllamaModel(modelResult.success && modelResult.data ? modelResult.data : 'llama2');
      setOllamaTemperature(temperatureResult.success && temperatureResult.data ? temperatureResult.data : '0.7');
      setOllamaNumPredict(numPredictResult.success && numPredictResult.data ? numPredictResult.data : '100');
      setOllamaNumCtx(numCtxResult.success && numCtxResult.data ? numCtxResult.data : '2048');
      setOllamaTopP(topPResult.success && topPResult.data ? topPResult.data : '0.9');
  setOllamaTopK(topKResult.success && topKResult.data ? topKResult.data : '40');
  setOllamaSystemPrompt(systemPromptResult.success && systemPromptResult.data ? systemPromptResult.data : '');
    } catch (e) {
      console.error('Erreur lors du chargement de la config:', e);
    }
  };

  const handleSave = async () => {
    setStatus('Enregistrement en cours...');
    setLoading(true);
    try {
      if (!window.BciGit) {
        throw new Error('API non disponible');
      }
      await Promise.all([
        window.BciGit.setGitConfig('user.name', username, false),
        window.BciGit.setGitConfig('user.email', email, false),
        window.BciGit.setGitLabConfig('url', gitlabUrl),
        window.BciGit.setGitLabConfig('token', gitlabToken),
        window.BciGit.setOllamaConfig('enabled', ollamaEnabled ? 'true' : 'false'),
        window.BciGit.setOllamaConfig('url', ollamaUrl),
        window.BciGit.setOllamaConfig('model', ollamaModel),
        window.BciGit.setOllamaConfig('temperature', ollamaTemperature),
        window.BciGit.setOllamaConfig('num_predict', ollamaNumPredict),
        window.BciGit.setOllamaConfig('num_ctx', ollamaNumCtx),
        window.BciGit.setOllamaConfig('top_p', ollamaTopP),
        window.BciGit.setOllamaConfig('top_k', ollamaTopK),
        window.BciGit.setOllamaConfig('system', ollamaSystemPrompt)
      ]);
      setStatus('Configuration enregistrée !');
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur lors de l'enregistrement";
      setStatus(message);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setGitlabStatus('Test de connexion en cours...');
    try {
      if (!window.BciGit) {
        throw new Error('API non disponible');
      }
      // Sauvegarder d'abord
      await window.BciGit.setGitLabConfig('url', gitlabUrl);
      await window.BciGit.setGitLabConfig('token', gitlabToken);
      
      const result = await window.BciGit.testGitLabConnection();
      if (result.success && result.data?.success) {
        const user = result.data.user;
        setGitlabStatus(`✅ Connecté en tant que ${user?.name} (@${user?.username})`);
      } else {
        setGitlabStatus(`❌ Échec: ${result.data?.error || 'Erreur inconnue'}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur lors du test";
      setGitlabStatus(`❌ Échec: ${message}`);
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto overflow-y-auto h-full">
      <button
        className="mb-8 bg-slate-700 text-white px-4 py-2 rounded hover:bg-slate-600"
        onClick={() => navigate("/")}
        type="button"
      >
        ← Retour à l'accueil
      </button>
      <h1 className="text-2xl font-bold mb-6">Configuration</h1>
      
      {/* Section Git */}
      <div className="mb-8 p-6 bg-slate-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-cyan-300">Configuration Git</h2>
        <div className="mb-4">
          <label htmlFor="username" className="block mb-1 font-medium">Nom d'utilisateur</label>
          <input
            id="username"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Votre nom Git"
          />
        </div>
        <div className="mb-4">
          <label htmlFor="email" className="block mb-1 font-medium">Email</label>
          <input
            id="email"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Votre email Git"
          />
        </div>
      </div>

      {/* Section GitLab */}
      <div className="mb-8 p-6 bg-slate-800 rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-orange-400">Connexion GitLab</h2>
        <div className="mb-4">
          <label htmlFor="gitlabUrl" className="block mb-1 font-medium">URL GitLab</label>
          <input
            id="gitlabUrl"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
            type="text"
            value={gitlabUrl}
            onChange={e => setGitlabUrl(e.target.value)}
            placeholder="https://gitlab.com"
          />
          <p className="text-xs text-slate-400 mt-1">URL de votre instance GitLab (ex: https://gitlab.com ou votre instance privée)</p>
        </div>
        <div className="mb-4">
          <label htmlFor="gitlabToken" className="block mb-1 font-medium">Token d'accès personnel</label>
          <input
            id="gitlabToken"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100 font-mono"
            type="password"
            value={gitlabToken}
            onChange={e => setGitlabToken(e.target.value)}
            placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
          />
          <p className="text-xs text-slate-400 mt-1">
            Créez un token dans GitLab → Preferences → Access Tokens avec les scopes: api, read_api, read_repository, write_repository
          </p>
        </div>
        <button
          type="button"
          className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 mb-4"
          onClick={handleTestConnection}
        >
          Tester la connexion
        </button>
        {gitlabStatus && (
          <div className={`text-sm p-3 rounded ${gitlabStatus.includes('✅') ? 'bg-green-900/30 text-green-300' : 'bg-amber-900/30 text-amber-300'}`}>
            {gitlabStatus}
          </div>
        )}
      </div>

      {/* Section Ollama */}
      <div className="mb-8 p-6 bg-slate-800 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-emerald-300">Ollama (messages de commit)</h2>
          <label className="inline-flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-600 bg-slate-900"
              checked={ollamaEnabled}
              onChange={(e) => setOllamaEnabled(e.target.checked)}
            />
            Activer
          </label>
        </div>
        <p className="text-xs text-slate-400 mb-6">
          Configurez votre instance Ollama locale ou distante pour générer automatiquement des messages de commit. Cette fonctionnalité est optionnelle.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="ollamaUrl" className="block mb-1 font-medium">URL du serveur</label>
            <input
              id="ollamaUrl"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://localhost:11434"
              disabled={!ollamaEnabled}
            />
          </div>
          <div>
            <label htmlFor="ollamaModel" className="block mb-1 font-medium">Modèle</label>
            <input
              id="ollamaModel"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="llama2"
              disabled={!ollamaEnabled}
            />
          </div>
          <div>
            <label htmlFor="ollamaTemperature" className="block mb-1 font-medium">Température</label>
            <input
              id="ollamaTemperature"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="number"
              step="0.1"
              value={ollamaTemperature}
              onChange={(e) => setOllamaTemperature(e.target.value)}
              min="0"
              max="2"
              disabled={!ollamaEnabled}
            />
          </div>
          <div>
            <label htmlFor="ollamaNumPredict" className="block mb-1 font-medium">Longueur max (tokens)</label>
            <input
              id="ollamaNumPredict"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="number"
              value={ollamaNumPredict}
              onChange={(e) => setOllamaNumPredict(e.target.value)}
              min="16"
              max="512"
              disabled={!ollamaEnabled}
            />
          </div>
          <div>
            <label htmlFor="ollamaNumCtx" className="block mb-1 font-medium">Contexte (tokens)</label>
            <input
              id="ollamaNumCtx"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="number"
              value={ollamaNumCtx}
              onChange={(e) => setOllamaNumCtx(e.target.value)}
              min="512"
              max="8192"
              disabled={!ollamaEnabled}
            />
          </div>
          <div>
            <label htmlFor="ollamaTopP" className="block mb-1 font-medium">Top P</label>
            <input
              id="ollamaTopP"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="number"
              step="0.05"
              value={ollamaTopP}
              onChange={(e) => setOllamaTopP(e.target.value)}
              min="0"
              max="1"
              disabled={!ollamaEnabled}
            />
          </div>
          <div>
            <label htmlFor="ollamaTopK" className="block mb-1 font-medium">Top K</label>
            <input
              id="ollamaTopK"
              className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100"
              type="number"
              value={ollamaTopK}
              onChange={(e) => setOllamaTopK(e.target.value)}
              min="1"
              max="200"
              disabled={!ollamaEnabled}
            />
          </div>
        </div>
        <div className="mb-4">
          <label htmlFor="ollamaSystemPrompt" className="block mb-1 font-medium">System prompt (optionnel)</label>
          <textarea
            id="ollamaSystemPrompt"
            className="w-full border border-slate-600 bg-slate-900 rounded px-3 py-2 text-slate-100 font-mono"
            value={ollamaSystemPrompt}
            onChange={e => setOllamaSystemPrompt(e.target.value)}
            placeholder="Exemple : Vous êtes un assistant qui génère des messages de commit concis et pertinents."
            rows={3}
            disabled={!ollamaEnabled}
          />
          <p className="text-xs text-slate-400 mt-1">Ce prompt sera envoyé à Ollama dans le champ 'system' pour les modèles qui le supportent.</p>
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Conseil : assurez-vous que le serveur Ollama est accessible et que le modèle est déjà téléchargé.
        </p>
      </div>

      <button
        className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 disabled:opacity-50 w-full"
        onClick={handleSave}
        disabled={loading}
      >
        Sauvegarder toute la configuration
      </button>
      {status && (
        <div className={`mt-4 text-sm p-3 rounded ${status.includes('Erreur') ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'}`}>
          {status}
        </div>
      )}
      {loading && <Loading message="Sauvegarde en cours..." />}
    </div>
  );
};

export default Config;
