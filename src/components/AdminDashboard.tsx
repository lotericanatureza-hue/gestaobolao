import { useEffect, useState, useCallback } from 'react';
import { Store, AlertTriangle, ShoppingBag, DollarSign, Percent, TrendingDown, Calendar, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Bolao, Branch, Profile } from '../lib/types';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface Kpis {
  bolaoValue: number;
  commissionValue: number;
  lotericaCommission: number;
  operatorCommission: number;
  soldTotal: number;
  soldCommission: number;
  encalheValue: number;
  encalheShares: number;
  bolaoCount: number;
  soldCount: number;
}

function computeKpis(boloes: Bolao[]): Kpis {
  const shareVal = (b: Bolao) => b.total_shares > 0 ? (Number(b.price) + Number(b.service_fee)) / b.total_shares : 0;
  const shareFee = (b: Bolao) => b.total_shares > 0 ? Number(b.service_fee) / b.total_shares : 0;

  const bolaoValue = boloes.reduce((s, b) => s + Number(b.price), 0);
  const commissionValue = boloes.reduce((s, b) => s + Number(b.service_fee), 0);

  const soldTotal = boloes.reduce((s, b) => s + shareVal(b) * b.sold_shares, 0);
  const soldCommission = boloes.reduce((s, b) => s + shareFee(b) * b.sold_shares, 0);

  const unsoldShares = boloes.reduce((s, b) => s + (b.total_shares - b.sold_shares), 0);
  const encalheValue = boloes.reduce((s, b) => s + shareVal(b) * (b.total_shares - b.sold_shares), 0);

  return {
    bolaoValue,
    commissionValue,
    lotericaCommission: commissionValue * 0.7,
    operatorCommission: commissionValue * 0.3,
    soldTotal,
    soldCommission,
    encalheValue,
    encalheShares: unsoldShares,
    bolaoCount: boloes.length,
    soldCount: boloes.filter((b) => b.status === 'sold').length,
  };
}

interface MonthGroup {
  key: string;
  label: string;
  boloes: Bolao[];
  kpis: Kpis;
}

function groupByMonth(boloes: Bolao[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const b of boloes) {
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, boloes: [], kpis: computeKpis([]) });
    }
    map.get(key)!.boloes.push(b);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  for (const g of groups) g.kpis = computeKpis(g.boloes);
  return groups;
}

interface OperatorStats {
  operator: Profile;
  kpis: Kpis;
}

export function AdminDashboard() {
  const [allBoloes, setAllBoloes] = useState<Bolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

  const fetchData = useCallback(async () => {
    const [{ data: boloes }, { data: branchList }, { data: opList }] = await Promise.all([
      supabase.from('boloes').select('*, product:products(*), branch:branches(*), operator:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'operator').order('name'),
    ]);
    setAllBoloes((boloes ?? []) as Bolao[]);
    setBranches((branchList ?? []) as Branch[]);
    setOperators((opList ?? []) as Profile[]);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="text-brand-500" />
      </div>
    );
  }

  const allKpis = computeKpis(filteredBoloes);
  const monthGroups = groupByMonth(filteredBoloes);

  // Per-operator stats
  const operatorStats: OperatorStats[] = operators
    .map((op) => {
      const opBoloes = filteredBoloes.filter((b) => b.operator_id === op.id);
      return { operator: op, kpis: computeKpis(opBoloes) };
    })
    .filter((s) => s.kpis.bolaoCount > 0)
    .sort((a, b) => b.kpis.soldTotal - a.kpis.soldTotal);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão consolidada de bolões, comissões e encalhes" />

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

      {/* General KPIs */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visão Geral</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<ShoppingBag size={22} />} label="Valor do Bolão" bigValue={`R$ ${allKpis.bolaoValue.toFixed(2)}`} smallValue={`${allKpis.bolaoCount} bolões`} color="brand" />

        <KpiCard
          icon={<Percent size={22} />}
          label="Valor da Comissão"
          bigValue={`R$ ${allKpis.commissionValue.toFixed(2)}`}
          color="accent"
          lines={[
            { label: 'Casa (70%)', value: `R$ ${allKpis.lotericaCommission.toFixed(2)}` },
            { label: 'Operador (30%)', value: `R$ ${allKpis.operatorCommission.toFixed(2)}` },
          ]}
        />

        <KpiCard
          icon={<DollarSign size={22} />}
          label="Valor Vendido"
          bigValue={`R$ ${allKpis.soldTotal.toFixed(2)}`}
          color="emerald"
          lines={[
            { label: 'Bolão + Comissão', value: `R$ ${allKpis.soldTotal.toFixed(2)}` },
            { label: 'Só Comissões', value: `R$ ${allKpis.soldCommission.toFixed(2)}` },
          ]}
        />

        <KpiCard
          icon={<TrendingDown size={22} />}
          label="Valor do Encalhe"
          bigValue={`R$ ${allKpis.encalheValue.toFixed(2)}`}
          smallValue={`${allKpis.encalheShares} cotas não vendidas`}
          color="red"
        />
      </div>

      {/* Monthly breakdown */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Calendar size={16} /> Por Mês
      </h2>

      {monthGroups.length === 0 ? (
        <Card className="mb-8">
          <EmptyState icon={<ShoppingBag size={48} />} title="Nenhum bolão criado" description="Os bolões criados pelos operadores aparecerão aqui." />
        </Card>
      ) : (
        <div className="space-y-6 mb-8">
          {monthGroups.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="px-5 py-3 bg-brand-50 border-b border-brand-100">
                <h3 className="font-semibold text-brand-900">{group.label}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                <KpiCard icon={<ShoppingBag size={20} />} label="Valor do Bolão" bigValue={`R$ ${group.kpis.bolaoValue.toFixed(2)}`} smallValue={`${group.kpis.bolaoCount} bolões`} color="brand" />
                <KpiCard
                  icon={<Percent size={20} />}
                  label="Valor da Comissão"
                  bigValue={`R$ ${group.kpis.commissionValue.toFixed(2)}`}
                  color="accent"
                  lines={[
                    { label: 'Casa (70%)', value: `R$ ${group.kpis.lotericaCommission.toFixed(2)}` },
                    { label: 'Operador (30%)', value: `R$ ${group.kpis.operatorCommission.toFixed(2)}` },
                  ]}
                />
                <KpiCard
                  icon={<DollarSign size={20} />}
                  label="Valor Vendido"
                  bigValue={`R$ ${group.kpis.soldTotal.toFixed(2)}`}
                  color="emerald"
                  lines={[
                    { label: 'Bolão + Comissão', value: `R$ ${group.kpis.soldTotal.toFixed(2)}` },
                    { label: 'Só Comissões', value: `R$ ${group.kpis.soldCommission.toFixed(2)}` },
                  ]}
                />
                <KpiCard icon={<TrendingDown size={20} />} label="Valor do Encalhe" bigValue={`R$ ${group.kpis.encalheValue.toFixed(2)}`} smallValue={`${group.kpis.encalheShares} cotas`} color="red" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Per-operator breakdown */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Users size={16} /> Por Operador
      </h2>

      {operatorStats.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={48} />} title="Nenhum operador com bolões" description="Quando operadores criarem bolões, o desempenho de cada um aparecerá aqui." />
        </Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Operador</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium text-right">Bolões</th>
                  <th className="px-5 py-3 font-medium text-right">Valor Bolão</th>
                  <th className="px-5 py-3 font-medium text-right">Comissão Total</th>
                  <th className="px-5 py-3 font-medium text-right">Operador (30%)</th>
                  <th className="px-5 py-3 font-medium text-right">Vendido</th>
                  <th className="px-5 py-3 font-medium text-right">Encalhe</th>
                </tr>
              </thead>
              <tbody>
                {operatorStats.map(({ operator: op, kpis: k }) => {
                  const branchName = branches.find((br) => br.id === op.branch_id)?.name ?? '—';
                  return (
                    <tr key={op.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
                            {op.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-900">{op.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{branchName}</td>
                      <td className="px-5 py-3 text-right text-slate-600">{k.bolaoCount}</td>
                      <td className="px-5 py-3 text-right text-slate-600">R$ {k.bolaoValue.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right text-slate-600">R$ {k.commissionValue.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {k.operatorCommission.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-600">R$ {k.soldTotal.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-red-600">R$ {k.encalheValue.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  bigValue,
  smallValue,
  lines,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  bigValue: string;
  smallValue?: string;
  lines?: { label: string; value: string }[];
  color: string;
}) {
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
      {smallValue && <p className="text-sm text-slate-500 mt-1">{smallValue}</p>}
      {lines && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{l.label}</span>
              <span className="font-semibold text-slate-700">{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
