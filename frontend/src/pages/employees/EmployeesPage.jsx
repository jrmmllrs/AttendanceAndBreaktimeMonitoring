import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  Users,
  Pencil,
  MoreHorizontal,
  LockKeyhole,
  UserX,
  UserCheck,
  RefreshCw,
  X,
  ChevronDown,
  BriefcaseBusiness,
  Building2,
  Phone,
  Mail,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

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

function StatusBadge({ status }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700",
    inactive: "bg-slate-100 text-slate-600",
    resigned: "bg-amber-50 text-amber-700",
    terminated: "bg-red-50 text-red-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
        styles[status] || styles.inactive
      }`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {status || "Unknown"}
    </span>
  );
}

function Modal({ title, subtitle, onClose, children, width = "max-w-2xl" }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]">
      <div
        className={`my-auto w-full ${width} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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

function Field({ label, required, children }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

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

  const setValue = (name, value) => {
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

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
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="max-h-[70vh] space-y-7 overflow-y-auto px-6 py-6">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Users size={16} className="text-teal-700" />
              <h3 className="text-sm font-semibold text-slate-800">
                Personal information
              </h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Employee ID" required>
                <input
                  className={inputClass}
                  value={form.employee_number}
                  onChange={(e) => setValue("employee_number", e.target.value)}
                  placeholder="e.g. WH-0001"
                  required
                />
              </Field>

              <Field label="First name" required>
                <input
                  className={inputClass}
                  value={form.first_name}
                  onChange={(e) => setValue("first_name", e.target.value)}
                  placeholder="First name"
                  required
                />
              </Field>

              <Field label="Middle name">
                <input
                  className={inputClass}
                  value={form.middle_name || ""}
                  onChange={(e) => setValue("middle_name", e.target.value)}
                  placeholder="Middle name"
                />
              </Field>

              <Field label="Last name" required>
                <input
                  className={inputClass}
                  value={form.last_name}
                  onChange={(e) => setValue("last_name", e.target.value)}
                  placeholder="Last name"
                  required
                />
              </Field>

              <Field label="Suffix">
                <input
                  className={inputClass}
                  value={form.suffix || ""}
                  onChange={(e) => setValue("suffix", e.target.value)}
                  placeholder="Jr., Sr., III"
                />
              </Field>

              <Field label="Email address">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email || ""}
                  onChange={(e) => setValue("email", e.target.value)}
                  placeholder="employee@company.com"
                />
              </Field>

              <Field label="Contact number">
                <input
                  className={inputClass}
                  value={form.phone || ""}
                  onChange={(e) => setValue("phone", e.target.value)}
                  placeholder="09XX XXX XXXX"
                />
              </Field>

              <Field label="Photo URL">
                <input
                  type="url"
                  className={inputClass}
                  value={form.photo_url || ""}
                  onChange={(e) => setValue("photo_url", e.target.value)}
                  placeholder="https://..."
                />
              </Field>

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

              <Field label="Birth date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.birth_date || ""}
                  onChange={(e) => setValue("birth_date", e.target.value)}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Address">
                  <textarea
                    rows={2}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                    value={form.address || ""}
                    onChange={(e) => setValue("address", e.target.value)}
                    placeholder="Complete address"
                  />
                </Field>
              </div>
            </div>
          </section>

          <div className="border-t border-slate-100" />

          <section>
            <div className="mb-4 flex items-center gap-2">
              <BriefcaseBusiness size={16} className="text-teal-700" />
              <h3 className="text-sm font-semibold text-slate-800">
                Employment information
              </h3>
            </div>

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
                  <option value="regular">Regular</option>
                  <option value="probationary">Probationary</option>
                  <option value="contractual">Contractual</option>
                  <option value="temporary">Temporary</option>
                </select>
              </Field>

              <Field label="Hire date">
                <input
                  type="date"
                  className={inputClass}
                  value={form.date_hired}
                  onChange={(e) => setValue("date_hired", e.target.value)}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Internal notes">
                  <textarea
                    rows={2}
                    className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                    value={form.notes || ""}
                    onChange={(e) => setValue("notes", e.target.value)}
                    placeholder="Optional notes..."
                  />
                </Field>
              </div>
            </div>
          </section>

          {!employee && (
            <>
              <div className="border-t border-slate-100" />

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <LockKeyhole size={16} className="text-teal-700" />
                  <h3 className="text-sm font-semibold text-slate-800">
                    Kiosk access PIN
                  </h3>
                </div>

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

                <p className="mt-2 text-xs text-slate-400">
                  The PIN is securely hashed before being stored. Employees will
                  use this PIN with their Employee ID at the kiosk.
                </p>
              </section>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : employee
                ? "Save changes"
                : "Create employee"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
      onClose={onClose}
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

          <p className="text-xs leading-5 text-slate-400">
            The previous PIN will no longer work once the new PIN is saved.
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Reset PIN"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
  const [pageError, setPageError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [departmentId, setDepartmentId] = useState("all");

  const [modalEmployee, setModalEmployee] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [pinEmployee, setPinEmployee] = useState(null);
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
              search,
              status,
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
    [search, status, departmentId],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 250);

    return () => clearTimeout(timer);
  }, [loadData]);

  const handleSaveEmployee = async (form) => {
    setSaving(true);

    try {
      const payload = { ...form };

      if (!modalEmployee) {
        await api.post("/employees", payload);
      } else {
        delete payload.pin;
        await api.patch(`/employees/${modalEmployee.id}`, payload);
      }

      setFormOpen(false);
      setModalEmployee(null);
      await loadData(false);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (employee) => {
    const nextStatus =
      employee.employment_status === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      nextStatus === "inactive"
        ? `Deactivate ${fullName(employee)}? They will no longer be eligible to use the kiosk.`
        : `Reactivate ${fullName(employee)}?`,
    );

    if (!confirmed) return;

    try {
      await api.patch(`/employees/${employee.id}/status`, {
        employment_status: nextStatus,
      });

      setOpenMenu(null);
      await loadData(false);
    } catch (error) {
      setPageError(getApiError(error));
    }
  };

  const handleSavePin = async (pin) => {
    setSaving(true);

    try {
      await api.patch(`/employees/${pinEmployee.id}/pin`, { pin });
      setPinEmployee(null);
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setModalEmployee(null);
    setFormOpen(true);
  };

  const openEdit = (employee) => {
    setModalEmployee(employee);
    setFormOpen(true);
    setOpenMenu(null);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-teal-700">
            <Users size={15} />
            WORKFORCE
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Employees
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Manage employee profiles, department assignments, and kiosk access.
          </p>
        </div>

        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            <Plus size={17} />
            Add employee
          </button>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Employees shown</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {loading ? "—" : employees.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Active employees shown
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">
            {loading
              ? "—"
              : employees.filter((item) => item.employment_status === "active")
                  .length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Departments</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {references.departments.length}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search
              size={17}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, employee ID, or email..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="h-10 min-w-36 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-teal-600"
            >
              <option value="all">All departments</option>
              {references.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 min-w-32 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 outline-none focus:border-teal-600"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="resigned">Resigned</option>
              <option value="terminated">Terminated</option>
              <option value="all">All statuses</option>
            </select>

            <button
              onClick={() => {
                setRefreshing(true);
                loadData(false);
              }}
              disabled={refreshing}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50"
              title="Refresh employees"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        {pageError && (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead className="bg-slate-50/80">
              <tr>
                {[
                  "EMPLOYEE",
                  "DEPARTMENT",
                  "POSITION",
                  "EMPLOYMENT",
                  "STATUS",
                  "",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="px-5 py-3 text-[10px] font-bold tracking-[0.1em] text-slate-400"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <RefreshCw size={16} className="animate-spin" />
                      Loading employees...
                    </div>
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                      <Users size={22} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      No employees found
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Try adjusting your search or filters.
                    </p>
                    {canManage && (
                      <button
                        onClick={openCreate}
                        className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-800"
                      >
                        Add your first employee
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {employee.photo_url ? (
                          <img
                            src={employee.photo_url}
                            alt={fullName(employee)}
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">
                            {getInitials(employee)}
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {fullName(employee)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {employee.employee_number}
                          </p>
                          {employee.email && (
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                              <Mail size={11} />
                              {employee.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-700">
                        {employee.department_name || "Unassigned"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-700">
                        {employee.position_name || "—"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <span className="text-sm capitalize text-slate-600">
                        {employee.employment_type || "—"}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={employee.employment_status} />
                    </td>

                    <td className="px-5 py-4 text-right">
                      {canManage && (
                        <div className="relative inline-block">
                          <button
                            onClick={() =>
                              setOpenMenu(
                                openMenu === employee.id ? null : employee.id,
                              )
                            }
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Employee actions"
                          >
                            <MoreHorizontal size={19} />
                          </button>

                          {openMenu === employee.id && (
                            <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
                              <button
                                onClick={() => openEdit(employee)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                <Pencil size={14} />
                                Edit employee
                              </button>

                              <button
                                onClick={() => {
                                  setPinEmployee(employee);
                                  setOpenMenu(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                <LockKeyhole size={14} />
                                Reset kiosk PIN
                              </button>

                              <div className="my-1 border-t border-slate-100" />

                              <button
                                onClick={() => handleStatusChange(employee)}
                                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium hover:bg-slate-50 ${
                                  employee.employment_status === "active"
                                    ? "text-red-600"
                                    : "text-emerald-700"
                                }`}
                              >
                                {employee.employment_status === "active" ? (
                                  <UserX size={14} />
                                ) : (
                                  <UserCheck size={14} />
                                )}
                                {employee.employment_status === "active"
                                  ? "Deactivate employee"
                                  : "Reactivate employee"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            Showing {employees.length} employee
            {employees.length === 1 ? "" : "s"} on this page
          </p>
          <p className="text-xs text-slate-400">
            Employee records are retained when deactivated.
          </p>
        </div>
      </section>

      {formOpen && (
        <EmployeeFormModal
          employee={modalEmployee}
          references={references}
          onClose={() => {
            setFormOpen(false);
            setModalEmployee(null);
          }}
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
    </div>
  );
}
