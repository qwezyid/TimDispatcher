"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

// закрытие выпадашки кликом вне области
function useOnClickOutside<T extends HTMLElement>(ref: React.RefObject<T>, cb: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) cb();
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [ref, cb]);
}

type Props = {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  className?: string;
};

export default function CityAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  options,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? "");
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(wrapRef, () => setOpen(false));

  useEffect(() => setQuery(value ?? ""), [value]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 200);
    return options.filter((c) => c.toLowerCase().includes(q)).slice(0, 200);
  }, [options, query]);

  function select(val: string) {
    onChange(val);
    setQuery(val);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && activeIndex < list.length) {
        e.preventDefault();
        select(list[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={`relative ${className}`} ref={wrapRef}>
      {label && <label className="block mb-2 text-sm font-medium text-gray-700">{label}</label>}
      <input
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="cities-listbox"
      />
      {open && list.length > 0 && (
        <div
          id="cities-listbox"
          className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {list.map((city, idx) => {
            const active = idx === activeIndex;
            return (
              <button
                key={`${city}-${idx}`}
                type="button"
                className={`flex w-full items-center justify-between px-4 py-2 text-left hover:bg-blue-50 ${active ? "bg-blue-50" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => select(city)}
                role="option"
                aria-selected={active}
              >
                <span>{city}</span>
              </button>
            );
          })}
          {query && list.length === 0 && <div className="px-4 py-2 text-sm text-gray-500">Нет совпадений</div>}
        </div>
      )}
    </div>
  );
}
