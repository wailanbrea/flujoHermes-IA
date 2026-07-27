import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("No se encontró el contenedor raíz del dashboard.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
