import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { resetPipelineOnBoot } from "./lib/tools/pipeline";
import "./lib/polyfills/map-get-or-insert";

// Wipe any leftover tool-chain hand-off file from a previous tab/session for
// privacy (the chain is intended to be ephemeral within one session).
resetPipelineOnBoot();

createRoot(document.getElementById("root")!).render(<App />);
