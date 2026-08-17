import { Fragment, useEffect, useState, useCallback } from 'react';
import { ShoppingBag, DollarSign, TrendingDown, Calendar, Users, Clock, ChevronDown, ChevronRight, Undo2, Trophy, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Spinner, EmptyState, Badge, Button } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Bolao, Branch, Profile, BolaoOperatorAllocation } from '../lib/types';
import { computeBolaoKpis, computeAllocationKpis, pluralize, STATUS_LABELS, type BolaoKpis } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import { calculateTieredCommission, getCommissionRate, GROUP_MONTHLY_GOAL } from '../lib/commission';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup { key: string; label: string; boloes: Bolao[]; kpis: BolaoKpis; }

function groupByMonth(boloes: Bolao[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const b of boloes) {
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, boloes: [], kpis: computeBolaoKpis([]) });
    map.get(key)!.boloes.push(b);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  for (const g of groups) g.kpis = computeBolaoKpis(g.boloes);
  return groups;
}

interface OperatorStats { operator: Profile; kpis: BolaoKpis; allocations: BolaoOperatorAllocation[]; monthlySalesValue: number; monthlyServiceFee: number; commission: number; }

export function AdminDashboard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [allBoloes, setAllBoloes] = useState<Bolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [allocations, setAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOperatorId, setExpandedOperatorId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);

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
      p_bolao_id: allocation.bolao_id, p_operator_id: allocation.operator_id, p_shares_sold: allocation.shares_sold - 1,
    });
    setUndoingId(null);
    if (error) { setUndoError(error.message); return; }
    fetchData();
  };

  const settleEncalhe = async (bolaoId: string) => {
    setSettlingId(bolaoId);
    setUndoError(null);
    const { error } = await supabase.rpc('settle_encalhe', { p_bolao_id: bolaoId });
    setSettlingId(null);
    if (error) { setUndoError(error.message); return; }
    fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  const kpis = computeBolaoKpis(allBoloes);
  const monthGroups = groupByMonth(allBoloes);
  const branchName = (id: string | null) => id ? (branches.find((br) => br.id === id)?.name ?? '—') : '—';

  const now = new Date();
  const currentMonthLabel = monthNames[now.getMonth()] + ' ' + now.getFullYear();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
  const currentMonthBoloes = allBoloes.filter((b) => {
    const d = new Date(b.created_at);
    return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}` === currentMonthKey;
  });
  const currentMonthKpis = computeBolaoKpis(currentMonthBoloes);
  const groupMonthlySalesValue = currentMonthKpis.vendido.value;
  const groupMonthlyServiceFee = currentMonthKpis.vendido.commission;
  const groupGoalProgress = Math.min(100, (groupMonthlySalesValue / GROUP_MONTHLY_GOAL) * 100);

  const operatorStats: OperatorStats[] = operators.map((op) => {
    const opAllocations = allocations.filter((a) => a.operator_id === op.id);
    const k = computeAllocationKpis(opAllocations);
    const monthlyAllocs = opAllocations.filter((a) => {
      if (!a.bolao) return false;
      const d = new Date(a.bolao.created_at);
      return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}` === currentMonthKey;
    });
    const monthlySalesValue = monthlyAllocs.reduce((s, a) => {
      if (!a.bolao) return s;
      return s + (Number(a.bolao.price) + Number(a.bolao.service_fee)) * a.shares_sold;
    }, 0);
    const monthlyServiceFee = monthlyAllocs.reduce((s, a) => {
      if (!a.bolao) return s;
      return s + Number(a.bolao.service_fee) * a.shares_sold;
    }, 0);
    const commission = calculateTieredCommission(monthlySalesValue, monthlyServiceFee);
    return { operator: op, kpis: k, allocations: opAllocations, monthlySalesValue, monthlyServiceFee, commission };
  }).filter((s) => s.kpis.gerado.count > 0).sort((a, b) => b.kpis.vendido.value - a.kpis.vendido.value);

  const top5ByGoal = [...operatorStats].sort((a, b) => b.monthlySalesValue - a.monthlySalesValue).slice(0, 5);
  const encalhesPendentes = allBoloes.filter((b) => b.status === 'encalhado' && !b.encalhe_settled);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Visão consolidada do grupo Mega Bolão Brasil" />

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Meta do Grupo — {currentMonthLabel}</h2>
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-500">Vendas totais no mês</p>
            <p className="text-2xl font-bold text-brand-950">R$ {formatBRL(groupMonthlySalesValue)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Taxa de serviço: R$ {formatBRL(groupMonthlyServiceFee)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Meta</p>
            <p className="text-lg font-semibold text-brand-700">R$ {formatBRL(GROUP_MONTHLY_GOAL)}</p>
          </div>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500" style={{ width: `${groupGoalProgress}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-2">{groupGoalProgress.toFixed(1)}% da meta alcançada · Faltam R$ {formatBRL(Math.max(0, GROUP_MONTHLY_GOAL - groupMonthlySalesValue))}</p>

        {/* Commission breakdown */}
        <div className="mt-4 bg-slate-50 rounded-lg p-4 text-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Repasse de comissões para os operadores</p>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Vendas totais do grupo no mês</span>
              <span className="font-medium text-slate-900">R$ {formatBRL(groupMonthlySalesValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Taxa de serviço arrecadada</span>
              <span className="font-medium text-slate-900">R$ {formatBRL(groupMonthlyServiceFee)}</span>
            </div>
            <p className="text-[11px] text-slate-400 pt-1">A comissão de cada operador é calculada sobre a taxa de serviço, no percentual do tier que ele atingiu em vendas totais (10% até R$ 10k, 20% até R$ 20k, 30% acima).</p>
          </div>
        </div>
      </Card>

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visão Geral — Todos os Bolões</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<ShoppingBag size={22} />} label="Gerado" bigValue={`R$ ${formatBRL(kpis.gerado.value)}`} smallValue={pluralize(kpis.gerado.count, 'bolão', 'bolões')} color="brand"
          lines={[{ label: 'Taxa total', value: `R$ ${formatBRL(kpis.gerado.commission)}` }]} />
        <KpiCard icon={<DollarSign size={22} />} label="Vendido" bigValue={`R$ ${formatBRL(kpis.vendido.value)}`} smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')} color="emerald"
          lines={[{ label: 'Taxa vendida', value: `R$ ${formatBRL(kpis.vendido.commission)}` }]} />
        <KpiCard icon={<TrendingDown size={22} />} label="Encalhe Pendente" bigValue={`R$ ${formatBRL(kpis.encalhado.value)}`} smallValue={pluralize(kpis.encalhado.shares, 'cota', 'cotas')} color="amber" />
        <KpiCard icon={<Clock size={22} />} label="Em Aberto" bigValue={`R$ ${formatBRL(kpis.emAberto.value)}`} smallValue={pluralize(kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
      </div>

      {isAdmin && encalhesPendentes.length > 0 && (
        <Card className="overflow-hidden mb-8 border-amber-200">
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-900">Encalhes Pendentes de Baixa ({encalhesPendentes.length})</h2>
          </div>
          {undoError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 m-3">{undoError}</p>}
          <div className="divide-y divide-slate-50">
            {encalhesPendentes.map((b) => {
              const perShare = Number(b.price) + Number(b.service_fee);
              const unsoldShares = b.total_shares - b.sold_shares;
              const unsoldValue = perShare * unsoldShares;
              const statusInfo = STATUS_LABELS[b.status];
              return (
                <div key={b.id} className="px-5 py-3 flex items-center gap-3">
                  <LotteryIcon slug={b.product?.slug ?? ''} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-900 text-sm">{b.product?.name ?? '—'}</span>
                      <span className="text-xs text-slate-400">Concurso {b.contest_number}</span>
                      <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                      <span className="font-medium text-red-600">{unsoldShares} cotas sem vender · R$ {formatBRL(unsoldValue)}</span>
                      <span>Sorteio: {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => settleEncalhe(b.id)} disabled={settlingId === b.id}>
                    <CheckCircle2 size={14} /> {settlingId === b.id ? 'Baixando...' : 'Dar baixa'}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Trophy size={16} /> Ranking dos 5 Operadores — Meta {currentMonthLabel}
      </h2>
      {top5ByGoal.length === 0 ? (
        <Card className="mb-8"><EmptyState icon={<Trophy size={48} />} title="Nenhum operador com vendas" description="Quando os operadores começarem a vender, o ranking aparecerá aqui." /></Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Operador</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium text-right">Vendas (mês)</th>
                  <th className="px-5 py-3 font-medium text-right">Tier</th>
                  <th className="px-5 py-3 font-medium text-right">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {top5ByGoal.map((s, i) => {
                  const rate = getCommissionRate(s.monthlySalesValue);
                  const tierLabel = rate === 0.10 ? '10%' : rate === 0.20 ? '20%' : '30%';
                  const tierColor = rate === 0.10 ? 'slate' : rate === 0.20 ? 'amber' : 'green';
                  return (
                    <tr key={s.operator.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-900">{s.operator.name}</td>
                      <td className="px-5 py-3 text-slate-600">{branchName(s.operator.branch_id)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(s.monthlySalesValue)}</td>
                      <td className="px-5 py-3 text-right"><Badge color={tierColor}>{tierLabel}</Badge></td>
                      <td className="px-5 py-3 text-right font-semibold text-emerald-600">R$ {formatBRL(s.commission)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Calendar size={16} /> Por Mês
      </h2>
      {monthGroups.length === 0 ? (
        <Card className="mb-8"><EmptyState icon={<ShoppingBag size={48} />} title="Nenhum bolão criado" description="Os bolões criados aparecerão aqui." /></Card>
      ) : (
        <div className="space-y-6 mb-8">
          {monthGroups.map((group) => (
            <Card key={group.key} className="overflow-hidden">
              <div className="px-5 py-3 bg-brand-50 border-b border-brand-100"><h3 className="font-semibold text-brand-900">{group.label}</h3></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-5">
                <KpiCard icon={<ShoppingBag size={20} />} label="Gerado" bigValue={`R$ ${formatBRL(group.kpis.gerado.value)}`} smallValue={pluralize(group.kpis.gerado.count, 'bolão', 'bolões')} color="brand" />
                <KpiCard icon={<DollarSign size={20} />} label="Vendido" bigValue={`R$ ${formatBRL(group.kpis.vendido.value)}`} smallValue={pluralize(group.kpis.vendido.shares, 'cota', 'cotas')} color="emerald" />
                <KpiCard icon={<TrendingDown size={20} />} label="Encalhe Pend." bigValue={`R$ ${formatBRL(group.kpis.encalhado.value)}`} smallValue={pluralize(group.kpis.encalhado.shares, 'cota', 'cotas')} color="amber" />
                <KpiCard icon={<Clock size={20} />} label="Em Aberto" bigValue={`R$ ${formatBRL(group.kpis.emAberto.value)}`} smallValue={pluralize(group.kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Users size={16} /> Por Operador
      </h2>
      {operatorStats.length === 0 ? (
        <Card><EmptyState icon={<Users size={48} />} title="Nenhum operador com cotas alocadas" description="Quando o admin alocar cotas de bolão para os operadores, o desempenho de cada um aparecerá aqui." /></Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Operador</th>
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium text-right">Recebido</th>
                  <th className="px-5 py-3 font-medium text-right">Vendido</th>
                  <th className="px-5 py-3 font-medium text-right">Encalhado</th>
                  <th className="px-5 py-3 font-medium text-right">Comissão (mês)</th>
                </tr>
              </thead>
              <tbody>
                {operatorStats.map(({ operator: op, kpis: k, allocations: opAllocations, monthlySalesValue, commission }) => {
                  const isExpanded = expandedOperatorId === op.id;
                  return (
                    <Fragment key={op.id}>
                      <tr onClick={() => setExpandedOperatorId(isExpanded ? null : op.id)} className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
                            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">{op.name.charAt(0).toUpperCase()}</div>
                            <span className="font-medium text-slate-900">{op.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-slate-600">{branchName(op.branch_id)}</td>
                        <td className="px-5 py-3 text-right text-slate-600">R$ {formatBRL(k.gerado.value)} <span className="text-slate-400">({k.gerado.count})</span></td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-600">R$ {formatBRL(k.vendido.value)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-red-600">R$ {formatBRL(k.encalhado.value + k.encalheBaixado.value)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(commission)}</td>
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
                                        <p className="text-emerald-600 font-semibold">{a.shares_sold} vendida(s) · R$ {formatBRL(perShare * a.shares_sold)}</p>
                                        <p className={pending > 0 ? 'text-amber-600' : 'text-slate-400'}>{pending} pendente(s) · R$ {formatBRL(perShare * pending)}</p>
                                      </div>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); undoLastSale(a); }} disabled={a.shares_sold <= 0 || undoingId === a.id}
                                        title="Desfazer a última venda desta cota"
                                        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0">
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

function KpiCard({ icon, label, bigValue, smallValue, lines, color }: {
  icon: React.ReactNode; label: string; bigValue: string; smallValue?: string; lines?: { label: string; value: string }[]; color: string;
}) {
  const colors: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600', emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', accent: 'bg-accent-50 text-accent-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
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
