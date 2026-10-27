import React, { useEffect, useRef } from "react";
import type { Key } from "../../../packages/shared/schema.js";
import { nrmodShortcut } from "./game-profile.js";
export function GameControls({
  send,
  enabled,
  sleeping,
}: {
  send: (key: Key, down: boolean) => void;
  enabled: boolean;
  sleeping: boolean;
}) {
  const held = useRef(new Map<string, Key>());
  const pulse = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(send);
  latest.current = send;
  useEffect(() => {
    const release = () => {
      for (const key of held.current.values()) latest.current(key, false);
      held.current.clear();
      if (pulse.current) {
        clearTimeout(pulse.current);
        pulse.current = undefined;
        latest.current("*", false);
      }
    };
    if (!enabled || sleeping) {
      release();
      return;
    }
    const down = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable)) &&
        !(
          target instanceof HTMLElement &&
          target.classList.contains("direct-keyboard-capture")
        )
      )
        return;
      const key = nrmodShortcut(e);
      if (!key) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!held.current.has(e.code)) {
        held.current.set(e.code, key);
        latest.current(key, true);
      }
    };
    const up = (e: KeyboardEvent) => {
      const key = held.current.get(e.code);
      if (!key) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      held.current.delete(e.code);
      latest.current(key, false);
    };
    const hidden = () => {
      if (document.hidden) release();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      release();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [enabled, sleeping]);
  return (
    <section className="game-profile" aria-label="NRMod x3 controls">
      <strong>NRMod x3</strong>
      <div className="profile-actions">
        {(
          [
            ["SOFT_LEFT", "Left action"],
            ["OK", "Confirm"],
            ["SOFT_RIGHT", "Right action"],
          ] as [Key, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            disabled={!enabled || sleeping}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              held.current.set(`touch:${e.pointerId}`, key);
              latest.current(key, true);
            }}
            onPointerUp={(e) => {
              const owner = `touch:${e.pointerId}`;
              if (held.current.delete(owner)) latest.current(key, false);
            }}
            onPointerCancel={(e) => {
              if (held.current.delete(`touch:${e.pointerId}`))
                latest.current(key, false);
            }}
            onLostPointerCapture={(e) => {
              if (held.current.delete(`touch:${e.pointerId}`))
                latest.current(key, false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <details className="control-help">
        <summary>Keyboard shortcuts</summary>
        <p>Hold Alt for game controls.</p>
        <dl>
          <dt>Move</dt>
          <dd>Alt + arrows</dd>
          <dt>Confirm</dt>
          <dd>Alt + Enter</dd>
          <dt>Left / right softkey</dt>
          <dd>Alt + Q / E</dd>
          <dt>Game keys 0–9</dt>
          <dd>Alt + 0–9</dd>
          <dt>* / #</dt>
          <dd>Alt + comma / period</dd>
          <dt>Back</dt>
          <dd>Alt + B</dd>
        </dl>
      </details>
      <button
        disabled={!enabled || sleeping}
        onClick={() => {
          if (pulse.current) return;
          latest.current("*", true);
          pulse.current = setTimeout(() => {
            pulse.current = undefined;
            latest.current("*", false);
          }, 650);
        }}
      >
        Switch game slot
      </button>
    </section>
  );
}
