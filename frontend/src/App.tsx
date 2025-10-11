import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RepoProvider, useRepoContext } from "./context/RepoContext";
import TitleBar from "./components/TitleBar";
import Loading from "./components/Loading";
import Home from "./pages/Home";
import RepoView from "./pages/RepoView";
import DiffView from "./pages/DiffView";
import Config from "./pages/Config";

const AppContent: React.FC = () => {
  const { loading } = useRepoContext();

  return (
    <div className="h-screen bg-slate-900 text-gray-100 flex flex-col">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/repo" element={<RepoView />} />
          <Route path="/repo/diff/:commitHash" element={<DiffView />} />
          <Route path="/config" element={<Config />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {loading && <Loading />}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <RepoProvider>
      <AppContent />
    </RepoProvider>
  );
};

export default App;
