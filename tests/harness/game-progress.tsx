import React from "react";
import { createRoot } from "react-dom/client";
import { GameProgress } from "../../apps/web/src/GameProgress.js";
createRoot(document.getElementById("root")!).render(
  <GameProgress id="test-instance" running={true} />,
);
