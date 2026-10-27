import React, { useEffect, useState } from "react";
import { api, post } from "./api.js";
import {
  progressDelta,
  hourlyRate,
  formatCounter,
  type Progress,
} from "./progress.js";
export function GameProgress({
  id,
  running,
}: {
  id: string;
  running: boolean;
}) {
  const [visible, setVisible] = useState(
    () => localStorage.getItem(`progress-visible:${id}`) === "true",
  );
  const [data, setData] = useState<Progress | null>(null),
    [error, setError] = useState(""),
    [resetting, setResetting] = useState(false),
    [confirmReset, setConfirmReset] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [visible]);
  const stale = !!error || (!!data && now - data.at > 15000);
  const ready = data?.slots.filter((s) => s.status === "ready").length ?? 0;
  useEffect(() => {
    setData(null);
    if (!running || !visible) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ progress: Progress | null }>(
          `/instances/${id}/progress`,
        );
        if (active) {
          setData(result.progress);
          setError("");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, running, visible]);
  return (
    <section className="game-progress" aria-label="Farming progress">
      <div className="progress-heading">
        <strong>Farming progress</strong>
        <button
          type="button"
          aria-expanded={visible}
          onClick={() => {
            setConfirmReset(false);
            setVisible((v) => {
              localStorage.setItem(`progress-visible:${id}`, String(!v));
              return !v;
            });
          }}
        >
          {visible ? "Hide stats" : "Show stats"}
        </button>
      </div>
      {visible && (
        <>
          <div className="progress-summary" role="status">
            <span
              className={stale ? "progress-status stale" : "progress-status"}
            >
              {!running
                ? "Stopped"
                : stale
                  ? "Data delayed"
                  : data
                    ? "Live sampling"
                    : "Connecting"}
            </span>
            <span>{ready} / 3 slots ready · every 5s</span>
          </div>
          {stale && (
            <p className="fine">
              Live updates are unavailable. Rates below are hidden until a fresh
              sample arrives.
            </p>
          )}
          <details className="control-help">
            <summary>About these stats</summary>
            <p className="fine">
              Local counters, updated every 5 seconds. Gold is net balance
              change, not verified loot income. Spending and transfers affect
              the rate.
            </p>
          </details>
          {!running ? (
            <p>Start the game to track progress.</p>
          ) : !data ? (
            <p>Waiting for a fresh game sample…</p>
          ) : (
            data.slots.map((slot) => {
              const gold = progressDelta(slot.gold, slot.goldStart),
                pet = progressDelta(slot.petPower, slot.petStart);
              return (
                <article key={slot.slot} className="progress-slot">
                  <strong>Slot {slot.slot}</strong>
                  {slot.status !== "ready" ? (
                    <p>Waiting for character data. Enter the game to begin.</p>
                  ) : (
                    <>
                      <small>
                        Tracking{" "}
                        {Math.max(
                          0,
                          Math.floor(
                            (data.at - (slot.since ?? data.at)) / 60000,
                          ),
                        )}{" "}
                        min · sampled {new Date(data.at).toLocaleTimeString()}
                      </small>
                      <dl>
                        <dt>Gold balance</dt>
                        <dd>
                          {formatCounter(slot.gold ? BigInt(slot.gold) : null)}
                        </dd>
                        <dt>Net gold change</dt>
                        <dd>{formatCounter(gold)}</dd>
                        <dt>Net gold / hour</dt>
                        <dd>
                          {formatCounter(
                            stale
                              ? null
                              : hourlyRate(gold, slot.since, data.at),
                          )}
                        </dd>
                        <dt>Disciple power</dt>
                        <dd>
                          {formatCounter(
                            slot.petPower ? BigInt(slot.petPower) : null,
                          )}
                        </dd>
                        <dt>Power change</dt>
                        <dd>{formatCounter(pet)}</dd>
                        <dt>Power / hour</dt>
                        <dd>
                          {formatCounter(
                            stale
                              ? null
                              : hourlyRate(pet, slot.petSince, data.at),
                          )}
                        </dd>
                      </dl>
                      {slot.petPower == null && (
                        <small>
                          Disciple data unavailable. Open the in-game disciple
                          information to refresh it; no extra game requests are
                          sent automatically.
                        </small>
                      )}
                    </>
                  )}
                </article>
              );
            })
          )}
          {error && <p role="alert">{error}</p>}
          <button
            disabled={!running || resetting}
            onClick={async () => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              setConfirmReset(false);
              setResetting(true);
              try {
                await post(`/instances/${id}/progress/reset`, {});
                setData(null);
                setError("");
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setResetting(false);
              }
            }}
          >
            {confirmReset
              ? "Confirm reset for all slots"
              : "Reset tracking baseline"}
          </button>
          {confirmReset && (
            <button type="button" onClick={() => setConfirmReset(false)}>
              Keep current session
            </button>
          )}
          {data && (
            <button
              type="button"
              className="progress-export"
              onClick={() => {
                const rows = [
                  [
                    "sample_time",
                    "slot",
                    "status",
                    "gold_balance",
                    "net_gold_change",
                    "net_gold_per_hour",
                    "disciple_power",
                    "power_change",
                    "power_per_hour",
                  ],
                ];
                for (const slot of data.slots) {
                  const g = progressDelta(slot.gold, slot.goldStart),
                    p = progressDelta(slot.petPower, slot.petStart);
                  rows.push([
                    new Date(data.at).toISOString(),
                    String(slot.slot),
                    slot.status,
                    slot.gold ?? "",
                    g?.toString() ?? "",
                    stale
                      ? ""
                      : (hourlyRate(g, slot.since, data.at)?.toString() ?? ""),
                    slot.petPower ?? "",
                    p?.toString() ?? "",
                    stale
                      ? ""
                      : (hourlyRate(p, slot.petSince, data.at)?.toString() ??
                        ""),
                  ]);
                }
                const url = URL.createObjectURL(
                  new Blob([rows.map((row) => row.join(",")).join("\n")], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "farming-progress.csv";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Export snapshot CSV
            </button>
          )}
          <details className="control-help">
            <summary>Session details</summary>
            <p className="fine">
              Resets statistics for all three slots. Does not change game gold,
              power or saves. Restarting the JVM starts a new session; character
              changes reset their baseline. Missing data is shown as —.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
