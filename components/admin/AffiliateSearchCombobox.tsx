"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<AffiliateOption | null>(
    selectedProp ?? null
  );
  const [activeIndex, setActiveIndex] = useState(0);

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

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedQuery, options.length]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (selected) setQuery("");
      }
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

  return (
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
            "ts-input flex w-full py-2 pl-3 pr-16 placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {!canSearch && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Type at least {MIN_SEARCH_LENGTH} characters to search
            </li>
          )}

          {canSearch && isFetching && options.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </li>
          )}

          {canSearch && !isFetching && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No affiliates found
            </li>
          )}

          {options.map((affiliate, index) => {
            const isSelected = value === affiliate.id;
            const isActive = index === activeIndex;

            return (
              <li key={affiliate.id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectAffiliate(affiliate)}
                  className={cn(
                    "flex w-full items-start gap-2 px-3 py-2 text-left text-sm",
                    isActive && "bg-primary-soft/80",
                    isSelected && "font-medium text-primary"
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {affiliate.displayName ?? affiliate.email}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {affiliate.email} · SliceWP #{affiliate.slicewpId} ·{" "}
                      {affiliate.status}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
