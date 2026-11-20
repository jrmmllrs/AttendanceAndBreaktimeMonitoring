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

function emptySummary(date) {
  return {
    date,
    stats: {
      total_employees: 0,
      present: 0,
      absent: 0,
      on_leave: 0,
      no_attendance: 0,
      on_break: 0,
      overbreak: 0,
    },
    attendance: {
      present: 0,
      late: 0,
      absent: 0,
      half_day: 0,
      on_leave: 0,
      rest_day: 0,
      holiday: 0,
      incomplete: 0,
      no_attendance: 0,
    },
    breaktime: {
      on_break: 0,
      overbreak: 0,
      employees: [],
    },
    departments: [],
    positions: [],
    recent_activities: [],
  };
}

// GET /api/dashboard/summary
export async function getDashboardSummary(req, res) {
  try {
    const role = req.user?.role;

    if (!["admin", "hr", "supervisor"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access the dashboard.",
      });
    }

    const date = getManilaDate();
    const { start, end } = getManilaDayRange(date);

    let departmentQuery = supabaseAdmin
      .from("departments")
      .select("id, name, supervisor_profile_id, is_active")
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

    const departmentIds = (departments || []).map((item) => item.id);

    if (role === "supervisor" && !departmentIds.length) {
      return res.json({
        success: true,
        data: emptySummary(date),
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
        position_id,
        employment_status
      `,
      )
      .eq("employment_status", "active");

    if (role === "supervisor") {
      employeeQuery = employeeQuery.in("department_id", departmentIds);
    }

    const { data: employees, error: employeeError } = await employeeQuery;

    if (employeeError) throw employeeError;

    const employeeList = employees || [];
    const employeeIds = employeeList.map((employee) => employee.id);

    if (!employeeIds.length) {
      return res.json({
        success: true,
        data: {
          ...emptySummary(date),
          departments: (departments || []).map((department) => ({
            id: department.id,
            name: department.name,
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

    const [attendanceResult, activeBreakResult, eventsResult, positionResult] =
      await Promise.all([
        supabaseAdmin
          .from("attendance_records")
          .select(
            `
          id,
          employee_id,
          status,
          work_date,
          clock_in_at,
          clock_out_at,
          total_worked_minutes,
          total_break_minutes,
          excess_break_minutes
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
          .from("attendance_events")
          .select(
            `
          id,
          employee_id,
          event_type,
          source,
          created_at
        `,
          )
          .in("employee_id", employeeIds)
          .gte("created_at", start)
          .lt("created_at", end)
          .order("created_at", { ascending: false })
          .limit(12),

        supabaseAdmin.from("positions").select("id, name").order("name"),
      ]);

    if (attendanceResult.error) throw attendanceResult.error;
    if (activeBreakResult.error) throw activeBreakResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (positionResult.error) throw positionResult.error;

    const attendanceRecords = attendanceResult.data || [];
    const activeBreaks = activeBreakResult.data || [];
    const events = eventsResult.data || [];
    const positionRows = positionResult.data || [];

    const employeeMap = new Map(
      employeeList.map((employee) => [employee.id, employee]),
    );

    const attendanceMap = new Map(
      attendanceRecords.map((record) => [record.employee_id, record]),
    );

    const positionNameMap = new Map(
      positionRows.map((position) => [position.id, position.name]),
    );

    const attendance = {
      present: 0,
      late: 0,
      absent: 0,
      half_day: 0,
      on_leave: 0,
      rest_day: 0,
      holiday: 0,
      incomplete: 0,
      no_attendance: 0,
    };

    for (const employee of employeeList) {
      const record = attendanceMap.get(employee.id);

      if (!record) {
        attendance.no_attendance += 1;
        continue;
      }

      if (Object.hasOwn(attendance, record.status)) {
        attendance[record.status] += 1;
      }
    }

    const presentCount =
      attendance.present + attendance.late + attendance.half_day;

    const overbreaks = activeBreaks.filter(
      (item) => Number(item.current_excess_minutes || 0) > 0,
    );

    const departmentSummary = (departments || []).map((department) => {
      const departmentEmployees = employeeList.filter(
        (employee) => employee.department_id === department.id,
      );

      let present = 0;
      let absent = 0;
      let noAttendance = 0;
      let onBreak = 0;
      let overbreak = 0;

      for (const employee of departmentEmployees) {
        const record = attendanceMap.get(employee.id);

        if (!record) {
          noAttendance += 1;
        } else if (["present", "late", "half_day"].includes(record.status)) {
          present += 1;
        } else if (record.status === "absent") {
          absent += 1;
        }
      }

      for (const item of activeBreaks) {
        if (item.department_id !== department.id) continue;

        onBreak += 1;

        if (Number(item.current_excess_minutes || 0) > 0) {
          overbreak += 1;
        }
      }

      return {
        id: department.id,
        name: department.name,
        total_employees: departmentEmployees.length,
        present,
        absent,
        no_attendance: noAttendance,
        on_break: onBreak,
        overbreak,
      };
    });

    // Attendance per position (same counting rules as departments).
    // Employees without a position are grouped as "No position".
    const positionBuckets = new Map();

    const bucketFor = (positionId) => {
      const key = positionId || "none";

      if (!positionBuckets.has(key)) {
        positionBuckets.set(key, {
          id: positionId || null,
          name: positionId
            ? positionNameMap.get(positionId) || "Unnamed position"
            : "No position",
          total_employees: 0,
          present: 0,
          absent: 0,
          no_attendance: 0,
          on_break: 0,
          overbreak: 0,
        });
      }

      return positionBuckets.get(key);
    };

    for (const employee of employeeList) {
      const bucket = bucketFor(employee.position_id);
      const record = attendanceMap.get(employee.id);

      bucket.total_employees += 1;

      if (!record) {
        bucket.no_attendance += 1;
      } else if (["present", "late", "half_day"].includes(record.status)) {
        bucket.present += 1;
      } else if (record.status === "absent") {
        bucket.absent += 1;
      }
    }

    for (const item of activeBreaks) {
      const employee = employeeMap.get(item.employee_id);
      if (!employee) continue;

      const bucket = bucketFor(employee.position_id);
      bucket.on_break += 1;

      if (Number(item.current_excess_minutes || 0) > 0) {
        bucket.overbreak += 1;
      }
    }

    const positionSummary = [...positionBuckets.values()].sort(
      (a, b) =>
        b.present - a.present ||
        b.total_employees - a.total_employees ||
        a.name.localeCompare(b.name),
    );

    const formattedBreaks = activeBreaks.map((item) => ({
      ...item,
      employee_name: getEmployeeName(item),
      elapsed_minutes: Number(item.elapsed_minutes || 0),
      current_excess_minutes: Number(item.current_excess_minutes || 0),
      is_overbreak: Number(item.current_excess_minutes || 0) > 0,
    }));

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

    return res.json({
      success: true,
      data: {
        date,

        stats: {
          total_employees: employeeList.length,
          present: presentCount,
          absent: attendance.absent,
          on_leave: attendance.on_leave,
          no_attendance: attendance.no_attendance,
          on_break: activeBreaks.length,
          overbreak: overbreaks.length,
        },

        attendance,

        breaktime: {
          on_break: activeBreaks.length,
          overbreak: overbreaks.length,
          employees: formattedBreaks,
        },

        departments: departmentSummary,

        positions: positionSummary,

        recent_activities: recentActivities,
      },
    });
  } catch (error) {
    console.error("getDashboardSummary error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve dashboard summary.",
      error: error.message || String(error),
    });
  }
}
