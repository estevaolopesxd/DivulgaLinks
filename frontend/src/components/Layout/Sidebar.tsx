import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Plug,
  Package,
  MessageCircle,
  Send,
  Megaphone,
  FileText,
  LogOut,
  Link,
  ChevronRight,
  BarChart2,
  Settings2,
  Users,
  FileEdit,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/platforms', label: 'Plataformas', icon: Plug },
  { to: '/products', label: 'Produtos', icon: Package },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { to: '/telegram', label: 'Telegram', icon: Send },
  { to: '/campaigns', label: 'Campanhas', icon: Megaphone },
  { to: '/templates', label: 'Templates', icon: FileEdit },
  { to: '/metrics', label: 'Métricas', icon: BarChart2 },
  { to: '/group-config', label: 'Config. Grupos', icon: Settings2 },
  { to: '/logs', label: 'Logs', icon: FileText },
];

const adminItems = [
  { to: '/users', label: 'Usuários', icon: Users },
];

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isAdmin = user?.role === 'ADMIN';

  const renderNavItem = (item: { to: string; label: string; icon: React.ElementType }) => {
    const Icon = item.icon;
    const isActive = location.pathname.startsWith(item.to);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
          isActive
            ? 'bg-primary-500 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        )}
      >
        <Icon size={18} className="flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {isActive && <ChevronRight size={14} className="opacity-60" />}
      </NavLink>
    );
  };

  return (
    <aside className="w-64 min-h-screen bg-gray-900 flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center flex-shrink-0">
            <Link size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">DivulgaLinks</p>
            <p className="text-gray-400 text-xs mt-0.5">Automação de Afiliados</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
        {navItems.map(renderNavItem)}

        {/* Admin section */}
        {isAdmin && (
          <div className="pt-4">
            <p className="px-3 mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Administração
            </p>
            {adminItems.map(renderNavItem)}
          </div>
        )}
      </nav>

      {/* User info */}
      <div className="px-3 py-4 border-t border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">
              {user?.name?.charAt(0).toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name ?? 'Usuário'}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email ?? ''}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
};
