import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, ChevronDown, ChevronRight, FileText, Lock, Plus, Ticket, Trash2, Unlock, Upload, User } from 'lucide-react';
import { createWorker } from 'tesseract.js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import type { BolaoClosingItem, Branch, FinBolaoClosing, Product, Profile } from '../lib/types';

const todayStr = () => new Date().toISOString().split('T')[0];

type ReportItem = {
  id: string;
  modality: string;
  contest: string;
  quantity: string;
  quotaValue: string;
  feeValue: string;
  drawDate: string;
  productId: string;
  slug: string;
};

const emptyItem = (drawDate = todayStr()): ReportItem => ({
  id: crypto.randomUUID(),
  modality: '',
  contest: '',
  quantity: '',
  quotaValue: '',
  feeValue: '',
  drawDate,
  productId: '',
  slug: '',
});

function amountFromText(value: string): number {
  const normalized = value.replace(/R\$\s?/gi, '').replace(/\./g, '').replace(',', '.').trim();
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function dateFromReport(text: string): string {
  const match = text.match(/\b(\d{2})[\/.](\d{2})[\/.](\d{4})\b/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : todayStr();
}

function extractReportItems(text: string, products: Product[]): ReportItem[] {
  const defaultDate = dateFromReport(text);
  const parsed: ReportItem[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim());

  for (const line of lines) {
    if (/^(TOTAL|MODAL|VALOR|COTAS|BOLAO|TERMINAL|OPERADOR|DATA|REV|CAIXA|VENDAS|RESUMO|TFL)/i.test(line)) continue;
    const match = line.match(/^([A-ZÀ-Ú][A-ZÀ-Ú0-9]*-[A-Z0-9]+)\s+(.+)$/i);
    if (!match) continue;
    const modalityAndContest = match[1].toUpperCase();
    const parts = match[2].split(/\s+/).filter(Boolean);
    const values = parts.filter((part) => /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$|^\d+\.\d{2}$/.test(part));
    if (values.length < 2) continue;

    const [modality, ...contestParts] = modalityAndContest.split('-');
    const quantity = parts.find((part) => /^\d+(?:\/\d+)?$/.test(part)) ?? '';
    const quotaToken = values.length >= 3 ? values[values.length - 3] : values[values.length - 2];
    const feeToken = values[values.length - 1];
    const product = products.find((item) => item.slug.toLowerCase().includes(modality.toLowerCase()) || item.name.toLowerCase().includes(modality.toLowerCase()));

    if (quantity && quotaToken && feeToken) {
      parsed.push({
        id: crypto.randomUUID(),
        modality,
        contest: contestParts.join('-'),
        quantity,
        quotaValue: `R$ ${formatBRL(amountFromText(quotaToken))}`,
        feeValue: `R$ ${formatBRL(amountFromText(feeToken))}`,
        drawDate: defaultDate,
        productId: product?.id ?? '',
        slug: product?.slug ?? '',
      });
    }
  }
  return parsed;
}

function itemFromStored(item: BolaoClosingItem): ReportItem {
  const quantity = item.quantity ?? String(item.shares ?? '');
  const quotaValue = item.quota_value ?? Number(item.price_per_share ?? 0) * (item.shares || 1);
  const feeValue = item.fee_value ?? Number(item.fee_per_share ?? 0) * (item.shares || 1);
  return {
    id: item.id || crypto.randomUUID(),
    modality: item.modality ?? item.product_name ?? '',
    contest: item.contest ?? '',
    quantity,
    quotaValue: quotaValue ? `R$ ${formatBRL(quotaValue)}` : '',
    feeValue: feeValue ? `R$ ${formatBRL(feeValue)}` : '',
    drawDate: item.draw_date ?? todayStr(),
    productId: item.product_id ?? '',
    slug: item.slug ?? '',
  };
}

function itemForSave(item: ReportItem): BolaoClosingItem {
  const shares = Number(item.quantity.split('/')[0]) || 0;
  const quotaValue = amountFromText(item.quotaValue);
  const feeValue = amountFromText(item.feeValue);
  const productName = item.modality + (item.contest ? `-${item.contest}` : '');
  return {
    id: item.id,
    product_id: item.productId,
    product_name: productName,
    slug: item.slug,
    shares,
    price_per_share: shares ? quotaValue / shares : quotaValue,
    fee_per_share: shares ? feeValue / shares : feeValue,
    total: quotaValue + feeValue,
    modality: item.modality,
    contest: item.contest,
    quantity: item.quantity,
    quota_value: quotaValue,
    fee_value: feeValue,
    draw_date: item.drawDate,
  };
}

export function FinancialBolaoClosing() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSupervisor = profile?.role === 'supervisor';
  const canManageAll = isAdmin || isSupervisor;
  const [products, setProducts] = useState<Product[]>([]);
  const [closings, setClosings] = useState<FinBolaoClosing[]>([]);
  const [operators, setOperators] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [fDate, setFDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
  const [fMonth, setFMonth] = useState(todayStr().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FinBolaoClosing | null>(null);
  const [formDate, setFormDate] = useState(todayStr());
  const [formOperatorId, setFormOperatorId] = useState('');
  const [items, setItems] = useState<ReportItem[]>([emptyItem()]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [sourceName, setSourceName] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [ocrState, setOcrState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('active', true).order('name'),
      supabase.from('branches').select('*').order('name'),
    ]).then(([productResult, branchResult]) => {
      setProducts((productResult.data ?? []) as Product[]);
      const list = (branchResult.data ?? []) as Branch[];
      setBranches(list);
      setSelectedBranch(isAdmin ? '' : profile?.branch_id ?? '');
    });
  }, [profile, isAdmin]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('fin_bolao_closing').select('*, operator:profiles(*), branch:branches(*)').order('closing_date', { ascending: false }).order('created_at', { ascending: false });
    if (!isAdmin) {
      if (!profile?.branch_id) { setLoading(false); return; }
      query = query.eq('branch_id', profile.branch_id);
    } else if (selectedBranch) query = query.eq('branch_id', selectedBranch);
    const { data } = await query;
    setClosings((data ?? []) as FinBolaoClosing[]);

    if (canManageAll) {
      let operatorQuery = supabase.from('profiles').select('*').eq('role', 'operator').eq('active', true).order('name');
      if (!isAdmin && profile?.branch_id) operatorQuery = operatorQuery.eq('branch_id', profile.branch_id);
      if (isAdmin && selectedBranch) operatorQuery = operatorQuery.eq('branch_id', selectedBranch);
      const { data: operatorData } = await operatorQuery;
      setOperators((operatorData ?? []) as Profile[]);
    }
    setLoading(false);
  }, [canManageAll, isAdmin, profile, selectedBranch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setFormDate(fDate);
    setFormOperatorId(canManageAll ? '' : profile?.id ?? '');
    setItems([emptyItem(fDate)]);
    setNotes('');
    setStatus('open');
    setSourceName('');
    setOcrText('');
    setOcrState('idle');
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (closing: FinBolaoClosing) => {
    setEditing(closing);
    setFormDate(closing.closing_date);
    setFormOperatorId(closing.operator_id);
    setItems(closing.items?.length ? closing.items.map(itemFromStored) : [emptyItem(closing.closing_date)]);
    setNotes(closing.notes ?? '');
    setStatus(closing.status);
    setSourceName(closing.source_report_name ?? '');
    setOcrText(closing.ocr_text ?? '');
    setOcrState(closing.ocr_text ? 'done' : 'idle');
    setError(null);
    setModalOpen(true);
  };

  const updateItem = (id: string, field: keyof ReportItem, value: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const selectProduct = (id: string, productId: string) => {
    const product = products.find((item) => item.id === productId);
    setItems((current) => current.map((item) => item.id === id ? {
      ...item,
      productId,
      slug: product?.slug ?? item.slug,
      modality: product?.name ?? item.modality,
    } : item));
  };

  const runOcr = async (file: File) => {
    setOcrState('reading');
    setError(null);
    try {
      const worker = await createWorker('por');
      const result = await worker.recognize(file);
      await worker.terminate();
      const text = result.data.text;
      const extracted = extractReportItems(text, products);
      setSourceName(file.name);
      setOcrText(text);
      setItems(extracted.length ? extracted : [emptyItem(dateFromReport(text))]);
      setOcrState('done');
      if (!extracted.length) setError('A foto foi lida, mas nenhuma linha reconhecível foi encontrada. Confira a imagem ou inclua as linhas manualmente.');
    } catch {
      setOcrState('error');
      setError('Não foi possível ler essa foto. Tente uma imagem mais nítida e bem iluminada.');
    }
  };

  const savedItems = useMemo(() => items.map(itemForSave).filter((item) => item.product_name && item.quantity && item.draw_date), [items]);
  const totalQuantity = savedItems.reduce((sum, item) => sum + (Number(item.quantity?.split('/')[0]) || 0), 0);
  const totalValue = savedItems.reduce((sum, item) => sum + Number(item.quota_value ?? 0) + Number(item.fee_value ?? 0), 0);
  const totalFee = savedItems.reduce((sum, item) => sum + Number(item.fee_value ?? 0), 0);

  const save = async () => {
    if (saving) return;
    if (!savedItems.length) { setError('Inclua pelo menos uma linha completa do relatório.'); return; }
    if (savedItems.some((item) => !item.draw_date)) { setError('Informe a data do sorteio em todas as linhas.'); return; }
    const operatorId = canManageAll ? formOperatorId : profile?.id ?? '';
    if (!operatorId) { setError('Selecione o operador.'); return; }
    let branchId = profile?.branch_id ?? '';
    if (isAdmin && selectedBranch) branchId = selectedBranch;
    const selectedOperator = operators.find((operator) => operator.id === operatorId);
    if (selectedOperator?.branch_id) branchId = selectedOperator.branch_id;
    if (!branchId) { setError('Não foi possível determinar a filial.'); return; }

    setSaving(true);
    setError(null);
    const payload = {
      operator_id: operatorId,
      branch_id: branchId,
      closing_date: formDate,
      items: savedItems as unknown as Record<string, unknown>[],
      total_cotas: totalQuantity,
      total_value: totalValue,
      total_fee: totalFee,
      pix_externals: editing?.pix_externals ?? [],
      total_pix_externals: editing?.total_pix_externals ?? 0,
      owed_amounts: editing?.owed_amounts ?? [],
      total_owed: editing?.total_owed ?? 0,
      notes: notes.trim() || null,
      status,
      source_report_name: sourceName || null,
      ocr_text: ocrText || null,
    };
    const result = editing
      ? await supabase.from('fin_bolao_closing').update(payload).eq('id', editing.id)
      : await supabase.from('fin_bolao_closing').insert(payload);
    if (result.error) {
      setError('Não foi possível salvar o fechamento. Confira os campos e tente novamente.');
      setSaving(false);
      return;
    }
    setSaving(false);
    setModalOpen(false);
    fetchData();
  };

  const removeClosing = async (closing: FinBolaoClosing) => {
    if (!confirm(`Excluir o fechamento de ${formatDateBR(closing.closing_date)}?`)) return;
    await supabase.from('fin_bolao_closing').delete().eq('id', closing.id);
    fetchData();
  };

  const toggleStatus = async (closing: FinBolaoClosing) => {
    await supabase.from('fin_bolao_closing').update({ status: closing.status === 'open' ? 'closed' : 'open' }).eq('id', closing.id);
    fetchData();
  };

  const periodClosings = viewMode === 'day' ? closings.filter((closing) => closing.closing_date === fDate) : closings.filter((closing) => closing.closing_date.startsWith(fMonth));
  const periodValue = periodClosings.reduce((sum, closing) => sum + Number(closing.total_value), 0);
  const periodFee = periodClosings.reduce((sum, closing) => sum + Number(closing.total_fee), 0);
  const periodQuantity = periodClosings.reduce((sum, closing) => sum + Number(closing.total_cotas), 0);
  const branchOptions = branches.map((branch) => ({ value: branch.id, label: branch.name }));

  if (loading && !closings.length) return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;

  return (
    <div>
      <PageHeader
        title="Fechamento de Bolão"
        subtitle="Fotografe o relatório, confira as linhas e informe a data de sorteio de cada concurso"
        action={<div className="flex items-center gap-2 flex-wrap">
          {isAdmin && <Select value={selectedBranch} onChange={setSelectedBranch} options={[{ value: '', label: 'Todas as filiais' }, ...branchOptions]} />}
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            <button onClick={() => setViewMode('day')} className={`px-3 py-2 text-sm font-medium ${viewMode === 'day' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Dia</button>
            <button onClick={() => setViewMode('month')} className={`px-3 py-2 text-sm font-medium ${viewMode === 'month' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Mês</button>
          </div>
          {viewMode === 'day' ? <Input type="date" value={fDate} onChange={setFDate} /> : <input type="month" value={fMonth} onChange={(event) => setFMonth(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />}
          <Button onClick={openNew}><Camera size={17} /> Novo fechamento</Button>
        </div>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4"><p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Fechamentos</p><p className="text-xl font-bold text-brand-950">{periodClosings.length}</p></Card>
        <Card className="p-4"><p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Quantidade</p><p className="text-xl font-bold text-brand-700">{periodQuantity}</p></Card>
        <Card className="p-4"><p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1">Cotas + tarifas</p><p className="text-xl font-bold text-brand-700">R$ {formatBRL(periodValue)} <span className="text-sm font-medium text-emerald-600">· R$ {formatBRL(periodFee)} tarifas</span></p></Card>
      </div>

      {!periodClosings.length ? <Card><EmptyState icon={<Ticket size={48} />} title="Nenhum fechamento neste período" description="Comece fotografando o relatório do operador para preencher as linhas automaticamente." /></Card> : <div className="space-y-3">
        {periodClosings.map((closing) => {
          const expanded = expandedId === closing.id;
          const canEdit = isAdmin || (isSupervisor && closing.branch_id === profile?.branch_id) || closing.operator_id === profile?.id;
          return <Card key={closing.id} className="overflow-hidden">
            <button className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedId(expanded ? null : closing.id)}>
              <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center"><FileText size={20} /></div><div><div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">{formatDateBR(closing.closing_date)}</h3><Badge color={closing.status === 'closed' ? 'blue' : 'amber'}>{closing.status === 'closed' ? <><Lock size={11} className="mr-1" />Fechado</> : <><Unlock size={11} className="mr-1" />Aberto</>}</Badge></div><p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><User size={12} /> {closing.operator?.name ?? 'Operador'}{closing.branch && ` · ${closing.branch.name}`}</p></div></div>
              <div className="flex items-center gap-4"><div className="text-right"><p className="text-sm font-bold text-brand-700">{closing.items?.length ?? 0} linhas</p><p className="text-xs text-slate-500">R$ {formatBRL(Number(closing.total_value))}</p></div>{expanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}</div>
            </button>
            {expanded && <div className="border-t border-slate-100 p-4 space-y-4"><div className="overflow-x-auto border border-slate-100 rounded-lg"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50"><th className="px-4 py-2">Modalidade/concurso</th><th className="px-4 py-2 text-right">Quantidade</th><th className="px-4 py-2 text-right">Valor cotas</th><th className="px-4 py-2 text-right">Valor tarifa</th><th className="px-4 py-2">Data sorteio</th></tr></thead><tbody>{(closing.items ?? []).map((item) => { const normalized = itemFromStored(item); return <tr key={item.id} className="border-b border-slate-50"><td className="px-4 py-2 font-medium text-slate-900">{normalized.modality}{normalized.contest ? `-${normalized.contest}` : ''}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.quantity}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.quotaValue || 'R$ 0,00'}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.feeValue || 'R$ 0,00'}</td><td className="px-4 py-2 text-slate-600">{formatDateBR(normalized.drawDate)}</td></tr>; })}</tbody></table></div>{closing.source_report_name && <p className="text-xs text-slate-400">Relatório processado: {closing.source_report_name}</p>}{closing.notes && <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3"><strong>Observações:</strong> {closing.notes}</p>}{canEdit && <div className="flex items-center justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => toggleStatus(closing)}>{closing.status === 'closed' ? <><Unlock size={14} /> Reabrir</> : <><Lock size={14} /> Fechar</>}</Button><Button size="sm" variant="secondary" onClick={() => openEdit(closing)}>Editar linhas</Button><Button size="sm" variant="danger" onClick={() => removeClosing(closing)}><Trash2 size={14} /> Excluir</Button></div>}</div>}
          </Card>;
        })}
      </div>}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Conferir fechamento' : 'Novo fechamento por relatório'} maxWidth="max-w-6xl">
        <div className="space-y-5">
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><p className="font-semibold text-brand-950">1. Fotografe ou envie o relatório</p><p className="text-sm text-brand-700 mt-1">A leitura acontece neste dispositivo. Depois, confira todas as linhas antes de salvar.</p></div><label className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium cursor-pointer"><Upload size={17} /> {ocrState === 'reading' ? 'Lendo relatório...' : 'Escolher foto'}<input type="file" accept="image/*" capture="environment" className="sr-only" disabled={ocrState === 'reading'} onChange={(event) => { const file = event.target.files?.[0]; if (file) void runOcr(file); event.currentTarget.value = ''; }} /></label></div>
          {ocrState === 'reading' && <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><Spinner className="text-brand-600" /> Analisando a imagem e identificando as linhas...</div>}
          {ocrState === 'done' && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17} /> Relatório lido. Confira os valores e as datas de sorteio abaixo.</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label="Data do fechamento" type="date" value={formDate} onChange={setFormDate} required />{canManageAll ? <Select label="Operador" value={formOperatorId} onChange={setFormOperatorId} options={operators.map((operator) => ({ value: operator.id, label: operator.name }))} placeholder="Selecione o operador" required /> : <div><span className="block text-sm font-medium text-slate-700 mb-1.5">Operador</span><p className="text-sm font-medium text-slate-900 bg-slate-50 rounded-lg px-3 py-2">{profile?.name}</p></div>}</div>

          <div><div className="flex items-center justify-between mb-2"><div><p className="font-semibold text-slate-900">2. Confira as linhas extraídas</p><p className="text-xs text-slate-500 mt-1">A data do sorteio é obrigatória e pode ser diferente em cada linha.</p></div><Button size="sm" variant="secondary" onClick={() => setItems((current) => [...current, emptyItem(formDate)])}><Plus size={14} /> Adicionar linha</Button></div><div className="space-y-3">{items.map((item, index) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end"><label className="md:col-span-3 text-[11px] text-slate-500">Modalidade/concurso<input value={`${item.modality}${item.contest ? `-${item.contest}` : ''}`} onChange={(event) => { const [modality, ...contest] = event.target.value.split('-'); setItems((current) => current.map((row) => row.id === item.id ? { ...row, modality, contest: contest.join('-') } : row)); }} placeholder="FACIL-3800" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Quantidade<input value={item.quantity} onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} placeholder="6 ou 6/2" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Valor cotas<input value={item.quotaValue} onChange={(event) => updateItem(item.id, 'quotaValue', event.target.value)} placeholder="R$ 0,00" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Valor tarifa<input value={item.feeValue} onChange={(event) => updateItem(item.id, 'feeValue', event.target.value)} placeholder="R$ 0,00" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Data sorteio<input type="date" value={item.drawDate} onChange={(event) => updateItem(item.id, 'drawDate', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><button className="p-2 text-slate-400 hover:text-red-600" title={`Remover linha ${index + 1}`} onClick={() => setItems((current) => current.length > 1 ? current.filter((row) => row.id !== item.id) : current)}><Trash2 size={17} /></button></div><div className="mt-2 flex items-center gap-2"><select value={item.productId} onChange={(event) => selectProduct(item.id, event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600"><option value="">Vincular ao produto cadastrado (opcional)</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><span className="text-xs text-slate-400">Linha {index + 1}</span></div></div>)}</div></div>

          <div className="rounded-xl bg-brand-50 p-4 flex flex-wrap gap-5 text-sm"><span className="text-slate-700">Quantidade: <strong className="text-brand-950">{totalQuantity}</strong></span><span className="text-slate-700">Valor cotas: <strong className="text-brand-700">R$ {formatBRL(totalValue - totalFee)}</strong></span><span className="text-slate-700">Tarifas: <strong className="text-emerald-700">R$ {formatBRL(totalFee)}</strong></span><span className="text-slate-700">Total: <strong className="text-brand-950">R$ {formatBRL(totalValue)}</strong></span></div>
          <Input label="Observações" value={notes} onChange={setNotes} placeholder="Notas adicionais" />
          <Select label="Status" value={status} onChange={(value) => setStatus(value as 'open' | 'closed')} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving || ocrState === 'reading'}>{saving ? 'Salvando...' : 'Salvar fechamento'}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
