import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Coffee,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
  UserX,
  X,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";
import PositionFilter, {
  positionKey,
  buildPositionOptions,
} from "../../components/PositionFilter";

const REFRESH_INTERVAL = 15000;
const TIME_ZONE = "Asia/Manila";

/**
 * Palette (same as Dashboard and AppLayout): white + blue + red.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red #C8102E · Light red #FDECEF · Border #E3EAF5
 * Blue = attending, red = not attending or over time, gray = neutral.
 *
 * Position filter: reads `position_id` and `position_name` from each employee
 * in /monitoring/live. The response may also include
 * `positions: [{ id, name }]`; if it doesn't, options are built from employees.
 */

/* ---------- Helpers ---------- */

function formatTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatTimeWithSeconds(value) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(value);
}

function formatDuration(minutes = 0) {
  const value = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(value / 60);
  const remaining = value % 60;

  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function getActivityLabel(type) {
  const labels = {
    clock_in: "Clocked in",
    clock_out: "Clocked out",
    break_start: "Started a break",
    break_end: "Ended a break",
  };

  return labels[type] || String(type || "Activity").replaceAll("_", " ");
}

function getActivityIcon(type) {
  if (type === "clock_in") return UserCheck;
  if (type === "clock_out") return UserMinus;
  if (type === "break_start") return Coffee;
  if (type === "break_end") return CheckCircle2;

  return Activity;
}

/* ---------- Status config (blue / red / gray only) ---------- */

const STATUS_CONFIG = {
  present: {
    label: "Present",
    className: "bg-[#EAF1FD] text-[#1D63D6]",
    dot: "bg-[#1D63D6]",
  },
  on_break: {
    label: "On break",
    className: "bg-[#DCE8FB] text-[#0B3A8C]",
    dot: "bg-[#6C9BEA]",
  },
  half_day: {
    label: "Half day",
    className: "bg-[#EAF1FD] text-[#3F6FC4]",
    dot: "bg-[#6C9BEA]",
  },
  on_leave: {
    label: "On leave",
    className: "bg-[#F4F8FE] text-[#3F6FC4] ring-1 ring-inset ring-[#D5E3F8]",
    dot: "bg-[#B9CFF4]",
  },
  late: {
    label: "Late",
    className: "bg-[#FDECEF] text-[#B4283C]",
    dot: "bg-[#EE8696]",
  },
  incomplete: {
    label: "Incomplete",
    className: "bg-[#FDECEF] text-[#B4283C]",
    dot: "bg-[#EE8696]",
  },
  absent: {
    label: "Absent",
    className: "bg-[#FDECEF] text-[#C8102E]",
    dot: "bg-[#C8102E]",
  },
  no_attendance: {
    label: "No attendance",
    className: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  rest_day: {
    label: "Rest day",
    className: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  holiday: {
    label: "Holiday",
    className: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.no_attendance;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

/* ---------- Shared building blocks ---------- */

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-[#0B3A8C]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}

function EmptyState({ title, description, action }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-4 py-6 text-center">
      <div className="mb-3 rounded-2xl bg-[#EAF1FD] p-3 text-[#1D63D6]">
        <CircleHelp size={23} />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
        {description}
      </p>
      {action}
    </div>
  );
}

/* ---------- Header ---------- */

function PageHeader({ date, lastUpdated, refreshing, onRefresh }) {
  return (
    <header className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
      {/* Ribbon accent: red tab + blue line */}
      <div className="flex h-1.5">
        <div className="w-24 bg-[#C8102E]" />
        <div className="flex-1 bg-[#1D63D6]" />
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A8C]">
              Live Monitoring
            </h1>

            <span className="inline-flex items-center gap-2 rounded-full bg-[#EAF1FD] px-3 py-1 text-xs font-semibold text-[#1D63D6]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1D63D6] opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1D63D6]" />
              </span>
              Live
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Employee attendance and break activity across the warehouse.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] px-3.5 py-2">
            <CalendarDays size={18} className="text-[#1D63D6]" />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-[#0B3A8C]">
                {formatDate(date)}
              </p>
              <p className="text-xs text-slate-500">
                {lastUpdated
                  ? `Updated ${formatTimeWithSeconds(lastUpdated)}`
                  : "Loading..."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D63D6] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}

/* ---------- KPI cards ---------- */

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
  loading,
}) {
  const tones = {
    blue: { chip: "bg-[#EAF1FD] text-[#1D63D6]", value: "text-[#0B3A8C]" },
    red: { chip: "bg-[#FDECEF] text-[#C8102E]", value: "text-[#C8102E]" },
    gray: { chip: "bg-slate-100 text-slate-500", value: "text-slate-700" },
  };

  const t = tones[tone] || tones.blue;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>

        <div className={`shrink-0 rounded-lg p-2 ${t.chip}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>

      <p className={`mt-3 text-3xl font-semibold tracking-tight ${t.value}`}>
        {loading ? "—" : Number(value || 0).toLocaleString()}
      </p>

      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Card>
  );
}

/* ---------- Employee table ---------- */

const TABLE_HEADINGS = [
  "Employee",
  "Department",
  "Position",
  "Assigned shift",
  "Attendance",
  "Current activity",
];

function EmployeeTable({ employees, loading, onReset, hasFilters }) {
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-14 animate-pulse rounded-xl bg-[#F4F8FE]"
          />
        ))}
      </div>
    );
  }

  if (!employees.length) {
    return (
      <EmptyState
        title="No employees found"
        description="Try changing your filters or search keywords."
        action={
          hasFilters && (
            <button
              type="button"
              onClick={onReset}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#E3EAF5] px-3 py-1.5 text-xs font-semibold text-[#1D63D6] transition hover:bg-[#EAF1FD]"
            >
              <X size={13} />
              Clear filters
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left">
        <thead>
          <tr className="border-y border-[#E3EAF5] bg-[#F7FAFE]">
            {TABLE_HEADINGS.map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-5 py-3 text-xs font-semibold text-slate-500"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-[#EEF3FB]">
          {employees.map((employee) => {
            const overbreak = employee.break?.is_overbreak;

            return (
              <tr
                key={employee.id}
                className={`transition hover:bg-[#F7FAFE] ${
                  overbreak ? "bg-[#FDECEF]/50" : ""
                }`}
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        overbreak
                          ? "bg-[#C8102E] text-white"
                          : "bg-[#EAF1FD] text-[#1D63D6]"
                      }`}
                    >
                      {employee.employee_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>

                    <div>
                      <p className="whitespace-nowrap text-sm font-semibold text-[#0B3A8C]">
                        {employee.employee_name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {employee.employee_number || "No employee number"}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="px-5 py-3.5 text-sm text-slate-600">
                  {employee.department_name}
                </td>

                <td className="px-5 py-3.5 text-sm text-slate-600">
                  {employee.position_name || (
                    <span className="text-slate-400">No position</span>
                  )}
                </td>

                <td className="px-5 py-3.5">
                  <p className="whitespace-nowrap text-sm font-medium text-slate-700">
                    {employee.shift_name}
                  </p>
                  {employee.shift_start_time && (
                    <p className="mt-0.5 whitespace-nowrap text-xs text-slate-500">
                      {employee.shift_start_time.slice(0, 5)} –{" "}
                      {employee.shift_end_time?.slice(0, 5)}
                      {employee.is_overnight ? " · Overnight" : ""}
                    </p>
                  )}
                </td>

                <td className="px-5 py-3.5">
                  <StatusBadge status={employee.monitoring_status} />
                </td>

                <td className="px-5 py-3.5">
                  <p className="max-w-[190px] truncate text-sm capitalize text-slate-600">
                    {employee.current_activity}
                  </p>
                  {overbreak && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#C8102E]">
                      <AlertTriangle size={11} />
                      Overbreak ·{" "}
                      {formatDuration(employee.break.excess_minutes)}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Active breaks ---------- */

function ActiveBreaks({ breaks, loading }) {
  if (loading) {
    return (
      <div className="space-y-3 pt-5">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-20 animate-pulse rounded-xl bg-[#F4F8FE]"
          />
        ))}
      </div>
    );
  }

  if (!breaks.length) {
    return (
      <EmptyState
        title="No active breaks"
        description="Employees currently taking a break will appear here."
      />
    );
  }

  // Overbreak first, then the longest elapsed
  const sorted = [...breaks].sort((a, b) => {
    if (Boolean(b.is_overbreak) !== Boolean(a.is_overbreak)) {
      return b.is_overbreak ? 1 : -1;
    }
    return (b.elapsed_minutes || 0) - (a.elapsed_minutes || 0);
  });

  return (
    <div className="mt-5 space-y-3">
      {sorted.map((item) => {
        const allowed = Number(item.allowed_duration_minutes) || 0;
        const elapsed = Number(item.elapsed_minutes) || 0;
        const progress =
          allowed > 0 ? Math.min(100, (elapsed / allowed) * 100) : 0;

        return (
          <div
            key={item.id}
            className={`rounded-xl border p-4 ${
              item.is_overbreak
                ? "border-[#F5C2CA] bg-[#FDECEF]"
                : "border-[#E3EAF5] bg-[#F7FAFE]"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                  {item.employee_name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.employee_number} · {item.department_name}
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <Coffee size={13} />
                  {item.name || "Break"} · {item.shift_name}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    item.is_overbreak
                      ? "bg-[#C8102E] text-white"
                      : "bg-[#EAF1FD] text-[#1D63D6]"
                  }`}
                >
                  {item.is_overbreak ? (
                    <AlertTriangle size={11} />
                  ) : (
                    <Clock3 size={11} />
                  )}
                  {item.is_overbreak ? "Overbreak" : "On break"}
                </span>

                <p
                  className={`mt-2 text-sm font-semibold tabular-nums ${
                    item.is_overbreak ? "text-[#C8102E]" : "text-[#0B3A8C]"
                  }`}
                >
                  {formatDuration(elapsed)}
                </p>
              </div>
            </div>

            {allowed > 0 && (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      item.is_overbreak ? "bg-[#C8102E]" : "bg-[#1D63D6]"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Allowed: {formatDuration(allowed)}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Recent activities (timeline) ---------- */

function RecentActivities({ activities }) {
  if (!activities.length) {
    return (
      <EmptyState
        title="No recent activities"
        description="Recorded attendance and break events will appear here."
      />
    );
  }

  const items = activities.slice(0, 8);

  return (
    <ol className="mt-5">
      {items.map((item, index) => {
        const Icon = getActivityIcon(item.event_type);
        const isLast = index === items.length - 1;

        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <span className="absolute bottom-0 left-[17px] top-9 w-px bg-[#E3EAF5]" />
            )}

            <div className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E3EAF5] bg-[#EAF1FD] text-[#1D63D6]">
              <Icon size={16} />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium text-slate-800">
                  {item.employee_name}
                </p>
                <span className="shrink-0 text-xs text-slate-500">
                  {formatTime(item.created_at)}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-slate-500">
                {getActivityLabel(item.event_type)}
                {item.source ? ` · ${item.source}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Page ---------- */

const selectClass =
  "rounded-xl border border-[#E3EAF5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#1D63D6] focus:ring-2 focus:ring-[#1D63D6]/15";

export default function LiveMonitoringPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [positionIds, setPositionIds] = useState([]);

  // Position data from /employees, used when /monitoring/live doesn't
  // include position_id / position_name on its rows.
  const [positionMap, setPositionMap] = useState(() => new Map());
  const [positionList, setPositionList] = useState([]);

  const loadMonitoring = useCallback(async (manual = false) => {
    try {
      if (manual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/monitoring/live");
      const result = response.data?.data;

      if (!result) {
        throw new Error("Invalid live monitoring response.");
      }

      setData(result);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setError(getApiError(err, "Unable to load live monitoring."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoring();

    const interval = setInterval(() => {
      loadMonitoring(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadMonitoring]);

  // Load positions once (same endpoints the Employees page uses)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [employeeRes, referenceRes] = await Promise.all([
          api.get("/employees", {
            params: { page: 1, limit: 100, status: "all" },
          }),
          api.get("/employees/references"),
        ]);

        if (cancelled) return;

        setPositionMap(
          new Map(
            (employeeRes.data?.data || []).map((item) => [
              item.id,
              {
                position_id: item.position_id,
                position_name: item.position_name,
              },
            ]),
          ),
        );
        setPositionList(referenceRes.data?.data?.positions || []);
      } catch {
        // Position data is optional; the page still works without it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Use position fields from the monitoring rows when present;
  // otherwise fill them in from /employees.
  const employees = useMemo(
    () =>
      (data?.employees || []).map((employee) =>
        employee.position_id !== undefined
          ? employee
          : {
              ...employee,
              ...positionMap.get(employee.employee_id ?? employee.id),
            },
      ),
    [data, positionMap],
  );

  // Count per status (for the quick filter chips)
  const statusCounts = useMemo(() => {
    const counts = {};
    employees.forEach((employee) => {
      const key = employee.monitoring_status;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // Everything except the position filter, so the position counts
  // reflect what the other filters leave.
  const baseEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !keyword ||
        [
          employee.employee_name,
          employee.employee_number,
          employee.department_name,
          employee.position_name,
          employee.shift_name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword));

      const matchesDepartment =
        departmentFilter === "all" ||
        String(employee.department_id) === departmentFilter;

      const matchesShift =
        shiftFilter === "all" || String(employee.shift_id) === shiftFilter;

      const matchesStatus =
        statusFilter === "all" || employee.monitoring_status === statusFilter;

      return (
        matchesSearch && matchesDepartment && matchesShift && matchesStatus
      );
    });
  }, [employees, search, departmentFilter, shiftFilter, statusFilter]);

  const filteredEmployees = useMemo(
    () =>
      positionIds.length === 0
        ? baseEmployees
        : baseEmployees.filter((employee) =>
            positionIds.includes(positionKey(employee)),
          ),
    [baseEmployees, positionIds],
  );

  // Options for the position filter (counts = employees left by other filters)
  const positionOptions = useMemo(() => {
    const counts = new Map();

    baseEmployees.forEach((employee) => {
      const key = positionKey(employee);
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return buildPositionOptions(
      positionList.length ? positionList : data?.positions || [],
      employees,
      counts,
    );
  }, [positionList, data, employees, baseEmployees]);

  const positionNameById = useMemo(
    () => new Map(positionOptions.map((option) => [option.id, option.name])),
    [positionOptions],
  );

  const hasFilters =
    Boolean(search.trim()) ||
    departmentFilter !== "all" ||
    shiftFilter !== "all" ||
    statusFilter !== "all" ||
    positionIds.length > 0;

  const resetFilters = () => {
    setSearch("");
    setDepartmentFilter("all");
    setShiftFilter("all");
    setStatusFilter("all");
    setPositionIds([]);
  };

  const stats = data?.stats || {};
  const isInitialLoad = loading && !data;
  const overbreakCount = Number(stats.overbreak) || 0;

  const statCards = [
    {
      label: "Total employees",
      value: stats.total_employees,
      detail: "Active RCS - RR",
      icon: Users,
      tone: "blue",
    },
    {
      label: "Present",
      value: stats.present,
      detail: "Includes employees on break",
      icon: UserCheck,
      tone: "blue",
    },
    {
      label: "On break",
      value: stats.on_break,
      detail: "Active break sessions",
      icon: Coffee,
      tone: "blue",
    },
    {
      label: "No attendance",
      value: stats.no_attendance,
      detail: "No record for today",
      icon: UserMinus,
      tone: "gray",
    },
    {
      label: "Absent",
      value: stats.absent,
      detail: "Marked absent",
      icon: UserX,
      tone: "red",
    },
    {
      label: "Overbreak",
      value: stats.overbreak,
      detail: "Exceeded allowed time",
      icon: AlertTriangle,
      tone: "red",
    },
  ];

  // Chips: "All" + each status that has at least one employee
  const chipStatuses = Object.keys(STATUS_CONFIG).filter(
    (key) => statusCounts[key] > 0,
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        date={data?.date}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        onRefresh={() => loadMonitoring(true)}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3">
          <ShieldAlert size={19} className="mt-0.5 shrink-0 text-[#C8102E]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#8E0B20]">
              Unable to update live monitoring
            </p>
            <p className="mt-1 text-sm text-[#A80D26]">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => loadMonitoring(true)}
            className="shrink-0 text-xs font-semibold text-[#C8102E] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Attention strip: only when someone is over their break */}
      {!error && overbreakCount > 0 && (
        <button
          type="button"
          onClick={() => setStatusFilter("on_break")}
          className="flex w-full items-center gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3 text-left transition hover:bg-[#FBE0E5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]"
        >
          <AlertTriangle className="shrink-0 text-[#C8102E]" size={18} />
          <p className="flex-1 text-sm font-medium text-[#8E0B20]">
            {overbreakCount}{" "}
            {overbreakCount === 1 ? "employee is" : "employees are"} over their
            break time right now.
          </p>
          <span className="shrink-0 text-xs font-semibold text-[#C8102E]">
            Show on break
          </span>
        </button>
      )}

      {/* KPI row */}
      <section aria-label="RCS - RR overview">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#0B3A8C]">
            RCS - RR overview
          </h2>
          <span className="text-xs text-slate-500">
            Updates every 15 seconds
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {statCards.map((item) => (
            <StatCard key={item.label} {...item} loading={isInitialLoad} />
          ))}
        </div>
      </section>

      {/* Employee status */}
      <Card className="overflow-hidden">
        <div className="p-5 sm:p-6">
          <SectionHeading
            title="Employee status"
            description={`${filteredEmployees.length} of ${employees.length} employees`}
            action={
              hasFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#1D63D6] transition hover:bg-[#EAF1FD]"
                >
                  <X size={13} />
                  Clear filters
                </button>
              )
            }
          />

          {/* Status chips: one-tap filter with live counts */}
          <div
            className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1"
            role="group"
            aria-label="Filter by status"
          >
            {[
              { key: "all", label: "All", count: employees.length },
              ...chipStatuses.map((key) => ({
                key,
                label: STATUS_CONFIG[key].label,
                count: statusCounts[key],
              })),
            ].map((chip) => {
              const active = statusFilter === chip.key;

              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setStatusFilter(chip.key)}
                  aria-pressed={active}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                    active
                      ? "border-[#1D63D6] bg-[#1D63D6] text-white"
                      : "border-[#E3EAF5] bg-white text-slate-600 hover:border-[#1D63D6] hover:text-[#1D63D6]"
                  }`}
                >
                  {chip.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-[#F4F8FE] text-slate-500"
                    }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee..."
                aria-label="Search employee"
                className="w-full rounded-xl border border-[#E3EAF5] bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-2 focus:ring-[#1D63D6]/15"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              aria-label="Filter by department"
              className={selectClass}
            >
              <option value="all">All departments</option>
              {(data?.departments || []).map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name}
                </option>
              ))}
            </select>

            <PositionFilter
              options={positionOptions}
              selected={positionIds}
              onChange={setPositionIds}
              loading={isInitialLoad}
              align="left"
              className="w-full"
            />

            <select
              value={shiftFilter}
              onChange={(event) => setShiftFilter(event.target.value)}
              aria-label="Filter by shift"
              className={selectClass}
            >
              <option value="all">All shifts</option>
              {(data?.shifts || []).map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          {/* Selected position chips */}
          {positionIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">
                Position:
              </span>

              {positionIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE0FA] bg-[#EAF1FD] py-1 pl-3 pr-1.5 text-xs font-semibold text-[#0B3A8C]"
                >
                  {positionNameById.get(id) || "Position"}
                  <button
                    type="button"
                    onClick={() =>
                      setPositionIds((current) =>
                        current.filter((item) => item !== id),
                      )
                    }
                    aria-label={`Remove ${positionNameById.get(id) || "position"} filter`}
                    className="rounded-full p-0.5 text-[#1D63D6] transition hover:bg-white"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <EmployeeTable
          employees={filteredEmployees}
          loading={isInitialLoad}
          hasFilters={hasFilters}
          onReset={resetFilters}
        />
      </Card>

      {/* Breaks (wide) + Activities (narrow) */}
      <section className="grid gap-5 xl:grid-cols-5">
        <Card className="p-5 sm:p-6 xl:col-span-3">
          <SectionHeading
            title="Active breaks"
            description="Overbreak shown first"
            action={
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <span className="rounded-full bg-[#EAF1FD] px-2.5 py-1 font-semibold text-[#1D63D6]">
                  {isInitialLoad ? "—" : stats.on_break || 0} on break
                </span>
                <span className="rounded-full bg-[#FDECEF] px-2.5 py-1 font-semibold text-[#C8102E]">
                  {isInitialLoad ? "—" : stats.overbreak || 0} overbreak
                </span>
              </div>
            }
          />

          <ActiveBreaks
            breaks={data?.active_breaks || []}
            loading={isInitialLoad}
          />
        </Card>

        <Card className="p-5 sm:p-6 xl:col-span-2">
          <SectionHeading
            title="Recent activities"
            description="Latest attendance and break events"
          />

          <RecentActivities activities={data?.recent_activities || []} />
        </Card>
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-2 border-t border-[#E3EAF5] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-3 w-1 rounded-sm bg-[#C8102E]" />
          Warehouse RCS - RR Management System
        </p>

        <p className="text-xs text-slate-500">
          All dates and times follow Asia/Manila
        </p>
      </footer>
    </div>
  );
}
