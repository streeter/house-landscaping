import React from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
createRoot(root).render(
  <React.StrictMode>
    <main>
      <h1>Yard planner</h1>
      <p>Property map and editor are coming next.</p>
    </main>
  </React.StrictMode>,
);
