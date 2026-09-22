import { useEffect, useState, useCallback } from 'react';
import { BookX, Plus, Pencil, Trash2, Upload, FileText, Download, PlusCircle, Trash, Lock, Unlock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import { formatBRL } from '../lib/format';
import type { FinCashClosing, PixExternal, Branch } from '../lib/types';

interface ExtractedData {
  closing_date: string;
  total_sales: number;
  total_income: number;
  safe_amount: number;
  cash_drawer: number;
  rawText: string;
}

function parseBRLValue(text: string, patterns: string[]): number {
  for (const pattern of patterns) {
    const regex = new RegExp(pattern, 'i');
    const match = text.match(regex);
    if (match && match[1]) {
      const cleaned = match[1].replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
      const val = parseFloat(cleaned);
      if (!isNaN(val)) return val;
    }
  }
  return 0;
}

function extractDate(text: string): string {
  const dateMatch = text.match(/(\d{2})[\/](\d{2})[\/](\d{4})/);
  if (dateMatch) {
    return `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  }
  return new Date().toISOString().split('T')[0];
}

async function extractPdfData(file: File): Promise<ExtractedData> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await import('pdfjs-dist');
  const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: unknown) => {
      const obj = item as { str?: string };
      return obj.str ?? '';
    }).join(' ');
    fullText += pageText + '\n';
  }

  const totalSales = parseBRLValue(fullText, [
    'total\\s*(?:de\\s*)?vendas?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'vendas?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'total\\s*vendido[:\\s]*R?\\$?\\s*([\\d.,]+)',
  ]);

  const totalIncome = parseBRLValue(fullText, [
    'total\\s*(?:de\\s*)?entrada[s]?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'entrada[s]?[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'total\\s*(?:de\\s*)?receita[s]?[:\\s]*R?\\$?\\s*([\\d.,]+)',
  ]);

  const safeAmount = parseBRLValue(fullText, [
    'cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'valor\\s*(?:do\\s*)?cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'saldo\\s*(?:do\\s*)?cofre[:\\s]*R?\\$?\\s*([\\d.,]+)',
  ]);

  const cashDrawer = parseBRLValue(fullText, [
    'caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'valor\\s*(?:em\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'fundo\\s*(?:de\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
    'dinheiro\\s*(?:em\\s*)?caixa[:\\s]*R?\\$?\\s*([\\d.,]+)',
  ]);

  return {
    closing_date: extractDate(fullText),
    total_sales: totalSales,
    total_income: totalIncome,
    safe_amount: safeAmount,
    cash_drawer: cashDrawer,
    rawText: fullText,
  };
}

const emptyForm = {
  closing_date: new Date().toISOString().split('T')[0],
  total_sales: 0,
  total_income: 0,
  safe_amount: 0,
  cash_drawer: 0,
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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [existingPdf, setExistingPdf] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(false);
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
    setExtracted(false);
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: FinCashClosing) => {
    setEditing(c);
    setForm({
      closing_date: c.closing_date,
      total_sales: Number(c.total_sales),
      total_income: Number(c.total_income),
      safe_amount: Number(c.safe_amount),
      cash_drawer: Number(c.cash_drawer),
      surplus: String(c.surplus),
      shortage: String(c.shortage),
      notes: c.notes ?? '',
      status: c.status,
    });
    setPixExternals(c.pix_externals ?? []);
    setPdfFile(null);
    setExistingPdf(c.pdf_path);
    setExtracted(true);
    setError(null);
    setModalOpen(true);
  };

  const handlePdfSelect = async (file: File) => {
    setPdfFile(file);
    setExtracting(true);
    setExtracted(false);
    setError(null);
    try {
      const data = await extractPdfData(file);
      setForm((prev) => ({
        ...prev,
        closing_date: data.closing_date,
        total_sales: data.total_sales,
        total_income: data.total_income,
        safe_amount: data.safe_amount,
        cash_drawer: data.cash_drawer,
      }));
      setExtracted(true);
    } catch (err) {
      setError('Não foi possível extrair dados do PDF. Verifique se o arquivo é um PDF válido.');
      console.error('PDF extraction error:', err);
    }
    setExtracting(false);
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
    const { error: uploadError } = await supabase.storage.from('financial-pdfs').upload(fileName, pdfFile);
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
      total_sales: form.total_sales,
      total_income: form.total_income,
      pix_externals: pixExternals as unknown as Record<string, unknown>[],
      total_pix_externals: totalPix,
      surplus: parseFloat(form.surplus.replace(',', '.')) || 0,
      shortage: parseFloat(form.shortage.replace(',', '.')) || 0,
      safe_amount: form.safe_amount,
      cash_drawer: form.cash_drawer,
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
  const monthOpts: { value: string; label: string }[] = [];
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
        subtitle="Extração automática do PDF — informe apenas pix externos, sobras e faltas"
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
        <Card><EmptyState icon={<BookX size={48} />} title="Nenhum fechamento" description="Envie um PDF para criar um fechamento de caixa." /></Card>
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
          {/* PDF Upload / Extraction */}
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">PDF do Fechamento (extração automática)</span>
            {existingPdf && !pdfFile && (
              <div className="flex items-center gap-2 mb-2 text-sm text-brand-600 bg-brand-50 rounded-lg p-3">
                <FileText size={16} /> PDF já enviado
                <button onClick={() => downloadPdf(existingPdf)} className="ml-auto text-brand-700 hover:underline flex items-center gap-1"><Download size={14} /> Ver</button>
              </div>
            )}
            <label className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer transition-colors ${extracting ? 'border-brand-400 bg-brand-50' : 'border-slate-300 hover:border-brand-400'}`}>
              {extracting ? (
                <>
                  <Loader2 size={20} className="text-brand-500 animate-spin" />
                  <span className="text-sm text-brand-600">Extraindo dados do PDF...</span>
                </>
              ) : extracted ? (
                <>
                  <CheckCircle size={20} className="text-emerald-500" />
                  <span className="text-sm text-emerald-600">{pdfFile ? pdfFile.name : 'PDF carregado e dados extraídos'}</span>
                </>
              ) : (
                <>
                  <Upload size={20} className="text-slate-400" />
                  <span className="text-sm text-slate-500">{pdfFile ? pdfFile.name : 'Clique para enviar um PDF'}</span>
                </>
              )}
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handlePdfSelect(e.target.files[0]); }}
              />
            </label>
          </div>

          {/* Extracted data display (read-only) */}
          {extracted && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dados extraídos do PDF</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Data</span><span className="font-medium text-slate-900">{new Date(form.closing_date).toLocaleDateString('pt-BR')}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Total de Vendas</span><span className="font-medium text-slate-900">R$ {formatBRL(form.total_sales)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Total de Entradas</span><span className="font-medium text-slate-900">R$ {formatBRL(form.total_income)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Cofre</span><span className="font-medium text-slate-900">R$ {formatBRL(form.safe_amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Caixa</span><span className="font-medium text-slate-900">R$ {formatBRL(form.cash_drawer)}</span></div>
              </div>
            </div>
          )}

          {!extracted && !extracting && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>Envie um PDF para extrair automaticamente os valores. Você poderá revisar antes de salvar.</span>
            </div>
          )}

          {/* Pix Externos (manual) */}
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

          {/* Sobras e Faltas (manual) */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sobras" type="text" value={form.surplus} onChange={(v) => setForm({ ...form, surplus: v })} placeholder="0,00" />
            <Input label="Faltas" type="text" value={form.shortage} onChange={(v) => setForm({ ...form, shortage: v })} placeholder="0,00" />
          </div>

          <Input label="Observações" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Notas adicionais" />

          <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as 'open' | 'closed' })} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || extracting}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
