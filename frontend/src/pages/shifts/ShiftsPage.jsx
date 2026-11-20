import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  History,
  LoaderCircle,
  Moon,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  Sun,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { api, getApiError } from "../../lib/api";

/**
 * Palette (same as Dashboard, Employees and Departments): white + blue + red.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red #C8102E · Light red #FDECEF · Border #E3EAF5
 *
 * Layout:
 *  - Shifts tab: a 24-hour coverage timeline (one row per shift, red "now"
 *    marker) with a sticky detail panel for the selected shift.
 *  - Assignments tab: employees grouped by shift, with an "Unassigned"
 *    group on top so gaps in coverage are the first thing you see.
 */

const DAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const TICK_LABELS = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p", "12a"];

const SHIFT_STATUS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

/* ---------- Helpers ---------- */

function todayManila() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

function nowMinutesManila() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value);

  return hour * 60 + minute;
}

function toMinutes(value) {
  if (!value) return 0;
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function formatTime(value) {
  if (!value) return "--:--";
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatMinutes(value) {
  const minutes = Number(value) || 0;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) return `${remaining} min`;
  if (!remaining) return `${hours} hr`;
  return `${hours}h ${remaining}m`;
}

function formatDate(value, empty = "No end date") {
  if (!value) return empty;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDuration(start, end) {
  if (!start || !end) return 0;
  const s = toMinutes(start);
  const e = toMinutes(end);
  return e > s ? e - s : 1440 - s + e;
}

function isOvernight(shift) {
  if (typeof shift.is_overnight === "boolean") return shift.is_overnight;
  return toMinutes(shift.end_time) <= toMinutes(shift.start_time);
}

function getInitials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function assignmentState(assignment, today) {
  if (assignment.effective_from > today) return "upcoming";
  if (assignment.effective_until && assignment.effective_until < today)
    return "historical";
  return "current";
}

/* ---------- Shared styles ---------- */

const inputClass =
  "h-10 w-full rounded-lg border border-[#E3EAF5] bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-4 focus:ring-[#1D63D6]/10";

const textareaClass =
  "w-full resize-none rounded-lg border border-[#E3EAF5] bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-4 focus:ring-[#1D63D6]/10";

const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1D63D6] px-4 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#E3EAF5] bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-[#F7FAFE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] disabled:opacity-50";

const cardClass =
  "rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]";

/* ---------- Small components ---------- */

function Ribbon({ tab = "w-24" }) {
  return (
    <div className="flex h-1.5">
      <div className={`${tab} bg-[#C8102E]`} />
      <div className="flex-1 bg-[#1D63D6]" />
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-1 text-[#C8102E]">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ErrorBox({ children }) {
  return (
    <div className="whitespace-pre-line rounded-lg border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3 text-sm text-[#8E0B20]">
      {children}
    </div>
  );
}

function Pill({ tone = "blue", children }) {
  const tones = {
    blue: "bg-[#EAF1FD] text-[#1D63D6]",
    red: "bg-[#FDECEF] text-[#C8102E]",
    gray: "bg-slate-100 text-slate-500",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function Modal({ title, subtitle, onClose, children, width = "max-w-xl" }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[#0B3A8C]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`my-auto w-full ${width} overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-2xl shadow-[#0B3A8C]/20`}
      >
        <Ribbon tab="w-20" />

        <div className="flex items-start justify-between border-b border-[#EEF3FB] px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-[#0B3A8C]">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-[#F7FAFE] hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6]"
            aria-label="Close modal"
          >
            <X size={19} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function ModalFooter({ children }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-[#EEF3FB] bg-[#F7FAFE] px-6 py-4 sm:flex-row sm:justify-end sm:gap-3">
      {children}
    </div>
  );
}

/* ---------- Timeline ---------- */

function TimelineBar({ shift, nowPct }) {
  const s = toMinutes(shift.start_time);
  const e = toMinutes(shift.end_time);

  const segments = isOvernight(shift)
    ? [
        [s, 1440],
        [0, e],
      ]
    : [[s, e]];

  const color = !shift.is_active
    ? "bg-slate-300"
    : isOvernight(shift)
      ? "bg-[#0B3A8C]"
      : "bg-[#1D63D6]";

  return (
    <div
      className="relative h-9 overflow-hidden rounded-lg bg-[#F7FAFE]"
      role="img"
      aria-label={`${shift.name}: ${formatTime(shift.start_time)} to ${formatTime(shift.end_time)}`}
    >
      {TICKS.slice(1, -1).map((tick) => (
        <span
          key={tick}
          className="absolute top-0 h-full w-px bg-[#E3EAF5]"
          style={{ left: `${(tick / 24) * 100}%` }}
        />
      ))}

      {segments.map(([from, to], index) => (
        <span
          key={index}
          className={`absolute top-1.5 h-6 rounded-md ${color}`}
          style={{
            left: `${(from / 1440) * 100}%`,
            width: `${Math.max(((to - from) / 1440) * 100, 0.8)}%`,
          }}
        />
      ))}

      <span
        className="absolute top-0 z-10 h-full w-0.5 bg-[#C8102E]"
        style={{ left: `${nowPct}%` }}
      />
    </div>
  );
}

function TimelineAxis() {
  return (
    <div className="relative h-4 text-[11px] text-slate-400">
      {TICKS.map((tick, index) => (
        <span
          key={tick}
          className={`absolute ${
            index === 0
              ? ""
              : index === TICKS.length - 1
                ? "-translate-x-full"
                : "-translate-x-1/2"
          }`}
          style={{ left: `${(tick / 24) * 100}%` }}
        >
          {TICK_LABELS[index]}
        </span>
      ))}
    </div>
  );
}

/* ---------- Shift detail panel ---------- */

function ShiftDetail({
  shift,
  assignedCount,
  busy,
  onEdit,
  onToggle,
  onAssign,
}) {
  const overnight = isOvernight(shift);
  const Icon = overnight ? Moon : Sun;
  const duration = getDuration(shift.start_time, shift.end_time);

  return (
    <aside className={`${cardClass} overflow-hidden xl:sticky xl:top-4`}>
      <Ribbon tab="w-16" />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#EAF1FD] p-3 text-[#1D63D6]">
              <Icon size={21} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[#0B3A8C]">
                {shift.name}
              </h3>
              <p className="text-xs text-slate-500">
                {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                {overnight ? " (next day)" : ""}
              </p>
            </div>
          </div>

          <Pill tone={shift.is_active ? "blue" : "gray"}>
            {shift.is_active ? "Active" : "Inactive"}
          </Pill>
        </div>

        {shift.description && (
          <p className="text-sm leading-6 text-slate-600">
            {shift.description}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3">
          {[
            ["Shift length", formatMinutes(duration)],
            ["Expected work", formatMinutes(shift.expected_work_minutes)],
            ["Grace period", `${shift.grace_period_minutes} min`],
            ["Assigned now", `${assignedCount}`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3"
            >
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-[#0B3A8C]">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">Rest days</p>
          <div className="grid grid-cols-7 gap-1.5">
            {DAYS.map((day) => {
              const rest = (shift.rest_days || []).includes(day.value);

              return (
                <span
                  key={day.value}
                  className={`rounded-md py-1.5 text-center text-[11px] font-semibold ${
                    rest
                      ? "bg-[#FDECEF] text-[#C8102E]"
                      : "bg-slate-100 text-slate-400"
                  }`}
                  title={rest ? `${day.label} (rest day)` : day.label}
                >
                  {day.short}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[#EEF3FB] pt-4">
          <button type="button" onClick={onEdit} className={primaryButton}>
            <Pencil size={15} />
            Edit
          </button>

          {shift.is_active && (
            <button
              type="button"
              onClick={onAssign}
              className={secondaryButton}
            >
              <UserPlus size={15} />
              Assign
            </button>
          )}

          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className={`${secondaryButton} ${
              shift.is_active
                ? "hover:border-[#F5C2CA] hover:bg-[#FDECEF] hover:text-[#C8102E]"
                : "text-[#1D63D6]"
            }`}
          >
            {busy ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Power size={15} />
            )}
            {shift.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Shift form modal ---------- */

function ShiftFormModal({ shift, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() => ({
    name: shift?.name || "",
    description: shift?.description || "",
    start_time: shift?.start_time?.slice(0, 5) || "07:00",
    end_time: shift?.end_time?.slice(0, 5) || "16:00",
    grace_period_minutes: shift?.grace_period_minutes ?? 10,
    expected_work_minutes: shift?.expected_work_minutes ?? 480,
    rest_days: shift?.rest_days || (shift ? [] : [0]),
  }));
  const [error, setError] = useState("");

  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));

  const overnight = form.end_time <= form.start_time;
  const duration = getDuration(form.start_time, form.end_time);

  const toggleDay = (value) => {
    const next = form.rest_days.includes(value)
      ? form.rest_days.filter((d) => d !== value)
      : [...form.rest_days, value];
    set(
      "rest_days",
      next.sort((a, b) => a - b),
    );
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await onSubmit({
        ...form,
        grace_period_minutes: Number(form.grace_period_minutes),
        expected_work_minutes: Number(form.expected_work_minutes),
      });
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <Modal
      title={shift ? "Edit shift" : "Create shift"}
      subtitle="Set the working hours and attendance rules for this schedule."
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
          <Field label="Shift name" required>
            <input
              autoFocus
              className={inputClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Morning shift"
              maxLength={100}
              required
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={2}
              className={textareaClass}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional description for this schedule"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" required>
              <input
                type="time"
                className={inputClass}
                value={form.start_time}
                onChange={(e) => set("start_time", e.target.value)}
                required
              />
            </Field>
            <Field label="End time" required>
              <input
                type="time"
                className={inputClass}
                value={form.end_time}
                onChange={(e) => set("end_time", e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[#D5E3F8] bg-[#EAF1FD] px-4 py-3 text-[#0B3A8C]">
            <div className="flex items-center gap-2.5">
              {overnight ? <Moon size={17} /> : <Sun size={17} />}
              <div>
                <p className="text-sm font-semibold">
                  {overnight ? "Overnight schedule" : "Same-day schedule"}
                </p>
                <p className="text-xs text-[#1D63D6]">
                  {overnight
                    ? "Ends the following day"
                    : "Starts and ends on the same day"}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold">{formatMinutes(duration)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Grace period (min)"
              hint="Minutes allowed after shift start."
              required
            >
              <input
                type="number"
                min="0"
                max="1440"
                className={inputClass}
                value={form.grace_period_minutes}
                onChange={(e) => set("grace_period_minutes", e.target.value)}
                required
              />
            </Field>

            <Field
              label="Expected work (min)"
              hint="Net minutes, excluding unpaid breaks."
              required
            >
              <input
                type="number"
                min="1"
                className={inputClass}
                value={form.expected_work_minutes}
                onChange={(e) => set("expected_work_minutes", e.target.value)}
                required
              />
            </Field>
          </div>

          <Field
            label="Rest days"
            hint="Regular weekly rest days for this shift."
          >
            <div
              className="grid grid-cols-7 gap-1.5"
              role="group"
              aria-label="Rest days"
            >
              {DAYS.map((day) => {
                const selected = form.rest_days.includes(day.value);

                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    aria-pressed={selected}
                    title={day.label}
                    className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                      selected
                        ? "border-[#C8102E] bg-[#FDECEF] text-[#C8102E]"
                        : "border-[#E3EAF5] bg-white text-slate-500 hover:border-[#1D63D6] hover:text-[#1D63D6]"
                    }`}
                  >
                    {day.short}
                    {selected && <Check size={12} className="mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </Field>

          {error && <ErrorBox>{error}</ErrorBox>}
        </div>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={secondaryButton}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <LoaderCircle size={16} className="animate-spin" />}
            {shift ? "Save changes" : "Create shift"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- Assignment modal ---------- */

function AssignmentModal({
  initial,
  employees,
  departments,
  activeShifts,
  saving,
  onClose,
  onSubmit,
}) {
  const bulk = initial.bulk;

  const [form, setForm] = useState({
    shift_id: initial.shift_id || activeShifts[0]?.id || "",
    employee_id: initial.employee_id || "",
    effective_from: todayManila(),
    effective_until: "",
    notes: "",
  });
  const [selected, setSelected] = useState(initial.employee_ids || []);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerDept, setPickerDept] = useState("all");
  const [error, setError] = useState("");

  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));

  const visible = employees.filter((employee) => {
    const text = pickerSearch.toLowerCase();
    const matchesSearch =
      !text ||
      employee.full_name?.toLowerCase().includes(text) ||
      employee.employee_number?.toLowerCase().includes(text);
    const matchesDept =
      pickerDept === "all" || employee.department_id === pickerDept;

    return matchesSearch && matchesDept;
  });

  const toggle = (id) =>
    setSelected((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : [...c, id],
    );

  const toggleAllVisible = () => {
    const ids = visible.map((e) => e.id);
    const all = ids.length > 0 && ids.every((id) => selected.includes(id));

    setSelected((c) =>
      all ? c.filter((id) => !ids.includes(id)) : [...new Set([...c, ...ids])],
    );
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (bulk && !selected.length) {
      setError("Select at least one employee.");
      return;
    }

    const result = await onSubmit({ bulk, form, selected });

    if (result?.error) {
      setError(result.error);
      if (result.failedIds) setSelected(result.failedIds);
    }
  }

  return (
    <Modal
      title={
        bulk ? "Assign shift to multiple employees" : "Assign employee shift"
      }
      subtitle={
        bulk
          ? "Choose a shift, then pick the employees who will work it."
          : "Select an employee and set when the shift takes effect."
      }
      onClose={() => {
        if (!saving) onClose();
      }}
      width="max-w-2xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
          <Field label="Shift" required>
            <select
              className={inputClass}
              value={form.shift_id}
              onChange={(e) => set("shift_id", e.target.value)}
              required
            >
              <option value="">Choose a shift</option>
              {activeShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({formatTime(shift.start_time)} –{" "}
                  {formatTime(shift.end_time)})
                </option>
              ))}
            </select>
            {!activeShifts.length && (
              <p className="mt-1.5 text-xs font-medium text-[#C8102E]">
                No active shifts. Create or activate a shift first.
              </p>
            )}
          </Field>

          {bulk ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  Employees <span className="text-[#C8102E]">*</span>
                </span>
                <Pill>{selected.length} selected</Pill>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={inputClass}
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search name or employee ID..."
                  aria-label="Search employees"
                />
                <select
                  className={`${inputClass} sm:w-48`}
                  value={pickerDept}
                  onChange={(e) => setPickerDept(e.target.value)}
                  aria-label="Filter by department"
                >
                  <option value="all">All departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-[#E3EAF5]">
                <div className="flex items-center justify-between border-b border-[#EEF3FB] bg-[#F7FAFE] px-3 py-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {visible.length} employee{visible.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    className="text-xs font-semibold text-[#1D63D6] hover:text-[#0B3A8C]"
                  >
                    Select all visible
                  </button>
                </div>

                {visible.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-[#EEF3FB] px-3 py-2.5 last:border-0 hover:bg-[#F7FAFE]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(employee.id)}
                      onChange={() => toggle(employee.id)}
                      className="h-4 w-4 rounded border-slate-300 accent-[#1D63D6]"
                    />
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAF1FD] text-[10px] font-bold text-[#1D63D6]">
                      {getInitials(employee.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                        {employee.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {employee.employee_number}
                      </p>
                    </div>
                  </label>
                ))}

                {!visible.length && (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">
                    No employees match your search.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <Field label="Employee" required>
              <select
                className={inputClass}
                value={form.employee_id}
                onChange={(e) => set("employee_id", e.target.value)}
                required
              >
                <option value="">Choose an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_number} — {employee.full_name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Effective from" required>
              <input
                type="date"
                className={inputClass}
                value={form.effective_from}
                onChange={(e) => set("effective_from", e.target.value)}
                required
              />
            </Field>
            <Field
              label="Effective until"
              hint="Leave empty for no planned end date."
            >
              <input
                type="date"
                className={inputClass}
                value={form.effective_until}
                min={form.effective_from}
                onChange={(e) => set("effective_until", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              rows={2}
              className={textareaClass}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional reason or instruction"
            />
          </Field>

          <div className="flex gap-3 rounded-xl border border-[#D5E3F8] bg-[#F7FAFE] p-3 text-xs leading-5 text-slate-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#1D63D6]" />
            <p>
              If an employee already has an assignment that overlaps the new
              start date, the previous one is closed the day before. Future
              assignments must be reviewed separately.
            </p>
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}
        </div>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={secondaryButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !activeShifts.length}
            className={primaryButton}
          >
            {saving && <LoaderCircle size={16} className="animate-spin" />}
            {bulk
              ? `Assign ${selected.length || ""} employee${selected.length === 1 ? "" : "s"}`.replace(
                  "  ",
                  " ",
                )
              : "Assign shift"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- Confirm modal (replaces window.confirm) ---------- */

function ConfirmStatusModal({ shift, busy, onClose, onConfirm }) {
  const deactivating = shift.is_active;

  return (
    <Modal
      title={deactivating ? "Deactivate shift" : "Activate shift"}
      onClose={() => {
        if (!busy) onClose();
      }}
      width="max-w-md"
    >
      <div className="flex gap-3 p-6">
        <div
          className={`h-fit shrink-0 rounded-xl p-2.5 ${
            deactivating
              ? "bg-[#FDECEF] text-[#C8102E]"
              : "bg-[#EAF1FD] text-[#1D63D6]"
          }`}
        >
          {deactivating ? (
            <AlertCircle size={20} />
          ) : (
            <CheckCircle2 size={20} />
          )}
        </div>

        <p className="text-sm leading-6 text-slate-600">
          {deactivating ? "Deactivate" : "Activate"}{" "}
          <span className="font-semibold text-[#0B3A8C]">{shift.name}</span>?{" "}
          {deactivating
            ? "It will no longer be available for new assignments."
            : "It will be available for assignments again."}
        </p>
      </div>

      <ModalFooter>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={secondaryButton}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 ${
            deactivating
              ? "bg-[#C8102E] hover:bg-[#A80D26] focus-visible:ring-[#C8102E]"
              : "bg-[#1D63D6] hover:bg-[#0B3A8C] focus-visible:ring-[#1D63D6]"
          }`}
        >
          {busy && <LoaderCircle size={16} className="animate-spin" />}
          {deactivating ? "Deactivate" : "Activate"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* ---------- Page ---------- */

export default function ShiftsPage() {
  const [tab, setTab] = useState("shifts");

  const [shifts, setShifts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [shiftStatus, setShiftStatus] = useState("active");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [showHistory, setShowHistory] = useState(false);

  const [selectedShiftId, setSelectedShiftId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [shiftModal, setShiftModal] = useState(null); // { shift } | null
  const [assignModal, setAssignModal] = useState(null); // initial values | null
  const [statusShift, setStatusShift] = useState(null);

  const [nowMinutes, setNowMinutes] = useState(nowMinutesManila);

  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(nowMinutesManila()), 60000);
    return () => clearInterval(timer);
  }, []);

  const today = todayManila();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [shiftRes, referenceRes, assignmentRes] = await Promise.all([
        api.get("/shifts", { params: { status: "all" } }),
        api.get("/shifts/references"),
        api.get("/shifts/assignments", {
          params: { history: showHistory ? "true" : "false" },
        }),
      ]);

      const references = referenceRes.data?.data || {};

      setShifts(shiftRes.data?.data || []);
      setEmployees(references.employees || []);
      setDepartments(references.departments || []);
      setAssignments(assignmentRes.data?.data || []);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [showHistory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  /* ----- Derived data ----- */

  const activeShifts = useMemo(
    () => shifts.filter((s) => s.is_active),
    [shifts],
  );

  const currentAssignments = useMemo(
    () => assignments.filter((a) => assignmentState(a, today) === "current"),
    [assignments, today],
  );

  const assignedNowIds = useMemo(
    () => new Set(currentAssignments.map((a) => a.employee_id)),
    [currentAssignments],
  );

  const countByShift = useMemo(() => {
    const map = new Map();
    currentAssignments.forEach((a) =>
      map.set(a.shift_id, (map.get(a.shift_id) || 0) + 1),
    );
    return map;
  }, [currentAssignments]);

  const unassigned = useMemo(
    () => employees.filter((e) => !assignedNowIds.has(e.id)),
    [employees, assignedNowIds],
  );

  const filteredShifts = useMemo(() => {
    const text = search.trim().toLowerCase();

    return shifts.filter((shift) => {
      const matchesSearch =
        !text ||
        shift.name.toLowerCase().includes(text) ||
        (shift.description || "").toLowerCase().includes(text);

      const matchesStatus =
        shiftStatus === "all" ||
        (shiftStatus === "active" ? shift.is_active : !shift.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [shifts, search, shiftStatus]);

  const selectedShift =
    filteredShifts.find((s) => s.id === selectedShiftId) ||
    filteredShifts[0] ||
    null;

  const text = search.trim().toLowerCase();

  const filteredAssignments = useMemo(
    () =>
      assignments.filter((a) => {
        const matchesShift =
          shiftFilter === "all" || a.shift_id === shiftFilter;
        const matchesDept =
          departmentFilter === "all" ||
          a.employee?.department_id === departmentFilter;
        const matchesSearch =
          !text ||
          a.employee?.full_name?.toLowerCase().includes(text) ||
          a.employee?.employee_number?.toLowerCase().includes(text) ||
          a.shift?.name?.toLowerCase().includes(text);

        return matchesShift && matchesDept && matchesSearch;
      }),
    [assignments, shiftFilter, departmentFilter, text],
  );

  const filteredUnassigned = useMemo(
    () =>
      shiftFilter !== "all"
        ? []
        : unassigned.filter((e) => {
            const matchesDept =
              departmentFilter === "all" ||
              e.department_id === departmentFilter;
            const matchesSearch =
              !text ||
              e.full_name?.toLowerCase().includes(text) ||
              e.employee_number?.toLowerCase().includes(text);

            return matchesDept && matchesSearch;
          }),
    [unassigned, shiftFilter, departmentFilter, text],
  );

  const groups = useMemo(() => {
    const byShift = new Map();
    filteredAssignments.forEach((a) => {
      byShift.set(a.shift_id, [...(byShift.get(a.shift_id) || []), a]);
    });

    return shifts
      .filter((s) => byShift.has(s.id))
      .map((shift) => ({ shift, rows: byShift.get(shift.id) }));
  }, [filteredAssignments, shifts]);

  const nowPct = (nowMinutes / 1440) * 100;

  /* ----- Actions ----- */

  const changeTab = (next) => {
    setTab(next);
    setSearch("");
    setError("");
  };

  async function saveShift(payload) {
    setSaving(true);

    try {
      if (shiftModal?.shift) {
        await api.patch(`/shifts/${shiftModal.shift.id}`, payload);
        setNotice("Shift updated successfully.");
      } else {
        await api.post("/shifts", payload);
        setNotice("Shift created successfully.");
      }

      setShiftModal(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function confirmStatus() {
    if (!statusShift) return;

    const nextStatus = !statusShift.is_active;
    setSaving(true);

    try {
      await api.patch(`/shifts/${statusShift.id}/status`, {
        is_active: nextStatus,
      });
      setNotice(
        `Shift ${nextStatus ? "activated" : "deactivated"} successfully.`,
      );
      setStatusShift(null);
      await loadData();
    } catch (err) {
      setStatusShift(null);
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitAssignment({ bulk, form, selected }) {
    setSaving(true);

    try {
      const common = {
        shift_id: form.shift_id,
        effective_from: form.effective_from,
        effective_until: form.effective_until || null,
        notes: form.notes,
      };

      if (bulk) {
        const response = await api.post("/shifts/assignments/bulk", {
          ...common,
          employee_ids: selected,
        });

        const result = response.data?.data;
        const failures = (result?.results || []).filter((r) => !r.success);

        await loadData();

        if (failures.length) {
          const lines = failures.map((item) => {
            const employee = employees.find((e) => e.id === item.employee_id);
            return `${employee?.employee_number || item.employee_id}: ${item.message}`;
          });

          return {
            error: `${result?.successful || 0} assigned, ${failures.length} failed:\n${lines.join("\n")}`,
            failedIds: failures.map((f) => f.employee_id),
          };
        }

        setNotice(`${result?.successful || 0} employees assigned.`);
      } else {
        await api.post("/shifts/assignments", {
          ...common,
          employee_id: form.employee_id,
        });
        setNotice("Employee shift assigned successfully.");
        await loadData();
      }

      setAssignModal(null);
      return null;
    } catch (err) {
      return { error: getApiError(err) };
    } finally {
      setSaving(false);
    }
  }

  const openAssign = (initial = {}) =>
    setAssignModal({ bulk: false, ...initial });

  const toggleGroup = (id) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasAssignmentFilters =
    Boolean(search.trim()) ||
    departmentFilter !== "all" ||
    shiftFilter !== "all";

  const kpis = [
    {
      label: "Shifts",
      value: shifts.length,
      detail: `${activeShifts.length} active`,
    },
    {
      label: "Assigned now",
      value: assignedNowIds.size,
      detail: "Employees with a shift today",
    },
    {
      label: "Unassigned",
      value: unassigned.length,
      detail: "Need a shift",
      alert: unassigned.length > 0,
    },
    {
      label: "Employees",
      value: employees.length,
      detail: "Active RCS - RR",
    },
  ];

  /* ----- Render ----- */

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      {/* Header */}
      <header className={`${cardClass} overflow-hidden`}>
        <Ribbon />

        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A8C]">
              Shifts
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Set up working schedules and decide who works which shift.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className={secondaryButton}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>

            {tab === "shifts" ? (
              <button
                type="button"
                onClick={() => setShiftModal({ shift: null })}
                className={primaryButton}
              >
                <Plus size={17} />
                Create shift
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAssign()}
                  className={secondaryButton}
                >
                  <Plus size={16} />
                  Assign employee
                </button>
                <button
                  type="button"
                  onClick={() => setAssignModal({ bulk: true })}
                  className={primaryButton}
                >
                  <Users size={16} />
                  Bulk assign
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-[#D5E3F8] bg-[#EAF1FD] px-4 py-3 text-sm font-medium text-[#0B3A8C]"
        >
          <CheckCircle2 size={18} className="text-[#1D63D6]" />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
            className="text-[#1D63D6]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3 text-sm text-[#8E0B20]"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#C8102E]" />
          <span className="flex-1 whitespace-pre-line">{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="text-[#C8102E]"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary strip */}
      <section
        aria-label="Summary"
        className={`${cardClass} grid grid-cols-2 divide-[#EEF3FB] lg:grid-cols-4 lg:divide-x`}
      >
        {kpis.map(({ label, value, detail, alert }, index) => (
          <div
            key={label}
            className={`p-5 ${index % 2 === 1 ? "border-l border-[#EEF3FB] lg:border-l-0" : ""} ${
              index > 1 ? "border-t border-[#EEF3FB] lg:border-t-0" : ""
            }`}
          >
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                alert ? "text-[#C8102E]" : "text-[#0B3A8C]"
              }`}
            >
              {loading ? "—" : value}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{detail}</p>
          </div>
        ))}
      </section>

      {/* Tabs + filters */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Shift views"
            className="inline-flex w-fit rounded-xl border border-[#E3EAF5] bg-white p-1"
          >
            {[
              { id: "shifts", label: "Schedules", icon: Clock3 },
              { id: "assignments", label: "Assignments", icon: Users },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => changeTab(id)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                  tab === id
                    ? "bg-[#1D63D6] text-white"
                    : "text-slate-600 hover:bg-[#F7FAFE] hover:text-[#1D63D6]"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:w-64">
              <Search
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === "shifts"
                    ? "Search shifts..."
                    : "Search employee, ID or shift..."
                }
                aria-label="Search"
                className={`${inputClass} pl-10`}
              />
            </div>

            {tab === "assignments" && (
              <>
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  aria-label="Filter by department"
                  className={`${inputClass} sm:w-44`}
                >
                  <option value="all">All departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  aria-label="Filter by shift"
                  className={`${inputClass} sm:w-44`}
                >
                  <option value="all">All shifts</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  aria-pressed={showHistory}
                  className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                    showHistory
                      ? "border-[#1D63D6] bg-[#EAF1FD] text-[#1D63D6]"
                      : "border-[#E3EAF5] bg-white text-slate-600 hover:bg-[#F7FAFE]"
                  }`}
                >
                  <History size={16} />
                  {showHistory ? "History on" : "Current only"}
                </button>

                {hasAssignmentFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setDepartmentFilter("all");
                      setShiftFilter("all");
                    }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#1D63D6] transition hover:bg-[#EAF1FD]"
                  >
                    <X size={13} />
                    Clear
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {tab === "shifts" && (
          <div
            className="flex gap-2 overflow-x-auto pb-0.5"
            role="group"
            aria-label="Filter by status"
          >
            {SHIFT_STATUS.map((option) => {
              const active = shiftStatus === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setShiftStatus(option.value)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                    active
                      ? "border-[#1D63D6] bg-[#1D63D6] text-white"
                      : "border-[#E3EAF5] bg-white text-slate-600 hover:border-[#1D63D6] hover:text-[#1D63D6]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Content */}
      {loading ? (
        <div
          className={`${cardClass} flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500`}
        >
          <LoaderCircle size={20} className="animate-spin text-[#1D63D6]" />
          Loading shifts...
        </div>
      ) : tab === "shifts" ? (
        filteredShifts.length === 0 ? (
          <div className={`${cardClass} px-6 py-20 text-center`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FD] text-[#1D63D6]">
              <Clock3 size={27} />
            </div>
            <h3 className="mt-4 font-semibold text-slate-800">
              No shifts found
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {shifts.length
                ? "Try changing your search or status filter."
                : "Create your first shift to start scheduling your team."}
            </p>
            {!shifts.length && (
              <button
                type="button"
                onClick={() => setShiftModal({ shift: null })}
                className={`${primaryButton} mt-5`}
              >
                <Plus size={16} />
                Create shift
              </button>
            )}
          </div>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            {/* Coverage timeline */}
            <div className={`${cardClass} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-[#EEF3FB] px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold text-[#0B3A8C]">
                    Daily coverage
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Select a shift to see its details.
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-3 w-0.5 bg-[#C8102E]" />
                  Now
                </span>
              </div>

              <ul className="divide-y divide-[#EEF3FB]">
                {filteredShifts.map((shift) => {
                  const selected = selectedShift?.id === shift.id;
                  const overnight = isOvernight(shift);

                  return (
                    <li key={shift.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedShiftId(shift.id)}
                        aria-pressed={selected}
                        className={`grid w-full gap-3 border-l-4 px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6] md:grid-cols-[200px_minmax(0,1fr)] md:items-center md:gap-5 ${
                          selected
                            ? "border-[#1D63D6] bg-[#EAF1FD]/60"
                            : "border-transparent hover:bg-[#F7FAFE]"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {overnight ? (
                              <Moon
                                size={15}
                                className="shrink-0 text-[#0B3A8C]"
                              />
                            ) : (
                              <Sun
                                size={15}
                                className="shrink-0 text-[#1D63D6]"
                              />
                            )}
                            <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                              {shift.name}
                            </p>
                            {!shift.is_active && (
                              <Pill tone="gray">Inactive</Pill>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatTime(shift.start_time)} –{" "}
                            {formatTime(shift.end_time)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {countByShift.get(shift.id) || 0} assigned
                          </p>
                        </div>

                        <TimelineBar shift={shift} nowPct={nowPct} />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden border-t border-[#EEF3FB] px-5 py-2 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-5">
                <span />
                <TimelineAxis />
              </div>

              <div className="border-t border-[#EEF3FB] px-5 py-3 text-xs text-slate-500">
                Showing {filteredShifts.length} shift
                {filteredShifts.length === 1 ? "" : "s"}. Overnight shifts wrap
                around midnight.
              </div>
            </div>

            {selectedShift && (
              <ShiftDetail
                shift={selectedShift}
                assignedCount={countByShift.get(selectedShift.id) || 0}
                busy={saving && statusShift?.id === selectedShift.id}
                onEdit={() => setShiftModal({ shift: selectedShift })}
                onToggle={() => setStatusShift(selectedShift)}
                onAssign={() =>
                  setAssignModal({ bulk: true, shift_id: selectedShift.id })
                }
              />
            )}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {/* Unassigned group */}
          {filteredUnassigned.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-[#F5C2CA] bg-white">
              <div className="flex flex-col gap-3 bg-[#FDECEF] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white p-2 text-[#C8102E]">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[#8E0B20]">
                      Unassigned employees
                    </h2>
                    <p className="text-xs text-[#A80D26]">
                      {filteredUnassigned.length} without a shift today
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setAssignModal({
                      bulk: true,
                      employee_ids: filteredUnassigned.map((e) => e.id),
                    })
                  }
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#C8102E] px-4 text-sm font-semibold text-white transition hover:bg-[#A80D26] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E] focus-visible:ring-offset-2"
                >
                  <Users size={15} />
                  Assign all
                </button>
              </div>

              <ul className="grid divide-y divide-[#EEF3FB] md:grid-cols-2 md:divide-y-0">
                {filteredUnassigned.slice(0, 12).map((employee) => (
                  <li
                    key={employee.id}
                    className="flex items-center gap-3 border-[#EEF3FB] px-5 py-3 md:border-t"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF1FD] text-xs font-bold text-[#1D63D6]">
                      {getInitials(employee.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                        {employee.full_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {employee.employee_number}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAssign({ employee_id: employee.id })}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1D63D6] transition hover:bg-[#EAF1FD]"
                    >
                      Assign
                    </button>
                  </li>
                ))}
              </ul>

              {filteredUnassigned.length > 12 && (
                <p className="border-t border-[#EEF3FB] px-5 py-2.5 text-center text-xs text-slate-500">
                  Showing 12 of {filteredUnassigned.length}. Use Assign all to
                  cover everyone.
                </p>
              )}
            </section>
          )}

          {/* Shift groups */}
          {groups.length === 0 && filteredUnassigned.length === 0 ? (
            <div className={`${cardClass} px-6 py-20 text-center`}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FD] text-[#1D63D6]">
                <CalendarDays size={27} />
              </div>
              <h3 className="mt-4 font-semibold text-slate-800">
                No assignments found
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                {hasAssignmentFilters
                  ? "Try changing your search or filters."
                  : "Assign employees to a shift to see their schedules here."}
              </p>
              {!hasAssignmentFilters && (
                <button
                  type="button"
                  onClick={() => openAssign()}
                  className={`${primaryButton} mt-5`}
                >
                  <Plus size={16} />
                  Assign employee
                </button>
              )}
            </div>
          ) : (
            groups.map(({ shift, rows }) => {
              const open = !collapsed.has(shift.id);
              const Icon = isOvernight(shift) ? Moon : Sun;

              return (
                <section
                  key={shift.id}
                  className={`${cardClass} overflow-hidden`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(shift.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[#F7FAFE] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6]"
                  >
                    <div className="rounded-lg bg-[#EAF1FD] p-2 text-[#1D63D6]">
                      <Icon size={17} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold text-[#0B3A8C]">
                        {shift.name}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {formatTime(shift.start_time)} –{" "}
                        {formatTime(shift.end_time)}
                      </p>
                    </div>

                    <Pill>
                      {rows.length} employee{rows.length === 1 ? "" : "s"}
                    </Pill>

                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {open && (
                    <ul className="divide-y divide-[#EEF3FB] border-t border-[#EEF3FB]">
                      {rows.map((assignment) => {
                        const state = assignmentState(assignment, today);

                        return (
                          <li
                            key={assignment.id}
                            className="grid gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_110px] md:items-center"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF1FD] text-xs font-bold text-[#1D63D6]">
                                {getInitials(assignment.employee?.full_name)}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                                  {assignment.employee?.full_name ||
                                    "Unknown employee"}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {assignment.employee?.employee_number}
                                </p>
                              </div>
                            </div>

                            <p className="text-sm text-slate-600">
                              {assignment.department?.name || (
                                <span className="text-slate-400">
                                  Unassigned
                                </span>
                              )}
                            </p>

                            <p className="text-sm text-slate-600">
                              {formatDate(assignment.effective_from)} →{" "}
                              {formatDate(
                                assignment.effective_until,
                                "Ongoing",
                              )}
                            </p>

                            <div className="md:text-right">
                              <Pill
                                tone={
                                  state === "current"
                                    ? "blue"
                                    : state === "upcoming"
                                      ? "red"
                                      : "gray"
                                }
                              >
                                {state === "current"
                                  ? "Current"
                                  : state === "upcoming"
                                    ? "Upcoming"
                                    : "Historical"}
                              </Pill>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}

          <p className="text-xs text-slate-500">
            {showHistory
              ? "Showing current, upcoming and past assignments."
              : "Showing assignments effective today."}
          </p>
        </div>
      )}

      {shiftModal && (
        <ShiftFormModal
          shift={shiftModal.shift}
          saving={saving}
          onClose={() => setShiftModal(null)}
          onSubmit={saveShift}
        />
      )}

      {assignModal && (
        <AssignmentModal
          initial={assignModal}
          employees={employees}
          departments={departments}
          activeShifts={activeShifts}
          saving={saving}
          onClose={() => setAssignModal(null)}
          onSubmit={submitAssignment}
        />
      )}

      {statusShift && (
        <ConfirmStatusModal
          shift={statusShift}
          busy={saving}
          onClose={() => setStatusShift(null)}
          onConfirm={confirmStatus}
        />
      )}
    </div>
  );
}
