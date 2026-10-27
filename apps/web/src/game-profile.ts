import type { Key } from "../../../packages/shared/schema.js";
export const nrmodx3Hash =
  "2618def297f0c3976d468100ce9bf59b1ef0cfd5165f2f74476b7321b792c664";
/** Alt shortcuts never reinterpret ordinary typing or IME composition. */
export function nrmodShortcut(event: {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  getModifierState?: (key: string) => boolean;
}): Key | undefined {
  if (
    !event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    event.getModifierState?.("AltGraph")
  )
    return;
  const mapping: Record<string, Key> = {
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Enter: "OK",
    KeyQ: "SOFT_LEFT",
    KeyE: "SOFT_RIGHT",
    KeyB: "BACK",
    Comma: "*",
    Period: "#",
  };
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(-1) as Key;
  return mapping[event.code];
}
