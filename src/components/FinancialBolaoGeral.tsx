import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Plus, Trash2, Ticket, TrendingDown, TrendingUp, DollarSign, Megaphone, Banknote, HandCoins, Smartphone, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR, maskBRL, parseBRL } from '../lib/format';
import type { Branch, FinBolaoGeral } from '../lib/types';

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

const emptyEntry = (): Entry => ({
  id: crypto.randomUUID(),
  bolao_date: today(),
  modality: '',
  contest: '',
  bolao_value: '',
  fee_percentage: '',
  fee_value: '',
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
  color: string;
}

function SummaryCard({ icon, label, value, color }: SummaryCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-lg font-bold text-slate-900">R$ {formatBRL(value)}</p>
    </Card>
  );
}

export function FinancialBolaoGeral() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [rows, setRows] = useState<FinBolaoGeral[]>([]);
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

  useEffect(() => {
    void supabase.from('branches').select('*').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]));
    setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
  }, [isAdmin, profile?.branch_id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('fin_bolao_geral').select('*, branch:branches(*)').order('bolao_date', { ascending: false });
    if (!isAdmin) {
      if (!profile?.branch_id) { setRows([]); setLoading(false); return; }
      query = query.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) query = query.eq('branch_id', selectedBranch);
    const { data, error: err } = await query;
    if (err) setError(err.message);
    setRows((data ?? []) as FinBolaoGeral[]);
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

  const filtered = useMemo(() => {
    const inPeriod = viewMode === 'day'
      ? rows.filter(r => r.bolao_date === filterDate)
      : rows.filter(r => r.bolao_date.startsWith(month));
    return modFilter ? inPeriod.filter(r => r.modality.trim() === modFilter) : inPeriod;
  }, [rows, viewMode, filterDate, month, modFilter]);

  const totals = useMemo(() => {
    return filtered.reduce((acc, r) => {
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
    }, {
      bolaoValue: 0, feeValue: 0, prejuizo: 0, comissao: 0, premiacao: 0,
      vendaMarketing: 0, vendaDinheiro: 0, fiado: 0, valorPix: 0,
    });
  }, [filtered]);

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
      prejuizo: Number(r.prejuizo) ? maskBRL(String(money(Number(r.prejuizo)))) : '',
      comissao: Number(r.comissao) ? maskBRL(String(money(Number(r.comissao)))) : '',
      premiacao: Number(r.premiacao) ? maskBRL(String(money(Number(r.premiacao)))) : '',
      venda_marketing: Number(r.venda_marketing) ? maskBRL(String(money(Number(r.venda_marketing)))) : '',
      venda_dinheiro: Number(r.venda_dinheiro) ? maskBRL(String(money(Number(r.venda_dinheiro)))) : '',
      fiado: Number(r.fiado) ? maskBRL(String(money(Number(r.fiado)))) : '',
      fiado_obs: r.fiado_obs ?? '',
      valor_pix: Number(r.valor_pix) ? maskBRL(String(money(Number(r.valor_pix)))) : '',
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
          prejuizo: parseBRL(e.prejuizo), comissao: parseBRL(e.comissao), premiacao: parseBRL(e.premiacao),
          venda_marketing: parseBRL(e.venda_marketing), venda_dinheiro: parseBRL(e.venda_dinheiro),
          fiado: parseBRL(e.fiado), fiado_obs: e.fiado_obs.trim() || null, valor_pix: parseBRL(e.valor_pix),
          notes: e.notes.trim() || null, updated_at: new Date().toISOString(),
        };
        const { error: err } = await supabase.from('fin_bolao_geral').update(payload).eq('id', editing.id);
        if (err) throw new Error(err.message);
      } else {
        const payload = validEntries.map(e => ({
          branch_id: modalBranch, bolao_date: e.bolao_date, modality: e.modality.trim(), contest: e.contest.trim(),
          bolao_value: parseBRL(e.bolao_value), fee_percentage: Number(e.fee_percentage) || 0,
          fee_value: parseBRL(e.fee_value || recalcFee(e)),
          prejuizo: parseBRL(e.prejuizo), comissao: parseBRL(e.comissao), premiacao: parseBRL(e.premiacao),
          venda_marketing: parseBRL(e.venda_marketing), venda_dinheiro: parseBRL(e.venda_dinheiro),
          fiado: parseBRL(e.fiado), fiado_obs: e.fiado_obs.trim() || null, valor_pix: parseBRL(e.valor_pix),
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

  if (loading && !rows.length) return <div className="flex justify-center py-20"><Spinner /></div>;

  const totalBruto = totals.bolaoValue + totals.feeValue;
  const totalVendas = totals.vendaDinheiro + totals.vendaMarketing + totals.valorPix;
  const totalReceitas = totals.comissao + totals.premiacao + totals.vendaMarketing;
  const resultado = totalReceitas - totals.prejuizo - totals.fiado;

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
          <Button onClick={openNew}><Plus size={17} /> Novo bolão</Button>
        </div>} />

      {error && !modalOpen && <p className="p-3 bg-red-50 text-red-700 rounded-lg mb-4">{error}</p>}

      {/* Summary cards — reformulated */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <SummaryCard icon={<FileSpreadsheet size={18} />} label="Bolões" value={qtd} color="bg-slate-100 text-slate-600" />
        <SummaryCard icon={<DollarSign size={18} />} label="Total Geral" value={totals.bolaoValue} color="bg-brand-50 text-brand-600" />
        <SummaryCard icon={<DollarSign size={18} />} label="Total Comissão" value={totals.comissao || totals.feeValue} color="bg-accent-50 text-accent-600" />
        <SummaryCard icon={<DollarSign size={18} />} label="Total Bruto" value={totalBruto} color="bg-slate-100 text-slate-700" />
        <SummaryCard icon={<TrendingDown size={18} />} label="Prejuízo" value={totals.prejuizo} color="bg-red-50 text-red-600" />
        <SummaryCard icon={<Trophy size={18} />} label="Premiação" value={totals.premiacao} color="bg-emerald-50 text-emerald-600" />
        <SummaryCard icon={<Megaphone size={18} />} label="Venda Marketing" value={totals.vendaMarketing} color="bg-brand-50 text-brand-600" />
        <SummaryCard icon={<Banknote size={18} />} label="Venda Dinheiro" value={totals.vendaDinheiro} color="bg-emerald-50 text-emerald-600" />
        <SummaryCard icon={<HandCoins size={18} />} label="Fiado" value={totals.fiado} color="bg-amber-50 text-amber-600" />
        <SummaryCard icon={<Smartphone size={18} />} label="Valor Pix" value={totals.valorPix} color="bg-brand-50 text-brand-600" />
        <SummaryCard icon={<TrendingUp size={18} />} label="Total Vendas" value={totalVendas} color="bg-emerald-50 text-emerald-600" />
        <SummaryCard icon={<TrendingUp size={18} />} label="Resultado" value={resultado} color={resultado >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'} />
      </div>

      {!byBranch.length ? <Card><EmptyState icon={<FileSpreadsheet size={42} />} title="Nenhum bolão" description="Cadastre um bolão para visualizar os totais por filial e período." /> </Card> :
        <div className="space-y-4">{byBranch.map(bg => {
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
        })}</div>}

      <Modal open={modalOpen} onClose={() => !busy && setModalOpen(false)} title={editing ? 'Editar bolão' : 'Novo bolão'} maxWidth="max-w-4xl">
        <div className="space-y-4">
          {isAdmin && (
            <Select label="Filial" value={modalBranch} onChange={setModalBranch} options={branches.map(b => ({ value: b.id, label: b.name }))} placeholder="Selecione a filial" />
          )}

          <div className="space-y-3">
            {entries.map((e, idx) => (
              <div key={e.id} className="rounded-lg border border-slate-200 p-3 space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5"><Ticket size={13} /> Bolão {idx + 1}</span>
                  {!editing && entries.length > 1 && <button onClick={() => removeEntry(e.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>}
                </div>

                {/* Dados do bolão */}
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

                {/* Campos financeiros do mês */}
                <div className="pt-2 border-t border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Valores do Mês</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {moneyField('Prejuízo', e.prejuizo, v => updateEntry(e.id, 'prejuizo', v))}
                    {moneyField('Comissão', e.comissao, v => updateEntry(e.id, 'comissao', v))}
                    {moneyField('Premiação', e.premiacao, v => updateEntry(e.id, 'premiacao', v))}
                    {moneyField('Venda Marketing', e.venda_marketing, v => updateEntry(e.id, 'venda_marketing', v))}
                    {moneyField('Venda em Dinheiro', e.venda_dinheiro, v => updateEntry(e.id, 'venda_dinheiro', v))}
                    {moneyField('Valor Pix', e.valor_pix, v => updateEntry(e.id, 'valor_pix', v))}
                    {moneyField('Fiado', e.fiado, v => updateEntry(e.id, 'fiado', v))}
                    <div className="sm:col-span-2">
                      <Input label="Fiado (observação)" value={e.fiado_obs} onChange={v => updateEntry(e.id, 'fiado_obs', v)} placeholder="Observação sobre o fiado" />
                    </div>
                  </div>
                </div>

                <Input label="Observações" value={e.notes} onChange={v => updateEntry(e.id, 'notes', v)} placeholder="Opcional" />
              </div>
            ))}
          </div>

          {!editing && <Button variant="secondary" onClick={addEntry}><Plus size={16} /> Adicionar bolão</Button>}

          {validEntries.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-4 space-y-1 bg-slate-50 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Total geral ({validEntries.length} bolão(ões))</span><strong>R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.bolao_value), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total comissão</span><strong className="text-accent-700">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.comissao || e.fee_value || recalcFee(e)), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total prejuízo</span><strong className="text-red-600">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.prejuizo), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total premiação</span><strong className="text-emerald-600">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.premiacao), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total venda marketing</span><strong>R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.venda_marketing), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total venda dinheiro</span><strong>R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.venda_dinheiro), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total fiado</span><strong className="text-amber-600">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.fiado), 0))}</strong></div>
              <div className="flex justify-between"><span className="text-slate-600">Total Pix</span><strong>R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.valor_pix), 0))}</strong></div>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
