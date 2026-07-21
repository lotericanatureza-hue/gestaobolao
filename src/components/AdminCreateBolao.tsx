import { useEffect, useState, useCallback } from 'react';
import { Ticket, Plus, Store, Calendar, Clock, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Spinner, EmptyState, Badge, Modal } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import { STATUS_LABELS } from '../lib/bolaoKpis';
import type { Branch, BranchProduct, Bolao } from '../lib/types';

const DEFAULT_DRAW_TIME = '20:00';

export function AdminCreateBolao() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [availableProducts, setAvailableProducts] = useState<BranchProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState('');
  const [contestNumber, setContestNumber] = useState('');
  const [dezenas, setDezenas] = useState(6);
  const [jogos, setJogos] = useState(1);
  const [price, setPrice] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);
  const [drawDate, setDrawDate] = useState('');
  const [drawTime, setDrawTime] = useState(DEFAULT_DRAW_TIME);
  const [totalShares, setTotalShares] = useState(1);
  const [notes, setNotes] = useState('');

  const [recentBoloes, setRecentBoloes] = useState<Bolao[]>([]);

  const [editing, setEditing] = useState<Bolao | null>(null);
  const [editContestNumber, setEditContestNumber] = useState('');
  const [editDezenas, setEditDezenas] = useState(6);
  const [editJogos, setEditJogos] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editFee, setEditFee] = useState(0);
  const [editDrawDate, setEditDrawDate] = useState('');
  const [editDrawTime, setEditDrawTime] = useState(DEFAULT_DRAW_TIME);
  const [editTotalShares, setEditTotalShares] = useState(1);
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    const { data } = await supabase.from('branches').select('*').order('name');
    const list = (data ?? []) as Branch[];
    setBranches(list);
    if (!branchId && list.length > 0) setBranchId(list[0].id);
  }, [branchId]);

  const fetchProductsForBranch = useCallback(async () => {
    if (!branchId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('branch_products')
      .select('*, product:products(*)')
      .eq('branch_id', branchId)
      .eq('active', true);
    const items = (data ?? []) as BranchProduct[];
    setAvailableProducts(items);
    if (items.length > 0) {
      const first = items[0];
      setProductId(first.product_id);
      setDezenas(first.product?.min_dezenas ?? 6);
      setPrice(first.custom_price ?? Number(first.product?.base_price ?? 0));
      setServiceFee(first.custom_service_fee ?? Number(first.product?.service_fee ?? 0));
      setDrawTime(first.product?.default_draw_time?.slice(0, 5) ?? DEFAULT_DRAW_TIME);
    } else {
      setProductId('');
    }
    setLoading(false);
  }, [branchId]);

  const fetchRecentBoloes = useCallback(async () => {
    if (!branchId) return;
    const { data } = await supabase
      .from('boloes')
      .select('*, product:products(*)')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentBoloes((data ?? []) as Bolao[]);
  }, [branchId]);

  useEffect(() => { fetchBranches(); }, [fetchBranches]);
  useEffect(() => { fetchProductsForBranch(); fetchRecentBoloes(); }, [fetchProductsForBranch, fetchRecentBoloes]);

  const selectedProduct = availableProducts.find((bp) => bp.product_id === productId)?.product;

  const onProductChange = (id: string) => {
    setProductId(id);
    const bp = availableProducts.find((bp) => bp.product_id === id);
    if (bp?.product) {
      setDezenas(bp.product.min_dezenas);
      setPrice(bp.custom_price ?? Number(bp.product.base_price));
      setServiceFee(bp.custom_service_fee ?? Number(bp.product.service_fee));
      setDrawTime(bp.product.default_draw_time?.slice(0, 5) ?? DEFAULT_DRAW_TIME);
    }
  };

  const openEdit = (b: Bolao) => {
    setEditing(b);
    setEditContestNumber(b.contest_number);
    setEditDezenas(b.dezenas);
    setEditJogos(b.jogos);
    setEditPrice(Number(b.price));
    setEditFee(Number(b.service_fee));
    setEditDrawDate(b.draw_date);
    setEditDrawTime(b.draw_time?.slice(0, 5) ?? DEFAULT_DRAW_TIME);
    setEditTotalShares(b.total_shares);
    setEditNotes(b.notes ?? '');
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    setEditError(null);
    const { error: updateError } = await supabase.from('boloes').update({
      contest_number: editContestNumber.trim(),
      dezenas: Number(editDezenas),
      jogos: Number(editJogos),
      price: Number(editPrice),
      service_fee: Number(editFee),
      draw_date: editDrawDate,
      draw_time: `${editDrawTime}:00`,
      total_shares: Number(editTotalShares),
      notes: editNotes.trim() || null,
    }).eq('id', editing.id);
    setEditSaving(false);
    if (updateError) {
      // O banco recusa reduzir total_shares abaixo do que já foi alocado
      // a operadores (trigger trg_check_bolao_total_shares_reduction).
      setEditError(updateError.message);
      return;
    }
    setEditing(null);
    fetchRecentBoloes();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!branchId) { setError('Selecione uma filial.'); return; }
    if (!productId) { setError('Selecione um produto.'); return; }
    if (!contestNumber.trim()) { setError('Informe o número do concurso.'); return; }
    if (!drawDate) { setError('Informe a data do sorteio.'); return; }
    if (!drawTime) { setError('Informe o horário do sorteio.'); return; }

    const product = selectedProduct;
    if (product && (dezenas < product.min_dezenas || dezenas > product.max_dezenas)) {
      setError(`Dezenas deve estar entre ${product.min_dezenas} e ${product.max_dezenas} para ${product.name}.`);
      return;
    }

    setSaving(true);
    // Sem operator_id: o bolão nasce sem dono. A distribuição de cotas entre
    // operadores acontece depois, na tela de Alocação de Bolões.
    const { error: insertError } = await supabase.from('boloes').insert({
      branch_id: branchId,
      product_id: productId,
      operator_id: null,
      contest_number: contestNumber.trim(),
      dezenas: Number(dezenas),
      jogos: Number(jogos),
      price: Number(price),
      service_fee: Number(serviceFee),
      draw_date: drawDate,
      draw_time: `${drawTime}:00`,
      total_shares: Number(totalShares),
      sold_shares: 0,
      status: 'pending',
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setContestNumber('');
    setNotes('');
    setTotalShares(1);
    setJogos(1);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
    fetchRecentBoloes();
  };

  return (
    <div>
      <PageHeader title="Criar Bolão" subtitle="Crie o bolão pela filial — a distribuição de cotas entre operadores é feita depois, em Alocação de Bolões" />

      {/* Branch selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setBranchId(b.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              branchId === b.id
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            <Store size={16} /> {b.name}
          </button>
        ))}
      </div>

      {success && (
        <div className="mb-4 bg-brand-50 border border-brand-200 rounded-lg p-4 flex items-center gap-2 text-brand-700">
          <Ticket size={20} />
          <span className="font-medium">Bolão criado com sucesso! Vá em "Alocação de Bolões" para distribuir as cotas.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>
      ) : availableProducts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Ticket size={48} />}
            title="Nenhum produto disponível para esta filial"
            description="Aloque produtos para esta filial na tela de Alocação de Produtos antes de criar bolões."
          />
        </Card>
      ) : (
        <Card className="p-6 max-w-2xl mb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Select
              label="Produto *"
              value={productId}
              onChange={onProductChange}
              options={availableProducts.map((bp) => ({ value: bp.product_id, label: bp.product?.name ?? '—' }))}
              placeholder="Selecione um produto"
              required
            />

            {selectedProduct && (
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 flex flex-wrap items-center gap-4">
                <LotteryIcon slug={selectedProduct.slug} size={28} />
                <span>Dezenas: {selectedProduct.min_dezenas} a {selectedProduct.max_dezenas}</span>
                <span>Sorteio: {selectedProduct.draw_frequency ?? '—'}</span>
                <span>Horário padrão: {selectedProduct.default_draw_time?.slice(0, 5) ?? '—'}</span>
                <span>Preço base: R$ {Number(selectedProduct.base_price).toFixed(2)}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Número do concurso *" value={contestNumber} onChange={setContestNumber} placeholder="Ex: 2500" required />
              <Input label="Total de cotas *" type="number" value={totalShares} onChange={(v) => setTotalShares(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Data do sorteio *" type="date" value={drawDate} onChange={setDrawDate} required />
              <Input label="Horário do sorteio *" type="time" value={drawTime} onChange={setDrawTime} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantidade de dezenas *"
                type="number"
                value={dezenas}
                onChange={(v) => setDezenas(Number(v))}
                min={selectedProduct?.min_dezenas?.toString() ?? '1'}
                max={selectedProduct?.max_dezenas?.toString() ?? '100'}
                required
              />
              <Input label="Quantidade de jogos *" type="number" value={jogos} onChange={(v) => setJogos(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço da cota (R$) *" type="number" step="0.01" value={price} onChange={(v) => setPrice(Number(v))} min={0} required />
              <Input label="Comissão por cota (R$) *" type="number" step="0.01" value={serviceFee} onChange={(v) => setServiceFee(Number(v))} min={0} required />
            </div>

            <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-6 gap-y-1">
              <span>Valor da cota: <strong>R$ {(Number(price) + Number(serviceFee)).toFixed(2)}</strong></span>
              <span>Comissão total ({totalShares} cotas): <strong>R$ {(Number(serviceFee) * totalShares).toFixed(2)}</strong></span>
              <span>Loterica (70%): <strong>R$ {(Number(serviceFee) * totalShares * 0.7).toFixed(2)}</strong></span>
              <span>Operador (30%): <strong>R$ {(Number(serviceFee) * totalShares * 0.3).toFixed(2)}</strong></span>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Informações adicionais sobre o bolão..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
              />
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="text-sm text-slate-500">
                Total do bolão ({totalShares} cotas): <span className="font-bold text-slate-900">R$ {((Number(price) + Number(serviceFee)) * totalShares).toFixed(2)}</span>
              </div>
              <Button type="submit" size="lg" disabled={saving}>
                <Plus size={18} /> {saving ? 'Criando...' : 'Criar Bolão'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Recent bolões for this branch, so admin knows what's pending allocation */}
      <div>
        <h2 className="text-lg font-semibold text-brand-950 mb-4 flex items-center gap-2">
          <Calendar size={20} /> Bolões recentes desta filial
        </h2>
        {recentBoloes.length === 0 ? (
          <Card>
            <EmptyState icon={<Ticket size={48} />} title="Nenhum bolão criado ainda" description="Os bolões criados aparecerão aqui." />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-50">
              {recentBoloes.map((b) => {
                const statusInfo = STATUS_LABELS[b.status];
                return (
                  <div key={b.id} className="px-5 py-3 flex items-center gap-3">
                    <LotteryIcon slug={b.product?.slug ?? ''} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm">{b.product?.name ?? '—'}</span>
                        <span className="text-xs text-slate-400">Concurso {b.contest_number}</span>
                        <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                        <span>{b.jogos} jogo(s) de {b.dezenas} dezenas</span>
                        <span>{b.sold_shares}/{b.total_shares} cotas vendidas</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {new Date(b.draw_date).toLocaleDateString('pt-BR')} às {b.draw_time?.slice(0, 5)}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                      <Pencil size={14} /> Editar
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar Bolão">
        {editing && (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-3">
              <LotteryIcon slug={editing.product?.slug ?? ''} size={32} />
              <div>
                <p className="font-semibold text-brand-950">{editing.product?.name}</p>
                <p className="text-xs text-slate-400">Concurso {editing.contest_number}</p>
              </div>
            </div>

            {(editing.status === 'sold' || editing.status === 'encalhado') && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
                Este bolão já está {editing.status === 'sold' ? 'totalmente vendido' : 'encalhado'}. Você ainda pode corrigir dados de cadastro, mas tenha cuidado ao mudar o total de cotas.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Input label="Número do concurso *" value={editContestNumber} onChange={setEditContestNumber} required />
              <Input label="Total de cotas *" type="number" value={editTotalShares} onChange={(v) => setEditTotalShares(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Data do sorteio *" type="date" value={editDrawDate} onChange={setEditDrawDate} required />
              <Input label="Horário do sorteio *" type="time" value={editDrawTime} onChange={setEditDrawTime} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantidade de dezenas *" type="number" value={editDezenas} onChange={(v) => setEditDezenas(Number(v))} min={1} required />
              <Input label="Quantidade de jogos *" type="number" value={editJogos} onChange={(v) => setEditJogos(Number(v))} min={1} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço da cota (R$) *" type="number" step="0.01" value={editPrice} onChange={(v) => setEditPrice(Number(v))} min={0} required />
              <Input label="Comissão por cota (R$) *" type="number" step="0.01" value={editFee} onChange={(v) => setEditFee(Number(v))} min={0} required />
            </div>

            <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-6 gap-y-1">
              <span>Total do bolão ({editTotalShares} cotas): <strong>R$ {((Number(editPrice) + Number(editFee)) * editTotalShares).toFixed(2)}</strong></span>
              <span>Comissão total: <strong>R$ {(Number(editFee) * editTotalShares).toFixed(2)}</strong></span>
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
              />
            </label>

            {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{editError}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={saveEdit} disabled={editSaving}>{editSaving ? 'Salvando...' : 'Salvar'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
