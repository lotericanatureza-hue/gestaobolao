import { useEffect, useState } from 'react';
import { TrendingUp, Package, Store, AlertTriangle, CheckCircle2, Clock, DollarSign, ShoppingBag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Badge, Spinner, EmptyState } from './ui';
import type { Bolao, Branch } from '../lib/types';

interface DashboardStats {
  totalBoloes: number;
  sold: number;
  pending: number;
  partial: number;
  totalRevenue: number;
  totalBranches: number;
  totalProducts: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBoloes, setRecentBoloes] = useState<Bolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: boloes }, { data: branchList }, { count }] = await Promise.all([
        supabase.from('boloes').select('*, product:products(*), branch:branches(*), operator:profiles(*)').order('created_at', { ascending: false }),
        supabase.from('branches').select('*').order('name'),
        supabase.from('products').select('*', { count: 'exact', head: true }),
      ]);

      const bList = (branchList ?? []) as Branch[];
      setBranches(bList);
      setRecentBoloes((boloes ?? []) as Bolao[]);

      const allBoloes = (boloes ?? []) as Bolao[];
      setStats({
        totalBoloes: allBoloes.length,
        sold: allBoloes.filter((b) => b.status === 'sold').length,
        pending: allBoloes.filter((b) => b.status === 'pending').length,
        partial: allBoloes.filter((b) => b.status === 'partial').length,
        totalRevenue: allBoloes
          .filter((b) => b.status !== 'pending')
          .reduce((sum, b) => sum + Number(b.price) + Number(b.service_fee), 0),
        totalBranches: bList.length,
        totalProducts: count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-emerald-500" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    if (status === 'sold') return <Badge color="green">Vendido</Badge>;
    if (status === 'partial') return <Badge color="amber">Parcial</Badge>;
    return <Badge color="red">Encalhado</Badge>;
  };

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão geral de bolões, filiais e produtos" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Package />} label="Total de Bolões" value={stats?.totalBoloes ?? 0} color="emerald" />
        <StatCard icon={<ShoppingBag />} label="Vendidos" value={stats?.sold ?? 0} color="blue" />
        <StatCard icon={<AlertTriangle />} label="Encalhados" value={stats?.pending ?? 0} color="red" />
        <StatCard icon={<DollarSign />} label="Receita Total" value={`R$ ${(stats?.totalRevenue ?? 0).toFixed(2)}`} color="amber" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon={<Store />} label="Filiais" value={stats?.totalBranches ?? 0} color="slate" small />
        <StatCard icon={<TrendingUp />} label="Parciais" value={stats?.partial ?? 0} color="amber" small />
        <StatCard icon={<Package />} label="Produtos" value={stats?.totalProducts ?? 0} color="slate" small />
      </div>

      {/* Recent bolões */}
      <Card className="mb-6">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Bolões Recentes</h2>
        </div>
        {recentBoloes.length === 0 ? (
          <EmptyState icon={<Package size={48} />} title="Nenhum bolão criado" description="Os bolões criados pelos operadores aparecerão aqui." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Produto</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium">Concurso</th>
                  <th className="px-5 py-3 font-medium">Dezenas</th>
                  <th className="px-5 py-3 font-medium">Cotas</th>
                  <th className="px-5 py-3 font-medium">Preço</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentBoloes.slice(0, 10).map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{b.product?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{b.branch?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{b.contest_number}</td>
                    <td className="px-5 py-3 text-slate-600">{b.dezenas}</td>
                    <td className="px-5 py-3 text-slate-600">{b.sold_shares}/{b.total_shares}</td>
                    <td className="px-5 py-3 text-slate-600">R$ {Number(b.price).toFixed(2)}</td>
                    <td className="px-5 py-3">{statusBadge(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Branches overview */}
      <Card>
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Visão por Filial</h2>
        </div>
        {branches.length === 0 ? (
          <EmptyState icon={<Store size={48} />} title="Nenhuma filial cadastrada" description="Cadastre filiais para começar a operar." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {branches.map((br) => {
              const branchBoloes = recentBoloes.filter((b) => b.branch_id === br.id);
              const soldCount = branchBoloes.filter((b) => b.status === 'sold').length;
              const pendingCount = branchBoloes.filter((b) => b.status === 'pending').length;
              return (
                <div key={br.id} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{br.name}</p>
                      <p className="text-xs text-slate-400">{br.code} · {br.city}/{br.state}</p>
                    </div>
                    <Badge color={br.active ? 'green' : 'slate'}>{br.active ? 'Ativa' : 'Inativa'}</Badge>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <div className="flex items-center gap-1 text-slate-500">
                      <CheckCircle2 size={14} className="text-emerald-500" /> {soldCount} vendidos
                    </div>
                    <div className="flex items-center gap-1 text-slate-500">
                      <Clock size={14} className="text-red-500" /> {pendingCount} encalhados
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, color, small }: { icon: React.ReactNode; label: string; value: string | number; color: string; small?: boolean }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
          <p className={`font-bold text-slate-900 ${small ? 'text-xl' : 'text-2xl'}`}>{value}</p>
        </div>
      </div>
    </Card>
  );
}
