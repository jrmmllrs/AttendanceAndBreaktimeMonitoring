import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardCheck,
  Filter,
  RefreshCw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";

import { api, getApiError } from "../../lib/api";

const getManilaDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

const getAttendanceStatus = (employee) => {
  const status = employee?.attendance?.status;

  if (status === "present" || status === "absent") {
    return status;
  }

  return status || null;
};

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

const StatusBadge = ({ status }) => {
  if (status === "present") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Present
      </span>
    );
  }

  if (status === "absent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/15">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Absent
      </span>
    );
  }

  if (status) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold capitalize text-amber-700 ring-1 ring-inset ring-amber-600/15">
        {status.replaceAll("_", " ")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      Not recorded
    </span>
  );
};

const SummaryCard = ({ label, value, icon: Icon, tone }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>
        </div>

        <div className={`rounded-xl p-3 ${tones[tone] || tones.slate}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
};

export default function AttendanceManagementPage() {
  const [workDate, setWorkDate] = useState(getManilaDate);
  const [employees, setEmployees] = useState([]);
  const [statusById, setStatusById] = useState({});
  const [originalStatuses, setOriginalStatuses] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setSelectedIds([]);

    try {
      const response = await api.get(
        "/attendance/management/manual-employees",
        {
          params: {
            work_date: workDate,
          },
        },
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

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const fullName = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

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

      return matchesSearch && matchesDepartment;
    });
  }, [employees, search, departmentFilter]);

  const summary = useMemo(() => {
    let present = 0;
    let absent = 0;
    let unrecorded = 0;

    employees.forEach((employee) => {
      const status = statusById[employee.id];

      if (status === "present") present += 1;
      else if (status === "absent") absent += 1;
      else unrecorded += 1;
    });

    return {
      total: employees.length,
      present,
      absent,
      unrecorded,
    };
  }, [employees, statusById]);

  const selectedCount = selectedIds.length;

  const visibleIds = filteredEmployees.map((employee) => employee.id);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const changedEntries = useMemo(() => {
    return employees
      .filter((employee) => {
        const currentStatus = statusById[employee.id];

        return (
          (currentStatus === "present" || currentStatus === "absent") &&
          currentStatus !== originalStatuses[employee.id]
        );
      })
      .map((employee) => ({
        employee_id: employee.id,
        status: statusById[employee.id],
      }));
  }, [employees, statusById, originalStatuses]);

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
    setStatusById((current) => ({
      ...current,
      [employeeId]: status,
    }));

    setSuccess("");
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

  const formatWorkDate = (date) => {
    if (!date) return "";

    return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-full space-y-6 pb-8">
      {/* Page heading */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-teal-700">
            <ClipboardCheck size={17} />
            Workforce Management
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Attendance Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Record daily employee attendance using Present and Absent status.
          </p>
        </div>

        <button
          type="button"
          onClick={loadEmployees}
          disabled={loading || saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Date selector */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <CalendarDays size={21} />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                Attendance date
              </p>
              <p className="text-xs text-slate-500">
                {formatWorkDate(workDate)}
              </p>
            </div>
          </div>

          <input
            type="date"
            value={workDate}
            max={getManilaDate()}
            onChange={(event) => setWorkDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 sm:w-auto"
          />
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <X size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Check size={18} className="mt-0.5 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCard
          label="Total Employees"
          value={summary.total}
          icon={Users}
          tone="slate"
        />

        <SummaryCard
          label="Present"
          value={summary.present}
          icon={CheckCheck}
          tone="emerald"
        />

        <SummaryCard
          label="Absent"
          value={summary.absent}
          icon={X}
          tone="rose"
        />

        <SummaryCard
          label="Not Recorded"
          value={summary.unrecorded}
          icon={ClipboardCheck}
          tone="amber"
        />
      </div>

      {/* Employee table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-bold text-slate-900">
                  Employee Attendance
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Select employees, then apply a bulk attendance status.
                </p>
              </div>

              <div className="text-sm text-slate-500">
                {filteredEmployees.length} employee(s)
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_240px]">
              <div className="relative">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employee name or number..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>

              <div className="relative">
                <Filter
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  <option value="all">All Departments</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk actions */}
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              disabled={loading || filteredEmployees.length === 0}
              className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />

            <div>
              <p className="text-sm font-semibold text-slate-800">
                Select all visible
              </p>
              <p className="text-xs text-slate-500">
                {selectedCount} employee(s) selected
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => markSelected("present")}
              disabled={selectedCount === 0 || loading || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={16} />
              Mark Present
            </button>

            <button
              type="button"
              onClick={() => markSelected("absent")}
              disabled={selectedCount === 0 || loading || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={16} />
              Mark Absent
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-5 py-3 font-semibold">Select</th>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Department</th>
                <th className="px-4 py-3 font-semibold">Assigned Shift</th>
                <th className="px-4 py-3 font-semibold">Attendance</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Quick action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <RefreshCw
                        size={22}
                        className="animate-spin text-teal-600"
                      />
                      <p className="text-sm">Loading employees...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Users size={30} />
                      <p className="font-semibold text-slate-600">
                        No employees found
                      </p>
                      <p className="text-sm">
                        Try changing the search or department filter.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((employee) => {
                  const selected = selectedIds.includes(employee.id);
                  const status = statusById[employee.id];

                  const fullName = [
                    employee.first_name,
                    employee.middle_name,
                    employee.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <tr
                      key={employee.id}
                      className={`transition ${
                        selected ? "bg-teal-50/40" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleEmployee(employee.id)}
                          aria-label={`Select ${fullName}`}
                          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>

                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">
                          {fullName || "Unnamed employee"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {employee.employee_number || "No employee number"}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-600">
                        {employee.department_name || "Unassigned"}
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-600">
                        {formatShift(employee)}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <StatusBadge status={status} />
                          {status !== originalStatuses[employee.id] && (
                            <span className="text-[11px] font-medium text-teal-700">
                              Unsaved change
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => markEmployee(employee.id, "present")}
                            disabled={saving}
                            title="Mark Present"
                            className={`rounded-lg p-2 transition ${
                              status === "present"
                                ? "bg-emerald-100 text-emerald-700"
                                : "text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                            }`}
                          >
                            <Check size={17} />
                          </button>

                          <button
                            type="button"
                            onClick={() => markEmployee(employee.id, "absent")}
                            disabled={saving}
                            title="Mark Absent"
                            className={`rounded-lg p-2 transition ${
                              status === "absent"
                                ? "bg-rose-100 text-rose-700"
                                : "text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                            }`}
                          >
                            <X size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {changedEntries.length > 0
              ? `${changedEntries.length} attendance change(s) waiting to be saved.`
              : "All attendance changes are saved."}
          </p>

          <button
            type="button"
            onClick={saveChanges}
            disabled={saving || loading || changedEntries.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={17} />
            {saving
              ? "Saving attendance..."
              : `Save Changes${changedEntries.length ? ` (${changedEntries.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
