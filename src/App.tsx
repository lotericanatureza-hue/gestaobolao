import { useState } from 'react';
import { LayoutDashboard, Store, Package, ArrowRightLeft, Users, Ticket, ShoppingBag, Shuffle, Warehouse, Wallet, Receipt, Tag, CalendarCheck, BookX, UserCog, HandCoins } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Layout, AdminView, OperatorView, FinancialView, NavItem } from './components/Layout';
import { LoadingScreen } from './components/ui';
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

function AppContent() {
  const { profile, loading } = useAuth();
  const [area, setArea] = useState<'bolao' | 'financial'>('bolao');
  const [adminView, setAdminView] = useState<AdminView>('dashboard');
  const [operatorView, setOperatorView] = useState<OperatorView>('sales');
  const [finView, setFinView] = useState<FinancialView>('fin-dashboard');

  if (loading) return <LoadingScreen />;
  if (!profile) return <LoginScreen />;

  const isAdmin = profile.role === 'admin';
  const isSupervisor = profile.role === 'supervisor';

  const switchArea = () => {
    setArea((prev) => prev === 'bolao' ? 'financial' : 'bolao');
  };

  // Financial area - admin only
  if (area === 'financial' && isAdmin) {
    const finNav: NavItem[] = [
      { id: 'fin-dashboard', label: 'Dashboard', icon: <Wallet size={18} /> },
      { id: 'fin-bills', label: 'Contas a Pagar', icon: <Receipt size={18} />, children: [
        { id: 'fin-categories', label: 'Categorias', icon: <Tag size={16} /> },
      ]},
      { id: 'fin-daily', label: 'Controle Diário', icon: <CalendarCheck size={18} /> },
      { id: 'fin-closing', label: 'Fechamento de Caixa', icon: <BookX size={18} /> },
      { id: 'fin-loans', label: 'Empréstimos', icon: <HandCoins size={18} /> },
      { id: 'fin-employees', label: 'Funcionários', icon: <UserCog size={18} /> },
    ];
    return (
      <Layout activeView={finView} onNavigate={(v) => setFinView(v as FinancialView)} navItems={finNav} area="financial" onSwitchArea={switchArea}>
        {finView === 'fin-dashboard' && <FinancialDashboard />}
        {finView === 'fin-bills' && <FinancialBills />}
        {finView === 'fin-categories' && <FinancialCategories />}
        {finView === 'fin-daily' && <FinancialDailyControl />}
        {finView === 'fin-closing' && <FinancialCashClosing />}
        {finView === 'fin-loans' && <FinancialLoans />}
        {finView === 'fin-employees' && <FinancialEmployees />}
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
    <Layout activeView={operatorView} onNavigate={(v) => setOperatorView(v as OperatorView)} navItems={operatorNav}>
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
