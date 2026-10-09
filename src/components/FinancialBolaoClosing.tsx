import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ChevronDown, ChevronRight, FileText, Lock, Plus, Ticket, Trash2, Unlock, Upload, User, XCircle } from 'lucide-react';
import { createWorker, PSM } from 'tesseract.js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, Spinner } from './ui';
import { formatBRL, formatDateBR } from '../lib/format';
import { preprocessImage } from '../lib/imageProcessing';
import type { BolaoClosingItem, Branch, FinBolaoClosing, Product, Profile } from '../lib/types';

const todayStr = () => new Date().toISOString().split('T')[0];

type ReportItem = {
  id: string;
  modality: string;
  contest: string;
  quantity: string;
  quotaValue: string;
  feePercentage: string;
  feeValue: string;
  drawDate: string;
  productId: string;
  slug: string;
  reportSection: string;
  reportKind: 'cotas' | 'bolao';
  sourceLine: string;
  validated: boolean;
};

const emptyItem = (drawDate = todayStr()): ReportItem => ({
  id: crypto.randomUUID(),
  modality: '',
  contest: '',
  quantity: '',
  quotaValue: '',
  feePercentage: '',
  feeValue: '',
  drawDate,
  productId: '',
  slug: '',
  reportSection: '',
  reportKind: 'cotas',
  sourceLine: '',
  validated: false,
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

/** Check whether tarifa ≈ quota × percentage / 100 within 0.02 tolerance. */
function checkFeeConsistency(quota: number, percentage: number, fee: number): boolean {
  if (percentage <= 0) return fee === 0;
  const calculated = (quota * percentage) / 100;
  return Math.abs(calculated - fee) <= 0.02;
}

function extractReportTotals(text: string): { quota: number; fee: number } | null {
  let quota = 0;
  let fee = 0;
  let found = false;
  const moneyPattern = /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$|^\d+\.\d{2}$/;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/^TOTAL\b/i.test(line)) continue;
    const values = line.split(/\s+/).filter((part) => moneyPattern.test(part));
    if (values.length >= 2) {
      quota += amountFromText(values[values.length - 2]);
      fee += amountFromText(values[values.length - 1]);
      found = true;
    } else if (values.length === 1) {
      quota += amountFromText(values[0]);
      found = true;
    }
  }
  return found ? { quota, fee } : null;
}

/**
 * Section-aware line-by-line parser. Tracks the current report section
 * (TFL, outra TFL, MKP, bolão com/sem tarifa) and extracts one ReportItem
 * per game line. Handles +MILI prefix, lines with/without contest, and
 * distinguishes cotas sections (2+ money values) from bolão sections (1+).
 *
 * Expected line format per the Caixa report:
 *   MODALIDADE-CONCURSO  COTAS  VALOR_COTAS  PERCENTUAL  VALOR_TARIFA
 * e.g.  MEGA-3068  6/2  54,00  35,00  18,90
 */
function extractReportItems(text: string, products: Product[]): ReportItem[] {
  const defaultDate = dateFromReport(text);
  const parsed: ReportItem[] = [];
  let reportSection = 'Cotas baixadas/impressas registradas na outra TFL';
  let reportKind: 'cotas' | 'bolao' = 'cotas';
  const lines = text.split(/\r?\n/).map((line) => line.replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const moneyPattern = /^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$|^\d+\.\d{2}$/;

  for (const line of lines) {
    if (/BOLAO CAIXA - SEM TARIFA/i.test(line)) {
      reportSection = 'Bolão caixa - sem tarifa de serviço';
      reportKind = 'bolao';
      continue;
    }
    if (/BOLAO CAIXA - COM TARIFA/i.test(line)) {
      reportSection = 'Bolão caixa - com tarifa de serviço';
      reportKind = 'bolao';
      continue;
    }
    if (/COTAS BAIXADAS\/IMPRESSAS REGISTRADAS NA TFL/i.test(line)) {
      reportSection = 'Cotas baixadas/impressas registradas na TFL';
      reportKind = 'cotas';
      continue;
    }
    if (/COTAS BAIXADAS\/IMPRESSAS REGISTRADAS OUTRA TFL/i.test(line)) {
      reportSection = 'Cotas baixadas/impressas registradas na outra TFL';
      reportKind = 'cotas';
      continue;
    }
    if (/VENDAS DE COTAS VIRTUAIS NO MKP/i.test(line)) {
      reportSection = 'Vendas de cotas virtuais no MKP';
      reportKind = 'cotas';
      continue;
    }
    if (/^(TOTAL|MODAL|VALOR|COTAS|TERMINAL|OPERADOR|DATA|REV|CAIXA|VENDAS|RESUMO|TFL)/i.test(line)) continue;

    // Normalize common OCR confusions: | → 1
    const normalized = line.replace(/\|/g, '1');
    const match = normalized.match(/^(\+?[A-ZÀ-Ú][A-ZÀ-Ú0-9]*)(?:-([A-Z0-9-]+))?\s+(.+)$/i);
    if (!match) continue;
    const modality = match[1].toUpperCase().replace(/^\+/, '+');
    const contest = match[2]?.toUpperCase() ?? '';
    const parts = match[3].split(/\s+/).filter(Boolean);
    const values = parts.filter((part) => moneyPattern.test(part));
    const quantity = parts.find((part) => /^\d+(?:\/\d+)?$/.test(part)) ?? '';
    const hasContest = Boolean(contest);
    const isValidLine = reportKind === 'bolao' ? values.length >= 1 : hasContest && values.length >= 2;
    if (!isValidLine || !quantity) continue;

    let quotaToken: string;
    let feeToken: string;
    let percentage = 0;

    if (reportKind === 'bolao' && values.length >= 3) {
      // bolão com tarifa: valor_cotas, percentual, valor_tarifa
      quotaToken = values[values.length - 3];
      const pctToken = values[values.length - 2];
      feeToken = values[values.length - 1];
      percentage = amountFromText(pctToken);
    } else if (reportKind === 'bolao' && values.length < 3) {
      quotaToken = values[0];
      feeToken = '0,00';
      percentage = 0;
    } else {
      // cotas: valor_cotas, [percentual], valor_tarifa
      quotaToken = values[0];
      if (values.length >= 3) {
        const pctToken = values[1];
        feeToken = values[values.length - 1];
        percentage = amountFromText(pctToken);
      } else {
        feeToken = values[values.length - 1];
        percentage = 0;
      }
    }

    const quotaVal = amountFromText(quotaToken);
    const feeVal = amountFromText(feeToken);
    const product = products.find((item) => item.slug.toLowerCase().includes(modality.toLowerCase()) || item.name.toLowerCase().includes(modality.toLowerCase()));
    parsed.push({
      id: crypto.randomUUID(),
      modality,
      contest,
      quantity,
      quotaValue: `R$ ${formatBRL(quotaVal)}`,
      feePercentage: percentage > 0 ? percentage.toFixed(2).replace('.', ',') : '',
      feeValue: `R$ ${formatBRL(feeVal)}`,
      drawDate: defaultDate,
      productId: product?.id ?? '',
      slug: product?.slug ?? '',
      reportSection,
      reportKind,
      sourceLine: normalized,
      validated: checkFeeConsistency(quotaVal, percentage, feeVal),
    });
  }
  const compact = extractCompactReportItems(text, products, defaultDate);
  return compact.length > parsed.length ? compact : parsed;
}

/**
 * Compact global-regex fallback parser. Scans the entire OCR text for
 * patterns matching MODALIDADE-CONCURSO  COTAS  VALOR [VALOR [VALOR]]
 * without depending on correct line-by-line segmentation.
 */
function extractCompactReportItems(text: string, products: Product[], defaultDate: string): ReportItem[] {
  const money = '(?:\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2}|\\d+\\.\\d{2})';
  const rowPattern = new RegExp(`(\\+?[A-ZÀ-Ú][A-ZÀ-Ú0-9]*(?:-[A-Z0-9-]+)?)\\s+(\\d+(?:\\/\\d+)?)\\s+(${money}(?:\\s+${money}){0,2})`, 'gi');
  return Array.from(text.matchAll(rowPattern)).map((match) => {
    const modalityAndContest = match[1].toUpperCase();
    const [modality, ...contestParts] = modalityAndContest.split('-');
    const values = match[3].split(/\s+/).filter(Boolean);
    const reportKind: 'cotas' | 'bolao' = values.length >= 3 ? 'bolao' : 'cotas';
    let quotaToken: string;
    let feeToken: string;
    let percentage = 0;
    if (values.length >= 3) {
      quotaToken = values[0];
      percentage = amountFromText(values[1]);
      feeToken = values[2];
    } else if (values.length === 2) {
      quotaToken = values[0];
      feeToken = values[1];
    } else {
      quotaToken = values[0];
      feeToken = '0,00';
    }
    const quotaVal = amountFromText(quotaToken);
    const feeVal = amountFromText(feeToken);
    const product = products.find((item) => item.slug.toLowerCase().includes(modality.toLowerCase()) || item.name.toLowerCase().includes(modality.toLowerCase()));
    return {
      id: crypto.randomUUID(),
      modality,
      contest: contestParts.join('-'),
      quantity: match[2],
      quotaValue: `R$ ${formatBRL(quotaVal)}`,
      feePercentage: percentage > 0 ? percentage.toFixed(2).replace('.', ',') : '',
      feeValue: `R$ ${formatBRL(feeVal)}`,
      drawDate: defaultDate,
      productId: product?.id ?? '',
      slug: product?.slug ?? '',
      reportSection: '',
      reportKind,
      sourceLine: match[0].trim(),
      validated: checkFeeConsistency(quotaVal, percentage, feeVal),
    };
  });
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
    feePercentage: item.fee_percentage != null ? String(item.fee_percentage).replace('.', ',') : '',
    feeValue: feeValue ? `R$ ${formatBRL(feeValue)}` : '',
    drawDate: item.draw_date ?? todayStr(),
    productId: item.product_id ?? '',
    slug: item.slug ?? '',
    reportSection: item.report_section ?? '',
    reportKind: item.report_kind ?? 'cotas',
    sourceLine: item.source_line ?? '',
    validated: item.validated ?? false,
  };
}

function itemForSave(item: ReportItem): BolaoClosingItem {
  const shares = Number(item.quantity.split('/')[0]) || 0;
  const quotaValue = amountFromText(item.quotaValue);
  const feeValue = amountFromText(item.feeValue);
  const percentage = amountFromText(item.feePercentage);
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
    fee_percentage: percentage || undefined,
    draw_date: item.drawDate,
    validated: item.validated,
    report_section: item.reportSection,
    report_kind: item.reportKind,
    source_line: item.sourceLine,
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
  const [reportTotals, setReportTotals] = useState<{ quota: number; fee: number } | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'preprocessing' | 'reading' | 'done' | 'error'>('idle');
  const [ocrProgress, setOcrProgress] = useState('');
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
    setReportTotals(null);
    setOcrState('idle');
    setOcrProgress('');
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
    setReportTotals(null);
    setOcrState(closing.ocr_text ? 'done' : 'idle');
    setOcrProgress('');
    setError(null);
    setModalOpen(true);
  };

  const updateItem = (id: string, field: keyof ReportItem, value: string) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      const quota = amountFromText(updated.quotaValue);
      const fee = amountFromText(updated.feeValue);
      const pct = amountFromText(updated.feePercentage);
      updated.validated = pct > 0 ? checkFeeConsistency(quota, pct, fee) : false;
      return updated;
    }));
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

  /**
   * Full OCR pipeline:
   * 1. Pre-process each photo (upscale, grayscale, contrast, binarize) → 2 versions
   * 2. Run Tesseract on each version with two PSM modes (SINGLE_BLOCK + SPARSE_TEXT)
   * 3. Parse items from each result, keep the one that extracts the most game lines
   * 4. Accumulate across all files, extract printed TOTAL lines for verification
   */
  const runOcr = async (files: File[]) => {
    setOcrState('preprocessing');
    setOcrProgress('Preparando as imagens...');
    setError(null);
    try {
      const worker = await createWorker('por');
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
      const texts: string[] = [];
      const extracted: ReportItem[] = [];
      let quotaTotal = 0;
      let feeTotal = 0;
      let hasReportTotals = false;

      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        setOcrProgress(`Processando foto ${fi + 1} de ${files.length}...`);
        let preprocessed;
        try {
          preprocessed = await preprocessImage(file);
        } catch {
          // If preprocessing fails, fall back to the original image
          preprocessed = { grayscale: file, binarized: file };
        }

        let bestText = '';
        let bestItems: ReportItem[] = [];
        const versions = [
          { label: 'grayscale', file: preprocessed.grayscale },
          { label: 'binarized', file: preprocessed.binarized },
        ];
        for (const version of versions) {
          for (const pageMode of [PSM.SINGLE_BLOCK, PSM.SPARSE_TEXT]) {
            setOcrProgress(`Foto ${fi + 1}/${files.length} — ${version.label}, PSM ${pageMode}...`);
            await worker.setParameters({ tessedit_pageseg_mode: pageMode, preserve_interword_spaces: '1' });
            const result = await worker.recognize(version.file);
            const candidateText = result.data.text;
            const candidateItems = extractReportItems(candidateText, products);
            if (candidateItems.length > bestItems.length || (candidateItems.length === bestItems.length && candidateText.length > bestText.length)) {
              bestText = candidateText;
              bestItems = candidateItems;
            }
          }
        }
        texts.push(bestText);
        extracted.push(...bestItems);
        const totals = extractReportTotals(bestText);
        if (totals) {
          quotaTotal += totals.quota;
          feeTotal += totals.fee;
          hasReportTotals = true;
        }
      }

      await worker.terminate();
      setSourceName(files.map((file) => file.name).join(', '));
      setOcrText(texts.join('\n\n--- PRÓXIMA FOTO ---\n\n'));
      setReportTotals(hasReportTotals ? { quota: quotaTotal, fee: feeTotal } : null);
      setItems(extracted.length ? extracted : [emptyItem(dateFromReport(texts[0] ?? ''))]);
      setOcrState('done');
      setOcrProgress('');
      if (!extracted.length) setError('As fotos foram lidas, mas nenhuma linha reconhecível foi encontrada. Confira as imagens ou inclua as linhas manualmente.');
    } catch {
      setOcrState('error');
      setOcrProgress('');
      setError('Não foi possível ler uma das fotos. Tente imagens mais nítidas e bem iluminadas.');
    }
  };

  const savedItems = useMemo(() => items.map(itemForSave).filter((item) => item.product_name && item.quantity && item.draw_date), [items]);
  const totalQuantity = savedItems.reduce((sum, item) => sum + (Number(item.quantity?.split('/')[0]) || 0), 0);
  const totalQuota = savedItems.reduce((sum, item) => sum + Number(item.quota_value ?? 0), 0);
  const totalFee = savedItems.reduce((sum, item) => sum + Number(item.fee_value ?? 0), 0);
  const totalValue = totalQuota + totalFee;
  const totalsMatch = !reportTotals || (Math.abs(totalQuota - reportTotals.quota) < 0.01 && Math.abs(totalFee - reportTotals.fee) < 0.01);
  const invalidCount = savedItems.filter((item) => {
    if (item.fee_percentage && item.fee_percentage > 0) {
      return !checkFeeConsistency(Number(item.quota_value ?? 0), item.fee_percentage, Number(item.fee_value ?? 0));
    }
    return false;
  }).length;

  const save = async () => {
    if (saving) return;
    if (!savedItems.length) { setError('Inclua pelo menos uma linha completa do relatório.'); return; }
    if (savedItems.some((item) => !item.draw_date)) { setError('Informe a data do sorteio em todas as linhas.'); return; }
    if (!totalsMatch) { setError('A soma das linhas ainda não bate com o total impresso no relatório. Revise todas as linhas antes de salvar.'); return; }
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
            {expanded && <div className="border-t border-slate-100 p-4 space-y-4"><div className="overflow-x-auto border border-slate-100 rounded-lg"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50"><th className="px-4 py-2">Modalidade/concurso</th><th className="px-4 py-2 text-right">Quantidade</th><th className="px-4 py-2 text-right">Valor cotas</th><th className="px-4 py-2 text-right">% Tarifa</th><th className="px-4 py-2 text-right">Valor tarifa</th><th className="px-4 py-2">Data sorteio</th><th className="px-4 py-2 text-center">Conf.</th></tr></thead><tbody>{(closing.items ?? []).map((item) => { const normalized = itemFromStored(item); return <tr key={item.id} className="border-b border-slate-50"><td className="px-4 py-2 font-medium text-slate-900">{normalized.modality}{normalized.contest ? `-${normalized.contest}` : ''}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.quantity}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.quotaValue || 'R$ 0,00'}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.feePercentage ? `${normalized.feePercentage}%` : '—'}</td><td className="px-4 py-2 text-right text-slate-600">{normalized.feeValue || 'R$ 0,00'}</td><td className="px-4 py-2 text-slate-600">{formatDateBR(normalized.drawDate)}</td><td className="px-4 py-2 text-center">{normalized.validated ? <CheckCircle2 size={15} className="text-emerald-600 inline" /> : normalized.feePercentage ? <XCircle size={15} className="text-red-500 inline" /> : <span className="text-slate-300">—</span>}</td></tr>; })}</tbody></table></div>{closing.source_report_name && <p className="text-xs text-slate-400">Relatório processado: {closing.source_report_name}</p>}{closing.notes && <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3"><strong>Observações:</strong> {closing.notes}</p>}{canEdit && <div className="flex items-center justify-end gap-2"><Button size="sm" variant="secondary" onClick={() => toggleStatus(closing)}>{closing.status === 'closed' ? <><Unlock size={14} /> Reabrir</> : <><Lock size={14} /> Fechar</>}</Button><Button size="sm" variant="secondary" onClick={() => openEdit(closing)}>Editar linhas</Button><Button size="sm" variant="danger" onClick={() => removeClosing(closing)}><Trash2 size={14} /> Excluir</Button></div>}</div>}
          </Card>;
        })}
      </div>}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Conferir fechamento' : 'Novo fechamento por relatório'} maxWidth="max-w-6xl">
        <div className="space-y-5">
          <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"><div><p className="font-semibold text-brand-950">1. Fotografe ou envie o relatório</p><p className="text-sm text-brand-700 mt-1">A imagem é ampliada, convertida para tons de cinza e binarizada automaticamente antes da leitura. Depois confira todas as linhas.</p></div><label className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-medium cursor-pointer"><Upload size={17} /> {(ocrState === 'preprocessing' || ocrState === 'reading') ? 'Processando...' : 'Escolher fotos'}<input type="file" accept="image/*" capture="environment" multiple className="sr-only" disabled={ocrState === 'preprocessing' || ocrState === 'reading'} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void runOcr(files); event.currentTarget.value = ''; }} /></label></div>
          {(ocrState === 'preprocessing' || ocrState === 'reading') && <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><Spinner className="text-brand-600" /> {ocrProgress || 'Analisando as fotos...'}</div>}
          {ocrState === 'done' && <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle2 size={17} /> Relatório lido. Confira os valores, percentuais e datas de sorteio abaixo.</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><Input label="Data do fechamento" type="date" value={formDate} onChange={setFormDate} required />{canManageAll ? <Select label="Operador" value={formOperatorId} onChange={setFormOperatorId} options={operators.map((operator) => ({ value: operator.id, label: operator.name }))} placeholder="Selecione o operador" required /> : <div><span className="block text-sm font-medium text-slate-700 mb-1.5">Operador</span><p className="text-sm font-medium text-slate-900 bg-slate-50 rounded-lg px-3 py-2">{profile?.name}</p></div>}</div>

          <div><div className="flex items-center justify-between mb-2"><div><p className="font-semibold text-slate-900">2. Confira as linhas extraídas</p><p className="text-xs text-slate-500 mt-1">A data do sorteio é obrigatória e pode ser diferente em cada linha. O percentual e o valor da tarifa são conferidos automaticamente.</p></div><Button size="sm" variant="secondary" onClick={() => setItems((current) => [...current, emptyItem(formDate)])}><Plus size={14} /> Adicionar linha</Button></div><div className="space-y-3">{items.map((item, index) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end"><label className="md:col-span-2 text-[11px] text-slate-500">Modalidade/concurso<input value={`${item.modality}${item.contest ? `-${item.contest}` : ''}`} onChange={(event) => { const [modality, ...contest] = event.target.value.split('-'); setItems((current) => current.map((row) => row.id === item.id ? { ...row, modality, contest: contest.join('-') } : row)); }} placeholder="FACIL-3800" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-1 text-[11px] text-slate-500">Quantidade<input value={item.quantity} onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} placeholder="6 ou 6/2" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Valor cotas<input value={item.quotaValue} onChange={(event) => updateItem(item.id, 'quotaValue', event.target.value)} placeholder="R$ 0,00" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-1 text-[11px] text-slate-500">% Tarifa<input value={item.feePercentage} onChange={(event) => updateItem(item.id, 'feePercentage', event.target.value)} placeholder="35,00" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Valor tarifa<input value={item.feeValue} onChange={(event) => updateItem(item.id, 'feeValue', event.target.value)} placeholder="R$ 0,00" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><label className="md:col-span-2 text-[11px] text-slate-500">Data sorteio<input type="date" value={item.drawDate} onChange={(event) => updateItem(item.id, 'drawDate', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" /></label><div className="md:col-span-1 flex items-center justify-center gap-1 pb-2">{item.validated ? <span title="Tarifa conferida" className="inline-flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 size={15} /> OK</span> : item.feePercentage ? <span title="Tarifa não bate com o percentual" className="inline-flex items-center gap-1 text-red-500 text-xs"><XCircle size={15} /> Dif</span> : null}<button className="p-1 text-slate-400 hover:text-red-600" title={`Remover linha ${index + 1}`} onClick={() => setItems((current) => current.length > 1 ? current.filter((row) => row.id !== item.id) : current)}><Trash2 size={17} /></button></div></div><div className="mt-2 flex items-center gap-2"><select value={item.productId} onChange={(event) => selectProduct(item.id, event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600"><option value="">Vincular ao produto cadastrado (opcional)</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><span className="text-xs text-slate-400">Linha {index + 1}</span></div></div>)}</div></div>

          <div className="rounded-xl bg-brand-50 p-4 flex flex-wrap gap-5 text-sm"><span className="text-slate-700">Quantidade: <strong className="text-brand-950">{totalQuantity}</strong></span><span className="text-slate-700">Valor cotas: <strong className="text-brand-700">R$ {formatBRL(totalQuota)}</strong></span><span className="text-slate-700">Tarifas: <strong className="text-emerald-700">R$ {formatBRL(totalFee)}</strong></span><span className="text-slate-700">Total: <strong className="text-brand-950">R$ {formatBRL(totalValue)}</strong></span></div>
          {invalidCount > 0 && <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700"><AlertTriangle size={17} /> {invalidCount} linha(s) com tarifa não conferida. Revise o percentual ou o valor da tarifa antes de salvar.</div>}
          {reportTotals && <div className={`rounded-lg p-3 text-sm ${totalsMatch ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><strong>{totalsMatch ? 'Conferência aprovada:' : 'Atenção:'}</strong> soma das linhas — cotas R$ {formatBRL(totalQuota)} e tarifas R$ {formatBRL(totalFee)}; relatório — cotas R$ {formatBRL(reportTotals.quota)} e tarifas R$ {formatBRL(reportTotals.fee)}.{!totalsMatch && ' Corrija as linhas destacadas pela leitura antes de salvar.'}</div>}
          <Input label="Observações" value={notes} onChange={setNotes} placeholder="Notas adicionais" />
          <Select label="Status" value={status} onChange={(value) => setStatus(value as 'open' | 'closed')} options={[{ value: 'open', label: 'Aberto' }, { value: 'closed', label: 'Fechado' }]} />
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button onClick={save} disabled={saving || ocrState === 'preprocessing' || ocrState === 'reading' || !totalsMatch}>{saving ? 'Salvando...' : 'Salvar fechamento'}</Button></div>
        </div>
      </Modal>
    </div>
  );
}
