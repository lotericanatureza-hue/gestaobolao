import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Calendar, ChevronDown, ChevronRight, FileSpreadsheet, Pencil, Plus, Trash2, Ticket } from 'lucide-react';
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

function money(v: number) { return Math.round((v + Number.EPSILON) * 100); }

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

  const totalGeral = useMemo(() => filtered.reduce((s, r) => s + Number(r.bolao_value ?? 0), 0), [filtered]);
  const totalTarifa = useMemo(() => filtered.reduce((s, r) => s + Number(r.fee_value ?? 0), 0), [filtered]);
  const totalBruto = totalGeral + totalTarifa;
  const qtd = filtered.length;

  type DayGroup = { date: string; rows: FinBolaoGeral[]; total: number; tarifa: number };
  type BranchGroup = { branchId: string; branch: Branch | null; days: DayGroup[]; total: number; tarifa: number; count: number };

  const byBranch = useMemo<BranchGroup[]>(() => {
    const map = new Map<string, BranchGroup>();
    for (const r of filtered) {
      let bg = map.get(r.branch_id);
      if (!bg) { bg = { branchId: r.branch_id, branch: (r.branch as Branch | null) ?? null, days: [], total: 0, tarifa: 0, count: 0 }; map.set(r.branch_id, bg); }
      bg.total += Number(r.bolao_value ?? 0);
      bg.tarifa += Number(r.fee_value ?? 0);
      bg.count += 1;
      let dg = bg.days.find(d => d.date === r.bolao_date);
      if (!dg) { dg = { date: r.bolao_date, rows: [], total: 0, tarifa: 0 }; bg.days.push(dg); }
      dg.rows.push(r);
      dg.total += Number(r.bolao_value ?? 0);
      dg.tarifa += Number(r.fee_value ?? 0);
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
          fee_value: parseBRL(e.fee_value || recalcFee(e)), notes: e.notes.trim() || null,
          updated_at: new Date().toISOString(),
        };
        const { error: err } = await supabase.from('fin_bolao_geral').update(payload).eq('id', editing.id);
        if (err) throw new Error(err.message);
      } else {
        const payload = validEntries.map(e => ({
          branch_id: modalBranch, bolao_date: e.bolao_date, modality: e.modality.trim(), contest: e.contest.trim(),
          bolao_value: parseBRL(e.bolao_value), fee_percentage: Number(e.fee_percentage) || 0,
          fee_value: parseBRL(e.fee_value || recalcFee(e)), notes: e.notes.trim() || null,
          created_by: profile?.id ?? null,
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

  return (
    <div>
      <PageHeader title="Bolão Geral" subtitle="Cadastro de bolões por filial com total geral e total de tarifa"
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

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-5">
        <Card className="p-4"><p className="text-xs text-slate-500">Bolões</p><strong className="text-lg text-slate-900">{qtd}</strong></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total geral</p><strong className="text-lg text-brand-700">R$ {formatBRL(totalGeral)}</strong></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total tarifa</p><strong className="text-lg text-accent-700">R$ {formatBRL(totalTarifa)}</strong></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total bruto</p><strong className="text-lg text-slate-900">R$ {formatBRL(totalBruto)}</strong></Card>
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
                  <span className="text-sm text-slate-500">R$ {formatBRL(dg.total)}</span>
                  <span className="text-sm text-accent-600">Tarifa: R$ {formatBRL(dg.tarifa)}</span>
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
                        <th className="px-2 py-2 font-medium text-right">% Tarifa</th>
                        <th className="px-2 py-2 font-medium text-right">Valor Tarifa</th>
                        <th className="px-2 py-2 font-medium text-right">Bruto</th>
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
                          <td className="px-2 py-2 text-right font-medium">R$ {formatBRL(Number(r.bolao_value) + Number(r.fee_value))}</td>
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
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.total)}</td>
                        <td className="px-2 py-2 text-right"></td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.tarifa)}</td>
                        <td className="px-2 py-2 text-right">R$ {formatBRL(dg.total + dg.tarifa)}</td>
                        <td className="px-2 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>}
            </div>;
          });

          if (multiBranch) {
            return <Card key={branchKey} className="overflow-hidden">
              <button className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedBranch(branchOpen ? null : branchKey)}>
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Building2 size={20} /></span>
                  <span>
                    <strong>{bg.branch?.name ?? 'Sem filial'}</strong>
                    <span className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                      <span className="text-slate-700 font-semibold">Total: R$ {formatBRL(bg.total)}</span>
                      <span className="text-accent-600">Tarifa: R$ {formatBRL(bg.tarifa)}</span>
                    </span>
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
                  <span className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                    <span className="text-slate-700 font-semibold">Total: R$ {formatBRL(bg.total)}</span>
                    <span className="text-accent-600">Tarifa: R$ {formatBRL(bg.tarifa)}</span>
                  </span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Data" type="date" value={e.bolao_date} onChange={v => updateEntry(e.id, 'bolao_date', v)} />
                  <Input label="MOD / Modalidade" value={e.modality} onChange={v => updateEntry(e.id, 'modality', v)} placeholder="Ex: Mega-Sena" />
                  <Input label="Concurso" value={e.contest} onChange={v => updateEntry(e.id, 'contest', v)} placeholder="Ex: 2800" />
                  <div>
                    <span className="block text-sm font-medium text-slate-700 mb-1.5">Valor Bolão</span>
                    <input
                      type="text" inputMode="numeric" value={e.bolao_value}
                      onChange={ev => updateEntry(e.id, 'bolao_value', maskBRL(ev.target.value))}
                      placeholder="R$ 0,00"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                    />
                  </div>
                  <Input label="% Tarifa" type="number" step="0.01" value={e.fee_percentage} onChange={v => {
                    updateEntry(e.id, 'fee_percentage', v);
                    const val = parseBRL(e.bolao_value);
                    const pct = Number(v) || 0;
                    if (val && pct) updateEntry(e.id, 'fee_value', maskBRL(String(money(val * pct / 100))));
                  }} placeholder="Ex: 5" min={0} max={100} />
                  <div>
                    <span className="block text-sm font-medium text-slate-700 mb-1.5">Valor Tarifa</span>
                    <input
                      type="text" inputMode="numeric" value={e.fee_value}
                      onChange={ev => updateEntry(e.id, 'fee_value', maskBRL(ev.target.value))}
                      placeholder="R$ 0,00"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
                    />
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
              <div className="flex justify-between"><span className="text-slate-600">Total tarifa</span><strong className="text-accent-700">R$ {formatBRL(validEntries.reduce((s, e) => s + parseBRL(e.fee_value || recalcFee(e)), 0))}</strong></div>
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
