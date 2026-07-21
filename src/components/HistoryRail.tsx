"use client";

type Props = {
  shots: string[];
  current: string | null;
  onSelect: (shot: string) => void;
};

export default function HistoryRail({ shots, current, onSelect }: Props) {
  if (shots.length === 0) return null;

  return (
    <div className="flex w-full justify-end gap-1.5 overflow-x-auto py-1">
      {shots.map((shot, i) => (
        <button
          key={i}
          onClick={() => onSelect(shot)}
          aria-label={`View frame ${i + 1}`}
          className={`shrink-0 overflow-hidden rounded-lg border transition-transform active:scale-95 ${
            shot === current
              ? "border-flux-accent ring-1 ring-flux-accent"
              : "border-white/15"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot}
            alt={`Frame ${i + 1}`}
            className="h-12 w-12 object-cover"
          />
        </button>
      ))}
    </div>
  );
}
