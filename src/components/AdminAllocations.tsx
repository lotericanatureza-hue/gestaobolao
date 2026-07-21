import { useEffect, useState, useCallback } from 'react';
import { Store, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Input, Button, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Branch, Product, BranchProduct } from '../lib/types';

export function AdminAllocations() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<BranchProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    const { data } = await supabase.from('branches').select('*').order('name');
    const list = (data ?? []) as Branch[];
    setBranches(list);
    if (!selectedBranch && list.length > 0) {
      setSelectedBranch(list[0].id);
    }
  }, [selectedBranch]);

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase.from('products').select('*').order('name');
    setProducts((data ?? []) as Product[]);
  }, []);

  const fetchAllocations = useCallback(async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('branch_products')
      .select('*, product:products(*)')
      .eq('branch_id', selectedBranch);
    setAllocations((data ?? []) as BranchProduct[]);
    setLoading(false);
  }, [selectedBranch]);

  useEffect(() => { fetchBranches(); fetchProducts(); }, [fetchBranches, fetchProducts]);
  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const getAllocation = (productId: string) =>
    allocations.find((a) => a.product_id === productId);

  const toggleProduct = async (product: Product, active: boolean) => {
    const key = product.id;
    setSavingKey(key);
    setError(null);
    const existing = getAllocation(product.id);
    if (existing) {
      const { error: updateError } = await supabase
        .from('branch_products')
        .update({ active })
        .eq('id', existing.id);
      if (updateError) { setError(updateError.message); setSavingKey(null); return; }
    } else {
      const { error: insertError } = await supabase
        .from('branch_products')
        .insert({
          branch_id: selectedBranch,
          product_id: product.id,
          custom_price: null,
          custom_service_fee: null,
          active,
        });
      if (insertError) { setError(insertError.message); setSavingKey(null); return; }
    }
    setSavingKey(null);
    fetchAllocations();
  };

  const saveCustomPrice = async (productId: string, customPrice: number | null, customFee: number | null) => {
    const key = `price-${productId}`;
    setSavingKey(key);
    setError(null);
    const existing = getAllocation(productId);
    if (!existing) { setSavingKey(null); return; }
    const { error: updateError } = await supabase
      .from('branch_products')
      .update({
        custom_price: customPrice,
        custom_service_fee: customFee,
      })
      .eq('id', existing.id);
    setSavingKey(null);
    if (updateError) { setError(updateError.message); return; }
    fetchAllocations();
  };

  if (loading && branches.length === 0) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  if (branches.length === 0) {
    return (
      <div>
        <PageHeader title="Alocação de Produtos" subtitle="Defina quais produtos cada filial pode vender" />
        <Card>
          <EmptyState icon={<Store size={48} />} title="Cadastre filiais primeiro" description="Você precisa ter filiais cadastradas antes de alocar produtos." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Alocação de Produtos" subtitle="Defina quais produtos cada filial pode vender e sobrescreva preços/comissão se necessário" />

      {/* Branch selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedBranch(b.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              selectedBranch === b.id
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            <Store size={16} /> {b.name}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</p>}

      {products.length === 0 ? (
        <Card>
          <EmptyState icon={<Package size={48} />} title="Nenhum produto cadastrado" description="Cadastre produtos na aba 'Produtos' antes de alocá-los às filiais." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const alloc = getAllocation(p.id);
            const isActive = alloc?.active ?? false;
            const key = p.id;
            return (
              <ProductAllocationCard
                key={p.id}
                product={p}
                allocation={alloc}
                isActive={isActive}
                saving={savingKey === key || savingKey === `price-${p.id}`}
                onToggle={(active) => toggleProduct(p, active)}
                onSavePrice={saveCustomPrice}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ProductAllocationCardProps {
  product: Product;
  allocation: BranchProduct | undefined;
  isActive: boolean;
  saving: boolean;
  onToggle: (active: boolean) => void;
  onSavePrice: (productId: string, customPrice: number | null, customFee: number | null) => void;
}

function ProductAllocationCard({ product, allocation, isActive, saving, onToggle, onSavePrice }: ProductAllocationCardProps) {
  const [customPrice, setCustomPrice] = useState<string>('');
  const [customFee, setCustomFee] = useState<string>('');

  useEffect(() => {
    setCustomPrice(allocation?.custom_price != null ? String(allocation.custom_price) : '');
    setCustomFee(allocation?.custom_service_fee != null ? String(allocation.custom_service_fee) : '');
  }, [allocation?.custom_price, allocation?.custom_service_fee]);

  const effectivePrice = allocation?.custom_price != null ? Number(allocation.custom_price) : Number(product.base_price);
  const effectiveFee = allocation?.custom_service_fee != null ? Number(allocation.custom_service_fee) : Number(product.service_fee);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <LotteryIcon slug={product.slug} size={40} />
          <div>
            <h3 className="font-semibold text-slate-900">{product.name}</h3>
            <p className="text-xs text-slate-400">{product.slug}</p>
          </div>
        </div>
        <Badge color={isActive ? 'green' : 'slate'}>{isActive ? 'Ativo' : 'Inativo'}</Badge>
      </div>

      <div className="space-y-2 text-sm text-slate-500 mb-4">
        <div>Preço base: R$ {Number(product.base_price).toFixed(2)} {allocation?.custom_price != null && <span className="text-brand-600 font-medium">(custom: R$ {Number(allocation.custom_price).toFixed(2)})</span>}</div>
        <div>Taxa base: R$ {Number(product.service_fee).toFixed(2)} {allocation?.custom_service_fee != null && <span className="text-brand-600 font-medium">(custom: R$ {Number(allocation.custom_service_fee).toFixed(2)})</span>}</div>
        <div className="pt-2 border-t border-slate-100">
          <span className="text-slate-400">Valor efetivo da cota: </span>
          <span className="font-bold text-slate-900">R$ {(effectivePrice + effectiveFee).toFixed(2)}</span>
        </div>
      </div>

      {isActive && (
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Preço custom. (R$)"
              type="number"
              step="0.01"
              min={0}
              value={customPrice}
              onChange={setCustomPrice}
              placeholder={Number(product.base_price).toFixed(2)}
            />
            <Input
              label="Taxa custom. (R$)"
              type="number"
              step="0.01"
              min={0}
              value={customFee}
              onChange={setCustomFee}
              placeholder={Number(product.service_fee).toFixed(2)}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSavePrice(product.id, customPrice === '' ? null : Number(customPrice), customFee === '' ? null : Number(customFee))}
            disabled={saving}
          >
            {saving ? 'Salvando...' : 'Salvar preços custom.'}
          </Button>
        </div>
      )}

      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
        <Button size="sm" variant={isActive ? 'danger' : 'primary'} onClick={() => onToggle(!isActive)} disabled={saving}>
          {isActive ? 'Desativar' : 'Ativar produto'}
        </Button>
      </div>
    </Card>
  );
}
