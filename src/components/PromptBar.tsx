"use client";

import { useState } from "react";

type Props = {
  disabled: boolean;
  busy?: boolean;
  placeholder: string;
  onSubmit: (prompt: string) => void;
};

export default function PromptBar({
  disabled,
  busy,
  placeholder,
  onSubmit,
}: Props) {
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = value.trim();
    if (!prompt || disabled) return;
    onSubmit(prompt);
    setValue("");
  };

  return (
    <form
      onSubmit={submit}
      className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-black/40 p-2 backdrop-blur-xl transition-colors focus-within:border-flux-accent/40"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        // text-base stops iOS Safari from zooming the page on focus
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base text-white placeholder-neutral-500 outline-none disabled:opacity-50 sm:text-sm"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-xl bg-flux-accent px-4 py-2 text-sm font-medium text-black transition-all hover:brightness-110 disabled:opacity-30"
      >
        {busy ? "Fluxing…" : "Flux"}
      </button>
    </form>
  );
}
