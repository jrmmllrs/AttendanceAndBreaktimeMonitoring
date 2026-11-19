import { supabaseAdmin } from "../../config/supabase.js";

const TIME_ZONE = "Asia/Manila";

function getManilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getManilaDayRange(date) {
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getEmployeeName(employee) {
  if (!employee) return "Unknown employee";

  return [
    employee.first_name,
    employee.middle_name,
    employee.last_name,
    employee.suffix,
  ]
    .filter(Boolean)
    .join(" ");
}

function minutesSince(value) {
  if (!value) return 0;

  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
}

function emptyResponse(date) {
  return {
    date,
    generated_at: new Date().toISOString(),
    stats: {
      total_employees: 0,
      present: 0,
      absent: 0,
      no_attendance: 0,
      on_leave: 0,
      on_break: 0,
      overbreak: 0,
    },
    employees: [],
    active_breaks: [],
    recent_activities: [],
    departments: [],
    shifts: [],
  };
}

// GET /api/monitoring/live
export async function getLiveMonitoring(req, res) {
  try {
    const role = req.user?.role;

    if (!["admin", "hr", "supervisor"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access live monitoring.",
      });
    }

    const date = getManilaDate();
    const { start, end } = getManilaDayRange(date);

    let departmentQuery = supabaseAdmin
      .from("departments")
      .select("id, name, supervisor_profile_id")
      .eq("is_active", true)
      .order("name");

    if (role === "supervisor") {
      departmentQuery = departmentQuery.eq(
        "supervisor_profile_id",
        req.user.id,
      );
    }

    const { data: departments, error: departmentError } = await departmentQuery;

    if (departmentError) throw departmentError;

    const departmentList = departments || [];
    const departmentIds = departmentList.map((item) => item.id);

    if (role === "supervisor" && departmentIds.length === 0) {
      return res.json({
        success: true,
        data: emptyResponse(date),
      });
    }

    let employeeQuery = supabaseAdmin
      .from("employees")
      .select(
        `
          id,
          employee_number,
          first_name,
          middle_name,
          last_name,
          suffix,
          department_id,
          employment_status
        `,
      )
      .eq("employment_status", "active")
      .order("employee_number");

    if (role === "supervisor") {
      employeeQuery = employeeQuery.in("department_id", departmentIds);
    }

    const { data: employees, error: employeeError } = await employeeQuery;

    if (employeeError) throw employeeError;

    const employeeList = employees || [];
    const employeeIds = employeeList.map((item) => item.id);

    if (!employeeIds.length) {
      return res.json({
        success: true,
        data: {
          ...emptyResponse(date),
          departments: departmentList.map((item) => ({
            id: item.id,
            name: item.name,
            total_employees: 0,
            present: 0,
            absent: 0,
            no_attendance: 0,
            on_break: 0,
            overbreak: 0,
          })),
        },
      });
    }

    const [attendanceResult, breakResult, assignmentResult, eventResult] =
      await Promise.all([
        supabaseAdmin
          .from("attendance_records")
          .select(
            `
              id,
              employee_id,
              shift_assignment_id,
              work_date,
              status,
              scheduled_start_at,
              scheduled_end_at,
              clock_in_at,
              clock_out_at,
              late_minutes,
              undertime_minutes
            `,
          )
          .eq("work_date", date)
          .in("employee_id", employeeIds),

        supabaseAdmin
          .from("active_break_monitoring")
          .select(
            `
              id,
              employee_id,
              employee_number,
              first_name,
              last_name,
              department_id,
              department_name,
              attendance_id,
              break_name,
              actual_start_at,
              allowed_duration_minutes,
              elapsed_minutes,
              current_excess_minutes
            `,
          )
          .in("employee_id", employeeIds),

        supabaseAdmin
          .from("employee_shift_assignments")
          .select("id, employee_id, shift_id, effective_from, effective_until")
          .in("employee_id", employeeIds)
          .lte("effective_from", date)
          .or(`effective_until.is.null,effective_until.gte.${date}`),

        supabaseAdmin
          .from("attendance_events")
          .select("id, employee_id, event_type, source, created_at")
          .in("employee_id", employeeIds)
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

    if (attendanceResult.error) throw attendanceResult.error;
    if (breakResult.error) throw breakResult.error;
    if (assignmentResult.error) throw assignmentResult.error;
    if (eventResult.error) throw eventResult.error;

    const attendanceRecords = attendanceResult.data || [];
    const activeBreaks = breakResult.data || [];
    const assignments = assignmentResult.data || [];
    const events = eventResult.data || [];

    const shiftIds = [...new Set(assignments.map((item) => item.shift_id))];

    let shifts = [];

    if (shiftIds.length) {
      const { data, error } = await supabaseAdmin
        .from("shifts")
        .select("id, name, start_time, end_time, is_overnight")
        .in("id", shiftIds);

      if (error) throw error;
      shifts = data || [];
    }

    const employeeMap = new Map(employeeList.map((item) => [item.id, item]));

    const departmentMap = new Map(
      departmentList.map((item) => [item.id, item]),
    );

    const attendanceMap = new Map(
      attendanceRecords.map((item) => [item.employee_id, item]),
    );

    const breakMap = new Map(
      activeBreaks.map((item) => [item.employee_id, item]),
    );

    const shiftMap = new Map(shifts.map((item) => [item.id, item]));

    const assignmentMap = new Map();

    for (const assignment of assignments) {
      const existing = assignmentMap.get(assignment.employee_id);

      if (!existing || assignment.effective_from > existing.effective_from) {
        assignmentMap.set(assignment.employee_id, assignment);
      }
    }

    const monitoringEmployees = employeeList.map((employee) => {
      const attendance = attendanceMap.get(employee.id) || null;
      const activeBreak = breakMap.get(employee.id) || null;
      const assignment = assignmentMap.get(employee.id) || null;
      const shift = assignment
        ? shiftMap.get(assignment.shift_id) || null
        : null;
      const department = departmentMap.get(employee.department_id) || null;

      let status = attendance?.status || "no_attendance";

      if (activeBreak) {
        status = "on_break";
      }

      let currentActivity = "No attendance record";

      if (activeBreak) {
        currentActivity = `On break · ${activeBreak.break_name || "Break"}`;
      } else if (attendance?.status === "absent") {
        currentActivity = "Absent";
      } else if (attendance?.status === "on_leave") {
        currentActivity = "On leave";
      } else if (attendance?.status === "rest_day") {
        currentActivity = "Rest day";
      } else if (attendance?.status === "holiday") {
        currentActivity = "Holiday";
      } else if (
        ["present", "late", "half_day", "incomplete"].includes(
          attendance?.status,
        )
      ) {
        currentActivity = attendance.status.replaceAll("_", " ");
      }

      return {
        id: employee.id,
        employee_number: employee.employee_number,
        employee_name: getEmployeeName(employee),
        department_id: employee.department_id,
        department_name: department?.name || "Unassigned",
        shift_id: shift?.id || null,
        shift_name: shift?.name || "No assigned shift",
        shift_start_time: shift?.start_time || null,
        shift_end_time: shift?.end_time || null,
        is_overnight: Boolean(shift?.is_overnight),
        attendance_id: attendance?.id || null,
        attendance_status: attendance?.status || "no_attendance",
        monitoring_status: status,
        current_activity: currentActivity,
        clock_in_at: attendance?.clock_in_at || null,
        clock_out_at: attendance?.clock_out_at || null,
        late_minutes: Number(attendance?.late_minutes || 0),
        undertime_minutes: Number(attendance?.undertime_minutes || 0),
        break: activeBreak
          ? {
              id: activeBreak.id,
              name: activeBreak.break_name,
              started_at: activeBreak.actual_start_at,
              allowed_duration_minutes: Number(
                activeBreak.allowed_duration_minutes || 0,
              ),
              elapsed_minutes: Number(activeBreak.elapsed_minutes || 0),
              excess_minutes: Number(activeBreak.current_excess_minutes || 0),
              is_overbreak: Number(activeBreak.current_excess_minutes || 0) > 0,
            }
          : null,
      };
    });

    const stats = {
      total_employees: monitoringEmployees.length,
      present: 0,
      absent: 0,
      no_attendance: 0,
      on_leave: 0,
      on_break: 0,
      overbreak: 0,
    };

    for (const employee of monitoringEmployees) {
      switch (employee.monitoring_status) {
        case "on_break":
          stats.on_break += 1;
          stats.present += 1;
          break;
        case "present":
        case "late":
        case "half_day":
        case "incomplete":
          stats.present += 1;
          break;
        case "absent":
          stats.absent += 1;
          break;
        case "on_leave":
          stats.on_leave += 1;
          break;
        case "no_attendance":
          stats.no_attendance += 1;
          break;
        default:
          break;
      }

      if (employee.break?.is_overbreak) {
        stats.overbreak += 1;
      }
    }

    const recentActivities = events.map((event) => {
      const employee = employeeMap.get(event.employee_id);

      return {
        id: event.id,
        employee_id: event.employee_id,
        employee_number: employee?.employee_number || null,
        employee_name: getEmployeeName(employee),
        event_type: event.event_type,
        source: event.source,
        created_at: event.created_at,
      };
    });

    const departmentSummary = departmentList.map((department) => {
      const rows = monitoringEmployees.filter(
        (item) => item.department_id === department.id,
      );

      return {
        id: department.id,
        name: department.name,
        total_employees: rows.length,
        present: rows.filter((item) =>
          ["present", "late", "half_day", "incomplete", "on_break"].includes(
            item.monitoring_status,
          ),
        ).length,
        absent: rows.filter((item) => item.monitoring_status === "absent")
          .length,
        no_attendance: rows.filter(
          (item) => item.monitoring_status === "no_attendance",
        ).length,
        on_break: rows.filter((item) => item.monitoring_status === "on_break")
          .length,
        overbreak: rows.filter((item) => item.break?.is_overbreak).length,
      };
    });

    return res.json({
      success: true,
      data: {
        date,
        generated_at: new Date().toISOString(),
        stats,
        employees: monitoringEmployees,
        active_breaks: monitoringEmployees
          .filter((item) => item.break)
          .map((item) => ({
            employee_id: item.id,
            employee_number: item.employee_number,
            employee_name: item.employee_name,
            department_name: item.department_name,
            shift_name: item.shift_name,
            ...item.break,
          })),
        recent_activities: recentActivities,
        departments: departmentSummary,
        shifts: shifts.map((item) => ({
          id: item.id,
          name: item.name,
          start_time: item.start_time,
          end_time: item.end_time,
          is_overnight: item.is_overnight,
        })),
      },
    });
  } catch (error) {
    console.error("getLiveMonitoring error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve live monitoring data.",
      error: error.message || String(error),
    });
  }
}
