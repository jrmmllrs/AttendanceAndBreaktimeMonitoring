import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { api, getApiError } from "../../lib/api";

/**
 * Palette (same as Dashboard, Employees and Shifts): white + blue + red.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red #C8102E · Light red #FDECEF · Border #E3EAF5
 *
 * Layout (same as Shifts):
 *  - Summary strip on top.
 *  - Left: "RCS - RR by department" list with headcount bars.
 *  - Right: sticky detail panel for the selected department
 *    (supervisor + employee roster), replacing the old details modal.
 *  - Departments with no supervisor are flagged in red.
 */

const EMPTY_FORM = { name: "", description: "", supervisor_profile_id: "" };

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/* ---------- Helpers ---------- */

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
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

const needsSupervisor = (department) =>
  department.is_active &&
  !department.supervisor_profile_id &&
  !department.supervisor;

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

/* ---------- Headcount bar ---------- */

function HeadcountBar({ total, active, max }) {
  const width = total > 0 ? Math.max((total / max) * 100, 3) : 0;
  const activePct = total > 0 ? (active / total) * 100 : 0;

  return (
    <div
      className="h-3 overflow-hidden rounded-full bg-[#EEF3FB]"
      role="img"
      aria-label={`${active} active of ${total} employees`}
    >
      <div
        className="flex h-full overflow-hidden rounded-full bg-slate-300 transition-all duration-500"
        style={{ width: `${width}%` }}
      >
        <div className="h-full bg-[#1D63D6]" style={{ width: `${activePct}%` }} />
      </div>
    </div>
  );
}

/* ---------- Detail panel ---------- */

function DepartmentDetail({ department, refreshKey, onEdit, onToggle }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const response = await api.get(`/departments/${department.id}`);

        if (active) setDetails(response.data.data);
      } catch (err) {
        if (active) setError(getApiError(err));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [department.id, refreshKey]);

  const supervisor = details?.supervisor || department.supervisor;
  const employees = details?.employees || [];

  return (
    <aside className={`${cardClass} overflow-hidden xl:sticky xl:top-4`}>
      <Ribbon tab="w-16" />

      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`rounded-xl p-3 ${
                department.is_active
                  ? "bg-[#EAF1FD] text-[#1D63D6]"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Building2 size={21} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[#0B3A8C]">
                {department.name}
              </h3>
              <p className="text-xs text-slate-500">
                Created {formatDate(department.created_at)}
              </p>
            </div>
          </div>

          <Pill tone={department.is_active ? "blue" : "gray"}>
            {department.is_active ? "Active" : "Inactive"}
          </Pill>
        </div>

        {department.description && (
          <p className="text-sm leading-6 text-slate-600">
            {department.description}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3">
            <dt className="text-xs text-slate-500">Total employees</dt>
            <dd className="mt-1 text-lg font-semibold text-[#0B3A8C]">
              {department.employee_count ?? 0}
            </dd>
          </div>
          <div className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-3">
            <dt className="text-xs text-slate-500">Active employees</dt>
            <dd className="mt-1 text-lg font-semibold text-[#1D63D6]">
              {department.active_employee_count ?? 0}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Supervisor
          </p>

          {/* {supervisor ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1D63D6] text-sm font-semibold text-white">
                {initials(supervisor.full_name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                  {supervisor.full_name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {supervisor.email}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-3 py-2.5">
              <p className="text-sm font-medium text-[#8E0B20]">
                No supervisor assigned
              </p>
              <button
                type="button"
                onClick={onEdit}
                className="text-xs font-semibold text-[#C8102E] hover:underline"
              >
                Assign
              </button>
            </div>
          )} */}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">Employees</p>
            {!loading && !error && (
              <span className="text-xs text-slate-400">
                {employees.length} record{employees.length === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <LoaderCircle size={17} className="animate-spin text-[#1D63D6]" />
              Loading employees...
            </div>
          ) : error ? (
            <ErrorBox>{error}</ErrorBox>
          ) : employees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D5E3F8] py-8 text-center">
              <Users className="mx-auto text-[#B9CFF4]" size={26} />
              <p className="mt-2 text-sm font-medium text-slate-600">
                No employees assigned yet
              </p>
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-[#EEF3FB] overflow-y-auto rounded-xl border border-[#E3EAF5]">
              {employees.map((employee) => (
                <li
                  key={employee.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EAF1FD] text-[10px] font-bold text-[#1D63D6]">
                    {initials(fullName(employee))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                      {fullName(employee)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {employee.employee_number}
                      {employee.position_name
                        ? ` · ${employee.position_name}`
                        : ""}
                    </p>
                  </div>
                  <Pill
                    tone={
                      employee.employment_status === "active" ? "blue" : "gray"
                    }
                  >
                    <span className="capitalize">
                      {employee.employment_status}
                    </span>
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[#EEF3FB] pt-4">
          <button type="button" onClick={onEdit} className={primaryButton}>
            <Pencil size={15} />
            Edit
          </button>

          <button
            type="button"
            onClick={onToggle}
            className={`${secondaryButton} ${
              department.is_active
                ? "hover:border-[#F5C2CA] hover:bg-[#FDECEF] hover:text-[#C8102E]"
                : "text-[#1D63D6]"
            }`}
          >
            <Power size={15} />
            {department.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Form modal ---------- */

function DepartmentFormModal({
  department,
  supervisors,
  saving,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() =>
    department
      ? {
          name: department.name || "",
          description: department.description || "",
          supervisor_profile_id: department.supervisor_profile_id || "",
        }
      : EMPTY_FORM,
  );
  const [error, setError] = useState("");

  const set = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Department name is required.");
      return;
    }

    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        supervisor_profile_id: form.supervisor_profile_id || null,
      });
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <Modal
      title={department ? "Edit department" : "Create department"}
      subtitle={
        department
          ? "Update department information and supervisor assignment."
          : "Add a new department to your warehouse organization."
      }
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-5 p-6">
          <Field label="Department name" required>
            <input
              autoFocus
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Receiving"
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <textarea
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Briefly describe this department's responsibilities..."
              className={textareaClass}
            />
          </Field>

          <Field
            label="Department supervisor"
            hint="Only active accounts with the Supervisor role are listed."
          >
            <select
              value={form.supervisor_profile_id}
              onChange={(e) => set("supervisor_profile_id", e.target.value)}
              className={inputClass}
            >
              <option value="">No supervisor assigned</option>
              {supervisors.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.full_name} — {supervisor.email}
                </option>
              ))}
            </select>
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
            {department ? "Save changes" : "Create department"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------- Confirm modal ---------- */

function ConfirmStatusModal({ department, busy, onClose, onConfirm }) {
  const deactivating = department.is_active;

  return (
    <Modal
      title={deactivating ? "Deactivate department" : "Activate department"}
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
          {deactivating ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
        </div>

        <p className="text-sm leading-6 text-slate-600">
          {deactivating ? "Deactivate" : "Activate"}{" "}
          <span className="font-semibold text-[#0B3A8C]">
            {department.name}
          </span>
          ?{" "}
          {deactivating
            ? "Active employees must be reassigned or deactivated first."
            : "It will be available for employee assignment again."}
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

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [onlyNeedsSupervisor, setOnlyNeedsSupervisor] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [formModal, setFormModal] = useState(null); // { department } | null
  const [statusDepartment, setStatusDepartment] = useState(null);

  // Debounce search so we don't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadDepartments = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);

        setError("");

        const [departmentResponse, referenceResponse] = await Promise.all([
          api.get("/departments", { params: { search: query, status } }),
          api.get("/departments/references"),
        ]);

        setDepartments(departmentResponse.data.data || []);
        setSupervisors(referenceResponse.data.data?.supervisors || []);
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [query, status],
  );

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    if (!success) return undefined;
    const timeout = window.setTimeout(() => setSuccess(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  /* ----- Derived data ----- */

  const stats = useMemo(() => {
    const active = departments.filter((d) => d.is_active);

    return {
      total: departments.length,
      active: active.length,
      employees: departments.reduce(
        (sum, d) => sum + (d.active_employee_count || 0),
        0,
      ),
      missing: active.filter(needsSupervisor).length,
    };
  }, [departments]);

  const visible = useMemo(
    () =>
      onlyNeedsSupervisor ? departments.filter(needsSupervisor) : departments,
    [departments, onlyNeedsSupervisor],
  );

  const maxCount = useMemo(
    () => Math.max(1, ...departments.map((d) => d.employee_count || 0)),
    [departments],
  );

  const selected =
    visible.find((d) => d.id === selectedId) || visible[0] || null;

  const hasFilters = Boolean(search.trim()) || status !== "all" || onlyNeedsSupervisor;

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setOnlyNeedsSupervisor(false);
  }

  /* ----- Actions ----- */

  async function saveDepartment(payload) {
    setSaving(true);

    try {
      if (formModal?.department) {
        await api.patch(`/departments/${formModal.department.id}`, payload);
        setSuccess("Department updated successfully.");
      } else {
        await api.post("/departments", payload);
        setSuccess("Department created successfully.");
      }

      setFormModal(null);
      setRefreshKey((k) => k + 1);
      await loadDepartments(true);
    } finally {
      setSaving(false);
    }
  }

  async function confirmStatus() {
    if (!statusDepartment) return;

    const nextStatus = !statusDepartment.is_active;

    try {
      setSaving(true);
      setError("");

      await api.patch(`/departments/${statusDepartment.id}/status`, {
        is_active: nextStatus,
      });

      setSuccess(
        `Department ${nextStatus ? "activated" : "deactivated"} successfully.`,
      );
      setStatusDepartment(null);
      setRefreshKey((k) => k + 1);
      await loadDepartments(true);
    } catch (err) {
      setStatusDepartment(null);
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const kpis = [
    {
      label: "Departments",
      value: stats.total,
      detail: `${stats.active} active`,
    },
    {
      label: "Active employees",
      value: stats.employees,
      detail: "Across all departments",
    },
    {
      label: "Supervised",
      value: stats.active - stats.missing,
      detail: `of ${stats.active} active departments`,
    },
    {
      label: "Need a supervisor",
      value: stats.missing,
      detail: "Active, no supervisor",
      alert: stats.missing > 0,
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
              Departments
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Organize your warehouse teams, supervisors, and RCS - RR.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadDepartments(true)}
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
              onClick={() => setFormModal({ department: null })}
              className={primaryButton}
            >
              <Plus size={17} />
              Add department
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3 text-sm text-[#8E0B20]"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#C8102E]" />
          <div className="flex-1 whitespace-pre-line">{error}</div>
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

      {success && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-[#D5E3F8] bg-[#EAF1FD] px-4 py-3 text-sm font-medium text-[#0B3A8C]"
        >
          <CheckCircle2 size={18} className="text-[#1D63D6]" />
          {success}
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

            {/* <button
              type="button"
              onClick={() => setOnlyNeedsSupervisor((v) => !v)}
              aria-pressed={onlyNeedsSupervisor}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E] ${
                onlyNeedsSupervisor
                  ? "border-[#C8102E] bg-[#C8102E] text-white"
                  : "border-[#E3EAF5] bg-white text-slate-600 hover:border-[#C8102E] hover:text-[#C8102E]"
              }`}
            >
              <UserCog size={13} />
              Needs supervisor
            </button> */}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments..."
                aria-label="Search departments"
                className={`${inputClass} pl-10`}
              />
            </div>

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
          Loading departments...
        </div>
      ) : visible.length === 0 ? (
        <div className={`${cardClass} px-6 py-20 text-center`}>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FD] text-[#1D63D6]">
            <Building2 size={27} />
          </div>
          <h3 className="mt-4 font-semibold text-slate-800">
            No departments found
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {hasFilters
              ? "Try changing your search or filter."
              : "Create your first department to start organizing your warehouse teams."}
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
              onClick={() => setFormModal({ department: null })}
              className={`${primaryButton} mt-5`}
            >
              <Plus size={16} />
              Create department
            </button>
          )}
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* RCS - RR list */}
          <div className={`${cardClass} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-[#EEF3FB] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-[#0B3A8C]">
                  RCS - RR by department
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Select a department to see its team.
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1D63D6]" />
                  Active
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  Other
                </span>
              </div>
            </div>

            <ul className="divide-y divide-[#EEF3FB]">
              {visible.map((department) => {
                const isSelected = selected?.id === department.id;
                const missing = needsSupervisor(department);

                return (
                  <li key={department.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(department.id)}
                      aria-pressed={isSelected}
                      className={`grid w-full gap-3 border-l-4 px-5 py-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6] md:grid-cols-[240px_minmax(0,1fr)_90px] md:items-center md:gap-5 ${
                        isSelected
                          ? "border-[#1D63D6] bg-[#EAF1FD]/60"
                          : "border-transparent hover:bg-[#F7FAFE]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                            department.is_active
                              ? "bg-[#EAF1FD] text-[#1D63D6]"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          <Building2 size={19} />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                              {department.name}
                            </p>
                            {!department.is_active && (
                              <Pill tone="gray">Inactive</Pill>
                            )}
                          </div>
{/* 
                          {department.supervisor ? (
                            <p className="mt-0.5 truncate text-xs text-slate-500">
                              {department.supervisor.full_name}
                            </p>
                          ) : missing ? (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#C8102E]">
                              <AlertCircle size={11} />
                              No supervisor
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-slate-400">
                              Unassigned
                            </p>
                          )} */}
                        </div>
                      </div>

                      <HeadcountBar
                        total={department.employee_count || 0}
                        active={department.active_employee_count || 0}
                        max={maxCount}
                      />

                      <div className="md:text-right">
                        <p className="text-sm font-semibold text-[#0B3A8C]">
                          {department.active_employee_count ?? 0}
                          <span className="font-normal text-slate-400">
                            {" "}
                            / {department.employee_count ?? 0}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">active</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-[#EEF3FB] px-5 py-3 text-xs text-slate-500">
              Showing {visible.length} department
              {visible.length === 1 ? "" : "s"}. Bar length is relative to the
              largest department.
            </div>
          </div>

          {selected && (
            <DepartmentDetail
              department={selected}
              refreshKey={refreshKey}
              onEdit={() => setFormModal({ department: selected })}
              onToggle={() => setStatusDepartment(selected)}
            />
          )}
        </div>
      )}

      {formModal && (
        <DepartmentFormModal
          department={formModal.department}
          supervisors={supervisors}
          saving={saving}
          onClose={() => setFormModal(null)}
          onSubmit={saveDepartment}
        />
      )}

      {statusDepartment && (
        <ConfirmStatusModal
          department={statusDepartment}
          busy={saving}
          onClose={() => setStatusDepartment(null)}
          onConfirm={confirmStatus}
        />
      )}
    </div>
  );
}