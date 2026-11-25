import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, Pencil, Plus, Trash2 } from 'lucide-react';
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

/** Campos do formulário agrupados por assunto (todos os campos originais continuam aqui). */
const sections: { title: string; cols: 2 | 3; fields: { key: MoneyKey; label: string }[] }[] = [
  {
    title: 'Resultado do dia', cols: 3,
    fields: [
      { key: 'total_done', label: 'Total feito (R$)' },
      { key: 'commission', label: 'Comissão (R$)' },
      { key: 'encalhe', label: 'Encalhe (R$)' },
    ],
  },
  {
    title: 'Descontos e saídas', cols: 2,
    fields: [
      { key: 'fee', label: 'Taxa (R$)' },
      { key: 'sangria', label: 'Sangria (R$)' },
      { key: 'marketplace', label: 'Marketplace (R$)' },
      { key: 'premiacao', label: 'Premiação (R$)' },
    ],
  },
  {
    title: 'Recebimentos', cols: 3,
    fields: [
      { key: 'separate_commission', label: 'Comissão separada (R$)' },
      { key: 'pix', label: 'Pix (R$)' },
      { key: 'receivable', label: 'A receber (R$)' },
    ],
  },
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
    out.push({ value: ym, label: `${monthLabel(ym)} (${ym})` });
  }
  return out;
}

/** Valor em reais; zero fica apagado para o olho focar no que importa. */
function Money({ value, className = '' }: { value: unknown; className?: string }) {
  const n = Number(value ?? 0);
  return <span className={n === 0 ? 'text-slate-300' : className}>R$ {formatBRL(n)}</span>;
}

function SummaryCard({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
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

  useEffect(() => {
    void supabase.from('branches').select('*').order('name').then(({ data }) => setBranches((data ?? []) as Branch[]));
    setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
  }, [isAdmin, profile?.branch_id]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');

    // Calcula o primeiro dia do mês seguinte para usar como limite superior
    const [year, monthNum] = month.split('-').map(Number);
    const nextMonthDate = new Date(year, monthNum, 1);
    const nextMonthStr = nextMonthDate.toLocaleDateString('en-CA');

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
    const t = { total_done: 0, commission: 0, encalhe: 0, marketplace: 0 };
    for (const r of rows) {
      t.total_done += Number(r.total_done ?? 0);
      t.commission += Number(r.commission ?? 0);
      t.encalhe += Number(r.encalhe ?? 0);
      t.marketplace += Number(r.marketplace ?? 0);
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
  const th = 'px-3 py-3 font-medium whitespace-nowrap';
  const td = 'px-3 py-3 whitespace-nowrap text-right';

  if (loading && !rows.length) return <div className="flex justify-center py-20"><Spinner /></div>;
  return <div>
    <PageHeader title="Caixa Bolão" subtitle={`Controle diário por operador · ${monthLabel(month)}`}
      action={<div className="flex items-center gap-2">
        <Button variant="secondary" onClick={exportCsv}><Download size={16} /> Exportar</Button>
        <Button onClick={openNew}><Plus size={16} /> Novo lançamento</Button>
      </div>} />

    {/* Filtros */}
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Select value={month} onChange={setMonth} options={monthOptions()} />
      {isAdmin && <Select value={selectedBranch} onChange={v => { setSelectedBranch(v); setSelectedOperator(''); }}
        options={[{ value: '', label: 'Todas as filiais' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />}
    </div>

    {error && !modalOpen && <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

    {/* KPIs */}
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryCard label="Total feito" dot="bg-brand-500" value={`R$ ${formatBRL(totals.total_done)}`} />
      <SummaryCard label="Total Comissão" dot="bg-emerald-500" value={`R$ ${formatBRL(totals.commission)}`} />
      <SummaryCard label="Total Encalhe" dot="bg-red-400" value={`R$ ${formatBRL(totals.encalhe)}`} />
      <SummaryCard label="Total Marketplace" dot="bg-violet-400" value={`R$ ${formatBRL(totals.marketplace)}`} />
    </div>

    {/* Lançamentos */}
    {!rows.length
      ? <Card><EmptyState icon={<CalendarDays size={42} />} title="Nenhum lançamento neste mês"
          description="Cadastre o primeiro lançamento diário do Caixa Bolão." /></Card>
      : <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className={`${th} pl-5`}>Data</th>
                <th className={`${th} text-right`}>Total feito</th>
                <th className={`${th} text-right`}>Comissão</th>
                <th className={`${th} text-right`}>Encalhe</th>
                <th className={`${th} text-right`}>Taxa</th>
                <th className={`${th} text-right`}>Sangria</th>
                <th className={`${th} text-right`}>Marketplace</th>
                <th className={`${th} text-right`}>Premiação</th>
                <th className={`${th} text-right`}>Comissão sep.</th>
                <th className={`${th} text-right`}>Pix</th>
                <th className={`${th} text-right`}>A receber</th>
                <th className={th}>Observações</th>
                <th className="w-20 py-3 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => <tr key={r.id} className="group border-b border-slate-100 transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap py-3 pl-5 pr-3 font-medium text-slate-700">{formatDateBR(r.entry_date)}</td>
                <td className={`${td} font-medium text-slate-900`}><Money value={r.total_done} className="text-slate-900" /></td>
                <td className={td}><Money value={r.commission} className="text-emerald-700" /></td>
                <td className={td}><Money value={r.encalhe} className="text-red-600" /></td>
                <td className={td}><Money value={r.fee} className="text-slate-600" /></td>
                <td className={td}><Money value={r.sangria} className="text-slate-600" /></td>
                <td className={td}><Money value={r.marketplace} className="text-slate-600" /></td>
                <td className={td}><Money value={r.premiacao} className="text-slate-600" /></td>
                <td className={td}><Money value={r.separate_commission} className="text-slate-600" /></td>
                <td className={td}><Money value={r.pix} className="text-slate-600" /></td>
                <td className={td}><Money value={r.receivable} className="text-slate-600" /></td>
                <td className="max-w-48 truncate px-3 py-3 text-slate-500" title={r.notes ?? ''}>{r.notes ?? '—'}</td>
                <td className="py-3 pr-4">
                  {canEditRow(r) && <div className="flex justify-end gap-0.5 transition-opacity focus-within:opacity-100 sm:opacity-0 group-hover:opacity-100">
                    <button type="button" className={iconBtn} title="Editar" aria-label="Editar lançamento" onClick={() => openEdit(r)}><Pencil size={15} /></button>
                    <button type="button" className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600`} title="Excluir" aria-label="Excluir lançamento" onClick={() => void remove(r)}><Trash2 size={15} /></button>
                  </div>}
                </td>
              </tr>)}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-900">
                <td className="whitespace-nowrap py-3.5 pl-5 pr-3">Total mensal</td>
                <td className={td}>R$ {formatBRL(totals.total_done)}</td>
                <td className={`${td} text-emerald-700`}>R$ {formatBRL(totals.commission)}</td>
                <td className={`${td} text-red-600`}>R$ {formatBRL(totals.encalhe)}</td>
                <td colSpan={2}></td>
                <td className={td}>R$ {formatBRL(totals.marketplace)}</td>
                <td className="px-3 py-3.5 text-right" colSpan={6}>
                  <Badge color="slate">{rows.length} lançamento(s)</Badge>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
              : <p><span className="mb-1.5 block text-sm font-medium text-slate-700">Operador</span>{profile?.name}</p>}
          </div>
        </section>

        {sections.map(s => <section key={s.title}>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{s.title}</h4>
          <div className={`grid grid-cols-1 gap-3 ${s.cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {s.fields.map(f => <Input key={f.key} label={f.label} type="number" step="0.01" min={0}
              value={form[f.key]} onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))} placeholder="0,00" />)}
          </div>
        </section>)}

        <section>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Observações</span>
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
