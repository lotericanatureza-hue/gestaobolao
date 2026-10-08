import { useState, useEffect } from 'react';
import { LayoutDashboard, Store, Package, ArrowRightLeft, Users, Ticket, ShoppingBag, Shuffle, Warehouse, Wallet, Receipt, Tag, CalendarCheck, BookX, UserCog, HandCoins, CheckCircle } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Layout, AdminView, OperatorView, FinancialView, NavItem } from './components/Layout';
import { Button, LoadingScreen } from './components/ui';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminBranches } from './components/AdminBranches';
import { AdminProducts } from './components/AdminProducts';
import { AdminAllocations } from './components/AdminAllocations';
import { AdminUsers } from './components/AdminUsers';
import { AdminCreateBolao } from './components/AdminCreateBolao';
import { AdminBolaoAllocations } from './components/AdminBolaoAllocations';
import { OperatorStock } from './components/OperatorStock';
import { OperatorSales } from './components/OperatorSales';
import { OperatorManage } from './components/OperatorManage';
import { FinancialDashboard } from './components/FinancialDashboard';
import { FinancialBills } from './components/FinancialBills';
import { FinancialCategories } from './components/FinancialCategories';
import { FinancialDailyControl } from './components/FinancialDailyControl';
import { FinancialCashClosing } from './components/FinancialCashClosing';
import { FinancialEmployees } from './components/FinancialEmployees';
import { FinancialLoans } from './components/FinancialLoans';
import { FinancialBolaoClosing } from './components/FinancialBolaoClosing';
import { ResetPassword, UpdatePassword } from './components/ResetPassword';

function AppContent() {
  const { profile, loading } = useAuth();
  const [area, setArea] = useState<'bolao' | 'financial'>('bolao');
  const [adminView, setAdminView] = useState<AdminView>('dashboard');
  const [operatorView, setOperatorView] = useState<OperatorView>('sales');
  const [finView, setFinView] = useState<FinancialView>('fin-dashboard');
  const [authScreen, setAuthScreen] = useState<'login' | 'reset' | 'update'>('login');
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('type') === 'recovery') {
      setAuthScreen('update');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (loading) return <LoadingScreen />;
  if (authScreen === 'reset') return <ResetPassword onBack={() => setAuthScreen('login')} />;
  if (!profile) {
    if (authScreen === 'update') {
      return (
        <UpdatePassword
          onSuccess={() => {
            setPasswordUpdated(true);
            setAuthScreen('login');
          }}
        />
      );
    }
    if (passwordUpdated) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Senha atualizada!</h2>
            <p className="text-slate-500 text-sm mb-6">Sua senha foi redefinida com sucesso. Faça login com sua nova senha.</p>
            <Button onClick={() => setPasswordUpdated(false)} className="w-full">Ir para o login</Button>
          </div>
        </div>
      );
    }
    return <LoginScreen onForgotPassword={() => setAuthScreen('reset')} />;
  }

  const isAdmin = profile.role === 'admin';
  const isSupervisor = profile.role === 'supervisor';

  const switchArea = () => {
    setArea((prev) => {
      const next = prev === 'bolao' ? 'financial' : 'bolao';
      if (next === 'financial' && !isAdmin && !isSupervisor) {
        setFinView('fin-bolao-closing');
      }
      return next;
    });
  };

  // Financial area - all roles (admin/supervisor see full nav, operator sees limited nav)
  if (area === 'financial') {
    const finNav: NavItem[] = (isAdmin || isSupervisor)
      ? [
          { id: 'fin-dashboard', label: 'Dashboard', icon: <Wallet size={18} /> },
          { id: 'fin-bills-group', label: 'Pagamentos', icon: <Receipt size={18} />, children: [
            { id: 'fin-bills', label: 'Contas a Pagar', icon: <Receipt size={16} /> },
            { id: 'fin-categories', label: 'Categorias', icon: <Tag size={16} /> },
          ]},
          { id: 'fin-daily', label: 'Controle Diário', icon: <CalendarCheck size={18} /> },
          { id: 'fin-closing', label: 'Fechamento de Caixa', icon: <BookX size={18} /> },
          { id: 'fin-bolao-closing', label: 'Fechamento Bolão', icon: <Ticket size={18} /> },
          { id: 'fin-loans', label: 'Empréstimos', icon: <HandCoins size={18} /> },
          { id: 'fin-employees', label: 'Funcionários', icon: <UserCog size={18} /> },
        ]
      : [
          { id: 'fin-bolao-closing', label: 'Fechamento Bolão', icon: <Ticket size={18} /> },
          { id: 'fin-closing', label: 'Fechamento de Caixa', icon: <BookX size={18} /> },
        ];
    return (
      <Layout activeView={finView} onNavigate={(v) => setFinView(v as FinancialView)} navItems={finNav} area="financial" onSwitchArea={switchArea}>
        {finView === 'fin-dashboard' && (isAdmin || isSupervisor) && <FinancialDashboard />}
        {finView === 'fin-bills' && (isAdmin || isSupervisor) && <FinancialBills />}
        {finView === 'fin-categories' && (isAdmin || isSupervisor) && <FinancialCategories />}
        {finView === 'fin-daily' && (isAdmin || isSupervisor) && <FinancialDailyControl />}
        {finView === 'fin-closing' && <FinancialCashClosing />}
        {finView === 'fin-bolao-closing' && <FinancialBolaoClosing />}
        {finView === 'fin-loans' && (isAdmin || isSupervisor) && <FinancialLoans />}
        {finView === 'fin-employees' && (isAdmin || isSupervisor) && <FinancialEmployees />}
      </Layout>
    );
  }

  if (isAdmin || isSupervisor) {
    const adminNav: { id: string; label: string; icon: React.ReactNode }[] = [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      ...(isAdmin ? [{ id: 'branches', label: 'Filiais', icon: <Store size={18} /> }] : []),
      { id: 'products', label: 'Produtos', icon: <Package size={18} /> },
      { id: 'allocations', label: 'Alocação de Produtos', icon: <ArrowRightLeft size={18} /> },
      { id: 'create-bolao', label: 'Criar Bolão', icon: <Ticket size={18} /> },
      { id: 'bolao-allocations', label: 'Alocação de Bolões', icon: <Shuffle size={18} /> },
      ...(isAdmin ? [{ id: 'users', label: 'Usuários', icon: <Users size={18} /> }] : []),
    ];
    return (
      <Layout activeView={adminView} onNavigate={(v) => setAdminView(v as AdminView)} navItems={adminNav} area="bolao" onSwitchArea={isAdmin ? switchArea : undefined}>
        {adminView === 'dashboard' && <AdminDashboard />}
        {adminView === 'branches' && isAdmin && <AdminBranches />}
        {adminView === 'products' && <AdminProducts />}
        {adminView === 'allocations' && <AdminAllocations />}
        {adminView === 'create-bolao' && <AdminCreateBolao />}
        {adminView === 'bolao-allocations' && <AdminBolaoAllocations />}
        {adminView === 'users' && isAdmin && <AdminUsers />}
      </Layout>
    );
  }

  // operator
  const operatorNav = [
    { id: 'stock', label: 'Estoque da Filial', icon: <Warehouse size={18} /> },
    { id: 'sales', label: 'Minhas Vendas', icon: <Ticket size={18} /> },
    { id: 'manage', label: 'Gestão de Bolões', icon: <ShoppingBag size={18} /> },
  ];
  return (
    <Layout activeView={operatorView} onNavigate={(v) => setOperatorView(v as OperatorView)} navItems={operatorNav} area="bolao" onSwitchArea={switchArea}>
      {operatorView === 'stock' && <OperatorStock />}
      {operatorView === 'sales' && <OperatorSales />}
      {operatorView === 'manage' && <OperatorManage />}
    </Layout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
