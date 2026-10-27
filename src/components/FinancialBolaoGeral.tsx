import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Plus, Trash2, Ticket, TrendingDown, TrendingUp, DollarSign, Megaphone, Banknote, HandCoins, Smartphone, Trophy, Info, CalendarDays, ClipboardList } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR, maskBRL, parseBRL } from '../lib/format';
import type { Branch, FinBolaoGeral, FinBolaoGeralAddInfo } from '../lib/types';

const today = () => new Date().toLocaleDateString('en-CA');
const currentMonth = () => today().slice(0, 7);

type Entry = {
  id: string;
  bolao_date: string;
  modality: string;
  contest: string;
  bolao_value: string;
  fee_percentage: string;
  fee_value: string;
  notes: string;
};

const emptyEntry = (): Entry => ({
  id: crypto.randomUUID(),
  bolao_date: today(),
  modality: '',
  contest: '',
  bolao_value: '',
  fee_percentage: '',
  fee_value: '',
  notes: '',
});

type AddInfoEntry = {
  id: string;
  period: 'daily' | 'monthly';
  ref_date: string;
  ref_month: string;
  prejuizo: string;
  comissao: string;
  premiacao: string;
  venda_marketing: string;
  venda_dinheiro: string;
  fiado: string;
  fiado_obs: string;
  valor_pix: string;
  notes: string;
};

const emptyAddInfo = (): AddInfoEntry => ({
  id: crypto.randomUUID(),
  period: 'daily',
  ref_date: today(),
  ref_month: currentMonth(),
  prejuizo: '',
  comissao: '',
  premiacao: '',
  venda_marketing: '',
  venda_dinheiro: '',
  fiado: '',
  fiado_obs: '',
  valor_pix: '',
  notes: '',
});

function money(v: number) { return Math.round((v + Number.EPSILON) * 100); }

const moneyField = (label: string, value: string, onChange: (v: string) => void, placeholder = 'R$ 0,00') => (
  <div>
    <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(ev) => onChange(maskBRL(ev.target.value))}
      placeholder={placeholder}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
    />
  </div>
);

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  isCurrency: boolean;
  gradient: string;
  iconBg: string;
  accentText: string;
}

function SummaryCard({ icon, label, value, isCurrency, gradient, iconBg, accentText }: SummaryCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5`}>
      <div className={`absolute inset-x-0 top-0 h-1 ${gradient}`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${accentText}`}>{isCurrency ? `R$ ${formatBRL(value)}` : String(value)}</p>
    </div>
  );
}

export function FinancialBolaoGeral() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [rows, setRows] = useState<FinBolaoGeral[]>([]);
  const [addInfoRows, setAddInfoRows] = useState<FinBolaoGeralAddInfo[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [viewMode, setViewMode] = useState<'day' | 'month'>('month');
  const [filterDate, setFilterDate] = useState(today());
  const [month, setMonth] = useState(currentMonth());
  const [modFilter, setModFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinBolaoGeral | null>(null);
  const [entries, setEntries] = useState<Entry[]>([emptyEntry()]);
  const [modalBranch, setModalBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Informações adicionais modal state
  const [addInfoOpen, setAddInfoOpen] = useState(false);
  const [addInfoEditing, setAddInfoEditing] = useState<FinBolaoGeralAddInfo | null>(null);
  const [addInfoEntry, setAddInfoEntry] = useState<AddInfoEntry>(emptyAddInfo());
  const [addInfoBranch, setAddInfoBranch] = useState('');
  const [addInfoBusy, setAddInfoBusy] = useState(false);
  const [addInfoError, setAddInfoError] = useState('');

  useEffect(() => {
    void supabase.from('branches').select('*').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]));
    setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
  }, [isAdmin, profile?.branch_id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('fin_bolao_geral').select('*, branch:branches(*)').order('bolao_date', { ascending: false });
    if (!isAdmin) {
      if (!profile?.branch_id) { setRows([]); setAddInfoRows([]); setLoading(false); return; }
      query = query.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) query = query.eq('branch_id', selectedBranch);
    const { data, error: err } = await query;
    if (err) setError(err.message);
    setRows((data ?? []) as FinBolaoGeral[]);

    let aq = supabase.from('fin_bolao_geral_addinfo').select('*, branch:branches(*)').order('ref_date', { ascending: false });
    if (!isAdmin) {
      if (!profile?.branch_id) { setLoading(false); return; }
      aq = aq.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) aq = aq.eq('branch_id', selectedBranch);
    const { data: aData } = await aq;
    setAddInfoRows((aData ?? []) as FinBolaoGeralAddInfo[]);
    setLoading(false);
  }, [isAdmin, profile?.branch_id, selectedBranch]);
  useEffect(() => { void refresh(); }, [refresh]);

  const modalities = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of rows) {
      const key = r.modality.trim();
      if (key) set.set(key, (set.get(key) ?? 0) + 1);
    }
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, count]) => ({ value: label, label: `${label} (${count})` }));
  }, [rows]);

  const inPeriod = useCallback((dateStr: string) => {
    return viewMode === 'day' ? dateStr === filterDate : dateStr.startsWith(month);
  }, [viewMode, filterDate, month]);

  const filtered = useMemo(() => {
    const base = rows.filter(r => inPeriod(r.bolao_date));
    return modFilter ? base.filter(r => r.modality.trim() === modFilter) : base;
  }, [rows, inPeriod, modFilter]);

  const filteredAddInfo = useMemo(() => {
    return addInfoRows.filter(a => inPeriod(a.ref_date));
  }, [addInfoRows, inPeriod]);

  const totals = useMemo(() => {
    const bolaoTotals = filtered.reduce((acc, r) => {
      acc.bolaoValue += Number(r.bolao_value ?? 0);
      acc.feeValue += Number(r.fee_value ?? 0);
      acc.prejuizo += Number(r.prejuizo ?? 0);
      acc.comissao += Number(r.comissao ?? 0);
      acc.premiacao += Number(r.premiacao ?? 0);
      acc.vendaMarketing += Number(r.venda_marketing ?? 0);
      acc.vendaDinheiro += Number(r.venda_dinheiro ?? 0);
      acc.fiado += Number(r.fiado ?? 0);
      acc.valorPix += Number(r.valor_pix ?? 0);
      return acc;
    }, { bolaoValue: 0, feeValue: 0, prejuizo: 0, comissao: 0, premiacao: 0, vendaMarketing: 0, vendaDinheiro: 0, fiado: 0, valorPix: 0 });

    for (const a of filteredAddInfo) {
      bolaoTotals.prejuizo += Number(a.prejuizo ?? 0);
      bolaoTotals.comissao += Number(a.comissao ?? 0);
      bolaoTotals.premiacao += Number(a.premiacao ?? 0);
      bolaoTotals.vendaMarketing += Number(a.venda_marketing ?? 0);
      bolaoTotals.vendaDinheiro += Number(a.venda_dinheiro ?? 0);
      bolaoTotals.fiado += Number(a.fiado ?? 0);
      bolaoTotals.valorPix += Number(a.valor_pix ?? 0);
    }
    return bolaoTotals;
  }, [filtered, filteredAddInfo]);

  const qtd = filtered.length;

  type DayGroup = {
    date: string;
    rows: FinBolaoGeral[];
    bolaoValue: number; feeValue: number; prejuizo: number; comissao: number;
    premiacao: number; vendaMarketing: number; vendaDinheiro: number;
    fiado: number; valorPix: number;
  };
  type BranchGroup = {
    branchId: string; branch: Branch | null; days: DayGroup[];
    bolaoValue: number; feeValue: number; prejuizo: number; comissao: number;
    premiacao: number; vendaMarketing: number; vendaDinheiro: number;
    fiado: number; valorPix: number; count: number;
  };

  const byBranch = useMemo<BranchGroup[]>(() => {
    const map = new Map<string, BranchGroup>();
    for (const r of filtered) {
      let bg = map.get(r.branch_id);
      if (!bg) {
        bg = {
          branchId: r.branch_id, branch: (r.branch as Branch | null) ?? null, days: [],
          bolaoValue: 0, feeValue: 0, prejuizo: 0, comissao: 0, premiacao: 0,
          vendaMarketing: 0, vendaDinheiro: 0, fiado: 0, valorPix: 0, count: 0,
        };
        map.set(r.branch_id, bg);
      }
      bg.bolaoValue += Number(r.bolao_value ?? 0);
      bg.feeValue += Number(r.fee_value ?? 0);
      bg.prejuizo += Number(r.prejuizo ?? 0);
      bg.comissao += Number(r.comissao ?? 0);
      bg.premiacao += Number(r.premiacao ?? 0);
      bg.vendaMarketing += Number(r.venda_marketing ?? 0);
      bg.vendaDinheiro += Number(r.venda_dinheiro ?? 0);
      bg.fiado += Number(r.fiado ?? 0);
      bg.valorPix += Number(r.valor_pix ?? 0);
      bg.count += 1;
      let dg = bg.days.find(d => d.date === r.bolao_date);
      if (!dg) {
        dg = {
          date: r.bolao_date, rows: [],
          bolaoValue: 0, feeValue: 0, prejuizo: 0, comissao: 0, premiacao: 0,
          vendaMarketing: 0, vendaDinheiro: 0, fiado: 0, valorPix: 0,
        };
        bg.days.push(dg);
      }
      dg.rows.push(r);
      dg.bolaoValue += Number(r.bolao_value ?? 0);
      dg.feeValue += Number(r.fee_value ?? 0);
      dg.prejuizo += Number(r.prejuizo ?? 0);
      dg.comissao += Number(r.comissao ?? 0);
      dg.premiacao += Number(r.premiacao ?? 0);
      dg.vendaMarketing += Number(r.venda_marketing ?? 0);
      dg.vendaDinheiro += Number(r.venda_dinheiro ?? 0);
      dg.fiado += Number(r.fiado ?? 0);
      dg.valorPix += Number(r.valor_pix ?? 0);
    }
    for (const bg of map.values()) bg.days.sort((a, b) => b.date.localeCompare(a.date));
    return Array.from(map.values()).sort((a, b) => (a.branch?.name ?? '').localeCompare(b.branch?.name ?? ''));
  }, [filtered]);

  const multiBranch = isAdmin && !selectedBranch;

  const openNew = () => {
    setEditing(null);
    setEntries([emptyEntry()]);
    setModalBranch(selectedBranch || profile?.branch_id || '');
    setError('');
    setModalOpen(true);
  };
  const openEdit = (r: FinBolaoGeral) => {
    setEditing(r);
    setEntries([{
      id: r.id,
      bolao_date: r.bolao_date,
      modality: r.modality,
      contest: r.contest,
      bolao_value: r.bolao_value ? maskBRL(String(money(Number(r.bolao_value)))) : '',
      fee_percentage: String(r.fee_percentage ?? 0),
      fee_value: r.fee_value ? maskBRL(String(money(Number(r.fee_value)))) : '',
      notes: r.notes ?? '',
    }]);
    setModalBranch(r.branch_id);
    setError('');
    setModalOpen(true);
  };

  const addEntry = () => setEntries(es => [...es, emptyEntry()]);
  const removeEntry = (id: string) => setEntries(es => es.length > 1 ? es.filter(e => e.id !== id) : es);
  const updateEntry = (id: string, field: keyof Entry, v: string) => setEntries(es => es.map(e => e.id === id ? { ...e, [field]: v } : e));

  const recalcFee = (e: Entry): string => {
    const val = parseBRL(e.bolao_value);
    const pct = Number(e.fee_percentage) || 0;
    if (!val || !pct) return '';
    return maskBRL(String(money(val * pct / 100)));
  };

  const validEntries = useMemo(() => entries.filter(e => {
    const val = parseBRL(e.bolao_value);
    return e.modality.trim() && e.contest.trim() && val > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.bolao_date);
  }), [entries]);

  const save = async () => {
    if (busy) return;
    if (!validEntries.length) { setError('Adicione ao menos um bolão com modalidade, concurso e valor.'); return; }
    if (!modalBranch) { setError('Selecione a filial.'); return; }
    if (!isAdmin && modalBranch !== profile?.branch_id) { setError('Você só pode lançar na sua filial.'); return; }
    setBusy(true); setError('');
    try {
      if (editing) {
        const e = validEntries[0];
        const payload = {
          branch_id: modalBranch, bolao_date: e.bolao_date, modality: e.modality.trim(), contest: e.contest.trim(),
          bolao_value: parseBRL(e.bolao_value), fee_percentage: Number(e.fee_percentage) || 0,
          fee_value: parseBRL(e.fee_value || recalcFee(e)),
          notes: e.notes.trim() || null, updated_at: new Date().toISOString(),
        };
        const { error: err } = await supabase.from('fin_bolao_geral').update(payload).eq('id', editing.id);
        if (err) throw new Error(err.message);
      } else {
        const payload = validEntries.map(e => ({
          branch_id: modalBranch, bolao_date: e.bolao_date, modality: e.modality.trim(), contest: e.contest.trim(),
          bolao_value: parseBRL(e.bolao_value), fee_percentage: Number(e.fee_percentage) || 0,
          fee_value: parseBRL(e.fee_value || recalcFee(e)),
          notes: e.notes.trim() || null, created_by: profile?.id ?? null,
        }));
        const { error: err } = await supabase.from('fin_bolao_geral').insert(payload);
        if (err) throw new Error(err.message);
      }
      setModalOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: FinBolaoGeral) => {
    if (!window.confirm(`Excluir bolão ${r.modality} ${r.contest} de ${formatDateBR(r.bolao_date)}?`)) return;
    const { error: err } = await supabase.from('fin_bolao_geral').delete().eq('id', r.id);
    if (err) setError(err.message); else await refresh();
  };

  // === Informações adicionais handlers ===
  const openAddInfoNew = () => {
    setAddInfoEditing(null);
    setAddInfoEntry(emptyAddInfo());
    setAddInfoBranch(selectedBranch || profile?.branch_id || '');
    setAddInfoError('');
    setAddInfoOpen(true);
  };
  const openAddInfoEdit = (a: FinBolaoGeralAddInfo) => {
    setAddInfoEditing(a);
    setAddInfoEntry({
      id: a.id,
      period: a.period,
      ref_date: a.ref_date,
      ref_month: a.ref_date.slice(0, 7),
      prejuizo: Number(a.prejuizo) ? maskBRL(String(money(Number(a.prejuizo)))) : '',
      comissao: Number(a.comissao) ? maskBRL(String(money(Number(a.comissao)))) : '',
      premiacao: Number(a.premiacao) ? maskBRL(String(money(Number(a.premiacao)))) : '',
      venda_marketing: Number(a.venda_marketing) ? maskBRL(String(money(Number(a.venda_marketing)))) : '',
      venda_dinheiro: Number(a.venda_dinheiro) ? maskBRL(String(money(Number(a.venda_dinheiro)))) : '',
      fiado: Number(a.fiado) ? maskBRL(String(money(Number(a.fiado)))) : '',
      fiado_obs: a.fiado_obs ?? '',
      valor_pix: Number(a.valor_pix) ? maskBRL(String(money(Number(a.valor_pix)))) : '',
      notes: a.notes ?? '',
    });
    setAddInfoBranch(a.branch_id);
    setAddInfoError('');
    setAddInfoOpen(true);
  };
  const updateAddInfo = (field: keyof AddInfoEntry, v: string) => setAddInfoEntry(e => ({ ...e, [field]: v }));

  const addInfoRefDate = (e: AddInfoEntry): string => e.period === 'monthly' ? `${e.ref_month}-01` : e.ref_date;
  const addInfoValid = useMemo(() => {
    return addInfoEntry.period === 'monthly'
      ? /^\d{4}-\d{2}$/.test(addInfoEntry.ref_month)
      : /^\d{4}-\d{2}-\d{2}$/.test(addInfoEntry.ref_date);
  }, [addInfoEntry]);

  const saveAddInfo = async () => {
    if (addInfoBusy) return;
    if (!addInfoValid) { setAddInfoError('Informe uma data ou mês válido.'); return; }
    if (!addInfoBranch) { setAddInfoError('Selecione a filial.'); return; }
    if (!isAdmin && addInfoBranch !== profile?.branch_id) { setAddInfoError('Você só pode lançar na sua filial.'); return; }
    setAddInfoBusy(true); setAddInfoError('');
    try {
      const payload = {
        branch_id: addInfoBranch,
        period: addInfoEntry.period,
        ref_date: addInfoRefDate(addInfoEntry),
        prejuizo: parseBRL(addInfoEntry.prejuizo),
        comissao: parseBRL(addInfoEntry.comissao),
        premiacao: parseBRL(addInfoEntry.premiacao),
        venda_marketing: parseBRL(addInfoEntry.venda_marketing),
        venda_dinheiro: parseBRL(addInfoEntry.venda_dinheiro),
        fiado: parseBRL(addInfoEntry.fiado),
        fiado_obs: addInfoEntry.fiado_obs.trim() || null,
        valor_pix: parseBRL(addInfoEntry.valor_pix),
        notes: addInfoEntry.notes.trim() || null,
      };
      if (addInfoEditing) {
        const { error: err } = await supabase.from('fin_bolao_geral_addinfo').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', addInfoEditing.id);
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase.from('fin_bolao_geral_addinfo').insert({ ...payload, created_by: profile?.id ?? null });
        if (err) throw new Error(err.message);
      }
      setAddInfoOpen(false);
      await refresh();
    } catch (e) {
      setAddInfoError(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setAddInfoBusy(false);
    }
  };

  const removeAddInfo = async (a: FinBolaoGeralAddInfo) => {
    if (!window.confirm(`Excluir informações adicionais de ${formatDateBR(a.ref_date)}?`)) return;
    const { error: err } = await supabase.from('fin_bolao_geral_addinfo').delete().eq('id', a.id);
    if (err) setAddInfoError(err.message); else await refresh();
  };

  const totalBruto = totals.bolaoValue + totals.feeValue;
  const totalVendas = totals.vendaDinheiro + totals.vendaMarketing + totals.valorPix;
  const totalReceitas = totals.comissao + totals.premiacao + totals.vendaMarketing;
  const resultado = totalReceitas - totals.prejuizo - totals.fiado;

  if (loading && !rows.length && !addInfoRows.length) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Bolão Geral" subtitle="Cadastro de bolões por filial com total geral, comissão e resultado do mês"
        action={<div className="flex flex-wrap gap-2 items-center">
          {isAdmin && <Select value={selectedBranch} onChange={setSelectedBranch} options={[{ value: '', label: 'Todas as filiais' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />}
          <Select value={viewMode} onChange={v => setViewMode(v as 'day' | 'month')} options={[{ value: 'month', label: 'Mês' }, { value: 'day', label: 'Dia' }]} />
          {viewMode === 'day'
            ? <Input type="date" value={filterDate} onChange={setFilterDate} />
            : <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />}
          {modalities.length > 0 && <Select value={modFilter} onChange={setModFilter} options={[{ value: '', label: 'Todas modalidades' }, ...modalities]} />}
          <Button variant="secondary" onClick={openAddInfoNew}><Info size={17} /> Informações adicionais</Button>
          <Button onClick={openNew}><Plus size={17} /> Novo bolão</Button>
        </div>} />

      {error && !modalOpen && !addInfoOpen && <p className="p-3 bg-red-50 text-red-700 rounded-lg mb-4">{error}</p>}

      {/* Summary cards — redesigned */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        <SummaryCard icon={<FileSpreadsheet size={20} />} label="Bolões" value={qtd} isCurrency={false} gradient="bg-gradient-to-r from-slate-300 to-slate-400" iconBg="bg-slate-100 text-slate-600" accentText="text-slate-900" />
        <SummaryCard icon={<DollarSign size={20} />} label="Total Geral" value={totals.bolaoValue} isCurrency gradient="bg-gradient-to-r from-brand-400 to-brand-600" iconBg="bg-brand-50 text-brand-600" accentText="text-brand-700" />
        <SummaryCard icon={<DollarSign size={20} />} label="Comissão" value={totals.comissao || totals.feeValue} isCurrency gradient="bg-gradient-to-r from-accent-400 to-accent-600" iconBg="bg-accent-50 text-accent-600" accentText="text-accent-700" />
        <SummaryCard icon={<DollarSign size={20} />} label="Total Bruto" value={totalBruto} isCurrency gradient="bg-gradient-to-r from-slate-400 to-slate-600" iconBg="bg-slate-100 text-slate-700" accentText="text-slate-800" />
        <SummaryCard icon={<TrendingDown size={20} />} label="Prejuízo" value={totals.prejuizo} isCurrency gradient="bg-gradient-to-r from-red-400 to-red-600" iconBg="bg-red-50 text-red-600" accentText="text-red-700" />
        <SummaryCard icon={<Trophy size={20} />} label="Premiação" value={totals.premiacao} isCurrency gradient="bg-gradient-to-r from-emerald-400 to-emerald-600" iconBg="bg-emerald-50 text-emerald-600" accentText="text-emerald-700" />
        <SummaryCard icon={<Megaphone size={20} />} label="Venda Marketing" value={totals.vendaMarketing} isCurrency gradient="bg-gradient-to-r from-brand-400 to-brand-500" iconBg="bg-brand-50 text-brand-600" accentText="text-brand-700" />
        <SummaryCard icon={<Banknote size={20} />} label="Venda Dinheiro" value={totals.vendaDinheiro} isCurrency gradient="bg-gradient-to-r from-emerald-400 to-emerald-500" iconBg="bg-emerald-50 text-emerald-600" accentText="text-emerald-700" />
        <SummaryCard icon={<HandCoins size={20} />} label="Fiado" value={totals.fiado} isCurrency gradient="bg-gradient-to-r from-amber-400 to-amber-600" iconBg="bg-amber-50 text-amber-600" accentText="text-amber-700" />
        <SummaryCard icon={<Smartphone size={20} />} label="Valor Pix" value={totals.valorPix} isCurrency gradient="bg-gradient-to-r from-brand-500 to-brand-700" iconBg="bg-brand-50 text-brand-600" accentText="text-brand-700" />
        <SummaryCard icon={<TrendingUp size={20} />} label="Total Vendas" value={totalVendas} isCurrency gradient="bg-gradient-to-r from-emerald-400 to-teal-500" iconBg="bg-emerald-50 text-emerald-600" accentText="text-emerald-700" />
        <SummaryCard icon={resultado >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />} label="Resultado" value={resultado} isCurrency gradient={resultado >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'} iconBg={resultado >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} accentText={resultado >= 0 ? 'text-emerald-700' : 'text-red-700'} />
      </div>

      {!byBranch.length && !filteredAddInfo.length ? <Card><EmptyState icon={<FileSpreadsheet size={42} />} title="Nenhum bolão" description="Cadastre um bolão para visualizar os totais por filial e período." /> </Card> :
        <div className="space-y-4">
          {byBranch.map(bg => {
          const branchKey = bg.branchId;
          const branchOpen = expandedBranch === branchKey;
          const renderDays = () => bg.days.map(dg => {
            const dayKey = `${branchKey}__${dg.date}`;
            const dayOpen = expandedDay === dayKey;
            return <div key={dayKey} className="rounded-lg border border-slate-200 bg-slate-50/50">
              <button className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100 transition-colors rounded-lg" onClick={() => setExpandedDay(dayOpen ? null : dayKey)}>
                <span className="flex items-center gap-3">
                  <Calendar size={16} className="text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{formatDateBR(dg.date, { weekday: 'short' })}</span>
                  <Badge color="slate">{dg.rows.length} bolão(ões)</Badge>
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">R$ {formatBRL(dg.bolaoValue)}</span>
                  <span className="text-sm text-accent-600">Comissão: R$ {formatBRL(dg.comissao || dg.feeValue)}</span>
                  {dayOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                </span>
              </button>
              {dayOpen && <div className="px-3 pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-100">
                        <th className="px-2 py-2 font-medium">Data</th>
                        <th className="px-2 py-2 font-medium">MOD</th>
                        <th className="px-2 py-2 font-medium">Concurso</th>
                        <th className="px-2 py-2 font-medium text-right">Valor Bolão</th>
                        <th className="px-2 py-2 font-medium text-right">% Comissão</th>
                        <th className="px-2 py-2 font-medium text-right">Valor Comissão</th>
                        <th className="px-2 py-2 font-medium text-right">Prejuízo</th>
                        <th className="px-2 py-2 font-medium text-right">Premiação</th>
                        <th className="px-2 py-2 font-medium text-right">Mkt</th>
                        <th className="px-2 py-2 font-medium text-right">Dinheiro</th>
                        <th className="px-2 py-2 font-medium text-right">Fiado</th>
                        <th className="px-2 py-2 font-medium text-right">Pix</th>
                        <th className="px-2 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dg.rows.map(r => (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-white">
                          <td className="px-2 py-2 text-slate-600">{formatDateBR(r.bolao_date)}</td>
                          <td className="px-2 py-2 font-medium text-slate-900">{r.modality}</td>
                          <td className="px-2 py-2 text-slate-600">{r.contest}</td>
                          <td className="px-2 py-2 text-right">R$ {formatBRL(Number(r.bolao_value))}</td>
                          <td className="px-2 py-2 text-right">{Number(r.fee_percentage).toFixed(2)}%</td>
                          <td className="px-2 py-2 text-right text-accent-700">R$ {formatBRL(Number(r.comissao || r.fee_value))}</td>
                          <td className="px-2 py-2 text-right text-red-600">R$ {formatBRL(Number(r.prejuizo))}</td>
                          <td className="px-2 py-2 text-right text-emerald-600">R$ {formatBRL(Number(r.premiacao))}</td>
                          <td className="px-2 py-2 text-right">R$ {formatBRL(Number(r.venda_marketing))}</td>
                          <td className="px-2 py-2 text-right">R$ {formatBRL(Number(r.venda_dinheiro))}</td>
                          <td className="px-2 py-2 text-right text-amber-600">R$ {formatBRL(Number(r.fiado))}</td>
                          <td className="px-2 py-2 text-right">R$ {formatBRL(Number(r.valor_pix))}</td>
                          <td className="px-2 py-2 text-right">
                            <div className="flex gap-1 justify-end">
                              <button onClick={() => openEdit(r)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded" title="Editar"><Pencil size={15} /></button>
                              <button onClick={() => void remove(r)} className="p-1.5 text-slate-400 hover:text-red-600 rounded" title="Excluir"><Trash2 size={15} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100/60 font-semibold">
                        <td className="px-2 py-2" colSpan={3}>Total do dia</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.bolaoValue)}</td>
                        <td className="px-2 py-2 text-right"></td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.comissao || dg.feeValue)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.prejuizo)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.premiacao)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.vendaMarketing)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.vendaDinheiro)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.fiado)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.valorPix)}</td>
                        <td className="px-2 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>}
            </div>;
          });

          const renderBranchSummary = (bg: BranchGroup) => (
            <span className="text-xs text-slate-400 flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-slate-700 font-semibold">Total: R$ {formatBRL(bg.bolaoValue)}</span>
              <span className="text-accent-600">Comissão: R$ {formatBRL(bg.comissao || bg.feeValue)}</span>
              <span className="text-red-600">Prejuízo: R$ {formatBRL(bg.prejuizo)}</span>
              <span className="text-emerald-600">Premiação: R$ {formatBRL(bg.premiacao)}</span>
              <span className="text-amber-600">Fiado: R$ {formatBRL(bg.fiado)}</span>
              <span>Pix: R$ {formatBRL(bg.valorPix)}</span>
            </span>
          );

          if (multiBranch) {
            return <Card key={branchKey} className="overflow-hidden">
              <button className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedBranch(branchOpen ? null : branchKey)}>
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Building2 size={20} /></span>
                  <span>
                    <strong>{bg.branch?.name ?? 'Sem filial'}</strong>
                    {renderBranchSummary(bg)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge color="slate">{bg.count} bolão(ões)</Badge>
                  {branchOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                </span>
              </button>
              {branchOpen && <div className="border-t border-slate-100 p-4 space-y-2">{renderDays()}</div>}
            </Card>;
          }
          return <Card key={branchKey} className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><Building2 size={20} /></span>
                <span>
                  <strong>{bg.branch?.name ?? 'Minha filial'}</strong>
                  {renderBranchSummary(bg)}
                </span>
              </span>
              <Badge color="slate">{bg.count} bolão(ões)</Badge>
            </div>
            <div className="p-4 space-y-2">{renderDays()}</div>
          </Card>;
        })}

        {/* Informações adicionais section */}
        {filteredAddInfo.length > 0 && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center"><ClipboardList size={20} /></span>
                <span>
                  <strong>Informações adicionais</strong>
                  <p className="text-xs text-slate-400 mt-0.5">Valores financeiros lançados separadamente</p>
                </span>
              </span>
              <Badge color="accent">{filteredAddInfo.length} registro(s)</Badge>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="px-2 py-2 font-medium">Período</th>
                      <th className="px-2 py-2 font-medium">Data</th>
                      <th className="px-2 py-2 font-medium">Filial</th>
                      <th className="px-2 py-2 font-medium text-right">Prejuízo</th>
                      <th className="px-2 py-2 font-medium text-right">Comissão</th>
                      <th className="px-2 py-2 font-medium text-right">Premiação</th>
                      <th className="px-2 py-2 font-medium text-right">Venda Mkt</th>
                      <th className="px-2 py-2 font-medium text-right">Venda Dinheiro</th>
                      <th className="px-2 py-2 font-medium text-right">Fiado</th>
                      <th className="px-2 py-2 font-medium text-right">Valor Pix</th>
                      <th className="px-2 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAddInfo.map(a => (
                      <tr key={a.id} className="border-b border-slate-50 hover:bg-white">
                        <td className="px-2 py-2"><Badge color={a.period === 'monthly' ? 'brand' : 'slate'}>{a.period === 'monthly' ? 'Mensal' : 'Diário'}</Badge></td>
                        <td className="px-2 py-2 text-slate-600">{a.period === 'monthly' ? a.ref_date.slice(0, 7) : formatDateBR(a.ref_date)}</td>
                        <td className="px-2 py-2 text-slate-600">{a.branch?.name ?? '—'}</td>
                        <td className="px-2 py-2 text-right text-red-600">R$ {formatBRL(Number(a.prejuizo))}</td>
                        <td className="px-2 py-2 text-right text-accent-700">R$ {formatBRL(Number(a.comissao))}</td>
                        <td className="px-2 py-2 text-right text-emerald-600">R$ {formatBRL(Number(a.premiacao))}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(Number(a.venda_marketing))}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(Number(a.venda_dinheiro))}</td>
                        <td className="px-2 py-2 text-right text-amber-600">R$ {formatBRL(Number(a.fiado))}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(Number(a.valor_pix))}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => openAddInfoEdit(a)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded" title="Editar"><Pencil size={15} /></button>
                            <button onClick={() => void removeAddInfo(a)} className="p-1.5 text-slate-400 hover:text-red-600 rounded" title="Excluir"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
        </div>}

      {/* Modal: Novo/Editar bolão — sem campos financeiros adicionais */}
      <Modal open={modalOpen} onClose={() => !busy && setModalOpen(false)} title={editing ? 'Editar bolão' : 'Novo bolão'} maxWidth="max-w-4xl">
        <div className="space-y-4">
          {isAdmin && (
            <Select label="Filial" value={modalBranch} onChange={setModalBranch} options={branches.map(b => ({ value: b.id, label: b.name }))} placeholder="Selecione a filial" />
          )}

          <div className="space-y-3">
            {entries.map((e, idx) => (
              <div key={e.id} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><Ticket size={13} /> Bolão {idx + 1}</span>
                  {!editing && entries.length > 1 && <button onClick={() => removeEntry(e.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Data" type="date" value={e.bolao_date} onChange={v => updateEntry(e.id, 'bolao_date', v)} />
                  <Input label="MOD / Modalidade" value={e.modality} onChange={v => updateEntry(e.id, 'modality', v)} placeholder="Ex: Mega-Sena" />
                  <Input label="Concurso" value={e.contest} onChange={v => updateEntry(e.id, 'contest', v)} placeholder="Ex: 2800" />
                  {moneyField('Valor Bolão', e.bolao_value, v => updateEntry(e.id, 'bolao_value', v))}
                  <Input label="% Comissão" type="number" step="0.01" value={e.fee_percentage} onChange={v => {
                    updateEntry(e.id, 'fee_percentage', v);
                    const val = parseBRL(e.bolao_value);
                    const pct = Number(v) || 0;
                    if (val && pct) updateEntry(e.id, 'fee_value', maskBRL(String(money(val * pct / 100))));
                  }} placeholder="Ex: 5" min={0} max={100} />
                  {moneyField('Valor Comissão', e.fee_value, v => updateEntry(e.id, 'fee_value', v))}
                </div>

                <Input label="Observações" value={e.notes} onChange={v => updateEntry(e.id, 'notes', v)} placeholder="Opcional" />
              </div>
            ))}
          </div>

          {!editing && <Button variant="secondary" onClick={addEntry}><Plus size={16} /> Adicionar bolão</Button>}

          {validEntries.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-4 space-y-1 bg-slate-50 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Total geral ({validEntries.length} bolão(ões))</span><strong>R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.bolao_value), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total comissão</span><strong className="text-accent-700">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.comissao || e.fee_value || recalcFee(e)), 0))}</strong></div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Informações adicionais — totalmente separado, sem dados de jogo */}
      <Modal open={addInfoOpen} onClose={() => !addInfoBusy && setAddInfoOpen(false)} title={addInfoEditing ? 'Editar Informações Adicionais' : 'Informações Adicionais'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          {isAdmin && (
            <Select label="Filial" value={addInfoBranch} onChange={setAddInfoBranch} options={branches.map(b => ({ value: b.id, label: b.name }))} placeholder="Selecione a filial" />
          )}

          {/* Period toggle: Diário / Mensal */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateAddInfo('period', 'daily')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${addInfoEntry.period === 'daily' ? 'bg-brand-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <Calendar size={15} /> Diário
            </button>
            <button
              type="button"
              onClick={() => updateAddInfo('period', 'monthly')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${addInfoEntry.period === 'monthly' ? 'bg-brand-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <CalendarDays size={15} /> Mensal
            </button>
          </div>

          {addInfoEntry.period === 'monthly' ? (
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Mês de referência</span>
              <input type="month" value={addInfoEntry.ref_month} onChange={ev => updateAddInfo('ref_month', ev.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all" />
            </div>
          ) : (
            <Input label="Data" type="date" value={addInfoEntry.ref_date} onChange={v => updateAddInfo('ref_date', v)} />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {moneyField('Prejuízo', addInfoEntry.prejuizo, v => updateAddInfo('prejuizo', v))}
            {moneyField('Comissão', addInfoEntry.comissao, v => updateAddInfo('comissao', v))}
            {moneyField('Premiação', addInfoEntry.premiacao, v => updateAddInfo('premiacao', v))}
            {moneyField('Venda Marketing', addInfoEntry.venda_marketing, v => updateAddInfo('venda_marketing', v))}
            {moneyField('Venda em Dinheiro', addInfoEntry.venda_dinheiro, v => updateAddInfo('venda_dinheiro', v))}
            {moneyField('Valor Pix', addInfoEntry.valor_pix, v => updateAddInfo('valor_pix', v))}
            {moneyField('Fiado', addInfoEntry.fiado, v => updateAddInfo('fiado', v))}
            <div className="sm:col-span-2">
              <Input label="Fiado (observação)" value={addInfoEntry.fiado_obs} onChange={v => updateAddInfo('fiado_obs', v)} placeholder="Observação sobre o fiado" />
            </div>
          </div>

          <Input label="Observações" value={addInfoEntry.notes} onChange={v => updateAddInfo('notes', v)} placeholder="Opcional" />

          {addInfoError && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{addInfoError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddInfoOpen(false)} disabled={addInfoBusy}>Cancelar</Button>
            <Button onClick={() => void saveAddInfo()} disabled={addInfoBusy}>{addInfoBusy ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
