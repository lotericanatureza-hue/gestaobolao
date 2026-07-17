import { useEffect, useState, useCallback } from 'react';
import { Ticket, Plus, Info, Pencil, Check, X, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Spinner, EmptyState, Badge, Modal } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { BranchProduct, Bolao } from '../lib/types';

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface MonthGroup {
  key: string;
  label: string;
  boloes: Bolao[];
}

function groupByMonth(boloes: Bolao[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const b of boloes) {
    const d = new Date(b.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { key, label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, boloes: [] });
    }
    map.get(key)!.boloes.push(b);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

const statusBadge = (status: string) => {
  if (status === 'sold') return <Badge color="green">Vendido</Badge>;
  if (status === 'partial') return <Badge color="amber">Parcial</Badge>;
  return <Badge color="red">Encalhado</Badge>;
};

export function OperatorCreate() {
  const { profile } = useAuth();
  const [availableProducts, setAvailableProducts] = useState<BranchProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [productId, setProductId] = useState('');
  const [contestNumber, setContestNumber] = useState('');
  const [dezenas, setDezenas] = useState(6);
  const [price, setPrice] = useState(0);
  const [serviceFee, setServiceFee] = useState(0);
  const [drawDate, setDrawDate] = useState('');
  const [totalShares, setTotalShares] = useState(1);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [myBoloes, setMyBoloes] = useState<Bolao[]>([]);
  const [editing, setEditing] = useState<Bolao | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editFee, setEditFee] = useState(0);
  const [editShares, setEditShares] = useState(1);
  const [editSold, setEditSold] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchBoloes = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('boloes')
      .select('*, product:products(*), branch:branches(*)')
      .eq('operator_id', profile.id)
      .order('created_at', { ascending: false });
    setMyBoloes((data ?? []) as Bolao[]);
  }, [profile]);

  useEffect(() => {
    (async () => {
      if (!profile?.branch_id) { setLoading(false); return; }
      const { data } = await supabase
        .from('branch_products')
        .select('*, product:products(*)')
        .eq('branch_id', profile.branch_id)
        .eq('active', true);
      const items = (data ?? []) as BranchProduct[];
      setAvailableProducts(items);
      if (items.length > 0) {
        const first = items[0];
        setProductId(first.product_id);
        setDezenas(first.product?.min_dezenas ?? 6);
        setPrice(first.custom_price ?? Number(first.product?.base_price ?? 0));
        setServiceFee(first.custom_service_fee ?? Number(first.product?.service_fee ?? 0));
      }
      setLoading(false);
    })();
    fetchBoloes();

    const channel = supabase
      .channel('operator-create-boloes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boloes' }, () => fetchBoloes())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchBoloes]);

  const selectedProduct = availableProducts.find((bp) => bp.product_id === productId)?.product;

  const onProductChange = (id: string) => {
    setProductId(id);
    const bp = availableProducts.find((bp) => bp.product_id === id);
    if (bp?.product) {
      setDezenas(bp.product.min_dezenas);
      setPrice(bp.custom_price ?? Number(bp.product.base_price));
      setServiceFee(bp.custom_service_fee ?? Number(bp.product.service_fee));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!profile?.branch_id) { setError('Você não está alocado em nenhuma filial.'); return; }
    if (!productId) { setError('Selecione um produto.'); return; }
    if (!contestNumber.trim()) { setError('Informe o número do concurso.'); return; }
    if (!drawDate) { setError('Informe a data do sorteio.'); return; }

    const product = selectedProduct;
    if (product && (dezenas < product.min_dezenas || dezenas > product.max_dezenas)) {
      setError(`Dezenas deve estar entre ${product.min_dezenas} e ${product.max_dezenas} para ${product.name}.`);
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('boloes').insert({
      branch_id: profile.branch_id,
      product_id: productId,
      operator_id: profile.id,
      contest_number: contestNumber.trim(),
      dezenas: Number(dezenas),
      price: Number(price),
      service_fee: Number(serviceFee),
      draw_date: drawDate,
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
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  const openEdit = (b: Bolao) => {
    setEditing(b);
    setEditPrice(Number(b.price));
    setEditFee(Number(b.service_fee));
    setEditShares(b.total_shares);
    setEditSold(b.sold_shares);
    setEditNotes(b.notes ?? '');
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    const sold = Math.min(editSold, editShares);
    let status: 'pending' | 'partial' | 'sold' = 'pending';
    if (sold >= editShares) status = 'sold';
    else if (sold > 0) status = 'partial';
    await supabase.from('boloes').update({
      price: Number(editPrice),
      service_fee: Number(editFee),
      total_shares: Number(editShares),
      sold_shares: sold,
      status,
      notes: editNotes.trim() || null,
    }).eq('id', editing.id);
    setEditSaving(false);
    setEditing(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  if (!profile?.branch_id) {
    return (
      <div>
        <PageHeader title="Criar Bolão" />
        <Card>
          <EmptyState
            icon={<Info size={48} />}
            title="Você não está alocado em nenhuma filial"
            description="Solicite ao administrador que aloque você em uma filial para começar a criar bolões."
          />
        </Card>
      </div>
    );
  }

  if (availableProducts.length === 0) {
    return (
      <div>
        <PageHeader title="Criar Bolão" />
        <Card>
          <EmptyState
            icon={<Ticket size={48} />}
            title="Nenhum produto disponível"
            description="Sua filial não tem produtos alocados. Solicite ao administrador que aloque produtos para sua filial."
          />
        </Card>
      </div>
    );
  }

  const monthGroups = groupByMonth(myBoloes);

  return (
    <div>
      <PageHeader title="Criar Bolão" subtitle={`Filial: ${profile?.name ?? ''}`} />

      {success && (
        <div className="mb-4 bg-brand-50 border border-brand-200 rounded-lg p-4 flex items-center gap-2 text-brand-700">
          <Ticket size={20} />
          <span className="font-medium">Bolão criado com sucesso!</span>
        </div>
      )}

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
              <span>Preço base: R$ {Number(selectedProduct.base_price).toFixed(2)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Número do concurso *" value={contestNumber} onChange={setContestNumber} placeholder="Ex: 2500" required />
            <Input label="Data do sorteio *" type="date" value={drawDate} onChange={setDrawDate} required />
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
            <Input
              label="Total de cotas *"
              type="number"
              value={totalShares}
              onChange={(v) => setTotalShares(Number(v))}
              min={1}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Preço do bolão (R$) *" type="number" step="0.01" value={price} onChange={(v) => setPrice(Number(v))} min={0} required />
            <Input label="Comissão / Taxa de serviço (R$) *" type="number" step="0.01" value={serviceFee} onChange={(v) => setServiceFee(Number(v))} min={0} required />
          </div>

          <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-6 gap-y-1">
            <span>Comissão total: <strong>R$ {Number(serviceFee).toFixed(2)}</strong></span>
            <span>Loterica (70%): <strong>R$ {(Number(serviceFee) * 0.7).toFixed(2)}</strong></span>
            <span>Operador (30%): <strong>R$ {(Number(serviceFee) * 0.3).toFixed(2)}</strong></span>
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
              Total do bolão: <span className="font-bold text-slate-900">R$ {(Number(price) + Number(serviceFee)).toFixed(2)}</span>
            </div>
            <Button type="submit" size="lg" disabled={saving}>
              <Plus size={18} /> {saving ? 'Criando...' : 'Criar Bolão'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Monthly list of created bolões */}
      <div>
        <h2 className="text-lg font-semibold text-brand-950 mb-4 flex items-center gap-2">
          <Calendar size={20} /> Bolões Criados por Mês
        </h2>

        {monthGroups.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Ticket size={48} />}
              title="Nenhum bolão criado ainda"
              description="Seus bolões criados aparecerão aqui agrupados por mês."
            />
          </Card>
        ) : (
          <div className="space-y-6">
            {monthGroups.map((group) => {
              const totalValue = group.boloes.reduce((s, b) => s + Number(b.price) + Number(b.service_fee), 0);
              const totalCommission = group.boloes.reduce((s, b) => s + Number(b.service_fee), 0);
              const operatorCommission = totalCommission * 0.3;
              const lotericaCommission = totalCommission * 0.7;
              const soldShares = group.boloes.reduce((s, b) => s + b.sold_shares, 0);
              const unsoldShares = group.boloes.reduce((s, b) => s + (b.total_shares - b.sold_shares), 0);

              return (
                <Card key={group.key} className="overflow-hidden">
                  <div className="px-5 py-3 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-brand-900">{group.label}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-700">
                      <span>{group.boloes.length} bolões</span>
                      <span>Total: <strong>R$ {totalValue.toFixed(2)}</strong></span>
                      <span>Comissão: <strong>R$ {totalCommission.toFixed(2)}</strong></span>
                      <span>Operador: <strong>R$ {operatorCommission.toFixed(2)}</strong></span>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {group.boloes.map((b) => {
                      const shareVal = b.total_shares > 0 ? (Number(b.price) + Number(b.service_fee)) / b.total_shares : 0;
                      const pct = b.total_shares > 0 ? Math.round((b.sold_shares / b.total_shares) * 100) : 0;
                      return (
                        <div key={b.id} className="px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3">
                          <LotteryIcon slug={b.product?.slug ?? ''} size={32} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-slate-900 text-sm">{b.product?.name ?? '—'}</span>
                              <span className="text-xs text-slate-400">Concurso {b.contest_number}</span>
                              {statusBadge(b.status)}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                              <span>R$ {Number(b.price).toFixed(2)} + R$ {Number(b.service_fee).toFixed(2)} comissão</span>
                              <span>{b.sold_shares}/{b.total_shares} cotas</span>
                              <span>{new Date(b.draw_date).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openEdit(b)}>
                              <Pencil size={14} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
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
                <p className="text-xs text-slate-400">Concurso {editing.contest_number} · Sorteio {new Date(editing.draw_date).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Preço do bolão (R$)" type="number" step="0.01" value={editPrice} onChange={(v) => setEditPrice(Number(v))} min={0} />
              <Input label="Comissão / Taxa (R$)" type="number" step="0.01" value={editFee} onChange={(v) => setEditFee(Number(v))} min={0} />
            </div>

            <div className="bg-brand-50 rounded-lg p-3 text-xs text-brand-700 flex flex-wrap gap-x-4 gap-y-1">
              <span>Comissão total: <strong>R$ {Number(editFee).toFixed(2)}</strong></span>
              <span>Loterica (70%): <strong>R$ {(Number(editFee) * 0.7).toFixed(2)}</strong></span>
              <span>Operador (30%): <strong>R$ {(Number(editFee) * 0.3).toFixed(2)}</strong></span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Total de cotas" type="number" value={editShares} onChange={(v) => setEditShares(Number(v))} min={1} />
              <Input label="Cotas vendidas" type="number" value={editSold} onChange={(v) => setEditSold(Number(v))} min={0} />
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all"
              />
            </label>

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
