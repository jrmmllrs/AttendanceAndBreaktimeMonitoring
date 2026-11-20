import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Coffee,
  Filter,
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
 * Spreadsheet-style breaktime sheet.
 *
 * Mouse
 *   Click a row ........ select it        Shift+click ... select a range
 *   Ctrl/Cmd+click ..... add / remove      Drag row # .... select a range
 *   Click a column title (Name, Department, Status, Remaining) to sort.
 *
 * Keyboard (click the sheet first)
 *   ↑ / ↓ ......... move       Shift+↑/↓ ... extend selection
 *   S ............. start a break for the selection (uses the group schedule)
 *   E ............. end the break of the selected employees
 *   Ctrl+A ........ select all visible rows      Esc ... clear selection
 *
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

/* Overbreak 0 · near limit 1 · on break 2 · available 3 */
function getRank(activeBreak, info) {
  if (!activeBreak) return 3;
  if (info.isExceeded) return 0;
  if (info.isNearLimit) return 1;
  return 2;
}

/* ---------- Sheet layout ---------- */

const COLUMNS = [
  { key: "no", letter: "", label: "", width: 48 },
  { key: "id", letter: "A", label: "Employee ID", width: 110 },
  { key: "name", letter: "B", label: "Employee name", width: 230 },
  { key: "dept", letter: "C", label: "Department", width: 160 },
  { key: "status", letter: "D", label: "Status", width: 130 },
  { key: "schedule", letter: "E", label: "Break / schedule", width: 250 },
  { key: "started", letter: "F", label: "Started", width: 100 },
  { key: "elapsed", letter: "G", label: "Elapsed", width: 100 },
  { key: "allowed", letter: "H", label: "Allowed", width: 90 },
  { key: "remaining", letter: "I", label: "Remaining", width: 180 },
  { key: "action", letter: "J", label: "Action", width: 130 },
];

const SORTABLE = new Set(["name", "dept", "status", "remaining"]);
const TOTAL_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);
const LEFT_OFFSETS = { no: 0, id: 48, name: 158 };

const CELL = "h-10 border-b border-r border-[#E3EAF5] px-3 text-sm";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "available", label: "Not on break" },
  { key: "active", label: "On break" },
  { key: "exceeded", label: "Overbreak" },
];

/* ---------- Building blocks ---------- */

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

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-[#E3EAF5] bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-500">
      {children}
    </kbd>
  );
}

function SheetSkeleton() {
  return (
    <div className="animate-pulse">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
        <div key={row} className="flex border-b border-[#EEF3FB]">
          <div className="h-10 w-12 bg-[#F1F5FB]" />
          <div className="m-2 h-6 flex-1 rounded bg-[#EEF3FB]" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasRows }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center px-5 text-center">
      <div className="mb-3 rounded-2xl bg-[#EAF1FD] p-4 text-[#1D63D6]">
        <Users size={25} strokeWidth={1.7} />
      </div>
      <p className="text-sm font-medium text-slate-700">
        {hasRows ? "No employees match your filters" : "No present employees"}
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
        {hasRows
          ? "Try a different search, department or status."
          : "Employees marked present today will appear here."}
      </p>
    </div>
  );
}

function StatusCell({ activeBreak, info }) {
  let cls = "bg-white text-slate-400";
  let text = "Available";

  if (activeBreak) {
    if (info.isExceeded) {
      cls = "bg-[#C8102E] font-semibold text-white";
      text = "Overbreak";
    } else if (info.isNearLimit) {
      cls = "bg-[#FDECEF] font-semibold text-[#C8102E]";
      text = "Near limit";
    } else {
      cls = "bg-[#EAF1FD] font-semibold text-[#1D63D6]";
      text = "On break";
    }
  }

  return (
    <div className={`flex h-full w-full items-center justify-center ${cls}`}>
      {text}
    </div>
  );
}

/* Remaining time with an Excel-style "data bar" behind the text */
function RemainingCell({ info }) {
  if (!info) {
    return (
      <div className="flex h-full items-center px-3 text-slate-300">—</div>
    );
  }

  let color = "#1D63D6";
  let textClass = "text-[#1D63D6]";
  let text = `${formatDuration(info.remainingSeconds)} left`;

  if (info.isExceeded) {
    color = "#C8102E";
    textClass = "text-[#C8102E]";
    text = `+${formatDuration(info.excessSeconds)} over`;
  } else if (info.isNearLimit) {
    color = "#EE8696";
    textClass = "text-[#C8102E]";
  }

  return (
    <div className="relative flex h-full items-center overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-y-1.5 left-0 rounded-r transition-all duration-500"
        style={{
          width: `${info.progress}%`,
          backgroundColor: color,
          opacity: 0.2,
        }}
      />
      <span
        className={`relative px-3 text-sm font-semibold tabular-nums ${textClass}`}
      >
        {text}
      </span>
    </div>
  );
}

/* ---------- Page ---------- */

export default function BreaktimeMonitoringPage() {
  const [employees, setEmployees] = useState([]);
  const [activeBreaks, setActiveBreaks] = useState([]);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const [selectedIds, setSelectedIds] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [anchorId, setAnchorId] = useState(null);

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

  const gridRef = useRef(null);
  const dragging = useRef(false);
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

  /* Stop drag-selecting when the mouse is released anywhere */
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };

    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

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

  /*
   * Present employees, plus anyone with an active break who is not marked
   * present, so an overbreak is never hidden from the sheet.
   */
  const rosterEmployees = useMemo(() => {
    const known = new Set(presentEmployees.map((employee) => employee.id));
    const extra = [];

    activeBreaks.forEach((item) => {
      if (known.has(item.employee_id)) return;

      known.add(item.employee_id);
      extra.push({
        id: item.employee_id,
        first_name: item.first_name,
        middle_name: null,
        last_name: item.last_name,
        employee_number: item.employee_number,
        department_id: item.department_id,
        department_name: item.department_name,
        break_schedules: [],
        break_records: [],
        _notPresent: true,
      });
    });

    return [...presentEmployees, ...extra];
  }, [presentEmployees, activeBreaks]);

  const departments = useMemo(() => {
    const unique = new Map();

    rosterEmployees.forEach((employee) => {
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
  }, [rosterEmployees]);

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

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rosterEmployees.filter((employee) => {
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
    rosterEmployees,
    activeBreakByEmployee,
    search,
    departmentFilter,
    statusFilter,
    now,
  ]);

  const sortedEmployees = useMemo(() => {
    if (!sort.key) return filteredEmployees;

    const dir = sort.dir === "asc" ? 1 : -1;
    const copy = [...filteredEmployees];

    copy.sort((a, b) => {
      if (sort.key === "name") {
        return (
          getEmployeeName(a)
            .toLowerCase()
            .localeCompare(getEmployeeName(b).toLowerCase()) * dir
        );
      }

      if (sort.key === "dept") {
        return (
          String(a.department_name || "")
            .toLowerCase()
            .localeCompare(String(b.department_name || "").toLowerCase()) * dir
        );
      }

      const aBreak = activeBreakByEmployee.get(a.id);
      const bBreak = activeBreakByEmployee.get(b.id);
      const aInfo = getBreakInfo(aBreak, now);
      const bInfo = getBreakInfo(bBreak, now);

      if (sort.key === "status") {
        return (getRank(aBreak, aInfo) - getRank(bBreak, bInfo)) * dir;
      }

      // remaining: employees who are not on break always go last
      if (!aInfo && !bInfo) return 0;
      if (!aInfo) return 1;
      if (!bInfo) return -1;
      return (aInfo.remainingSeconds - bInfo.remainingSeconds) * dir;
    });

    return copy;
  }, [filteredEmployees, sort, activeBreakByEmployee, now]);

  const visibleIds = useMemo(
    () => sortedEmployees.map((employee) => employee.id),
    [sortedEmployees],
  );

  const onBreakCount = rosterEmployees.filter((employee) =>
    activeBreakByEmployee.has(employee.id),
  ).length;

  const exceededCount = activeBreaks.filter(
    (item) => getBreakInfo(item, now)?.isExceeded,
  ).length;

  const nearLimitCount = activeBreaks.filter(
    (item) => getBreakInfo(item, now)?.isNearLimit,
  ).length;

  const availableCount = rosterEmployees.length - onBreakCount;

  const tabCounts = {
    all: rosterEmployees.length,
    available: availableCount,
    active: Math.max(0, onBreakCount - exceededCount),
    exceeded: exceededCount,
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  const selectedEmployeeObjects = useMemo(
    () => rosterEmployees.filter((employee) => selectedSet.has(employee.id)),
    [rosterEmployees, selectedSet],
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

  const activeIndex = activeId ? visibleIds.indexOf(activeId) : -1;
  const activeEmployee = activeIndex >= 0 ? sortedEmployees[activeIndex] : null;

  /* Keep the active row visible while moving with the keyboard */
  useEffect(() => {
    if (!activeId) return;

    gridRef.current
      ?.querySelector(`[data-row="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  /* ----- Sorting ----- */

  const toggleSort = (key) => {
    if (!SORTABLE.has(key)) return;

    setSort((current) => {
      if (current.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  };

  /* ----- Selection ----- */

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const extendTo = (id) => {
    const from = visibleIds.indexOf(anchorId ?? activeId ?? id);
    const to = visibleIds.indexOf(id);

    if (to < 0) return;

    const start = Math.min(from < 0 ? to : from, to);
    const end = Math.max(from < 0 ? to : from, to);

    if (!anchorId) setAnchorId(activeId ?? id);

    setSelectedIds(visibleIds.slice(start, end + 1));
    setActiveId(id);
  };

  const selectRow = (event, id) => {
    focusGrid();

    if (event.shiftKey) {
      extendTo(id);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedIds((current) =>
        current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id],
      );
      setActiveId(id);
      setAnchorId(id);
      return;
    }

    setSelectedIds([id]);
    setActiveId(id);
    setAnchorId(id);
  };

  const handleGutterMouseDown = (event, id) => {
    event.preventDefault();
    dragging.current = true;
    selectRow(event, id);
  };

  const handleGutterEnter = (id) => {
    if (dragging.current) extendTo(id);
  };

  const moveActive = (delta, extend) => {
    if (visibleIds.length === 0) return;

    const current = activeId ? visibleIds.indexOf(activeId) : -1;
    const next = Math.min(
      visibleIds.length - 1,
      Math.max(0, current < 0 ? 0 : current + delta),
    );
    const id = visibleIds[next];

    if (extend) {
      extendTo(id);
    } else {
      setActiveId(id);
      setAnchorId(id);
      setSelectedIds([id]);
    }
  };

  const selectAllVisible = () => {
    setSelectedIds(visibleIds);

    if (!activeId && visibleIds.length) {
      setActiveId(visibleIds[0]);
      setAnchorId(visibleIds[0]);
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setAnchorId(null);
  };

  const setEmployeeSchedule = (employeeId, scheduleId) => {
    setSelectedSchedules((current) => ({
      ...current,
      [employeeId]: scheduleId,
    }));

    // Hand focus back to the sheet so the arrow keys don't change the dropdown
    requestAnimationFrame(focusGrid);
  };

  /* ----- Break actions ----- */

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
    if (bulkLoading) return;

    if (action === "break_start" && !bulkScheduleId) {
      setError("Choose a group break schedule in the formula bar first.");
      setSuccess("");
      return;
    }

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

      clearSelection();
      await loadData({ silent: true });
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, "Unable to process bulk break action."),
      );
    } finally {
      setBulkLoading(false);
    }
  };

  /* ----- Keyboard ----- */

  const handleKeyDown = (event) => {
    // Let dropdowns, inputs and buttons keep their own keyboard behavior
    if (event.target.closest?.("select,input,textarea,button,option")) return;

    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;

    if (mod && key === "a") {
      event.preventDefault();
      selectAllVisible();
      return;
    }

    if (mod || event.altKey) return;

    if (key === "arrowdown" || key === "arrowup") {
      event.preventDefault();
      moveActive(key === "arrowdown" ? 1 : -1, event.shiftKey);
      return;
    }

    if (key === "s") {
      event.preventDefault();
      handleBulkAction("break_start");
      return;
    }

    if (key === "e") {
      event.preventDefault();
      handleBulkAction("break_end");
      return;
    }

    if (key === "escape") {
      clearSelection();
    }
  };

  /* ----- Formula bar text ----- */

  const activeBreakForActive = activeEmployee
    ? activeBreakByEmployee.get(activeEmployee.id)
    : null;
  const activeInfo = getBreakInfo(activeBreakForActive, now);

  let formulaText = "Click a row, then press S to start or E to end a break.";

  if (activeEmployee) {
    const who = `${getEmployeeName(activeEmployee) || "Unnamed employee"} · ${
      activeEmployee.employee_number || "No ID"
    }`;

    if (activeInfo) {
      formulaText = `${who} — ${activeBreakForActive.break_name || "Break"} · ${formatDuration(
        activeInfo.elapsedSeconds,
      )} elapsed${
        activeInfo.isExceeded
          ? ` · overbreak ${formatDuration(activeInfo.excessSeconds)}`
          : ""
      }`;
    } else {
      formulaText = `${who} — not on break`;
    }
  }

  const nameBox =
    selectedCount > 1
      ? `${selectedCount} rows`
      : activeIndex >= 0
        ? `D${activeIndex + 2}`
        : "—";

  const initialLoad = loading;

  return (
    <div className="space-y-5 pb-6">
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

      {/* ===== Bulk results ===== */}
      {bulkResults && (
        <section className="rounded-2xl border border-[#E3EAF5] bg-white p-5 shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
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
            <ul className="mt-4 max-h-56 divide-y divide-[#EEF3FB] overflow-y-auto">
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

      {/* ===== Sheet ===== */}
      <section
        aria-label="Breaktime sheet"
        className="flex flex-col overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]"
        style={{ height: "calc(100vh - 15rem)", minHeight: 540 }}
      >
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-[#E3EAF5] p-3 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or employee number..."
              aria-label="Search employees"
              className="h-9 w-full rounded-lg border border-[#E3EAF5] pl-9 pr-8 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="relative lg:w-52">
            <Filter
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              aria-label="Filter by department"
              className="h-9 w-full appearance-none rounded-lg border border-[#E3EAF5] bg-white pl-8 pr-3 text-sm text-slate-700 outline-none focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
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
            className="flex gap-1.5 overflow-x-auto lg:flex-1"
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
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${cls}`}
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

        {/* Formula bar */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#E3EAF5] bg-[#F7FAFE] px-3 py-2">
          <div className="w-20 shrink-0 rounded-md border border-[#E3EAF5] bg-white px-2 py-1 text-center text-xs font-semibold text-[#0B3A8C]">
            {nameBox}
          </div>

          <span className="font-serif text-sm italic text-slate-400">fx</span>

          <p className="min-w-[160px] flex-1 truncate text-sm text-slate-700">
            {formulaText}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={bulkScheduleId}
              onChange={(event) => {
                setBulkScheduleId(event.target.value);
                requestAnimationFrame(focusGrid);
              }}
              disabled={bulkLoading}
              aria-label="Group break schedule"
              className="h-8 max-w-[220px] rounded-lg border border-[#E3EAF5] bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#1D63D6] focus:ring-2 focus:ring-[#EAF1FD]"
            >
              <option value="">Group schedule…</option>
              {groupSchedules.map((schedule) => (
                <option key={schedule.id} value={schedule.id}>
                  {getScheduleLabel(schedule)} · {schedule.duration_minutes} min
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
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D63D6] px-3 text-xs font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {bulkLoading ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <Play size={12} />
              )}
              Start ({eligibleStartEmployees.length})
              <span className="hidden lg:inline">
                <Kbd>S</Kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkAction("break_end")}
              disabled={bulkLoading || selectedOnBreak.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B3A8C] px-3 text-xs font-semibold text-white transition hover:bg-[#1D63D6] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Square size={11} />
              End ({selectedOnBreak.length})
              <span className="hidden lg:inline">
                <Kbd>E</Kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedCount === 0 || bulkLoading}
              aria-label="Clear selection"
              title="Clear selection (Esc)"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-[#E3EAF5] bg-white px-2.5 text-slate-500 transition hover:border-[#C8102E] hover:text-[#C8102E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Breaktime grid. Use arrow keys to move, S to start a break, E to end a break."
          className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6]/40"
        >
          {initialLoad ? (
            <SheetSkeleton />
          ) : sortedEmployees.length === 0 ? (
            <EmptyState hasRows={rosterEmployees.length > 0} />
          ) : (
            <table
              className="table-fixed border-separate border-spacing-0"
              style={{ width: TOTAL_WIDTH, minWidth: "100%" }}
            >
              <colgroup>
                {COLUMNS.map((column) => (
                  <col key={column.key} style={{ width: column.width }} />
                ))}
              </colgroup>

              <thead>
                {/* Column letters */}
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      style={
                        LEFT_OFFSETS[column.key] !== undefined
                          ? { left: LEFT_OFFSETS[column.key] }
                          : undefined
                      }
                      className={`sticky top-0 h-6 select-none border-b border-r border-[#E3EAF5] bg-[#F1F5FB] text-center text-[11px] font-medium text-slate-400 ${
                        LEFT_OFFSETS[column.key] !== undefined ? "z-30" : "z-20"
                      }`}
                    >
                      {column.letter}
                    </th>
                  ))}
                </tr>

                {/* Column names (click to sort) */}
                <tr>
                  {COLUMNS.map((column) => {
                    const sortable = SORTABLE.has(column.key);
                    const sorted = sort.key === column.key;

                    return (
                      <th
                        key={column.key}
                        onClick={() => toggleSort(column.key)}
                        aria-sort={
                          sorted
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                        style={{
                          top: 24,
                          ...(LEFT_OFFSETS[column.key] !== undefined
                            ? { left: LEFT_OFFSETS[column.key] }
                            : {}),
                        }}
                        className={`sticky h-9 select-none border-b-2 border-r border-b-[#CFE0FA] border-r-[#E3EAF5] bg-[#F7FAFE] px-3 text-left text-xs font-semibold text-slate-600 ${
                          LEFT_OFFSETS[column.key] !== undefined
                            ? "z-30"
                            : "z-20"
                        } ${
                          sortable ? "cursor-pointer hover:bg-[#EAF1FD]" : ""
                        } ${column.key === "status" ? "text-center" : ""}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {column.label}
                          {sorted &&
                            (sort.dir === "asc" ? (
                              <ArrowUp size={12} className="text-[#1D63D6]" />
                            ) : (
                              <ArrowDown size={12} className="text-[#1D63D6]" />
                            ))}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {sortedEmployees.map((employee, index) => {
                  const activeBreak = activeBreakByEmployee.get(employee.id);
                  const info = getBreakInfo(activeBreak, now);
                  const selected = selectedSet.has(employee.id);
                  const active = activeId === employee.id;
                  const busy = actionEmployeeId === employee.id;
                  const name = getEmployeeName(employee);
                  const availableSchedules = getAvailableSchedules(employee);
                  const scheduleId = selectedSchedules[employee.id] || "";

                  let rowBg = "bg-white group-hover:bg-[#F7FAFE]";
                  if (selected) rowBg = "bg-[#EAF1FD]";
                  else if (info?.isExceeded) rowBg = "bg-[#FDECEF]";

                  let gutter = "bg-[#F1F5FB] text-slate-500";
                  if (active) gutter = "bg-[#1D63D6] text-white";
                  else if (selected) gutter = "bg-[#CFE0FA] text-[#0B3A8C]";
                  else if (info?.isExceeded) gutter = "bg-[#C8102E] text-white";

                  return (
                    <tr
                      key={employee.id}
                      data-row={employee.id}
                      onMouseDown={(event) => {
                        if (event.button !== 0) return;
                        // Dropdowns and buttons in the row keep their own click
                        if (event.target.closest("select,button,option")) {
                          return;
                        }
                        selectRow(event, employee.id);
                      }}
                      className="group scroll-mt-16"
                    >
                      <td
                        style={{ left: LEFT_OFFSETS.no }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          if (event.button !== 0) return;
                          handleGutterMouseDown(event, employee.id);
                        }}
                        onMouseEnter={() => handleGutterEnter(employee.id)}
                        className={`${CELL} sticky z-10 cursor-pointer select-none text-center text-xs font-medium ${gutter}`}
                      >
                        {index + 1}
                      </td>

                      <td
                        style={{ left: LEFT_OFFSETS.id }}
                        className={`${CELL} sticky z-10 select-none truncate text-slate-600 ${rowBg}`}
                      >
                        {employee.employee_number || "—"}
                      </td>

                      <td
                        style={{ left: LEFT_OFFSETS.name }}
                        className={`${CELL} sticky z-10 select-none truncate font-semibold text-[#0B3A8C] ${rowBg}`}
                      >
                        {name || "Unnamed employee"}
                        {employee._notPresent && (
                          <span
                            title="Not marked present today"
                            className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500"
                          >
                            not present
                          </span>
                        )}
                      </td>

                      <td
                        className={`${CELL} select-none truncate text-slate-600 ${rowBg}`}
                      >
                        {employee.department_name || "—"}
                      </td>

                      <td className={`${CELL} select-none p-0`}>
                        <StatusCell activeBreak={activeBreak} info={info} />
                      </td>

                      <td className={`${CELL} p-0 ${rowBg}`}>
                        {activeBreak ? (
                          <span className="flex h-full items-center truncate px-3 font-medium text-slate-700">
                            {activeBreak.break_name || "Break"}
                          </span>
                        ) : (
                          <select
                            value={scheduleId}
                            onChange={(event) =>
                              setEmployeeSchedule(
                                employee.id,
                                event.target.value,
                              )
                            }
                            disabled={
                              availableSchedules.length === 0 ||
                              busy ||
                              bulkLoading
                            }
                            aria-label={`Break schedule for ${name}`}
                            className="h-full w-full cursor-pointer border-0 bg-transparent px-3 text-sm text-slate-700 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-[#1D63D6] disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <option value="">
                              {availableSchedules.length
                                ? "Select schedule…"
                                : "No schedule available"}
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
                        )}
                      </td>

                      <td
                        className={`${CELL} select-none tabular-nums text-slate-600 ${rowBg}`}
                      >
                        {activeBreak
                          ? formatTime(activeBreak.actual_start_at)
                          : "—"}
                      </td>

                      <td
                        className={`${CELL} select-none font-semibold tabular-nums ${rowBg} ${
                          info?.isExceeded ? "text-[#C8102E]" : "text-slate-700"
                        }`}
                      >
                        {info ? formatDuration(info.elapsedSeconds) : "—"}
                      </td>

                      <td
                        className={`${CELL} select-none tabular-nums text-slate-600 ${rowBg}`}
                      >
                        {activeBreak
                          ? `${activeBreak.allowed_duration_minutes || 0} min`
                          : "—"}
                      </td>

                      <td className={`${CELL} select-none p-0 ${rowBg}`}>
                        <RemainingCell info={info} />
                      </td>

                      <td className={`${CELL} p-0 ${rowBg}`}>
                        <div className="flex h-full items-center justify-center px-2">
                          {activeBreak ? (
                            <button
                              type="button"
                              onClick={() => handleEndBreak(employee)}
                              disabled={busy || bulkLoading}
                              className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-[#0B3A8C] text-xs font-semibold text-white transition hover:bg-[#1D63D6] disabled:opacity-60"
                            >
                              {busy ? (
                                <LoaderCircle
                                  size={12}
                                  className="animate-spin"
                                />
                              ) : (
                                <Square size={11} />
                              )}
                              End break
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartBreak(employee)}
                              disabled={busy || bulkLoading || !scheduleId}
                              className="inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-[#1D63D6] text-xs font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                            >
                              {busy ? (
                                <LoaderCircle
                                  size={12}
                                  className="animate-spin"
                                />
                              ) : (
                                <Play size={11} />
                              )}
                              Start
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sheet tab */}
        <div className="flex items-end border-t border-[#E3EAF5] bg-[#F1F5FB] px-3 pt-1">
          <span className="rounded-t-md border border-b-0 border-t-2 border-[#E3EAF5] border-t-[#1D63D6] bg-white px-4 py-1 text-xs font-semibold text-[#0B3A8C]">
            Breaktime · {workDate}
          </span>
        </div>

        {/* Status bar */}
        <div className="flex flex-col gap-2 border-t border-[#E3EAF5] bg-[#F7FAFE] px-4 py-2.5 text-xs text-slate-600 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-[#0B3A8C]">
              {bulkLoading
                ? "Working..."
                : refreshing
                  ? "Updating..."
                  : initialLoad
                    ? "Loading..."
                    : "Ready"}
            </span>
            <span>
              Rows: <b className="text-slate-800">{sortedEmployees.length}</b>
            </span>
            <span>
              Present:{" "}
              <b className="text-slate-800">{presentEmployees.length}</b>
            </span>
            <span>
              On break: <b className="text-[#1D63D6]">{onBreakCount}</b>
            </span>
            <span>
              Near limit: <b className="text-[#C8102E]">{nearLimitCount}</b>
            </span>
            <span>
              Overbreak: <b className="text-[#C8102E]">{exceededCount}</b>
            </span>
            {selectedCount > 0 && (
              <span>
                Selected: <b className="text-[#1D63D6]">{selectedCount}</b>
              </span>
            )}
          </div>

          <span className="hidden items-center gap-1.5 xl:inline-flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move · <Kbd>S</Kbd> start · <Kbd>E</Kbd> end ·{" "}
            <Kbd>Shift</Kbd> range · click a title to sort
          </span>
        </div>
      </section>
    </div>
  );
}
