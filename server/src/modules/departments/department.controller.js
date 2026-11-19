import { supabaseAdmin } from "../../config/supabase.js";

function errorResponse(res, status, message, error = null) {
  return res.status(status).json({
    success: false,
    message,
    ...(error ? { error: error.message || String(error) } : {}),
  });
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result || null;
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

async function validateSupervisor(supervisorId) {
  if (!supervisorId) return { valid: true };

  if (!isUUID(supervisorId)) {
    return { valid: false, message: "Invalid supervisor account." };
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", supervisorId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return { valid: false, message: "Supervisor account was not found." };
  }

  if (data.role !== "supervisor") {
    return {
      valid: false,
      message: "Only accounts with the Supervisor role can be assigned.",
    };
  }

  if (!data.is_active) {
    return {
      valid: false,
      message: "Cannot assign an inactive supervisor account.",
    };
  }

  return { valid: true };
}

async function getDepartmentCounts() {
  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("department_id, employment_status")
    .not("department_id", "is", null);

  if (error) throw error;

  const counts = new Map();

  for (const employee of data || []) {
    const current = counts.get(employee.department_id) || {
      total: 0,
      active: 0,
    };

    current.total += 1;

    if (employee.employment_status === "active") {
      current.active += 1;
    }

    counts.set(employee.department_id, current);
  }

  return counts;
}

async function getDepartmentsWithCounts(query) {
  const [{ data: departments, error }, counts] = await Promise.all([
    query,
    getDepartmentCounts(),
  ]);

  if (error) throw error;

  const supervisorIds = [
    ...new Set(
      (departments || [])
        .map((department) => department.supervisor_profile_id)
        .filter(Boolean),
    ),
  ];

  let supervisors = [];

  if (supervisorIds.length) {
    const result = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", supervisorIds);

    if (result.error) throw result.error;
    supervisors = result.data || [];
  }

  const supervisorMap = new Map(
    supervisors.map((profile) => [profile.id, profile]),
  );

  return (departments || []).map((department) => {
    const employeeCount = counts.get(department.id) || {
      total: 0,
      active: 0,
    };

    return {
      ...department,
      supervisor: department.supervisor_profile_id
        ? supervisorMap.get(department.supervisor_profile_id) || null
        : null,
      employee_count: employeeCount.total,
      active_employee_count: employeeCount.active,
    };
  });
}

// GET /api/departments
export async function getDepartments(req, res) {
  try {
    const search = clean(req.query.search);
    const status = clean(req.query.status) || "all";

    let query = supabaseAdmin
      .from("departments")
      .select(
        "id, name, description, supervisor_profile_id, is_active, created_at, updated_at",
      )
      .order("name", { ascending: true });

    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    } else if (status !== "all") {
      return errorResponse(res, 400, "Invalid department status filter.");
    }

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();
      if (safeSearch) {
        query = query.or(
          `name.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`,
        );
      }
    }

    const data = await getDepartmentsWithCounts(query);

    return res.json({
      success: true,
      data,
      total: data.length,
    });
  } catch (error) {
    console.error("getDepartments error:", error);
    return errorResponse(res, 500, "Unable to retrieve departments.", error);
  }
}

// GET /api/departments/references
export async function getDepartmentReferences(req, res) {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "supervisor")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) throw error;

    return res.json({
      success: true,
      data: {
        supervisors: data || [],
      },
    });
  } catch (error) {
    console.error("getDepartmentReferences error:", error);
    return errorResponse(
      res,
      500,
      "Unable to retrieve department references.",
      error,
    );
  }
}

// GET /api/departments/:id
export async function getDepartment(req, res) {
  try {
    const { id } = req.params;

    if (!isUUID(id)) {
      return errorResponse(res, 400, "Invalid department ID.");
    }

    const { data: department, error } = await supabaseAdmin
      .from("departments")
      .select(
        "id, name, description, supervisor_profile_id, is_active, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    if (!department) {
      return errorResponse(res, 404, "Department not found.");
    }

    const [{ data: employees, error: employeeError }, supervisorResult] =
      await Promise.all([
        supabaseAdmin
          .from("employees")
          .select(
            `
            id,
            employee_number,
            first_name,
            middle_name,
            last_name,
            suffix,
            email,
            phone,
            position_id,
            employment_type,
            employment_status,
            date_hired,
            photo_url
          `,
          )
          .eq("department_id", id)
          .order("first_name", { ascending: true }),

        department.supervisor_profile_id
          ? supabaseAdmin
              .from("profiles")
              .select("id, full_name, email")
              .eq("id", department.supervisor_profile_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (employeeError) throw employeeError;
    if (supervisorResult.error) throw supervisorResult.error;

    const positionIds = [
      ...new Set(
        (employees || [])
          .map((employee) => employee.position_id)
          .filter(Boolean),
      ),
    ];

    let positions = [];

    if (positionIds.length) {
      const result = await supabaseAdmin
        .from("positions")
        .select("id, name")
        .in("id", positionIds);

      if (result.error) throw result.error;
      positions = result.data || [];
    }

    const positionMap = new Map(
      positions.map((position) => [position.id, position.name]),
    );

    const formattedEmployees = (employees || []).map((employee) => ({
      ...employee,
      position_name: positionMap.get(employee.position_id) || null,
    }));

    return res.json({
      success: true,
      data: {
        ...department,
        supervisor: supervisorResult.data || null,
        employees: formattedEmployees,
        employee_count: formattedEmployees.length,
        active_employee_count: formattedEmployees.filter(
          (employee) => employee.employment_status === "active",
        ).length,
      },
    });
  } catch (error) {
    console.error("getDepartment error:", error);
    return errorResponse(
      res,
      500,
      "Unable to retrieve department details.",
      error,
    );
  }
}

// POST /api/departments
export async function createDepartment(req, res) {
  try {
    const name = clean(req.body?.name);
    const description = clean(req.body?.description);
    const supervisorId = clean(req.body?.supervisor_profile_id);

    if (!name) {
      return errorResponse(res, 400, "Department name is required.");
    }

    if (name.length > 100) {
      return errorResponse(
        res,
        400,
        "Department name cannot exceed 100 characters.",
      );
    }

    const supervisorValidation = await validateSupervisor(supervisorId);

    if (!supervisorValidation.valid) {
      return errorResponse(res, 400, supervisorValidation.message);
    }

    const { data: existing, error: duplicateError } = await supabaseAdmin
      .from("departments")
      .select("id")
      .ilike("name", name)
      .limit(1);

    if (duplicateError) throw duplicateError;

    if (existing?.length) {
      return errorResponse(
        res,
        409,
        "A department with this name already exists.",
      );
    }

    const { data, error } = await supabaseAdmin
      .from("departments")
      .insert({
        name,
        description,
        supervisor_profile_id: supervisorId,
        is_active: true,
      })
      .select(
        "id, name, description, supervisor_profile_id, is_active, created_at, updated_at",
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse(
          res,
          409,
          "A department with this name already exists.",
        );
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Department created successfully.",
      data,
    });
  } catch (error) {
    console.error("createDepartment error:", error);
    return errorResponse(res, 500, "Unable to create department.", error);
  }
}

// PATCH /api/departments/:id
export async function updateDepartment(req, res) {
  try {
    const { id } = req.params;

    if (!isUUID(id)) {
      return errorResponse(res, 400, "Invalid department ID.");
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from("departments")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (findError) throw findError;

    if (!existing) {
      return errorResponse(res, 404, "Department not found.");
    }

    const updates = {};

    if (Object.hasOwn(req.body || {}, "name")) {
      const name = clean(req.body.name);

      if (!name) {
        return errorResponse(res, 400, "Department name is required.");
      }

      if (name.length > 100) {
        return errorResponse(
          res,
          400,
          "Department name cannot exceed 100 characters.",
        );
      }

      updates.name = name;
    }

    if (Object.hasOwn(req.body || {}, "description")) {
      updates.description = clean(req.body.description);
    }

    if (Object.hasOwn(req.body || {}, "supervisor_profile_id")) {
      const supervisorId = clean(req.body.supervisor_profile_id);
      const validation = await validateSupervisor(supervisorId);

      if (!validation.valid) {
        return errorResponse(res, 400, validation.message);
      }

      updates.supervisor_profile_id = supervisorId;
    }

    if (!Object.keys(updates).length) {
      return errorResponse(res, 400, "No valid department fields provided.");
    }

    if (updates.name) {
      const { data: duplicate, error } = await supabaseAdmin
        .from("departments")
        .select("id")
        .ilike("name", updates.name)
        .neq("id", id)
        .limit(1);

      if (error) throw error;

      if (duplicate?.length) {
        return errorResponse(
          res,
          409,
          "A department with this name already exists.",
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("departments")
      .update(updates)
      .eq("id", id)
      .select(
        "id, name, description, supervisor_profile_id, is_active, created_at, updated_at",
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse(
          res,
          409,
          "A department with this name already exists.",
        );
      }
      throw error;
    }

    return res.json({
      success: true,
      message: "Department updated successfully.",
      data,
    });
  } catch (error) {
    console.error("updateDepartment error:", error);
    return errorResponse(res, 500, "Unable to update department.", error);
  }
}

// PATCH /api/departments/:id/status
export async function updateDepartmentStatus(req, res) {
  try {
    const { id } = req.params;
    const isActive = req.body?.is_active;

    if (!isUUID(id)) {
      return errorResponse(res, 400, "Invalid department ID.");
    }

    if (typeof isActive !== "boolean") {
      return errorResponse(res, 400, "is_active must be true or false.");
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from("departments")
      .select("id, is_active")
      .eq("id", id)
      .maybeSingle();

    if (findError) throw findError;

    if (!existing) {
      return errorResponse(res, 404, "Department not found.");
    }

    if (!isActive) {
      const { count, error } = await supabaseAdmin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("department_id", id)
        .eq("employment_status", "active");

      if (error) throw error;

      if ((count || 0) > 0) {
        return errorResponse(
          res,
          409,
          `This department still has ${count} active employee(s). Reassign or deactivate them first.`,
        );
      }
    }

    const { data, error } = await supabaseAdmin
      .from("departments")
      .update({ is_active: isActive })
      .eq("id", id)
      .select(
        "id, name, description, supervisor_profile_id, is_active, created_at, updated_at",
      )
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: `Department ${isActive ? "activated" : "deactivated"} successfully.`,
      data,
    });
  } catch (error) {
    console.error("updateDepartmentStatus error:", error);
    return errorResponse(
      res,
      500,
      "Unable to update department status.",
      error,
    );
  }
}
