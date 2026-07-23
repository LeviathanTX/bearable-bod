'use client';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className || "font-display font-semibold text-lg text-gray-900"}>
      Bearable BoD
    </span>
  );
}
