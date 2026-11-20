import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BriefcaseBusiness, Check, ChevronDown, Search } from "lucide-react";

/**
 * Shared position filter (searchable multi-select) + helpers.
 * Extracted from the Shifts page so Shifts and Live Monitoring use the same code.
 *
 * Suggested location: src/components/PositionFilter.jsx
 */

export const NO_POSITION = "none";

export const positionKey = (person) => person?.position_id || NO_POSITION;

// Name from the person itself, or looked up by id in `names` (Map)
export const positionLabel = (person, names) =>
  person?.position_name ||
  person?.position?.name ||
  (person?.position_id && names?.get(person.position_id)) ||
  null;

/**
 * Builds the options for the position filter.
 *   positions: [{ id, name }] from the API (may be empty)
 *   people:    employees used to discover positions the API did not list
 *   counts:    Map<positionId | NO_POSITION, number of employees>
 */
export function buildPositionOptions(positions, people, counts) {
  const names = new Map(
    positions.map((position) => [position.id, position.name]),
  );

  people.forEach((person) => {
    if (person?.position_id && !names.has(person.position_id)) {
      names.set(
        person.position_id,
        positionLabel(person) || "Unnamed position",
      );
    }
  });

  const list = [...names.entries()]
    .map(([id, name]) => ({ id, name, count: counts.get(id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [
    {
      id: NO_POSITION,
      name: "No position",
      count: counts.get(NO_POSITION) || 0,
    },
    ...list,
  ];
}

const inputClass =
  "h-10 w-full rounded-lg border border-[#E3EAF5] bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-4 focus:ring-[#1D63D6]/10";

/**
 * options:  [{ id, name, count }]
 * selected: array of option ids
 */
export default function PositionFilter({
  options,
  selected,
  onChange,
  loading,
  align = "right",
  className = "sm:w-52",
}) {
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const emptyCount = options.filter(
    (option) => option.count === 0 && !selectedSet.has(option.id),
  ).length;

  const visibleOptions = useMemo(() => {
    const term = q.trim().toLowerCase();

    return options.filter((option) => {
      const listed =
        showEmpty || option.count > 0 || selectedSet.has(option.id);

      return listed && (!term || option.name.toLowerCase().includes(term));
    });
  }, [options, q, showEmpty, selectedSet]);

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Focus the search box when opening; reset the search when closing
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQ("");
      setHighlight(0);
    }
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [q, showEmpty]);

  // Keep the highlighted row visible
  useEffect(() => {
    if (!open) return;

    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const toggle = (id) => {
    onChange(
      selectedSet.has(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) =>
        Math.min(visibleOptions.length - 1, current + 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visibleOptions[highlight];
      if (option) toggle(option.id);
    } else if (event.key === "Escape") {
      // Keep Escape from also closing a modal that contains this filter
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  let label = "All positions";
  if (selected.length === 1) {
    label =
      options.find((option) => option.id === selected[0])?.name || "1 position";
  } else if (selected.length > 1) {
    label = `${selected.length} positions`;
  }

  const active = selected.length > 0;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by position"
        className={`${inputClass} flex items-center gap-2 text-left ${
          active ? "border-[#1D63D6] bg-[#EAF1FD]/50" : ""
        }`}
      >
        <BriefcaseBusiness
          size={15}
          className={active ? "text-[#1D63D6]" : "text-slate-400"}
        />
        <span
          className={`min-w-0 flex-1 truncate ${
            active ? "font-semibold text-[#0B3A8C]" : "text-slate-700"
          }`}
        >
          {label}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className={`absolute z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#E3EAF5] bg-white shadow-xl shadow-[#0B3A8C]/10 ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <div className="border-b border-[#EEF3FB] p-2.5">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search positions..."
                aria-label="Search positions"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                className="h-9 w-full rounded-lg border border-[#E3EAF5] bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-4 focus:ring-[#1D63D6]/10"
              />
            </div>
          </div>

          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-multiselectable="true"
            className="max-h-72 overflow-y-auto py-1"
          >
            {loading ? (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                Loading...
              </li>
            ) : visibleOptions.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">
                {q ? "No positions match your search." : "No positions found."}
              </li>
            ) : (
              visibleOptions.map((option, index) => {
                const checked = selectedSet.has(option.id);
                const isNone = option.id === NO_POSITION;

                return (
                  <li
                    key={option.id}
                    role="option"
                    aria-selected={checked}
                    data-index={index}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => {
                      toggle(option.id);
                      inputRef.current?.focus();
                    }}
                    className={`flex cursor-pointer items-center gap-3 px-3.5 py-2 text-sm ${
                      highlight === index ? "bg-[#F7FAFE]" : ""
                    }`}
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-[#1D63D6] bg-[#1D63D6] text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {checked && <Check size={12} strokeWidth={3} />}
                    </span>

                    <span
                      className={`min-w-0 flex-1 truncate ${
                        isNone
                          ? "font-medium text-[#C8102E]"
                          : option.count === 0
                            ? "text-slate-400"
                            : "text-slate-700"
                      }`}
                    >
                      {option.name}
                    </span>

                    <span className="shrink-0 rounded-full bg-[#EEF3FB] px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      {option.count}
                    </span>
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex items-center justify-between gap-3 border-t border-[#EEF3FB] bg-[#F7FAFE] px-3.5 py-2.5">
            {emptyCount > 0 || showEmpty ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={showEmpty}
                  onChange={(event) => setShowEmpty(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-[#1D63D6]"
                />
                Show positions with no employees
              </label>
            ) : (
              <span className="text-xs text-slate-400">
                {visibleOptions.length} position
                {visibleOptions.length === 1 ? "" : "s"}
              </span>
            )}

            <button
              type="button"
              onClick={() => onChange([])}
              disabled={!active}
              className="shrink-0 text-xs font-semibold text-[#1D63D6] hover:text-[#0B3A8C] disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
