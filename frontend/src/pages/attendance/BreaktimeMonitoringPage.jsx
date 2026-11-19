import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Coffee,
  LoaderCircle,
  Play,
  RefreshCw,
  Search,
  Square,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";

const REFRESH_INTERVAL = 15000;

function getManilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function getElapsedSeconds(activeBreak, now) {
  if (activeBreak?.actual_start_at) {
    const start = new Date(activeBreak.actual_start_at).getTime();

    if (!Number.isNaN(start)) {
      return Math.max(0, Math.floor((now - start) / 1000));
    }
  }

  return Math.max(0, Number(activeBreak?.elapsed_minutes || 0) * 60);
}

function getEmployeeName(employee) {
  return [employee?.first_name, employee?.middle_name, employee?.last_name]
    .filter(Boolean)
    .join(" ");
}

function getErrorMessage(error, fallback) {
  if (typeof getApiError === "function") {
    return getApiError(error, fallback);
  }

  return error?.response?.data?.message || error?.message || fallback;
}

function getScheduleLabel(schedule) {
  const breakType = schedule?.break_type?.name;

  if (breakType && breakType !== schedule?.name) {
    return `${schedule.name} · ${breakType}`;
  }

  return schedule?.name || breakType || "Break";
}

function getScheduleCount(records, scheduleId) {
  return (records || []).filter(
    (record) =>
      record.break_schedule_id === scheduleId && record.status !== "cancelled",
  ).length;
}

function getAvailableSchedules(employee) {
  return (employee?.break_schedules || []).filter(
    (schedule) =>
      schedule.is_active !== false && schedule.break_type?.is_active !== false,
  );
}

function getBreakInfo(activeBreak, now) {
  if (!activeBreak) return null;

  const elapsedSeconds = getElapsedSeconds(activeBreak, now);
  const allowedSeconds = Number(activeBreak.allowed_duration_minutes || 0) * 60;

  const remainingSeconds = allowedSeconds - elapsedSeconds;
  const isExceeded = remainingSeconds < 0;
  const isNearLimit = !isExceeded && remainingSeconds <= 5 * 60;

  return {
    elapsedSeconds,
    allowedSeconds,
    remainingSeconds,
    isExceeded,
    isNearLimit,
    excessSeconds: Math.max(0, -remainingSeconds),
    progress:
      allowedSeconds > 0
        ? Math.min(100, (elapsedSeconds / allowedSeconds) * 100)
        : 0,
  };
}

function StatCard({ label, value, description, icon: Icon, tone = "default" }) {
  const tones = {
    default: "bg-slate-100 text-slate-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    teal: "bg-teal-50 text-teal-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        <div className={`rounded-xl p-3 ${tones[tone]}`}>
          <Icon size={21} />
        </div>
      </div>
    </div>
  );
}

function BreakTimer({ activeBreak, now }) {
  const info = getBreakInfo(activeBreak, now);

  if (!info) return null;

  let colorClass = "text-emerald-600";
  let barClass = "bg-emerald-500";
  let statusText = `${formatDuration(info.remainingSeconds)} remaining`;

  if (info.isExceeded) {
    colorClass = "text-red-600";
    barClass = "bg-red-500";
    statusText = `Overbreak by ${formatDuration(info.excessSeconds)}`;
  } else if (info.isNearLimit) {
    colorClass = "text-amber-600";
    barClass = "bg-amber-500";
    statusText = "Approaching break limit";
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-xl font-bold tabular-nums ${colorClass}`}>
            {formatDuration(info.elapsedSeconds)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Elapsed time</p>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-700">
            {activeBreak?.allowed_duration_minutes || 0} min
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Allowed</p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${info.progress}%` }}
        />
      </div>

      <p className={`mt-2 text-xs font-semibold ${colorClass}`}>{statusText}</p>
    </div>
  );
}

function StatusBadge({ activeBreak, now }) {
  if (!activeBreak) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        Not on Break
      </span>
    );
  }

  const info = getBreakInfo(activeBreak, now);

  if (info.isExceeded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        <AlertTriangle size={12} />
        Overbreak
      </span>
    );
  }

  if (info.isNearLimit) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
        Near Limit
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      On Break
    </span>
  );
}

export default function BreaktimeMonitoringPage() {
  const [employees, setEmployees] = useState([]);
  const [activeBreaks, setActiveBreaks] = useState([]);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedSchedules, setSelectedSchedules] = useState({});
  const [bulkScheduleId, setBulkScheduleId] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [actionEmployeeId, setActionEmployeeId] = useState(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bulkResults, setBulkResults] = useState(null);

  const [now, setNow] = useState(Date.now());

  const workDate = getManilaDate();

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [rosterResponse, activeResponse] = await Promise.all([
          api.get("/attendance/management/manual-employees", {
            params: { work_date: workDate },
          }),
          api.get("/attendance/active-breaks"),
        ]);

        const rosterData = rosterResponse.data;
        const activeData = activeResponse.data;

        const roster =
          rosterData?.employees || rosterData?.data?.employees || [];

        const active = activeData?.data?.activeBreaks || activeData?.data || [];

        setEmployees(Array.isArray(roster) ? roster : []);
        setActiveBreaks(Array.isArray(active) ? active : []);
        setError("");
      } catch (requestError) {
        setError(
          getErrorMessage(
            requestError,
            "Unable to load breaktime monitoring data.",
          ),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [workDate],
  );

  useEffect(() => {
    loadData();

    const refreshInterval = window.setInterval(() => {
      loadData({ silent: true });
    }, REFRESH_INTERVAL);

    const timerInterval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(timerInterval);
    };
  }, [loadData]);

  const presentEmployees = useMemo(
    () =>
      employees.filter((employee) => employee.attendance?.status === "present"),
    [employees],
  );

  const activeBreakByEmployee = useMemo(() => {
    const map = new Map();

    activeBreaks.forEach((item) => {
      map.set(item.employee_id, item);
    });

    return map;
  }, [activeBreaks]);

  const departments = useMemo(() => {
    const unique = new Map();

    presentEmployees.forEach((employee) => {
      if (employee.department_id) {
        unique.set(
          employee.department_id,
          employee.department_name || "Unnamed Department",
        );
      }
    });

    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [presentEmployees]);

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return presentEmployees.filter((employee) => {
      const activeBreak = activeBreakByEmployee.get(employee.id);
      const info = getBreakInfo(activeBreak, now);

      const fullName = getEmployeeName(employee).toLowerCase();
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

      let matchesStatus = true;

      if (statusFilter === "available") {
        matchesStatus = !activeBreak;
      } else if (statusFilter === "active") {
        matchesStatus = Boolean(activeBreak) && !info?.isExceeded;
      } else if (statusFilter === "exceeded") {
        matchesStatus = Boolean(info?.isExceeded);
      }

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [
    presentEmployees,
    activeBreakByEmployee,
    search,
    departmentFilter,
    statusFilter,
    now,
  ]);

  const onBreakCount = presentEmployees.filter((employee) =>
    activeBreakByEmployee.has(employee.id),
  ).length;

  const exceededCount = activeBreaks.filter(
    (item) => getBreakInfo(item, now)?.isExceeded,
  ).length;

  const nearLimitCount = activeBreaks.filter(
    (item) => getBreakInfo(item, now)?.isNearLimit,
  ).length;

  const availableCount = presentEmployees.length - onBreakCount;

  const selectedEmployeeObjects = useMemo(
    () =>
      presentEmployees.filter((employee) =>
        selectedEmployees.includes(employee.id),
      ),
    [presentEmployees, selectedEmployees],
  );

  const selectedNotOnBreak = selectedEmployeeObjects.filter(
    (employee) => !activeBreakByEmployee.has(employee.id),
  );

  const selectedOnBreak = selectedEmployeeObjects.filter((employee) =>
    activeBreakByEmployee.has(employee.id),
  );

  const eligibleStartEmployees = selectedNotOnBreak.filter((employee) => {
    if (!bulkScheduleId) return false;

    const schedule = getAvailableSchedules(employee).find(
      (item) => item.id === bulkScheduleId,
    );

    if (!schedule) return false;

    const count = getScheduleCount(employee.break_records, bulkScheduleId);

    return (
      schedule.max_occurrences_per_shift == null ||
      count < Number(schedule.max_occurrences_per_shift)
    );
  });

  const selectedVisibleIds = filteredEmployees.map((employee) => employee.id);

  const allVisibleSelected =
    selectedVisibleIds.length > 0 &&
    selectedVisibleIds.every((id) => selectedEmployees.includes(id));

  const toggleEmployee = (employeeId) => {
    setSelectedEmployees((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedEmployees((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !selectedVisibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...selectedVisibleIds]));
    });
  };

  const handleStartBreak = async (employee) => {
    const scheduleId = selectedSchedules[employee.id];

    if (!scheduleId) {
      setError(
        `Please select a break schedule for ${getEmployeeName(employee)}.`,
      );
      setSuccess("");
      return;
    }

    setActionEmployeeId(employee.id);
    setError("");
    setSuccess("");
    setBulkResults(null);

    try {
      const response = await api.post("/attendance/management/action", {
        employee_id: employee.id,
        action: "break_start",
        break_schedule_id: scheduleId,
      });

      setSuccess(
        response.data?.message ||
          `Break started for ${getEmployeeName(employee)}.`,
      );

      await loadData({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to start break."));
    } finally {
      setActionEmployeeId(null);
    }
  };

  const handleEndBreak = async (employee) => {
    setActionEmployeeId(employee.id);
    setError("");
    setSuccess("");
    setBulkResults(null);

    try {
      const response = await api.post("/attendance/management/action", {
        employee_id: employee.id,
        action: "break_end",
      });

      setSuccess(
        response.data?.message ||
          `Break ended for ${getEmployeeName(employee)}.`,
      );

      await loadData({ silent: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to end break."));
    } finally {
      setActionEmployeeId(null);
    }
  };

  const handleBulkAction = async (action) => {
    const targets =
      action === "break_start" ? eligibleStartEmployees : selectedOnBreak;

    if (targets.length === 0) {
      setError(
        action === "break_start"
          ? "No selected employees are eligible to start this break."
          : "Select at least one employee who is currently on break.",
      );
      return;
    }

    if (action === "break_start" && !bulkScheduleId) {
      setError("Please select a break schedule for the group.");
      return;
    }

    const employeeIds = targets.map((employee) => employee.id);

    setBulkLoading(true);
    setError("");
    setSuccess("");
    setBulkResults(null);

    try {
      const response = await api.post("/attendance/management/bulk-action", {
        employee_ids: employeeIds,
        action,
        break_schedule_id: action === "break_start" ? bulkScheduleId : null,
      });

      const data = response.data?.data || response.data || {};

      const results = Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.employees)
          ? data.employees
          : [];

      const succeeded = Number(data.success_count ?? data.succeeded ?? 0);

      const failed = Number(data.failed_count ?? data.failed ?? 0);

      setBulkResults({
        results,
        succeeded: results.length
          ? results.filter((item) => item.success).length
          : succeeded,
        failed: results.length
          ? results.filter((item) => !item.success).length
          : failed,
        total: employeeIds.length,
      });

      setSuccess(
        data.message ||
          `Bulk action processed for ${employeeIds.length} employees.`,
      );

      setSelectedEmployees([]);
      await loadData({ silent: true });
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Unable to process bulk break action."),
      );
    } finally {
      setBulkLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
          <LoaderCircle className="animate-spin" size={20} />
          Loading breaktime monitoring...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
              <Coffee size={22} />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Breaktime Monitoring
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Monitor breaks, manage group activities, and detect overbreaks.
              </p>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Work date: {workDate} · Philippine Time
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData({ silent: true })}
          disabled={refreshing || bulkLoading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <p className="flex-1">{success}</p>
          <button
            type="button"
            onClick={() => setSuccess("")}
            aria-label="Dismiss success"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Present Employees"
          value={presentEmployees.length}
          description="Marked present today"
          icon={Users}
          tone="teal"
        />

        <StatCard
          label="Currently on Break"
          value={onBreakCount}
          description="Active break records"
          icon={Coffee}
          tone="green"
        />

        <StatCard
          label="Available"
          value={availableCount}
          description="Not currently on break"
          icon={Activity}
        />

        <StatCard
          label="Near Limit"
          value={nearLimitCount}
          description="Five minutes or less remaining"
          icon={Clock3}
          tone="amber"
        />

        <StatCard
          label="Overbreak"
          value={exceededCount}
          description="Beyond allowed duration"
          icon={AlertTriangle}
          tone="red"
        />
      </div>

      {/* Bulk result */}
      {bulkResults && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold text-slate-900">Bulk Action Results</h2>
            <button
              type="button"
              onClick={() => setBulkResults(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-2xl font-bold text-slate-900">
                {bulkResults.total}
              </p>
              <p className="text-xs text-slate-500">Processed</p>
            </div>

            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-700">
                {bulkResults.succeeded}
              </p>
              <p className="text-xs text-emerald-700">Successful</p>
            </div>

            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-2xl font-bold text-red-700">
                {bulkResults.failed}
              </p>
              <p className="text-xs text-red-700">Failed</p>
            </div>
          </div>

          {bulkResults.results.length > 0 && (
            <div className="mt-4 divide-y divide-slate-100">
              {bulkResults.results.map((item, index) => (
                <div
                  key={item.employee_id || item.id || index}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-700">
                    {item.employee_name ||
                      item.employee_number ||
                      item.employee_id ||
                      "Employee"}
                  </span>

                  {item.success ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <Check size={14} />
                      Success
                    </span>
                  ) : (
                    <span className="max-w-[60%] text-right text-xs font-medium text-red-600">
                      {item.message || item.error || "Action failed"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Active breaks */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Active Breaks</h2>
            <p className="mt-1 text-xs text-slate-500">
              Live employee break duration and overbreak status
            </p>
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {activeBreaks.length} Active
          </span>
        </div>

        {activeBreaks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
            <Coffee size={25} className="text-slate-400" />
            <p className="mt-3 font-semibold text-slate-700">
              No active breaks
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Employees currently on break will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
            {activeBreaks.map((activeBreak) => {
              const employee = presentEmployees.find(
                (item) => item.id === activeBreak.employee_id,
              );

              const info = getBreakInfo(activeBreak, now);

              return (
                <div
                  key={activeBreak.id}
                  className={`rounded-xl border p-4 ${
                    info.isExceeded
                      ? "border-red-200 bg-red-50/50"
                      : info.isNearLimit
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900">
                        {employee
                          ? getEmployeeName(employee)
                          : `${activeBreak.first_name || ""} ${activeBreak.last_name || ""}`.trim()}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {activeBreak.employee_number ||
                          employee?.employee_number ||
                          "—"}
                        {" · "}
                        {activeBreak.department_name ||
                          employee?.department_name ||
                          "No department"}
                      </p>
                    </div>

                    <StatusBadge activeBreak={activeBreak} now={now} />
                  </div>

                  <div className="mt-4 rounded-xl bg-white/80 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {activeBreak.break_name || "Break"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Started at {formatTime(activeBreak.actual_start_at)}
                        </p>
                      </div>
                      <Clock3 size={19} className="text-slate-400" />
                    </div>

                    <BreakTimer activeBreak={activeBreak} now={now} />
                  </div>

                  {employee && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleEndBreak(employee)}
                        disabled={
                          actionEmployeeId === employee.id || bulkLoading
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        {actionEmployeeId === employee.id ? (
                          <LoaderCircle size={15} className="animate-spin" />
                        ) : (
                          <Square size={14} />
                        )}
                        End Break
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Employee roster */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Present Employees</h2>
              <p className="mt-1 text-xs text-slate-500">
                Select employees to start or end breaks in bulk.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employee..."
                  className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:w-56"
                />
              </div>

              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500"
              >
                <option value="all">All Departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500"
              >
                <option value="all">All Status</option>
                <option value="available">Not on Break</option>
                <option value="active">On Break</option>
                <option value="exceeded">Overbreak</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk toolbar */}
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  disabled={filteredEmployees.length === 0 || bulkLoading}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                />
                Select All Visible
              </label>

              <span className="text-xs text-slate-500">
                {selectedEmployees.length} selected
              </span>

              {selectedEmployees.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedEmployees([])}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Clear selection
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={bulkScheduleId}
                onChange={(event) => setBulkScheduleId(event.target.value)}
                disabled={bulkLoading}
                className="h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 sm:min-w-[220px]"
              >
                <option value="">Select group break schedule</option>

                {Array.from(
                  new Map(
                    presentEmployees
                      .flatMap(getAvailableSchedules)
                      .map((schedule) => [schedule.id, schedule]),
                  ).values(),
                ).map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {getScheduleLabel(schedule)} · {schedule.duration_minutes}{" "}
                    min
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleBulkAction("break_start")}
                disabled={
                  bulkLoading ||
                  !bulkScheduleId ||
                  eligibleStartEmployees.length === 0
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {bulkLoading ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Play size={15} />
                )}
                Start Selected ({eligibleStartEmployees.length})
              </button>

              <button
                type="button"
                onClick={() => handleBulkAction("break_end")}
                disabled={bulkLoading || selectedOnBreak.length === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Square size={14} />
                End Selected ({selectedOnBreak.length})
              </button>
            </div>
          </div>

          {selectedEmployees.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {selectedNotOnBreak.length} selected not on break ·{" "}
              {selectedOnBreak.length} selected on break ·{" "}
              {eligibleStartEmployees.length} eligible for selected start
              schedule
            </p>
          )}
        </div>

        {filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
            <Users size={25} className="text-slate-400" />
            <p className="mt-3 font-semibold text-slate-700">
              No employees found
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Try changing your search or filters.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredEmployees.map((employee) => {
              const activeBreak = activeBreakByEmployee.get(employee.id);
              const availableSchedules = getAvailableSchedules(employee);
              const isSelected = selectedEmployees.includes(employee.id);
              const isBusy = actionEmployeeId === employee.id;
              const info = getBreakInfo(activeBreak, now);

              const canStart = !activeBreak && availableSchedules.length > 0;

              return (
                <div
                  key={employee.id}
                  className={`flex flex-col gap-4 px-5 py-5 transition xl:flex-row xl:items-center xl:justify-between ${
                    isSelected ? "bg-teal-50/40" : "bg-white"
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleEmployee(employee.id)}
                      disabled={bulkLoading}
                      className="mt-3 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                    />

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-sm font-bold text-teal-700">
                      {employee.first_name?.[0] || "E"}
                      {employee.last_name?.[0] || ""}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-slate-900">
                          {getEmployeeName(employee) || "Unnamed Employee"}
                        </p>
                        <StatusBadge activeBreak={activeBreak} now={now} />
                      </div>

                      <p className="mt-1 text-xs text-slate-500">
                        {employee.employee_number || "No employee number"}
                        {" · "}
                        {employee.department_name || "No department"}
                      </p>

                      <p className="mt-1 text-xs text-slate-400">
                        {employee.position_name || "No position"}
                        {employee.shift?.name
                          ? ` · ${employee.shift.name}`
                          : ""}
                      </p>

                      {activeBreak && (
                        <div className="mt-3 max-w-sm rounded-xl border border-slate-100 bg-white p-3">
                          <p className="mb-2 text-xs font-semibold text-slate-700">
                            {activeBreak.break_name || "Break"} · Started{" "}
                            {formatTime(activeBreak.actual_start_at)}
                          </p>
                          <BreakTimer activeBreak={activeBreak} now={now} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto xl:min-w-[390px]">
                    {activeBreak ? (
                      <div className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div>
                          <p
                            className={`text-xs font-semibold ${
                              info?.isExceeded
                                ? "text-red-700"
                                : "text-slate-700"
                            }`}
                          >
                            {info?.isExceeded
                              ? `Overbreak by ${formatDuration(info.excessSeconds)}`
                              : "Active break"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatDuration(info?.elapsedSeconds || 0)} elapsed
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleEndBreak(employee)}
                          disabled={isBusy || bulkLoading}
                          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {isBusy ? (
                            <LoaderCircle size={14} className="animate-spin" />
                          ) : (
                            <Square size={13} />
                          )}
                          End Break
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedSchedules[employee.id] || ""}
                          onChange={(event) =>
                            setSelectedSchedules((current) => ({
                              ...current,
                              [employee.id]: event.target.value,
                            }))
                          }
                          disabled={!canStart || isBusy || bulkLoading}
                          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-teal-500 disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="">
                            {availableSchedules.length
                              ? "Select break schedule"
                              : "No available break schedule"}
                          </option>

                          {availableSchedules.map((schedule) => {
                            const count = getScheduleCount(
                              employee.break_records,
                              schedule.id,
                            );

                            const reached =
                              schedule.max_occurrences_per_shift != null &&
                              count >=
                                Number(schedule.max_occurrences_per_shift);

                            return (
                              <option
                                key={schedule.id}
                                value={schedule.id}
                                disabled={reached}
                              >
                                {getScheduleLabel(schedule)} ·{" "}
                                {schedule.duration_minutes} min
                                {schedule.break_type?.is_paid
                                  ? " · Paid"
                                  : " · Unpaid"}
                                {reached ? " · Limit reached" : ""}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleStartBreak(employee)}
                          disabled={
                            isBusy ||
                            bulkLoading ||
                            !selectedSchedules[employee.id]
                          }
                          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {isBusy ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <Play size={15} />
                          )}
                          Start Break
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {filteredEmployees.length} of {presentEmployees.length}{" "}
            present employees
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity size={13} />
            Live timer · Auto-refresh every 15 seconds
          </span>
        </div>
      </section>
    </div>
  );
}
