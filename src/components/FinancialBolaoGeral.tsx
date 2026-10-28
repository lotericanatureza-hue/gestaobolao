import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, CalendarDays, ChevronDown, ChevronRight, ClipboardList, DollarSign, FileSpreadsheet, Info, Pencil, Percent, Plus, Ticket, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
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
  taxa: string;
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
  taxa: '',
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

/* ------------------------------------------------------------------ */
/* Acumulador de valores                                               */
/* ------------------------------------------------------------------ */
type Acc = {
  bolao: number;     // valor total dos bolões
  fee: number;       // comissão dos bolões
  prejuizo: number;
  premiacao: number;
  taxa: number;
  marketing: number;
  dinheiro: number;
  fiado: number;
  pix: number;
};
const emptyAcc = (): Acc => ({ bolao: 0, fee: 0, prejuizo: 0, premiacao: 0, taxa: 0, marketing: 0, dinheiro: 0, fiado: 0, pix: 0 });
const n = (v: unknown) => Number(v ?? 0) || 0;

function addRow(acc: Acc, r: FinBolaoGeral) {
  acc.bolao += n(r.bolao_value);
  acc.fee += n(r.fee_value);
  acc.prejuizo += n(r.prejuizo);
  acc.premiacao += n(r.premiacao);
  acc.marketing += n(r.venda_marketing);
  acc.dinheiro += n(r.venda_dinheiro);
  acc.fiado += n(r.fiado);
  acc.pix += n(r.valor_pix);
}
function addInfo(acc: Acc, a: FinBolaoGeralAddInfo) {
  acc.prejuizo += n(a.prejuizo);
  acc.premiacao += n(a.premiacao);
  acc.taxa += n(a.taxa);
  acc.marketing += n(a.venda_marketing);
  acc.dinheiro += n(a.venda_dinheiro);
  acc.fiado += n(a.fiado);
  acc.pix += n(a.valor_pix);
}

/** Total arrecadado = Pix + Dinheiro + Fiado + Marketing */
const totalArrecadado = (a: Acc) => a.pix + a.dinheiro + a.fiado + a.marketing;
/** Resultado = Total comissão − Total prejuízo − Total taxa  (ajuste aqui se a regra mudar) */
const resultadoOf = (a: Acc) => a.fee - a.prejuizo - a.taxa;

/* ------------------------------------------------------------------ */
/* Componentes visuais                                                 */
/* ------------------------------------------------------------------ */
interface KpiProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number;
  bar: string;
  iconBg: string;
  text: string;
}
function Kpi({ icon, label, hint, value, bar, iconBg, text }: KpiProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 hover:-translate-y-0.5">
      <div className={`absolute inset-x-0 top-0 h-1 ${bar}`} />
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">{label}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
      </div>
      <p className={`text-2xl font-bold ${text}`}>R$ {formatBRL(value)}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

function LegendRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-slate-600">
          <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
          {label}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-xs text-slate-400 w-12 text-right">{pct.toFixed(1)}%</span>
          <span className="font-semibold text-slate-800 w-28 text-right">R$ {formatBRL(value)}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 mt-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

/** Detalhamento (legenda) — informações adicionais */
function Breakdown({ acc }: { acc: Acc }) {
  const arrecadado = totalArrecadado(acc);
  return (
    <Card className="overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center"><Wallet size={20} /></span>
        <span>
          <strong>Detalhamento</strong>
          <p className="text-xs text-slate-400 mt-0.5">Composição do total arrecadado e demais lançamentos</p>
        </span>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5 flex flex-col justify-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Total arrecadado</p>
          <p className="text-3xl font-bold text-emerald-800 mt-1">R$ {formatBRL(arrecadado)}</p>
          <p className="text-xs text-emerald-700/70 mt-2">Pix + Dinheiro + Fiado + Marketing</p>
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          <LegendRow color="bg-brand-500" label="Valor Pix" value={acc.pix} total={arrecadado} />
          <LegendRow color="bg-emerald-500" label="Venda em dinheiro" value={acc.dinheiro} total={arrecadado} />
          <LegendRow color="bg-amber-500" label="Fiado" value={acc.fiado} total={arrecadado} />
          <LegendRow color="bg-violet-500" label="Venda marketing" value={acc.marketing} total={arrecadado} />
        </div>
      </div>
      <div className="px-5 pb-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span className="text-slate-500">Premiação: <strong className="text-emerald-700">R$ {formatBRL(acc.premiacao)}</strong></span>
          <span className="text-slate-500">Taxa: <strong className="text-red-700">R$ {formatBRL(acc.taxa)}</strong></span>
          <span className="text-slate-500">Fiado em aberto: <strong className="text-amber-700">R$ {formatBRL(acc.fiado)}</strong></span>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
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
  const [showAddInfoList, setShowAddInfoList] = useState(false);

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

  const filteredAddInfo = useMemo(() => addInfoRows.filter(a => inPeriod(a.ref_date)), [addInfoRows, inPeriod]);

  const totals = useMemo<Acc>(() => {
    const acc = emptyAcc();
    for (const r of filtered) addRow(acc, r);
    for (const a of filteredAddInfo) addInfo(acc, a);
    return acc;
  }, [filtered, filteredAddInfo]);

  const resultado = resultadoOf(totals);

  type DayGroup = { date: string; rows: FinBolaoGeral[]; acc: Acc };
  type BranchGroup = { branchId: string; branch: Branch | null; days: DayGroup[]; acc: Acc; count: number };

  const byBranch = useMemo<BranchGroup[]>(() => {
    const map = new Map<string, BranchGroup>();
    const getBg = (id: string, branch: Branch | null) => {
      let bg = map.get(id);
      if (!bg) { bg = { branchId: id, branch, days: [], acc: emptyAcc(), count: 0 }; map.set(id, bg); }
      return bg;
    };
    for (const r of filtered) {
      const bg = getBg(r.branch_id, (r.branch as Branch | null) ?? null);
      addRow(bg.acc, r);
      bg.count += 1;
      let dg = bg.days.find(d => d.date === r.bolao_date);
      if (!dg) { dg = { date: r.bolao_date, rows: [], acc: emptyAcc() }; bg.days.push(dg); }
      dg.rows.push(r);
      addRow(dg.acc, r);
    }
    for (const a of filteredAddInfo) {
      const bg = getBg(a.branch_id, (a.branch as Branch | null) ?? null);
      addInfo(bg.acc, a);
    }
    for (const bg of map.values()) bg.days.sort((a, b) => b.date.localeCompare(a.date));
    return Array.from(map.values()).sort((a, b) => (a.branch?.name ?? '').localeCompare(b.branch?.name ?? ''));
  }, [filtered, filteredAddInfo]);

  const multiBranch = isAdmin && !selectedBranch;

  /* ---------- Bolão: handlers ---------- */
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

  /* ---------- Informações adicionais: handlers ---------- */
  const openAddInfoNew = () => {
    setAddInfoEditing(null);
    setAddInfoEntry(emptyAddInfo());
    setAddInfoBranch(selectedBranch || profile?.branch_id || '');
    setAddInfoError('');
    setAddInfoOpen(true);
  };
  const openAddInfoEdit = (a: FinBolaoGeralAddInfo) => {
    setAddInfoEditing(a);
    const m = (v: unknown) => Number(v) ? maskBRL(String(money(Number(v)))) : '';
    setAddInfoEntry({
      id: a.id,
      period: a.period,
      ref_date: a.ref_date,
      ref_month: a.ref_date.slice(0, 7),
      prejuizo: m(a.prejuizo),
      comissao: m(a.comissao),
      premiacao: m(a.premiacao),
      taxa: m(a.taxa),
      venda_marketing: m(a.venda_marketing),
      venda_dinheiro: m(a.venda_dinheiro),
      fiado: m(a.fiado),
      fiado_obs: a.fiado_obs ?? '',
      valor_pix: m(a.valor_pix),
      notes: a.notes ?? '',
    });
    setAddInfoBranch(a.branch_id);
    setAddInfoError('');
    setAddInfoOpen(true);
  };
  const updateAddInfo = (field: keyof AddInfoEntry, v: string) => setAddInfoEntry(e => ({ ...e, [field]: v }));

  const addInfoRefDate = (e: AddInfoEntry): string => e.period === 'monthly' ? `${e.ref_month}-01` : e.ref_date;
  const addInfoValid = useMemo(() => (
    addInfoEntry.period === 'monthly'
      ? /^\d{4}-\d{2}$/.test(addInfoEntry.ref_month)
      : /^\d{4}-\d{2}-\d{2}$/.test(addInfoEntry.ref_date)
  ), [addInfoEntry]);

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
        taxa: parseBRL(addInfoEntry.taxa),
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
    if (err) setError(err.message); else await refresh();
  };

  if (loading && !rows.length && !addInfoRows.length) return <div className="flex justify-center py-20"><Spinner /></div>;

  const resultPositive = resultado >= 0;

  /* ---------- Render helpers ---------- */
  const renderDays = (bg: BranchGroup) => bg.days.map(dg => {
    const dayKey = `${bg.branchId}__${dg.date}`;
    const dayOpen = expandedDay === dayKey;
    return (
      <div key={dayKey} className="rounded-lg border border-slate-200 bg-slate-50/50">
        <button className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100 transition-colors rounded-lg" onClick={() => setExpandedDay(dayOpen ? null : dayKey)}>
          <span className="flex items-center gap-3">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700">{formatDateBR(dg.date, { weekday: 'short' })}</span>
            <Badge color="slate">{dg.rows.length} bolão(ões)</Badge>
          </span>
          <span className="flex items-center gap-4">
            <span className="text-sm text-slate-500">Bruto: R$ {formatBRL(dg.acc.bolao)}</span>
            <span className="text-sm text-accent-600">Comissão: R$ {formatBRL(dg.acc.fee)}</span>
            {dayOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </span>
        </button>
        {dayOpen && (
          <div className="px-3 pb-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="px-2 py-2 font-medium">Data</th>
                  <th className="px-2 py-2 font-medium">MOD</th>
                  <th className="px-2 py-2 font-medium">Concurso</th>
                  <th className="px-2 py-2 font-medium text-right">Valor Bolão</th>
                  <th className="px-2 py-2 font-medium text-right">% Comissão</th>
                  <th className="px-2 py-2 font-medium text-right">Valor Comissão</th>
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
                    <td className="px-2 py-2 text-right text-accent-700">R$ {formatBRL(Number(r.fee_value))}</td>
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
                  <td className="px-2 py-2 text-right">R$ {formatBRL(dg.acc.bolao)}</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right">R$ {formatBRL(dg.acc.fee)}</td>
                  <td className="px-2 py-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  });

  const renderBranchSummary = (bg: BranchGroup) => {
    const res = resultadoOf(bg.acc);
    return (
      <span className="text-xs flex items-center gap-4 mt-0.5 flex-wrap">
        <span className="text-slate-700 font-semibold">Bruto: R$ {formatBRL(bg.acc.bolao)}</span>
        <span className="text-accent-600">Comissão: R$ {formatBRL(bg.acc.fee)}</span>
        <span className="text-red-600">Prejuízo: R$ {formatBRL(bg.acc.prejuizo)}</span>
        <span className={res >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>Resultado: R$ {formatBRL(res)}</span>
        <span className="text-slate-400">Arrecadado: R$ {formatBRL(totalArrecadado(bg.acc))}</span>
      </span>
    );
  };

  return (
    <div>
      <PageHeader title="Bolão Geral" subtitle="Demonstrativo de resultado dos bolões por filial"
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

      {/* 4 cards consolidados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Kpi icon={<DollarSign size={20} />} label="Total Bruto" hint={`${filtered.length} bolão(ões) realizados`} value={totals.bolao}
          bar="bg-gradient-to-r from-brand-400 to-brand-600" iconBg="bg-brand-50 text-brand-600" text="text-brand-700" />
        <Kpi icon={<Percent size={20} />} label="Total Comissão" hint="Soma do valor de comissão dos bolões" value={totals.fee}
          bar="bg-gradient-to-r from-accent-400 to-accent-600" iconBg="bg-accent-50 text-accent-600" text="text-accent-700" />
        <Kpi icon={<TrendingDown size={20} />} label="Total Prejuízo" hint="Prejuízos lançados no período" value={totals.prejuizo}
          bar="bg-gradient-to-r from-red-400 to-red-600" iconBg="bg-red-50 text-red-600" text="text-red-700" />
        <Kpi icon={resultPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />} label="Resultado" hint="Comissão − Prejuízo − Taxa" value={resultado}
          bar={resultPositive ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-red-400 to-red-600'}
          iconBg={resultPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}
          text={resultPositive ? 'text-emerald-700' : 'text-red-700'} />
      </div>

      {/* Detalhamento (legenda) */}
      <Breakdown acc={totals} />

      {!byBranch.length ? (
        <Card><EmptyState icon={<FileSpreadsheet size={42} />} title="Nenhum bolão" description="Cadastre um bolão para visualizar os totais por filial e período." /></Card>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Bolões por filial</h3>
          {byBranch.map(bg => {
            const open = expandedBranch === bg.branchId;
            if (multiBranch) {
              return (
                <Card key={bg.branchId} className="overflow-hidden">
                  <button className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedBranch(open ? null : bg.branchId)}>
                    <span className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Building2 size={20} /></span>
                      <span>
                        <strong>{bg.branch?.name ?? 'Sem filial'}</strong>
                        {renderBranchSummary(bg)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge color="slate">{bg.count} bolão(ões)</Badge>
                      {open ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                    </span>
                  </button>
                  {open && <div className="border-t border-slate-100 p-4 space-y-2">{renderDays(bg)}</div>}
                </Card>
              );
            }
            return (
              <Card key={bg.branchId} className="overflow-hidden">
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
                <div className="p-4 space-y-2">{renderDays(bg)}</div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lançamentos de informações adicionais (recolhido) */}
      {filteredAddInfo.length > 0 && (
        <Card className="overflow-hidden mt-4">
          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors" onClick={() => setShowAddInfoList(v => !v)}>
            <span className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center"><ClipboardList size={20} /></span>
              <span>
                <strong>Lançamentos de informações adicionais</strong>
                <p className="text-xs text-slate-400 mt-0.5">Editar ou excluir os registros que compõem o detalhamento</p>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge color="accent">{filteredAddInfo.length} registro(s)</Badge>
              {showAddInfoList ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
            </span>
          </button>
          {showAddInfoList && (
            <div className="p-4 border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-100">
                    <th className="px-2 py-2 font-medium">Período</th>
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Filial</th>
                    <th className="px-2 py-2 font-medium text-right">Prejuízo</th>
                    <th className="px-2 py-2 font-medium text-right">Premiação</th>
                    <th className="px-2 py-2 font-medium text-right">Taxa</th>
                    <th className="px-2 py-2 font-medium text-right">Marketing</th>
                    <th className="px-2 py-2 font-medium text-right">Dinheiro</th>
                    <th className="px-2 py-2 font-medium text-right">Fiado</th>
                    <th className="px-2 py-2 font-medium text-right">Pix</th>
                    <th className="px-2 py-2 font-medium text-right">Arrecadado</th>
                    <th className="px-2 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAddInfo.map(a => {
                    const arrec = n(a.valor_pix) + n(a.venda_dinheiro) + n(a.fiado) + n(a.venda_marketing);
                    return (
                      <tr key={a.id} className="border-b border-slate-50 hover:bg-white">
                        <td className="px-2 py-2"><Badge color={a.period === 'monthly' ? 'brand' : 'slate'}>{a.period === 'monthly' ? 'Mensal' : 'Diário'}</Badge></td>
                        <td className="px-2 py-2 text-slate-600">{a.period === 'monthly' ? a.ref_date.slice(0, 7) : formatDateBR(a.ref_date)}</td>
                        <td className="px-2 py-2 text-slate-600">{a.branch?.name ?? '—'}</td>
                        <td className="px-2 py-2 text-right text-red-600">R$ {formatBRL(n(a.prejuizo))}</td>
                        <td className="px-2 py-2 text-right text-emerald-600">R$ {formatBRL(n(a.premiacao))}</td>
                        <td className="px-2 py-2 text-right text-red-600">R$ {formatBRL(n(a.taxa))}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(n(a.venda_marketing))}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(n(a.venda_dinheiro))}</td>
                        <td className="px-2 py-2 text-right text-amber-600">R$ {formatBRL(n(a.fiado))}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(n(a.valor_pix))}</td>
                        <td className="px-2 py-2 text-right font-semibold text-emerald-700">R$ {formatBRL(arrec)}</td>
                        <td className="px-2 py-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => openAddInfoEdit(a)} className="p-1.5 text-slate-400 hover:text-brand-600 rounded" title="Editar"><Pencil size={15} /></button>
                            <button onClick={() => void removeAddInfo(a)} className="p-1.5 text-slate-400 hover:text-red-600 rounded" title="Excluir"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Modal: Novo/Editar bolão */}
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
              <div className="flex justify-between"><span className="text-slate-600">Total bruto ({validEntries.length} bolão(ões))</span><strong>R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.bolao_value), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total comissão</span><strong className="text-accent-700">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.fee_value || recalcFee(e)), 0))}</strong></div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Informações adicionais */}
      <Modal open={addInfoOpen} onClose={() => !addInfoBusy && setAddInfoOpen(false)} title={addInfoEditing ? 'Editar Informações Adicionais' : 'Informações Adicionais'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          {isAdmin && (
            <Select label="Filial" value={addInfoBranch} onChange={setAddInfoBranch} options={branches.map(b => ({ value: b.id, label: b.name }))} placeholder="Selecione a filial" />
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => updateAddInfo('period', 'daily')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${addInfoEntry.period === 'daily' ? 'bg-brand-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              <Calendar size={15} /> Diário
            </button>
            <button type="button" onClick={() => updateAddInfo('period', 'monthly')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${addInfoEntry.period === 'monthly' ? 'bg-brand-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
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
            {moneyField('Premiação', addInfoEntry.premiacao, v => updateAddInfo('premiacao', v))}
            {moneyField('Taxa', addInfoEntry.taxa, v => updateAddInfo('taxa', v))}
            {moneyField('Venda Marketing', addInfoEntry.venda_marketing, v => updateAddInfo('venda_marketing', v))}
            {moneyField('Venda em Dinheiro', addInfoEntry.venda_dinheiro, v => updateAddInfo('venda_dinheiro', v))}
            {moneyField('Valor Pix', addInfoEntry.valor_pix, v => updateAddInfo('valor_pix', v))}
            {moneyField('Fiado', addInfoEntry.fiado, v => updateAddInfo('fiado', v))}
            <div className="sm:col-span-2 lg:col-span-3">
              <Input label="Fiado (observação)" value={addInfoEntry.fiado_obs} onChange={v => updateAddInfo('fiado_obs', v)} placeholder="Observação sobre o fiado" />
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm flex justify-between">
            <span className="text-emerald-800">Total arrecadado (Pix + Dinheiro + Fiado + Marketing)</span>
            <strong className="text-emerald-800">R$ {formatBRL(parseBRL(addInfoEntry.valor_pix) + parseBRL(addInfoEntry.venda_dinheiro) + parseBRL(addInfoEntry.fiado) + parseBRL(addInfoEntry.venda_marketing))}</strong>
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
