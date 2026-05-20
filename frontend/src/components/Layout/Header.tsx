import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, Search, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/platforms': 'Plataformas',
  '/products': 'Produtos',
  '/whatsapp': 'WhatsApp',
  '/telegram': 'Telegram',
  '/campaigns': 'Campanhas',
  '/logs': 'Logs',
};

const mockNotifications = [
  { id: 1, text: 'Campanha "Promoções de Verão" enviou 50 mensagens', time: '5 min atrás', read: false },
  { id: 2, text: 'WhatsApp conectado com sucesso', time: '1h atrás', read: false },
  { id: 3, text: 'Novo produto importado: Samsung Galaxy S24', time: '2h atrás', read: true },
];

export const Header: React.FC = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);

  const title = Object.entries(pageTitles).find(([path]) => pathname.startsWith(path))?.[1] ?? 'DivulgaLinks';
  const unread = mockNotifications.filter((n) => !n.read).length;

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
      <h1 className="text-xl font-semibold text-gray-900 flex-1">{title}</h1>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 w-64">
        <Search size={16} className="text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Buscar..."
          className="text-sm bg-transparent border-none outline-none text-gray-700 placeholder:text-gray-400 w-full"
        />
      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] flex items-center justify-center font-bold">
              {unread}
            </span>
          )}
        </button>

        {showNotifications && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowNotifications(false)} />
            <div className="absolute right-0 top-12 z-40 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-900 text-sm">Notificações</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {mockNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 ${!n.read ? 'bg-blue-50' : 'bg-white'}`}
                  >
                    <p className="text-sm text-gray-700">{n.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* User avatar */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center">
          <span className="text-white text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </span>
        </div>
        <span className="text-sm font-medium text-gray-700 hidden md:block">
          {user?.name?.split(' ')[0] ?? 'Usuário'}
        </span>
      </div>
    </header>
  );
};
