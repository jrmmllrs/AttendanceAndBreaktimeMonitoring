import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coffee,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { api, getApiError } from "../../lib/api";

/**
 * Palette (same as Dashboard, Shifts, Departments and Employees):
 * white + blue + red.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red #C8102E · Light red #FDECEF · Border #E3EAF5
 *
 * Layout (same as the other management pages):
 *  - Summary strip on top.
 *  - Schedules tab: schedules grouped by shift (collapsible). Active shifts
 *    that have no break schedule appear in a red group on top.
 *  - Break types tab: list with allowance bars.
 *  - Sticky detail panel on the right for the selected row.
 */

const EMPTY_TYPE = {
  name: "",
  description: "",
  allowed_duration_minutes: 15,
  is_paid: true,
};

const EMPTY_SCHEDULE = {
  name: "",
  shift_id: "",
  break_type_id: "",
  department_id: "",
  sequence_number: 1,
  duration_minutes: 15,
  max_occurrences_per_shift: "",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/* ---------- Helpers ---------- */

function formatTime(value) {
  if (!value) return "—";

  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";

  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatDuration(value) {
  const minutes = Number(value) || 0;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours && remaining) return `${hours}h ${remaining}m`;
  if (hours) return `${hours}h`;
  return `${remaining} min`;
}

function getShiftTime(shift) {
  if (!shift) return "Shift unavailable";

  return `${formatTime(shift.start_time)} – ${formatTime(shift.end_time)}${
    shift.is_overnight ? " (+1 day)" : ""
  }`;
}

const matchesStatus = (item, status) =>
  status === "all" || (status === "active" ? item.is_active : !item.is_active);

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

function StatusBadge({ active }) {
  return (
    <Pill tone={active ? "blue" : "gray"}>
      {active ? "Active" : "Inactive"}
    </Pill>
  );
}

function PaidBadge({ paid }) {
  return <Pill tone={paid ? "blue" : "gray"}>{paid ? "Paid" : "Unpaid"}</Pill>;
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

function Modal({ title, subtitle, onClose, children, width = "max-w-lg" }) {
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

function StatGrid({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3"
        >
          <dt className="text-xs text-slate-500">{label}</dt>
          <dd className="mt-1 text-lg font-semibold text-[#0B3A8C]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PanelActions({ item, onEdit, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-[#EEF3FB] pt-4">
      <button type="button" onClick={onEdit} className={primaryButton}>
        <Pencil size={15} />
        Edit
      </button>

      <button
        type="button"
        onClick={onToggle}
        className={`${secondaryButton} ${
          item.is_active
            ? "hover:border-[#F5C2CA] hover:bg-[#FDECEF] hover:text-[#C8102E]"
            : "text-[#1D63D6]"
        }`}
      >
        <Power size={15} />
        {item.is_active ? "Deactivate" : "Activate"}
      </button>
    </div>
  );
}

/* ---------- Detail panels ---------- */

function ScheduleDetail({ schedule, onEdit, onToggle }) {
  return (
    <aside className={`${cardClass} overflow-hidden xl:sticky xl:top-4`}>
      <Ribbon tab="w-16" />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-[#EAF1FD] p-3 text-[#1D63D6]">
              <Coffee size={21} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[#0B3A8C]">
                {schedule.name}
              </h3>
              <p className="truncate text-xs text-slate-500">
                {schedule.shift?.name || "Unknown shift"} ·{" "}
                {getShiftTime(schedule.shift)}
              </p>
            </div>
          </div>

          <StatusBadge active={schedule.is_active} />
        </div>

        <StatGrid
          items={[
            ["Duration", formatDuration(schedule.duration_minutes)],
            [
              "Max per shift",
              schedule.max_occurrences_per_shift
                ? schedule.max_occurrences_per_shift
                : "No limit",
            ],
            ["Display order", `#${schedule.sequence_number}`],
            ["Department", schedule.department?.name || "All"],
          ]}
        />

        <div className="flex items-center justify-between rounded-xl border border-[#E3EAF5] px-3.5 py-3">
          <div>
            <p className="text-xs text-slate-500">Break type</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">
              {schedule.break_type?.name || "Unknown type"}
            </p>
          </div>
          {schedule.break_type && (
            <PaidBadge paid={schedule.break_type.is_paid} />
          )}
        </div>

        <div className="flex gap-3 rounded-xl border border-[#D5E3F8] bg-[#F7FAFE] p-3.5">
          <Clock3 size={17} className="mt-0.5 shrink-0 text-[#1D63D6]" />
          <div>
            <p className="text-sm font-semibold text-[#0B3A8C]">
              Flexible start
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Employees can start this break anytime while on duty. The kiosk
              records the actual times and the system calculates any excess.
            </p>
          </div>
        </div>

        <PanelActions item={schedule} onEdit={onEdit} onToggle={onToggle} />
      </div>
    </aside>
  );
}

function TypeDetail({ type, usedBy, onEdit, onToggle }) {
  return (
    <aside className={`${cardClass} overflow-hidden xl:sticky xl:top-4`}>
      <Ribbon tab="w-16" />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-[#EAF1FD] p-3 text-[#1D63D6]">
              <Coffee size={21} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[#0B3A8C]">
                {type.name}
              </h3>
              <p className="text-xs text-slate-500">Break type</p>
            </div>
          </div>

          <StatusBadge active={type.is_active} />
        </div>

        <p className="text-sm leading-6 text-slate-600">
          {type.description || "No description provided."}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3">
            <p className="text-xs text-slate-500">Allowed duration</p>
            <p className="mt-1 text-lg font-semibold text-[#0B3A8C]">
              {formatDuration(type.allowed_duration_minutes)}
            </p>
          </div>
          <div className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3">
            <p className="text-xs text-slate-500">Pay</p>
            <div className="mt-1.5">
              <PaidBadge paid={type.is_paid} />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Used by {usedBy.length} schedule{usedBy.length === 1 ? "" : "s"}
          </p>

          {usedBy.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#D5E3F8] py-5 text-center text-sm text-slate-500">
              Not used in any schedule yet.
            </p>
          ) : (
            <ul className="max-h-48 divide-y divide-[#EEF3FB] overflow-y-auto rounded-xl border border-[#E3EAF5]">
              {usedBy.map((schedule) => (
                <li
                  key={schedule.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {schedule.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {schedule.shift?.name || "Unknown shift"}
                    </p>
                  </div>
                  <StatusBadge active={schedule.is_active} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <PanelActions item={type} onEdit={onEdit} onToggle={onToggle} />
      </div>
    </aside>
  );
}

/* ---------- Break type form ---------- */

function TypeFormModal({ type, saving, onClose, onSubmit }) {
  const [form, setForm] = useState(() =>
    type
      ? {
          name: type.name || "",
          description: type.description || "",
          allowed_duration_minutes: type.allowed_duration_minutes,
          is_paid: type.is_paid,
        }
      : EMPTY_TYPE,
  );
  const [error, setError] = useState("");

  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await onSubmit({
        ...form,
        allowed_duration_minutes: Number(form.allowed_duration_minutes),
      });
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <Modal
      title={type ? "Edit break type" : "Create break type"}
      subtitle="Define the break category and its allowed duration."
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-5 p-6">
          <Field label="Break type name" required>
            <input
              autoFocus
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Morning break"
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of this break type..."
              className={textareaClass}
            />
          </Field>

          <Field
            label="Allowed duration (minutes)"
            hint="The standard allowed break duration."
            required
          >
            <input
              type="number"
              min="1"
              step="1"
              required
              value={form.allowed_duration_minutes}
              onChange={(e) => set("allowed_duration_minutes", e.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E3EAF5] p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Paid break</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Is this break included in paid working time?
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={form.is_paid}
              aria-label="Paid break"
              onClick={() => set("is_paid", !form.is_paid)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 ${
                form.is_paid ? "bg-[#1D63D6]" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  form.is_paid ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
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
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {type ? "Save changes" : "Create break type"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- Break schedule form ---------- */

function ScheduleFormModal({
  schedule,
  initialShiftId,
  references,
  saving,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => {
    if (schedule) {
      return {
        name: schedule.name || "",
        shift_id: schedule.shift_id || "",
        break_type_id: schedule.break_type_id || "",
        department_id: schedule.department_id || "",
        sequence_number: schedule.sequence_number,
        duration_minutes: schedule.duration_minutes,
        max_occurrences_per_shift: schedule.max_occurrences_per_shift ?? "",
      };
    }

    const firstType = references.breakTypes[0];

    return {
      ...EMPTY_SCHEDULE,
      shift_id: initialShiftId || references.shifts[0]?.id || "",
      break_type_id: firstType?.id || "",
      duration_minutes: firstType?.allowed_duration_minutes || 15,
    };
  });
  const [error, setError] = useState("");

  const set = (name, value) => setForm((c) => ({ ...c, [name]: value }));

  const selectedType = references.breakTypes.find(
    (item) => item.id === form.break_type_id,
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await onSubmit({
        ...form,
        department_id: form.department_id || null,
        sequence_number: Number(form.sequence_number),
        duration_minutes: Number(form.duration_minutes),
        max_occurrences_per_shift:
          form.max_occurrences_per_shift === ""
            ? null
            : Number(form.max_occurrences_per_shift),
      });
    } catch (err) {
      setError(getApiError(err));
    }
  }

  const noShifts = references.shifts.length === 0;
  const noTypes = references.breakTypes.length === 0;

  return (
    <Modal
      title={schedule ? "Edit break schedule" : "Create break schedule"}
      subtitle="Set the break allowance. Employees can start this break anytime during their shift."
      onClose={() => {
        if (!saving) onClose();
      }}
      width="max-w-2xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-6">
          <Field label="Schedule name" required>
            <input
              autoFocus
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Morning break - Warehouse"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shift" required>
              <select
                required
                value={form.shift_id}
                onChange={(e) => set("shift_id", e.target.value)}
                className={inputClass}
              >
                <option value="">Select shift</option>
                {references.shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name} ({formatTime(shift.start_time)} –{" "}
                    {formatTime(shift.end_time)})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Break type" required>
              <select
                required
                value={form.break_type_id}
                onChange={(e) => {
                  const picked = references.breakTypes.find(
                    (item) => item.id === e.target.value,
                  );

                  setForm((c) => ({
                    ...c,
                    break_type_id: e.target.value,
                    duration_minutes:
                      picked?.allowed_duration_minutes || c.duration_minutes,
                  }));
                }}
                className={inputClass}
              >
                <option value="">Select break type</option>
                {references.breakTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} · {type.allowed_duration_minutes} min
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Department"
            hint="Leave empty if the schedule applies to all departments."
          >
            <select
              value={form.department_id}
              onChange={(e) => set("department_id", e.target.value)}
              className={inputClass}
            >
              <option value="">All departments</option>
              {references.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Display order"
              hint="Only used to organize the list."
              required
            >
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.sequence_number}
                onChange={(e) => set("sequence_number", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Max breaks per shift" hint="Blank means no limit.">
              <input
                type="number"
                min="1"
                step="1"
                value={form.max_occurrences_per_shift}
                onChange={(e) =>
                  set("max_occurrences_per_shift", e.target.value)
                }
                placeholder="No limit"
                className={inputClass}
              />
            </Field>

            <Field label="Duration (minutes)" required>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.duration_minutes}
                onChange={(e) => set("duration_minutes", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {selectedType && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] px-4 py-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  Break type allowance
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#0B3A8C]">
                  {selectedType.allowed_duration_minutes} minutes
                  <PaidBadge paid={selectedType.is_paid} />
                </p>
              </div>

              {Number(form.duration_minutes) >
                selectedType.allowed_duration_minutes && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8102E]">
                  <AlertCircle size={13} />
                  Longer than the break type allowance
                </span>
              )}
            </div>
          )}

          <div className="flex gap-3 rounded-xl border border-[#D5E3F8] bg-[#EAF1FD] p-4 text-[#0B3A8C]">
            <Clock3 size={17} className="mt-0.5 shrink-0 text-[#1D63D6]" />
            <div>
              <p className="text-sm font-semibold">Flexible break rule</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Employees can start this break anytime while on duty. The kiosk
                records the actual start and end time, and the system compares
                it with this allowance ({formatDuration(form.duration_minutes)},{" "}
                {form.max_occurrences_per_shift
                  ? `up to ${form.max_occurrences_per_shift} per shift`
                  : "no count limit"}
                ).
              </p>
            </div>
          </div>

          {noShifts && (
            <ErrorBox>
              No active shifts found. Create or activate a shift before
              configuring break schedules.
            </ErrorBox>
          )}

          {noTypes && (
            <ErrorBox>
              No active break types found. Create a break type first.
            </ErrorBox>
          )}

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
            disabled={saving || noShifts || noTypes}
            className={primaryButton}
          >
            {saving ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {schedule ? "Save changes" : "Create schedule"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- Confirm modal ---------- */

function ConfirmStatusModal({ item, kind, busy, onClose, onConfirm }) {
  const deactivating = item.is_active;

  return (
    <Modal
      title={`${deactivating ? "Deactivate" : "Activate"} ${kind}`}
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
          <span className="font-semibold text-[#0B3A8C]">{item.name}</span>?{" "}
          {deactivating
            ? "It will no longer be available for new use."
            : "It will be available again."}
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

export default function BreaktimePage() {
  const [tab, setTab] = useState("schedules");
  const [breakTypes, setBreakTypes] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [references, setReferences] = useState({
    shifts: [],
    departments: [],
    breakTypes: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [selectedScheduleId, setSelectedScheduleId] = useState(null);
  const [selectedTypeId, setSelectedTypeId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [typeModal, setTypeModal] = useState(null); // { type } | null
  const [scheduleModal, setScheduleModal] = useState(null); // { schedule, shiftId } | null
  const [confirm, setConfirm] = useState(null); // { kind, item } | null

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");

    try {
      const [typesResponse, schedulesResponse, referencesResponse] =
        await Promise.all([
          api.get("/breaktime/types"),
          api.get("/breaktime/schedules"),
          api.get("/breaktime/references"),
        ]);

      setBreakTypes(typesResponse.data?.data || []);
      setSchedules(schedulesResponse.data?.data || []);
      setReferences(
        referencesResponse.data?.data || {
          shifts: [],
          departments: [],
          breakTypes: [],
        },
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!success) return undefined;
    const timeout = window.setTimeout(() => setSuccess(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  /* ----- Derived data ----- */

  const activeTypes = useMemo(
    () => breakTypes.filter((item) => item.is_active),
    [breakTypes],
  );

  const activeSchedules = useMemo(
    () => schedules.filter((item) => item.is_active),
    [schedules],
  );

  const coveredShiftIds = useMemo(
    () => new Set(activeSchedules.map((item) => item.shift_id)),
    [activeSchedules],
  );

  const uncoveredShifts = useMemo(
    () => references.shifts.filter((shift) => !coveredShiftIds.has(shift.id)),
    [references.shifts, coveredShiftIds],
  );

  const text = search.trim().toLowerCase();

  const filteredTypes = useMemo(
    () =>
      breakTypes.filter(
        (item) =>
          (!text ||
            [item.name, item.description]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(text)) &&
          matchesStatus(item, status),
      ),
    [breakTypes, text, status],
  );

  const filteredSchedules = useMemo(
    () =>
      schedules.filter(
        (item) =>
          (!text ||
            [
              item.name,
              item.shift?.name,
              item.break_type?.name,
              item.department?.name,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(text)) &&
          matchesStatus(item, status) &&
          (shiftFilter === "all" || item.shift_id === shiftFilter) &&
          (departmentFilter === "all" ||
            !item.department_id ||
            item.department_id === departmentFilter),
      ),
    [schedules, text, status, shiftFilter, departmentFilter],
  );

  const groups = useMemo(() => {
    const map = new Map();

    filteredSchedules.forEach((item) => {
      if (!map.has(item.shift_id)) {
        const shift =
          item.shift ||
          references.shifts.find((s) => s.id === item.shift_id) ||
          null;
        map.set(item.shift_id, { key: item.shift_id, shift, rows: [] });
      }
      map.get(item.shift_id).rows.push(item);
    });

    const list = [...map.values()];
    list.forEach((group) =>
      group.rows.sort((a, b) => a.sequence_number - b.sequence_number),
    );

    const position = (group) => {
      const index = references.shifts.findIndex((s) => s.id === group.key);
      return index === -1 ? 999 : index;
    };

    return list.sort((a, b) => position(a) - position(b));
  }, [filteredSchedules, references.shifts]);

  const showUncovered =
    !text &&
    status !== "inactive" &&
    uncoveredShifts.some(
      (shift) => shiftFilter === "all" || shift.id === shiftFilter,
    );

  const visibleUncovered = uncoveredShifts.filter(
    (shift) => shiftFilter === "all" || shift.id === shiftFilter,
  );

  const orderedSchedules = groups.flatMap((group) => group.rows);
  const selectedSchedule =
    orderedSchedules.find((item) => item.id === selectedScheduleId) ||
    orderedSchedules[0] ||
    null;

  const selectedType =
    filteredTypes.find((item) => item.id === selectedTypeId) ||
    filteredTypes[0] ||
    null;

  const maxAllowed = Math.max(
    1,
    ...breakTypes.map((item) => item.allowed_duration_minutes || 0),
  );

  const hasFilters =
    Boolean(search.trim()) ||
    status !== "all" ||
    (tab === "schedules" &&
      (shiftFilter !== "all" || departmentFilter !== "all"));

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setShiftFilter("all");
    setDepartmentFilter("all");
  };

  const changeTab = (next) => {
    setTab(next);
    resetFilters();
  };

  /* ----- Actions ----- */

  const refresh = () => {
    setRefreshing(true);
    loadData(false);
  };

  const toggleGroup = (key) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function saveType(payload) {
    setSaving(true);

    try {
      if (typeModal?.type) {
        await api.patch(`/breaktime/types/${typeModal.type.id}`, payload);
        setSuccess("Break type updated successfully.");
      } else {
        await api.post("/breaktime/types", payload);
        setSuccess("Break type created successfully.");
      }

      setTypeModal(null);
      await loadData(false);
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule(payload) {
    setSaving(true);

    try {
      if (scheduleModal?.schedule) {
        await api.patch(
          `/breaktime/schedules/${scheduleModal.schedule.id}`,
          payload,
        );
        setSuccess("Break schedule updated successfully.");
      } else {
        await api.post("/breaktime/schedules", payload);
        setSuccess("Break schedule created successfully.");
      }

      setScheduleModal(null);
      await loadData(false);
    } finally {
      setSaving(false);
    }
  }

  async function confirmStatus() {
    if (!confirm) return;

    const { kind, item } = confirm;
    const next = !item.is_active;
    const path = kind === "break type" ? "types" : "schedules";

    setSaving(true);

    try {
      await api.patch(`/breaktime/${path}/${item.id}/status`, {
        is_active: next,
      });

      const label = kind === "break type" ? "Break type" : "Break schedule";
      setSuccess(
        `${label} ${next ? "activated" : "deactivated"} successfully.`,
      );
      setConfirm(null);
      await loadData(false);
    } catch (err) {
      setConfirm(null);
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const kpis = [
    {
      label: "Break types",
      value: breakTypes.length,
      detail: `${activeTypes.length} active`,
    },
    {
      label: "Break schedules",
      value: schedules.length,
      detail: `${activeSchedules.length} active`,
    },
    {
      label: "Shifts with breaks",
      value: references.shifts.length - uncoveredShifts.length,
      detail: `of ${references.shifts.length} active shifts`,
    },
    {
      label: "Shifts without breaks",
      value: uncoveredShifts.length,
      detail: "Need a break schedule",
      alert: uncoveredShifts.length > 0,
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
              Breaktime
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Set break rules per shift. Employees can start their breaks at
              different times while they are on duty.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className={secondaryButton}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() =>
                tab === "types"
                  ? setTypeModal({ type: null })
                  : setScheduleModal({ schedule: null, shiftId: "" })
              }
              className={primaryButton}
            >
              <Plus size={17} />
              {tab === "types" ? "Add break type" : "Add schedule"}
            </button>
          </div>
        </div>
      </header>

      {success && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-[#D5E3F8] bg-[#EAF1FD] px-4 py-3 text-sm font-medium text-[#0B3A8C]"
        >
          <CheckCircle2 size={18} className="text-[#1D63D6]" />
          {success}
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
        className={`${cardClass} grid grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[#EEF3FB]`}
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
            aria-label="Breaktime views"
            className="inline-flex w-fit rounded-xl border border-[#E3EAF5] bg-white p-1"
          >
            {[
              {
                id: "schedules",
                label: "Schedules",
                icon: CalendarClock,
                count: schedules.length,
              },
              {
                id: "types",
                label: "Break types",
                icon: Coffee,
                count: breakTypes.length,
              },
            ].map(({ id, label, icon: Icon, count }) => (
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
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                    tab === id ? "bg-white/20" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
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
                  tab === "schedules"
                    ? "Search schedule, shift, type..."
                    : "Search break types..."
                }
                aria-label="Search"
                className={`${inputClass} pl-10`}
              />
            </div>

            {tab === "schedules" && (
              <>
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  aria-label="Filter by shift"
                  className={`${inputClass} sm:w-44`}
                >
                  <option value="all">All shifts</option>
                  {references.shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                </select>

                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  aria-label="Filter by department"
                  className={`${inputClass} sm:w-44`}
                >
                  <option value="all">All departments</option>
                  {references.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[#1D63D6] transition hover:bg-[#EAF1FD]"
              >
                <X size={13} />
                Clear
              </button>
            )}
          </div>
        </div>

        <div
          className="flex gap-2 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((option) => {
            const active = status === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
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
      </section>

      {/* Content */}
      {loading ? (
        <div
          className={`${cardClass} flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500`}
        >
          <LoaderCircle size={20} className="animate-spin text-[#1D63D6]" />
          Loading breaktime settings...
        </div>
      ) : tab === "schedules" ? (
        orderedSchedules.length === 0 && !showUncovered ? (
          <div className={`${cardClass} px-6 py-20 text-center`}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FD] text-[#1D63D6]">
              <CalendarClock size={27} />
            </div>
            <h3 className="mt-4 font-semibold text-slate-800">
              No break schedules found
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {hasFilters
                ? "Try changing your search or filters."
                : "Create a break schedule and assign it to one of your active shifts."}
            </p>
            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 text-sm font-semibold text-[#1D63D6] hover:text-[#0B3A8C]"
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setScheduleModal({ schedule: null, shiftId: "" })
                }
                className={`${primaryButton} mt-5`}
              >
                <Plus size={16} />
                Create schedule
              </button>
            )}
          </div>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              {/* Shifts without a break schedule */}
              {showUncovered && (
                <section className="overflow-hidden rounded-2xl border border-[#F5C2CA] bg-white">
                  <div className="flex items-center gap-3 bg-[#FDECEF] px-5 py-4">
                    <div className="rounded-lg bg-white p-2 text-[#C8102E]">
                      <AlertCircle size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-[#8E0B20]">
                        Shifts without a break schedule
                      </h2>
                      <p className="text-xs text-[#A80D26]">
                        Employees on these shifts have no break rule.
                      </p>
                    </div>
                  </div>

                  <ul className="divide-y divide-[#EEF3FB]">
                    {visibleUncovered.map((shift) => (
                      <li
                        key={shift.id}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                            {shift.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {getShiftTime(shift)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setScheduleModal({
                              schedule: null,
                              shiftId: shift.id,
                            })
                          }
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1D63D6] transition hover:bg-[#EAF1FD]"
                        >
                          Add schedule
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Schedules grouped by shift */}
              {groups.map((group) => {
                const open = !collapsed.has(group.key);

                return (
                  <section
                    key={group.key}
                    className={`${cardClass} overflow-hidden`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-[#F7FAFE] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6]"
                    >
                      <div className="rounded-lg bg-[#EAF1FD] p-2 text-[#1D63D6]">
                        <Clock3 size={17} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold text-[#0B3A8C]">
                          {group.shift?.name || "Unknown shift"}
                        </h2>
                        <p className="text-xs text-slate-500">
                          {getShiftTime(group.shift)}
                        </p>
                      </div>

                      <Pill>
                        {group.rows.length} schedule
                        {group.rows.length === 1 ? "" : "s"}
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
                        {group.rows.map((item) => {
                          const isSelected = selectedSchedule?.id === item.id;

                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => setSelectedScheduleId(item.id)}
                                aria-pressed={isSelected}
                                className={`grid w-full items-center gap-x-4 gap-y-1 border-l-4 px-5 py-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_100px] ${
                                  isSelected
                                    ? "border-[#1D63D6] bg-[#EAF1FD]/60"
                                    : "border-transparent hover:bg-[#F7FAFE]"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                                    {item.name}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    #{item.sequence_number} ·{" "}
                                    {item.break_type?.name || "Unknown type"}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-sm font-medium text-slate-700">
                                    {formatDuration(item.duration_minutes)}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {item.max_occurrences_per_shift
                                      ? `Max ${item.max_occurrences_per_shift} per shift`
                                      : "No count limit"}
                                  </p>
                                </div>

                                <p className="truncate text-sm text-slate-600">
                                  {item.department?.name || "All departments"}
                                </p>

                                <div className="mt-1 md:mt-0 md:text-right">
                                  <StatusBadge active={item.is_active} />
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}

              <p className="text-xs text-slate-500">
                Showing {orderedSchedules.length} schedule
                {orderedSchedules.length === 1 ? "" : "s"}.
              </p>
            </div>

            {selectedSchedule && (
              <ScheduleDetail
                schedule={selectedSchedule}
                onEdit={() =>
                  setScheduleModal({ schedule: selectedSchedule, shiftId: "" })
                }
                onToggle={() =>
                  setConfirm({ kind: "break schedule", item: selectedSchedule })
                }
              />
            )}
          </div>
        )
      ) : filteredTypes.length === 0 ? (
        <div className={`${cardClass} px-6 py-20 text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FD] text-[#1D63D6]">
            <Coffee size={27} />
          </div>
          <h3 className="mt-4 font-semibold text-slate-800">
            No break types found
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {hasFilters
              ? "Try changing your search or filters."
              : "Add break types such as morning break, lunch break, or afternoon break."}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-5 text-sm font-semibold text-[#1D63D6] hover:text-[#0B3A8C]"
            >
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTypeModal({ type: null })}
              className={`${primaryButton} mt-5`}
            >
              <Plus size={16} />
              Add break type
            </button>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className={`${cardClass} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[#EEF3FB] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[#0B3A8C]">
                  Break allowances
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Select a break type to see where it is used.
                </p>
              </div>

              <span className="text-xs text-slate-400">
                {filteredTypes.length} result
                {filteredTypes.length === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="divide-y divide-[#EEF3FB]">
              {filteredTypes.map((item) => {
                const isSelected = selectedType?.id === item.id;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTypeId(item.id)}
                      aria-pressed={isSelected}
                      className={`grid w-full items-center gap-x-5 gap-y-2 border-l-4 px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6] md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_70px_70px_90px] ${
                        isSelected
                          ? "border-[#1D63D6] bg-[#EAF1FD]/60"
                          : "border-transparent hover:bg-[#F7FAFE]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`rounded-xl p-2.5 ${
                            item.is_active
                              ? "bg-[#EAF1FD] text-[#1D63D6]"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          <Coffee size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                            {item.name}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {item.description || "No description"}
                          </p>
                        </div>
                      </div>

                      <div
                        className="h-3 overflow-hidden rounded-full bg-[#EEF3FB]"
                        role="img"
                        aria-label={`${item.allowed_duration_minutes} minutes allowed`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            item.is_active ? "bg-[#1D63D6]" : "bg-slate-300"
                          }`}
                          style={{
                            width: `${Math.max(
                              ((item.allowed_duration_minutes || 0) /
                                maxAllowed) *
                                100,
                              4,
                            )}%`,
                          }}
                        />
                      </div>

                      <p className="text-sm font-semibold text-[#0B3A8C] md:text-right">
                        {formatDuration(item.allowed_duration_minutes)}
                      </p>

                      <div className="md:text-right">
                        <PaidBadge paid={item.is_paid} />
                      </div>

                      <div className="md:text-right">
                        <StatusBadge active={item.is_active} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-[#EEF3FB] px-5 py-3 text-xs text-slate-500">
              Bar length is relative to the longest allowance.
            </div>
          </div>

          {selectedType && (
            <TypeDetail
              type={selectedType}
              usedBy={schedules.filter(
                (schedule) => schedule.break_type_id === selectedType.id,
              )}
              onEdit={() => setTypeModal({ type: selectedType })}
              onToggle={() =>
                setConfirm({ kind: "break type", item: selectedType })
              }
            />
          )}
        </div>
      )}

      {typeModal && (
        <TypeFormModal
          type={typeModal.type}
          saving={saving}
          onClose={() => setTypeModal(null)}
          onSubmit={saveType}
        />
      )}

      {scheduleModal && (
        <ScheduleFormModal
          schedule={scheduleModal.schedule}
          initialShiftId={scheduleModal.shiftId}
          references={references}
          saving={saving}
          onClose={() => setScheduleModal(null)}
          onSubmit={saveSchedule}
        />
      )}

      {confirm && (
        <ConfirmStatusModal
          item={confirm.item}
          kind={confirm.kind}
          busy={saving}
          onClose={() => setConfirm(null)}
          onConfirm={confirmStatus}
        />
      )}
    </div>
  );
}
