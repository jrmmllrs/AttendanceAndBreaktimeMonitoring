import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Coffee,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Users,
  UserCheck,
  UserMinus,
  UserX,
  Zap,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";

const REFRESH_INTERVAL = 30000;
const TIME_ZONE = "Asia/Manila";

function getToday() {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
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

function formatDuration(minutes = 0) {
  const value = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(value / 60);
  const remainingMinutes = value % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${remainingMinutes}m`;
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

function getActivityColor(type) {
  if (type === "clock_in") {
    return "bg-emerald-50 text-emerald-600";
  }

  if (type === "clock_out") {
    return "bg-slate-100 text-slate-600";
  }

  if (type === "break_start") {
    return "bg-amber-50 text-amber-600";
  }

  if (type === "break_end") {
    return "bg-teal-50 text-teal-600";
  }

  return "bg-slate-100 text-slate-600";
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  color = "teal",
  loading,
}) {
  const colors = {
    teal: "bg-teal-50 text-teal-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    slate: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>

          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {loading ? "—" : (value ?? 0).toLocaleString()}
            </p>
          </div>

          <p className="mt-2 text-xs text-slate-400">{detail}</p>
        </div>

        <div
          className={`shrink-0 rounded-xl p-3 ${colors[color] || colors.teal}`}
        >
          <Icon size={20} strokeWidth={1.9} />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, description, icon: Icon, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Icon size={18} />
          </div>
        )}

        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-slate-400">{description}</p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex min-h-[190px] flex-col items-center justify-center px-5 text-center">
      <div className="mb-3 rounded-2xl bg-slate-50 p-4 text-slate-400">
        <Icon size={25} strokeWidth={1.7} />
      </div>

      <p className="text-sm font-medium text-slate-700">{title}</p>

      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function AttendanceBreakdown({ attendance, loading }) {
  const items = [
    {
      label: "Present",
      value: attendance?.present || 0,
      color: "bg-emerald-500",
      text: "text-emerald-700",
    },
    {
      label: "Late",
      value: attendance?.late || 0,
      color: "bg-amber-500",
      text: "text-amber-700",
    },
    {
      label: "Absent",
      value: attendance?.absent || 0,
      color: "bg-rose-500",
      text: "text-rose-700",
    },
    {
      label: "On Leave",
      value: attendance?.on_leave || 0,
      color: "bg-blue-500",
      text: "text-blue-700",
    },
    {
      label: "Half Day",
      value: attendance?.half_day || 0,
      color: "bg-violet-500",
      text: "text-violet-700",
    },
    {
      label: "No Record",
      value: attendance?.no_attendance || 0,
      color: "bg-slate-400",
      text: "text-slate-600",
    },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="mt-6 space-y-5">
      {items.map((item) => {
        const percentage = total > 0 ? (item.value / total) * 100 : 0;

        return (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">
                {item.label}
              </span>

              <span className={`text-sm font-semibold ${item.text}`}>
                {loading ? "—" : item.value}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DepartmentSummary({ departments, loading }) {
  const maxEmployees = Math.max(
    1,
    ...(departments || []).map((item) => item.total_employees || 0),
  );

  if (loading) {
    return (
      <div className="space-y-5 pt-6">
        {[1, 2, 3].map((item) => (
          <div key={item} className="animate-pulse space-y-2">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="h-2 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (!departments?.length) {
    return (
      <EmptyState
        icon={Users}
        title="No departments available"
        description="Active department information will appear here."
      />
    );
  }

  return (
    <div className="mt-5 space-y-5">
      {departments.map((department) => {
        const percentage = (department.total_employees / maxEmployees) * 100;

        const attendanceRate =
          department.total_employees > 0
            ? Math.round(
                (department.present / department.total_employees) * 100,
              )
            : 0;

        return (
          <div key={department.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {department.name}
                </p>

                <p className="mt-0.5 text-xs text-slate-400">
                  {department.present} present · {department.absent} absent
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-slate-800">
                  {department.present}/{department.total_employees}
                </p>

                <p className="text-xs text-slate-400">
                  {attendanceRate}% present
                </p>
              </div>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-teal-500 transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>

            {department.overbreak > 0 && (
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-rose-600">
                <AlertTriangle size={12} />
                {department.overbreak} employee(s) overbreak
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BreaktimePanel({ employees, loading }) {
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

  if (!employees?.length) {
    return (
      <EmptyState
        icon={Coffee}
        title="No active breaks"
        description="Employees currently taking a break will appear here."
      />
    );
  }

  return (
    <div className="mt-5 space-y-3">
      {employees.slice(0, 5).map((employee) => {
        const overbreak = employee.current_excess_minutes > 0;

        return (
          <div
            key={employee.id}
            className={`rounded-xl border p-4 ${
              overbreak
                ? "border-rose-200 bg-rose-50/50"
                : "border-slate-100 bg-slate-50/70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {employee.employee_name}
                </p>

                <p className="mt-0.5 text-xs text-slate-500">
                  {employee.employee_number || "No employee number"}
                  {employee.department_name
                    ? ` · ${employee.department_name}`
                    : ""}
                </p>

                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                  <Coffee size={13} />
                  {employee.break_name || "Break"}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    overbreak
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {overbreak ? (
                    <>
                      <AlertTriangle size={11} />
                      OVERBREAK
                    </>
                  ) : (
                    <>
                      <Clock3 size={11} />
                      ON BREAK
                    </>
                  )}
                </span>

                {overbreak && (
                  <p className="mt-2 text-sm font-semibold text-rose-700">
                    +{formatDuration(employee.current_excess_minutes)}
                  </p>
                )}

                <p className="mt-1 text-xs text-slate-400">
                  {formatDuration(employee.elapsed_minutes)} elapsed
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {employees.length > 5 && (
        <p className="pt-1 text-center text-xs text-slate-400">
          Showing 5 of {employees.length} active breaks
        </p>
      )}
    </div>
  );
}

function RecentActivities({ activities, loading }) {
  if (loading) {
    return (
      <div className="space-y-4 pt-5">
        {[1, 2, 3].map((item) => (
          <div key={item} className="flex animate-pulse gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-32 rounded bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activities?.length) {
    return (
      <EmptyState
        icon={Activity}
        title="No recent activities"
        description="Attendance and breaktime events will appear here when recorded."
      />
    );
  }

  return (
    <div className="mt-5 divide-y divide-slate-100">
      {activities.slice(0, 8).map((activity) => {
        const Icon = getActivityIcon(activity.event_type);

        return (
          <div key={activity.id} className="flex items-center gap-3 py-3">
            <div
              className={`shrink-0 rounded-xl p-2.5 ${getActivityColor(
                activity.event_type,
              )}`}
            >
              <Icon size={17} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {activity.employee_name}
              </p>

              <p className="mt-0.5 text-xs capitalize text-slate-400">
                {getActivityLabel(activity.event_type)}
                {activity.source ? ` · ${activity.source}` : ""}
              </p>
            </div>

            <span className="shrink-0 text-xs font-medium text-slate-400">
              {formatTime(activity.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const today = useMemo(() => getToday(), []);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const response = await api.get("/dashboard/summary");
      const result = response.data?.data;

      if (!result) {
        throw new Error("Invalid dashboard response.");
      }

      setDashboard(result);
      setError("");
    } catch (err) {
      setError(getApiError(err, "Unable to load dashboard information."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard(true);
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  const stats = dashboard?.stats || {};
  const attendance = dashboard?.attendance || {};
  const breaktime = dashboard?.breaktime || {};

  const statCards = [
    {
      label: "Total Employees",
      value: stats.total_employees,
      detail: "Active workforce",
      icon: Users,
      color: "teal",
    },
    {
      label: "Present Today",
      value: stats.present,
      detail: "Present, late and half day",
      icon: UserCheck,
      color: "green",
    },
    {
      label: "Absent Today",
      value: stats.absent,
      detail: "Recorded absent",
      icon: UserX,
      color: "red",
    },
    {
      label: "No Attendance",
      value: stats.no_attendance,
      detail: "Awaiting attendance record",
      icon: Clock3,
      color: "amber",
    },
    {
      label: "Currently On Break",
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
      color: "red",
    },
  ];

  return (
    <div className="space-y-7 pb-8">
      {/* Page heading */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-xs font-semibold tracking-[0.14em] text-teal-700">
              WORKFORCE OVERVIEW
            </p>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Your warehouse workforce at a glance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <CalendarDays size={16} className="text-teal-600" />
            <span>{today}</span>
          </div>

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-rose-600" size={19} />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-rose-800">
              Unable to update dashboard
            </p>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
          </div>

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            className="shrink-0 text-xs font-semibold text-rose-700 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Statistics */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Today's Overview
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Workforce and attendance statistics
            </p>
          </div>

          <span className="text-xs text-slate-400">
            {refreshing ? "Updating..." : "Auto-refresh: 30 seconds"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {statCards.map((item) => (
            <StatCard
              key={item.label}
              item={item}
              {...item}
              loading={loading && !dashboard}
            />
          ))}
        </div>
      </section>

      {/* Attendance and department */}
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
          <SectionHeading
            title="Attendance Overview"
            description="Today's employee attendance breakdown"
            icon={UserCheck}
          />

          <AttendanceBreakdown
            attendance={attendance}
            loading={loading && !dashboard}
          />

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Rest Day</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">
                {loading && !dashboard ? "—" : attendance.rest_day || 0}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Holiday</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">
                {loading && !dashboard ? "—" : attendance.holiday || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
          <SectionHeading
            title="Department Summary"
            description="Attendance distribution by department"
            icon={Users}
          />

          <DepartmentSummary
            departments={dashboard?.departments || []}
            loading={loading && !dashboard}
          />
        </div>
      </section>

      {/* Breaktime and activities */}
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
          <SectionHeading
            title="Breaktime Monitoring"
            description="Employees currently taking breaks"
            icon={Coffee}
            action={
              <div className="flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                <AlertTriangle size={12} />
                {loading ? "—" : breaktime.overbreak || 0} Overbreak
              </div>
            }
          />

          <BreaktimePanel
            employees={breaktime.employees || []}
            loading={loading && !dashboard}
          />

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
            <div>
              <p className="text-xs text-slate-400">Active breaks</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">
                {loading && !dashboard ? "—" : breaktime.on_break || 0}
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-400">Overbreak employees</p>
              <p className="mt-1 text-xl font-semibold text-rose-600">
                {loading && !dashboard ? "—" : breaktime.overbreak || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30 sm:p-6">
          <SectionHeading
            title="Recent Activities"
            description="Latest recorded attendance and break events"
            icon={Activity}
          />

          <RecentActivities
            activities={dashboard?.recent_activities || []}
            loading={loading && !dashboard}
          />
        </div>
      </section>

      {/* Footer */}
      <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">
          Warehouse Workforce Management System
        </p>

        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Zap size={13} className="text-teal-600" />
          All dates and times follow Asia/Manila
        </p>
      </div>
    </div>
  );
}
