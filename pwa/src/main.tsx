import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./contexts/I18nContext";
import "./style.css";

const container = document.getElementById("app")!;

createRoot(container).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
