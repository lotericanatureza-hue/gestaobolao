import { useEffect, useState } from 'react';
import { Ticket, Plus, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Spinner, EmptyState } from './ui';
import type { BranchProduct } from '../lib/types';

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
  }, [profile]);

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
    // Reset
    setContestNumber('');
    setNotes('');
    setTotalShares(1);
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-emerald-500" /></div>;
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

  return (
    <div>
      <PageHeader title="Criar Bolão" subtitle={`Filial: ${profile?.name ?? ''}`} />

      {success && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-2 text-emerald-700">
          <Ticket size={20} />
          <span className="font-medium">Bolão criado com sucesso!</span>
        </div>
      )}

      <Card className="p-6 max-w-2xl">
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
            <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 flex flex-wrap gap-4">
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
            <Input label="Preço (R$) *" type="number" step="0.01" value={price} onChange={(v) => setPrice(Number(v))} min={0} required />
            <Input label="Taxa de serviço (R$) *" type="number" step="0.01" value={serviceFee} onChange={(v) => setServiceFee(Number(v))} min={0} required />
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1.5">Observações</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Informações adicionais sobre o bolão..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
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
    </div>
  );
}
