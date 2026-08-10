"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export type AffiliateOption = {
  id: string;
  email: string;
  displayName: string | null;
  slicewpId: number;
  status: string;
};

const MIN_SEARCH_LENGTH = 2;
const LISTBOX_MAX_HEIGHT = 288;

type ListboxPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function formatAffiliateLabel(affiliate: AffiliateOption) {
  const name = affiliate.displayName ?? affiliate.email;
  return `${name} · ${affiliate.email}`;
}

type AffiliateSearchComboboxProps = {
  id?: string;
  label: string;
  value: string;
  selected?: AffiliateOption | null;
  onChange: (affiliateId: string, affiliate: AffiliateOption | null) => void;
  disabled?: boolean;
  excludeId?: string;
  placeholder?: string;
};

export function AffiliateSearchCombobox({
  id,
  label,
  value,
  selected: selectedProp,
  onChange,
  disabled,
  excludeId,
  placeholder = "Type at least 2 characters to search…",
}: AffiliateSearchComboboxProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<AffiliateOption | null>(
    selectedProp ?? null
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [listboxPosition, setListboxPosition] = useState<ListboxPosition | null>(
    null
  );

  useEffect(() => {
    setSelected(selectedProp ?? null);
  }, [selectedProp]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const canSearch = debouncedQuery.length >= MIN_SEARCH_LENGTH;

  const { data, isFetching } = useQuery({
    queryKey: ["affiliate-search", debouncedQuery],
    queryFn: () =>
      apiFetch<{ items: AffiliateOption[] }>(
        `/api/admin/affiliates/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`
      ),
    enabled: open && !disabled && canSearch,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const options = (data?.items ?? []).filter(
    (item) => item.id !== excludeId
  );

  useLayoutEffect(() => {
    if (!open || disabled) {
      setListboxPosition(null);
      return;
    }

    function updatePosition() {
      const input = inputRef.current;
      if (!input) return;

      const rect = input.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUpward =
        spaceBelow < LISTBOX_MAX_HEIGHT && spaceAbove > spaceBelow;
      const maxHeight = Math.min(
        LISTBOX_MAX_HEIGHT,
        Math.max(120, openUpward ? spaceAbove : spaceBelow)
      );

      setListboxPosition({
        top: openUpward ? rect.top - maxHeight - 6 : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, disabled, debouncedQuery, options.length, isFetching]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, options.length]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        listboxRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      if (selected) setQuery("");
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [selected]);

  function selectAffiliate(affiliate: AffiliateOption) {
    setSelected(affiliate);
    setQuery("");
    setOpen(false);
    onChange(affiliate.id, affiliate);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    onChange("", null);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }

    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && options[activeIndex]) {
      event.preventDefault();
      selectAffiliate(options[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  const displayValue = open ? query : selected ? formatAffiliateLabel(selected) : query;
  const showClear = !!selected && !disabled && !open;

  const listbox =
    open && !disabled && listboxPosition ? (
      <ul
        ref={listboxRef}
        id={listId}
        role="listbox"
        style={{
          position: "fixed",
          top: listboxPosition.top,
          left: listboxPosition.left,
          width: listboxPosition.width,
          maxHeight: listboxPosition.maxHeight,
        }}
        className="z-[250] overflow-auto rounded-lg border border-border bg-card shadow-lg ring-1 ring-border/40"
      >
        {!canSearch && (
          <li className="border-b border-border/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Type at least {MIN_SEARCH_LENGTH} characters to search
          </li>
        )}

        {canSearch && isFetching && options.length === 0 && (
          <li className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Searching…
          </li>
        )}

        {canSearch && !isFetching && options.length === 0 && (
          <li className="border-b border-border/50 px-3 py-2.5 text-xs text-muted-foreground">
            No affiliates found
          </li>
        )}

        {options.map((affiliate, index) => {
          const isSelected = value === affiliate.id;
          const isActive = index === activeIndex;

          return (
            <li
              key={affiliate.id}
              role="option"
              aria-selected={isSelected}
              className="border-b border-border/50 last:border-b-0"
            >
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectAffiliate(affiliate)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                  isActive && "bg-muted/70",
                  isSelected && "bg-primary-soft ring-1 ring-inset ring-primary/15"
                )}
              >
                <Check
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0 text-primary",
                    isSelected ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="ts-row-title block truncate">
                    {affiliate.displayName ?? affiliate.email}
                  </span>
                  <span className="ts-row-meta mt-0.5 block truncate">
                    {affiliate.email} · SliceWP #{affiliate.slicewpId} ·{" "}
                    {affiliate.status}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <>
      <div ref={containerRef} className="relative space-y-2">
        <Label htmlFor={id} className="ts-field-label">
          {label}
        </Label>
        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={displayValue}
            placeholder={selected && !open ? undefined : placeholder}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) {
                setSelected(null);
                onChange("", null);
              }
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className={cn(
              "ts-input flex w-full rounded-lg py-2 pl-3 pr-16 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
          <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-2">
            {showClear && (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>
        </div>
      </div>

      {typeof document !== "undefined" && listbox
        ? createPortal(listbox, document.body)
        : null}
    </>
  );
}
