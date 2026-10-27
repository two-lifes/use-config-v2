import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as operations from "../lib/catalog";
import { createCatalogRepository, type TestHook } from "../storage/repository";
import { createSettingsRepository } from "../storage/settings";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element #root is missing from index.html");
}

const repository = createCatalogRepository();
const settingsRepository = createSettingsRepository();

// End-to-end tests drive storage through the built page
(globalThis as { useConfigTest?: TestHook }).useConfigTest = {
  repository,
  operations,
  settings: settingsRepository,
};

createRoot(root).render(
  <StrictMode>
    <App repository={repository} settingsRepository={settingsRepository} />
  </StrictMode>,
);
