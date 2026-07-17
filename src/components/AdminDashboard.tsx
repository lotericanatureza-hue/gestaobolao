import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Package, Store, AlertTriangle, CheckCircle2, Clock, DollarSign, ShoppingBag, Percent, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Bolao, Branch } from '../lib/types';

interface DashboardStats {
  totalBoloes: number;
  totalValue: number;
  bolaoValue: number;
  commissionValue: number;
  operatorCommission: number;
  lotericaCommission: number;
  soldCount: number;
  soldValue: number;
  soldCommission: number;
  soldOperatorCommission: number;
  partialCount: number;
  partialValue: number;
  unsoldShares: number;
  unsoldValue: number;
  unsoldBolaoValue: number;
  unsoldCommission: number;
  encalheLoss: number;
  totalBranches: number;
  totalProducts: number;
}

function computeStats(boloes: Bolao[]): DashboardStats {
  const shareVal = (b: Bolao) => b.total_shares > 0
    ? (Number(b.price) + Number(b.service_fee)) / b.total_shares
    : 0;
  const sharePrice = (b: Bolao) => b.total_shares > 0 ? Number(b.price) / b.total_shares : 0;
  const shareFee = (b: Bolao) => b.total_shares > 0 ? Number(b.service_fee) / b.total_shares : 0;

  const bolaoValue = boloes.reduce((s, b) => s + Number(b.price), 0);
  const commissionValue = boloes.reduce((s, b) => s + Number(b.service_fee), 0);

  const soldBoloes = boloes.filter((b) => b.status === 'sold');
  const partialBoloes = boloes.filter((b) => b.status === 'partial');

  const soldValue = boloes.reduce((s, b) => s + shareVal(b) * b.sold_shares, 0);
  const soldCommission = boloes.reduce((s, b) => s + shareFee(b) * b.sold_shares, 0);

  const unsoldShares = boloes.reduce((s, b) => s + (b.total_shares - b.sold_shares), 0);
  const unsoldValue = boloes.reduce((s, b) => s + shareVal(b) * (b.total_shares - b.sold_shares), 0);
  const unsoldBolaoValue = boloes.reduce((s, b) => s + sharePrice(b) * (b.total_shares - b.sold_shares), 0);
  const unsoldCommission = boloes.reduce((s, b) => s + shareFee(b) * (b.total_shares - b.sold_shares), 0);

  return {
    totalBoloes: boloes.length,
    totalValue: bolaoValue + commissionValue,
    bolaoValue,
    commissionValue,
    operatorCommission: commissionValue * 0.3,
    lotericaCommission: commissionValue * 0.7,
    soldCount: soldBoloes.length,
    soldValue,
    soldCommission,
    soldOperatorCommission: soldCommission * 0.3,
    partialCount: partialBoloes.length,
    partialValue: partialBoloes.reduce((s, b) => s + shareVal(b) * b.sold_shares, 0),
    unsoldShares,
    unsoldValue,
    unsoldBolaoValue,
    unsoldCommission,
    encalheLoss: unsoldBolaoValue,
    totalBranches: 0,
    totalProducts: 0,
  };
}

export function AdminDashboard() {
  const [allBoloes, setAllBoloes] = useState<Bolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

  const fetchData = useCallback(async () => {
    const [{ data: boloes }, { data: branchList }, { count }] = await Promise.all([
      supabase.from('boloes').select('*, product:products(*), branch:branches(*), operator:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('products').select('*', { count: 'exact', head: true }),
    ]);
    setAllBoloes((boloes ?? []) as Bolao[]);
    setBranches((branchList ?? []) as Branch[]);
    setProductCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin-dashboard-boloes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const filteredBoloes = selectedBranchId === 'all'
    ? allBoloes
    : allBoloes.filter((b) => b.branch_id === selectedBranchId);

  const stats = computeStats(filteredBoloes);
  stats.totalBranches = branches.length;
  stats.totalProducts = productCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-brand-500" />
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
      <PageHeader title="Dashboard" subtitle="Visão geral de bolões, comissões e encalhes" />

      {/* Branch filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelectedBranchId('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            selectedBranchId === 'all'
              ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
              : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
          }`}
        >
          <Store size={16} /> Todas as Filiais
        </button>
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBranchId(b.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              selectedBranchId === b.id
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            <Store size={16} /> {b.name}
          </button>
        ))}
      </div>

      {/* Main KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard icon={<Package size={22} />} label="Total de Bolões" bigValue={`R$ ${stats.totalValue.toFixed(2)}`} smallValue={`${stats.totalBoloes} bolões`} color="brand" />
        <KpiCard icon={<ShoppingBag size={22} />} label="Vendidos" bigValue={`R$ ${stats.soldValue.toFixed(2)}`} smallValue={`${stats.soldCount} bolões`} color="emerald" />
        <KpiCard icon={<TrendingUp size={22} />} label="Parciais" bigValue={`R$ ${stats.partialValue.toFixed(2)}`} smallValue={`${stats.partialCount} bolões`} color="amber" />
        <KpiCard icon={<AlertTriangle size={22} />} label="Encalhados" bigValue={`R$ ${stats.unsoldValue.toFixed(2)}`} smallValue={`${stats.unsoldShares} cotas não vendidas`} color="red" />
      </div>

      {/* Commission breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard icon={<DollarSign size={22} />} label="Valor dos Bolões" bigValue={`R$ ${stats.bolaoValue.toFixed(2)}`} smallValue="Soma dos preços" color="brand" />
        <KpiCard icon={<Percent size={22} />} label="Comissão Total" bigValue={`R$ ${stats.commissionValue.toFixed(2)}`} smallValue="Taxa de serviço" color="accent" />
        <KpiCard icon={<DollarSign size={22} />} label="Comissão Operador (30%)" bigValue={`R$ ${stats.operatorCommission.toFixed(2)}`} smallValue={`Vendida: R$ ${stats.soldOperatorCommission.toFixed(2)}`} color="emerald" />
        <KpiCard icon={<TrendingDown size={22} />} label="Prejuízo (Encalhe)" bigValue={`R$ ${stats.encalheLoss.toFixed(2)}`} smallValue={`${stats.unsoldShares} cotas encalhadas`} color="red" />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MiniKpi icon={<Store size={20} />} label="Filiais" value={stats.totalBranches} />
        <MiniKpi icon={<Package size={20} />} label="Produtos" value={stats.totalProducts} />
        <MiniKpi icon={<DollarSign size={20} />} label="Receita Realizada" value={`R$ ${stats.soldValue.toFixed(2)}`} />
      </div>

      {/* Recent bolões */}
      <Card className="mb-6">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-brand-950">Bolões Recentes</h2>
        </div>
        {filteredBoloes.length === 0 ? (
          <EmptyState icon={<Package size={48} />} title="Nenhum bolão criado" description="Os bolões criados pelos operadores aparecerão aqui." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-3 font-medium">Produto</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium">Concurso</th>
                  <th className="px-5 py-3 font-medium">Cotas</th>
                  <th className="px-5 py-3 font-medium">Bolão</th>
                  <th className="px-5 py-3 font-medium">Comissão</th>
                  <th className="px-5 py-3 font-medium">Operador (30%)</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoloes.slice(0, 10).map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <LotteryIcon slug={b.product?.slug ?? ''} size={20} />
                        <span className="font-medium text-slate-900">{b.product?.name ?? '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{selectedBranchId === 'all' ? (b.branch?.name ?? '—') : (b.branch?.name ?? '—')}</td>
                    <td className="px-5 py-3 text-slate-600">{b.contest_number}</td>
                    <td className="px-5 py-3 text-slate-600">{b.sold_shares}/{b.total_shares}</td>
                    <td className="px-5 py-3 text-slate-600">R$ {Number(b.price).toFixed(2)}</td>
                    <td className="px-5 py-3 text-slate-600">R$ {Number(b.service_fee).toFixed(2)}</td>
                    <td className="px-5 py-3 text-slate-600">R$ {(Number(b.service_fee) * 0.3).toFixed(2)}</td>
                    <td className="px-5 py-3">{statusBadge(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Branches overview */}
      {selectedBranchId === 'all' && (
        <Card>
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-brand-950">Visão por Filial</h2>
          </div>
          {branches.length === 0 ? (
            <EmptyState icon={<Store size={48} />} title="Nenhuma filial cadastrada" description="Cadastre filiais para começar a operar." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
              {branches.map((br) => {
                const branchBoloes = allBoloes.filter((b) => b.branch_id === br.id);
                const brStats = computeStats(branchBoloes);
                return (
                  <div key={br.id} className="border border-slate-200 rounded-lg p-4 hover:border-brand-300 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-semibold text-brand-950">{br.name}</p>
                        <p className="text-xs text-slate-400">{br.code} · {br.city}/{br.state}</p>
                      </div>
                      <Badge color={br.active ? 'green' : 'slate'}>{br.active ? 'Ativa' : 'Inativa'}</Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-slate-500"><CheckCircle2 size={14} className="text-emerald-500" /> Vendidos</span>
                        <span className="font-semibold text-slate-700">{brStats.soldCount} · R$ {brStats.soldValue.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-slate-500"><Clock size={14} className="text-amber-500" /> Parciais</span>
                        <span className="font-semibold text-slate-700">{brStats.partialCount} · R$ {brStats.partialValue.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-slate-500"><AlertTriangle size={14} className="text-red-500" /> Encalhados</span>
                        <span className="font-semibold text-slate-700">{brStats.unsoldShares} cotas · R$ {brStats.unsoldValue.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                        <span className="flex items-center gap-1 text-slate-500"><Percent size={14} className="text-accent-500" /> Comissão Operador</span>
                        <span className="font-semibold text-brand-700">R$ {brStats.operatorCommission.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-slate-500"><TrendingDown size={14} className="text-red-500" /> Prejuízo</span>
                        <span className="font-semibold text-red-600">R$ {brStats.encalheLoss.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, bigValue, smallValue, color }: { icon: React.ReactNode; label: string; bigValue: string; smallValue: string; color: string }) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    accent: 'bg-accent-50 text-accent-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {icon}
        </div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-2xl font-bold text-brand-950">{bigValue}</p>
      <p className="text-sm text-slate-500 mt-1">{smallValue}</p>
    </Card>
  );
}

function MiniKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-lg font-bold text-brand-950">{value}</p>
        </div>
      </div>
    </Card>
  );
}
