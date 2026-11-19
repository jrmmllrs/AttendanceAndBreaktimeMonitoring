
import { supabaseAdmin } from "../../config/supabase.js";

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const cleanText = (value) => String(value ?? "").trim();

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? ""),
  );

const toPositiveInteger = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const parseBoolean = (value) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};

const getErrorMessage = (error) =>
  error?.message || "Something went wrong. Please try again.";

const timeToMinutes = (value) => {
  if (!value || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;

  const [hours, minutes] = value.split(":").map(Number);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

const getShiftDuration = (shift) => {
  const start = timeToMinutes(shift.start_time);
  const end = timeToMinutes(shift.end_time);

  if (start === null || end === null) return null;

  let duration = end - start;

  if (duration <= 0) duration += 24 * 60;

  return duration;
};

// -----------------------------------------------------
// Break Types
// -----------------------------------------------------

export const getBreakTypes = async (req, res) => {
  try {
    const search = cleanText(req.query.search);
    const status = req.query.status || "all";

    let query = supabaseAdmin
      .from("break_types")
      .select("*")
      .order("name", { ascending: true });

    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);

    const { data, error } = await query;

    if (error) throw error;

    const filtered = (data || []).filter((item) => {
      if (!search) return true;

      const text = [item.name, item.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search.toLowerCase());
    });

    return res.json({
      success: true,
      data: filtered,
    });
  } catch (error) {
    console.error("getBreakTypes:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

export const createBreakType = async (req, res) => {
  try {
    const name = cleanText(req.body.name);
    const description = cleanText(req.body.description) || null;

    const allowedDuration = toPositiveInteger(
      req.body.allowed_duration_minutes,
    );

    const isPaid = parseBoolean(req.body.is_paid);

    if (!name) {
      return sendError(res, 400, "Break type name is required.");
    }

    if (name.length > 100) {
      return sendError(res, 400, "Break type name is too long.");
    }

    if (!allowedDuration) {
      return sendError(
        res,
        400,
        "Allowed duration must be a positive number of minutes.",
      );
    }

    if (isPaid === null) {
      return sendError(res, 400, "Please specify whether this break is paid.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("break_types")
      .select("id")
      .ilike("name", name)
      .limit(1);

    if (existingError) throw existingError;

    if (existing?.length) {
      return sendError(
        res,
        409,
        "A break type with this name already exists.",
      );
    }

    const { data, error } = await supabaseAdmin
      .from("break_types")
      .insert({
        name,
        description,
        allowed_duration_minutes: allowedDuration,
        is_paid: isPaid,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: "Break type created successfully.",
      data,
    });
  } catch (error) {
    console.error("createBreakType:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

export const updateBreakType = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return sendError(res, 400, "Invalid break type ID.");
    }

    const updates = {};

    if (req.body.name !== undefined) {
      const name = cleanText(req.body.name);

      if (!name || name.length > 100) {
        return sendError(
          res,
          400,
          "Please provide a valid break type name.",
        );
      }

      const { data: duplicate, error: duplicateError } = await supabaseAdmin
        .from("break_types")
        .select("id")
        .ilike("name", name)
        .neq("id", id)
        .limit(1);

      if (duplicateError) throw duplicateError;

      if (duplicate?.length) {
        return sendError(
          res,
          409,
          "Another break type already uses this name.",
        );
      }

      updates.name = name;
    }

    if (req.body.description !== undefined) {
      updates.description = cleanText(req.body.description) || null;
    }

    if (req.body.allowed_duration_minutes !== undefined) {
      const duration = toPositiveInteger(
        req.body.allowed_duration_minutes,
      );

      if (!duration) {
        return sendError(
          res,
          400,
          "Allowed duration must be a positive number.",
        );
      }

      updates.allowed_duration_minutes = duration;
    }

    if (req.body.is_paid !== undefined) {
      const isPaid = parseBoolean(req.body.is_paid);

      if (isPaid === null) {
        return sendError(res, 400, "Invalid paid/unpaid value.");
      }

      updates.is_paid = isPaid;
    }

    if (!Object.keys(updates).length) {
      return sendError(res, 400, "No valid fields were provided.");
    }

    const { data, error } = await supabaseAdmin
      .from("break_types")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return sendError(res, 404, "Break type not found.");
      }

      throw error;
    }

    return res.json({
      success: true,
      message: "Break type updated successfully.",
      data,
    });
  } catch (error) {
    console.error("updateBreakType:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

export const updateBreakTypeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const isActive = parseBoolean(req.body.is_active);

    if (!isUuid(id)) {
      return sendError(res, 400, "Invalid break type ID.");
    }

    if (isActive === null) {
      return sendError(res, 400, "A valid active status is required.");
    }

    const { data, error } = await supabaseAdmin
      .from("break_types")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return sendError(res, 404, "Break type not found.");
      }

      throw error;
    }

    return res.json({
      success: true,
      message: `Break type ${isActive ? "activated" : "deactivated"} successfully.`,
      data,
    });
  } catch (error) {
    console.error("updateBreakTypeStatus:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

// -----------------------------------------------------
// References for frontend dropdowns
// -----------------------------------------------------

export const getBreaktimeReferences = async (req, res) => {
  try {
    const [shiftsResult, departmentsResult, typesResult] = await Promise.all([
      supabaseAdmin
        .from("shifts")
        .select("id, name, start_time, end_time, is_overnight")
        .eq("is_active", true)
        .order("name"),

      supabaseAdmin
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),

      supabaseAdmin
        .from("break_types")
        .select("id, name, allowed_duration_minutes, is_paid")
        .eq("is_active", true)
        .order("name"),
    ]);

    if (shiftsResult.error) throw shiftsResult.error;
    if (departmentsResult.error) throw departmentsResult.error;
    if (typesResult.error) throw typesResult.error;

    return res.json({
      success: true,
      data: {
        shifts: shiftsResult.data || [],
        departments: departmentsResult.data || [],
        breakTypes: typesResult.data || [],
      },
    });
  } catch (error) {
    console.error("getBreaktimeReferences:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

// -----------------------------------------------------
// Break Schedules
// -----------------------------------------------------

export const getBreakSchedules = async (req, res) => {
  try {
    const search = cleanText(req.query.search).toLowerCase();
    const shiftId = req.query.shift_id;
    const departmentId = req.query.department_id;
    const status = req.query.status || "all";

    let query = supabaseAdmin
      .from("break_schedules")
      .select("*")
      .order("shift_id")
      .order("sequence_number", { ascending: true });

    if (shiftId && shiftId !== "all") {
      query = query.eq("shift_id", shiftId);
    }

    if (departmentId && departmentId !== "all") {
      query = query.or(
        `department_id.eq.${departmentId},department_id.is.null`,
      );
    }

    if (status === "active") query = query.eq("is_active", true);
    if (status === "inactive") query = query.eq("is_active", false);

    const { data: schedules, error } = await query;

    if (error) throw error;

    const [shiftsResult, typesResult, departmentsResult] = await Promise.all([
      supabaseAdmin.from("shifts").select("id, name, start_time, end_time"),
      supabaseAdmin.from("break_types").select("id, name, is_paid"),
      supabaseAdmin.from("departments").select("id, name"),
    ]);

    if (shiftsResult.error) throw shiftsResult.error;
    if (typesResult.error) throw typesResult.error;
    if (departmentsResult.error) throw departmentsResult.error;

    const shifts = new Map(
      (shiftsResult.data || []).map((item) => [item.id, item]),
    );

    const types = new Map(
      (typesResult.data || []).map((item) => [item.id, item]),
    );

    const departments = new Map(
      (departmentsResult.data || []).map((item) => [item.id, item]),
    );

    let result = (schedules || []).map((schedule) => ({
      ...schedule,
      shift: shifts.get(schedule.shift_id) || null,
      break_type: types.get(schedule.break_type_id) || null,
      department: schedule.department_id
        ? departments.get(schedule.department_id) || null
        : null,
    }));

    if (search) {
      result = result.filter((item) =>
        [
          item.name,
          item.shift?.name,
          item.break_type?.name,
          item.department?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(search),
      );
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("getBreakSchedules:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

// -----------------------------------------------------
// Flexible Break Schedule Validation
// -----------------------------------------------------

const validateSchedule = async (body) => {
  const name = cleanText(body.name);
  const shiftId = body.shift_id;
  const breakTypeId = body.break_type_id;
  const departmentId = body.department_id || null;

  const sequence = toPositiveInteger(body.sequence_number);
  const duration = toPositiveInteger(body.duration_minutes);

  const maxOccurrencesRaw = body.max_occurrences_per_shift;

  const maxOccurrences =
    maxOccurrencesRaw === "" ||
    maxOccurrencesRaw === null ||
    maxOccurrencesRaw === undefined
      ? null
      : toPositiveInteger(maxOccurrencesRaw);

  if (!name) {
    return { error: "Schedule name is required." };
  }

  if (name.length > 100) {
    return { error: "Schedule name is too long." };
  }

  if (!isUuid(shiftId)) {
    return { error: "Please select a valid shift." };
  }

  if (!isUuid(breakTypeId)) {
    return { error: "Please select a valid break type." };
  }

  if (departmentId && !isUuid(departmentId)) {
    return { error: "Please select a valid department." };
  }

  if (!sequence || sequence > 32767) {
    return {
      error: "Display order must be a positive whole number.",
    };
  }

  if (!duration) {
    return {
      error: "Break duration must be a positive number.",
    };
  }

  if (
    maxOccurrencesRaw !== "" &&
    maxOccurrencesRaw !== null &&
    maxOccurrencesRaw !== undefined &&
    !maxOccurrences
  ) {
    return {
      error: "Maximum breaks must be a positive whole number or left blank.",
    };
  }

  const [shiftResult, typeResult, departmentResult] = await Promise.all([
    supabaseAdmin
      .from("shifts")
      .select("id, name, start_time, end_time, is_active")
      .eq("id", shiftId)
      .maybeSingle(),

    supabaseAdmin
      .from("break_types")
      .select("id, name, is_active")
      .eq("id", breakTypeId)
      .maybeSingle(),

    departmentId
      ? supabaseAdmin
          .from("departments")
          .select("id, is_active")
          .eq("id", departmentId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (shiftResult.error) throw shiftResult.error;
  if (typeResult.error) throw typeResult.error;
  if (departmentResult.error) throw departmentResult.error;

  if (!shiftResult.data || !shiftResult.data.is_active) {
    return {
      error: "Selected shift does not exist or is inactive.",
    };
  }

  if (!typeResult.data || !typeResult.data.is_active) {
    return {
      error: "Selected break type does not exist or is inactive.",
    };
  }

  if (
    departmentId &&
    (!departmentResult.data || !departmentResult.data.is_active)
  ) {
    return {
      error: "Selected department does not exist or is inactive.",
    };
  }

  const shiftDuration = getShiftDuration(shiftResult.data);

  if (shiftDuration === null) {
    return {
      error: "The selected shift has invalid start/end times.",
    };
  }

  if (duration > shiftDuration) {
    return {
      error: `Break duration cannot exceed the selected shift duration (${shiftDuration} minutes).`,
    };
  }

  return {
    value: {
      name,
      shift_id: shiftId,
      break_type_id: breakTypeId,
      department_id: departmentId,
      sequence_number: sequence,

      // Kept for compatibility with the existing database column.
      // Flexible breaks do not use a fixed start offset.
      start_offset_minutes: 0,

      duration_minutes: duration,
      max_occurrences_per_shift: maxOccurrences,
    },
  };
};

// -----------------------------------------------------
// Create Break Schedule
// -----------------------------------------------------

export const createBreakSchedule = async (req, res) => {
  try {
    const validation = await validateSchedule(req.body);

    if (validation.error) {
      return sendError(res, 400, validation.error);
    }

    const { data, error } = await supabaseAdmin
      .from("break_schedules")
      .insert({
        ...validation.value,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: "Flexible break rule created successfully.",
      data,
    });
  } catch (error) {
    console.error("createBreakSchedule:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

// -----------------------------------------------------
// Update Break Schedule
// -----------------------------------------------------

export const updateBreakSchedule = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return sendError(res, 400, "Invalid break schedule ID.");
    }

    const validation = await validateSchedule(req.body);

    if (validation.error) {
      return sendError(res, 400, validation.error);
    }

    const { data, error } = await supabaseAdmin
      .from("break_schedules")
      .update(validation.value)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return sendError(res, 404, "Break schedule not found.");
      }

      throw error;
    }

    return res.json({
      success: true,
      message: "Flexible break rule updated successfully.",
      data,
    });
  } catch (error) {
    console.error("updateBreakSchedule:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};

// -----------------------------------------------------
// Update Break Schedule Status
// -----------------------------------------------------

export const updateBreakScheduleStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const isActive = parseBoolean(req.body.is_active);

    if (!isUuid(id)) {
      return sendError(res, 400, "Invalid break schedule ID.");
    }

    if (isActive === null) {
      return sendError(res, 400, "A valid active status is required.");
    }

    const { data, error } = await supabaseAdmin
      .from("break_schedules")
      .update({ is_active: isActive })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return sendError(res, 404, "Break schedule not found.");
      }

      throw error;
    }

    return res.json({
      success: true,
      message: `Break schedule ${isActive ? "activated" : "deactivated"} successfully.`,
      data,
    });
  } catch (error) {
    console.error("updateBreakScheduleStatus:", error);
    return sendError(res, 500, getErrorMessage(error));
  }
};