# BciGit

BciGit est un client Git multi-plateforme conçu avec Electron, React, TypeScript et TailwindCSS. L'application offrant un moteur Git alimenté par `simple-git` et une base SQLite pour les dépôts récents.

## ✨ Fonctionnalités principales

- **Accueil** avec la liste des dépôts récents (SQLite + better-sqlite3) et un bouton pour ouvrir un dépôt via les dialogues Electron.
- **Vue dépôt** en trois colonnes :
  - Barre latérale gauche avec branches locales/distantes, raccourcis Pull/Push/Fetch et gestion de branches.
  - Graphe central des commits généré avec D3 (couleurs par branche, transitions fluides, sélection de commit).
  - Détails du commit sélectionné (auteur, date, fichiers modifiés, diff interactif).
- **Actions Git** : commit, checkout, création/suppression de branches, pull/push/fetch, merge.
- **Réécriture rapide de l'historique** : multi-sélection dans le graphe (Ctrl/Cmd + clic, Shift pour une plage) avec squash et suppression des commits situés en tête de branche.
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

## 🌐 Internationalisation

L'interface prend désormais en charge plusieurs langues via **i18next + react-i18next**. Un sélecteur est disponible dans la barre de titre pour passer instantanément du français à l'anglais (la préférence est mémorisée dans `localStorage`).

### Ajouter ou modifier une traduction

1. Éditer `frontend/src/i18n/resources.ts` et ajouter/mettre à jour la clé dans les deux sections `en.translation` et `fr.translation`.
2. Réutiliser la clé dans le composant via `const { t } = useTranslation();` puis `t("namespace.key")`.
3. Pour les nouvelles vues, importer `useTranslation` et éviter d'introduire du texte en dur.

> Conseil : gardez les clés regroupées par composant/page pour faciliter la maintenance (`home`, `sidebar`, `config`, etc.).

## 🧭 Multi-sélection & réécriture

Le graphe de commits permet désormais de sélectionner plusieurs nœuds pour réécrire rapidement l'historique local :

- **Ctrl/Cmd + clic** pour ajouter/retirer un commit de la sélection.
- **Shift + clic** pour sélectionner un intervalle continu de commits à partir de l'ancre courante.
- Une barre flottante résume la sélection et propose deux actions :
  - **Squasher** : fusionne les commits sélectionnés (au moins deux) en un seul commit avec le message de votre choix.
  - **Supprimer** : supprime les commits sélectionnés du haut de la branche (équivalent à un reset `--hard`).

> ℹ️ Les deux opérations exigent un historique linéaire (first-parent) aboutissant à `HEAD` et un répertoire de travail propre. Elles réécrivent l'historique local ; évitez de les utiliser sur des branches déjà partagées.

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

BciGit apporte une expérience riche et extensible, tout en restant 100 % open source et cross-platform.
