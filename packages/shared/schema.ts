import { z } from "zod";
export const keyCodes = {
  UP: -1,
  DOWN: -2,
  LEFT: -3,
  RIGHT: -4,
  OK: -5,
  SOFT_LEFT: -6,
  SOFT_RIGHT: -7,
  BACK: -8,
  "0": 48,
  "1": 49,
  "2": 50,
  "3": 51,
  "4": 52,
  "5": 53,
  "6": 54,
  "7": 55,
  "8": 56,
  "9": 57,
  "*": 42,
  "#": 35,
} as const;
export type Key = keyof typeof keyCodes;
export const keyInput = z.enum(Object.keys(keyCodes) as [Key, ...Key[]]);
export const idInput = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/);
export const instanceInput = z
  .object({
    gameId: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(1).max(80),
    width: z.number().int().min(128).max(640).default(240),
    height: z.number().int().min(128).max(854).default(320),
    profile: z
      .enum(["Standard", "Nokia", "LG", "Motorola", "Siemens"])
      .default("Nokia"),
    fps: z.number().int().min(1).max(60).default(60),
    heapMb: z.number().int().min(32).max(512).default(128),
    restartPolicy: z.enum(["manual", "restore-running"]).default("manual"),
    keyMapping: z.record(z.string().min(1).max(30), keyInput).default({}),
  })
  .strict();
export type InstanceConfig = z.infer<typeof instanceInput>;
export type Status =
  | "created"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";
export type Instance = InstanceConfig & {
  id: string;
  status: Status;
  createdAt: number;
  error: string | null;
  startedAt: number | null;
};
export type Game = {
  id: string;
  name: string;
  version: string;
  vendor: string;
  filename: string;
  createdAt: number;
  manifest: Record<string, string>;
};
export const patchInput = instanceInput.omit({ gameId: true }).partial();
export const settingsInput = z
  .object({
    maxInstances: z.number().int().min(1).max(100),
    memoryBudgetMb: z.number().int().min(256).max(65536),
    streamFps: z.number().int().min(1).max(60),
    quality: z.number().int().min(10).max(95),
  })
  .strict();
export type Settings = z.infer<typeof settingsInput>;
export const macroStepInput = z
  .object({
    key: keyInput,
    holdMs: z.number().int().min(1).max(5000),
    delayMs: z.number().int().min(0).max(5000),
  })
  .strict();
export const pointerInput = z
  .object({
    type: z.literal("pointer"),
    id: idInput,
    action: z.enum(["down", "move", "up"]),
    x: z.number().int().min(0).max(853),
    y: z.number().int().min(0).max(853),
  })
  .strict();
export const messageInput = z.discriminatedUnion("type", [
  pointerInput,
  z
    .object({
      type: z.literal("text"),
      id: idInput,
      text: z
        .string()
        .max(256)
        .regex(/^[^\u0000-\u001f\u007f]*$/u),
      backspace: z.number().int().min(0).max(256).default(0),
    })
    .strict(),
  z.object({
    type: z.literal("subscribe"),
    ids: z.array(idInput).max(9),
    fps: z.number().int().min(1).max(60).optional(),
    quality: z.number().int().min(10).max(95).optional(),
  }),
  z.object({
    type: z.literal("key"),
    ids: z.array(idInput).min(1).max(100),
    key: keyInput,
    down: z.boolean(),
  }),
  z.object({
    type: z.literal("macro"),
    ids: z.array(idInput).min(1).max(100),
    steps: z.array(macroStepInput).min(1).max(100),
  }),
  z.object({ type: z.literal("cancelMacro") }),
  z.object({ type: z.literal("release") }),
  z.object({ type: z.literal("ping"), time: z.number() }),
]);
export const defaultKeyboard: Record<string, Key> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  Enter: "OK",
  Escape: "BACK",
  q: "SOFT_LEFT",
  w: "SOFT_RIGHT",
  "0": "0",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "*": "*",
  "#": "#",
};
