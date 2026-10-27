export type SlotProgress = {
  slot: number;
  status: "ready" | "waiting";
  since?: number;
  gold?: string;
  goldStart?: string;
  petPower?: string | null;
  petStart?: string;
  petSince?: number;
};
export type Progress = { at: number; slots: SlotProgress[] };
/** Integer subtraction first: never round 64-bit counters through a JS number. */
export function progressDelta(current?: string | null, start?: string) {
  if (
    current == null ||
    start == null ||
    !/^\d+$/.test(current) ||
    !/^\d+$/.test(start)
  )
    return null;
  return BigInt(current) - BigInt(start);
}
export function hourlyRate(
  delta: bigint | null,
  since: number | undefined,
  at: number,
) {
  if (delta === null || since === undefined || at - since < 1000) return null;
  return (delta * 3600000n) / BigInt(Math.floor(at - since));
}
export function formatCounter(value: bigint | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}
