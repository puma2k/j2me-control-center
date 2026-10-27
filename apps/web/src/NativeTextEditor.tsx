import React, { useEffect, useRef, useState } from "react";
import { api, post } from "./api.js";
import type { Key } from "../../../packages/shared/schema.js";
type Editor = {
  token: string;
  constraints: number;
  maxLength: number;
  title: string;
  text: string;
};
export function NativeTextEditor({
  id,
  sendKey,
}: {
  id: string;
  sendKey: (key: Key, down: boolean) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const active = useRef(true),
    token = useRef("");
  const dirty = useRef(false),
    composing = useRef(false);
  const queue = useRef(Promise.resolve());
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    active.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ editor: Editor | null }>(
          `/instances/${id}/text-editor`,
        );
        if (!active.current) return;
        const next = result.editor;
        if (!next || next.token !== token.current) {
          token.current = next?.token ?? "";
          dirty.current = false;
          setDraft(next?.text ?? "");
          setError("");
        } else if (!dirty.current && document.activeElement !== field.current)
          setDraft(next.text);
        setEditor(next);
      } catch {
        /* A stopped instance falls back to the regular viewer. */
      }
      if (active.current) timer = setTimeout(poll, 750);
    };
    void poll();
    return () => {
      active.current = false;
      clearTimeout(timer);
    };
  }, [id]);
  useEffect(() => {
    if (editor && window.matchMedia("(pointer: fine)").matches)
      field.current?.focus({ preventScroll: true });
  }, [editor?.token]);
  const save = (value: string) => {
    const expected = editor?.token;
    if (!expected) return Promise.resolve();
    dirty.current = true;
    const task = queue.current
      .catch(() => {})
      .then(async () => {
        if (!active.current || token.current !== expected)
          throw new Error("Game field changed");
        await post(`/instances/${id}/text-editor`, {
          token: expected,
          text: value,
        });
      });
    queue.current = task;
    task.catch((e) => {
      if (active.current) setError(e instanceof Error ? e.message : String(e));
    });
    return task;
  };
  if (!editor) return null;
  const password = !!(editor.constraints & 0x10000);
  const readOnly = !!(editor.constraints & 0x20000);
  const kind = editor.constraints & 0xffff;
  const props = {
    value: draft,
    maxLength: editor.maxLength,
    readOnly,
    autoComplete: "off",
    autoCapitalize: "none",
    autoCorrect: "off",
    spellCheck: false,
    "aria-label": editor.title || "Game text",
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setDraft(e.target.value);
      setError("");
      if (!composing.current) void save(e.target.value).catch(() => {});
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (
      e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      composing.current = false;
      setDraft(e.currentTarget.value);
      void save(e.currentTarget.value).catch(() => {});
    },
  };
  return (
    <form
      className="native-editor"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          e.key === "Enter" &&
          !e.nativeEvent.isComposing &&
          !composing.current
        ) {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving || readOnly || composing.current) return;
        setSaving(true);
        try {
          await save(draft);
          if (!active.current) return;
          sendKey("OK", true);
          setTimeout(() => sendKey("OK", false), 100);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (active.current) setSaving(false);
        }
      }}
    >
      <label>
        {editor.title || "Game text"}
        {password ? (
          <input
            {...props}
            ref={(el) => {
              field.current = el;
            }}
            type="password"
          />
        ) : (
          <textarea
            {...props}
            ref={(el) => {
              field.current = el;
            }}
            rows={4}
            inputMode={
              kind === 2 || kind === 3
                ? "numeric"
                : kind === 5
                  ? "decimal"
                  : "text"
            }
          />
        )}
      </label>
      {error && (
        <p role="alert" className="danger">
          {error}
        </p>
      )}
      <div className="native-editor-actions">
        <span>
          {draft.length} / {editor.maxLength}
        </span>
        <button type="submit" className="primary" disabled={saving || readOnly}>
          {saving ? "Saving…" : "Confirm"}
        </button>
      </div>
    </form>
  );
}
