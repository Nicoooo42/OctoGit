import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Config: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [gitlabUrl, setGitlabUrl] = useState('https://gitlab.com');
  const [gitlabToken, setGitlabToken] = useState('');
  const [gitlabStatus, setGitlabStatus] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setUsername(usernameResult.success ? usernameResult.data : '');
      setEmail(emailResult.success ? emailResult.data : '');
      setGitlabUrl(gitlabUrlResult.success && gitlabUrlResult.data ? gitlabUrlResult.data : 'https://gitlab.com');
      setGitlabToken(gitlabTokenResult.success ? gitlabTokenResult.data : '');
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
        window.BciGit.setGitLabConfig('token', gitlabToken)
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
    <div className="p-8 max-w-2xl mx-auto">
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
    </div>
  );
};

export default Config;
