import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

/* 合輯共用的語言切換器。掛在 React 樹之外，因此只在這裡掛載一次。 */
window.I18N?.mountSwitcher(document.getElementById("localeSelect") as HTMLSelectElement | null);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
