import { Fragment, useEffect, useState, useCallback } from 'react';
import { ShoppingBag, DollarSign, TrendingDown, Calendar, Users, Clock, ChevronDown, ChevronRight, Undo2, Trophy, Store, Package, TrendingUp, Pencil, Save, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Spinner, EmptyState, Badge, Button } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Bolao, Branch, Profile, BolaoOperatorAllocation, BolaoBranchAllocation, MonthlyGoal } from '../lib/types';
import { computeBolaoKpis, computeAllocationKpis, pluralize, STATUS_LABELS, type BolaoKpis } from '../lib/bolaoKpis';
import { formatBRL } from '../lib/format';
import { calculateTieredCommission, getCommissionRate, GROUP_MONTHLY_GOAL as DEFAULT_GOAL } from '../lib/commission';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface DayGroup { key: string; label: string; boloes: Bolao[]; kpis: BolaoKpis; }

function groupByDay(boloes: Bolao[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const b of boloes) {
    const d = new Date(b.created_at);
    const key = d.toISOString().split('T')[0];
    if (!map.has(key)) {
      const label = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      map.set(key, { key, label: label.charAt(0).toUpperCase() + label.slice(1), boloes: [], kpis: computeBolaoKpis([]) });
    }
    map.get(key)!.boloes.push(b);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
  for (const g of groups) g.kpis = computeBolaoKpis(g.boloes);
  return groups;
}

const DAY_PAGE_SIZE = 7;

interface MonthProductSummary { productName: string; slug: string; count: number; totalShares: number; totalValue: number; soldShares: number; soldValue: number; }

function computeMonthProductSummary(boloes: Bolao[]): MonthProductSummary[] {
  const map = new Map<string, MonthProductSummary>();
  for (const b of boloes) {
    if (!b.product) continue;
    const key = b.product.id;
    const existing = map.get(key) ?? { productName: b.product.name, slug: b.product.slug ?? '', count: 0, totalShares: 0, totalValue: 0, soldShares: 0, soldValue: 0 };
    const perShare = Number(b.price) + Number(b.service_fee);
    existing.count += 1;
    existing.totalShares += b.total_shares;
    existing.totalValue += perShare * b.total_shares;
    existing.soldShares += b.sold_shares;
    existing.soldValue += perShare * b.sold_shares;
    map.set(key, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
}

interface OperatorStats { operator: Profile; kpis: BolaoKpis; allocations: BolaoOperatorAllocation[]; monthlySalesValue: number; monthlyServiceFee: number; commission: number; }

export function AdminDashboard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [allBoloes, setAllBoloes] = useState<Bolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [allocations, setAllocations] = useState<BolaoOperatorAllocation[]>([]);
  const [branchAllocations, setBranchAllocations] = useState<BolaoBranchAllocation[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [goalSaving, setGoalSaving] = useState(false);
  const [expandedOperatorId, setExpandedOperatorId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [dayPage, setDayPage] = useState(0);
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [{ data: boloes }, { data: branchList }, { data: opList }, { data: allocList }, { data: baList }, { data: goalsData }] = await Promise.all([
      supabase.from('boloes').select('*, product:products(*), branch:branches(*), operator:profiles(*)').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('profiles').select('*').eq('role', 'operator').order('name'),
      supabase.from('bolao_operator_allocations').select('*, bolao:boloes(*, product:products(*), branch:branches(*))'),
      supabase.from('bolao_branch_allocations').select('*, bolao:boloes(*, product:products(*)), branch:branches(*)'),
      supabase.from('monthly_goals').select('*'),
    ]);
    setAllBoloes((boloes ?? []) as Bolao[]);
    setBranches((branchList ?? []) as Branch[]);
    setOperators((opList ?? []) as Profile[]);
    setAllocations((allocList ?? []) as BolaoOperatorAllocation[]);
    setBranchAllocations((baList ?? []) as BolaoBranchAllocation[]);
    setMonthlyGoals((goalsData ?? []) as MonthlyGoal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('admin-dashboard-boloes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_operator_allocations' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolao_branch_allocations' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_goals' }, () => fetchData())
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

  const getMonthGoal = (monthKey: string): number => {
    const g = monthlyGoals.find((mg) => mg.month_key === monthKey);
    return g ? Number(g.goal_amount) : DEFAULT_GOAL;
  };

  const saveGoal = async () => {
    const amount = Number(goalInput.replace(/[.,\s]/g, ''));
    if (isNaN(amount) || amount < 0) return;
    setGoalSaving(true);
    const { error } = await supabase
      .from('monthly_goals')
      .upsert({ month_key: currentMonthKey, goal_amount: amount, updated_by: profile?.id ?? null }, { onConflict: 'month_key' });
    setGoalSaving(false);
    if (error) { setUndoError(error.message); return; }
    setGoalEditing(false);
    fetchData();
  };

  const startGoalEdit = () => {
    setGoalInput(String(getMonthGoal(currentMonthKey)));
    setGoalEditing(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  const kpis = computeBolaoKpis(allBoloes);
  const dayGroups = groupByDay(allBoloes);
  const dayTotalPages = Math.max(1, Math.ceil(dayGroups.length / DAY_PAGE_SIZE));
  const dayStartIdx = dayPage * DAY_PAGE_SIZE;
  const pagedDayGroups = dayGroups.slice(dayStartIdx, dayStartIdx + DAY_PAGE_SIZE);
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
  const groupGoalProgress = Math.min(100, (groupMonthlySalesValue / getMonthGoal(currentMonthKey)) * 100);

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

  const todayStr = new Date().toISOString().split('T')[0];
  const todayBoloes = allBoloes.filter((b) => b.created_at.startsWith(todayStr));
  const todayTotalValue = todayBoloes.reduce((s, b) => s + (Number(b.price) + Number(b.service_fee)) * b.total_shares, 0);
  const todayTotalShares = todayBoloes.reduce((s, b) => s + b.total_shares, 0);

  const branchSummary = branches.map((br) => {
    const brAllocs = branchAllocations.filter((ba) => ba.branch_id === br.id);
    const totalShares = brAllocs.reduce((s, ba) => s + ba.shares_allocated, 0);
    const totalValue = brAllocs.reduce((s, ba) => {
      if (!ba.bolao) return s;
      return s + (Number(ba.bolao.price) + Number(ba.bolao.service_fee)) * ba.shares_allocated;
    }, 0);
    const pickedShares = brAllocs.reduce((s, ba) => s + ba.shares_picked, 0);
    const bolaoCount = brAllocs.length;
    return { branch: br, totalShares, totalValue, pickedShares, bolaoCount };
  }).sort((a, b) => b.totalValue - a.totalValue);

  const productSummaryMap = new Map<string, { productName: string; slug: string; count: number; totalShares: number; totalValue: number; soldShares: number; soldValue: number }>();
  for (const b of allBoloes) {
    if (!b.product) continue;
    const key = b.product.id;
    const existing = productSummaryMap.get(key) ?? { productName: b.product.name, slug: b.product.slug ?? '', count: 0, totalShares: 0, totalValue: 0, soldShares: 0, soldValue: 0 };
    const perShare = Number(b.price) + Number(b.service_fee);
    existing.count += 1;
    existing.totalShares += b.total_shares;
    existing.totalValue += perShare * b.total_shares;
    existing.soldShares += b.sold_shares;
    existing.soldValue += perShare * b.sold_shares;
    productSummaryMap.set(key, existing);
  }
  const productSummary = Array.from(productSummaryMap.values()).sort((a, b) => b.totalValue - a.totalValue);

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
            <div className="flex items-center gap-2 justify-end">
              <p className="text-sm text-slate-500">Meta</p>
              {isAdmin && !goalEditing && (
                <button onClick={startGoalEdit} className="text-slate-400 hover:text-brand-600 transition-colors" title="Editar meta">
                  <Pencil size={14} />
                </button>
              )}
            </div>
            {goalEditing ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  className="w-32 px-2 py-1 text-right text-lg font-semibold text-brand-700 border border-brand-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-200"
                  placeholder="Valor da meta"
                  autoFocus
                />
                <button onClick={saveGoal} disabled={goalSaving} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50" title="Salvar">
                  <Save size={18} />
                </button>
                <button onClick={() => setGoalEditing(false)} className="text-slate-400 hover:text-red-500" title="Cancelar">
                  <X size={18} />
                </button>
              </div>
            ) : (
              <p className="text-lg font-semibold text-brand-700">R$ {formatBRL(getMonthGoal(currentMonthKey))}</p>
            )}
          </div>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-500" style={{ width: `${groupGoalProgress}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-2">{groupGoalProgress.toFixed(1)}% da meta alcançado · Faltam R$ {formatBRL(Math.max(0, getMonthGoal(currentMonthKey) - groupMonthlySalesValue))}</p>

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

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <TrendingUp size={16} /> Bolões de Hoje — {new Date().toLocaleDateString('pt-BR')}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Package size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Bolões criados hoje</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">{todayBoloes.length}</p>
          <p className="text-sm text-slate-500 mt-1">{todayTotalShares} cotas no total</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><DollarSign size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Valor gerado hoje</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">R$ {formatBRL(todayTotalValue)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Store size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Filiais ativas</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">{branches.length}</p>
          <p className="text-sm text-slate-500 mt-1">{branchSummary.filter((bs) => bs.bolaoCount > 0).length} receberam bolões</p>
        </Card>
      </div>

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Visão Geral — Todos os Bolões</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard icon={<ShoppingBag size={22} />} label="Gerado" bigValue={`R$ ${formatBRL(kpis.gerado.value)}`} smallValue={pluralize(kpis.gerado.count, 'bolão', 'bolões')} color="brand"
          lines={[{ label: 'Taxa total', value: `R$ ${formatBRL(kpis.gerado.commission)}` }]} />
        <KpiCard icon={<DollarSign size={22} />} label="Vendido" bigValue={`R$ ${formatBRL(kpis.vendido.value)}`} smallValue={pluralize(kpis.vendido.shares, 'cota vendida', 'cotas vendidas')} color="emerald"
          lines={[{ label: 'Taxa vendida', value: `R$ ${formatBRL(kpis.vendido.commission)}` }]} />
        <KpiCard icon={<Clock size={22} />} label="Em Aberto" bigValue={`R$ ${formatBRL(kpis.emAberto.value)}`} smallValue={pluralize(kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
      </div>


      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Store size={16} /> Filiais — Bolões Recebidos em Estoque
      </h2>
      {branchSummary.length === 0 ? (
        <Card className="mb-8"><EmptyState icon={<Store size={48} />} title="Nenhuma filial cadastrada" description="Cadastre filiais para distribuir bolões." /></Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Filial</th>
                  <th className="px-5 py-3 font-medium text-right">Bolões recebidos</th>
                  <th className="px-5 py-3 font-medium text-right">Cotas em estoque</th>
                  <th className="px-5 py-3 font-medium text-right">Cotas pegas por operadores</th>
                  <th className="px-5 py-3 font-medium text-right">Valor em estoque</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map((bs) => (
                  <tr key={bs.branch.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-slate-900">{bs.branch.name}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{bs.bolaoCount}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{bs.totalShares}</td>
                    <td className="px-5 py-3 text-right font-semibold text-amber-600">{bs.pickedShares}</td>
                    <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(bs.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Package size={16} /> Resumo por Produto (Jogos)
      </h2>
      {productSummary.length === 0 ? (
        <Card className="mb-8"><EmptyState icon={<Package size={48} />} title="Nenhum bolão criado" description="Os bolões criados aparecerão aqui agrupados por produto." /></Card>
      ) : (
        <Card className="overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 font-medium">Produto</th>
                  <th className="px-5 py-3 font-medium text-right">Bolões</th>
                  <th className="px-5 py-3 font-medium text-right">Cotas totais</th>
                  <th className="px-5 py-3 font-medium text-right">Cotas vendidas</th>
                  <th className="px-5 py-3 font-medium text-right">Valor total</th>
                  <th className="px-5 py-3 font-medium text-right">Valor vendido</th>
                </tr>
              </thead>
              <tbody>
                {productSummary.map((ps) => (
                  <tr key={ps.slug} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <LotteryIcon slug={ps.slug} size={24} />
                        <span className="font-medium text-slate-900">{ps.productName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600">{ps.count}</td>
                    <td className="px-5 py-3 text-right text-slate-600">{ps.totalShares}</td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-600">{ps.soldShares}</td>
                    <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(ps.totalValue)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-emerald-600">R$ {formatBRL(ps.soldValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        <Calendar size={16} /> Bolões por Dia de Criação
      </h2>
      {dayGroups.length === 0 ? (
        <Card className="mb-8"><EmptyState icon={<ShoppingBag size={48} />} title="Nenhum bolão criado" description="Os bolões criados aparecerão aqui agrupados por dia." /></Card>
      ) : (
        <Card className="mb-8 overflow-hidden flex flex-col" >
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
            {pagedDayGroups.map((group) => {
              const isToday = group.key === todayStr;
              const isExpanded = isToday || expandedDayKey === group.key;
              const dayProducts = computeMonthProductSummary(group.boloes);
              return (
                <div key={group.key} className={isToday ? 'bg-brand-50/40' : ''}>
                  <button
                    onClick={() => isToday ? null : setExpandedDayKey(isExpanded ? null : group.key)}
                    className={`w-full px-5 py-3 flex items-center gap-2 text-left transition-colors ${isToday ? 'cursor-default' : 'hover:bg-slate-50'}`}
                  >
                    {!isToday && (isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />)}
                    <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">{group.key.split('-').reverse().join('/')}</span>
                    <h3 className="font-semibold text-brand-900 flex-1 capitalize">{group.label}</h3>
                    {isToday && <Badge color="brand">Hoje</Badge>}
                    <span className="text-xs text-slate-500 shrink-0">{group.boloes.length} bolão(ões) · R$ {formatBRL(group.kpis.gerado.value)}</span>
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <KpiCard icon={<ShoppingBag size={20} />} label="Gerado" bigValue={`R$ ${formatBRL(group.kpis.gerado.value)}`} smallValue={pluralize(group.kpis.gerado.count, 'bolão', 'bolões')} color="brand" />
                        <KpiCard icon={<DollarSign size={20} />} label="Vendido" bigValue={`R$ ${formatBRL(group.kpis.vendido.value)}`} smallValue={pluralize(group.kpis.vendido.shares, 'cota', 'cotas')} color="emerald" />
                        <KpiCard icon={<Clock size={20} />} label="Em Aberto" bigValue={`R$ ${formatBRL(group.kpis.emAberto.value)}`} smallValue={pluralize(group.kpis.emAberto.shares, 'cota', 'cotas')} color="accent" />
                      </div>
                      <div className="overflow-x-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                              <th className="px-4 py-2 font-medium">Produto</th>
                              <th className="px-4 py-2 font-medium text-right">Concurso</th>
                              <th className="px-4 py-2 font-medium text-right">Cotas</th>
                              <th className="px-4 py-2 font-medium text-right">Vendidas</th>
                              <th className="px-4 py-2 font-medium text-right">Valor gerado</th>
                              <th className="px-4 py-2 font-medium text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.boloes.map((b) => {
                              const perShare = Number(b.price) + Number(b.service_fee);
                              const statusInfo = STATUS_LABELS[b.status];
                              return (
                                <tr key={b.id} className="border-b border-slate-50">
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-2">
                                      <LotteryIcon slug={b.product?.slug ?? ''} size={20} />
                                      <span className="font-medium text-slate-900">{b.product?.name ?? '—'}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right text-slate-600">{b.contest_number}</td>
                                  <td className="px-4 py-2 text-right text-slate-600">{b.total_shares}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-emerald-600">{b.sold_shares}</td>
                                  <td className="px-4 py-2 text-right font-semibold text-brand-700">R$ {formatBRL(perShare * b.total_shares)}</td>
                                  <td className="px-4 py-2 text-right"><Badge color={statusInfo.color}>{statusInfo.label}</Badge></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {dayProducts.length > 1 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Resumo por produto</p>
                          <div className="flex flex-wrap gap-2">
                            {dayProducts.map((dp) => (
                              <span key={dp.slug} className="inline-flex items-center gap-1.5 text-xs bg-slate-100 rounded-full px-3 py-1">
                                <LotteryIcon slug={dp.slug} size={14} />
                                <span className="font-medium text-slate-700">{dp.productName}</span>
                                <span className="text-slate-400">· {dp.count} bolão(ões)</span>
                                <span className="text-brand-700 font-semibold">R$ {formatBRL(dp.totalValue)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {dayTotalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Página {dayPage + 1} de {dayTotalPages} · {dayGroups.length} dia(s) no total
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDayPage((p) => Math.max(0, p - 1))} disabled={dayPage === 0}>
                  <ChevronRight size={14} className="rotate-180" /> Anterior
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDayPage((p) => Math.min(dayTotalPages - 1, p + 1))} disabled={dayPage >= dayTotalPages - 1}>
                  Próxima <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </Card>
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
                  <th className="px-5 py-3 font-medium text-right">Comissão (mês)</th>
                </tr>
              </thead>
              <tbody>
                {operatorStats.map(({ operator: op, kpis: k, allocations: opAllocations, commission }) => {
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
                        <td className="px-5 py-3 text-right font-semibold text-brand-700">R$ {formatBRL(commission)}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={5} className="px-5 py-4">
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
