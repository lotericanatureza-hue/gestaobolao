import { ReactNode, useState, useEffect } from 'react';
import { LogOut, Menu, X, Store, ArrowLeftRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { Badge } from './ui';

export type AdminView = 'dashboard' | 'branches' | 'products' | 'allocations' | 'create-bolao' | 'bolao-allocations' | 'users';
export type OperatorView = 'stock' | 'sales' | 'manage';
export type FinancialView = 'fin-dashboard' | 'fin-bills' | 'fin-categories' | 'fin-daily' | 'fin-closing' | 'fin-employees' | 'fin-loans';

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  children?: { id: string; label: string; icon: ReactNode }[];
}

interface LayoutProps {
  children: ReactNode;
  activeView: string;
  onNavigate: (view: string) => void;
  navItems: NavItem[];
  area?: 'bolao' | 'financial';
  onSwitchArea?: () => void;
}

function NavEntry({ item, activeView, onNavigate }: { item: NavItem; activeView: string; onNavigate: (v: string) => void }) {
  const hasChildren = item.children && item.children.length > 0;
  const isChildActive = hasChildren && item.children!.some((c) => c.id === activeView);
  const [expanded, setExpanded] = useState(false);
  const isOpen = expanded || isChildActive;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!isOpen)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            isChildActive ? 'bg-accent-500/10 text-accent-400' : 'text-slate-400 hover:text-white hover:bg-brand-900'
          }`}
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {isOpen && (
          <div className="ml-4 mt-1 space-y-1 border-l border-brand-800 pl-3">
            {item.children!.map((child) => (
              <button
                key={child.id}
                onClick={() => onNavigate(child.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeView === child.id
                    ? 'bg-accent-500 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-brand-900'
                }`}
              >
                {child.icon}
                <span>{child.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onNavigate(item.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        activeView === item.id
          ? 'bg-accent-500 text-white shadow-lg shadow-accent-900/30'
          : 'text-slate-400 hover:text-white hover:bg-brand-900'
      }`}
    >
      {item.icon}
      <span>{item.label}</span>
    </button>
  );
}

export function Layout({ children, activeView, onNavigate, navItems, area = 'bolao', onSwitchArea }: LayoutProps) {
  const { profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branchName, setBranchName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.branch_id) { setBranchName(null); return; }
    supabase.from('branches').select('name').eq('id', profile.branch_id).maybeSingle()
      .then(({ data }) => setBranchName(data?.name ?? null));
  }, [profile?.branch_id]);

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
            <NavEntry
              key={item.id}
              item={item}
              activeView={activeView}
              onNavigate={(v) => { onNavigate(v); setSidebarOpen(false); }}
            />
          ))}
        </nav>

        {onSwitchArea && (
          <div className="px-3 pb-2">
            <button
              onClick={onSwitchArea}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-brand-900 text-accent-400 hover:bg-brand-800 transition-all"
            >
              <ArrowLeftRight size={18} /> {area === 'bolao' ? 'Ir para Financeiro' : 'Ir para Bolão'}
            </button>
          </div>
        )}

        <div className="px-3 py-4 border-t border-brand-900">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-brand-800 border border-accent-500/40 flex items-center justify-center text-white text-sm font-semibold">
              {profile?.name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{profile?.name}</p>
              <Badge color={profile?.role === 'admin' ? 'orange' : profile?.role === 'supervisor' ? 'amber' : 'blue'}>
                {profile?.role === 'admin' ? 'Administrador' : profile?.role === 'supervisor' ? 'Supervisor' : 'Operador'}
              </Badge>
              {branchName && (
                <p className="text-slate-400 text-xs mt-1 flex items-center gap-1 truncate">
                  <Store size={12} /> {branchName}
                </p>
              )}
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
