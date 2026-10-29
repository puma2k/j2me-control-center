import React, { useEffect, useRef } from "react";
import type { Key } from "../../../packages/shared/schema.js";
import { TouchKeys } from "./touch-controls.js";
export function MobileGamePad({
  send,
  enabled,
}: {
  send: (key: Key, down: boolean) => void;
  enabled: boolean;
}) {
  const latest = useRef(send);
  latest.current = send;
  const controls = useRef<TouchKeys | null>(null);
  if (!controls.current)
    controls.current = new TouchKeys((key, down) => latest.current(key, down));
  useEffect(() => {
    const release = () => controls.current?.releaseAll();
    const hidden = () => {
      if (document.hidden) release();
    };
    if (!enabled) release();
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      release();
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [enabled]);
  const button = (label: string, keys: Key[], name: string) => (
    <button
      key={name}
      type="button"
      aria-label={name}
      disabled={!enabled}
      className={keys[0] === "OK" ? "touch-key confirm-key" : "touch-key"}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        controls.current?.press(e.pointerId, keys);
      }}
      onPointerUp={(e) => controls.current?.release(e.pointerId)}
      onPointerCancel={(e) => controls.current?.release(e.pointerId)}
      onLostPointerCapture={(e) => controls.current?.release(e.pointerId)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
  return (
    <section className="mobile-gamepad" aria-label="Touch game controls">
      <div className="touch-softkeys">
        {button("Left action", ["SOFT_LEFT"], "Touch left action")}
        {button("Back", ["BACK"], "Touch back")}
        {button("Right action", ["SOFT_RIGHT"], "Touch right action")}
      </div>
      <div className="touch-console">
        <div className="touch-directions">
          {button("↖", ["UP", "LEFT"], "Move up left")}
          {button("↑", ["UP"], "Move up")}
          {button("↗", ["UP", "RIGHT"], "Move up right")}
          {button("←", ["LEFT"], "Move left")}
          {button("OK", ["OK"], "Touch confirm")}
          {button("→", ["RIGHT"], "Move right")}
          {button("↙", ["DOWN", "LEFT"], "Move down left")}
          {button("↓", ["DOWN"], "Move down")}
          {button("↘", ["DOWN", "RIGHT"], "Move down right")}
        </div>
        <div className="touch-numbers">
          {(
            [
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
              "*",
              "0",
              "#",
            ] as Key[]
          ).map((key) => button(key, [key], `Touch key ${key}`))}
        </div>
      </div>
    </section>
  );
}
