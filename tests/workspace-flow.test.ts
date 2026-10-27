import test from "node:test";
import assert from "node:assert/strict";
import { workspaceTargets } from "../apps/web/src/workspace-flow.js";
test("management tabs cannot stream or send broadcast input to background games", () => {
  for (const tab of ["settings", "logs"] as const) {
    assert.deepEqual(
      workspaceTargets("one", tab, "instances", ["two"], 4, true),
      { viewing: [], input: [] },
    );
  }
});
test("single game play ignores list selection unless broadcast is explicit", () => {
  assert.deepEqual(
    workspaceTargets("one", "play", "instances", ["two"], 4, false),
    { viewing: ["one"], input: ["one"] },
  );
  assert.deepEqual(
    workspaceTargets(null, "play", "screens", ["one", "two", "three"], 2, true),
    { viewing: ["one", "two"], input: ["one", "two", "three"] },
  );
  assert.deepEqual(
    workspaceTargets(null, "play", "instances", ["one"], 4, true),
    { viewing: [], input: [] },
  );
});
