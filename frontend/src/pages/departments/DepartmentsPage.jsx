import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  UserRound,
  Plus,
  Search,
  RefreshCw,
  Pencil,
  Eye,
  Power,
  X,
  ChevronRight,
  Mail,
  Phone,
  BriefcaseBusiness,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  UserCog,
} from "lucide-react";
import { api, getApiError } from "../../lib/api";

const EMPTY_FORM = {
  name: "",
  description: "",
  supervisor_profile_id: "",
};

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

function Modal({ title, subtitle, onClose, children, size = "max-w-xl" }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div
        className={`max-h-[90vh] w-full ${size} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <X size={19} />
          </button>
        </div>

        <div className="max-h-[calc(90vh-85px)] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

function DepartmentFormModal({
  editing,
  form,
  setForm,
  supervisors,
  saving,
  onClose,
  onSubmit,
}) {
  const update = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));

  return (
    <Modal
      title={editing ? "Edit department" : "Create department"}
      subtitle={
        editing
          ? "Update department information and supervisor assignment."
          : "Add a new department to your warehouse organization."
      }
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-5 p-6">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Department name <span className="text-rose-500">*</span>
          </label>
          <input
            autoFocus
            required
            maxLength={100}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
            placeholder="e.g. Receiving"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Description
          </label>
          <textarea
            rows={3}
            maxLength={1000}
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Briefly describe this department's responsibilities..."
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Department supervisor
          </label>
          <select
            value={form.supervisor_profile_id}
            onChange={(event) =>
              update("supervisor_profile_id", event.target.value)
            }
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
          >
            <option value="">No supervisor assigned</option>
            {supervisors.map((supervisor) => (
              <option key={supervisor.id} value={supervisor.id}>
                {supervisor.full_name} — {supervisor.email}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Only active accounts with the Supervisor role are listed.
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <LoaderCircle size={16} className="animate-spin" />}
            {editing ? "Save changes" : "Create department"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentDetailsModal({ department, onClose }) {
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
  }, [department.id]);

  return (
    <Modal
      title="Department details"
      subtitle="Department information and assigned workforce."
      onClose={onClose}
      size="max-w-3xl"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={20} />
          Loading department details...
        </div>
      ) : error ? (
        <div className="p-6">
          <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </div>
        </div>
      ) : details ? (
        <div>
          <div className="border-b border-slate-100 bg-slate-50/70 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-800">
                  <Building2 size={27} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {details.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Created {formatDate(details.created_at)}
                  </p>
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  details.is_active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {details.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {details.description && (
              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600">
                {details.description}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">
                  Total employees
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {details.employee_count}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium text-slate-500">
                  Active employees
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {details.active_employee_count}
                </p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-100 p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              Assigned supervisor
            </p>
            {details.supervisor ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                  {initials(details.supervisor.full_name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {details.supervisor.full_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {details.supervisor.email}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No supervisor assigned.</p>
            )}
          </div>

          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-bold text-slate-900">Department employees</h4>
              <span className="text-xs text-slate-500">
                {details.employees.length} records
              </span>
            </div>

            {details.employees.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <Users className="mx-auto text-slate-300" size={28} />
                <p className="mt-3 text-sm font-medium text-slate-600">
                  No employees assigned yet
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="pb-3">Employee</th>
                      <th className="pb-3">Position</th>
                      <th className="pb-3">Employment</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.employees.map((employee) => (
                      <tr
                        key={employee.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="py-3 pr-3">
                          <p className="text-sm font-semibold text-slate-800">
                            {[
                              employee.first_name,
                              employee.middle_name,
                              employee.last_name,
                              employee.suffix,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          </p>
                          <p className="text-xs text-slate-400">
                            {employee.employee_number}
                          </p>
                        </td>
                        <td className="py-3 text-sm text-slate-600">
                          {employee.position_name || "—"}
                        </td>
                        <td className="py-3 text-sm capitalize text-slate-600">
                          {employee.employment_type}
                        </td>
                        <td className="py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              employee.employment_status === "active"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {employee.employment_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailsDepartment, setDetailsDepartment] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadDepartments = useCallback(
    async (showRefresh = false) => {
      try {
        if (showRefresh) setRefreshing(true);
        else setLoading(true);

        setError("");

        const [departmentResponse, referenceResponse] = await Promise.all([
          api.get("/departments", {
            params: { search, status },
          }),
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
    [search, status],
  );

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  const stats = useMemo(() => {
    const total = departments.length;
    const active = departments.filter((item) => item.is_active).length;
    const employees = departments.reduce(
      (sum, item) => sum + (item.active_employee_count || 0),
      0,
    );
    const assigned = departments.filter(
      (item) => item.supervisor_profile_id,
    ).length;

    return { total, active, employees, assigned };
  }, [departments]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(department) {
    setEditing(department);
    setForm({
      name: department.name || "",
      description: department.description || "",
      supervisor_profile_id: department.supervisor_profile_id || "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Department name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        supervisor_profile_id: form.supervisor_profile_id || null,
      };

      if (editing) {
        await api.patch(`/departments/${editing.id}`, payload);
        setSuccess("Department updated successfully.");
      } else {
        await api.post("/departments", payload);
        setSuccess("Department created successfully.");
      }

      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      await loadDepartments(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(department) {
    const nextStatus = !department.is_active;

    const confirmed = window.confirm(
      nextStatus
        ? `Activate "${department.name}"?`
        : `Deactivate "${department.name}"? Active employees must be reassigned or deactivated first.`,
    );

    if (!confirmed) return;

    try {
      setError("");

      await api.patch(`/departments/${department.id}/status`, {
        is_active: nextStatus,
      });

      setSuccess(
        `Department ${nextStatus ? "activated" : "deactivated"} successfully.`,
      );

      await loadDepartments(true);
    } catch (err) {
      setError(getApiError(err));
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">
            <Building2 size={14} />
            Workforce management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Departments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Organize your warehouse teams, supervisors, and workforce.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadDepartments(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800"
          >
            <Plus size={17} />
            Add department
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total departments",
            value: stats.total,
            icon: Building2,
            iconStyle: "bg-slate-100 text-slate-600",
          },
          {
            label: "Active departments",
            value: stats.active,
            icon: CheckCircle2,
            iconStyle: "bg-emerald-50 text-emerald-700",
          },
          {
            label: "Active employees",
            value: stats.employees,
            icon: Users,
            iconStyle: "bg-teal-50 text-teal-700",
          },
          {
            label: "Assigned supervisors",
            value: stats.assigned,
            icon: UserCog,
            iconStyle: "bg-violet-50 text-violet-700",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                    {loading ? "—" : item.value}
                  </p>
                </div>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.iconStyle}`}
                >
                  <Icon size={21} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Department directory</h2>
            <p className="mt-1 text-xs text-slate-500">
              Manage department information and team assignments.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search departments..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 sm:w-64"
              />
            </div>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-teal-600"
            >
              <option value="all">All departments</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <LoaderCircle size={20} className="animate-spin text-teal-700" />
            Loading departments...
          </div>
        ) : departments.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Building2 size={27} />
            </div>
            <h3 className="mt-4 font-bold text-slate-800">
              No departments found
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
              {search || status !== "all"
                ? "Try changing your search or filter."
                : "Create your first department to start organizing your warehouse teams."}
            </p>
            {!search && status === "all" && (
              <button
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                <Plus size={16} />
                Create department
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[850px] text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-6 py-4">Department</th>
                    <th className="px-5 py-4">Supervisor</th>
                    <th className="px-5 py-4">Employees</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Created</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.map((department) => (
                    <tr
                      key={department.id}
                      className="border-b border-slate-50 transition hover:bg-slate-50/70"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                            <Building2 size={19} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800">
                              {department.name}
                            </p>
                            <p className="max-w-[260px] truncate text-xs text-slate-400">
                              {department.description || "No description"}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {department.supervisor ? (
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                              {initials(department.supervisor.full_name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-700">
                                {department.supervisor.full_name}
                              </p>
                              <p className="text-xs text-slate-400">
                                Supervisor
                              </p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-bold text-slate-800">
                          {department.employee_count}
                        </p>
                        <p className="text-xs text-slate-400">
                          {department.active_employee_count} active
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            department.is_active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              department.is_active
                                ? "bg-emerald-500"
                                : "bg-slate-400"
                            }`}
                          />
                          {department.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">
                        {formatDate(department.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setDetailsDepartment(department)}
                            title="View details"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-teal-50 hover:text-teal-700"
                          >
                            <Eye size={17} />
                          </button>
                          <button
                            onClick={() => openEdit(department)}
                            title="Edit department"
                            className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            onClick={() => handleStatusChange(department)}
                            title={
                              department.is_active ? "Deactivate" : "Activate"
                            }
                            className={`rounded-lg p-2 transition ${
                              department.is_active
                                ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            <Power size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {departments.map((department) => (
                <div key={department.id} className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                        <Building2 size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">
                          {department.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {department.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        department.is_active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {department.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                    <div>
                      <p className="text-[11px] text-slate-400">Employees</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">
                        {department.employee_count} total
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Supervisor</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                        {department.supervisor?.full_name || "Unassigned"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setDetailsDepartment(department)}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700"
                    >
                      View details <ChevronRight size={16} />
                    </button>

                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(department)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Edit department"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        onClick={() => handleStatusChange(department)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        aria-label="Change department status"
                      >
                        <Power size={17} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && departments.length > 0 && (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Showing {departments.length} department
            {departments.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {modalOpen && (
        <DepartmentFormModal
          editing={editing}
          form={form}
          setForm={setForm}
          supervisors={supervisors}
          saving={saving}
          onClose={() => {
            if (!saving) setModalOpen(false);
          }}
          onSubmit={handleSubmit}
        />
      )}

      {detailsDepartment && (
        <DepartmentDetailsModal
          department={detailsDepartment}
          onClose={() => setDetailsDepartment(null)}
        />
      )}
    </div>
  );
}
