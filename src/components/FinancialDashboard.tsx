import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Wallet, Calendar, Store, DollarSign, ArrowDownCircle, ArrowUpCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Select, Spinner, EmptyState, Badge } from './ui';
import { formatBRL } from '../lib/format';
import type { FinBill, FinCashClosing, FinDailyControl, Branch } from '../lib/types';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function FinancialDashboard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [bills, setBills] = useState<FinBill[]>([]);
  const [closings, setClosings] = useState<FinCashClosing[]>([]);
  const [dailyControls, setDailyControls] = useState<FinDailyControl[]>([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const [fMonth, setFMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (isAdmin) {
        setSelectedBranch(''); // consolidated view by default for admin
      } else {
        setSelectedBranch(profile?.branch_id ?? '');
      }
    });
  }, [profile, isAdmin]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [billRes, ccRes, dcRes] = await Promise.all([
      supabase.from('fin_bills').select('*, category:fin_categories(*), branch:branches(*)').order('year_ref', { ascending: false }).order('month_ref', { ascending: false }),
      supabase.from('fin_cash_closing').select('*, branch:branches(*)').order('closing_date', { ascending: false }),
      supabase.from('fin_daily_control').select('*').order('control_date', { ascending: false }),
    ]);
    setBills((billRes.data ?? []) as FinBill[]);
    setClosings((ccRes.data ?? []) as FinCashClosing[]);
    setDailyControls((dcRes.data ?? []) as FinDailyControl[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter by branch if selected
  const branchBills = selectedBranch ? bills.filter((b) => b.branch_id === selectedBranch) : bills;
  const branchClosings = selectedBranch ? closings.filter((c) => c.branch_id === selectedBranch) : closings;
  const branchDaily = selectedBranch ? dailyControls.filter((d) => d.branch_id === selectedBranch) : dailyControls;

  // Filter by month
  const [fYear, fMonthNum] = fMonth.split('-').map(Number);
  const monthBills = branchBills.filter((b) => b.month_ref === fMonthNum && b.year_ref === fYear);
  const monthClosings = branchClosings.filter((c) => {
    const d = new Date(c.closing_date);
    return d.getFullYear() === fYear && d.getMonth() + 1 === fMonthNum;
  });
  const monthDaily = branchDaily.filter((d) => {
    const dd = new Date(d.control_date);
    return dd.getFullYear() === fYear && dd.getMonth() + 1 === fMonthNum;
  });

  const totalExpenses = monthBills.filter((b) => b.type === 'expense').reduce((s, b) => s + Number(b.amount), 0);
  const totalIncome = monthBills.filter((b) => b.type === 'income').reduce((s, b) => s + Number(b.amount), 0);
  const totalPending = monthBills.filter((b) => b.status === 'pending' && b.type === 'expense').reduce((s, b) => s + Number(b.amount), 0);
  const balance = totalIncome - totalExpenses;

  const totalSales = monthClosings.reduce((s, c) => s + Number(c.total_sales), 0);
  const totalPix = monthClosings.reduce((s, c) => s + Number(c.total_pix_externals), 0);
  const totalSurplus = monthClosings.reduce((s, c) => s + Number(c.surplus), 0);
  const totalShortage = monthClosings.reduce((s, c) => s + Number(c.shortage), 0);
  const totalSafe = monthDaily.reduce((s, d) => s + Number(d.safe_amount), 0);
  const totalWorked = monthDaily.reduce((s, d) => s + Number(d.worked_amount), 0);

  // Per-branch summary (consolidated view)
  const branchSummary = branches.map((br) => {
    const brBills = bills.filter((b) => b.branch_id === br.id && b.month_ref === fMonthNum && b.year_ref === fYear);
    const brExpenses = brBills.filter((b) => b.type === 'expense').reduce((s, b) => s + Number(b.amount), 0);
    const brIncome = brBills.filter((b) => b.type === 'income').reduce((s, b) => s + Number(b.amount), 0);
    const brClosings = closings.filter((c) => {
      if (c.branch_id !== br.id) return false;
      const d = new Date(c.closing_date);
      return d.getFullYear() === fYear && d.getMonth() + 1 === fMonthNum;
    });
    const brSales = brClosings.reduce((s, c) => s + Number(c.total_sales), 0);
    return { branch: br, expenses: brExpenses, income: brIncome, balance: brIncome - brExpenses, sales: brSales };
  }).filter((s) => s.expenses > 0 || s.income > 0 || s.sales > 0);

  const branchOptions = [
    { value: '', label: 'Visão Consolidada' },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];

  const monthOpts = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    for (let m = 11; m >= 0; m--) {
      monthOpts.push({ value: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${monthNames[m]} ${y}` });
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Dashboard Financeiro"
        subtitle={selectedBranch ? `Visão da filial — ${monthNames[fMonthNum - 1]} ${fYear}` : `Visão consolidada — ${monthNames[fMonthNum - 1]} ${fYear}`}
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} />
            )}
            <Select value={fMonth} onChange={setFMonth} options={monthOpts} />
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ArrowUpCircle size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Receitas</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {formatBRL(totalIncome)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><ArrowDownCircle size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Despesas</p>
          </div>
          <p className="text-2xl font-bold text-red-600">R$ {formatBRL(totalExpenses)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${balance >= 0 ? 'bg-brand-50 text-brand-600' : 'bg-red-50 text-red-600'}`}><Wallet size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Saldo do Mês</p>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-brand-700' : 'text-red-600'}`}>R$ {formatBRL(balance)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><Clock size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Pendentes</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">R$ {formatBRL(totalPending)}</p>
        </Card>
      </div>

      {/* Cash closing summary */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <DollarSign size={16} /> Fechamento de Caixa — {monthNames[fMonthNum - 1]}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><DollarSign size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Vendas</p>
          </div>
          <p className="text-xl font-bold text-brand-950">R$ {formatBRL(totalSales)}</p>
          <p className="text-xs text-slate-400 mt-1">{monthClosings.length} fechamento(s)</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><TrendingUp size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Pix Externos</p>
          </div>
          <p className="text-xl font-bold text-brand-600">R$ {formatBRL(totalPix)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><TrendingUp size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Sobras</p>
          </div>
          <p className="text-xl font-bold text-emerald-600">R$ {formatBRL(totalSurplus)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><TrendingDown size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Faltas</p>
          </div>
          <p className="text-xl font-bold text-red-600">R$ {formatBRL(totalShortage)}</p>
        </Card>
      </div>

      {/* Daily control summary */}
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Calendar size={16} /> Controle Diário — {monthNames[fMonthNum - 1]}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center"><Calendar size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Trabalhado</p>
          </div>
          <p className="text-xl font-bold text-brand-950">R$ {formatBRL(totalWorked)}</p>
          <p className="text-xs text-slate-400 mt-1">{monthDaily.length} registros</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total no Cofre</p>
          </div>
          <p className="text-xl font-bold text-emerald-600">R$ {formatBRL(totalSafe)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Clock size={18} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Diferença Total</p>
          </div>
          <p className={`text-xl font-bold ${monthDaily.reduce((s, d) => s + (Number(d.worked_amount) - Number(d.valor_043 ?? 0)), 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>R$ {formatBRL(monthDaily.reduce((s, d) => s + (Number(d.worked_amount) - Number(d.valor_043 ?? 0)), 0))}</p>
        </Card>
      </div>

      {/* Per-branch consolidated table */}
      {!selectedBranch && branchSummary.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Store size={16} /> Resumo por Filial — {monthNames[fMonthNum - 1]} {fYear}
          </h2>
          <Card className="overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                    <th className="px-5 py-3 font-medium">Filial</th>
                    <th className="px-5 py-3 font-medium text-right">Vendas</th>
                    <th className="px-5 py-3 font-medium text-right">Receitas</th>
                    <th className="px-5 py-3 font-medium text-right">Despesas</th>
                    <th className="px-5 py-3 font-medium text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {branchSummary.map((s) => (
                    <tr key={s.branch.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-slate-900">{s.branch.name}</td>
                      <td className="px-5 py-3 text-right text-slate-600">R$ {formatBRL(s.sales)}</td>
                      <td className="px-5 py-3 text-right text-emerald-600">R$ {formatBRL(s.income)}</td>
                      <td className="px-5 py-3 text-right text-red-600">R$ {formatBRL(s.expenses)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge color={s.balance >= 0 ? 'green' : 'red'}>R$ {formatBRL(s.balance)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {selectedBranch && monthBills.length === 0 && monthClosings.length === 0 && monthDaily.length === 0 && (
        <Card><EmptyState icon={<Wallet size={48} />} title="Sem dados no período" description="Não há registros financeiros para esta filial no mês selecionado." /></Card>
      )}
    </div>
  );
}
