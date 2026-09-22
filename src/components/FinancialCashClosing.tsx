import { useEffect, useState, useCallback } from 'react';
import { BookX, Plus, Pencil, Trash2, Upload, FileText, Download, PlusCircle, Trash, Lock, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatBRL } from '../lib/format';
import type { FinCashClosing, PixExternal, Branch } from '../lib/types';

const emptyForm = {
  closing_date: new Date().toISOString().split('T')[0],
  total_sales: '',
  total_income: '',
  safe_amount: '',
  cash_drawer: '',
  surplus: '',
  shortage: '',
  notes: '',
  status: 'open' as 'open' | 'closed',
};

export function FinancialCashClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [closings, setClosings] = useState<FinCashClosing[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinCashClosing | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pixExternals, setPixExternals] = useState<PixExternal[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdf, setExistingPdf] = useState<string | null>(null);
  const [fMonth, setFMonth] = useState('');

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      const list = (data ?? []) as Branch[];
      setBranches(list);
      if (isAdmin) {
        setSelectedBranch(list[0]?.id ?? '');
      } else {
        setSelectedBranch(profile?.branch_id ?? '');
      }
    });
  }, [profile, isAdmin]);

  const fetchData = useCallback(async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from('fin_cash_closing').select('*, branch:branches(*)').eq('branch_id', selectedBranch).order('closing_date', { ascending: false });
    setClosings((data ?? []) as FinCashClosing[]);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setPixExternals([]);
    setPdfFile(null);
    setExistingPdf(null);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: FinCashClosing) => {
    setEditing(c);
    setForm({
      closing_date: c.closing_date,
      total_sales: String(c.total_sales),
      total_income: String(c.total_income),
      safe_amount: String(c.safe_amount),
      cash_drawer: String(c.cash_drawer),
      surplus: String(c.surplus),
      shortage: String(c.shortage),
      notes: c.notes ?? '',
      status: c.status,
    });
    setPixExternals(c.pix_externals ?? []);
    setPdfFile(null);
    setExistingPdf(c.pdf_path);
    setError(null);
    setModalOpen(true);
  };

  const addPix = () => {
    setPixExternals([...pixExternals, { id: crypto.randomUUID(), description: '', amount: 0 }]);
  };

  const updatePix = (id: string, field: 'description' | 'amount', value: string) => {
    setPixExternals(pixExternals.map((p) => p.id === id ? { ...p, [field]: field === 'amount' ? parseFloat(value.replace(',', '.')) || 0 : value } : p));
  };

  const removePix = (id: string) => {
    setPixExternals(pixExternals.filter((p) => p.id !== id));
  };

  const totalPix = pixExternals.reduce((s, p) => s + Number(p.amount), 0);

  const uploadPdf = async (): Promise<string | null> => {
    if (!pdfFile || !selectedBranch) return existingPdf;
    const fileExt = pdfFile.name.split('.').pop();
    const fileName = `${selectedBranch}/${Date.now()}.${fileExt}`;
    setUploading(true);
    const { error: uploadError } = await supabase.storage.from('financial-pdfs').upload(fileName, pdfFile);
    setUploading(false);
    if (uploadError) {
      setError('Erro ao enviar PDF: ' + uploadError.message);
      return null;
    }
    return fileName;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const pdfPath = await uploadPdf();
    if (pdfFile && !pdfPath) { setSaving(false); return; }

    const payload = {
      branch_id: selectedBranch,
      closing_date: form.closing_date,
      total_sales: parseFloat(form.total_sales.replace(',', '.')) || 0,
      total_income: parseFloat(form.total_income.replace(',', '.')) || 0,
      pix_externals: pixExternals as unknown as Record<string, unknown>[],
      total_pix_externals: totalPix,
      surplus: parseFloat(form.surplus.replace(',', '.')) || 0,
      shortage: parseFloat(form.shortage.replace(',', '.')) || 0,
      safe_amount: parseFloat(form.safe_amount.replace(',', '.')) || 0,
      cash_drawer: parseFloat(form.cash_drawer.replace(',', '.')) || 0,
      pdf_path: pdfPath,
      notes: form.notes.trim() || null,
      status: form.status,
    };
    if (editing) {
      await supabase.from('fin_cash_closing').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('fin_cash_closing').insert(payload);
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const remove = async (c: FinCashClosing) => {
    if (!confirm(`Excluir o fechamento de ${new Date(c.closing_date).toLocaleDateString('pt-BR')}?`)) return;
    if (c.pdf_path) {
      await supabase.storage.from('financial-pdfs').remove([c.pdf_path]);
    }
    await supabase.from('fin_cash_closing').delete().eq('id', c.id);
    fetchData();
  };

  const toggleStatus = async (c: FinCashClosing) => {
    const newStatus = c.status === 'open' ? 'closed' : 'open';
    await supabase.from('fin_cash_closing').update({ status: newStatus }).eq('id', c.id);
    fetchData();
  };

  const downloadPdf = async (path: string) => {
    const { data } = await supabase.storage.from('financial-pdfs').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const now = new Date();
  const monthOpts = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    for (let m = 11; m >= 0; m--) {
      monthOpts.push({ value: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${monthNames[m]} ${y}` });
    }
  }

  const filtered = closings.filter((c) => {
    if (fMonth) {
      const d = new Date(c.closing_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === fMonth;
    }
    return true;
  });

  const totalSalesSum = filtered.reduce((s, c) => s + Number(c.total_sales), 0);
  const totalPixSum = filtered.reduce((s, c) => s + Number(c.total_pix_externals), 0);
  const totalSurplus = filtered.reduce((s, c) => s + Number(c.surplus), 0);
  const totalShortage = filtered.reduce((s, c) => s + Number(c.shortage), 0);

  if (loading && !closings.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Fechamento de Caixa"
        subtitle="Fechamento diário com PDF, pix externos, sobras e faltas"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Select value={fMonth} onChange={setFMonth} options={monthOpts} placeholder="Todos os meses" />
            <Button onClick={openNew}><Plus size={18} /> Novo Fechamento</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Total Vendas</p>
          <p className="text-xl font-bold text-brand-950">R$ {formatBRL(totalSalesSum)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Pix Externos</p>
          <p className="text-xl font-bold text-brand-600">R$ {formatBRL(totalPixSum)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Sobras</p>
          <p className="text-xl font-bold text-emerald-600">R$ {formatBRL(totalSurplus)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Faltas</p>
          <p className="text-xl font-bold text-red-600">R$ {formatBRL(totalShortage)}</p>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <Card><EmptyState icon={<BookX size={48} />} title="Nenhum fechamento" description="Registre o fechamento de caixa diário da filial." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium text-right">Vendas</th>
                  <th className="px-4 py-3 font-medium text-right">Pix Ext.</th>
                  <th className="px-4 py-3 font-medium text-right">Sobra</th>
                  <th className="px-4 py-3 font-medium text-right">Falta</th>
                  <th className="px-4 py-3 font-medium text-right">Cofre</th>
                  <th className="px-4 py-3 font-medium">PDF</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{new Date(c.closing_date).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">R$ {formatBRL(Number(c.total_sales))}</td>
                    <td className="px-4 py-3 text-right text-brand-600">R$ {formatBRL(Number(c.total_pix_externals))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">R$ {formatBRL(Number(c.surplus))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">R$ {formatBRL(Number(c.shortage))}</td>
                    <td className="px-4 py-3 text-right text-slate-700">R$ {formatBRL(Number(c.safe_amount))}</td>
                    <td className="px-4 py-3">
                      {c.pdf_path ? (
                        <button onClick={() => downloadPdf(c.pdf_path!)} className="text-brand-600 hover:text-brand-700 flex items-center gap-1" title="Ver PDF">
                          <FileText size={16} /> <span className="text-xs">PDF</span>
                        </button>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleStatus(c)}>
                        {c.status === 'closed' ? <Badge color="blue"><Lock size={12} className="mr-1" /> Fechado</Badge> : <Badge color="amber"><Unlock size={12} className="mr-1" /> Aberto</Badge>}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil size={14} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(c)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar Fechamento' : 'Novo Fechamento de Caixa'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data" type="date" value={form.closing_date} onChange={(v) => setForm({ ...form, closing_date: v })} required />
            <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as 'open' | 'closed' })} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Total de Vendas" type="text" value={form.total_sales} onChange={(v) => setForm({ ...form, total_sales: v })} placeholder="0,00" />
            <Input label="Total de Entradas" type="text" value={form.total_income} onChange={(v) => setForm({ ...form, total_income: v })} placeholder="0,00" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor no Cofre" type="text" value={form.safe_amount} onChange={(v) => setForm({ ...form, safe_amount: v })} placeholder="0,00" />
            <Input label="Caixa (Cash Drawer)" type="text" value={form.cash_drawer} onChange={(v) => setForm({ ...form, cash_drawer: v })} placeholder="0,00" />
          </div>

          {/* Pix Externos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="block text-sm font-medium text-slate-700">Pix Externos</span>
              <Button size="sm" variant="secondary" onClick={addPix}><PlusCircle size={14} /> Adicionar</Button>
            </div>
            {pixExternals.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhum pix externo adicionado.</p>
            ) : (
              <div className="space-y-2">
                {pixExternals.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={p.description}
                      onChange={(e) => updatePix(p.id, 'description', e.target.value)}
                      placeholder="Descrição"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={String(p.amount)}
                      onChange={(e) => updatePix(p.id, 'amount', e.target.value)}
                      placeholder="0,00"
                      className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-right focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
                    />
                    <button onClick={() => removePix(p.id)} className="text-slate-400 hover:text-red-500 p-2"><Trash size={16} /></button>
                  </div>
                ))}
                <div className="flex justify-end text-sm font-medium text-slate-700 pt-1">
                  Total Pix: R$ {formatBRL(totalPix)}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Sobras" type="text" value={form.surplus} onChange={(v) => setForm({ ...form, surplus: v })} placeholder="0,00" />
            <Input label="Faltas" type="text" value={form.shortage} onChange={(v) => setForm({ ...form, shortage: v })} placeholder="0,00" />
          </div>

          {/* PDF Upload */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">PDF do Fechamento</span>
            {existingPdf && !pdfFile && (
              <div className="flex items-center gap-2 mb-2 text-sm text-brand-600 bg-brand-50 rounded-lg p-3">
                <FileText size={16} /> PDF já enviado
                <button onClick={() => downloadPdf(existingPdf)} className="ml-auto text-brand-700 hover:underline flex items-center gap-1"><Download size={14} /> Ver</button>
              </div>
            )}
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg py-6 cursor-pointer hover:border-brand-400 transition-colors">
              <Upload size={20} className="text-slate-400" />
              <span className="text-sm text-slate-500">{pdfFile ? pdfFile.name : 'Clique para enviar um PDF'}</span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setPdfFile(e.target.files[0]); }}
              />
            </label>
          </div>

          <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Notas adicionais" />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || uploading}>{saving || uploading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
