import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarOff,
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
 * Spreadsheet-style attendance sheet.
 *
 * Mouse
 *   Click a row ........ select it        Shift+click ... select a range
 *   Ctrl/Cmd+click ..... add / remove      Drag row # .... select a range
 *   Double-click the Attendance cell ..... toggle Present / Absent
 *   Click a column title (Name, Department, Position, Attendance) to sort.
 *   Click again for descending, a third time to clear the sort.
 *
 * Keyboard (click the sheet first)
 *   ↑ / ↓ ......... move       Shift+↑/↓ ... extend selection
 *   P / A / L ..... mark Present / Absent / On leave (single row: jumps to
 *                   the next row)
 *   Backspace ..... revert selected rows to their saved value
 *   Ctrl+A ........ select all visible rows
 *   Ctrl+S ........ save       Esc ........ clear selection
 *
 * Brand palette (same as Dashboard): white + blue + red, grays for neutrals.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red  #C8102E · Light red #FDECEF · Border #E3EAF5
 *
 * Position: read from `position_name` on each employee returned by
 * /attendance/management/manual-employees.
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

const getPositionName = (employee) =>
  employee?.position_name || employee?.position?.name || "";

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

const statusLabel = (status) => {
  if (status === "present") return "Present";
  if (status === "absent") return "Absent";
  if (status === "on_leave") return "On leave";
  if (status) return String(status).replaceAll("_", " ");
  return "Not recorded";
};

const isMarked = (status) =>
  status === "present" || status === "absent" || status === "on_leave";

/* Not recorded 0 · absent 1 · on leave 2 · other 3 · present 4 */
const statusRank = (status) => {
  if (!status) return 0;
  if (status === "absent") return 1;
  if (status === "on_leave") return 2;
  if (status === "present") return 4;
  return 3;
};

/* ---------- Sheet layout ---------- */

const COLUMNS = [
  { key: "no", letter: "", label: "", width: 48 },
  { key: "id", letter: "A", label: "Employee ID", width: 120 },
  { key: "name", letter: "B", label: "Employee name", width: 240 },
  { key: "dept", letter: "C", label: "Department", width: 180 },
  { key: "position", letter: "D", label: "Position", width: 180 },
  { key: "shift", letter: "E", label: "Assigned shift", width: 210 },
  { key: "status", letter: "F", label: "Attendance", width: 160 },
];

const SORTABLE = new Set(["name", "dept", "position", "status"]);
const TOTAL_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0);
const LEFT_OFFSETS = { no: 0, id: 48, name: 168 };

const CELL = "h-9 border-b border-r border-[#E3EAF5] px-3 text-sm";

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
          <div className="h-9 w-12 bg-[#F1F5FB]" />
          <div className="m-2 h-5 flex-1 rounded bg-[#EEF3FB]" />
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

function StatusCell({ status, changed }) {
  let fill = "bg-white text-slate-400";
  let text = "—";

  if (status === "present") {
    fill = "bg-[#EAF1FD] text-[#1D63D6] font-semibold";
    text = "Present";
  } else if (status === "absent") {
    fill = "bg-[#FDECEF] text-[#C8102E] font-semibold";
    text = "Absent";
  } else if (status === "on_leave") {
    fill = "bg-[#F4F8FE] text-[#3F6FC4] font-semibold";
    text = "On leave";
  } else if (status) {
    fill = "bg-[#F7FAFE] text-[#0B3A8C] font-medium capitalize";
    text = statusLabel(status);
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center px-3 ${fill}`}
    >
      {text}
      {changed && (
        <span
          aria-hidden="true"
          title="Unsaved change"
          className="pointer-events-none absolute right-0 top-0 h-0 w-0 border-l-[9px] border-t-[9px] border-l-transparent border-t-[#1D63D6]"
        />
      )}
    </div>
  );
}

/* ---------- Page ---------- */

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "on_leave", label: "On leave" },
  { key: "unrecorded", label: "Not recorded" },
  { key: "other", label: "Other" },
];

export default function AttendanceManagementPage() {
  const [workDate, setWorkDate] = useState(getManilaDate);
  const [employees, setEmployees] = useState([]);
  const [statusById, setStatusById] = useState({});
  const [originalStatuses, setOriginalStatuses] = useState({});

  const [selectedIds, setSelectedIds] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [anchorId, setAnchorId] = useState(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const today = getManilaDate();
  const gridRef = useRef(null);
  const dragging = useRef(false);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setSelectedIds([]);
    setActiveId(null);
    setAnchorId(null);

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
      if (status === "on_leave") return "on_leave";
      if (!status) return "unrecorded";
      return "other";
    },
    [statusById],
  );

  const summary = useMemo(() => {
    const counts = {
      present: 0,
      absent: 0,
      on_leave: 0,
      unrecorded: 0,
      other: 0,
    };

    employees.forEach((employee) => {
      counts[getBucket(employee)] += 1;
    });

    return { total: employees.length, ...counts };
  }, [employees, getBucket]);

  const matchedEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const fullName = getFullName(employee).toLowerCase();
      const employeeNumber = String(
        employee.employee_number || "",
      ).toLowerCase();
      const positionName = getPositionName(employee).toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        fullName.includes(normalizedSearch) ||
        employeeNumber.includes(normalizedSearch) ||
        positionName.includes(normalizedSearch);

      const matchesDepartment =
        departmentFilter === "all" ||
        employee.department_id === departmentFilter;

      const matchesStatus =
        statusFilter === "all" || getBucket(employee) === statusFilter;

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [employees, search, departmentFilter, statusFilter, getBucket]);

  /*
   * Sorted rows. Attendance sorting uses the saved value, not the live one,
   * so rows don't jump around while you are marking them.
   */
  const filteredEmployees = useMemo(() => {
    if (!sort.key) return matchedEmployees;

    const dir = sort.dir === "asc" ? 1 : -1;
    const byName = (a, b) =>
      getFullName(a).toLowerCase().localeCompare(getFullName(b).toLowerCase());

    return [...matchedEmployees].sort((a, b) => {
      if (sort.key === "name") return byName(a, b) * dir;

      if (sort.key === "dept") {
        return (
          String(a.department_name || "")
            .toLowerCase()
            .localeCompare(String(b.department_name || "").toLowerCase()) *
            dir || byName(a, b)
        );
      }

      if (sort.key === "position") {
        const aPosition = getPositionName(a).toLowerCase();
        const bPosition = getPositionName(b).toLowerCase();

        // Employees without a position always go last
        if (!aPosition && !bPosition) return byName(a, b);
        if (!aPosition) return 1;
        if (!bPosition) return -1;

        return aPosition.localeCompare(bPosition) * dir || byName(a, b);
      }

      // status
      return (
        (statusRank(originalStatuses[a.id]) -
          statusRank(originalStatuses[b.id])) *
          dir || byName(a, b)
      );
    });
  }, [matchedEmployees, sort, originalStatuses]);

  const visibleIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;
  const activeIndex = activeId ? visibleIds.indexOf(activeId) : -1;
  const activeEmployee =
    activeIndex >= 0 ? filteredEmployees[activeIndex] : null;

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
    on_leave: summary.on_leave,
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

  /* Stop drag-selecting when the mouse is released anywhere */
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };

    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

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

  /* ----- Editing ----- */

  const getTargets = () => {
    if (selectedIds.length > 0) return selectedIds;
    return activeId ? [activeId] : [];
  };

  const applyStatus = (status, advance = false) => {
    const targets = getTargets();

    if (targets.length === 0) return;

    setStatusById((current) => {
      const updated = { ...current };
      targets.forEach((id) => {
        updated[id] = status;
      });
      return updated;
    });

    setSuccess("");

    // Single row: jump to the next one, like data entry in a spreadsheet
    if (advance && targets.length === 1) {
      const nextId = visibleIds[visibleIds.indexOf(targets[0]) + 1];

      if (nextId) {
        setActiveId(nextId);
        setAnchorId(nextId);
        setSelectedIds([nextId]);
      }
    }
  };

  const revertSelection = () => {
    const targets = getTargets();

    if (targets.length === 0) return;

    setStatusById((current) => {
      const updated = { ...current };
      targets.forEach((id) => {
        updated[id] = originalStatuses[id] ?? null;
      });
      return updated;
    });
  };

  const toggleRow = (id) => {
    const current = statusById[id];

    setStatusById((all) => ({
      ...all,
      [id]: current === "present" ? "absent" : "present",
    }));
    setSuccess("");
  };

  const fillUnrecordedPresent = () => {
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
    setError("");
  };

  const saveChanges = async () => {
    if (saving || loading) return;

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

  /* ----- Navigation guards ----- */

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

  /* ----- Keyboard ----- */

  const handleKeyDown = (event) => {
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;

    if (mod && key === "s") {
      event.preventDefault();
      saveChanges();
      return;
    }

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

    if (key === "p") {
      event.preventDefault();
      applyStatus("present", true);
      return;
    }

    if (key === "a") {
      event.preventDefault();
      applyStatus("absent", true);
      return;
    }

    if (key === "l") {
      event.preventDefault();
      applyStatus("on_leave", true);
      return;
    }

    if (key === "backspace" || key === "delete") {
      event.preventDefault();
      revertSelection();
      return;
    }

    if (key === "escape") {
      clearSelection();
    }
  };

  const busy = loading || saving;
  const hasTargets = selectedCount > 0 || Boolean(activeId);

  const nameBox =
    selectedCount > 1
      ? `${selectedCount} rows`
      : activeIndex >= 0
        ? `F${activeIndex + 2}`
        : "—";

  const formulaText = activeEmployee
    ? `${getFullName(activeEmployee) || "Unnamed employee"} · ${
        activeEmployee.employee_number || "No ID"
      }${
        getPositionName(activeEmployee)
          ? ` · ${getPositionName(activeEmployee)}`
          : ""
      } — ${statusLabel(statusById[activeEmployee.id])}`
    : "Click a row, then press P for Present, A for Absent or L for On leave.";

  return (
    <div className="space-y-5 pb-6">
      {/* ===== Header ===== */}
      <header className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]">
        <div className="flex h-1.5">
          <div className="w-24 bg-[#C8102E]" />
          <div className="flex-1 bg-[#1D63D6]" />
        </div>

        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-[#1D63D6]">
              <ClipboardCheck size={16} />
              RCS - RR Management
            </div>

            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#0B3A8C]">
              Attendance Management
            </h1>

            <p className="mt-0.5 text-sm text-slate-500">
              Record daily attendance in the sheet below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

      {/* ===== Sheet ===== */}
      <section
        aria-label="Attendance sheet"
        className="flex flex-col overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_1px_2px_rgba(11,58,140,0.04)]"
        style={{ height: "calc(100vh - 15rem)", minHeight: 520 }}
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
              placeholder="Search name, ID or position..."
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
            aria-label="Filter by status"
            className="flex gap-1.5 overflow-x-auto lg:flex-1"
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
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
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

          <button
            type="button"
            onClick={fillUnrecordedPresent}
            disabled={busy || visibleUnrecorded.length === 0}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#E3EAF5] bg-white px-3 text-xs font-semibold text-[#1D63D6] transition hover:border-[#1D63D6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck size={14} />
            Fill {visibleUnrecorded.length || ""} unrecorded as Present
          </button>
        </div>

        {/* Formula bar */}
        <div className="flex items-center gap-3 border-b border-[#E3EAF5] bg-[#F7FAFE] px-3 py-2">
          <div className="w-20 shrink-0 rounded-md border border-[#E3EAF5] bg-white px-2 py-1 text-center text-xs font-semibold text-[#0B3A8C]">
            {nameBox}
          </div>

          <span className="font-serif text-sm italic text-slate-400">fx</span>

          <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
            {formulaText}
          </p>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => applyStatus("present", true)}
              disabled={busy || !hasTargets}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D63D6] px-3 text-xs font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={13} />
              Present
              <span className="hidden lg:inline">
                <Kbd>P</Kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={() => applyStatus("absent", true)}
              disabled={busy || !hasTargets}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#C8102E] px-3 text-xs font-semibold text-white transition hover:bg-[#A80D26] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={13} />
              Absent
              <span className="hidden lg:inline">
                <Kbd>A</Kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={() => applyStatus("on_leave", true)}
              disabled={busy || !hasTargets}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#3F6FC4] px-3 text-xs font-semibold text-white transition hover:bg-[#0B3A8C] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarOff size={13} />
              Leave
              <span className="hidden lg:inline">
                <Kbd>L</Kbd>
              </span>
            </button>

            <button
              type="button"
              onClick={revertSelection}
              disabled={busy || !hasTargets}
              aria-label="Revert selected rows"
              title="Revert to saved (Backspace)"
              className="inline-flex h-8 items-center justify-center rounded-lg border border-[#E3EAF5] bg-white px-2.5 text-slate-500 transition hover:border-[#1D63D6] hover:text-[#1D63D6] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          aria-label="Attendance grid. Use arrow keys to move, P for present, A for absent, L for on leave."
          className="relative min-h-0 flex-1 select-none overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1D63D6]/40"
        >
          {loading ? (
            <SheetSkeleton />
          ) : filteredEmployees.length === 0 ? (
            <EmptyState hasEmployees={employees.length > 0} />
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
                      className={`sticky top-0 h-6 border-b border-r border-[#E3EAF5] bg-[#F1F5FB] text-center text-[11px] font-medium text-slate-400 ${
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
                        className={`sticky h-9 border-b-2 border-r border-b-[#CFE0FA] border-r-[#E3EAF5] bg-[#F7FAFE] px-3 text-left text-xs font-semibold text-slate-600 ${
                          LEFT_OFFSETS[column.key] !== undefined
                            ? "z-30"
                            : "z-20"
                        } ${
                          sortable ? "cursor-pointer hover:bg-[#EAF1FD]" : ""
                        } ${column.key === "status" ? "text-center" : ""}`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 ${
                            column.key === "status" ? "justify-center" : ""
                          }`}
                        >
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
                {filteredEmployees.map((employee, index) => {
                  const selected = selectedSet.has(employee.id);
                  const active = activeId === employee.id;
                  const status = statusById[employee.id];
                  const position = getPositionName(employee);
                  const changed =
                    isMarked(status) &&
                    status !== originalStatuses[employee.id];

                  const rowBg = selected
                    ? "bg-[#EAF1FD]"
                    : "bg-white group-hover:bg-[#F7FAFE]";

                  let gutter = "bg-[#F1F5FB] text-slate-500";
                  if (active) gutter = "bg-[#1D63D6] text-white";
                  else if (selected) gutter = "bg-[#CFE0FA] text-[#0B3A8C]";

                  return (
                    <tr
                      key={employee.id}
                      data-row={employee.id}
                      onMouseDown={(event) => {
                        if (event.button !== 0) return;
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
                        className={`${CELL} sticky z-10 cursor-pointer text-center text-xs font-medium ${gutter}`}
                      >
                        {index + 1}
                      </td>

                      <td
                        style={{ left: LEFT_OFFSETS.id }}
                        className={`${CELL} sticky z-10 truncate text-slate-600 ${rowBg}`}
                      >
                        {employee.employee_number || "—"}
                      </td>

                      <td
                        style={{ left: LEFT_OFFSETS.name }}
                        className={`${CELL} sticky z-10 truncate font-semibold text-[#0B3A8C] ${rowBg}`}
                      >
                        {getFullName(employee) || "Unnamed employee"}
                      </td>

                      <td
                        className={`${CELL} truncate text-slate-600 ${rowBg}`}
                      >
                        {employee.department_name || "Unassigned"}
                      </td>

                      <td
                        title={position || undefined}
                        className={`${CELL} truncate text-slate-600 ${rowBg}`}
                      >
                        {position || <span className="text-slate-300">—</span>}
                      </td>

                      <td
                        className={`${CELL} truncate text-slate-600 ${rowBg}`}
                      >
                        {formatShift(employee)}
                      </td>

                      <td
                        onDoubleClick={() => toggleRow(employee.id)}
                        title="Double-click to toggle Present / Absent"
                        className={`${CELL} relative cursor-cell p-0 ${
                          active
                            ? "outline outline-2 -outline-offset-2 outline-[#1D63D6]"
                            : ""
                        }`}
                      >
                        <StatusCell status={status} changed={changed} />
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
            Attendance · {workDate}
          </span>
        </div>

        {/* Status bar */}
        <div className="flex flex-col gap-3 border-t border-[#E3EAF5] bg-[#F7FAFE] px-4 py-2.5 text-xs text-slate-600 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-[#0B3A8C]">
              {saving ? "Saving..." : loading ? "Loading..." : "Ready"}
            </span>
            <span>
              Rows: <b className="text-slate-800">{filteredEmployees.length}</b>
            </span>
            <span>
              Present: <b className="text-[#1D63D6]">{summary.present}</b>
            </span>
            <span>
              Absent: <b className="text-[#C8102E]">{summary.absent}</b>
            </span>
            <span>
              On leave: <b className="text-[#3F6FC4]">{summary.on_leave}</b>
            </span>
            <span>
              Not recorded:{" "}
              <b className="text-slate-800">{summary.unrecorded}</b>
            </span>
            <span>
              Recorded: <b className="text-slate-800">{recordedPct}%</b>
            </span>
            {selectedCount > 0 && (
              <span>
                Selected: <b className="text-[#1D63D6]">{selectedCount}</b>
              </span>
            )}
            <span className="hidden items-center gap-1.5 xl:inline-flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> move · <Kbd>P</Kbd> / <Kbd>A</Kbd> / <Kbd>L</Kbd>{" "}
              mark · <Kbd>Shift</Kbd> range · <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> save
            </span>
          </div>

          <div className="flex items-center gap-2">
            <p className="mr-1 flex items-center gap-1.5">
              {hasUnsaved ? (
                <>
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#C8102E]" />
                  <b className="text-[#0B3A8C]">{changedEntries.length}</b>{" "}
                  unsaved
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} className="text-[#1D63D6]" />
                  All saved
                </>
              )}
            </p>

            <button
              type="button"
              onClick={discardChanges}
              disabled={!hasUnsaved || busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E3EAF5] bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-[#C8102E] hover:text-[#C8102E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={13} />
              Discard
            </button>

            <button
              type="button"
              onClick={saveChanges}
              disabled={!hasUnsaved || busy}
              title="Save (Ctrl+S)"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D63D6] px-4 text-xs font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} />
              {saving
                ? "Saving..."
                : `Save changes${hasUnsaved ? ` (${changedEntries.length})` : ""}`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
