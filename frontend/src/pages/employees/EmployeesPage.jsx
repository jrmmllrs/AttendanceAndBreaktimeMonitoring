import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserCog,
  UserX,
  Users,
  X,
  CheckCircle2,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Palette (same as Dashboard, Shifts and Departments): white + blue + red.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red #C8102E · Light red #FDECEF · Border #E3EAF5
 *
 * Layout (same as Shifts and Departments):
 *  - Summary strip on top.
 *  - Left: employees grouped by department (collapsible). Employees with no
 *    department sit in a red "No department" group on top.
 *  - Right: sticky profile panel for the selected employee with Edit,
 *    Reset kiosk PIN and Deactivate. This replaces the row action menu.
 *
 * Filters: employment type (pills), department, and search.
 * All employment statuses are loaded; each row still shows its status badge.
 */

const initialForm = {
  employee_number: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  email: "",
  photo_url: "",
  phone: "",
  gender: "",
  birth_date: "",
  address: "",
  department_id: "",
  position_id: "",
  supervisor_employee_id: "",
  employment_type: "regular",
  date_hired: new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  }),
  notes: "",
  pin: "",
};

const EMPLOYMENT_TYPES = [
  { value: "regular", label: "Regular" },
  // { value: "probationary", label: "Probationary" },
  // { value: "contractual", label: "Contractual" },
  { value: "temporary", label: "Seasonal" },
];

const TYPE_FILTERS = [{ value: "all", label: "All" }, ...EMPLOYMENT_TYPES];

const NO_DEPARTMENT = "none";

/* ---------- Helpers ---------- */

function getInitials(employee) {
  return `${employee.first_name?.[0] || ""}${employee.last_name?.[0] || ""}`.toUpperCase();
}

function fullName(employee) {
  return [
    employee.first_name,
    employee.middle_name,
    employee.last_name,
    employee.suffix,
  ]
    .filter(Boolean)
    .join(" ");
}

function employmentLabel(value) {
  return EMPLOYMENT_TYPES.find((t) => t.value === value)?.label || value;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function StatusBadge({ status }) {
  // Blue = active, red = terminated, gray = everything else
  const styles = {
    active: "bg-[#EAF1FD] text-[#1D63D6]",
    inactive: "bg-slate-100 text-slate-600",
    resigned: "bg-slate-100 text-slate-600",
    terminated: "bg-[#FDECEF] text-[#C8102E]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        styles[status] || styles.inactive
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status || "Unknown"}
    </span>
  );
}

function Avatar({ employee, size = "h-10 w-10", text = "text-xs" }) {
  if (employee.photo_url) {
    return (
      <img
        src={employee.photo_url}
        alt={fullName(employee)}
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-[#E3EAF5]`}
      />
    );
  }

  return (
    <div
      className={`flex ${size} ${text} shrink-0 items-center justify-center rounded-full bg-[#EAF1FD] font-bold text-[#1D63D6]`}
    >
      {getInitials(employee)}
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, width = "max-w-2xl" }) {
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

function Field({ label, required, children }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-1 text-[#C8102E]">*</span>}
      </label>
      {children}
    </div>
  );
}

function FormSection({ icon: Icon, title, children }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5">
        <div className="rounded-lg bg-[#EAF1FD] p-1.5 text-[#1D63D6]">
          <Icon size={15} />
        </div>
        <h3 className="text-sm font-semibold text-[#0B3A8C]">{title}</h3>
      </div>

      {children}
    </section>
  );
}

function ErrorBox({ children }) {
  return (
    <div className="rounded-lg border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3 text-sm text-[#8E0B20]">
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 rounded-lg bg-[#EAF1FD] p-1.5 text-[#1D63D6]">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">
          {children || <span className="font-normal text-slate-400">—</span>}
        </dd>
      </div>
    </div>
  );
}

/* ---------- Profile panel ---------- */

function EmployeeProfile({
  employee,
  references,
  canManage,
  panelRef,
  onEdit,
  onPin,
  onToggle,
}) {
  const active = employee.employment_status === "active";
  const reportsTo = references.supervisors.find(
    (person) => person.id === employee.supervisor_employee_id,
  );

  return (
    <aside
      ref={panelRef}
      className={`${cardClass} scroll-mt-4 overflow-hidden xl:sticky xl:top-4`}
    >
      <Ribbon tab="w-16" />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar employee={employee} size="h-14 w-14" text="text-base" />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[#0B3A8C]">
                {fullName(employee)}
              </h3>
              <p className="text-xs text-slate-500">
                {employee.employee_number}
              </p>
            </div>
          </div>

          <StatusBadge status={employee.employment_status} />
        </div>

        <dl className="space-y-3.5">
          <InfoRow icon={Mail} label="Email">
            {employee.email}
          </InfoRow>
          <InfoRow icon={Phone} label="Contact number">
            {employee.phone}
          </InfoRow>
          <InfoRow icon={Building2} label="Department">
            {employee.department_name}
          </InfoRow>
          <InfoRow icon={BriefcaseBusiness} label="Position">
            {employee.position_name}
          </InfoRow>
          <InfoRow icon={UserCog} label="Reports to">
            {reportsTo &&
              `${reportsTo.first_name} ${reportsTo.last_name} (${reportsTo.employee_number})`}
          </InfoRow>
          <InfoRow icon={CalendarDays} label="Employment">
            {employee.employment_type
              ? `${employmentLabel(employee.employment_type)} · hired ${formatDate(employee.date_hired)}`
              : null}
          </InfoRow>
          {employee.address && (
            <InfoRow icon={MapPin} label="Address">
              {employee.address}
            </InfoRow>
          )}
        </dl>

        {employee.notes && (
          <div className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3">
            <p className="text-xs font-semibold text-slate-500">
              Internal notes
            </p>
            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
              {employee.notes}
            </p>
          </div>
        )}

        {canManage ? (
          <div className="flex flex-wrap gap-2 border-t border-[#EEF3FB] pt-4">
            <button type="button" onClick={onEdit} className={primaryButton}>
              <Pencil size={15} />
              Edit
            </button>

            <button type="button" onClick={onPin} className={secondaryButton}>
              <LockKeyhole size={15} />
              Reset PIN
            </button>

            <button
              type="button"
              onClick={onToggle}
              className={`${secondaryButton} ${
                active
                  ? "hover:border-[#F5C2CA] hover:bg-[#FDECEF] hover:text-[#C8102E]"
                  : "text-[#1D63D6]"
              }`}
            >
              {active ? <UserX size={15} /> : <UserCheck size={15} />}
              {active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        ) : (
          <p className="border-t border-[#EEF3FB] pt-4 text-xs text-slate-500">
            Only Admin and HR can edit employee records.
          </p>
        )}
      </div>
    </aside>
  );
}

/* ---------- Employee form ---------- */

function EmployeeFormModal({ employee, references, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => {
    if (!employee) return { ...initialForm };

    return {
      ...initialForm,
      ...employee,
      birth_date: employee.birth_date || "",
      date_hired: employee.date_hired || "",
      department_id: employee.department_id || "",
      position_id: employee.position_id || "",
      supervisor_employee_id: employee.supervisor_employee_id || "",
      pin: "",
    };
  });

  const [error, setError] = useState("");

  const setValue = (name, value) =>
    setForm((current) => ({ ...current, [name]: value }));

  const text = (name, label, { required, type = "text", placeholder } = {}) => (
    <Field label={label} required={required}>
      <input
        type={type}
        className={inputClass}
        value={form[name] ?? ""}
        onChange={(e) => setValue(name, e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </Field>
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!employee && !/^\d{4,8}$/.test(form.pin)) {
      setError("Please enter a PIN containing 4 to 8 digits.");
      return;
    }

    try {
      await onSave(form);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  return (
    <Modal
      title={employee ? "Edit employee" : "Add new employee"}
      subtitle={
        employee
          ? `Update the employee details for ${fullName(employee)}.`
          : "Create an employee profile and configure kiosk access."
      }
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <div className="max-h-[65vh] space-y-7 overflow-y-auto px-6 py-6">
          <FormSection icon={Users} title="Personal information">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("employee_number", "Employee ID", {
                required: true,
                placeholder: "e.g. WH-0001",
              })}
              {text("first_name", "First name", {
                required: true,
                placeholder: "First name",
              })}
              {text("middle_name", "Middle name", {
                placeholder: "Middle name",
              })}
              {text("last_name", "Last name", {
                required: true,
                placeholder: "Last name",
              })}
              {text("suffix", "Suffix", { placeholder: "Jr., Sr., III" })}
              {text("email", "Email address", {
                type: "email",
                placeholder: "employee@company.com",
              })}
              {text("phone", "Contact number", {
                placeholder: "09XX XXX XXXX",
              })}
              {text("photo_url", "Photo URL", {
                type: "url",
                placeholder: "https://...",
              })}

              <Field label="Gender">
                <select
                  className={inputClass}
                  value={form.gender || ""}
                  onChange={(e) => setValue("gender", e.target.value)}
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </Field>

              {text("birth_date", "Birth date", { type: "date" })}

              <div className="sm:col-span-2">
                <Field label="Address">
                  <textarea
                    rows={2}
                    className={textareaClass}
                    value={form.address || ""}
                    onChange={(e) => setValue("address", e.target.value)}
                    placeholder="Complete address"
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          <div className="border-t border-[#EEF3FB]" />

          <FormSection icon={BriefcaseBusiness} title="Employment information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department">
                <select
                  className={inputClass}
                  value={form.department_id || ""}
                  onChange={(e) => setValue("department_id", e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {references.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Position">
                <select
                  className={inputClass}
                  value={form.position_id || ""}
                  onChange={(e) => setValue("position_id", e.target.value)}
                >
                  <option value="">Select position</option>
                  {references.positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Reports to">
                <select
                  className={inputClass}
                  value={form.supervisor_employee_id || ""}
                  onChange={(e) =>
                    setValue("supervisor_employee_id", e.target.value)
                  }
                >
                  <option value="">No assigned supervisor</option>
                  {references.supervisors
                    .filter((person) => person.id !== employee?.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.employee_number} — {person.first_name}{" "}
                        {person.last_name}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Employment type">
                <select
                  className={inputClass}
                  value={form.employment_type}
                  onChange={(e) => setValue("employment_type", e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>

              {text("date_hired", "Hire date", { type: "date" })}

              <div className="sm:col-span-2">
                <Field label="Internal notes">
                  <textarea
                    rows={2}
                    className={textareaClass}
                    value={form.notes || ""}
                    onChange={(e) => setValue("notes", e.target.value)}
                    placeholder="Optional notes..."
                  />
                </Field>
              </div>
            </div>
          </FormSection>

          {!employee && (
            <>
              <div className="border-t border-[#EEF3FB]" />

              <FormSection icon={LockKeyhole} title="Kiosk access PIN">
                <Field label="Initial PIN" required>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={8}
                    className={inputClass}
                    value={form.pin}
                    onChange={(e) =>
                      setValue(
                        "pin",
                        e.target.value.replace(/\D/g, "").slice(0, 8),
                      )
                    }
                    placeholder="Enter 4–8 digit PIN"
                    required
                  />
                </Field>

                <p className="mt-2 text-xs leading-5 text-slate-500">
                  The PIN is securely hashed before being stored. Employees will
                  use this PIN with their Employee ID at the kiosk.
                </p>
              </FormSection>
            </>
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

          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <LoaderCircle size={16} className="animate-spin" />}
            {employee ? "Save changes" : "Create employee"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- PIN modal ---------- */

function PinModal({ employee, onClose, onSave, saving }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!/^\d{4,8}$/.test(pin)) {
      setError("PIN must contain 4 to 8 digits.");
      return;
    }

    try {
      await onSave(pin);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  return (
    <Modal
      title="Reset employee PIN"
      subtitle={`Set a new kiosk PIN for ${fullName(employee)}.`}
      onClose={() => {
        if (!saving) onClose();
      }}
      width="max-w-md"
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 p-6">
          <Field label="New PIN" required>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={8}
              className={inputClass}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="Enter 4–8 digit PIN"
              autoFocus
            />
          </Field>

          <p className="text-xs leading-5 text-slate-500">
            The previous PIN will no longer work once the new PIN is saved.
          </p>

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
            Reset PIN
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- Confirm modal ---------- */

function ConfirmStatusModal({ employee, busy, onClose, onConfirm }) {
  const deactivating = employee.employment_status === "active";

  return (
    <Modal
      title={deactivating ? "Deactivate employee" : "Reactivate employee"}
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
          {deactivating ? <AlertTriangle size={20} /> : <UserCheck size={20} />}
        </div>

        <p className="text-sm leading-6 text-slate-600">
          {deactivating ? "Deactivate" : "Reactivate"}{" "}
          <span className="font-semibold text-[#0B3A8C]">
            {fullName(employee)}
          </span>
          ?{" "}
          {deactivating
            ? "They will no longer be eligible to use the kiosk. Their records are kept."
            : "They will be able to use the kiosk again."}
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
          {deactivating ? "Deactivate" : "Reactivate"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/* ---------- Page ---------- */

export default function EmployeesPage() {
  const { user } = useAuth();
  const canManage = ["admin", "hr"].includes(user?.role);

  const [employees, setEmployees] = useState([]);
  const [references, setReferences] = useState({
    departments: [],
    positions: [],
    supervisors: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [employmentType, setEmploymentType] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");

  const [selectedId, setSelectedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());

  const [formModal, setFormModal] = useState(null); // { employee } | null
  const [pinEmployee, setPinEmployee] = useState(null);
  const [statusEmployee, setStatusEmployee] = useState(null);

  const panelRef = useRef(null);

  // Debounce search so we don't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);

      setPageError("");

      try {
        const [employeeResponse, referenceResponse] = await Promise.all([
          api.get("/employees", {
            params: {
              page: 1,
              limit: 100,
              search: query,
              status: "all",
              department_id: departmentId,
            },
          }),
          api.get("/employees/references"),
        ]);

        setEmployees(employeeResponse.data.data || []);
        setReferences(
          referenceResponse.data.data || {
            departments: [],
            positions: [],
            supervisors: [],
          },
        );
      } catch (error) {
        setPageError(getApiError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, departmentId],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  /* ----- Derived data ----- */

  // Employment type is filtered on the client, on top of the search and
  // department filters that are sent to the API.
  const visibleEmployees =
    employmentType === "all"
      ? employees
      : employees.filter((item) => item.employment_type === employmentType);

  const typeCounts = employees.reduce(
    (counts, item) => {
      counts.all += 1;
      if (item.employment_type) {
        counts[item.employment_type] = (counts[item.employment_type] || 0) + 1;
      }
      return counts;
    },
    { all: 0 },
  );

  // Group by department. "No department" goes first so gaps are obvious.
  const groups = (() => {
    const map = new Map();

    visibleEmployees.forEach((employee) => {
      const key = employee.department_id || NO_DEPARTMENT;
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: employee.department_name || "No department",
          rows: [],
        });
      }
      map.get(key).rows.push(employee);
    });

    return [...map.values()].sort((a, b) => {
      if (a.key === NO_DEPARTMENT) return -1;
      if (b.key === NO_DEPARTMENT) return 1;
      return a.name.localeCompare(b.name);
    });
  })();

  const ordered = groups.flatMap((group) => group.rows);
  const selected =
    ordered.find((employee) => employee.id === selectedId) ||
    ordered[0] ||
    null;

  const activeShown = visibleEmployees.filter(
    (item) => item.employment_status === "active",
  ).length;

  const noDepartmentCount = visibleEmployees.filter(
    (e) => !e.department_id,
  ).length;

  const hasFilters =
    Boolean(search.trim()) ||
    departmentId !== "all" ||
    employmentType !== "all";

  const resetFilters = () => {
    setSearch("");
    setDepartmentId("all");
    setEmploymentType("all");
  };

  /* ----- Actions ----- */

  const selectEmployee = (id) => {
    setSelectedId(id);

    // On narrow screens the panel is below the list, so bring it into view.
    if (window.innerWidth < 1280) {
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  };

  const toggleGroup = (key) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleSaveEmployee = async (form) => {
    setSaving(true);

    try {
      const payload = { ...form };

      if (!formModal?.employee) {
        await api.post("/employees", payload);
        setNotice("Employee created successfully.");
      } else {
        delete payload.pin;
        await api.patch(`/employees/${formModal.employee.id}`, payload);
        setNotice("Employee updated successfully.");
      }

      setFormModal(null);
      await loadData(false);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmStatus = async () => {
    if (!statusEmployee) return;

    const nextStatus =
      statusEmployee.employment_status === "active" ? "inactive" : "active";

    setSaving(true);

    try {
      await api.patch(`/employees/${statusEmployee.id}/status`, {
        employment_status: nextStatus,
      });

      setNotice(
        `Employee ${nextStatus === "active" ? "reactivated" : "deactivated"} successfully.`,
      );
      setStatusEmployee(null);
      await loadData(false);
    } catch (error) {
      setStatusEmployee(null);
      setPageError(getApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePin = async (pin) => {
    setSaving(true);

    try {
      await api.patch(`/employees/${pinEmployee.id}/pin`, { pin });
      setPinEmployee(null);
      setNotice("Kiosk PIN reset successfully.");
    } finally {
      setSaving(false);
    }
  };

  const kpis = [
    {
      label: "Employees shown",
      value: visibleEmployees.length,
      detail: "Matching your filters",
    },
    {
      label: "Active",
      value: activeShown,
      detail: "Eligible for the kiosk",
    },
    {
      label: "Departments",
      value: references.departments.length,
      detail: "Available for assignment",
    },
    {
      label: "No department",
      value: noDepartmentCount,
      detail: "Need an assignment",
      alert: noDepartmentCount > 0,
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
              Employees
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage employee profiles, department assignments, and kiosk
              access.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                loadData(false);
              }}
              disabled={refreshing}
              className={secondaryButton}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>

            {canManage && (
              <button
                type="button"
                onClick={() => setFormModal({ employee: null })}
                className={primaryButton}
              >
                <Plus size={17} />
                Add employee
              </button>
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
          {notice}
        </div>
      )}

      {pageError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3 text-sm text-[#8E0B20]"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#C8102E]" />
          <div className="flex-1">{pageError}</div>
          <button
            type="button"
            onClick={() => setPageError("")}
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

      {/* Filters */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex gap-2 overflow-x-auto pb-0.5"
            role="group"
            aria-label="Filter by employment type"
          >
            {TYPE_FILTERS.map((option) => {
              const active = employmentType === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setEmploymentType(option.value)}
                  aria-pressed={active}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                    active
                      ? "border-[#1D63D6] bg-[#1D63D6] text-white"
                      : "border-[#E3EAF5] bg-white text-slate-600 hover:border-[#1D63D6] hover:text-[#1D63D6]"
                  }`}
                >
                  {option.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-white/20 text-white" : "bg-[#EEF3FB]"
                    }`}
                  >
                    {loading ? "—" : typeCounts[option.value] || 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, employee ID, or email..."
                aria-label="Search employees"
                className={`${inputClass} pl-10`}
              />
            </div>

            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              aria-label="Filter by department"
              className={`${inputClass} sm:w-48`}
            >
              <option value="all">All departments</option>
              {references.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

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
      </section>

      {/* Content */}
      {loading ? (
        <div
          className={`${cardClass} flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500`}
        >
          <LoaderCircle size={20} className="animate-spin text-[#1D63D6]" />
          Loading employees...
        </div>
      ) : visibleEmployees.length === 0 ? (
        <div className={`${cardClass} px-6 py-20 text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FD] text-[#1D63D6]">
            <Users size={27} />
          </div>
          <h3 className="mt-4 font-semibold text-slate-800">
            No employees found
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {hasFilters
              ? "Try changing your search or filters."
              : "Add your first employee to start managing your RCS - RR."}
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
            canManage && (
              <button
                type="button"
                onClick={() => setFormModal({ employee: null })}
                className={`${primaryButton} mt-5`}
              >
                <Plus size={16} />
                Add employee
              </button>
            )
          )}
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Grouped list */}
          <div className="space-y-4">
            {groups.map((group) => {
              const open = !collapsed.has(group.key);
              const missing = group.key === NO_DEPARTMENT;

              return (
                <section
                  key={group.key}
                  className={`overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)] ${
                    missing ? "border-[#F5C2CA]" : "border-[#E3EAF5]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={open}
                    className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6] ${
                      missing ? "bg-[#FDECEF]" : "hover:bg-[#F7FAFE]"
                    }`}
                  >
                    <div
                      className={`rounded-lg p-2 ${
                        missing
                          ? "bg-white text-[#C8102E]"
                          : "bg-[#EAF1FD] text-[#1D63D6]"
                      }`}
                    >
                      {missing ? (
                        <AlertTriangle size={17} />
                      ) : (
                        <Building2 size={17} />
                      )}
                    </div>

                    <h2
                      className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                        missing ? "text-[#8E0B20]" : "text-[#0B3A8C]"
                      }`}
                    >
                      {group.name}
                    </h2>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        missing
                          ? "bg-white text-[#C8102E]"
                          : "bg-[#EAF1FD] text-[#1D63D6]"
                      }`}
                    >
                      {group.rows.length}
                    </span>

                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-slate-400 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {open && (
                    <ul className="divide-y divide-[#EEF3FB] border-t border-[#EEF3FB]">
                      {group.rows.map((employee) => {
                        const isSelected = selected?.id === employee.id;

                        return (
                          <li key={employee.id}>
                            <button
                              type="button"
                              onClick={() => selectEmployee(employee.id)}
                              aria-pressed={isSelected}
                              className={`grid w-full items-center gap-x-4 gap-y-1 border-l-4 px-5 py-3.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6] md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_110px_110px] ${
                                isSelected
                                  ? "border-[#1D63D6] bg-[#EAF1FD]/60"
                                  : "border-transparent hover:bg-[#F7FAFE]"
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar employee={employee} />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                                    {fullName(employee)}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {employee.employee_number}
                                    {employee.email
                                      ? ` · ${employee.email}`
                                      : ""}
                                  </p>
                                </div>
                              </div>

                              <p className="hidden truncate text-sm text-slate-600 md:block">
                                {employee.position_name || "—"}
                              </p>

                              <div className="hidden md:block">
                                {employee.employment_type ? (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                    {employmentLabel(employee.employment_type)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-slate-400">
                                    —
                                  </span>
                                )}
                              </div>

                              <div className="mt-1 md:mt-0 md:text-right">
                                <StatusBadge
                                  status={employee.employment_status}
                                />
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
              Showing {visibleEmployees.length} employee
              {visibleEmployees.length === 1 ? "" : "s"}. Employee records are
              retained when deactivated.
            </p>
          </div>

          {selected && (
            <EmployeeProfile
              employee={selected}
              references={references}
              canManage={canManage}
              panelRef={panelRef}
              onEdit={() => setFormModal({ employee: selected })}
              onPin={() => setPinEmployee(selected)}
              onToggle={() => setStatusEmployee(selected)}
            />
          )}
        </div>
      )}

      {formModal && (
        <EmployeeFormModal
          employee={formModal.employee}
          references={references}
          onClose={() => setFormModal(null)}
          onSave={handleSaveEmployee}
          saving={saving}
        />
      )}

      {pinEmployee && (
        <PinModal
          employee={pinEmployee}
          onClose={() => setPinEmployee(null)}
          onSave={handleSavePin}
          saving={saving}
        />
      )}

      {statusEmployee && (
        <ConfirmStatusModal
          employee={statusEmployee}
          busy={saving}
          onClose={() => setStatusEmployee(null)}
          onConfirm={handleConfirmStatus}
        />
      )}
    </div>
  );
}
