import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/roboto-condensed/500.css";
import "@fontsource/roboto-condensed/600.css";
import "@fontsource/roboto-condensed/700.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/oswald/600.css";
import "@fontsource/exo-2/300.css";
import "@fontsource/exo-2/400.css";
import "@fontsource/exo-2/500.css";
import "@fontsource/exo-2/600.css";
import "@fontsource/share-tech/400.css";
import { App } from "./App";
import "./mario.css";
import "./motion.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
