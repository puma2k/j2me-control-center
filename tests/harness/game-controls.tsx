import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { GameControls } from "../../apps/web/src/GameControls.js";
function Harness() {
  const [enabled, setEnabled] = useState(true),
    [sleeping, setSleeping] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  return (
    <>
      <textarea
        aria-label="Direct typing"
        className="direct-keyboard-capture"
      />
      <input aria-label="Settings field" />
      <button onClick={() => setEnabled((v) => !v)}>Toggle runtime</button>
      <button onClick={() => setSleeping((v) => !v)}>Toggle sleep</button>
      <GameControls
        enabled={enabled}
        sleeping={sleeping}
        send={(key, down) =>
          setEvents((v) => [...v, `${key}:${down ? "down" : "up"}`])
        }
      />
      <output aria-label="Events">{events.join(",")}</output>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
