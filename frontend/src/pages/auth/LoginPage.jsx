import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

/**
 * Brand palette (same as Dashboard): white + blue + red, grays for neutrals.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #F7FAFE
 *   Red  #C8102E · Light red #FDECEF · Border #E3EAF5
 */
const BRAND = {
  systemName: "Warehouse Workforce Management",
  rcsLogo:
    "https://royalecoldstorage.com.ph/wp-content/uploads/2024/07/royal-cold-storage-logo-2022.webp",
  redRibbonLogo:
    "https://upload.wikimedia.org/wikipedia/en/5/58/Red_Ribbon_Bakeshop_Logo.webp",
};

export default function LoginPage() {
  const { user, login, loading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setSubmitting(true);

    try {
      await login(email.trim(), password);

      const destination = location.state?.from?.pathname || "/dashboard";

      navigate(destination, { replace: true });
    } catch (err) {
      setError(
        err.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : err.message || "Unable to sign in. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyEvent = (event) => {
    if (typeof event.getModifierState === "function") {
      setCapsLock(event.getModifierState("CapsLock"));
    }
  };

  const inputClass = `h-12 w-full rounded-xl border bg-white text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1D63D6] focus:ring-4 focus:ring-[#1D63D6]/10 disabled:bg-slate-50 disabled:text-slate-400 ${
    error ? "border-[#F5C2CA]" : "border-[#E3EAF5]"
  }`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7FAFE] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-[0_8px_30px_rgba(11,58,140,0.08)]">
          {/* Ribbon accent: red tab + blue line */}
          <div className="flex h-1.5">
            <div className="w-24 bg-[#C8102E]" />
            <div className="flex-1 bg-[#1D63D6]" />
          </div>

          <div className="p-6 sm:p-8">
            {/* Logos */}
            <div className="flex items-center justify-center gap-5">
              <img
                src={BRAND.rcsLogo}
                alt="Royale Cold Storage"
                className="h-12 w-auto max-w-[160px] object-contain"
              />
              <span className="h-9 w-px bg-[#E3EAF5]" />
              <img
                src={BRAND.redRibbonLogo}
                alt="Red Ribbon"
                className="h-12 w-auto max-w-[130px] object-contain"
              />
            </div>

            <div className="mt-7 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-[#0B3A8C]">
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Sign in to {BRAND.systemName}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>

                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    required
                    disabled={submitting}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    aria-invalid={Boolean(error)}
                    className={`${inputClass} pl-11 pr-4`}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={handleKeyEvent}
                    onKeyDown={handleKeyEvent}
                    onBlur={() => setCapsLock(false)}
                    placeholder="Enter your password"
                    aria-invalid={Boolean(error)}
                    className={`${inputClass} pl-11 pr-12`}
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:text-[#1D63D6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6]"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {capsLock && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#C8102E]">
                    <AlertTriangle size={13} />
                    Caps Lock is on
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-[#F5C2CA] bg-[#FDECEF] px-4 py-3"
                >
                  <AlertTriangle
                    size={18}
                    className="mt-0.5 shrink-0 text-[#C8102E]"
                  />
                  <p className="text-sm font-medium text-[#8E0B20]">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1D63D6] text-sm font-semibold text-white transition hover:bg-[#0B3A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-slate-500">
          Authorized management personnel only.
          <br />
          Contact your system administrator if you need access.
        </p>
      </div>
    </main>
  );
}
