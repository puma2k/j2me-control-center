import { test } from "node:test";
import assert from "node:assert/strict";
import { nrmodShortcut } from "../apps/web/src/game-profile.js";
test("NRMod controls preserve text and reject composition and browser modifier chords", () => {
  const base = {
    code: "Digit5",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
  };
  assert.equal(nrmodShortcut(base), undefined);
  assert.equal(nrmodShortcut({ ...base, altKey: true }), "5");
  assert.equal(
    nrmodShortcut({ ...base, altKey: true, code: "KeyQ" }),
    "SOFT_LEFT",
  );
  assert.equal(nrmodShortcut({ ...base, altKey: true, code: "Comma" }), "*");
  for (const flag of ["ctrlKey", "metaKey", "shiftKey", "isComposing"])
    assert.equal(
      nrmodShortcut({ ...base, altKey: true, [flag]: true }),
      undefined,
    );
  assert.equal(
    nrmodShortcut({ ...base, altKey: true, getModifierState: () => true }),
    undefined,
  );
});
