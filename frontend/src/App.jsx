import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./routes/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";

import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import EmployeesPage from "./pages/employees/EmployeesPage";
import DepartmentsPage from "./pages/departments/DepartmentsPage";
import ShiftsPage from "./pages/shifts/ShiftsPage";
import BreaktimePage from "./pages/breaktime/BreaktimePage";
import AttendanceManagementPage from "./pages/attendance/AttendanceManagementPage";
import BreaktimeMonitoringPage from "./pages/attendance/BreaktimeMonitoringPage";
import LiveMonitoringPage from "./pages/monitoring/LiveMonitoringPage";

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

function PlaceholderPage({ title }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <p className="text-xs font-semibold tracking-widest text-teal-700">
        WORKFORCE MANAGEMENT
      </p>

      <h1 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h1>

      <p className="mt-2 text-sm text-slate-500">
        This module will be implemented in an upcoming development phase.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* Overview */}
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Attendance Management */}
          <Route path="/attendance" element={<AttendanceManagementPage />} />

          {/* Breaktime Monitoring: Admin, HR, Supervisor */}
          <Route path="/breaks" element={<BreaktimeMonitoringPage />} />

          {/* Admin and HR only */}
          <Route element={<ProtectedRoute allowedRoles={["admin", "hr"]} />}>
            <Route path="/employees" element={<EmployeesPage />} />

            <Route path="/departments" element={<DepartmentsPage />} />

            <Route path="/shifts" element={<ShiftsPage />} />

            <Route path="/breaktime" element={<BreaktimePage />} />
          </Route>

          {/* Upcoming modules */}
          {/* Live Monitoring */}
          <Route path="/monitoring" element={<LiveMonitoringPage />} />
          <Route
            path="/notifications"
            element={<PlaceholderPage title="Notifications" />}
          />

          {/* Admin only */}
          <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
            <Route
              path="/users"
              element={<PlaceholderPage title="User Management" />}
            />

            <Route
              path="/settings"
              element={<PlaceholderPage title="Settings" />}
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
