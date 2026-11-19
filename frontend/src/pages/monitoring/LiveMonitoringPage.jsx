import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Coffee,
  Clock3,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  UserCheck,
  UserMinus,
  UserX,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";

const REFRESH_INTERVAL = 15000;

function formatTime(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
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
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

const STATUS_CONFIG = {
  present: {
    label: "Present",
    className: "bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  late: {
    label: "Late",
    className: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  absent: {
    label: "Absent",
    className: "bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
  no_attendance: {
    label: "No Attendance",
    className: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
  },
  on_leave: {
    label: "On Leave",
    className: "bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
  },
  rest_day: {
    label: "Rest Day",
    className: "bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
  },
  holiday: {
    label: "Holiday",
    className: "bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
  },
  half_day: {
    label: "Half Day",
    className: "bg-orange-50 text-orange-700",
    dot: "bg-orange-500",
  },
  incomplete: {
    label: "Incomplete",
    className: "bg-yellow-50 text-yellow-700",
    dot: "bg-yellow-500",
  },
  on_break: {
    label: "On Break",
    className: "bg-cyan-50 text-cyan-700",
    dot: "bg-cyan-500",
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

function StatCard({ label, value, detail, icon: Icon, color }) {
  const colors = {
    teal: "bg-teal-50 text-teal-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {Number(value || 0).toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-slate-400">{detail}</p>
        </div>

        <div className={`rounded-xl p-3 ${colors[color] || colors.teal}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, right }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
          <Icon size={18} />
        </div>

        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{description}</p>
        </div>
      </div>

      {right}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-slate-400">
        <CircleHelp size={23} />
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function ActivityLabel({ type }) {
  const labels = {
    clock_in: "Clocked in",
    clock_out: "Clocked out",
    break_start: "Started a break",
    break_end: "Ended a break",
  };

  return labels[type] || String(type || "Activity").replaceAll("_", " ");
}

function EmployeeTable({ employees, loading }) {
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-14 animate-pulse rounded-xl bg-slate-50"
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
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50/70">
            {[
              "Employee",
              "Department",
              "Assigned Shift",
              "Attendance",
              "Current Activity",
              "Time In",
              "Break Duration",
            ].map((heading) => (
              <th
                key={heading}
                className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {employees.map((employee) => (
            <tr key={employee.id} className="transition hover:bg-slate-50/70">
              <td className="px-5 py-4">
                <p className="whitespace-nowrap text-sm font-semibold text-slate-800">
                  {employee.employee_name}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {employee.employee_number || "No employee number"}
                </p>
              </td>

              <td className="px-5 py-4 text-sm text-slate-600">
                {employee.department_name}
              </td>

              <td className="px-5 py-4">
                <p className="whitespace-nowrap text-sm font-medium text-slate-700">
                  {employee.shift_name}
                </p>
                {employee.shift_start_time && (
                  <p className="mt-0.5 whitespace-nowrap text-xs text-slate-400">
                    {employee.shift_start_time.slice(0, 5)} –{" "}
                    {employee.shift_end_time?.slice(0, 5)}
                    {employee.is_overnight ? " · Overnight" : ""}
                  </p>
                )}
              </td>

              <td className="px-5 py-4">
                <StatusBadge status={employee.monitoring_status} />
              </td>

              <td className="px-5 py-4">
                <p className="max-w-[190px] truncate text-sm capitalize text-slate-600">
                  {employee.current_activity}
                </p>
                {employee.break?.is_overbreak && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">
                    Overbreak · {formatDuration(employee.break.excess_minutes)}
                  </p>
                )}
              </td>

              <td className="px-5 py-4 text-sm tabular-nums text-slate-600">
                {formatTime(employee.clock_in_at)}
              </td>

              <td className="px-5 py-4 text-sm tabular-nums text-slate-600">
                {employee.break
                  ? formatDuration(employee.break.elapsed_minutes)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActiveBreaks({ breaks, loading }) {
  if (loading) {
    return (
      <div className="space-y-3 pt-5">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-20 animate-pulse rounded-xl bg-slate-50"
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

  return (
    <div className="mt-5 space-y-3">
      {breaks.map((item) => (
        <div
          key={item.id}
          className={`rounded-xl border p-4 ${
            item.is_overbreak
              ? "border-rose-200 bg-rose-50/50"
              : "border-slate-100 bg-slate-50/70"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {item.employee_name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {item.employee_number} · {item.department_name}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {item.name || "Break"} · {item.shift_name}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  item.is_overbreak
                    ? "bg-rose-100 text-rose-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {item.is_overbreak ? "OVERBREAK" : "ON BREAK"}
              </span>

              <p
                className={`mt-2 text-sm font-semibold tabular-nums ${
                  item.is_overbreak ? "text-rose-700" : "text-slate-800"
                }`}
              >
                {formatDuration(item.elapsed_minutes)}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Allowed: {formatDuration(item.allowed_duration_minutes)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecentActivities({ activities }) {
  if (!activities.length) {
    return (
      <EmptyState
        title="No recent activities"
        description="Recorded attendance and break events will appear here."
      />
    );
  }

  return (
    <div className="mt-4 divide-y divide-slate-100">
      {activities.slice(0, 8).map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3">
          <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
            <Activity size={17} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">
              {item.employee_name}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              <ActivityLabel type={item.event_type} />
              {item.source ? ` · ${item.source}` : ""}
            </p>
          </div>

          <span className="shrink-0 text-xs text-slate-400">
            {formatTime(item.created_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function LiveMonitoringPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

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

  const employees = data?.employees || [];

  const filteredEmployees = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !keyword ||
        [
          employee.employee_name,
          employee.employee_number,
          employee.department_name,
          employee.shift_name,
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword));

      const matchesDepartment =
        departmentFilter === "all" ||
        employee.department_id === departmentFilter;

      const matchesShift =
        shiftFilter === "all" || employee.shift_id === shiftFilter;

      const matchesStatus =
        statusFilter === "all" || employee.monitoring_status === statusFilter;

      return (
        matchesSearch && matchesDepartment && matchesShift && matchesStatus
      );
    });
  }, [employees, search, departmentFilter, shiftFilter, statusFilter]);

  const stats = data?.stats || {};

  const statCards = [
    {
      label: "Total Employees",
      value: stats.total_employees,
      detail: "Active workforce",
      icon: Users,
      color: "teal",
    },
    {
      label: "Present",
      value: stats.present,
      detail: "Includes employees on break",
      icon: UserCheck,
      color: "green",
    },
    {
      label: "Absent",
      value: stats.absent,
      detail: "Marked absent",
      icon: UserX,
      color: "red",
    },
    {
      label: "No Attendance",
      value: stats.no_attendance,
      detail: "No record for today",
      icon: UserMinus,
      color: "slate",
    },
    {
      label: "On Break",
      value: stats.on_break,
      detail: "Active break sessions",
      icon: Coffee,
      color: "blue",
    },
    {
      label: "Overbreak",
      value: stats.overbreak,
      detail: "Exceeded allowed duration",
      icon: AlertTriangle,
      color: "amber",
    },
  ];

  return (
    <div className="space-y-7 pb-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <p className="text-xs font-semibold tracking-[0.14em] text-teal-700">
              LIVE WORKFORCE STATUS
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Live Monitoring
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Monitor employee attendance and break activities across the
            warehouse.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <CalendarDays size={16} className="text-teal-600" />
            {formatDate(data?.date)}
          </div>

          <button
            type="button"
            onClick={() => loadMonitoring(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <ShieldAlert size={19} className="mt-0.5 shrink-0 text-rose-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-800">
              Unable to update live monitoring
            </p>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => loadMonitoring(true)}
            className="text-xs font-semibold text-rose-700 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Workforce Overview
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Current attendance and break status
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Auto-refresh every 15 seconds
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {statCards.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/30">
        <div className="p-5 sm:p-6">
          <SectionHeader
            icon={Users}
            title="Employee Status"
            description={`${filteredEmployees.length} of ${employees.length} employees`}
            right={
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 size={13} className="text-emerald-500" />
                Monitoring active
              </span>
            }
          />

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10"
              />
            </div>

            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-teal-500"
            >
              <option value="all">All departments</option>
              {(data?.departments || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              value={shiftFilter}
              onChange={(event) => setShiftFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-teal-500"
            >
              <option value="all">All shifts</option>
              {(data?.shifts || []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600 outline-none focus:border-teal-500"
            >
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <EmployeeTable
          employees={filteredEmployees}
          loading={loading && !data}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
          <SectionHeader
            icon={Coffee}
            title="Active Breaks"
            description="Employees currently taking a break"
            right={
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                {stats.overbreak || 0} overbreak
              </span>
            }
          />

          <ActiveBreaks
            breaks={data?.active_breaks || []}
            loading={loading && !data}
          />
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
          <SectionHeader
            icon={Activity}
            title="Recent Activities"
            description="Latest recorded attendance and break events"
            right={<Clock3 size={15} className="text-slate-400" />}
          />

          <RecentActivities activities={data?.recent_activities || []} />
        </div>
      </section>

      <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Warehouse Workforce Management System
        </p>
        <p className="text-xs text-slate-400">
          All dates and times follow Asia/Manila
        </p>
      </div>
    </div>
  );
}
