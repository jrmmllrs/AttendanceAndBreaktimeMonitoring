import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Filter,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";

const TIME_ZONE = "Asia/Manila";

/**
 * Brand palette (same as Dashboard): white + blue + red, grays for neutrals.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red  #C8102E · Light red #FDECEF · Border #E3EAF5
 */

/* ---------- Helpers ---------- */

const getManilaDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const shiftDate = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const formatWorkDate = (date) => {
  if (!date) return "";

  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const getAttendanceStatus = (employee) => employee?.attendance?.status || null;

const getFullName = (employee) =>
  [employee?.first_name, employee?.middle_name, employee?.last_name]
    .filter(Boolean)
    .join(" ");

const getInitials = (employee) =>
  `${(employee?.first_name || "")[0] || ""}${
    (employee?.last_name || "")[0] || ""
  }`.toUpperCase() || "?";

const formatShift = (employee) => {
  const shift = employee?.shift;

  if (!shift) return "No shift assigned";

  const start = shift.start_time?.slice(0, 5);
  const end = shift.end_time?.slice(0, 5);

  if (start && end) {
    return `${shift.name || "Assigned shift"} · ${start}–${end}`;
  }

  return shift.name || "Assigned shift";
};

const isMarked = (status) => status === "present" || status === "absent";

/* ---------- Building blocks ---------- */

function StatusBadge({ status }) {
  if (status === "present") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF1FD] px-2.5 py-1 text-xs font-semibold text-[#1D63D6]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#1D63D6]" />
        Present
      </span>
    );
  }

  if (status === "absent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDECEF] px-2.5 py-1 text-xs font-semibold text-[#C8102E]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#C8102E]" />
        Absent
      </span>
    );
  }

  if (status) {
    return (
      <span className="inline-flex items-center rounded-full border border-[#E3EAF5] bg-[#F7FAFE] px-2.5 py-1 text-xs font-semibold capitalize text-[#0B3A8C]">
        {String(status).replaceAll("_", " ")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      Not recorded
    </span>
  );
}

function SegmentedStatus({ status, onChange, disabled, label }) {
  const base =
    "inline-flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div
      role="group"
      aria-label={`Attendance for ${label}`}
      className="inline-flex w-full overflow-hidden rounded-xl border border-[#E3EAF5] bg-white sm:w-auto"
    >
      <button
        type="button"
        aria-pressed={status === "present"}
        disabled={disabled}
        onClick={() => onChange("present")}
        className={`${base} ${
          status === "present"
            ? "bg-[#1D63D6] text-white"
            : "text-slate-500 hover:bg-[#EAF1FD] hover:text-[#1D63D6]"
        }`}
      >
        <Check size={14} />
        Present
      </button>

      <button
        type="button"
        aria-pressed={status === "absent"}
        disabled={disabled}
        onClick={() => onChange("absent")}
        className={`${base} border-l border-[#E3EAF5] ${
          status === "absent"
            ? "bg-[#C8102E] text-white"
            : "text-slate-500 hover:bg-[#FDECEF] hover:text-[#C8102E]"
        }`}
      >
        <X size={14} />
        Absent
      </button>
    </div>
  );
}

function Avatar({ employee, active }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        active ? "bg-[#1D63D6] text-white" : "bg-[#EAF1FD] text-[#1D63D6]"
      }`}
    >
      {getInitials(employee)}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone, loading, children }) {
  const tones = {
    blue: { chip: "bg-[#EAF1FD] text-[#1D63D6]", value: "text-[#0B3A8C]" },
    red: { chip: "bg-[#FDECEF] text-[#C8102E]", value: "text-[#C8102E]" },
    gray: { chip: "bg-slate-100 text-slate-500", value: "text-slate-600" },
  };

  const t = tones[tone] || tones.blue;

  return (
    <div className="rounded-2xl border border-[#E3EAF5] bg-white p-4 shadow-[0_1px_2px_rgba(11,58,140,0.04)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <div className={`shrink-0 rounded-lg p-2 ${t.chip}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>

      <p className={`mt-3 text-3xl font-semibold tracking-tight ${t.value}`}>
        {loading ? "—" : value}
      </p>

      {children}
    </div>
  );
}

function Alert({ tone, icon: Icon, children, onDismiss }) {
  const styles =
    tone === "red"
      ? "border-[#F5C2CA] bg-[#FDECEF] text-[#8E0B20]"
      : "border-[#CFE0FA] bg-[#EAF1FD] text-[#0B3A8C]";

  const iconColor = tone === "red" ? "text-[#C8102E]" : "text-[#1D63D6]";

  return (
    <div
      role={tone === "red" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${styles}`}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <p className="min-w-0 flex-1">{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-[#EEF3FB]">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-4 p-4">
          <div className="h-4 w-4 rounded bg-[#EEF3FB]" />
          <div className="h-9 w-9 rounded-full bg-[#EEF3FB]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 rounded bg-[#EEF3FB]" />
            <div className="h-3 w-24 rounded bg-[#EEF3FB]" />
          </div>
          <div className="hidden h-8 w-48 rounded-xl bg-[#EEF3FB] sm:block" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasEmployees }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center px-5 text-center">
      <div className="mb-3 rounded-2xl bg-[#EAF1FD] p-4 text-[#1D63D6]">
        <Users size={25} strokeWidth={1.7} />
      </div>
      <p className="text-sm font-medium text-slate-700">
        {hasEmployees
          ? "No employees match your filters"
          : "No employees found"}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
        {hasEmployees
          ? "Try a different search, department or status."
          : "Employees available for manual attendance on this date will appear here."}
      </p>
    </div>
  );
}

/* ---------- Page ---------- */

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "unrecorded", label: "Not recorded" },
  { key: "other", label: "Other" },
];

export default function AttendanceManagementPage() {
  const [workDate, setWorkDate] = useState(getManilaDate);
  const [employees, setEmployees] = useState([]);
  const [statusById, setStatusById] = useState({});
  const [originalStatuses, setOriginalStatuses] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const today = getManilaDate();
  const selectAllRef = useRef(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setSelectedIds([]);

    try {
      const response = await api.get(
        "/attendance/management/manual-employees",
        { params: { work_date: workDate } },
      );

      const employeeList = response.data?.employees || [];
      const nextStatuses = {};

      employeeList.forEach((employee) => {
        nextStatuses[employee.id] = getAttendanceStatus(employee);
      });

      setEmployees(employeeList);
      setStatusById(nextStatuses);
      setOriginalStatuses(nextStatuses);
    } catch (err) {
      setEmployees([]);
      setStatusById({});
      setOriginalStatuses({});
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  }, [workDate]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  /* ----- Derived data ----- */

  const departments = useMemo(() => {
    const map = new Map();

    employees.forEach((employee) => {
      if (employee.department_id && employee.department_name) {
        map.set(employee.department_id, employee.department_name);
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const getBucket = useCallback(
    (employee) => {
      const status = statusById[employee.id];

      if (status === "present") return "present";
      if (status === "absent") return "absent";
      if (!status) return "unrecorded";
      return "other";
    },
    [statusById],
  );

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, unrecorded: 0, other: 0 };

    employees.forEach((employee) => {
      counts[getBucket(employee)] += 1;
    });

    return { total: employees.length, ...counts };
  }, [employees, getBucket]);

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const fullName = getFullName(employee).toLowerCase();
      const employeeNumber = String(
        employee.employee_number || "",
      ).toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        employeeNumber.includes(normalizedSearch);

      const matchesDepartment =
        departmentFilter === "all" ||
        employee.department_id === departmentFilter;

      const matchesStatus =
        statusFilter === "all" || getBucket(employee) === statusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [employees, search, departmentFilter, statusFilter, getBucket]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  const visibleIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees],
  );

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedSet.has(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  const visibleUnrecorded = useMemo(
    () => filteredEmployees.filter((employee) => !statusById[employee.id]),
    [filteredEmployees, statusById],
  );

  const changedEntries = useMemo(
    () =>
      employees
        .filter((employee) => {
          const current = statusById[employee.id];
          return isMarked(current) && current !== originalStatuses[employee.id];
        })
        .map((employee) => ({
          employee_id: employee.id,
          status: statusById[employee.id],
        })),
    [employees, statusById, originalStatuses],
  );

  const hasUnsaved = changedEntries.length > 0;
  const recorded = summary.total - summary.unrecorded;
  const recordedPct =
    summary.total > 0 ? Math.round((recorded / summary.total) * 100) : 0;

  const tabCounts = {
    all: summary.total,
    present: summary.present,
    absent: summary.absent,
    unrecorded: summary.unrecorded,
    other: summary.other,
  };

  /* Warn before closing the tab with unsaved changes */
  useEffect(() => {
    if (!hasUnsaved) return undefined;

    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  /* ----- Actions ----- */

  const confirmDiscard = () =>
    !hasUnsaved ||
    window.confirm(
      "You have unsaved attendance changes. Continue and discard them?",
    );

  const changeDate = (next) => {
    if (!next || next === workDate || next > today) return;
    if (!confirmDiscard()) return;
    setWorkDate(next);
  };

  const handleRefresh = () => {
    if (!confirmDiscard()) return;
    loadEmployees();
  };

  const toggleEmployee = (employeeId) => {
    setSelectedIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id)),
      );
      return;
    }

    setSelectedIds((current) =>
      Array.from(new Set([...current, ...visibleIds])),
    );
  };

  const markSelected = (status) => {
    if (selectedIds.length === 0) return;

    setStatusById((current) => {
      const updated = { ...current };
      selectedIds.forEach((id) => {
        updated[id] = status;
      });
      return updated;
    });

    setSuccess("");
  };

  const markEmployee = (employeeId, status) => {
    setStatusById((current) => ({ ...current, [employeeId]: status }));
    setSuccess("");
  };

  const markUnrecordedPresent = () => {
    if (visibleUnrecorded.length === 0) return;

    setStatusById((current) => {
      const updated = { ...current };
      visibleUnrecorded.forEach((employee) => {
        updated[employee.id] = "present";
      });
      return updated;
    });

    setSuccess("");
  };

  const discardChanges = () => {
    setStatusById({ ...originalStatuses });
    setSelectedIds([]);
    setError("");
  };

  const saveChanges = async () => {
    if (changedEntries.length === 0) {
      setError("There are no attendance changes to save.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/attendance/management/bulk", {
        work_date: workDate,
        entries: changedEntries,
      });

      const result = response.data?.data || {};

      setOriginalStatuses({ ...statusById });
      setSelectedIds([]);

      setSuccess(
        response.data?.message ||
          `Attendance saved. ${result.total_saved || changedEntries.length} employee(s) updated.`,
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  return (
    <div className="space-y-6 pb-8">
      {/* ===== Header ===== */}
      <header className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
        <div className="flex h-1.5">
          <div className="w-24 bg-[#C8102E]" />
          <div className="flex-1 bg-[#1D63D6]" />
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#1D63D6]">
              <ClipboardCheck size={16} />
              RCS - RR Management
            </div>

            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#0B3A8C]">
              Attendance Management
            </h1>

            <p className="mt-0.5 text-sm text-slate-500">
              Record daily attendance as Present or Absent.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date navigator */}
            <div className="flex items-center gap-1 rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] p-1">
              <button
                type="button"
                onClick={() => changeDate(shiftDate(workDate, -1))}
                disabled={busy}
                aria-label="Previous day"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-[#1D63D6] disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>

              <label className="flex items-center gap-2 px-1.5">
                <CalendarDays size={16} className="text-[#1D63D6]" />
                <div className="leading-tight">
                  <input
                    type="date"
                    value={workDate}
                    max={today}
                    onChange={(event) => changeDate(event.target.value)}
                    aria-label="Attendance date"
                    className="w-[130px] bg-transparent text-sm font-semibold text-[#0B3A8C] outline-none"
                  />
                  <p className="text-[11px] text-slate-500">
                    {formatWorkDate(workDate)}
                  </p>
                </div>
              </label>

              <button
                type="button"
                onClick={() => changeDate(shiftDate(workDate, 1))}
                disabled={busy || workDate >= today}
                aria-label="Next day"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-[#1D63D6] disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {workDate !== today && (
              <button
                type="button"
                onClick={() => changeDate(today)}
                disabled={busy}
                className="rounded-xl border border-[#E3EAF5] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1D63D6] transition hover:border-[#1D63D6] disabled:opacity-50"
              >
                Today
              </button>
            )}

            <button
              type="button"
              onClick={handleRefresh}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* ===== Alerts ===== */}
      {error && (
        <Alert tone="red" icon={AlertTriangle} onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert tone="blue" icon={CheckCircle2} onDismiss={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {/* ===== Summary ===== */}
      <section
        aria-label="Attendance summary"
        className="grid grid-cols-2 gap-4 xl:grid-cols-4"
      >
        <SummaryCard
          label="Total employees"
          value={summary.total}
          icon={Users}
          tone="blue"
          loading={loading}
        >
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF3FB]">
              <div
                className="h-full rounded-full bg-[#1D63D6] transition-all duration-500"
                style={{ width: `${loading ? 0 : recordedPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {loading ? "" : `${recorded} of ${summary.total} recorded`}
            </p>
          </div>
        </SummaryCard>

        <SummaryCard
          label="Present"
          value={summary.present}
          icon={CheckCheck}
          tone="blue"
          loading={loading}
        />

        <SummaryCard
          label="Absent"
          value={summary.absent}
          icon={X}
          tone="red"
          loading={loading}
        />

        <SummaryCard
          label="Not recorded"
          value={summary.unrecorded}
          icon={ClipboardCheck}
          tone="gray"
          loading={loading}
        />
      </section>

      {/* ===== Employee list ===== */}
      <section className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
        {/* Toolbar */}
        <div className="space-y-4 border-b border-[#EEF3FB] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0B3A8C]">
                Employee attendance
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Mark individually, or select several and apply in bulk.
              </p>
            </div>

            <span className="shrink-0 rounded-full bg-[#EAF1FD] px-2.5 py-1 text-xs font-semibold text-[#1D63D6]">
              {filteredEmployees.length} shown
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee name or number..."
                aria-label="Search employees"
                className="w-full rounded-xl border border-[#E3EAF5] py-2.5 pl-10 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="relative">
              <Filter
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                aria-label="Filter by department"
                className="w-full appearance-none rounded-xl border border-[#E3EAF5] bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
              >
                <option value="all">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status tabs */}
          <div
            role="tablist"
            aria-label="Filter by status"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
          >
            {STATUS_TABS.filter(
              (tab) => tab.key !== "other" || summary.other > 0,
            ).map((tab) => {
              const active = statusFilter === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-[#1D63D6] bg-[#1D63D6] text-white"
                      : "border-[#E3EAF5] bg-white text-slate-600 hover:border-[#1D63D6] hover:text-[#1D63D6]"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-[#EEF3FB] text-slate-500"
                    }`}
                  >
                    {loading ? "—" : tabCounts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selection / bulk bar */}
        <div
          className={`flex flex-col gap-3 border-b px-4 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
            selectedCount > 0
              ? "border-[#CFE0FA] bg-[#EAF1FD]"
              : "border-[#EEF3FB] bg-[#F7FAFE]"
          }`}
        >
          <label className="flex cursor-pointer items-center gap-3">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              disabled={loading || filteredEmployees.length === 0}
              className="h-4 w-4 rounded border-slate-300 text-[#1D63D6] focus:ring-[#1D63D6]"
            />
            <div>
              <p className="text-sm font-semibold text-[#0B3A8C]">
                {selectedCount > 0
                  ? `${selectedCount} selected`
                  : "Select all visible"}
              </p>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setSelectedIds([]);
                  }}
                  className="text-xs font-medium text-[#1D63D6] hover:underline"
                >
                  Clear selection
                </button>
              )}
            </div>
          </label>

          {selectedCount > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => markSelected("present")}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={15} />
                Mark present
              </button>

              <button
                type="button"
                onClick={() => markSelected("absent")}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C8102E] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#A80D26] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={15} />
                Mark absent
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={markUnrecordedPresent}
              disabled={busy || visibleUnrecorded.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E3EAF5] bg-white px-3.5 py-2 text-sm font-semibold text-[#1D63D6] transition hover:border-[#1D63D6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck size={15} />
              Mark {visibleUnrecorded.length || ""} not recorded as present
            </button>
          )}
        </div>

        {/* Body */}
        {loading ? (
          <SkeletonRows />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState hasEmployees={employees.length > 0} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left">
                <thead className="bg-white text-xs font-medium text-slate-500">
                  <tr className="border-b border-[#EEF3FB]">
                    <th className="w-12 px-5 py-3 font-medium">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium">Department</th>
                    <th className="px-4 py-3 font-medium">Assigned shift</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">
                      Mark as
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#EEF3FB]">
                  {filteredEmployees.map((employee) => {
                    const selected = selectedSet.has(employee.id);
                    const status = statusById[employee.id];
                    const changed =
                      isMarked(status) &&
                      status !== originalStatuses[employee.id];
                    const fullName = getFullName(employee);

                    return (
                      <tr
                        key={employee.id}
                        className={`transition ${
                          selected ? "bg-[#F7FAFE]" : "hover:bg-[#F7FAFE]"
                        }`}
                      >
                        <td
                          className={`px-5 py-3.5 ${
                            changed ? "shadow-[inset_3px_0_0_0_#1D63D6]" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleEmployee(employee.id)}
                            aria-label={`Select ${fullName}`}
                            className="h-4 w-4 rounded border-slate-300 text-[#1D63D6] focus:ring-[#1D63D6]"
                          />
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar employee={employee} active={selected} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                                {fullName || "Unnamed employee"}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {employee.employee_number ||
                                  "No employee number"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 text-sm text-slate-600">
                          {employee.department_name || "Unassigned"}
                        </td>

                        <td className="px-4 py-3.5 text-sm text-slate-600">
                          {formatShift(employee)}
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={status} />
                            {changed && (
                              <span className="text-[11px] font-medium text-[#1D63D6]">
                                Unsaved
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex justify-end">
                            <SegmentedStatus
                              status={status}
                              disabled={saving}
                              label={fullName}
                              onChange={(next) =>
                                markEmployee(employee.id, next)
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-[#EEF3FB] md:hidden">
              {filteredEmployees.map((employee) => {
                const selected = selectedSet.has(employee.id);
                const status = statusById[employee.id];
                const changed =
                  isMarked(status) && status !== originalStatuses[employee.id];
                const fullName = getFullName(employee);

                return (
                  <li
                    key={employee.id}
                    className={`space-y-3 p-4 ${
                      selected ? "bg-[#F7FAFE]" : ""
                    } ${changed ? "shadow-[inset_3px_0_0_0_#1D63D6]" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleEmployee(employee.id)}
                        aria-label={`Select ${fullName}`}
                        className="mt-2.5 h-4 w-4 rounded border-slate-300 text-[#1D63D6] focus:ring-[#1D63D6]"
                      />

                      <Avatar employee={employee} active={selected} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                            {fullName || "Unnamed employee"}
                          </p>
                          <StatusBadge status={status} />
                        </div>

                        <p className="mt-0.5 text-xs text-slate-500">
                          {employee.employee_number || "No employee number"}
                          {" · "}
                          {employee.department_name || "Unassigned"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatShift(employee)}
                        </p>

                        {changed && (
                          <p className="mt-1 text-[11px] font-medium text-[#1D63D6]">
                            Unsaved change
                          </p>
                        )}
                      </div>
                    </div>

                    <SegmentedStatus
                      status={status}
                      disabled={saving}
                      label={fullName}
                      onChange={(next) => markEmployee(employee.id, next)}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ===== Sticky save bar ===== */}
      <div className="sticky bottom-3 z-20">
        <div
          className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-[0_8px_24px_rgba(11,58,140,0.10)] transition sm:flex-row sm:items-center sm:justify-between ${
            hasUnsaved
              ? "border-[#CFE0FA] bg-white"
              : "border-[#E3EAF5] bg-white/90"
          }`}
        >
          <p className="flex items-center gap-2 text-sm text-slate-600">
            {hasUnsaved ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#C8102E]" />
                <span>
                  <span className="font-semibold text-[#0B3A8C]">
                    {changedEntries.length}
                  </span>{" "}
                  unsaved change{changedEntries.length === 1 ? "" : "s"}
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} className="text-[#1D63D6]" />
                All attendance changes are saved.
              </>
            )}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={discardChanges}
              disabled={!hasUnsaved || busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#E3EAF5] bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-[#C8102E] hover:text-[#C8102E] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              <RotateCcw size={15} />
              Discard
            </button>

            <button
              type="button"
              onClick={saveChanges}
              disabled={!hasUnsaved || busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              <Save size={16} />
              {saving
                ? "Saving..."
                : `Save changes${hasUnsaved ? ` (${changedEntries.length})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
