import React from "react";
import { ChevronDown } from "lucide-react";

export default function LoadMore({ shown, total, onMore, step = 10, testid = "load-more" }) {
  if (!total || shown >= total) return null;
  const remaining = total - shown;
  return (
    <div className="flex justify-center py-4">
      <button
        onClick={() => onMore(Math.min(total, shown + step))}
        data-testid={testid}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-[var(--nb-border)] bg-[var(--nb-card)] text-xs text-[var(--nb-muted)] hover:text-white hover:border-[#0055FF]/40 hover:bg-[var(--nb-card2)] transition-colors"
      >
        Load more
        <span className="text-[#0055FF] tabular font-display font-600">({remaining})</span>
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  );
}
