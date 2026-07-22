import { Fragment, useEffect, useState, useCallback } from 'react';
import { Store, ShoppingBag, DollarSign, TrendingDown, Calendar, Users, Clock, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Spinner, EmptyState, Badge } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Bolao, Branch, Profile, BolaoOperatorAllocation } from '../lib/types';
import { computeBolaoKpis, computeAllocationKpis, pluralize, STATUS_LABELS, type BolaoKpis } from '../lib/bolaoKpis';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup {
  key: string;
  label: string;
  boloes: Bolao[];
  kpis: BolaoKpis;
}

function groupByMonth(boloes: Bolao[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const b of boloes) {
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, boloes: [], kpis: computeBolaoKpis([]) });
    }
    map.get(key)!.boloes.push(b);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  for (const g of groups) g.kpis = computeBolaoKpis(g.boloes);
  return groups;
}

interface OperatorStats {
  operator: Profile;
  kpis: BolaoKpis;
  allocations: BolaoOperatorAllocation[];
}

interface BranchStats {
  branch: Branch;
  kpis: BolaoKpis;
}

export function AdminDashboard() {
  const [allBoloes, setAllBoloes] = useState<Bolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [allocations, setAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [expandedOperatorId, setExpandedOperatorId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [{ data: boloes }, { data: branchList }, { data: opList }, { data: allocList }] = await Promise.all([
      supabase.from('boloes').select('*, product:products(*), branch:branches(*), operator:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'operator').order('name'),
      supabase.from('bolao_operator_allocations').select('*, bolao:boloes(*, product:products(*), branch:branches(*))'),
    ]);
    setAllBoloes((boloes ?? []) as Bolao[]);
    setBranches((branchList ?? []) as Branch[]);
    setOperators((opList ?? []) as Profile[]);
    setAllocations((allocList ?? []) as BolaoOperatorAllocation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('admin-dashboard-boloes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_operator_allocations' }, () => fetchData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const undoLastSale = async (allocation: BolaoOperatorAllocation) => {
    if (allocation.shares_sold <= 0) return;
    setUndoingId(allocation.id);
    setUndoError(null);
    const { error } = await supabase.rpc('sell_bolao_shares', {
      p_bolao_id: allocation.bolao_id,
      p_operator_id: allocation.operator_id,
      p_shares_sold: allocation.shares_sold - 1,
    });
    setUndoingId(null);
    if (error) {
      setUndoError(error.message);
      return;
    }
    fetchData();
  };

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

  const kpis = computeBolaoKpis(filteredBoloes);
  const monthGroups = groupByMonth(filteredBoloes);

  // Consolidado por filial (sempre visível, independente do filtro acima)
  const branchStats: BranchStats[] = branches
    .map((br) => ({ branch: br, kpis: computeBolaoKpis(allBoloes.filter((b) => b.branch_id === br.id)) }))
    .filter((s) => s.kpis.gerado.count > 0);

  // Desempenho por operador: agora calculado pelas cotas ALOCADAS a cada
  // operador (bolao_operator_allocations), não mais por "quem criou o
  // bolão" — já que hoje é o admin quem cria, e as cotas são distribuídas
  // depois, podendo inclusive ficar divididas entre vários operadores.
  const operatorStats: OperatorStats[] = operators
    .map((op) => {
      const opAllocations = allocations.filter((a) => {
        if (a.operator_id !== op.id) return false;
        if (selectedBranchId === 'all') return true;
        return a.bolao?.branch_id === selectedBranchId;
      });
      return { operator: op, kpis: computeAllocationKpis(opAllocations), allocations: opAllocations };
    })
    .filter((s) => s.kpis.gerado.count > 0)
    .sort((a, b) => b.kpis.vendido.value - a.kpis.vendido.value);

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

      {/* General KPIs — Gerado / Vendido / Encalhado / Em Aberto, mesma base de valor */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visão Geral</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={<ShoppingBag size={22} />}
          label="Gerado"
          bigValue={`R$ ${kpis.gerado.value.toFixed(2)}`}
          smallValue={pluralize(kpis.gerado.count, 'bolão', 'bolões')}
          color="brand"
          lines={[{ label: 'Comissão total', value: `R$ ${kpis.gerado.commission.toFixed(2)}` }]}
        />
        <KpiCard
          icon={<DollarSign size={22} />}
          label="Vendido"
          bigValue={`R$ ${kpis.vendido.value.toFixed(2)}`}
          smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')}
          color="emerald"
          lines={[
            { label: 'Casa (70%)', value: `R$ ${kpis.vendido.lotericaCommission.toFixed(2)}` },
            { label: 'Operador (30%)', value: `R$ ${kpis.vendido.operatorCommission.toFixed(2)}` },
          ]}
        />
        <KpiCard
          icon={<TrendingDown size={22} />}
          label="Encalhado"
          bigValue={`R$ ${kpis.encalhado.value.toFixed(2)}`}
          smallValue={pluralize(kpis.encalhado.shares, 'cota encalhada', 'cotas encalhadas')}
          color="red"
        />
        <KpiCard
          icon={<Clock size={22} />}
          label="Em Aberto"
          bigValue={`R$ ${kpis.emAberto.value.toFixed(2)}`}
          smallValue={pluralize(kpis.emAberto.shares, 'cota aguardando sorteio', 'cotas aguardando sorteio')}
          color="accent"
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
                <KpiCard icon={<ShoppingBag size={20} />} label="Gerado" bigValue={`R$ ${group.kpis.gerado.value.toFixed(2)}`} smallValue={pluralize(group.kpis.gerado.count, 'bolão', 'bolões')} color="brand" />
                <KpiCard icon={<DollarSign size={20} />} label="Vendido" bigValue={`R$ ${group.kpis.vendido.value.toFixed(2)}`} smallValue={pluralize(group.kpis.vendido.shares, 'cota', 'cotas')} color="emerald" />
                <KpiCard icon={<TrendingDown size={20} />} label="Encalhado" bigValue={`R$ ${group.kpis.encalhado.value.toFixed(2)}`} smallValue={pluralize(group.kpis.encalhado.shares, 'cota', 'cotas')} color="red" />
                <KpiCard icon={<Clock size={20} />} label="Em Aberto" bigValue={`R$ ${group.kpis.emAberto.value.toFixed(2)}`} smallValue={pluralize(group.kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Per-branch breakdown — consolidado, sempre olhando todas as filiais */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Store size={16} /> Por Filial
      </h2>

      {branchStats.length === 0 ? (
        <Card className="mb-8">
          <EmptyState icon={<Store size={48} />} title="Nenhuma filial com bolões" description="Quando as filiais criarem bolões, o consolidado aparecerá aqui." />
        </Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium text-right">Gerado</th>
                  <th className="px-5 py-3 font-medium text-right">Vendido</th>
                  <th className="px-5 py-3 font-medium text-right">Encalhado</th>
                  <th className="px-5 py-3 font-medium text-right">Em Aberto</th>
                </tr>
              </thead>
              <tbody>
                {branchStats.map(({ branch, kpis: k }) => (
                  <tr key={branch.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{branch.name}</td>
                    <td className="px-5 py-3 text-right text-slate-600">R$ {k.gerado.value.toFixed(2)} <span className="text-slate-400">({k.gerado.count})</span></td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-600">R$ {k.vendido.value.toFixed(2)} <span className="text-slate-400 font-normal">({k.vendido.shares})</span></td>
                    <td className="px-5 py-3 text-right font-semibold text-red-600">R$ {k.encalhado.value.toFixed(2)} <span className="text-slate-400 font-normal">({k.encalhado.shares})</span></td>
                    <td className="px-5 py-3 text-right text-slate-600">R$ {k.emAberto.value.toFixed(2)} <span className="text-slate-400">({k.emAberto.shares})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Per-operator breakdown (respeita o filtro de filial selecionado acima) */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Users size={16} /> Por Operador
      </h2>

      {operatorStats.length === 0 ? (
        <Card>
          <EmptyState icon={<Users size={48} />} title="Nenhum operador com cotas alocadas" description="Quando o admin alocar cotas de bolão para os operadores, o desempenho de cada um aparecerá aqui." />
        </Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Operador</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium text-right">Recebido</th>
                  <th className="px-5 py-3 font-medium text-right">Comissão Operador (30%)</th>
                  <th className="px-5 py-3 font-medium text-right">Vendido</th>
                  <th className="px-5 py-3 font-medium text-right">Encalhado</th>
                </tr>
              </thead>
              <tbody>
                {operatorStats.map(({ operator: op, kpis: k, allocations: opAllocations }) => {
                  const branchName = branches.find((br) => br.id === op.branch_id)?.name ?? '—';
                  const isExpanded = expandedOperatorId === op.id;
                  return (
                    <Fragment key={op.id}>
                      <tr
                        onClick={() => setExpandedOperatorId(isExpanded ? null : op.id)}
                        className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
                              {op.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-900">{op.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{branchName}</td>
                        <td className="px-5 py-3 text-right text-slate-600">R$ {k.gerado.value.toFixed(2)} <span className="text-slate-400">({k.gerado.count})</span></td>
                        <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {k.vendido.operatorCommission.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-600">R$ {k.vendido.value.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-600">R$ {k.encalhado.value.toFixed(2)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={6} className="px-5 py-4">
                            {undoError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-2">{undoError}</p>}
                            {opAllocations.length === 0 ? (
                              <p className="text-xs text-slate-400">Nenhuma cota alocada.</p>
                            ) : (
                              <div className="space-y-2">
                                {opAllocations.map((a) => {
                                  const b = a.bolao;
                                  if (!b) return null;
                                  const perShare = Number(b.price) + Number(b.service_fee);
                                  const pending = a.shares_allocated - a.shares_sold;
                                  const statusInfo = STATUS_LABELS[b.status];
                                  return (
                                    <div key={a.id} className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                                      <LotteryIcon slug={b.product?.slug ?? ''} size={24} />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-medium text-slate-900">{b.product?.name ?? '—'}</span>
                                          <span className="text-xs text-slate-400">Concurso {b.contest_number}</span>
                                          <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                                        </div>
                                        <p className="text-xs text-slate-400">Sorteio {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</p>
                                      </div>
                                      <div className="text-xs text-right">
                                        <p className="text-emerald-600 font-semibold">{a.shares_sold} vendida(s) · R$ {(perShare * a.shares_sold).toFixed(2)}</p>
                                        <p className={pending > 0 ? 'text-amber-600' : 'text-slate-400'}>{pending} pendente(s) · R$ {(perShare * pending).toFixed(2)}</p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); undoLastSale(a); }}
                                        disabled={a.shares_sold <= 0 || undoingId === a.id}
                                        title="Desfazer a última venda desta cota (volta 1 cota vendida para pendente)"
                                        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                                      >
                                        <Undo2 size={13} /> {undoingId === a.id ? 'Desfazendo...' : 'Desfazer venda'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
