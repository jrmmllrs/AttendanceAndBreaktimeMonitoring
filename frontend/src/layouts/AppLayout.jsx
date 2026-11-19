import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Clock3,
  Coffee,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useState } from "react";

import { useAuth } from "../context/AuthContext";

const navigation = [
  {
    title: "OVERVIEW",
    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: LayoutDashboard,
        roles: ["admin", "hr", "supervisor"],
      },
      {
        label: "Live Monitoring",
        path: "/monitoring",
        icon: Activity,
        roles: ["admin", "hr", "supervisor"],
      },
    ],
  },
  {
    title: "WORKFORCE",
    items: [
      {
        label: "Employees",
        path: "/employees",
        icon: Users,
        roles: ["admin", "hr"],
      },
      {
        label: "Departments",
        path: "/departments",
        icon: Warehouse,
        roles: ["admin", "hr"],
      },
      {
        label: "Shift Management",
        path: "/shifts",
        icon: CalendarDays,
        roles: ["admin", "hr"],
      },
      {
        label: "Breaktime Management",
        path: "/breaktime",
        icon: Coffee,
        roles: ["admin", "hr"],
      },
    ],
  },
  {
    title: "TIME & ATTENDANCE",
    items: [
      {
        label: "Attendance Records",
        path: "/attendance",
        icon: Clock3,
        roles: ["admin", "hr", "supervisor"],
      },
      {
        label: "Breaktime Monitoring",
        path: "/breaks",
        icon: ClipboardList,
        roles: ["admin", "hr", "supervisor"],
      },
    ],
  },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      {/* Brand */}
      <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white">
          <Warehouse size={21} />
        </div>

        <div>
          <p className="font-semibold tracking-tight text-slate-900">
            Workforce
          </p>
          <p className="text-[11px] text-slate-400">Management System</p>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="ml-auto text-slate-500 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-7 overflow-y-auto px-4 py-6">
        {navigation.map((group) => {
          const visibleItems = group.items.filter((item) =>
            item.roles.includes(user?.role),
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.13em] text-slate-400">
                {group.title}
              </p>

              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                          isActive
                            ? "bg-teal-50 text-teal-800"
                            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                        }`
                      }
                    >
                      <Icon size={18} strokeWidth={1.8} />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">
            {user?.fullName?.charAt(0)?.toUpperCase() || "U"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {user?.fullName || "User"}
            </p>

            <p className="text-xs capitalize text-slate-500">
              {user?.role || "Management"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-red-600"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f5f7f9]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[258px] border-r border-slate-200/80 lg:block">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />

          <aside className="relative h-full w-[280px] shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main workspace */}
      <div className="lg:pl-[258px]">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <div>
              <p className="text-sm font-semibold text-slate-800">
                Warehouse Operations
              </p>

              <p className="text-xs text-slate-400">
                Workforce management workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-slate-700">
                {user?.fullName}
              </p>

              <p className="text-[11px] capitalize text-slate-400">
                {user?.role}
              </p>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-sm font-semibold text-teal-800">
              {user?.fullName?.charAt(0)?.toUpperCase() || "U"}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-[1600px] p-5 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
