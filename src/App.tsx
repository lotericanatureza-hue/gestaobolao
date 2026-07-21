import { useState } from 'react';
import { LayoutDashboard, Store, Package, ArrowRightLeft, Users, Ticket, ShoppingBag, Shuffle } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { Layout, AdminView, OperatorView } from './components/Layout';
import { LoadingScreen } from './components/ui';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminBranches } from './components/AdminBranches';
import { AdminProducts } from './components/AdminProducts';
import { AdminAllocations } from './components/AdminAllocations';
import { AdminUsers } from './components/AdminUsers';
import { AdminCreateBolao } from './components/AdminCreateBolao';
import { AdminBolaoAllocations } from './components/AdminBolaoAllocations';
import { OperatorSales } from './components/OperatorSales';
import { OperatorManage } from './components/OperatorManage';
function AppContent() {
  const { profile, loading } = useAuth();
  const [adminView, setAdminView] = useState<AdminView>('dashboard');
  const [operatorView, setOperatorView] = useState<OperatorView>('sales');
  if (loading) return <LoadingScreen />;
  if (!profile) return <LoginScreen />;
  if (profile.role === 'admin') {
    const adminNav = [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { id: 'branches', label: 'Filiais', icon: <Store size={18} /> },
      { id: 'products', label: 'Produtos', icon: <Package size={18} /> },
      { id: 'allocations', label: 'Alocação de Produtos', icon: <ArrowRightLeft size={18} /> },
      { id: 'create-bolao', label: 'Criar Bolão', icon: <Ticket size={18} /> },
      { id: 'bolao-allocations', label: 'Alocação de Bolões', icon: <Shuffle size={18} /> },
      { id: 'users', label: 'Usuários', icon: <Users size={18} /> },
    ];
    return (
      <Layout activeView={adminView} onNavigate={(v) => setAdminView(v as AdminView)} navItems={adminNav}>
        {adminView === 'dashboard' && <AdminDashboard />}
        {adminView === 'branches' && <AdminBranches />}
        {adminView === 'products' && <AdminProducts />}
        {adminView === 'allocations' && <AdminAllocations />}
        {adminView === 'create-bolao' && <AdminCreateBolao />}
        {adminView === 'bolao-allocations' && <AdminBolaoAllocations />}
        {adminView === 'users' && <AdminUsers />}
      </Layout>
    );
  }
  // operator
  const operatorNav = [
    { id: 'sales', label: 'Minhas Vendas', icon: <Ticket size={18} /> },
    { id: 'manage', label: 'Gestão de Bolões', icon: <ShoppingBag size={18} /> },
  ];
  return (
    <Layout activeView={operatorView} onNavigate={(v) => setOperatorView(v as OperatorView)} navItems={operatorNav}>
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
