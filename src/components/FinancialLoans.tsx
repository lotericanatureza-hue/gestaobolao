import { useEffect, useState, useCallback } from 'react';
import { HandCoins, Plus, ArrowRightLeft, ArrowLeftRight, Trash2, Pencil, TrendingUp, TrendingDown, Calendar, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import type { FinLoan, FinLoanReturn, Branch } from '../lib/types';

const todayStr = () => new Date().toISOString().split('T')[0];

const emptyLoanForm = {
  from_branch_id: '',
  to_branch_id: '',
  loan_date: todayStr(),
  amount: '',
  description: '',
};

const emptyReturnForm = {
  return_date: todayStr(),
  amount: '',
};

export function FinancialLoans() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loans, setLoans] = useState<FinLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinLoan | null>(null);
  const [form, setForm] = useState(emptyLoanForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnLoan, setReturnLoan] = useState<FinLoan | null>(null);
  const [returnForm, setReturnForm] = useState(emptyReturnForm);
  const [savingReturn, setSavingReturn] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  const [fDate, setFDate] = useState(todayStr());

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      setBranches((data ?? []) as Branch[]);
    });
  }, []);

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('fin_loans')
      .select('*, from_branch:branches!from_branch_id(*), to_branch:branches!to_branch_id(*), returns:fin_loan_returns(*)')
      .order('loan_date', { ascending: false });
    setLoans((data ?? []) as FinLoan[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyLoanForm);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (l: FinLoan) => {
    setEditing(l);
    setForm({
      from_branch_id: l.from_branch_id,
      to_branch_id: l.to_branch_id,
      loan_date: l.loan_date,
      amount: String(l.amount),
      description: l.description ?? '',
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (form.from_branch_id === form.to_branch_id) { setError('A filial de origem e destino devem ser diferentes.'); return; }
    const amount = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { setError('Informe um valor válido.'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      from_branch_id: form.from_branch_id,
      to_branch_id: form.to_branch_id,
      loan_date: form.loan_date,
      amount,
      description: form.description.trim() || null,
    };
    if (editing) {
      await supabase.from('fin_loans').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('fin_loans').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchLoans();
  };

  const remove = async (l: FinLoan) => {
    if (!confirm(`Excluir o empréstimo de ${branchName(l.from_branch_id)} para ${branchName(l.to_branch_id)}?`)) return;
    await supabase.from('fin_loans').delete().eq('id', l.id);
    fetchLoans();
  };

  const openReturn = (l: FinLoan) => {
    setReturnLoan(l);
    setReturnForm({ return_date: todayStr(), amount: '' });
    setReturnError(null);
    setReturnModalOpen(true);
  };

  const saveReturn = async () => {
    if (!returnLoan) return;
    const amount = parseFloat(returnForm.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) { setReturnError('Informe um valor válido.'); return; }
    const remaining = Number(returnLoan.amount) - Number(returnLoan.returned_amount);
    if (amount > remaining) { setReturnError(`O valor máximo de devolução é R$ ${formatBRL(remaining)}.`); return; }
    setSavingReturn(true);
    setReturnError(null);
    const { error: insError } = await supabase.from('fin_loan_returns').insert({
      loan_id: returnLoan.id,
      return_date: returnForm.return_date,
      amount,
    });
    if (insError) { setReturnError('Erro ao registrar devolução: ' + insError.message); setSavingReturn(false); return; }
    const newReturned = Number(returnLoan.returned_amount) + amount;
    const newStatus = newReturned >= Number(returnLoan.amount) ? 'returned' : 'active';
    await supabase.from('fin_loans').update({ returned_amount: newReturned, status: newStatus }).eq('id', returnLoan.id);
    setSavingReturn(false);
    setReturnModalOpen(false);
    fetchLoans();
  };

  const removeReturn = async (r: FinLoanReturn, loan: FinLoan) => {
    if (!confirm('Excluir esta devolução?')) return;
    const newReturned = Number(loan.returned_amount) - Number(r.amount);
    const newStatus = newReturned <= 0 ? 'active' : (newReturned >= Number(loan.amount) ? 'returned' : 'active');
    await supabase.from('fin_loans').update({ returned_amount: Math.max(0, newReturned), status: newStatus }).eq('id', loan.id);
    await supabase.from('fin_loan_returns').delete().eq('id', r.id);
    fetchLoans();
  };

  // Daily summary for selected date
  const dayLoans = loans.filter((l) => l.loan_date === fDate);
  const dayLentTotal = dayLoans.reduce((s, l) => s + Number(l.amount), 0);
  const allReturns = loans.flatMap((l) => (l.returns ?? []).map((r) => ({ ...r, loan: l })));
  const dayReturns = allReturns.filter((r) => r.return_date === fDate);
  const dayReturnedTotal = dayReturns.reduce((s, r) => s + Number(r.amount), 0);

  // Per-branch-pair summary for selected date
  const pairSummary: Record<string, { lent: number; returned: number }> = {};
  for (const l of dayLoans) {
    const key = `${branchName(l.from_branch_id)} → ${branchName(l.to_branch_id)}`;
    if (!pairSummary[key]) pairSummary[key] = { lent: 0, returned: 0 };
    pairSummary[key].lent += Number(l.amount);
  }
  for (const r of dayReturns) {
    const key = `${branchName(r.loan.from_branch_id)} → ${branchName(r.loan.to_branch_id)}`;
    if (!pairSummary[key]) pairSummary[key] = { lent: 0, returned: 0 };
    pairSummary[key].returned += Number(r.amount);
  }

  // Active loans
  const activeLoans = loans.filter((l) => l.status === 'active');
  const totalOutstanding = activeLoans.reduce((s, l) => s + (Number(l.amount) - Number(l.returned_amount)), 0);

  if (loading && !loans.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Empréstimos entre Filiais"
        subtitle="Controle de dinheiro emprestado entre filiais e devoluções"
        action={
          <div className="flex items-center gap-2">
            <Input type="date" value={fDate} onChange={setFDate} />
            <Button onClick={openNew}><Plus size={18} /> Novo Empréstimo</Button>
          </div>
        }
      />

      {/* Daily summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><ArrowRightLeft size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Emprestado no Dia</p>
          </div>
          <p className="text-2xl font-bold text-brand-950">R$ {formatBRL(dayLentTotal)}</p>
          <p className="text-sm text-slate-500 mt-1">{dayLoans.length} empréstimo(s)</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><ArrowLeftRight size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Devolvido no Dia</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {formatBRL(dayReturnedTotal)}</p>
          <p className="text-sm text-slate-500 mt-1">{dayReturns.length} devolução(ões)</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center"><HandCoins size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Saldo em Aberto</p>
          </div>
          <p className="text-2xl font-bold text-amber-600">R$ {formatBRL(totalOutstanding)}</p>
          <p className="text-sm text-slate-500 mt-1">{activeLoans.length} empréstimo(s) ativo(s)</p>
        </Card>
      </div>

      {/* Per-pair daily summary */}
      {Object.keys(pairSummary).length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Calendar size={16} /> Resumo do dia — {formatDateBR(fDate)}
          </h3>
          <div className="space-y-2">
            {Object.entries(pairSummary).map(([pair, vals]) => (
              <div key={pair} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                <span className="text-sm font-medium text-slate-700">{pair}</span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-brand-600 font-semibold flex items-center gap-1"><TrendingUp size={14} /> R$ {formatBRL(vals.lent)}</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1"><TrendingDown size={14} /> R$ {formatBRL(vals.returned)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Loans table */}
      {loans.length === 0 ? (
        <Card><EmptyState icon={<HandCoins size={48} />} title="Nenhum empréstimo" description="Registre empréstimos entre filiais para acompanhar quem deve a quem." /></Card>
      ) : (
        <Card className="overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">De</th>
                  <th className="px-4 py-3 font-medium">Para</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium text-right">Devolvido</th>
                  <th className="px-4 py-3 font-medium text-right">Restante</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => {
                  const remaining = Number(l.amount) - Number(l.returned_amount);
                  return (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{formatDateBR(l.loan_date)}</td>
                      <td className="px-4 py-3 text-slate-700">{branchName(l.from_branch_id)}</td>
                      <td className="px-4 py-3 text-slate-700">{branchName(l.to_branch_id)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">R$ {formatBRL(Number(l.amount))}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">R$ {formatBRL(Number(l.returned_amount))}</td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-600">R$ {formatBRL(remaining)}</td>
                      <td className="px-4 py-3">
                        {l.status === 'returned'
                          ? <Badge color="green">Devolvido</Badge>
                          : <Badge color="amber">Ativo</Badge>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {l.status === 'active' && (
                            <Button size="sm" variant="secondary" onClick={() => openReturn(l)} title="Registrar devolução">
                              <ArrowLeftRight size={14} /> Devolver
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEdit(l)}><Pencil size={14} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(l)}><Trash2 size={14} /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Returns for selected day */}
      {dayReturns.length > 0 && (
        <Card className="overflow-hidden mb-6">
          <h3 className="text-sm font-semibold text-slate-700 px-5 pt-4 pb-2 flex items-center gap-2">
            <ArrowLeftRight size={16} /> Devoluções do dia — {formatDateBR(fDate)}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">De → Para</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {dayReturns.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{formatDateBR(r.return_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{branchName(r.loan.from_branch_id)} → {branchName(r.loan.to_branch_id)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">R$ {formatBRL(Number(r.amount))}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => removeReturn(r, r.loan)}><Trash2 size={14} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Loan modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Empréstimo' : 'Novo Empréstimo'}>
        <div className="space-y-4">
          <Select label="Filial de Origem (quem empresta)" value={form.from_branch_id} onChange={(v) => setForm({ ...form, from_branch_id: v })} options={branchOptions} placeholder="Selecionar filial" required />
          <Select label="Filial de Destino (quem recebe)" value={form.to_branch_id} onChange={(v) => setForm({ ...form, to_branch_id: v })} options={branchOptions} placeholder="Selecionar filial" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data do Empréstimo" type="date" value={form.loan_date} onChange={(v) => setForm({ ...form, loan_date: v })} required />
            <Input label="Valor (R$)" type="text" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0,00" required />
          </div>
          <Input label="Descrição" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Observações (opcional)" />
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Return modal */}
      <Modal open={returnModalOpen} onClose={() => setReturnModalOpen(false)} title="Registrar Devolução">
        <div className="space-y-4">
          {returnLoan && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Empréstimo:</span>
                <span className="font-medium text-slate-900">{branchName(returnLoan.from_branch_id)} → {branchName(returnLoan.to_branch_id)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor original:</span>
                <span className="font-medium text-slate-900">R$ {formatBRL(Number(returnLoan.amount))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Já devolvido:</span>
                <span className="font-medium text-emerald-600">R$ {formatBRL(Number(returnLoan.returned_amount))}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span className="text-slate-500 font-medium">Restante:</span>
                <span className="font-bold text-amber-600">R$ {formatBRL(Number(returnLoan.amount) - Number(returnLoan.returned_amount))}</span>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data da Devolução" type="date" value={returnForm.return_date} onChange={(v) => setReturnForm({ ...returnForm, return_date: v })} required />
            <Input label="Valor (R$)" type="text" value={returnForm.amount} onChange={(v) => setReturnForm({ ...returnForm, amount: v })} placeholder="0,00" required />
          </div>
          {returnLoan && (
            <Button variant="secondary" size="sm" className="w-full" onClick={() => setReturnForm({ ...returnForm, amount: String(Number(returnLoan.amount) - Number(returnLoan.returned_amount)) })}>
              <DollarSign size={14} /> Devolver valor total restante
            </Button>
          )}
          {returnError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{returnError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setReturnModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveReturn} disabled={savingReturn}>{savingReturn ? 'Salvando...' : 'Registrar Devolução'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
