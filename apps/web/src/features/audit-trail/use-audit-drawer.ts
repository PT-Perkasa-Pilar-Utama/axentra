import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { AuditTrailRow } from "./audit-trail.presenter";

export type UseAuditDrawerResult = {
  selectedRow: AuditTrailRow | null;
  selectedRows: AuditTrailRow[];
  openDrawer: (row: AuditTrailRow, triggerElement: HTMLElement) => void;
  closeDrawer: () => void;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  drawerRef: React.RefObject<HTMLElement | null>;
};

export function useAuditDrawer(allRows: readonly AuditTrailRow[]): UseAuditDrawerResult {
  const [selectedRow, setSelectedRow] = useState<AuditTrailRow | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const closeDrawer = (): void => {
    setSelectedRow(null);
    returnFocusRef.current?.focus();
  };

  const openDrawer = (row: AuditTrailRow, target: HTMLElement): void => {
    returnFocusRef.current = target;
    setSelectedRow(row);
  };

  useEffect(() => {
    if (!selectedRow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeDrawer();
        return;
      }
      if (event.key === "Tab") {
        const drawer = drawerRef.current;
        if (!drawer) return;
        const focusable = drawer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!drawer.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedRow]);

  const selectedRows = useMemo(() => {
    if (!selectedRow) return [];
    return allRows.filter((row) =>
      selectedRow.documentId
        ? row.documentId === selectedRow.documentId
        : row.documentName === selectedRow.documentName,
    );
  }, [allRows, selectedRow]);

  return {
    selectedRow,
    selectedRows,
    openDrawer,
    closeDrawer,
    closeButtonRef,
    drawerRef,
  };
}
