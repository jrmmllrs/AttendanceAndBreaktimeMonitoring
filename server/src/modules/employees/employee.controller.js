import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../../config/supabase.js";

// Safe employee fields only. Never return pin_hash or PIN lockout internals.
const EMPLOYEE_FIELDS = `
  id,
  employee_number,
  first_name,
  middle_name,
  last_name,
  suffix,
  email,
  phone,
  photo_url,
  gender,
  birth_date,
  address,
  department_id,
  position_id,
  supervisor_employee_id,
  employment_type,
  employment_status,
  date_hired,
  date_terminated,
  last_attendance_at,
  notes,
  created_at,
  updated_at
`;

const EMPLOYMENT_TYPES = [
  "regular",
  "probationary",
  "contractual",
  "temporary",
];
const EMPLOYEE_STATUSES = ["active", "inactive", "resigned", "terminated"];

function sendError(res, status, message, error = null) {
  return res.status(status).json({
    success: false,
    message,
    ...(error && { error: error.message || String(error) }),
  });
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result || null;
}

function validUUID(value) {
  if (value === undefined || value === null || value === "") return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value),
  );
}

function validDate(value) {
  if (value === undefined || value === null || value === "") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function validPin(pin) {
  return /^\d{4,8}$/.test(String(pin || ""));
}

function manilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function getSupervisorDepartmentIds(userId) {
  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("id")
    .eq("supervisor_profile_id", userId)
    .eq("is_active", true);

  if (error) throw error;
  return (data || []).map((department) => department.id);
}

async function getEmployeeById(id) {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select(EMPLOYEE_FIELDS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// GET /api/employees
export async function getEmployees(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );
    const search = cleanString(req.query.search);

    // Keep the existing API query parameter `status`,
    // but map it to the actual database column.
    const status = cleanString(req.query.status);
    const departmentId = cleanString(req.query.department_id);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("employees")
      .select(EMPLOYEE_FIELDS, { count: "exact" });

    // Supervisors can only see employees in their assigned departments.
    if (req.user?.role === "supervisor") {
      const departmentIds = await getSupervisorDepartmentIds(req.user.id);

      if (!departmentIds.length) {
        return res.json({
          success: true,
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }

      query = query.in("department_id", departmentIds);
    }

    if (status && status !== "all") {
      if (!EMPLOYEE_STATUSES.includes(status)) {
        return sendError(res, 400, "Invalid employee status.");
      }

      query = query.eq("employment_status", status);
    }

    if (departmentId && departmentId !== "all") {
      if (!validUUID(departmentId)) {
        return sendError(res, 400, "Invalid department.");
      }

      query = query.eq("department_id", departmentId);
    }

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();

      if (safeSearch) {
        query = query.or(
          [
            `employee_number.ilike.%${safeSearch}%`,
            `first_name.ilike.%${safeSearch}%`,
            `middle_name.ilike.%${safeSearch}%`,
            `last_name.ilike.%${safeSearch}%`,
            `email.ilike.%${safeSearch}%`,
          ].join(","),
        );
      }
    }

    const {
      data: employees,
      error,
      count,
    } = await query.order("created_at", { ascending: false }).range(from, to);

    if (error) throw error;

    // Load department and position names for the current page.
    const departmentIds = [
      ...new Set(
        (employees || [])
          .map((employee) => employee.department_id)
          .filter(Boolean),
      ),
    ];

    const positionIds = [
      ...new Set(
        (employees || [])
          .map((employee) => employee.position_id)
          .filter(Boolean),
      ),
    ];

    const [departmentResult, positionResult] = await Promise.all([
      departmentIds.length
        ? supabaseAdmin
            .from("departments")
            .select("id, name")
            .in("id", departmentIds)
        : Promise.resolve({ data: [], error: null }),

      positionIds.length
        ? supabaseAdmin
            .from("positions")
            .select("id, name")
            .in("id", positionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (departmentResult.error) throw departmentResult.error;
    if (positionResult.error) throw positionResult.error;

    const departmentMap = new Map(
      (departmentResult.data || []).map((item) => [item.id, item.name]),
    );

    const positionMap = new Map(
      (positionResult.data || []).map((item) => [item.id, item.name]),
    );

    const formattedEmployees = (employees || []).map((employee) => ({
      ...employee,
      department_name: departmentMap.get(employee.department_id) || null,
      position_name: positionMap.get(employee.position_id) || null,
    }));

    return res.json({
      success: true,
      data: formattedEmployees,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("getEmployees error:", error);
    return sendError(res, 500, "Unable to retrieve employees.", error);
  }
}

// GET /api/employees/references
export async function getEmployeeReferences(req, res) {
  try {
    const role = req.user?.role;

    if (!["admin", "hr", "supervisor"].includes(role)) {
      return sendError(
        res,
        403,
        "You are not authorized to access employee references.",
      );
    }

    let departmentsQuery = supabaseAdmin
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    if (role === "supervisor") {
      departmentsQuery = departmentsQuery.eq(
        "supervisor_profile_id",
        req.user.id,
      );
    }

    const [departmentsResult, positionsResult, employeesResult] =
      await Promise.all([
        departmentsQuery,

        supabaseAdmin
          .from("positions")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),

        role === "supervisor"
          ? Promise.resolve({ data: [], error: null })
          : supabaseAdmin
              .from("employees")
              .select(
                `
              id,
              employee_number,
              first_name,
              middle_name,
              last_name,
              department_id
            `,
              )
              .eq("employment_status", "active")
              .order("first_name"),
      ]);

    if (departmentsResult.error) throw departmentsResult.error;
    if (positionsResult.error) throw positionsResult.error;
    if (employeesResult.error) throw employeesResult.error;

    return res.json({
      success: true,
      data: {
        departments: departmentsResult.data || [],
        positions: positionsResult.data || [],
        supervisors: employeesResult.data || [],
      },
    });
  } catch (error) {
    console.error("getEmployeeReferences error:", error);
    return sendError(
      res,
      500,
      "Unable to retrieve employee references.",
      error,
    );
  }
}

// GET /api/employees/:id
export async function getEmployee(req, res) {
  try {
    const { id } = req.params;

    if (!validUUID(id)) {
      return sendError(res, 400, "Invalid employee ID.");
    }

    const employee = await getEmployeeById(id);

    if (!employee) {
      return sendError(res, 404, "Employee not found.");
    }

    if (req.user?.role === "supervisor") {
      const departmentIds = await getSupervisorDepartmentIds(req.user.id);

      if (!departmentIds.includes(employee.department_id)) {
        return sendError(
          res,
          403,
          "You are not authorized to view this employee.",
        );
      }
    } else if (!["admin", "hr"].includes(req.user?.role)) {
      return sendError(
        res,
        403,
        "You are not authorized to view this employee.",
      );
    }

    const [departmentResult, positionResult] = await Promise.all([
      employee.department_id
        ? supabaseAdmin
            .from("departments")
            .select("id, name")
            .eq("id", employee.department_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      employee.position_id
        ? supabaseAdmin
            .from("positions")
            .select("id, name")
            .eq("id", employee.position_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (departmentResult.error) throw departmentResult.error;
    if (positionResult.error) throw positionResult.error;

    return res.json({
      success: true,
      data: {
        ...employee,
        department_name: departmentResult.data?.name || null,
        position_name: positionResult.data?.name || null,
      },
    });
  } catch (error) {
    console.error("getEmployee error:", error);
    return sendError(res, 500, "Unable to retrieve employee.", error);
  }
}

// POST /api/employees
export async function createEmployee(req, res) {
  try {
    const body = req.body || {};

    const employeeNumber = cleanString(body.employee_number);
    const firstName = cleanString(body.first_name);
    const lastName = cleanString(body.last_name);
    const pin = String(body.pin || "");

    const dateHired = cleanString(body.date_hired) || manilaDate();

    if (!employeeNumber || !firstName || !lastName) {
      return sendError(
        res,
        400,
        "Employee number, first name, and last name are required.",
      );
    }

    if (!validPin(pin)) {
      return sendError(res, 400, "PIN must contain 4 to 8 digits.");
    }

    if (
      body.employment_type &&
      !EMPLOYMENT_TYPES.includes(body.employment_type)
    ) {
      return sendError(res, 400, "Invalid employment type.");
    }

    if (!validDate(body.birth_date) || !validDate(dateHired)) {
      return sendError(res, 400, "Invalid date format.");
    }

    for (const field of [
      "department_id",
      "position_id",
      "supervisor_employee_id",
    ]) {
      if (body[field] && !validUUID(body[field])) {
        return sendError(res, 400, `Invalid ${field}.`);
      }
    }

    const pinHash = await bcrypt.hash(pin, 12);

    const { data, error } = await supabaseAdmin
      .from("employees")
      .insert({
        employee_number: employeeNumber,
        first_name: firstName,
        middle_name: cleanString(body.middle_name),
        last_name: lastName,
        suffix: cleanString(body.suffix),
        email: cleanString(body.email),
        phone: cleanString(body.phone),
        photo_url: cleanString(body.photo_url),
        gender: cleanString(body.gender),
        birth_date: cleanString(body.birth_date),
        address: cleanString(body.address),
        department_id: cleanString(body.department_id),
        position_id: cleanString(body.position_id),
        supervisor_employee_id: cleanString(body.supervisor_employee_id),
        employment_type: body.employment_type || "regular",
        employment_status: "active",
        date_hired: dateHired,
        date_terminated: null,
        notes: cleanString(body.notes),
        pin_hash: pinHash,
        pin_changed_at: new Date().toISOString(),
        failed_pin_attempts: 0,
        locked_until: null,
      })
      .select(EMPLOYEE_FIELDS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return sendError(res, 409, "Employee number or email already exists.");
      }

      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Employee created successfully.",
      data,
    });
  } catch (error) {
    console.error("createEmployee error:", error);
    return sendError(res, 500, "Unable to create employee.", error);
  }
}

// PATCH /api/employees/:id
export async function updateEmployee(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    if (!validUUID(id)) {
      return sendError(res, 400, "Invalid employee ID.");
    }

    const existing = await getEmployeeById(id);

    if (!existing) {
      return sendError(res, 404, "Employee not found.");
    }

    const allowedFields = [
      "employee_number",
      "first_name",
      "middle_name",
      "last_name",
      "suffix",
      "email",
      "phone",
      "photo_url",
      "gender",
      "birth_date",
      "address",
      "department_id",
      "position_id",
      "supervisor_employee_id",
      "employment_type",
      "date_hired",
      "notes",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = cleanString(body[field]);
      }
    }

    for (const field of ["employee_number", "first_name", "last_name"]) {
      if (
        Object.prototype.hasOwnProperty.call(updates, field) &&
        !updates[field]
      ) {
        return sendError(
          res,
          400,
          `${field.replaceAll("_", " ")} is required.`,
        );
      }
    }

    if (
      updates.employment_type &&
      !EMPLOYMENT_TYPES.includes(updates.employment_type)
    ) {
      return sendError(res, 400, "Invalid employment type.");
    }

    for (const field of [
      "department_id",
      "position_id",
      "supervisor_employee_id",
    ]) {
      if (updates[field] && !validUUID(updates[field])) {
        return sendError(res, 400, `Invalid ${field}.`);
      }
    }

    for (const field of ["birth_date", "date_hired"]) {
      if (updates[field] && !validDate(updates[field])) {
        return sendError(res, 400, `Invalid ${field} format.`);
      }
    }

    if (!Object.keys(updates).length) {
      return sendError(res, 400, "No valid fields provided for update.");
    }

    const { data, error } = await supabaseAdmin
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select(EMPLOYEE_FIELDS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return sendError(res, 409, "Employee number or email already exists.");
      }

      throw error;
    }

    return res.json({
      success: true,
      message: "Employee updated successfully.",
      data,
    });
  } catch (error) {
    console.error("updateEmployee error:", error);
    return sendError(res, 500, "Unable to update employee.", error);
  }
}

// PATCH /api/employees/:id/status
export async function updateEmployeeStatus(req, res) {
  try {
    const { id } = req.params;
    const employmentStatus = cleanString(req.body?.employment_status);

    if (!validUUID(id)) {
      return sendError(res, 400, "Invalid employee ID.");
    }

    if (!EMPLOYEE_STATUSES.includes(employmentStatus)) {
      return sendError(res, 400, "Invalid employee status.");
    }

    const dateTerminated = ["resigned", "terminated"].includes(employmentStatus)
      ? manilaDate()
      : null;

    const { data, error } = await supabaseAdmin
      .from("employees")
      .update({
        employment_status: employmentStatus,
        date_terminated: dateTerminated,
      })
      .eq("id", id)
      .select(EMPLOYEE_FIELDS)
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: `Employee status updated to ${employmentStatus}.`,
      data,
    });
  } catch (error) {
    console.error("updateEmployeeStatus error:", error);
    return sendError(res, 500, "Unable to update employee status.", error);
  }
}

// PATCH /api/employees/:id/pin
export async function resetEmployeePin(req, res) {
  try {
    const { id } = req.params;
    const pin = String(req.body?.pin || "");

    if (!validUUID(id)) {
      return sendError(res, 400, "Invalid employee ID.");
    }

    if (!validPin(pin)) {
      return sendError(res, 400, "PIN must contain 4 to 8 digits.");
    }

    const pinHash = await bcrypt.hash(pin, 12);

    const { data, error } = await supabaseAdmin
      .from("employees")
      .update({
        pin_hash: pinHash,
        pin_changed_at: new Date().toISOString(),
        failed_pin_attempts: 0,
        locked_until: null,
      })
      .eq("id", id)
      .select(EMPLOYEE_FIELDS)
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: "Employee PIN reset successfully.",
      data,
    });
  } catch (error) {
    console.error("resetEmployeePin error:", error);
    return sendError(res, 500, "Unable to reset employee PIN.", error);
  }
}
