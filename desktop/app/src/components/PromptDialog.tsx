"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

// window.prompt() is not supported in Electron (it throws "prompt() is not supported"),
// so Mosaic asks for short text with this in-app dialog instead.

export type PromptOptions = {
  title: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
};

type PendingPrompt = { options: PromptOptions; resolve: (value: string | null) => void };

function PromptDialog({ options, onSubmit, onCancel }: { options: PromptOptions; onSubmit: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(options.defaultValue || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit(value.trim());
  };

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <form role="dialog" aria-modal="true" aria-labelledby="mosaic-prompt-title" onSubmit={submit}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}
      className="w-full max-w-sm border border-gray-200 bg-[#FFFCFB] p-5 shadow-xl">
      <h2 id="mosaic-prompt-title" className="text-sm font-semibold text-[#003366]">{options.title}</h2>
      <label className="mt-3 block text-xs text-gray-500">{options.label}
        <input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} placeholder={options.placeholder}
          className="mt-1 w-full border border-gray-200 bg-white px-3 py-2 text-sm text-[#1b1d1e] outline-none focus:border-[#C9A84C]" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
        <button type="submit" disabled={!value.trim()} className="bg-[#003366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#002244] disabled:opacity-50">{options.confirmLabel || "OK"}</button>
      </div>
    </form>
  </div>;
}

/**
 * const { ask, dialog } = usePromptDialog();
 * const name = await ask({ title: "New project", label: "Project name" }); // null when cancelled
 * ...render {dialog} somewhere in the component.
 */
export function usePromptDialog(): { ask: (options: PromptOptions) => Promise<string | null>; dialog: ReactNode } {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const ask = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => {
    setPending((current) => {
      current?.resolve(null);
      return { options, resolve };
    });
  }), []);
  const close = (value: string | null) => {
    pending?.resolve(value);
    setPending(null);
  };
  const dialog = pending
    ? <PromptDialog key={pending.options.title} options={pending.options} onSubmit={(value) => close(value)} onCancel={() => close(null)} />
    : null;
  return { ask, dialog };
}
