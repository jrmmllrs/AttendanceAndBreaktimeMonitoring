import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const { user, login, loading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#102c32] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full border border-white/10" />
        <div className="absolute -bottom-48 -left-24 h-[500px] w-[500px] rounded-full border border-white/10" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500">
            <Warehouse size={23} />
          </div>
          <div>
            <p className="font-semibold tracking-tight">Workforce</p>
            <p className="text-xs text-teal-100/60">Warehouse Management</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-teal-100">
            <ShieldCheck size={14} />
            Workforce operations platform
          </div>

          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight xl:text-5xl">
            A better way to manage your warehouse workforce.
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-slate-300">
            Keep attendance, shift schedules, and breaktime operations organized
            in one reliable workspace.
          </p>

          <div className="mt-12 grid max-w-md grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Attendance</p>
              <p className="mt-1 text-xs text-slate-400">
                Track working hours and activity
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium">Breaktime</p>
              <p className="mt-1 text-xs text-slate-400">
                Monitor scheduled and actual breaks
              </p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          © {new Date().getFullYear()} Workforce Management System
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
              <Warehouse size={23} />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Workforce</p>
              <p className="text-xs text-slate-500">Warehouse Management</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-teal-700">
              MANAGEMENT PORTAL
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to access your workforce dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email address
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Password
                </label>
              </div>

              <div className="relative">
                <LockKeyhole
                  size={18}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-12 text-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-6">
            <p className="text-center text-xs leading-5 text-slate-400">
              Authorized management personnel only.
              <br />
              Contact your system administrator if you need access.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
