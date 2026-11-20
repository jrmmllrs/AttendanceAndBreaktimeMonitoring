import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Coffee,
  RefreshCw,
  ShieldAlert,
  Users,
  UserCheck,
  UserMinus,
  UserX,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const REFRESH_INTERVAL = 30000;
const TIME_ZONE = "Asia/Manila";

/**
 * BRAND CONFIG
 * Palette: white + blue + red only (grays for neutral text/borders).
 *
 *   Blue        #1D63D6  primary (Royale Cold Storage)
 *   Deep blue   #0B3A8C  headings, strong numbers
 *   Light blue  #EAF1FD / #F7FAFE  chips and soft surfaces
 *   Red         #C8102E  alerts, absent, overbreak (Red Ribbon)
 *   Light red   #FDECEF  alert surfaces
 *   Border      #E3EAF5  all card borders
 */
const BRAND = {
  systemName: "Warehouse RCS - RR Management",
  rcsLogo:
    "https://royalecoldstorage.com.ph/wp-content/uploads/2024/07/royal-cold-storage-logo-2022.webp",
  redRibbonLogo:
    "https://upload.wikimedia.org/wikipedia/en/5/58/Red_Ribbon_Bakeshop_Logo.webp",
};

/* ---------- Helpers ---------- */

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

  return hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;
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

/* ---------- Shared building blocks ---------- */

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border border-[#E3EAF5] bg-white p-5 shadow-[0_1px_2px_rgba(11,58,140,0.04)] sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
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

/* ---------- Header ---------- */

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat("en-PH", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  return <span className="tabular-nums">{time}</span>;
}

function LogoPlate({ src, alt }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-10 w-auto max-w-[130px] object-contain sm:h-12 sm:max-w-[160px]"
    />
  );
}

function Header({ today, refreshing, onRefresh }) {
  return (
    <header className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
      {/* Ribbon accent: red tab + blue line */}
      <div className="flex h-1.5">
        <div className="w-24 bg-[#C8102E]" />
        <div className="flex-1 bg-[#1D63D6]" />
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-4">
            <LogoPlate src={BRAND.rcsLogo} alt="Royale Cold Storage" />
            <span className="h-8 w-px bg-[#E3EAF5]" />
            <LogoPlate src={BRAND.redRibbonLogo} alt="Red Ribbon" />
          </div>

          <div className="sm:border-l sm:border-[#E3EAF5] sm:pl-6">
            <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A8C]">
              Dashboard
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">{BRAND.systemName}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] px-3.5 py-2">
            <CalendarDays size={18} className="text-[#1D63D6]" />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-[#0B3A8C]">
                <LiveClock />
              </p>
              <p className="text-xs text-slate-500">{today}</p>
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

/* ---------- Attendance rate (donut) ---------- */

function AttendanceRing({ stats, loading }) {
  const total = Number(stats.total_employees) || 0;
  const present = Number(stats.present) || 0;
  const absent = Number(stats.absent) || 0;
  const noRecord = Number(stats.no_attendance) || 0;

  const rate =
    total > 0 ? Math.min(100, Math.round((present / total) * 100)) : 0;

  const size = 176;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - rate / 100);

  return (
    <Card className="flex flex-col">
      <SectionHeading
        title="Attendance rate"
        description="Present, late and half day vs total RCS - RR"
      />

      <div className="flex flex-1 items-center justify-center py-6">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="img"
            aria-label={`Attendance rate ${rate} percent`}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#EEF3FB"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#1D63D6"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={loading ? circumference : offset}
              className="transition-all duration-700"
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-4xl font-semibold tracking-tight text-[#0B3A8C]">
              {loading ? "—" : `${rate}%`}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {loading ? "" : `${present} of ${total}`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-[#EEF3FB] border-t border-[#EEF3FB] pt-4 text-center">
        <div>
          <p className="text-lg font-semibold text-[#1D63D6]">
            {loading ? "—" : present}
          </p>
          <p className="text-xs text-slate-500">Present</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-[#C8102E]">
            {loading ? "—" : absent}
          </p>
          <p className="text-xs text-slate-500">Absent</p>
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-500">
            {loading ? "—" : noRecord}
          </p>
          <p className="text-xs text-slate-500">No record</p>
        </div>
      </div>
    </Card>
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
  };

  const t = tones[tone] || tones.blue;

  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>

        <div className={`shrink-0 rounded-lg p-2 ${t.chip}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>

      <p className={`mt-3 text-3xl font-semibold tracking-tight ${t.value}`}>
        {loading ? "—" : (value ?? 0).toLocaleString()}
      </p>

      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </Card>
  );
}

/* ---------- Quick links ---------- */

const QUICK_LINKS = [
  {
    label: "Live monitoring",
    description: "Watch the floor in real time",
    path: "/monitoring",
    icon: Activity,
    roles: ["admin", "hr", "supervisor"],
  },
  {
    label: "Attendance records",
    description: "Review and correct time logs",
    path: "/attendance",
    icon: Clock3,
    roles: ["admin", "hr", "supervisor"],
  },
  {
    label: "Breaktime monitoring",
    description: "Track breaks and overbreaks",
    path: "/breaks",
    icon: ClipboardList,
    roles: ["admin", "hr", "supervisor"],
  },
  {
    label: "Employees",
    description: "Manage the RCS - RR list",
    path: "/employees",
    icon: Users,
    roles: ["admin", "hr"],
  },
];

function QuickLinks({ role }) {
  const links = QUICK_LINKS.filter((item) => item.roles.includes(role));

  if (links.length === 0) return null;

  return (
    <section
      aria-label="Quick links"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {links.map((item) => {
        const Icon = item.icon;

        return (
          <Link
            key={item.path}
            to={item.path}
            className="group flex items-center gap-3 rounded-2xl border border-[#E3EAF5] bg-white p-4 shadow-[0_1px_2px_rgba(11,58,140,0.04)] transition hover:border-[#1D63D6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6]"
          >
            <div className="rounded-xl bg-[#EAF1FD] p-2.5 text-[#1D63D6] transition group-hover:bg-[#1D63D6] group-hover:text-white">
              <Icon size={18} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                {item.label}
              </p>
              <p className="truncate text-xs text-slate-500">
                {item.description}
              </p>
            </div>

            <ArrowRight
              size={16}
              className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#C8102E]"
            />
          </Link>
        );
      })}
    </section>
  );
}

/* ---------- Attendance breakdown ---------- */

function AttendanceBreakdown({ attendance, loading }) {
  // Blue = attending, red = not attending, gray = unknown.
  const items = [
    { label: "Present", value: attendance?.present || 0, color: "#1D63D6" },
    { label: "Half day", value: attendance?.half_day || 0, color: "#6C9BEA" },
    { label: "On leave", value: attendance?.on_leave || 0, color: "#B9CFF4" },
    { label: "Late", value: attendance?.late || 0, color: "#EE8696" },
    { label: "Absent", value: attendance?.absent || 0, color: "#C8102E" },
    {
      label: "No record",
      value: attendance?.no_attendance || 0,
      color: "#CBD5E1",
    },
  ];

  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="mt-6">
      <div className="flex h-3 overflow-hidden rounded-full bg-[#EEF3FB]">
        {total > 0 &&
          items.map((item) => (
            <div
              key={item.label}
              className="h-full transition-all duration-500"
              style={{
                width: `${(item.value / total) * 100}%`,
                backgroundColor: item.color,
              }}
              title={`${item.label}: ${item.value}`}
            />
          ))}
      </div>

      <ul className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((item) => {
          const percentage =
            total > 0 ? Math.round((item.value / total) * 100) : 0;

          return (
            <li
              key={item.label}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2.5 text-sm text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>

              <span className="text-sm">
                <span className="font-semibold text-[#0B3A8C]">
                  {loading ? "—" : item.value}
                </span>
                <span className="ml-1.5 text-xs text-slate-400">
                  {loading ? "" : `${percentage}%`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#EEF3FB] pt-5">
        <div className="rounded-xl bg-[#F7FAFE] p-3">
          <p className="text-xs text-slate-500">Rest day</p>
          <p className="mt-1 text-xl font-semibold text-[#0B3A8C]">
            {loading ? "—" : attendance?.rest_day || 0}
          </p>
        </div>

        <div className="rounded-xl bg-[#F7FAFE] p-3">
          <p className="text-xs text-slate-500">Holiday</p>
          <p className="mt-1 text-xl font-semibold text-[#0B3A8C]">
            {loading ? "—" : attendance?.holiday || 0}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Departments (table layout) ---------- */

const DEPT_GRID =
  "md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,0.55fr))_minmax(0,1.3fr)]";

function DepartmentSummary({ departments, loading }) {
  if (loading) {
    return (
      <div className="space-y-4 pt-6">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-12 animate-pulse rounded-xl bg-[#F4F8FE]"
          />
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
    <div className="mt-5">
      {/* Column titles (desktop only) */}
      <div
        className={`hidden gap-4 border-b border-[#EEF3FB] pb-2 text-xs font-medium text-slate-500 md:grid ${DEPT_GRID}`}
      >
        <span>Department</span>
        <span className="text-right">Total</span>
        <span className="text-right">Present</span>
        <span className="text-right">Absent</span>
        <span>Attendance rate</span>
      </div>

      <ul className="divide-y divide-[#EEF3FB]">
        {departments.map((department) => {
          const rate =
            department.total_employees > 0
              ? Math.round(
                  (department.present / department.total_employees) * 100,
                )
              : 0;

          return (
            <li
              key={department.id}
              className={`grid grid-cols-3 gap-x-4 gap-y-2 py-3.5 md:items-center ${DEPT_GRID}`}
            >
              <div className="col-span-3 min-w-0 md:col-span-1">
                <p className="truncate text-sm font-semibold text-[#0B3A8C]">
                  {department.name}
                </p>

                {department.overbreak > 0 && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-[#C8102E]">
                    <AlertTriangle size={11} />
                    {department.overbreak} overbreak
                  </p>
                )}
              </div>

              <div className="md:text-right">
                <p className="text-xs text-slate-500 md:hidden">Total</p>
                <p className="text-sm font-medium text-slate-700">
                  {department.total_employees}
                </p>
              </div>

              <div className="md:text-right">
                <p className="text-xs text-slate-500 md:hidden">Present</p>
                <p className="text-sm font-semibold text-[#1D63D6]">
                  {department.present}
                </p>
              </div>

              <div className="md:text-right">
                <p className="text-xs text-slate-500 md:hidden">Absent</p>
                <p
                  className={`text-sm font-semibold ${
                    department.absent > 0 ? "text-[#C8102E]" : "text-slate-400"
                  }`}
                >
                  {department.absent}
                </p>
              </div>

              <div className="col-span-3 flex items-center gap-3 md:col-span-1">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF3FB]">
                  <div
                    className="h-full rounded-full bg-[#1D63D6] transition-all duration-500"
                    style={{ width: `${rate}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium text-slate-600">
                  {rate}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Breaktime ---------- */

function BreaktimePanel({ employees, loading }) {
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

  if (!employees?.length) {
    return (
      <EmptyState
        icon={Coffee}
        title="No active breaks"
        description="Employees currently taking a break will appear here."
      />
    );
  }

  // Overbreak first, longest excess on top
  const sorted = [...employees].sort(
    (a, b) => (b.current_excess_minutes || 0) - (a.current_excess_minutes || 0),
  );

  return (
    <div className="mt-5 space-y-3">
      {sorted.slice(0, 5).map((employee) => {
        const overbreak = employee.current_excess_minutes > 0;

        return (
          <div
            key={employee.id}
            className={`flex items-start justify-between gap-3 rounded-xl border p-4 ${
              overbreak
                ? "border-[#F5C2CA] bg-[#FDECEF]"
                : "border-[#E3EAF5] bg-[#F7FAFE]"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0B3A8C]">
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
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  overbreak
                    ? "bg-[#C8102E] text-white"
                    : "bg-[#EAF1FD] text-[#1D63D6]"
                }`}
              >
                {overbreak ? <AlertTriangle size={11} /> : <Clock3 size={11} />}
                {overbreak ? "Overbreak" : "On break"}
              </span>

              {overbreak && (
                <p className="mt-2 text-sm font-semibold text-[#C8102E]">
                  +{formatDuration(employee.current_excess_minutes)}
                </p>
              )}

              <p className="mt-1 text-xs text-slate-500">
                {formatDuration(employee.elapsed_minutes)} elapsed
              </p>
            </div>
          </div>
        );
      })}

      {employees.length > 5 && (
        <p className="pt-1 text-center text-xs text-slate-500">
          Showing 5 of {employees.length} active breaks
        </p>
      )}
    </div>
  );
}

/* ---------- Activities (timeline) ---------- */

function RecentActivities({ activities, loading }) {
  if (loading) {
    return (
      <div className="space-y-4 pt-5">
        {[1, 2, 3].map((item) => (
          <div key={item} className="flex animate-pulse gap-3">
            <div className="h-9 w-9 rounded-full bg-[#EEF3FB]" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-32 rounded bg-[#EEF3FB]" />
              <div className="h-3 w-24 rounded bg-[#EEF3FB]" />
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

  const items = activities.slice(0, 8);

  return (
    <ol className="mt-5">
      {items.map((activity, index) => {
        const Icon = getActivityIcon(activity.event_type);
        const isLast = index === items.length - 1;

        return (
          <li key={activity.id} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Timeline rail */}
            {!isLast && (
              <span className="absolute left-[17px] top-9 bottom-0 w-px bg-[#E3EAF5]" />
            )}

            <div className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E3EAF5] bg-[#EAF1FD] text-[#1D63D6]">
              <Icon size={16} />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-sm font-medium text-slate-800">
                  {activity.employee_name}
                </p>
                <span className="shrink-0 text-xs text-slate-500">
                  {formatTime(activity.created_at)}
                </span>
              </div>

              <p className="mt-0.5 text-xs capitalize text-slate-500">
                {getActivityLabel(activity.event_type)}
                {activity.source ? ` · ${activity.source}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Page ---------- */

export default function DashboardPage() {
  const { user } = useAuth();

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
  const isInitialLoad = loading && !dashboard;
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
      label: "Present today",
      value: stats.present,
      detail: "Present, late and half day",
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
      detail: "Awaiting record",
      icon: Clock3,
      tone: "blue",
    },
    {
      label: "Absent today",
      value: stats.absent,
      detail: "Recorded absent",
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

  return (
    <div className="space-y-6 pb-8">
      <Header
        today={today}
        refreshing={refreshing}
        onRefresh={() => loadDashboard(true)}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3">
          <ShieldAlert className="mt-0.5 shrink-0 text-[#C8102E]" size={19} />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#8E0B20]">
              Unable to update dashboard
            </p>
            <p className="mt-1 text-sm text-[#A80D26]">{error}</p>
          </div>

          <button
            type="button"
            onClick={() => loadDashboard(true)}
            className="shrink-0 text-xs font-semibold text-[#C8102E] hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Attention strip: only appears when something needs action */}
      {!error && overbreakCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3">
          <AlertTriangle className="shrink-0 text-[#C8102E]" size={18} />
          <p className="text-sm font-medium text-[#8E0B20]">
            {overbreakCount}{" "}
            {overbreakCount === 1 ? "employee is" : "employees are"} over their
            break time right now.
          </p>
        </div>
      )}

      {/* Hero row: attendance ring + KPI grid */}
      <section
        aria-label="Today's overview"
        className="grid gap-5 xl:grid-cols-3"
      >
        <AttendanceRing stats={stats} loading={isInitialLoad} />

        <div className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#0B3A8C]">
              Today's overview
            </h2>

            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span
                className={`h-1.5 w-1.5 rounded-full bg-[#1D63D6] ${
                  refreshing ? "animate-pulse" : ""
                }`}
              />
              {refreshing ? "Updating..." : "Updates every 30 seconds"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {statCards.map((item) => (
              <StatCard key={item.label} {...item} loading={isInitialLoad} />
            ))}
          </div>
        </div>
      </section>

      <QuickLinks role={user?.role} />

      {/* Attendance breakdown (narrow) + Departments (wide) */}
      <section className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <SectionHeading
            title="Attendance breakdown"
            description="How today's RCS - RR is split"
          />

          <AttendanceBreakdown
            attendance={attendance}
            loading={isInitialLoad}
          />
        </Card>

        <Card className="xl:col-span-3">
          <SectionHeading
            title="Department summary"
            description="Headcount and attendance per department"
          />

          <DepartmentSummary
            departments={dashboard?.departments || []}
            loading={isInitialLoad}
          />
        </Card>
      </section>

      {/* Breaktime (wide) + Activities (narrow) */}
      <section className="grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <SectionHeading
            title="Breaktime monitoring"
            description="Overbreak shown first"
            action={
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <span className="rounded-full bg-[#EAF1FD] px-2.5 py-1 font-semibold text-[#1D63D6]">
                  {isInitialLoad ? "—" : breaktime.on_break || 0} on break
                </span>
                <span className="rounded-full bg-[#FDECEF] px-2.5 py-1 font-semibold text-[#C8102E]">
                  {isInitialLoad ? "—" : breaktime.overbreak || 0} overbreak
                </span>
              </div>
            }
          />

          <BreaktimePanel
            employees={breaktime.employees || []}
            loading={isInitialLoad}
          />
        </Card>

        <Card className="xl:col-span-2">
          <SectionHeading
            title="Recent activities"
            description="Latest attendance and break events"
          />

          <RecentActivities
            activities={dashboard?.recent_activities || []}
            loading={isInitialLoad}
          />
        </Card>
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-2 border-t border-[#E3EAF5] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-3 w-1 rounded-sm bg-[#C8102E]" />
          {BRAND.systemName} System
        </p>

        <p className="text-xs text-slate-500">
          All dates and times follow Asia/Manila
        </p>
      </footer>
    </div>
  );
}
