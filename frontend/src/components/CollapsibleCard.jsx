/**
 * CollapsibleCard
 * ---------------------------------------------------------------
 * Thin wrapper around the shadcn Card that adds a header the admin
 * can tap to expand/collapse the body. Purpose: keep the Admin
 * Settings screen scannable — long lists (settings history, gateway
 * webhooks, referral levels) can hide behind a one-line summary
 * until the operator actually needs them.
 *
 * State is persisted per `storageKey` in localStorage so the admin
 * doesn't have to re-open the same card on every page load.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function CollapsibleCard({
  title,
  subtitle,
  icon: Icon,
  iconColor = "#F5C518",
  defaultOpen = false,
  storageKey,             // optional — persist open/close per admin
  className = "",
  headerRight,            // optional right-side node (badge, count, etc.)
  testid,
  children,
}) {
  // Resolve initial state: localStorage wins if set, else fall back to defaultOpen.
  const initial = useMemo(() => {
    if (!storageKey) return defaultOpen;
    try {
      const raw = localStorage.getItem(`lcb_collapsible_${storageKey}`);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {}
    return defaultOpen;
  }, [defaultOpen, storageKey]);

  const [open, setOpen] = useState(initial);

  useEffect(() => {
    if (!storageKey) return;
    try { localStorage.setItem(`lcb_collapsible_${storageKey}`, open ? "1" : "0"); } catch {}
  }, [open, storageKey]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <Card
      className={`bg-[var(--nb-card)] border-[var(--nb-border)] rounded-xl overflow-hidden ${className}`}
      data-testid={testid}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        data-testid={testid ? `${testid}-toggle` : undefined}
        className="w-full text-left p-6 flex items-start gap-3 hover:bg-[var(--nb-card2)]/40 transition-colors"
      >
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg grid place-items-center shrink-0 mt-0.5"
            style={{
              background: `${iconColor}18`,
              border: `1px solid ${iconColor}40`,
            }}
          >
            <Icon className="w-4 h-4" style={{ color: iconColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-600 text-white">{title}</h2>
          {subtitle && (
            <p className="text-xs text-[var(--nb-muted)] mt-1 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
        {headerRight && (
          <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
        <ChevronDown
          className="w-5 h-5 text-[var(--nb-muted)] shrink-0 transition-transform duration-200 mt-1.5"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          data-testid={testid ? `${testid}-chevron` : undefined}
        />
      </button>
      {open && (
        <div
          className="px-6 pb-6 pt-0"
          data-testid={testid ? `${testid}-body` : undefined}
        >
          {children}
        </div>
      )}
    </Card>
  );
}
