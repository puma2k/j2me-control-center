import type { Instance, Status, Key } from "../packages/shared/schema.js";
export type ProcessMetrics = {
  pid: number | null;
  cpuPercent: number;
  rssMb: number;
  pssMb?: number;
  uptimeSeconds: number;
};
export interface EmulatorAdapter {
  onExit: (reason: string) => void;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  sendKey(key: Key, down: boolean): Promise<void>;
  sendPointer?(
    action: "down" | "move" | "up",
    x: number,
    y: number,
  ): Promise<void>;
  sendText?(text: string, backspace: number): Promise<void>;
  captureRaw?(): Promise<{ data: Buffer; width: number; height: number }>;
  captureFrame(): Promise<Buffer>;
  getStatus(): Status;
  getLogs(): Promise<string>;
  getTextEditor?(): Promise<unknown>;
  setTextEditor?(token: string, text: string): Promise<unknown>;
  getProgress?(): Promise<unknown>;
  resetProgress?(): Promise<void>;
  getMetrics(): Promise<ProcessMetrics>;
}
export type AdapterFactory = (instance: Instance) => EmulatorAdapter;
