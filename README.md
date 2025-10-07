# BciGit

BciGit est un client Git multi-plateforme conçu avec Electron, React, TypeScript et TailwindCSS. L'application reproduit l'expérience visuelle de GitKraken tout en offrant un moteur Git alimenté par `simple-git` et une base SQLite pour les dépôts récents.

## ✨ Fonctionnalités principales

- **Accueil** avec la liste des dépôts récents (SQLite + better-sqlite3) et un bouton pour ouvrir un dépôt via les dialogues Electron.
- **Vue dépôt** en trois colonnes (layout identique à GitKraken) :
  - Barre latérale gauche avec branches locales/distantes, raccourcis Pull/Push/Fetch et gestion de branches.
  - Graphe central des commits généré avec D3 (couleurs par branche, transitions fluides, sélection de commit).
  - Détails du commit sélectionné (auteur, date, fichiers modifiés, diff interactif).
- **Actions Git** : commit, checkout, création/suppression de branches, pull/push/fetch, merge.
- **IPC Electron sécurisé** via un preload isolé qui expose une API `window.BciGit` fortement typée.
- **UI moderne et responsive** : thème sombre, TailwindCSS, transitions, icônes Lucide.

## 🏗️ Architecture

```
BciGit/
├── electron/        # Processus principal Electron & preload (IPC)
├── backend/         # Services Node.js pour Git & SQLite
├── shared/          # Types TypeScript partagés entre backend et frontend
├── frontend/        # Application React + Tailwind (Vite)
└── dist/            # Fichiers compilés (générés)
```

## 🚀 Mise en route

### Prérequis
- Node.js 18+ et npm
- Outils natifs pour compiler `better-sqlite3` si nécessaire (build tools MSVC / Xcode / build-essential)

### Installation

```powershell
npm install
```

### Développement

Lance Vite (renderer), la compilation TypeScript (main & backend) et Electron en parallèle.

```powershell
npm run dev
```

### Build production

```powershell
npm run build
```

### Packaging multi-OS

```powershell
npm run package
```

Les artefacts seront générés dans `release/` (NSIS pour Windows, DMG pour macOS, AppImage/Deb pour Linux).

## 🧩 Technologies clés

- **Electron 29** pour le shell multi-OS
- **React 18 + Vite** pour le renderer
- **TypeScript** de bout en bout (main, preload, backend, frontend)
- **TailwindCSS** pour le styling
- **D3** pour le graphe de commits
- **simple-git** pour orchestrer Git
- **better-sqlite3** pour le stockage local
- **Lucide React Icons** pour l'iconographie

## 📂 Scripts npm

| Script | Description |
| --- | --- |
| `npm run dev` | Démarre l'environnement de développement (Vite + tsc --watch + Electron) |
| `npm run build` | Compile le frontend (Vite) et le backend/main (tsc) |
| `npm run build:renderer` | Build du frontend uniquement |
| `npm run build:electron` | Build du backend + processus principal |
| `npm run package` | Build complet puis packaging via electron-builder |

## 🔒 Sécurité IPC

Le canal IPC est encapsulé dans `electron/preload.ts`. L'API exposée applique un schéma de réponse uniforme (`{ success, data | error }`) pour simplifier la gestion des erreurs côté renderer.

## 🧪 Suivi améliorations

- Synchronisation PR GitHub (à intégrer)
- Gestion fine des stages et du commit amend
- Affichage avancé du graphe (zoom, filtrage par branche)

---

BciGit apporte une expérience GitKraken-like riche et extensible, tout en restant 100 % open source et cross-platform.
