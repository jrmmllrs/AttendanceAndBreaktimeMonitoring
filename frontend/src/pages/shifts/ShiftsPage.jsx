import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  Filter,
  History,
  Loader2,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Users,
  X,
  Zap,
} from "lucide-react";
import { api, getApiError } from "../../lib/api";

const DAYS = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const EMPTY_SHIFT = {
  name: "",
  description: "",
  start_time: "07:00",
  end_time: "16:00",
  grace_period_minutes: 10,
  expected_work_minutes: 480,
  rest_days: [0],
};

const EMPTY_ASSIGNMENT = {
  employee_id: "",
  shift_id: "",
  effective_from: new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Manila",
  }),
  effective_until: "",
  notes: "",
};

function formatTime(value) {
  if (!value) return "--:--";

  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;

  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatMinutes(value) {
  const minutes = Number(value) || 0;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) return `${remaining} min`;
  if (!remaining) return `${hours} hr`;

  return `${hours}h ${remaining}m`;
}

function formatDate(value) {
  if (!value) return "No end date";

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

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;

  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : 1440 - startMinutes + endMinutes;
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

function getShiftType(shift) {
  if (shift.is_overnight) return "Night shift";

  const start = Number(shift.start_time?.slice(0, 2) || 0);

  if (start >= 5 && start < 12) return "Morning shift";
  if (start >= 12 && start < 18) return "Afternoon shift";

  return "Evening shift";
}

function getShiftIcon(shift) {
  if (shift.is_overnight) return Moon;
  return Sun;
}

function Modal({ title, subtitle, onClose, children, width = "max-w-xl" }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[3px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={19} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10";

function PrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  type = "button",
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState("shifts");

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
  const [assignmentShiftFilter, setAssignmentShiftFilter] = useState("all");
  const [showHistory, setShowHistory] = useState(false);

  const [shiftModal, setShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT);

  const [assignmentModal, setAssignmentModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState(EMPTY_ASSIGNMENT);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState([]);

  const [detailShift, setDetailShift] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState("");

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [shiftResponse, referenceResponse, assignmentResponse] =
        await Promise.all([
          api.get("/shifts", {
            params: { status: "all" },
          }),
          api.get("/shifts/references"),
          api.get("/shifts/assignments", {
            params: { history: showHistory ? "true" : "false" },
          }),
        ]);

      setShifts(shiftResponse.data?.data || []);

      const references = referenceResponse.data?.data || {};
      setEmployees(references.employees || []);
      setDepartments(references.departments || []);

      setAssignments(assignmentResponse.data?.data || []);
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
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const activeShifts = useMemo(
    () => shifts.filter((shift) => shift.is_active),
    [shifts],
  );

  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      const matchesSearch =
        shift.name.toLowerCase().includes(search.toLowerCase()) ||
        (shift.description || "").toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        shiftStatus === "all" ||
        (shiftStatus === "active" && shift.is_active) ||
        (shiftStatus === "inactive" && !shift.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [shifts, search, shiftStatus]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      const matchesShift =
        assignmentShiftFilter === "all" ||
        assignment.shift_id === assignmentShiftFilter;

      const matchesDepartment =
        departmentFilter === "all" ||
        assignment.employee?.department_id === departmentFilter;

      const searchText = search.toLowerCase();
      const matchesSearch =
        !searchText ||
        assignment.employee?.full_name?.toLowerCase().includes(searchText) ||
        assignment.employee?.employee_number
          ?.toLowerCase()
          .includes(searchText) ||
        assignment.shift?.name?.toLowerCase().includes(searchText);

      return matchesShift && matchesDepartment && matchesSearch;
    });
  }, [assignments, assignmentShiftFilter, departmentFilter, search]);

  const currentlyAssignedIds = useMemo(() => {
    return new Set(assignments.map((assignment) => assignment.employee_id));
  }, [assignments]);

  const unassignedCount = employees.filter(
    (employee) => !currentlyAssignedIds.has(employee.id),
  ).length;

  const openCreateShift = () => {
    setEditingShift(null);
    setShiftForm(EMPTY_SHIFT);
    setError("");
    setShiftModal(true);
  };

  const openEditShift = (shift) => {
    setEditingShift(shift);
    setShiftForm({
      name: shift.name || "",
      description: shift.description || "",
      start_time: shift.start_time?.slice(0, 5) || "07:00",
      end_time: shift.end_time?.slice(0, 5) || "16:00",
      grace_period_minutes: shift.grace_period_minutes ?? 10,
      expected_work_minutes: shift.expected_work_minutes ?? 480,
      rest_days: shift.rest_days || [],
    });
    setError("");
    setShiftModal(true);
  };

  const saveShift = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...shiftForm,
        grace_period_minutes: Number(shiftForm.grace_period_minutes),
        expected_work_minutes: Number(shiftForm.expected_work_minutes),
      };

      if (editingShift) {
        await api.patch(`/shifts/${editingShift.id}`, payload);
        setNotice("Shift updated successfully.");
      } else {
        await api.post("/shifts", payload);
        setNotice("New shift created successfully.");
      }

      setShiftModal(false);
      await loadData();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleShiftStatus = async (shift) => {
    const nextStatus = !shift.is_active;

    const confirmed = window.confirm(
      nextStatus ? `Activate ${shift.name}?` : `Deactivate ${shift.name}?`,
    );

    if (!confirmed) return;

    setStatusUpdating(shift.id);
    setError("");

    try {
      await api.patch(`/shifts/${shift.id}/status`, {
        is_active: nextStatus,
      });

      setNotice(
        nextStatus
          ? "Shift activated successfully."
          : "Shift deactivated successfully.",
      );

      await loadData();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setStatusUpdating("");
    }
  };

  const openAssignment = (isBulk = false) => {
    setBulkMode(isBulk);
    setSelectedEmployees([]);
    setAssignmentForm({
      ...EMPTY_ASSIGNMENT,
      shift_id: activeShifts[0]?.id || "",
    });
    setEmployeeSearch("");
    setError("");
    setAssignmentModal(true);
  };

  const submitAssignment = async (event) => {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const commonPayload = {
        shift_id: assignmentForm.shift_id,
        effective_from: assignmentForm.effective_from,
        effective_until: assignmentForm.effective_until || null,
        notes: assignmentForm.notes,
      };

      if (bulkMode) {
        if (!selectedEmployees.length) {
          setError("Select at least one employee.");
          setSaving(false);
          return;
        }

        const response = await api.post("/shifts/assignments/bulk", {
          ...commonPayload,
          employee_ids: selectedEmployees,
        });

        const result = response.data?.data;

        setNotice(
          `${result?.successful || 0} employee(s) assigned. ${result?.failed || 0} failed.`,
        );

        if (result?.failed > 0) {
          setError(
            result.results
              .filter((item) => !item.success)
              .map((item) => {
                const employee = employees.find(
                  (employee) => employee.id === item.employee_id,
                );

                return `${employee?.employee_number || item.employee_id}: ${item.message}`;
              })
              .join("\n"),
          );
        }
      } else {
        await api.post("/shifts/assignments", {
          ...commonPayload,
          employee_id: assignmentForm.employee_id,
        });

        setNotice("Employee shift assigned successfully.");
      }

      if (!bulkMode || !error) {
        setAssignmentModal(false);
      }

      await loadData();
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployee = (employeeId) => {
    setSelectedEmployees((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  };

  const visibleEmployees = employees.filter((employee) => {
    const text = employeeSearch.toLowerCase();

    const matchesSearch =
      employee.full_name?.toLowerCase().includes(text) ||
      employee.employee_number?.toLowerCase().includes(text);

    const matchesDepartment =
      departmentFilter === "all" || employee.department_id === departmentFilter;

    return matchesSearch && matchesDepartment;
  });

  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearch("");
    setError("");
  };

  return (
    <div className="min-h-full space-y-6 pb-10">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            <Settings2 size={14} />
            Workforce configuration
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Shift Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Configure working schedules and manage employee shift assignments.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={loadData} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </SecondaryButton>

          {activeTab === "shifts" ? (
            <PrimaryButton onClick={openCreateShift}>
              <Plus size={17} />
              Create shift
            </PrimaryButton>
          ) : (
            <>
              <SecondaryButton onClick={() => openAssignment(false)}>
                <Plus size={16} />
                Assign employee
              </SecondaryButton>
              <PrimaryButton onClick={() => openAssignment(true)}>
                <Users size={16} />
                Bulk assign
              </PrimaryButton>
            </>
          )}
        </div>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 size={17} />
          {notice}
          <button
            className="ml-auto text-emerald-600"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && !shiftModal && !assignmentModal && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-line">{error}</span>
          <button className="ml-auto" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total shifts
            </span>
            <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
              <Clock3 size={17} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">
            {shifts.length}
          </div>
          <p className="mt-1 text-xs text-slate-400">Configured schedules</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Active shifts
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
              <Activity size={17} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">
            {activeShifts.length}
          </div>
          <p className="mt-1 text-xs text-slate-400">Available schedules</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Assigned employees
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <Users size={17} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">
            {currentlyAssignedIds.size}
          </div>
          <p className="mt-1 text-xs text-slate-400">Currently assigned</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Unassigned
            </span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
              <AlertCircle size={17} />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-900">
            {unassignedCount}
          </div>
          <p className="mt-1 text-xs text-slate-400">Active employees</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => changeTab("shifts")}
          className={`relative flex items-center gap-2 pb-3 text-sm font-semibold transition ${
            activeTab === "shifts"
              ? "text-teal-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock3 size={17} />
          Shift configuration
          {activeTab === "shifts" && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-teal-700" />
          )}
        </button>

        <button
          onClick={() => changeTab("assignments")}
          className={`relative flex items-center gap-2 pb-3 text-sm font-semibold transition ${
            activeTab === "assignments"
              ? "text-teal-700"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users size={17} />
          Employee assignments
          {activeTab === "assignments" && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-teal-700" />
          )}
        </button>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              activeTab === "shifts"
                ? "Search shifts..."
                : "Search employee, ID or shift..."
            }
            className={`${inputClass} pl-10`}
          />
        </div>

        {activeTab === "shifts" ? (
          <select
            value={shiftStatus}
            onChange={(event) => setShiftStatus(event.target.value)}
            className={`${inputClass} sm:w-44`}
          >
            <option value="active">Active shifts</option>
            <option value="inactive">Inactive shifts</option>
            <option value="all">All shifts</option>
          </select>
        ) : (
          <>
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className={`${inputClass} sm:w-48`}
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <select
              value={assignmentShiftFilter}
              onChange={(event) => setAssignmentShiftFilter(event.target.value)}
              className={`${inputClass} sm:w-48`}
            >
              <option value="all">All shifts</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowHistory((value) => !value)}
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                showHistory
                  ? "border-teal-200 bg-teal-50 text-teal-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <History size={16} />
              {showHistory ? "Showing history" : "Current only"}
            </button>
          </>
        )}
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-teal-700" />
            <span className="text-sm">Loading shift management...</span>
          </div>
        </div>
      ) : activeTab === "shifts" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredShifts.map((shift) => {
            const ShiftIcon = getShiftIcon(shift);
            const duration = getDuration(shift.start_time, shift.end_time);

            return (
              <div
                key={shift.id}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-xl p-3 ${
                        shift.is_overnight
                          ? "bg-indigo-50 text-indigo-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <ShiftIcon size={21} />
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900">{shift.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {getShiftType(shift)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      shift.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {shift.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-5 rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Start time
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {formatTime(shift.start_time)}
                      </p>
                    </div>

                    <div className="flex flex-1 flex-col items-center px-2">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {formatMinutes(duration)}
                      </span>
                      <div className="relative mt-2 h-px w-full bg-slate-300">
                        <ArrowRight
                          size={13}
                          className="absolute -right-1.5 -top-1.5 text-slate-400"
                        />
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        End time
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {formatTime(shift.end_time)}
                      </p>
                    </div>
                  </div>

                  {shift.is_overnight && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-700">
                      <Moon size={13} />
                      Ends the following day
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400">Expected work</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {formatMinutes(shift.expected_work_minutes)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400">Grace period</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">
                      {shift.grace_period_minutes} min
                    </p>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    Rest days
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((day) => {
                      const selected = (shift.rest_days || []).includes(
                        day.value,
                      );

                      return (
                        <span
                          key={day.value}
                          className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                            selected
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-400"
                          }`}
                        >
                          {day.short}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setDetailShift(shift)}
                    className="text-xs font-semibold text-teal-700 transition hover:text-teal-900"
                  >
                    View details
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditShift(shift)}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-teal-700"
                      title="Edit shift"
                    >
                      <Edit3 size={16} />
                    </button>

                    <button
                      onClick={() => toggleShiftStatus(shift)}
                      disabled={statusUpdating === shift.id}
                      className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
                      title={shift.is_active ? "Deactivate" : "Activate"}
                    >
                      {statusUpdating === shift.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <MoreHorizontal size={17} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {!filteredShifts.length && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Clock3 size={22} />
              </div>
              <h3 className="mt-4 font-semibold text-slate-800">
                No shifts found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Create a shift schedule or change your search filters.
              </p>
              <button
                onClick={openCreateShift}
                className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-900"
              >
                Create your first shift
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-slate-900">
                Employee shift assignments
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                {showHistory
                  ? "Viewing current and previous assignments."
                  : "Viewing assignments effective today."}
              </p>
            </div>

            <span className="w-fit rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {filteredAssignments.length} records
            </span>
          </div>

          {filteredAssignments.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Department</th>
                      <th className="px-5 py-3">Assigned shift</th>
                      <th className="px-5 py-3">Effective from</th>
                      <th className="px-5 py-3">Effective until</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssignments.map((assignment) => {
                      const current =
                        !assignment.effective_until ||
                        assignment.effective_until >=
                          new Date().toLocaleDateString("en-CA", {
                            timeZone: "Asia/Manila",
                          });

                      return (
                        <tr
                          key={assignment.id}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">
                                {getInitials(assignment.employee?.full_name)}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-800">
                                  {assignment.employee?.full_name ||
                                    "Unknown employee"}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {assignment.employee?.employee_number}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {assignment.department?.name || "Unassigned"}
                          </td>

                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-800">
                              {assignment.shift?.name || "Unknown shift"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {formatTime(assignment.shift?.start_time)}
                              {" – "}
                              {formatTime(assignment.shift?.end_time)}
                            </p>
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {formatDate(assignment.effective_from)}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-600">
                            {formatDate(assignment.effective_until)}
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                current
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {current ? "Current" : "Historical"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-slate-100 md:hidden">
                {filteredAssignments.map((assignment) => (
                  <div key={assignment.id} className="space-y-3 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">
                        {getInitials(assignment.employee?.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {assignment.employee?.full_name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {assignment.employee?.employee_number}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                        {assignment.effective_until ? "Historical" : "Current"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-slate-400">Shift</p>
                        <p className="mt-1 font-semibold text-slate-700">
                          {assignment.shift?.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Department</p>
                        <p className="mt-1 font-semibold text-slate-700">
                          {assignment.department?.name || "Unassigned"}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Effective from</p>
                        <p className="mt-1 font-semibold text-slate-700">
                          {formatDate(assignment.effective_from)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400">Effective until</p>
                        <p className="mt-1 font-semibold text-slate-700">
                          {formatDate(assignment.effective_until)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-5 py-16 text-center">
              <Users size={30} className="mx-auto text-slate-300" />
              <h3 className="mt-3 font-semibold text-slate-800">
                No assignments found
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Assign employees to a shift to see their schedules here.
              </p>
              <button
                onClick={() => openAssignment(false)}
                className="mt-4 text-sm font-semibold text-teal-700"
              >
                Assign an employee
              </button>
            </div>
          )}
        </div>
      )}

      {/* Shift modal */}
      {shiftModal && (
        <Modal
          title={editingShift ? "Edit shift" : "Create new shift"}
          subtitle="Configure the working hours and attendance rules for this schedule."
          onClose={() => setShiftModal(false)}
        >
          <form onSubmit={saveShift} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Field label="Shift name">
              <input
                className={inputClass}
                value={shiftForm.name}
                onChange={(event) =>
                  setShiftForm({
                    ...shiftForm,
                    name: event.target.value,
                  })
                }
                placeholder="e.g. Morning Shift"
                maxLength={100}
                required
              />
            </Field>

            <Field
              label="Description"
              hint="Optional description for this schedule."
            >
              <textarea
                className={inputClass}
                rows={2}
                value={shiftForm.description}
                onChange={(event) =>
                  setShiftForm({
                    ...shiftForm,
                    description: event.target.value,
                  })
                }
                placeholder="Describe this shift..."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time">
                <input
                  type="time"
                  className={inputClass}
                  value={shiftForm.start_time}
                  onChange={(event) =>
                    setShiftForm({
                      ...shiftForm,
                      start_time: event.target.value,
                    })
                  }
                  required
                />
              </Field>

              <Field label="End time">
                <input
                  type="time"
                  className={inputClass}
                  value={shiftForm.end_time}
                  onChange={(event) =>
                    setShiftForm({
                      ...shiftForm,
                      end_time: event.target.value,
                    })
                  }
                  required
                />
              </Field>
            </div>

            {(() => {
              const duration = getDuration(
                shiftForm.start_time,
                shiftForm.end_time,
              );
              const overnight = shiftForm.end_time <= shiftForm.start_time;

              return (
                <div className="flex items-center justify-between rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-teal-800">
                    {overnight ? <Moon size={17} /> : <Sun size={17} />}
                    <div>
                      <p className="text-sm font-semibold">
                        {overnight ? "Overnight schedule" : "Same-day schedule"}
                      </p>
                      <p className="text-xs text-teal-700">
                        {overnight
                          ? "Ends the following day"
                          : "Starts and ends on the same day"}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-teal-900">
                    {formatMinutes(duration)}
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Grace period"
                hint="Minutes allowed after shift start."
              >
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    className={inputClass}
                    value={shiftForm.grace_period_minutes}
                    onChange={(event) =>
                      setShiftForm({
                        ...shiftForm,
                        grace_period_minutes: event.target.value,
                      })
                    }
                    required
                  />
                </div>
              </Field>

              <Field
                label="Expected work"
                hint="Net working minutes, excluding unpaid breaks."
              >
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={shiftForm.expected_work_minutes}
                  onChange={(event) =>
                    setShiftForm({
                      ...shiftForm,
                      expected_work_minutes: event.target.value,
                    })
                  }
                  required
                />
              </Field>
            </div>

            <Field
              label="Rest days"
              hint="Select the employee's regular weekly rest days for this shift."
            >
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {DAYS.map((day) => {
                  const selected = shiftForm.rest_days.includes(day.value);

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? shiftForm.rest_days.filter(
                              (value) => value !== day.value,
                            )
                          : [...shiftForm.rest_days, day.value];

                        setShiftForm({
                          ...shiftForm,
                          rest_days: next.sort((a, b) => a - b),
                        });
                      }}
                      className={`rounded-xl border px-2 py-3 text-center transition ${
                        selected
                          ? "border-teal-600 bg-teal-50 text-teal-800"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <span className="block text-xs font-semibold">
                        {day.short}
                      </span>
                      {selected && <Check size={13} className="mx-auto mt-1" />}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <SecondaryButton onClick={() => setShiftModal(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" loading={saving}>
                {editingShift ? "Save changes" : "Create shift"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {/* Assignment modal */}
      {assignmentModal && (
        <Modal
          title={
            bulkMode ? "Bulk employee assignment" : "Assign employee shift"
          }
          subtitle={
            bulkMode
              ? "Assign one shift to multiple employees at once."
              : "Select an employee and configure their effective shift schedule."
          }
          onClose={() => setAssignmentModal(false)}
          width="max-w-2xl"
        >
          <form onSubmit={submitAssignment} className="space-y-5">
            {error && (
              <div className="whitespace-pre-line rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Field label="Select shift">
              <select
                className={inputClass}
                value={assignmentForm.shift_id}
                onChange={(event) =>
                  setAssignmentForm({
                    ...assignmentForm,
                    shift_id: event.target.value,
                  })
                }
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
                <p className="text-xs text-red-600">
                  No active shifts available. Create an active shift first.
                </p>
              )}
            </Field>

            {bulkMode ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">
                    Select employees
                  </label>
                  <span className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                    {selectedEmployees.length} selected
                  </span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    className={inputClass}
                    value={employeeSearch}
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Search employee name or ID..."
                  />
                  <select
                    className={`${inputClass} sm:w-48`}
                    value={departmentFilter}
                    onChange={(event) =>
                      setDepartmentFilter(event.target.value)
                    }
                  >
                    <option value="all">All departments</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-500">
                      {visibleEmployees.length} employees
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const visibleIds = visibleEmployees.map(
                          (item) => item.id,
                        );
                        const allSelected = visibleIds.every((id) =>
                          selectedEmployees.includes(id),
                        );

                        setSelectedEmployees((current) =>
                          allSelected
                            ? current.filter((id) => !visibleIds.includes(id))
                            : [...new Set([...current, ...visibleIds])],
                        );
                      }}
                      className="text-xs font-semibold text-teal-700"
                    >
                      Select all visible
                    </button>
                  </div>

                  {visibleEmployees.map((employee) => {
                    const selected = selectedEmployees.includes(employee.id);

                    return (
                      <label
                        key={employee.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-0 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleEmployee(employee.id)}
                          className="h-4 w-4 rounded border-slate-300 accent-teal-700"
                        />
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                          {getInitials(employee.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {employee.full_name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {employee.employee_number}
                          </p>
                        </div>
                      </label>
                    );
                  })}

                  {!visibleEmployees.length && (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">
                      No employees found.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <Field label="Employee">
                <select
                  className={inputClass}
                  value={assignmentForm.employee_id}
                  onChange={(event) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      employee_id: event.target.value,
                    })
                  }
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Effective from">
                <input
                  type="date"
                  className={inputClass}
                  value={assignmentForm.effective_from}
                  onChange={(event) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      effective_from: event.target.value,
                    })
                  }
                  required
                />
              </Field>

              <Field
                label="Effective until"
                hint="Leave empty if this assignment has no planned end date."
              >
                <input
                  type="date"
                  className={inputClass}
                  value={assignmentForm.effective_until}
                  min={assignmentForm.effective_from}
                  onChange={(event) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      effective_until: event.target.value,
                    })
                  }
                />
              </Field>
            </div>

            <Field
              label="Assignment notes"
              hint="Optional reason or instruction."
            >
              <textarea
                className={inputClass}
                rows={2}
                value={assignmentForm.notes}
                onChange={(event) =>
                  setAssignmentForm({
                    ...assignmentForm,
                    notes: event.target.value,
                  })
                }
                placeholder="e.g. New shift schedule effective next week"
              />
            </Field>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              <div className="mb-1 flex items-center gap-2 font-bold">
                <AlertCircle size={15} />
                Assignment history protection
              </div>
              If an employee has an existing assignment overlapping the new
              start date, the system will close the previous assignment one day
              before the new start date. Existing future assignments must be
              reviewed separately.
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <SecondaryButton onClick={() => setAssignmentModal(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton
                type="submit"
                loading={saving}
                disabled={!activeShifts.length}
              >
                {bulkMode
                  ? `Assign ${selectedEmployees.length || ""} employees`
                  : "Assign shift"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {/* Shift details */}
      {detailShift && (
        <Modal
          title={detailShift.name}
          subtitle="Shift schedule details"
          onClose={() => setDetailShift(null)}
        >
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">
                  Working hours
                </span>
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                  {getShiftType(detailShift)}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">Start</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatTime(detailShift.start_time)}
                  </p>
                </div>
                <ArrowRight size={20} className="text-slate-300" />
                <div className="text-right">
                  <p className="text-xs text-slate-400">End</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatTime(detailShift.end_time)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-400">Expected work</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatMinutes(detailShift.expected_work_minutes)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-400">Grace period</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {detailShift.grace_period_minutes} min
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Rest days
              </p>
              <div className="flex flex-wrap gap-2">
                {(detailShift.rest_days || []).map((day) => (
                  <span
                    key={day}
                    className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
                  >
                    {DAYS.find((item) => item.value === day)?.label}
                  </span>
                ))}
                {!detailShift.rest_days?.length && (
                  <span className="text-sm text-slate-400">
                    No rest days configured.
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">
                Description
              </p>
              <p className="text-sm text-slate-500">
                {detailShift.description || "No description provided."}
              </p>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-4">
              <PrimaryButton
                onClick={() => {
                  const shift = detailShift;
                  setDetailShift(null);
                  openEditShift(shift);
                }}
              >
                <Edit3 size={15} />
                Edit shift
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
