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
  /** Optional single choice shown under the text field (e.g. a project type). */
  choices?: Array<{ value: string; label: string; description?: string }>;
  defaultChoice?: string;
};

export type PromptResult = { value: string; choice: string };
type PendingPrompt = { options: PromptOptions; resolve: (result: PromptResult | null) => void };

function PromptDialog({ options, onSubmit, onCancel }: { options: PromptOptions; onSubmit: (result: PromptResult) => void; onCancel: () => void }) {
  const [value, setValue] = useState(options.defaultValue || "");
  const [choice, setChoice] = useState(options.defaultChoice || options.choices?.[0]?.value || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onSubmit({ value: value.trim(), choice });
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
      {options.choices?.length ? <fieldset className="mt-3">
        <legend className="text-xs text-gray-500">Type</legend>
        <div className="mt-1 grid gap-2">
          {options.choices.map((item) => <label key={item.value} className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-xs ${choice === item.value ? "border-[#003366]" : "border-gray-200"}`}>
            <input type="radio" name="mosaic-prompt-choice" value={item.value} checked={choice === item.value} onChange={() => setChoice(item.value)} className="mt-0.5 accent-[#003366]" />
            <span><span className="block font-semibold text-[#1b1d1e]">{item.label}</span>{item.description && <span className="mt-0.5 block text-gray-500">{item.description}</span>}</span>
          </label>)}
        </div>
      </fieldset> : null}
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
export function usePromptDialog(): {
  ask: (options: PromptOptions) => Promise<string | null>;
  askWithChoice: (options: PromptOptions) => Promise<PromptResult | null>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const askWithChoice = useCallback((options: PromptOptions) => new Promise<PromptResult | null>((resolve) => {
    setPending((current) => {
      current?.resolve(null);
      return { options, resolve };
    });
  }), []);
  const ask = useCallback((options: PromptOptions) => askWithChoice(options).then((result) => result?.value ?? null), [askWithChoice]);
  const close = (result: PromptResult | null) => {
    pending?.resolve(result);
    setPending(null);
  };
  const dialog = pending
    ? <PromptDialog key={pending.options.title} options={pending.options} onSubmit={(result) => close(result)} onCancel={() => close(null)} />
    : null;
  return { ask, askWithChoice, dialog };
}
