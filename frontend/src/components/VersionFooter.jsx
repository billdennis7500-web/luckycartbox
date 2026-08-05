/**
 * VersionFooter
 * ---------------------------------------------------------------
 * Discreet build fingerprint shown at the very bottom of the
 * user shell. Reads `GET /api/version` and renders something like:
 *
 *     Luckycart Box • v 702e8dd
 *
 * Deliberately small and low-contrast — this is a diagnostic aid,
 * not a marketing surface. Users can tap it to see the full commit
 * SHA and build time in a lightweight tooltip-style disclosure.
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function VersionFooter() {
  const [ver, setVer] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get("/version")
      .then((r) => { if (alive) setVer(r.data || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!ver) return null;
  const short = ver.short || (ver.commit || "").slice(0, 7) || "dev";

  return (
    <div
      data-testid="version-footer"
      className="w-full text-center py-2 select-none"
      style={{ color: "var(--nb-muted)" }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-testid="version-footer-toggle"
        className="inline-flex items-center gap-1.5 text-[10px] tracking-wider font-display opacity-50 hover:opacity-90 transition-opacity"
        aria-label="Show build info"
      >
        <span>Luckycart Box</span>
        <span aria-hidden="true">•</span>
        <span className="tabular">v {short}</span>
      </button>
      {expanded && (
        <div
          data-testid="version-footer-details"
          className="mt-1 text-[10px] tabular opacity-70 leading-relaxed"
        >
          <div>commit: <span className="tabular">{ver.commit || "unknown"}</span></div>
          {ver.branch && ver.branch !== "unknown" && (
            <div>branch: <span className="tabular">{ver.branch}</span></div>
          )}
          {ver.commit_time && (
            <div>built: <span className="tabular">{ver.commit_time}</span></div>
          )}
        </div>
      )}
    </div>
  );
}
