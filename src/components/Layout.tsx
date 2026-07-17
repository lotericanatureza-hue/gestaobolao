import { ReactNode, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Badge } from './ui';

export type AdminView = 'dashboard' | 'branches' | 'products' | 'allocations' | 'users';
export type OperatorView = 'create' | 'manage';

interface LayoutProps {
  children: ReactNode;
  activeView: string;
  onNavigate: (view: string) => void;
  navItems: { id: string; label: string; icon: ReactNode }[];
}

export function Layout({ children, activeView, onNavigate, navItems }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-brand-950 text-slate-300 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center px-5 py-5 border-b border-brand-900">
          <img
            src="/assets/1000448454-removebg-preview.png"
            alt="Mega Bolão Brasil"
            className="h-16 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeView === item.id
                  ? 'bg-accent-500 text-white shadow-lg shadow-accent-900/30'
                  : 'text-slate-400 hover:text-white hover:bg-brand-900'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-brand-900">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-brand-800 border border-accent-500/40 flex items-center justify-center text-white text-sm font-semibold">
              {profile?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{profile?.name}</p>
              <Badge color={profile?.role === 'admin' ? 'orange' : 'blue'}>
                {profile?.role === 'admin' ? 'Administrador' : 'Operador'}
              </Badge>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-brand-900 transition-all"
          >
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between bg-brand-950 text-white px-4 py-3 sticky top-0 z-20">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <img
            src="/assets/1000448454-removebg-preview.png"
            alt="Mega Bolão Brasil"
            className="h-8 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
          <button onClick={() => setSidebarOpen(false)} className={sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}>
            <X size={24} />
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-950">{title}</h1>
        {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
