import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import type { Branch, FinCaixaBolao, Profile } from '../lib/types';

const today = () => new Date().toLocaleDateString('en-CA');

type CaixaForm = {
  total_done: string;
  commission: string;
  encalhe: string;
  fee: string;
  sangria: string;
  marketplace: string;
  premiacao: string;
  separate_commission: string;
  pix: string;
  receivable: string;
  notes: string;
};
type MoneyKey = keyof Omit<CaixaForm, 'notes'>;

const emptyForm: CaixaForm = {
  total_done: '', commission: '', encalhe: '', fee: '', sangria: '', marketplace: '',
  premiacao: '', separate_commission: '', pix: '', receivable: '', notes: '',
};

/** Campos do formulário agrupados por assunto, para o modal ficar fácil de preencher. */
const sections: { title: string; cols: 2 | 3; fields: { key: MoneyKey; label: string }[] }[] = [
  {
    title: 'Resultado do dia', cols: 3,
    fields: [
      { key: 'total_done', label: 'Total feito' },
      { key: 'commission', label: 'Comissão' },
      { key: 'encalhe', label: 'Encalhe' },
    ],
  },
  {
    title: 'Descontos e saídas', cols: 2,
    fields: [
      { key: 'fee', label: 'Taxa' },
      { key: 'sangria', label: 'Sangria' },
      { key: 'marketplace', label: 'Marketplace' },
      { key: 'premiacao', label: 'Premiação' },
    ],
  },
  {
    title: 'Recebimentos', cols: 3,
    fields: [
      { key: 'separate_commission', label: 'Comissão separada' },
      { key: 'pix', label: 'Pix' },
      { key: 'receivable', label: 'A receber' },
    ],
  },
];

/** Colunas que ficam escondidas na linha e aparecem ao expandir. */
const detailFields: { key: MoneyKey; label: string }[] = [
  { key: 'fee', label: 'Taxa' },
  { key: 'sangria', label: 'Sangria' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'premiacao', label: 'Premiação' },
  { key: 'separate_commission', label: 'Comissão separada' },
  { key: 'pix', label: 'Pix' },
];

function toNumber(v: string): number {
  if (!v.trim()) return 0;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function toForm(r: FinCaixaBolao): CaixaForm {
  return {
    total_done: String(r.total_done ?? 0), commission: String(r.commission ?? 0),
    encalhe: String(r.encalhe ?? 0), fee: String(r.fee ?? 0), sangria: String(r.sangria ?? 0),
    marketplace: String(r.marketplace ?? 0), premiacao: String(r.premiacao ?? 0),
    separate_commission: String(r.separate_commission ?? 0), pix: String(r.pix ?? 0),
    receivable: String(r.receivable ?? 0), notes: r.notes ?? '',
  };
}

const capitalize = (s: string) => s.replace(/^\w/, c => c.toUpperCase());

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return capitalize(new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
}

function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: ym, label: monthLabel(ym) });
  }
  return out;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Valor em reais; zero fica apagado para o olho focar no que importa. */
function Money({ value, className = '' }: { value: unknown; className?: string }) {
  const n = Number(value ?? 0);
  return <span className={n === 0 ? 'text-slate-300' : className}>R$ {formatBRL(n)}</span>;
}

function SummaryCard({ label, value, dot, children }: { label: string; value?: string; dot: string; children?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}{children}</p>
    </Card>
  );
}

export function FinancialCaixaBolao() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canManageAll = isAdmin || profile?.role === 'supervisor';
  const [rows, setRows] = useState<FinCaixaBolao[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinCaixaBolao | null>(null);
  const [entryDate, setEntryDate] = useState(today());
  const [operatorId, setOperatorId] = useState('');
  const [form, setForm] = useState<CaixaForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.from('branches').select('*').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]));
    setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
  }, [isAdmin, profile?.branch_id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    // Primeiro dia do mês seguinte, usado como limite superior
    const [year, monthNum] = month.split('-').map(Number);
    const nextMonthStr = new Date(year, monthNum, 1).toLocaleDateString('en-CA');

    let q = supabase.from('fin_caixa_bolao').select('*, operator:profiles(*), branch:branches(*)')
      .gte('entry_date', `${month}-01`)
      .lt('entry_date', nextMonthStr)
      .order('entry_date', { ascending: false });

    if (!isAdmin) {
      if (!profile?.branch_id) { setRows([]); setLoading(false); return; }
      q = q.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) q = q.eq('branch_id', selectedBranch);

    if (selectedOperator) q = q.eq('operator_id', selectedOperator);

    const { data, error: err } = await q;
    if (err) setError(err.message);
    setRows((data ?? []) as FinCaixaBolao[]);
    setLoading(false);
  }, [isAdmin, month, profile?.branch_id, selectedBranch, selectedOperator]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!canManageAll) return;
    let q = supabase.from('profiles').select('*').eq('role', 'operator').eq('active', true).order('name');
    if (!isAdmin && profile?.branch_id) q = q.eq('branch_id', profile.branch_id);
    if (isAdmin && selectedBranch) q = q.eq('branch_id', selectedBranch);
    void q.then(({ data }) => setOperators((data ?? []) as Profile[]));
  }, [canManageAll, isAdmin, profile?.branch_id, selectedBranch]);

  const totals = useMemo(() => {
    const t = { total_done: 0, commission: 0, encalhe: 0, receivable: 0 };
    for (const r of rows) {
      t.total_done += Number(r.total_done ?? 0);
      t.commission += Number(r.commission ?? 0);
      t.encalhe += Number(r.encalhe ?? 0);
      t.receivable += Number(r.receivable ?? 0);
    }
    return t;
  }, [rows]);

  const openNew = () => {
    setEditing(null);
    setEntryDate(today());
    setOperatorId(canManageAll ? '' : profile?.id ?? '');
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (r: FinCaixaBolao) => {
    setEditing(r);
    setEntryDate(r.entry_date);
    setOperatorId(r.operator_id);
    setForm(toForm(r));
    setError('');
    setModalOpen(true);
  };

  const save = async () => {
    if (busy) return;
    const op = operatorId || profile?.id || '';
    if (!op) { setError('Selecione o operador.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) { setError('Informe a data.'); return; }
    const operator = operators.find(p => p.id === op);
    const branchId = operator?.branch_id ?? (canManageAll ? undefined : profile?.branch_id);
    if (!branchId) { setError('Operador sem filial vinculada. Selecione outro operador ou filial.'); return; }
    setBusy(true); setError('');
    const payload = {
      branch_id: branchId, operator_id: op, entry_date: entryDate,
      total_done: toNumber(form.total_done), commission: toNumber(form.commission),
      encalhe: toNumber(form.encalhe), fee: toNumber(form.fee), sangria: toNumber(form.sangria),
      marketplace: toNumber(form.marketplace), premiacao: toNumber(form.premiacao),
      separate_commission: toNumber(form.separate_commission), pix: toNumber(form.pix),
      receivable: toNumber(form.receivable), notes: form.notes.trim() || null,
    };
    const res = editing
      ? await supabase.from('fin_caixa_bolao').update(payload).eq('id', editing.id)
      : await supabase.from('fin_caixa_bolao').upsert(payload, { onConflict: 'operator_id,entry_date' });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setModalOpen(false);
    await refresh();
  };

  const remove = async (r: FinCaixaBolao) => {
    if (!window.confirm(`Excluir o lançamento de ${formatDateBR(r.entry_date)}?`)) return;
    const { error: err } = await supabase.from('fin_caixa_bolao').delete().eq('id', r.id);
    if (err) setError(err.message); else await refresh();
  };

  const exportCsv = () => {
    const header = ['Data', 'Operador', 'Total feito', 'Comissão', 'Encalhe', 'Taxa', 'Sangria', 'Marketplace', 'Premiação', 'Comissão separada', 'Pix', 'A receber', 'Observações'];
    const lines = rows.map(r => [
      formatDateBR(r.entry_date), r.operator?.name ?? '',
      r.total_done, r.commission, r.encalhe, r.fee, r.sangria, r.marketplace, r.premiacao,
      r.separate_commission, r.pix, r.receivable, (r.notes ?? '').replace(/[\n;]/g, ' '),
    ].join(';'));
    const csv = [header.join(';'), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `caixa-bolao-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const canEditRow = (r: FinCaixaBolao) =>
    isAdmin || (profile?.role === 'supervisor' && r.branch_id === profile?.branch_id) || r.operator_id === profile?.id;

  const iconBtn = 'rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30';

  return <div>
    <PageHeader title="Caixa Bolão" subtitle={`Controle diário por operador · ${monthLabel(month)}`}
      action={<div className="flex items-center gap-2">
        <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download size={16} /> Exportar</Button>
        <Button onClick={openNew}><Plus size={16} /> Novo lançamento</Button>
      </div>} />

    {/* Filtros */}
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Select value={month} onChange={setMonth} options={monthOptions()} />
      {isAdmin && <Select value={selectedBranch} onChange={v => { setSelectedBranch(v); setSelectedOperator(''); }}
        options={[{ value: '', label: 'Todas as filiais' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />}
      {canManageAll && <Select value={selectedOperator} onChange={setSelectedOperator}
        options={[{ value: '', label: 'Todos os operadores' }, ...operators.map(o => ({ value: o.id, label: o.name }))]} />}
    </div>

    {error && !modalOpen && <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

    {/* Resumo */}
    <div className={`mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity ${loading && rows.length ? 'opacity-60' : ''}`}>
      <SummaryCard label="Total feito" dot="bg-brand-500" value={`R$ ${formatBRL(totals.total_done)}`} />
      <SummaryCard label="Comissão" dot="bg-emerald-500" value={`R$ ${formatBRL(totals.commission)}`} />
      <SummaryCard label="Encalhe" dot="bg-red-400" value={`R$ ${formatBRL(totals.encalhe)}`} />
      <SummaryCard label="A receber" dot="bg-amber-400" value={`R$ ${formatBRL(totals.receivable)}`} />
    </div>

    {/* Lançamentos */}
    {loading && !rows.length
      ? <Card><div className="flex justify-center py-16"><Spinner /></div></Card>
      : !rows.length
        ? <Card><EmptyState icon={<CalendarDays size={42} />} title="Nenhum lançamento neste mês"
            description="Cadastre o primeiro lançamento diário do Caixa Bolão." /></Card>
        : <Card className={`overflow-hidden transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Lançamentos</h3>
            <Badge color="slate">{rows.length} {rows.length === 1 ? 'registro' : 'registros'}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-8 py-3 pl-4"></th>
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-3 py-3 font-medium">Operador</th>
                  <th className="px-3 py-3 text-right font-medium">Total feito</th>
                  <th className="px-3 py-3 text-right font-medium">Comissão</th>
                  <th className="px-3 py-3 text-right font-medium">Encalhe</th>
                  <th className="px-3 py-3 text-right font-medium">A receber</th>
                  <th className="w-20 py-3 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const open = expandedId === r.id;
                  return <>
                    <tr key={r.id}
                      onClick={() => setExpandedId(open ? null : r.id)}
                      className={`group cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 ${open ? 'bg-slate-50' : ''}`}>
                      <td className="py-3 pl-4 text-slate-300">
                        <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90 text-slate-500' : ''}`} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDateBR(r.entry_date)}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">
                            {initials(r.operator?.name)}
                          </span>
                          <span className="text-slate-700">{r.operator?.name ?? '—'}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium text-slate-900"><Money value={r.total_done} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right text-emerald-700"><Money value={r.commission} className="text-emerald-700" /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right"><Money value={r.encalhe} className="text-red-600" /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right"><Money value={r.receivable} className="text-slate-700" /></td>
                      <td className="py-3 pr-4" onClick={e => e.stopPropagation()}>
                        {canEditRow(r) && <div className="flex justify-end gap-0.5 sm:opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button type="button" className={iconBtn} title="Editar" aria-label="Editar lançamento" onClick={() => openEdit(r)}><Pencil size={15} /></button>
                          <button type="button" className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600`} title="Excluir" aria-label="Excluir lançamento" onClick={() => void remove(r)}><Trash2 size={15} /></button>
                        </div>}
                      </td>
                    </tr>
                    {open && <tr key={`${r.id}-details`} className="bg-slate-50">
                      <td colSpan={8} className="px-5 pb-4 pt-1">
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6 pl-7">
                          {detailFields.map(f => <div key={f.key}>
                            <dt className="text-xs text-slate-400">{f.label}</dt>
                            <dd className="mt-0.5 font-medium text-slate-700"><Money value={r[f.key]} className="text-slate-700" /></dd>
                          </div>)}
                        </dl>
                        {r.notes && <p className="mt-3 pl-7 text-sm text-slate-500"><span className="text-slate-400">Observações: </span>{r.notes}</p>}
                      </td>
                    </tr>}
                  </>;
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-900">
                  <td className="px-5 py-3.5" colSpan={3}>Total do mês</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right">R$ {formatBRL(totals.total_done)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right text-emerald-700">R$ {formatBRL(totals.commission)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right text-red-600">R$ {formatBRL(totals.encalhe)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-right">R$ {formatBRL(totals.receivable)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">Clique em uma linha para ver taxa, sangria, marketplace, premiação, Pix e observações.</p>
        </Card>}

    {/* Modal */}
    <Modal open={modalOpen} onClose={() => !busy && setModalOpen(false)} title={editing ? 'Editar lançamento' : 'Novo lançamento diário'}>
      <div className="space-y-6">
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Identificação</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Data" type="date" value={entryDate} onChange={setEntryDate} />
            {canManageAll
              ? <Select label="Operador" value={operatorId} onChange={setOperatorId} options={operators.map(o => ({ value: o.id, label: o.name }))} placeholder="Selecione o operador" />
              : <div><span className="mb-1.5 block text-sm font-medium text-slate-700">Operador</span><p className="py-2 text-sm text-slate-600">{profile?.name}</p></div>}
          </div>
        </section>

        {sections.map(s => <section key={s.title}>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.title} <span className="font-normal normal-case tracking-normal">· valores em R$</span></h4>
          <div className={`grid grid-cols-1 gap-3 ${s.cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {s.fields.map(f => <Input key={f.key} label={f.label} type="number" step="0.01" min={0}
              value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} placeholder="0,00" />)}
          </div>
        </section>)}

        <section>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Observações <span className="font-normal text-slate-400">(opcional)</span></span>
            <textarea className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              rows={2} value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} />
          </label>
        </section>

        {error && <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </Modal>
  </div>;
}
