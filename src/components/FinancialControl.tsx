import { useEffect, useState, useCallback } from 'react';
import { Wallet, Plus, Pencil, Trash2, Ticket, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, MoneyInput, Select, Modal, Spinner, EmptyState } from './ui';
import { formatBRL, formatDateBR, parseBRL, maskBRL } from '../lib/format';
import type { FinFinancialControl, Branch, DailyDeposit } from '../lib/types';
import { DailyCoverageFields } from './DailyCoverageFields';
import type { CoverageType } from './DailyCoverageFields';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const now = new Date();
const today = () => new Date().toLocaleDateString('en-CA');
const pad = (n: number) => String(n).padStart(2, '0');

const emptyForm = {
  entry_date: today(),
  start_043: '',
  end_043: '',
  armored_car: '',
  safe_difference: '',
  games_collection: '',
  cover_003: '',
  cover_003_type: '' as CoverageType,
  bank_balance: '',
  notes: '',
};

const toNumber = (value: string) => {
  const n = parseBRL(value);
  return isNaN(n) ? 0 : n;
};

const saldoOf = (cofre: number, end043: number) => cofre - end043;

const gamesOf = (value: number) => -Math.abs(value);

export function FinancialControl() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [entries, setEntries] = useState<FinFinancialControl[]>([]);
  const [paidExpenses, setPaidExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinFinancialControl | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deposits, setDeposits] = useState<DailyDeposit[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      setSelectedBranch(isAdmin ? (list[0]?.id ?? '') : (profile?.branch_id ?? ''));
    });
  }, [profile, isAdmin]);

  const fetchData = useCallback(async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const m = parseInt(month);
    const y = parseInt(year);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${pad(m)}-01`;
    const end = `${y}-${pad(m)}-${pad(lastDay)}`;
    const [ctrlRes, billRes] = await Promise.all([
      supabase.from('fin_financial_control').select('*').eq('branch_id', selectedBranch).gte('entry_date', start).lte('entry_date', end).order('entry_date', { ascending: false }),
      supabase.from('fin_bills').select('amount').eq('branch_id', selectedBranch).eq('type', 'expense').eq('status', 'paid').eq('month_ref', m).eq('year_ref', y),
    ]);
    if (ctrlRes.error || billRes.error) {
      setError('Não foi possível carregar os lançamentos. Tente novamente.');
      setLoading(false);
      return;
    }
    setEntries((ctrlRes.data ?? []) as FinFinancialControl[]);
    setPaidExpenses((billRes.data ?? []).reduce((s, b) => s + Number(b.amount), 0));
    setLoading(false);
  }, [selectedBranch, month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));
  const gamesTotal = entries.reduce((s, e) => s + gamesOf(Number(e.games_collection)), 0);
  const saldoTotal = entries.reduce((s, e) => s + saldoOf(Number(e.armored_car), Number(e.end_043)), 0);
  const formSaldo = saldoOf(toNumber(form.armored_car), toNumber(form.end_043));
  const totalDeposits = entries.reduce((s, e) => s + (e.deposits ?? []).reduce((ds, d) => ds + Number(d.amount), 0), 0);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDeposits([]);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (e: FinFinancialControl) => {
    setEditing(e);
    setForm({
      entry_date: e.entry_date,
      start_043: String(e.start_043),
      end_043: String(e.end_043),
      armored_car: String(e.armored_car),
      safe_difference: String(e.safe_difference),
      games_collection: String(Math.abs(e.games_collection)),
      cover_003: maskBRL(String(Math.round(Number(e.cover_003) * 100))),
      cover_003_type: (e.cover_003_type ?? '') as CoverageType,
      bank_balance: maskBRL(String(Math.round(Number(e.bank_balance ?? 0) * 100))),
      notes: e.notes ?? '',
    });
    setDeposits(e.deposits ?? []);
    setFormError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.entry_date) { setFormError('Informe a data do lançamento.'); return; }
    const coverAmount = parseBRL(form.cover_003);
    const coverActive = coverAmount > 0;
    if (coverActive && !form.cover_003_type) { setFormError('Escolha se a Cobertura 003 foi depósito ou saldo em conta.'); return; }
    if (coverActive && form.cover_003_type === 'deposit' && !deposits.some((d) => d.amount > 0)) { setFormError('Informe ao menos um depósito.'); return; }
    setSaving(true);
    setFormError(null);
    const payload = {
      branch_id: selectedBranch,
      entry_date: form.entry_date,
      start_043: toNumber(form.start_043),
      end_043: toNumber(form.end_043),
      armored_car: toNumber(form.armored_car),
      safe_difference: toNumber(form.safe_difference),
      games_collection: gamesOf(toNumber(form.games_collection)),
      cover_003: coverActive ? coverAmount : 0,
      cover_003_type: coverActive ? (form.cover_003_type || null) : null,
      bank_balance: coverActive && form.cover_003_type === 'bank_balance' ? parseBRL(form.bank_balance) : null,
      deposits: (coverActive && form.cover_003_type === 'deposit' ? deposits.filter((d) => d.amount > 0) : []) as unknown as Record<string, unknown>[],
      notes: form.notes.trim() || null,
    };
    const res = editing
      ? await supabase.from('fin_financial_control').update(payload).eq('id', editing.id)
      : await supabase.from('fin_financial_control').insert(payload);
    setSaving(false);
    if (res.error) {
      setFormError(res.error.code === '23505' ? 'Já existe um lançamento para esta data nesta filial.' : 'Não foi possível salvar o lançamento.');
      return;
    }
    setModalOpen(false);
    fetchData();
  };

  const remove = async (e: FinFinancialControl) => {
    if (!confirm(`Excluir o lançamento de ${formatDateBR(e.entry_date)}?`)) return;
    const res = await supabase.from('fin_financial_control').delete().eq('id', e.id);
    if (res.error) { setError('Não foi possível excluir o lançamento.'); return; }
    fetchData();
  };

  if (loading && !entries.length && !error) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Controle Financeiro"
        subtitle="Lançamentos diários por filial"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Select value={month} onChange={setMonth} options={monthNames.map((m, i) => ({ value: String(i + 1), label: m }))} />
            <Select value={year} onChange={setYear} options={[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => ({ value: String(y), label: String(y) }))} />
            <Button onClick={openNew} disabled={!selectedBranch}><Plus size={18} /> Novo Lançamento</Button>
          </div>
        }
      />

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><Receipt size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Despesas realizadas</p>
          </div>
          <p className="text-2xl font-bold text-red-600">R$ {formatBRL(paidExpenses)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><Ticket size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Arrecadação de jogos</p>
          </div>
          <p className="text-2xl font-bold text-red-600">R$ {formatBRL(gamesTotal)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center"><Wallet size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Saldo</p>
          </div>
          <p className={`text-2xl font-bold ${saldoTotal < 0 ? 'text-red-600' : 'text-slate-900'}`}>R$ {formatBRL(saldoTotal)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet size={22} /></div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Depósitos</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">R$ {formatBRL(totalDeposits)}</p>
        </Card>
      </div>

      {!selectedBranch ? (
        <Card><EmptyState icon={<Wallet size={48} />} title="Nenhuma filial selecionada" description="Selecione uma filial para ver os lançamentos." /></Card>
      ) : entries.length === 0 ? (
        <Card><EmptyState icon={<Wallet size={48} />} title="Nenhum lançamento no período" description="Adicione o lançamento diário para começar." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium text-right">043 início</th>
                  <th className="px-4 py-3 font-medium text-right">043 fim</th>
                  <th className="px-4 py-3 font-medium text-right">Carro forte</th>
                  <th className="px-4 py-3 font-medium text-right">Diferença no cofre</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo</th>
                  <th className="px-4 py-3 font-medium text-right">Arrecadação</th>
                  <th className="px-4 py-3 font-medium text-right">Cobertura 003</th>
                  <th className="px-4 py-3 font-medium text-right">Depósitos</th>
                  <th className="px-4 py-3 font-medium">Observação</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{formatDateBR(e.entry_date)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">R$ {formatBRL(Number(e.start_043))}</td>
                    <td className="px-4 py-3 text-right text-slate-600">R$ {formatBRL(Number(e.end_043))}</td>
                    <td className="px-4 py-3 text-right text-slate-600">R$ {formatBRL(Number(e.armored_car))}</td>
                    <td className="px-4 py-3 text-right text-slate-600">R$ {formatBRL(Number(e.safe_difference))}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${saldoOf(Number(e.armored_car), Number(e.end_043)) < 0 ? 'text-red-600' : 'text-slate-900'}`}>R$ {formatBRL(saldoOf(Number(e.armored_car), Number(e.end_043)))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-700">R$ {formatBRL(gamesOf(Number(e.games_collection)))}</td>
                    <td className="px-4 py-3 text-right text-slate-600">R$ {formatBRL(Number(e.cover_003))}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">R$ {formatBRL((e.deposits ?? []).reduce((ds, d) => ds + Number(d.amount), 0))}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">{e.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil size={14} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(e)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Lançamento' : 'Novo Lançamento'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <Input label="Data *" type="date" value={form.entry_date} onChange={(v) => setForm({ ...form, entry_date: v })} required />
          <div className="grid grid-cols-2 gap-4">
            <MoneyInput label="043 início do dia" value={form.start_043} onChange={(v) => setForm({ ...form, start_043: v })} />
            <MoneyInput label="043 fim do dia" value={form.end_043} onChange={(v) => setForm({ ...form, end_043: v })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <MoneyInput label="Carro forte" value={form.armored_car} onChange={(v) => setForm({ ...form, armored_car: v })} />
            <MoneyInput label="Diferença no cofre" value={form.safe_difference} onChange={(v) => setForm({ ...form, safe_difference: v })} />
          </div>
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
            <span className="text-sm text-slate-600">Saldo (Carro forte - 043 fim do dia)</span>
            <span className={`text-sm font-semibold ${formSaldo < 0 ? 'text-red-600' : 'text-slate-900'}`}>R$ {formatBRL(formSaldo)}</span>
          </div>
          <MoneyInput label="Arrecadação de jogos" value={form.games_collection} onChange={(v) => setForm({ ...form, games_collection: v })} />
          <DailyCoverageFields
            cover={form.cover_003}
            onCoverChange={(v) => setForm({ ...form, cover_003: v })}
            coverType={form.cover_003_type}
            onCoverTypeChange={(v) => setForm({ ...form, cover_003_type: v })}
            bankBalance={form.bank_balance}
            onBankBalanceChange={(v) => setForm({ ...form, bank_balance: v })}
            deposits={deposits}
            onDepositsChange={setDeposits}
          />
          <Input label="Observação" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Notas adicionais" />
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
