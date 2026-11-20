import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  Coffee,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext";

/**
 * Palette (same as DashboardPage): white + blue + red.
 *   Blue #1D63D6 · Deep blue #0B3A8C · Light blue #EAF1FD / #F7FAFE
 *   Red #C8102E · Border #E3EAF5 · Page background #F4F8FE
 *
 * Tip: ilipat ang BRAND sa shared file (e.g. src/lib/brand.js)
 * para iisa lang ang source ng logo URL sa Dashboard at Layout.
 */
const BRAND = {
  rcsLogo:
    "https://royalecoldstorage.com.ph/wp-content/uploads/2024/07/royal-cold-storage-logo-2022.webp",
};

const SIDEBAR_KEY = "sidebar-collapsed";
const WIDTH_OPEN = 258;
const WIDTH_COLLAPSED = 76;

const navigation = [
  {
    title: "Overview",
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
    title: "Management Tools",
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
    title: "Time & attendance",
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

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

/* ---------- User menu (header) ---------- */

function UserMenu({ user, initial, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {/* <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-xl py-1 pl-2 pr-2 transition hover:bg-[#F7FAFE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6]"
      >
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium text-slate-700">{user?.fullName}</p>
          <p className="text-[11px] capitalize text-slate-500">{user?.role}</p>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1D63D6] text-sm font-semibold text-white">
          {initial}
        </div>

        <ChevronDown
          size={15}
          className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button> */}

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-[#E3EAF5] bg-white shadow-lg shadow-[#0B3A8C]/10"
        >
          <div className="border-b border-[#EEF3FB] px-4 py-3">
            <p className="truncate text-sm font-semibold text-[#0B3A8C]">
              {user?.fullName || "User"}
            </p>
            <p className="mt-0.5 text-xs capitalize text-slate-500">
              {user?.role || "Management"}
            </p>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-sm font-medium text-[#C8102E] transition hover:bg-[#FDECEF] focus:outline-none focus-visible:bg-[#FDECEF]"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Layout ---------- */

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const initial = user?.fullName?.charAt(0)?.toUpperCase() || "U";

  // Breadcrumb: find the nav item (and its group) for the current route
  const current = navigation
    .flatMap((group) =>
      group.items.map((item) => ({ group: group.title, item })),
    )
    .find(
      ({ item }) =>
        location.pathname === item.path ||
        location.pathname.startsWith(`${item.path}/`),
    );

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable: keep in memory only */
      }
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // isCollapsed is always false for the mobile drawer
  const renderSidebar = (isCollapsed) => (
    <div className="flex h-full flex-col bg-white">
      {/* Brand */}
      <div
        className={`relative flex h-[76px] shrink-0 items-center border-b border-[#E3EAF5] ${
          isCollapsed ? "justify-center px-2" : "gap-3 px-6"
        }`}
      >
        {/* Red ribbon tab, same accent as the dashboard header */}
        <span
          className={`absolute left-0 top-0 h-1.5 bg-[#C8102E] ${
            isCollapsed ? "w-10" : "w-16"
          }`}
        />

        {isCollapsed ? (
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1D63D6] text-sm font-bold tracking-tight text-white"
            title="Royale Cold Storage"
          >
            RCS
          </span>
        ) : (
          <img
            src={BRAND.rcsLogo}
            alt="Royale Cold Storage"
            className="h-11 w-auto max-w-[150px] object-contain"
          />
        )}

        {!isCollapsed && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-[#F7FAFE] lg:hidden"
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={`flex-1 overflow-y-auto py-5 ${
          isCollapsed ? "space-y-3 px-3" : "space-y-6 px-4"
        }`}
        aria-label="Main navigation"
      >
        {navigation.map((group, groupIndex) => {
          const visibleItems = group.items.filter((item) =>
            item.roles.includes(user?.role),
          );

          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              {isCollapsed ? (
                groupIndex > 0 && (
                  <div className="mx-2 mb-3 border-t border-[#EEF3FB]" />
                )
              ) : (
                <p className="mb-2 px-3 text-xs font-semibold text-slate-400">
                  {group.title}
                </p>
              )}

              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `relative flex items-center rounded-xl py-2.5 text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] ${
                          isCollapsed ? "justify-center px-0" : "gap-3 px-3"
                        } ${
                          isActive
                            ? "bg-[#EAF1FD] text-[#1D63D6]"
                            : "text-slate-600 hover:bg-[#F7FAFE] hover:text-[#0B3A8C]"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              className={`absolute bottom-2 top-2 w-1 rounded-r-full bg-[#C8102E] ${
                                isCollapsed ? "-left-3" : "-left-4"
                              }`}
                            />
                          )}
                          <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                          {!isCollapsed && item.label}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User profile */}
      <div className="shrink-0 border-t border-[#E3EAF5] p-4">
        {isCollapsed ? (
          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-[#FDECEF] hover:text-[#C8102E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]"
          >
            <LogOut size={18} />
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl bg-[#F7FAFE] p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1D63D6] text-sm font-semibold text-white">
              {initial}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#0B3A8C]">
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
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-[#C8102E] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8102E]"
            >
              <LogOut size={17} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F8FE]">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-lg bg-[#1D63D6] px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden border-r border-[#E3EAF5] transition-[width] duration-200 lg:block"
        style={{ width: collapsed ? WIDTH_COLLAPSED : WIDTH_OPEN }}
      >
        {renderSidebar(collapsed)}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#0B3A8C]/40"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation overlay"
          />

          <aside className="relative h-full w-[280px] shadow-2xl">
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      {/* Main workspace */}
      <div
        className="transition-[padding] duration-200 lg:pl-[var(--sidebar-w)]"
        style={{
          "--sidebar-w": `${collapsed ? WIDTH_COLLAPSED : WIDTH_OPEN}px`,
        }}
      >
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between gap-3 border-b border-[#E3EAF5] bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-[#F7FAFE] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>

            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden rounded-lg p-2 text-slate-500 hover:bg-[#F7FAFE] hover:text-[#1D63D6] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D63D6] lg:block"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>

            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="min-w-0 pl-1">
              <ol className="flex items-center gap-1.5 text-sm">
                <li className="hidden text-slate-500 sm:block">
                  {current?.group || "Workspace"}
                </li>
                <li
                  className="hidden text-slate-300 sm:block"
                  aria-hidden="true"
                >
                  <ChevronRight size={14} />
                </li>
                <li
                  className="truncate font-semibold text-[#0B3A8C]"
                  aria-current="page"
                >
                  {current?.item.label || "Warehouse Operations"}
                </li>
              </ol>
            </nav>
          </div>

          <UserMenu user={user} initial={initial} onLogout={handleLogout} />
        </header>

        {/* Page content */}
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1600px] p-5 sm:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
