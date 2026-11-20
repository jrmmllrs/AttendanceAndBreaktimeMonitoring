import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Activity,
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
} from "lucide-react";

import { api, getApiError } from "../../lib/api";

const REFRESH_INTERVAL = 15000;
const TIME_ZONE = "Asia/Manila";

/**
 * Brand palette (same as Dashboard): white + blue + red, grays for neutrals.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red  #C8102E · Light red #FDECEF · Soft red #EE8696 · Border #E3EAF5
 *
 * Break states:  normal = blue · near limit = soft red · overbreak = solid red
 */

/* ---------- Helpers ---------- */

function getManilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatLongDate(date) {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
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

function getInitials(employee) {
  return (
    `${(employee?.first_name || "")[0] || ""}${
      (employee?.last_name || "")[0] || ""
    }`.toUpperCase() || "?"
  );
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

/* ---------- Building blocks ---------- */

function StatCard({ label, value, description, icon: Icon, tone, loading }) {
  const tones = {
    blue: { chip: "bg-[#EAF1FD] text-[#1D63D6]", value: "text-[#0B3A8C]" },
    soft: { chip: "bg-[#FDECEF] text-[#E0566B]", value: "text-[#E0566B]" },
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

      <p className="mt-1 text-xs text-slate-500">{description}</p>
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

function Avatar({ employee, active, danger }) {
  let cls = "bg-[#EAF1FD] text-[#1D63D6]";

  if (danger) cls = "bg-[#C8102E] text-white";
  else if (active) cls = "bg-[#1D63D6] text-white";

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${cls}`}
    >
      {getInitials(employee)}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center px-5 text-center">
      <div className="mb-3 rounded-2xl bg-[#EAF1FD] p-4 text-[#1D63D6]">
        <Icon size={25} strokeWidth={1.7} />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function StatusBadge({ activeBreak, now }) {
  if (!activeBreak) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        Not on break
      </span>
    );
  }

  const info = getBreakInfo(activeBreak, now);

  if (info.isExceeded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#C8102E] px-2.5 py-1 text-xs font-semibold text-white">
        <AlertTriangle size={11} />
        Overbreak
      </span>
    );
  }

  if (info.isNearLimit) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#F5C2CA] bg-[#FDECEF] px-2.5 py-1 text-xs font-semibold text-[#C8102E]">
        <Clock3 size={11} />
        Near limit
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF1FD] px-2.5 py-1 text-xs font-semibold text-[#1D63D6]">
      <Coffee size={11} />
      On break
    </span>
  );
}

function BreakTimer({ activeBreak, now, compact = false }) {
  const info = getBreakInfo(activeBreak, now);

  if (!info) return null;

  let colorClass = "text-[#1D63D6]";
  let barColor = "#1D63D6";
  let statusText = `${formatDuration(info.remainingSeconds)} remaining`;

  if (info.isExceeded) {
    colorClass = "text-[#C8102E]";
    barColor = "#C8102E";
    statusText = `Overbreak by ${formatDuration(info.excessSeconds)}`;
  } else if (info.isNearLimit) {
    colorClass = "text-[#C8102E]";
    barColor = "#EE8696";
    statusText = `Near limit · ${formatDuration(info.remainingSeconds)} left`;
  }

  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p
            className={`font-semibold tabular-nums ${colorClass} ${
              compact ? "text-base" : "text-2xl"
            }`}
          >
            {formatDuration(info.elapsedSeconds)}
          </p>
          {!compact && <p className="mt-0.5 text-xs text-slate-500">Elapsed</p>}
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-700">
            {activeBreak?.allowed_duration_minutes || 0} min
          </p>
          {!compact && <p className="mt-0.5 text-xs text-slate-500">Allowed</p>}
        </div>
      </div>

      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#EEF3FB]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${info.progress}%`, backgroundColor: barColor }}
        />
      </div>

      <p className={`mt-1.5 text-xs font-semibold ${colorClass}`}>
        {statusText}
      </p>
    </div>
  );
}

function ActiveBreakCard({
  activeBreak,
  employee,
  now,
  onEnd,
  busy,
  disabled,
}) {
  const info = getBreakInfo(activeBreak, now);

  const name = employee
    ? getEmployeeName(employee)
    : `${activeBreak.first_name || ""} ${activeBreak.last_name || ""}`.trim();

  const avatarSource = employee || {
    first_name: activeBreak.first_name,
    last_name: activeBreak.last_name,
  };

  let surface = "border-[#E3EAF5] bg-white";
  if (info.isExceeded) surface = "border-[#F5C2CA] bg-[#FDECEF]/60";
  else if (info.isNearLimit) surface = "border-[#F5C2CA] bg-white";

  return (
    <div className={`rounded-xl border p-4 ${surface}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar employee={avatarSource} danger={info.isExceeded} />

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#0B3A8C]">
              {name || "Employee"}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {activeBreak.employee_number || employee?.employee_number || "—"}
              {" · "}
              {activeBreak.department_name ||
                employee?.department_name ||
                "No department"}
            </p>
          </div>
        </div>

        <StatusBadge activeBreak={activeBreak} now={now} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <Coffee size={13} />
          {activeBreak.break_name || "Break"}
        </span>
        <span>Started {formatTime(activeBreak.actual_start_at)}</span>
      </div>

      <div className="mt-3">
        <BreakTimer activeBreak={activeBreak} now={now} />
      </div>

      {employee && (
        <div className="mt-4 flex justify-end border-t border-[#EEF3FB] pt-3">
          <button
            type="button"
            onClick={() => onEnd(employee)}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0B3A8C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1D63D6] disabled:opacity-60"
          >
            {busy ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Square size={13} />
            )}
            End break
          </button>
        </div>
      )}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
      {[1, 2].map((item) => (
        <div
          key={item}
          className="h-44 animate-pulse rounded-xl bg-[#F4F8FE]"
        />
      ))}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-[#EEF3FB]">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-4 p-5">
          <div className="h-4 w-4 rounded bg-[#EEF3FB]" />
          <div className="h-10 w-10 rounded-full bg-[#EEF3FB]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-44 rounded bg-[#EEF3FB]" />
            <div className="h-3 w-28 rounded bg-[#EEF3FB]" />
          </div>
          <div className="hidden h-10 w-64 rounded-xl bg-[#EEF3FB] lg:block" />
        </div>
      ))}
    </div>
  );
}

/* ---------- Roster row ---------- */

function RosterRow({
  employee,
  activeBreak,
  now,
  selected,
  onToggle,
  scheduleId,
  onScheduleChange,
  onStart,
  onEnd,
  busy,
  bulkLoading,
}) {
  const availableSchedules = getAvailableSchedules(employee);
  const info = getBreakInfo(activeBreak, now);
  const canStart = !activeBreak && availableSchedules.length > 0;
  const name = getEmployeeName(employee);

  let surface = selected ? "bg-[#F7FAFE]" : "bg-white hover:bg-[#F7FAFE]";
  if (info?.isExceeded) {
    surface = "bg-[#FDECEF]/40 shadow-[inset_3px_0_0_0_#C8102E]";
  }

  return (
    <li
      className={`flex flex-col gap-4 px-4 py-4 transition sm:px-5 xl:flex-row xl:items-center xl:justify-between ${surface}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(employee.id)}
          disabled={bulkLoading}
          aria-label={`Select ${name}`}
          className="mt-3 h-4 w-4 shrink-0 rounded border-slate-300 text-[#1D63D6] focus:ring-[#1D63D6]"
        />

        <Avatar
          employee={employee}
          active={selected}
          danger={Boolean(info?.isExceeded)}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-[#0B3A8C]">
              {name || "Unnamed employee"}
            </p>
            <StatusBadge activeBreak={activeBreak} now={now} />
          </div>

          <p className="mt-0.5 text-xs text-slate-500">
            {employee.employee_number || "No employee number"}
            {" · "}
            {employee.department_name || "No department"}
            {employee.position_name ? ` · ${employee.position_name}` : ""}
          </p>

          {activeBreak && (
            <div className="mt-3 max-w-sm">
              <p className="mb-1.5 text-xs font-medium text-slate-600">
                {activeBreak.break_name || "Break"} · Started{" "}
                {formatTime(activeBreak.actual_start_at)}
              </p>
              <BreakTimer activeBreak={activeBreak} now={now} compact />
            </div>
          )}
        </div>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto xl:min-w-[400px] xl:justify-end">
        {activeBreak ? (
          <button
            type="button"
            onClick={() => onEnd(employee)}
            disabled={busy || bulkLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0B3A8C] px-4 text-sm font-semibold text-white transition hover:bg-[#1D63D6] disabled:opacity-60"
          >
            {busy ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Square size={13} />
            )}
            End break
          </button>
        ) : (
          <>
            <select
              value={scheduleId || ""}
              onChange={(event) =>
                onScheduleChange(employee.id, event.target.value)
              }
              disabled={!canStart || busy || bulkLoading}
              aria-label={`Break schedule for ${name}`}
              className="h-10 min-w-0 flex-1 rounded-xl border border-[#E3EAF5] bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD] disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">
                {availableSchedules.length
                  ? "Select break schedule"
                  : "No available schedule"}
              </option>

              {availableSchedules.map((schedule) => {
                const count = getScheduleCount(
                  employee.break_records,
                  schedule.id,
                );

                const reached =
                  schedule.max_occurrences_per_shift != null &&
                  count >= Number(schedule.max_occurrences_per_shift);

                return (
                  <option
                    key={schedule.id}
                    value={schedule.id}
                    disabled={reached}
                  >
                    {getScheduleLabel(schedule)} · {schedule.duration_minutes}{" "}
                    min
                    {schedule.break_type?.is_paid ? " · Paid" : " · Unpaid"}
                    {reached ? " · Limit reached" : ""}
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => onStart(employee)}
              disabled={busy || bulkLoading || !scheduleId}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-4 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {busy ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Start break
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/* ---------- Page ---------- */

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "available", label: "Not on break" },
  { key: "active", label: "On break" },
  { key: "exceeded", label: "Overbreak" },
];

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

  const selectAllRef = useRef(null);
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

  /* ----- Derived data ----- */

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

  const employeeById = useMemo(() => {
    const map = new Map();
    presentEmployees.forEach((employee) => map.set(employee.id, employee));
    return map;
  }, [presentEmployees]);

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

  const groupSchedules = useMemo(
    () =>
      Array.from(
        new Map(
          presentEmployees
            .flatMap(getAvailableSchedules)
            .map((schedule) => [schedule.id, schedule]),
        ).values(),
      ),
    [presentEmployees],
  );

  /* Overbreak first, then least time remaining */
  const sortedActiveBreaks = useMemo(
    () =>
      [...activeBreaks].sort(
        (a, b) =>
          (getBreakInfo(a, now)?.remainingSeconds ?? 0) -
          (getBreakInfo(b, now)?.remainingSeconds ?? 0),
      ),
    [activeBreaks, now],
  );

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

  const tabCounts = {
    all: presentEmployees.length,
    available: availableCount,
    active: Math.max(0, onBreakCount - exceededCount),
    exceeded: exceededCount,
  };

  const selectedSet = useMemo(
    () => new Set(selectedEmployees),
    [selectedEmployees],
  );

  const selectedEmployeeObjects = useMemo(
    () => presentEmployees.filter((employee) => selectedSet.has(employee.id)),
    [presentEmployees, selectedSet],
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

  const selectedVisibleIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees],
  );

  const allVisibleSelected =
    selectedVisibleIds.length > 0 &&
    selectedVisibleIds.every((id) => selectedSet.has(id));

  const someVisibleSelected = selectedVisibleIds.some((id) =>
    selectedSet.has(id),
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  /* ----- Actions ----- */

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

  const setEmployeeSchedule = (employeeId, scheduleId) => {
    setSelectedSchedules((current) => ({
      ...current,
      [employeeId]: scheduleId,
    }));
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

  const initialLoad = loading;
  const selectedCount = selectedEmployees.length;

  return (
    <div className="space-y-6 pb-8">
      {/* ===== Header ===== */}
      <header className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
        <div className="flex h-1.5">
          <div className="w-24 bg-[#C8102E]" />
          <div className="flex-1 bg-[#1D63D6]" />
        </div>

        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-[#EAF1FD] p-3 text-[#1D63D6]">
              <Coffee size={24} />
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A8C]">
                Breaktime Monitoring
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Monitor breaks, manage group activities and catch overbreaks.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] px-3.5 py-2 leading-tight">
              <p className="text-sm font-semibold text-[#0B3A8C]">
                {formatLongDate(workDate)}
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className={`h-1.5 w-1.5 rounded-full bg-[#1D63D6] ${
                    refreshing ? "animate-pulse" : ""
                  }`}
                />
                {refreshing ? "Updating..." : "Live · refreshes every 15s"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadData({ silent: true })}
              disabled={refreshing || bulkLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={refreshing ? "animate-spin" : ""}
              />
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

      {!error && exceededCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3">
          <AlertTriangle className="shrink-0 text-[#C8102E]" size={18} />
          <p className="flex-1 text-sm font-medium text-[#8E0B20]">
            {exceededCount}{" "}
            {exceededCount === 1 ? "employee is" : "employees are"} over their
            break time right now.
          </p>
          <button
            type="button"
            onClick={() => setStatusFilter("exceeded")}
            className="shrink-0 text-xs font-semibold text-[#C8102E] hover:underline"
          >
            Show them
          </button>
        </div>
      )}

      {/* ===== Summary ===== */}
      <section
        aria-label="Break summary"
        className="grid grid-cols-2 gap-4 xl:grid-cols-5"
      >
        <div className="col-span-2 xl:col-span-1">
          <StatCard
            label="Present"
            value={presentEmployees.length}
            description="Marked present today"
            icon={Users}
            tone="blue"
            loading={initialLoad}
          />
        </div>

        <StatCard
          label="On break"
          value={onBreakCount}
          description="Active break records"
          icon={Coffee}
          tone="blue"
          loading={initialLoad}
        />

        <StatCard
          label="Available"
          value={availableCount}
          description="Not currently on break"
          icon={Activity}
          tone="gray"
          loading={initialLoad}
        />

        <StatCard
          label="Near limit"
          value={nearLimitCount}
          description="5 minutes or less left"
          icon={Clock3}
          tone="soft"
          loading={initialLoad}
        />

        <StatCard
          label="Overbreak"
          value={exceededCount}
          description="Beyond allowed time"
          icon={AlertTriangle}
          tone="red"
          loading={initialLoad}
        />
      </section>

      {/* ===== Bulk results ===== */}
      {bulkResults && (
        <section className="rounded-2xl border border-[#E3EAF5] bg-white p-5 shadow-[0_1px_2px_rgba(11,58,140,0.04)] sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#0B3A8C]">
              Bulk action results
            </h2>
            <button
              type="button"
              onClick={() => setBulkResults(null)}
              aria-label="Close results"
              className="rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-[#F7FAFE] p-3">
              <p className="text-2xl font-semibold text-[#0B3A8C]">
                {bulkResults.total}
              </p>
              <p className="text-xs text-slate-500">Processed</p>
            </div>

            <div className="rounded-xl bg-[#EAF1FD] p-3">
              <p className="text-2xl font-semibold text-[#1D63D6]">
                {bulkResults.succeeded}
              </p>
              <p className="text-xs text-[#1D63D6]">Successful</p>
            </div>

            <div className="rounded-xl bg-[#FDECEF] p-3">
              <p className="text-2xl font-semibold text-[#C8102E]">
                {bulkResults.failed}
              </p>
              <p className="text-xs text-[#C8102E]">Failed</p>
            </div>
          </div>

          {bulkResults.results.length > 0 && (
            <ul className="mt-4 divide-y divide-[#EEF3FB]">
              {[...bulkResults.results]
                .sort((a, b) => Number(a.success) - Number(b.success))
                .map((item, index) => (
                  <li
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
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D63D6]">
                        <Check size={14} />
                        Success
                      </span>
                    ) : (
                      <span className="max-w-[60%] text-right text-xs font-medium text-[#C8102E]">
                        {item.message || item.error || "Action failed"}
                      </span>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* ===== Active breaks ===== */}
      <section className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
        <div className="flex flex-col gap-2 border-b border-[#EEF3FB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-[#0B3A8C]">
              Active breaks
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Overbreak shown first, then least time remaining
            </p>
          </div>

          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#EAF1FD] px-3 py-1.5 text-xs font-semibold text-[#1D63D6]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#1D63D6]" />
            {activeBreaks.length} active
          </span>
        </div>

        {initialLoad ? (
          <SkeletonCards />
        ) : activeBreaks.length === 0 ? (
          <EmptyState
            icon={Coffee}
            title="No active breaks"
            description="Employees currently on break will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-2">
            {sortedActiveBreaks.map((activeBreak) => {
              const employee = employeeById.get(activeBreak.employee_id);

              return (
                <ActiveBreakCard
                  key={activeBreak.id}
                  activeBreak={activeBreak}
                  employee={employee}
                  now={now}
                  onEnd={handleEndBreak}
                  busy={actionEmployeeId === activeBreak.employee_id}
                  disabled={
                    actionEmployeeId === activeBreak.employee_id || bulkLoading
                  }
                />
              );
            })}
          </div>
        )}
      </section>

      {/* ===== Roster ===== */}
      <section className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
        <div className="space-y-4 border-b border-[#EEF3FB] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#0B3A8C]">
                Present employees
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Start or end a break per person, or select several for a group
                action.
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
                className="h-10 w-full rounded-xl border border-[#E3EAF5] pl-10 pr-9 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
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

            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              aria-label="Filter by department"
              className="h-10 rounded-xl border border-[#E3EAF5] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
            >
              <option value="all">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div
            role="tablist"
            aria-label="Filter by break status"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
          >
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              const isDanger = tab.key === "exceeded";

              let cls =
                "border-[#E3EAF5] bg-white text-slate-600 hover:border-[#1D63D6] hover:text-[#1D63D6]";
              if (active) {
                cls = isDanger
                  ? "border-[#C8102E] bg-[#C8102E] text-white"
                  : "border-[#1D63D6] bg-[#1D63D6] text-white";
              } else if (isDanger && tabCounts.exceeded > 0) {
                cls =
                  "border-[#F5C2CA] bg-[#FDECEF] text-[#C8102E] hover:border-[#C8102E]";
              }

              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${cls}`}
                >
                  {tab.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-white/20 text-white" : "bg-white/70"
                    }`}
                  >
                    {initialLoad ? "—" : tabCounts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Select-all row */}
        <div
          className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${
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
              disabled={filteredEmployees.length === 0 || bulkLoading}
              className="h-4 w-4 rounded border-slate-300 text-[#1D63D6] focus:ring-[#1D63D6]"
            />
            <span className="text-sm font-semibold text-[#0B3A8C]">
              {selectedCount > 0
                ? `${selectedCount} selected`
                : "Select all visible"}
            </span>
          </label>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedEmployees([])}
              className="text-xs font-semibold text-[#1D63D6] hover:underline"
            >
              Clear selection
            </button>
          )}
        </div>

        {/* Rows */}
        {initialLoad ? (
          <SkeletonRows />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              presentEmployees.length === 0
                ? "No present employees"
                : "No employees match your filters"
            }
            description={
              presentEmployees.length === 0
                ? "Employees marked present today will appear here."
                : "Try a different search, department or status."
            }
          />
        ) : (
          <ul className="divide-y divide-[#EEF3FB]">
            {filteredEmployees.map((employee) => (
              <RosterRow
                key={employee.id}
                employee={employee}
                activeBreak={activeBreakByEmployee.get(employee.id)}
                now={now}
                selected={selectedSet.has(employee.id)}
                onToggle={toggleEmployee}
                scheduleId={selectedSchedules[employee.id]}
                onScheduleChange={setEmployeeSchedule}
                onStart={handleStartBreak}
                onEnd={handleEndBreak}
                busy={actionEmployeeId === employee.id}
                bulkLoading={bulkLoading}
              />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-[#EEF3FB] bg-[#F7FAFE] px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {filteredEmployees.length} of {presentEmployees.length}{" "}
            present employees
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity size={13} />
            Live timer · auto-refresh every 15 seconds
          </span>
        </div>
      </section>

      {/* ===== Sticky group-action bar ===== */}
      {selectedCount > 0 && (
        <div className="sticky bottom-3 z-20">
          <div className="rounded-2xl border border-[#CFE0FA] bg-white p-4 shadow-[0_8px_24px_rgba(11,58,140,0.12)]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#0B3A8C]">
                  Group action · {selectedCount} selected
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedNotOnBreak.length} not on break ·{" "}
                  {selectedOnBreak.length} on break ·{" "}
                  {bulkScheduleId
                    ? `${eligibleStartEmployees.length} eligible for the chosen schedule`
                    : "choose a schedule to start breaks"}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={bulkScheduleId}
                  onChange={(event) => setBulkScheduleId(event.target.value)}
                  disabled={bulkLoading}
                  aria-label="Group break schedule"
                  className="h-10 min-w-0 rounded-xl border border-[#E3EAF5] bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD] sm:min-w-[220px]"
                >
                  <option value="">Select group break schedule</option>
                  {groupSchedules.map((schedule) => (
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
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-4 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {bulkLoading ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                  Start ({eligibleStartEmployees.length})
                </button>

                <button
                  type="button"
                  onClick={() => handleBulkAction("break_end")}
                  disabled={bulkLoading || selectedOnBreak.length === 0}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0B3A8C] px-4 text-sm font-semibold text-white transition hover:bg-[#1D63D6] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <Square size={13} />
                  End ({selectedOnBreak.length})
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEmployees([])}
                  disabled={bulkLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E3EAF5] bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-[#C8102E] hover:text-[#C8102E] disabled:opacity-50"
                >
                  <X size={14} />
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
