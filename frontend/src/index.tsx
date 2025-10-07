import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import "./styles/tailwind.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Impossible de monter l'application: élément racine introuvable");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <MemoryRouter>
      <App />
    </MemoryRouter>
  </React.StrictMode>
);
