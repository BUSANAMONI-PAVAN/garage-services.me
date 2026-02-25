import { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Wrench,
  LayoutDashboard,
  CalendarPlus,
  Clock,
  Users,
  Settings,
  LogOut,
  Moon,
  Sun,
  Bell,
  ChevronRight,
  Menu,
  X,
  User,
  ShieldCheck,
} from 'lucide-react';
import { getStoredUser } from '../lib/api';
import { useTheme } from '../lib/ThemeContext';

/* ── Navigation Links ── */
const navLinks = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['Customer', 'Worker', 'Manager'] },
  { to: '/booking', icon: CalendarPlus, label: 'New Booking', roles: ['Customer', 'Worker', 'Manager'] },
  { to: '/history', icon: Clock, label: 'History', roles: ['Customer', 'Worker', 'Manager'] },
  { to: '/manage-workers', icon: Users, label: 'Manage Workers', roles: ['Manager'] },
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['Customer', 'Worker', 'Manager'] },
];

const roleBadgeColors: Record<string, string> = {
  Customer: 'bg-blue-500/20 text-blue-400',
  Worker: 'bg-amber-500/20 text-amber-400',
  Manager: 'bg-violet-500/20 text-violet-400',
};

const roleIcons: Record<string, typeof User> = {
  Customer: User,
  Worker: Wrench,
  Manager: ShieldCheck,
};

const pathTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/booking': 'New Booking',
  '/history': 'Booking History',
  '/manage-workers': 'Manage Workers',
  '/settings': 'Settings',
};

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const role = user?.role || 'Customer';
  const { prefs, update } = useTheme();
  const compact = prefs.compactSidebar;
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleLinks = navLinks.filter((l) => l.roles.includes(role));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const RoleIcon = roleIcons[role] || User;
  const pageTitle = pathTitles[location.pathname] || 'Dashboard';

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: prefs.darkMode ? 'var(--background)' : undefined }}
    >
      {/* ── Desktop Sidebar ── */}
      <aside
        className={`${
          compact ? 'w-[72px]' : 'w-64'
        } bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white flex flex-col shadow-2xl transition-all duration-300 relative z-30 hidden md:flex`}
        style={{
          background: prefs.darkMode
            ? 'linear-gradient(to bottom, var(--sidebar-from), var(--sidebar-to))'
            : undefined,
        }}
      >
        {/* Logo */}
        <div className="p-5 border-b border-slate-700/30">
          <div className={`flex items-center ${compact ? 'justify-center' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 flex-shrink-0">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            {!compact && (
              <div>
                <h1 className="font-bold text-lg leading-tight tracking-tight">Garage</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                  Service Manager
                </p>
              </div>
            )}
          </div>
        </div>

        {!compact && (
          <p className="px-6 pt-5 pb-2 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
            Navigation
          </p>
        )}

        {/* Nav Links */}
        <nav className={`flex-1 ${compact ? 'px-2' : 'px-3'} space-y-0.5 ${compact ? 'pt-4' : ''}`}>
          {visibleLinks.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group flex items-center ${
                  compact ? 'justify-center' : 'gap-3'
                } px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 relative ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`
              }
              title={compact ? label : undefined}
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {!compact && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Dark Mode Toggle */}
        <div className={`${compact ? 'px-2' : 'px-3'} pb-2`}>
          <button
            onClick={() => update('darkMode', !prefs.darkMode)}
            className={`flex items-center ${
              compact ? 'justify-center' : 'gap-3'
            } w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 text-slate-400 hover:bg-white/5 hover:text-white`}
            title={prefs.darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {prefs.darkMode ? (
              <Sun className="w-[18px] h-[18px] text-amber-400 flex-shrink-0" />
            ) : (
              <Moon className="w-[18px] h-[18px] text-slate-400 flex-shrink-0" />
            )}
            {!compact && (prefs.darkMode ? 'Light Mode' : 'Dark Mode')}
          </button>
        </div>

        {/* User Profile */}
        <div className={`${compact ? 'p-2' : 'p-3'} border-t border-slate-700/30`}>
          <div
            className={`flex items-center ${
              compact ? 'justify-center flex-col gap-2' : 'gap-3'
            } p-2.5 rounded-xl bg-white/5`}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ring-2 ring-emerald-400/20">
              {user?.fullName?.[0] || user?.email?.[0] || 'G'}
            </div>
            {!compact && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {user?.fullName || user?.email || 'Guest'}
                </p>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${roleBadgeColors[role]}`}
                >
                  <RoleIcon className="w-2.5 h-2.5" /> {role}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-red-400 transition-all"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile Sidebar ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white flex flex-col z-50 md:hidden"
            >
              <div className="p-5 border-b border-slate-700/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                    <Wrench className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-lg leading-tight">Garage</h1>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                      Service Manager
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 px-3 pt-4 space-y-0.5">
                {visibleLinks.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-[18px] h-[18px]" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="h-16 flex items-center justify-between px-6 border-b bg-white/80 backdrop-blur-xl flex-shrink-0"
          style={{
            borderColor: prefs.darkMode ? 'var(--border)' : '#f1f5f9',
            background: prefs.darkMode ? 'var(--card-bg)' : undefined,
          }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 md:hidden transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <span className="text-gray-400">Home</span>
              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
              <span className="font-semibold text-gray-800">{pageTitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => update('darkMode', !prefs.darkMode)}
              className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-500 transition-all md:hidden"
              title="Toggle theme"
            >
              {prefs.darkMode ? (
                <Sun className="w-4.5 h-4.5 text-amber-500" />
              ) : (
                <Moon className="w-4.5 h-4.5" />
              )}
            </button>
            <div className="relative">
              <button className="p-2.5 rounded-xl hover:bg-gray-100 text-gray-500 transition-all relative">
                <Bell className="w-[18px] h-[18px]" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
              </button>
            </div>
            <div className="hidden md:flex items-center gap-2.5 ml-2 pl-3 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold ring-2 ring-emerald-100">
                {user?.fullName?.[0] || user?.email?.[0] || 'G'}
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-semibold text-gray-800 leading-tight">
                  {user?.fullName || user?.email || 'Guest'}
                </p>
                <p className="text-[10px] text-gray-400">{role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            background: prefs.darkMode
              ? 'var(--background)'
              : 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 50%, #f8fafc 100%)',
          }}
        >
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="p-6 lg:p-8"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
