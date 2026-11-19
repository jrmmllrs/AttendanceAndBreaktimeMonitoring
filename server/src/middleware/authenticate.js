import { supabaseAdmin } from "../config/supabase.js";

export async function authenticate(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const token = authorization.slice(7).trim();

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error("AUTH VERIFICATION ERROR:", authError?.message);

      return res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired.",
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("PROFILE QUERY ERROR:", {
        message: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
      });

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve your account profile.",
        error: profileError.message,
        code: profileError.code,
      });
    }

    if (!profile) {
      return res.status(403).json({
        success: false,
        message: "Account profile not found.",
      });
    }

    if (!profile.is_active) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive.",
      });
    }

    const allowedRoles = ["admin", "hr", "supervisor"];

    if (!allowedRoles.includes(profile.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have management access.",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: profile.full_name,
      role: profile.role,
      isActive: profile.is_active,
    };

    next();
  } catch (error) {
    console.error("AUTHENTICATION MIDDLEWARE ERROR:", error);

    next(error);
  }
}
