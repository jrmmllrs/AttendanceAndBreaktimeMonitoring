import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  ArrowDownUp,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coffee,
  Edit3,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { api, getApiError } from "../../lib/api";

const EMPTY_TYPE = {
  name: "",
  description: "",
  allowed_duration_minutes: 15,
  is_paid: true,
};

const EMPTY_SCHEDULE = {
  name: "",
  shift_id: "",
  break_type_id: "",
  department_id: "",
  sequence_number: 1,
  duration_minutes: 15,
  max_occurrences_per_shift: "",
};

const cx = (...classes) => classes.filter(Boolean).join(" ");

function formatTime(value) {
  if (!value) return "—";

  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(value) {
  const minutes = Number(value) || 0;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours && remaining) return `${hours}h ${remaining}m`;
  if (hours) return `${hours}h`;
  return `${remaining} min`;
}

function getShiftTime(shift) {
  if (!shift) return "Shift unavailable";

  return `${formatTime(shift.start_time)} – ${formatTime(
    shift.end_time,
  )}${shift.is_overnight ? " (+1 day)" : ""}`;
}

function StatusBadge({ active }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-500",
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-emerald-500" : "bg-slate-400",
        )}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function PaidBadge({ paid }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        paid ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700",
      )}
    >
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

function Modal({ title, description, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cx(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <X size={19} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children, required = false }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 disabled:cursor-not-allowed disabled:bg-slate-50";

function PrimaryButton({ children, loading, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-600/15 disabled:cursor-not-allowed disabled:opacity-60",
        props.className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function SecondaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50",
        props.className,
      )}
    >
      {children}
    </button>
  );
}

function SummaryCard({ icon: Icon, label, value, detail, tone = "teal" }) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className={cx("rounded-xl p-3", tones[tone])}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

export default function BreaktimePage() {
  const [activeTab, setActiveTab] = useState("schedules");
  const [breakTypes, setBreakTypes] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [references, setReferences] = useState({
    shifts: [],
    departments: [],
    breakTypes: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [typeSearch, setTypeSearch] = useState("");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [typeStatus, setTypeStatus] = useState("all");
  const [scheduleStatus, setScheduleStatus] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [typeModal, setTypeModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");

    try {
      const [typesResponse, schedulesResponse, referencesResponse] =
        await Promise.all([
          api.get("/breaktime/types"),
          api.get("/breaktime/schedules"),
          api.get("/breaktime/references"),
        ]);

      setBreakTypes(typesResponse.data?.data || []);
      setSchedules(schedulesResponse.data?.data || []);
      setReferences(
        referencesResponse.data?.data || {
          shifts: [],
          departments: [],
          breakTypes: [],
        },
      );
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeTypes = useMemo(
    () => breakTypes.filter((item) => item.is_active),
    [breakTypes],
  );

  const activeSchedules = useMemo(
    () => schedules.filter((item) => item.is_active),
    [schedules],
  );

  const filteredTypes = useMemo(() => {
    const search = typeSearch.trim().toLowerCase();

    return breakTypes.filter((item) => {
      const matchesSearch =
        !search ||
        [item.name, item.description]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        typeStatus === "all" ||
        (typeStatus === "active" && item.is_active) ||
        (typeStatus === "inactive" && !item.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [breakTypes, typeSearch, typeStatus]);

  const filteredSchedules = useMemo(() => {
    const search = scheduleSearch.trim().toLowerCase();

    return schedules.filter((item) => {
      const matchesSearch =
        !search ||
        [
          item.name,
          item.shift?.name,
          item.break_type?.name,
          item.department?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search);

      const matchesStatus =
        scheduleStatus === "all" ||
        (scheduleStatus === "active" && item.is_active) ||
        (scheduleStatus === "inactive" && !item.is_active);

      const matchesShift =
        shiftFilter === "all" || item.shift_id === shiftFilter;

      const matchesDepartment =
        departmentFilter === "all" ||
        !item.department_id ||
        item.department_id === departmentFilter;

      return (
        matchesSearch && matchesStatus && matchesShift && matchesDepartment
      );
    });
  }, [
    schedules,
    scheduleSearch,
    scheduleStatus,
    shiftFilter,
    departmentFilter,
  ]);

  const showSuccess = (message) => {
    setSuccess(message);
    window.setTimeout(() => setSuccess(""), 3500);
  };

  const refresh = () => {
    setRefreshing(true);
    loadData(false);
  };

  // ---------------------------------------------------
  // Break Type actions
  // ---------------------------------------------------

  const openCreateType = () => {
    setEditingType(null);
    setTypeForm(EMPTY_TYPE);
    setError("");
    setTypeModal(true);
  };

  const openEditType = (item) => {
    setEditingType(item);
    setTypeForm({
      name: item.name || "",
      description: item.description || "",
      allowed_duration_minutes: item.allowed_duration_minutes,
      is_paid: item.is_paid,
    });
    setError("");
    setTypeModal(true);
  };

  const saveType = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...typeForm,
        allowed_duration_minutes: Number(typeForm.allowed_duration_minutes),
      };

      if (editingType) {
        await api.patch(`/breaktime/types/${editingType.id}`, payload);
        showSuccess("Break type updated successfully.");
      } else {
        await api.post("/breaktime/types", payload);
        showSuccess("Break type created successfully.");
      }

      setTypeModal(false);
      await loadData(false);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleTypeStatus = async (item) => {
    const action = item.is_active ? "deactivate" : "activate";

    if (!window.confirm(`Are you sure you want to ${action} "${item.name}"?`)) {
      return;
    }

    setError("");

    try {
      await api.patch(`/breaktime/types/${item.id}/status`, {
        is_active: !item.is_active,
      });

      showSuccess(`Break type ${action}d successfully.`);
      await loadData(false);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  // ---------------------------------------------------
  // Break Schedule actions
  // ---------------------------------------------------

  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setScheduleForm({
      ...EMPTY_SCHEDULE,
      shift_id: references.shifts[0]?.id || "",
      break_type_id: references.breakTypes[0]?.id || "",
      duration_minutes:
        references.breakTypes[0]?.allowed_duration_minutes || 15,
    });
    setError("");
    setScheduleModal(true);
  };

  const openEditSchedule = (item) => {
    setEditingSchedule(item);
    setScheduleForm({
      name: item.name || "",
      shift_id: item.shift_id || "",
      break_type_id: item.break_type_id || "",
      department_id: item.department_id || "",
      sequence_number: item.sequence_number,
      duration_minutes: item.duration_minutes,
      max_occurrences_per_shift: item.max_occurrences_per_shift ?? "",
    });
    setError("");
    setScheduleModal(true);
  };

  const selectedShift = references.shifts.find(
    (item) => item.id === scheduleForm.shift_id,
  );

  const selectedBreakType = references.breakTypes.find(
    (item) => item.id === scheduleForm.break_type_id,
  );

  const saveSchedule = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...scheduleForm,
        department_id: scheduleForm.department_id || null,
        sequence_number: Number(scheduleForm.sequence_number),
        duration_minutes: Number(scheduleForm.duration_minutes),
        max_occurrences_per_shift:
          scheduleForm.max_occurrences_per_shift === ""
            ? null
            : Number(scheduleForm.max_occurrences_per_shift),
      };

      if (editingSchedule) {
        await api.patch(`/breaktime/schedules/${editingSchedule.id}`, payload);
        showSuccess("Break schedule updated successfully.");
      } else {
        await api.post("/breaktime/schedules", payload);
        showSuccess("Break schedule created successfully.");
      }

      setScheduleModal(false);
      await loadData(false);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleScheduleStatus = async (item) => {
    const action = item.is_active ? "deactivate" : "activate";

    if (!window.confirm(`Are you sure you want to ${action} "${item.name}"?`)) {
      return;
    }

    setError("");

    try {
      await api.patch(`/breaktime/schedules/${item.id}/status`, {
        is_active: !item.is_active,
      });

      showSuccess(`Break schedule ${action}d successfully.`);
      await loadData(false);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  // ---------------------------------------------------
  // Render
  // ---------------------------------------------------

  return (
    <div className="min-h-full space-y-6 bg-slate-50/70 p-4 sm:p-6 lg:p-8">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
            <Settings2 size={15} />
            Workforce Management
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Breaktime Management
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
            Configure flexible break rules. Employees can start their breaks at
            different times while they are on duty.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SecondaryButton onClick={refresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </SecondaryButton>

          <PrimaryButton
            onClick={
              activeTab === "types" ? openCreateType : openCreateSchedule
            }
          >
            <Plus size={17} />
            {activeTab === "types" ? "Add break type" : "Add schedule"}
          </PrimaryButton>
        </div>
      </div>

      {/* Alerts */}
      {error && !typeModal && !scheduleModal && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <X size={17} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Coffee}
          label="Break Types"
          value={breakTypes.length}
          detail="Configured break categories"
          tone="teal"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Active Break Types"
          value={activeTypes.length}
          detail="Available for scheduling"
          tone="blue"
        />
        <SummaryCard
          icon={CalendarClock}
          label="Break Schedules"
          value={schedules.length}
          detail="Configured shift schedules"
          tone="violet"
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Active Schedules"
          value={activeSchedules.length}
          detail="Currently enabled schedules"
          tone="amber"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab("schedules")}
            className={cx(
              "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition",
              activeTab === "schedules"
                ? "text-teal-700"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <CalendarClock size={17} />
            Break Schedules
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {schedules.length}
            </span>
            {activeTab === "schedules" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-teal-600" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("types")}
            className={cx(
              "relative flex items-center gap-2 px-4 py-3 text-sm font-semibold transition",
              activeTab === "types"
                ? "text-teal-700"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            <Coffee size={17} />
            Break Types
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {breakTypes.length}
            </span>
            {activeTab === "types" && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-teal-600" />
            )}
          </button>
        </div>

        <span className="pb-2 text-xs text-slate-400">
          Changes are saved to your database
        </span>
      </div>

      {/* SCHEDULES TAB */}
      {activeTab === "schedules" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={scheduleSearch}
                  onChange={(e) => setScheduleSearch(e.target.value)}
                  placeholder="Search schedule, shift, break type..."
                  className={`${inputClass} pl-10`}
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All shifts</option>
                  {references.shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name}
                    </option>
                  ))}
                </select>

                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All departments</option>
                  {references.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>

                <select
                  value={scheduleStatus}
                  onChange={(e) => setScheduleStatus(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-bold text-slate-900">
                  Configured break schedules
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Employees may start these breaks anytime during their assigned
                  shift.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-400">
                {filteredSchedules.length} result
                {filteredSchedules.length === 1 ? "" : "s"}
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 size={19} className="animate-spin text-teal-700" />
                Loading break schedules...
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
                <div className="rounded-2xl bg-teal-50 p-4 text-teal-700">
                  <CalendarClock size={27} />
                </div>
                <h3 className="mt-4 font-bold text-slate-800">
                  No break schedules found
                </h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Create a break schedule and assign it to one of your active
                  shifts.
                </p>
                <PrimaryButton onClick={openCreateSchedule} className="mt-4">
                  <Plus size={16} />
                  Create schedule
                </PrimaryButton>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[900px] text-left">
                    <thead className="bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5">Break schedule</th>
                        <th className="px-5 py-3.5">Shift</th>
                        <th className="px-5 py-3.5">Start rule</th>
                        <th className="px-5 py-3.5">Duration</th>
                        <th className="px-5 py-3.5">Department</th>
                        <th className="px-5 py-3.5">Status</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSchedules.map((item) => (
                        <tr
                          key={item.id}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
                                <Coffee size={17} />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">
                                  {item.name}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                  #{item.sequence_number} ·{" "}
                                  {item.break_type?.name || "Unknown type"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-700">
                              {item.shift?.name || "Unknown shift"}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {getShiftTime(item.shift)}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                              <Clock3 size={13} className="mr-1.5" />
                              Flexible · Anytime on duty
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-semibold text-slate-700">
                              {formatDuration(item.duration_minutes)}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {item.max_occurrences_per_shift
                                ? `Max ${item.max_occurrences_per_shift} per shift`
                                : "No count limit"}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            {item.department ? (
                              <span className="text-sm text-slate-700">
                                {item.department.name}
                              </span>
                            ) : (
                              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                                All departments
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge active={item.is_active} />
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => openEditSchedule(item)}
                                className="rounded-lg p-2 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700"
                                title="Edit schedule"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={() => toggleScheduleStatus(item)}
                                className={cx(
                                  "rounded-lg p-2 transition",
                                  item.is_active
                                    ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    : "text-emerald-600 hover:bg-emerald-50",
                                )}
                                title={
                                  item.is_active ? "Deactivate" : "Activate"
                                }
                              >
                                {item.is_active ? (
                                  <ToggleRight size={19} />
                                ) : (
                                  <ToggleLeft size={19} />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="grid gap-3 p-3 sm:p-4 lg:hidden">
                  {filteredSchedules.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
                            <Coffee size={18} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {item.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {item.shift?.name || "Unknown shift"} · #
                              {item.sequence_number}
                            </p>
                          </div>
                        </div>
                        <StatusBadge active={item.is_active} />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                        <div>
                          <p className="text-xs text-slate-400">Start rule</p>
                          <p className="mt-1 text-sm font-bold text-teal-700">
                            Flexible
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Duration</p>
                          <p className="mt-1 text-sm font-bold text-slate-800">
                            {formatDuration(item.duration_minutes)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {item.max_occurrences_per_shift
                              ? `Max ${item.max_occurrences_per_shift} per shift`
                              : "No count limit"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                          {item.break_type?.name || "Unknown type"}
                        </span>
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
                          {item.department?.name || "All departments"}
                        </span>
                      </div>

                      <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                        <SecondaryButton onClick={() => openEditSchedule(item)}>
                          <Edit3 size={15} />
                          Edit
                        </SecondaryButton>
                        <SecondaryButton
                          onClick={() => toggleScheduleStatus(item)}
                        >
                          {item.is_active ? (
                            <ToggleRight size={16} />
                          ) : (
                            <ToggleLeft size={16} />
                          )}
                          {item.is_active ? "Deactivate" : "Activate"}
                        </SecondaryButton>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* BREAK TYPES TAB */}
      {activeTab === "types" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={typeSearch}
                  onChange={(e) => setTypeSearch(e.target.value)}
                  placeholder="Search break types..."
                  className={`${inputClass} pl-10`}
                />
              </div>
              <select
                value={typeStatus}
                onChange={(e) => setTypeStatus(e.target.value)}
                className={cx(inputClass, "sm:w-44")}
              >
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 size={19} className="animate-spin text-teal-700" />
              Loading break types...
            </div>
          ) : filteredTypes.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-center">
              <div className="rounded-2xl bg-teal-50 p-4 text-teal-700">
                <Coffee size={27} />
              </div>
              <h3 className="mt-4 font-bold text-slate-800">
                No break types found
              </h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Add break types such as morning break, lunch break, or afternoon
                break.
              </p>
              <PrimaryButton onClick={openCreateType} className="mt-4">
                <Plus size={16} />
                Add break type
              </PrimaryButton>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTypes.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
                      <Coffee size={21} />
                    </div>
                    <StatusBadge active={item.is_active} />
                  </div>

                  <h3 className="mt-4 text-lg font-bold text-slate-900">
                    {item.name}
                  </h3>
                  <p className="mt-1 min-h-10 text-sm leading-relaxed text-slate-500">
                    {item.description || "No description provided."}
                  </p>

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3">
                    <div>
                      <p className="text-xs text-slate-400">Allowed duration</p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {formatDuration(item.allowed_duration_minutes)}
                      </p>
                    </div>
                    <PaidBadge paid={item.is_paid} />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button
                      onClick={() => toggleTypeStatus(item)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-teal-700"
                    >
                      {item.is_active ? (
                        <ToggleRight size={17} />
                      ) : (
                        <ToggleLeft size={17} />
                      )}
                      {item.is_active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => openEditType(item)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-teal-700 transition hover:bg-teal-50"
                    >
                      <Edit3 size={14} />
                      Edit details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* BREAK TYPE MODAL */}
      {typeModal && (
        <Modal
          title={editingType ? "Edit break type" : "Create break type"}
          description="Define the break category and its allowed duration."
          onClose={() => !saving && setTypeModal(false)}
        >
          <form onSubmit={saveType} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Field label="Break type name" required>
              <input
                required
                maxLength={100}
                value={typeForm.name}
                onChange={(e) =>
                  setTypeForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Morning Break"
                className={inputClass}
              />
            </Field>

            <Field label="Description">
              <textarea
                rows={3}
                value={typeForm.description}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Brief description of this break type..."
                className={inputClass}
              />
            </Field>

            <Field
              label="Allowed duration (minutes)"
              hint="This is the standard allowed break duration."
              required
            >
              <input
                type="number"
                min="1"
                step="1"
                required
                value={typeForm.allowed_duration_minutes}
                onChange={(e) =>
                  setTypeForm((prev) => ({
                    ...prev,
                    allowed_duration_minutes: e.target.value,
                  }))
                }
                className={inputClass}
              />
            </Field>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Paid break
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Is this break included in paid working time?
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={typeForm.is_paid}
                  onClick={() =>
                    setTypeForm((prev) => ({
                      ...prev,
                      is_paid: !prev.is_paid,
                    }))
                  }
                  className={cx(
                    "relative h-6 w-11 rounded-full transition",
                    typeForm.is_paid ? "bg-teal-600" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cx(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition",
                      typeForm.is_paid ? "left-[22px]" : "left-0.5",
                    )}
                  />
                </button>
              </div>
              <div className="mt-3">
                <PaidBadge paid={typeForm.is_paid} />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <SecondaryButton
                type="button"
                onClick={() => setTypeModal(false)}
                disabled={saving}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" loading={saving}>
                <Check size={16} />
                {editingType ? "Save changes" : "Create break type"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {/* BREAK SCHEDULE MODAL */}
      {scheduleModal && (
        <Modal
          wide
          title={
            editingSchedule ? "Edit break schedule" : "Create break schedule"
          }
          description="Set the break allowance. Employees can start this break anytime during their shift."
          onClose={() => !saving && setScheduleModal(false)}
        >
          <form onSubmit={saveSchedule} className="space-y-5">
            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <Field label="Schedule name" required>
              <input
                required
                maxLength={100}
                value={scheduleForm.name}
                onChange={(e) =>
                  setScheduleForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                placeholder="e.g. Morning Break - Warehouse"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Shift" required>
                <select
                  required
                  value={scheduleForm.shift_id}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      shift_id: e.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value="">Select shift</option>
                  {references.shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name} ({formatTime(shift.start_time)} –{" "}
                      {formatTime(shift.end_time)})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Break type" required>
                <select
                  required
                  value={scheduleForm.break_type_id}
                  onChange={(e) => {
                    const selected = references.breakTypes.find(
                      (item) => item.id === e.target.value,
                    );

                    setScheduleForm((prev) => ({
                      ...prev,
                      break_type_id: e.target.value,
                      duration_minutes:
                        selected?.allowed_duration_minutes ||
                        prev.duration_minutes,
                    }));
                  }}
                  className={inputClass}
                >
                  <option value="">Select break type</option>
                  {references.breakTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name} · {type.allowed_duration_minutes} min
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Department"
              hint="Leave this empty if the schedule applies to all departments."
            >
              <select
                value={scheduleForm.department_id}
                onChange={(e) =>
                  setScheduleForm((prev) => ({
                    ...prev,
                    department_id: e.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">All departments</option>
                {references.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Display order"
                hint="Used only to organize break rules in the list."
                required
              >
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={scheduleForm.sequence_number}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      sequence_number: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>

              <Field
                label="Maximum breaks per shift"
                hint="Leave blank to allow repeated breaks without a configured count limit."
              >
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={scheduleForm.max_occurrences_per_shift}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      max_occurrences_per_shift: e.target.value,
                    }))
                  }
                  placeholder="No limit"
                  className={inputClass}
                />
              </Field>

              <Field label="Allowed duration (minutes)" required>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={scheduleForm.duration_minutes}
                  onChange={(e) =>
                    setScheduleForm((prev) => ({
                      ...prev,
                      duration_minutes: e.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            {selectedBreakType && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500">
                    Selected break type allowance
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {selectedBreakType.allowed_duration_minutes} minutes
                    <span className="ml-2">
                      <PaidBadge paid={selectedBreakType.is_paid} />
                    </span>
                  </p>
                </div>
                {Number(scheduleForm.duration_minutes) >
                  selectedBreakType.allowed_duration_minutes && (
                  <span className="text-xs font-medium text-amber-700">
                    Longer than the break type allowance
                  </span>
                )}
              </div>
            )}

            {/* Flexible break behavior */}
            <div className="overflow-hidden rounded-2xl border border-teal-100 bg-teal-50/70">
              <div className="flex items-center gap-2 border-b border-teal-100 px-4 py-3 text-sm font-semibold text-teal-800">
                <Clock3 size={17} />
                Flexible break rule
              </div>
              <div className="space-y-2 p-4">
                <p className="text-sm font-semibold text-slate-800">
                  Employees can start this break anytime while on duty.
                </p>
                <p className="text-xs leading-5 text-slate-600">
                  The kiosk will record the actual start and end time. The
                  system will compare the actual duration against this rule's
                  allowance and calculate any excess time.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-teal-700">
                    Duration: {formatDuration(scheduleForm.duration_minutes)}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-teal-700">
                    {scheduleForm.max_occurrences_per_shift
                      ? `Up to ${scheduleForm.max_occurrences_per_shift} per shift`
                      : "No configured count limit"}
                  </span>
                </div>
              </div>
            </div>

            {references.shifts.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                No active shifts found. Create or activate a shift before
                configuring break schedules.
              </div>
            )}

            {references.breakTypes.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                No active break types found. Create a break type first.
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <SecondaryButton
                type="button"
                onClick={() => setScheduleModal(false)}
                disabled={saving}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton
                type="submit"
                loading={saving}
                disabled={
                  references.shifts.length === 0 ||
                  references.breakTypes.length === 0
                }
              >
                <Check size={16} />
                {editingSchedule ? "Save changes" : "Create schedule"}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
