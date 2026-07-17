import { useEffect, useState } from 'react';
import { ArrowRightLeft, Check, Store, Package, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from './Layout';
import { Card, Input, Badge, Spinner, EmptyState } from './ui';
import { LotteryIcon } from '../lib/lotteryIcons';
import type { Branch, Product, BranchProduct } from '../lib/types';

export function AdminAllocations() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allocations, setAllocations] = useState<BranchProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: b }, { data: p }, { data: a }] = await Promise.all([
      supabase.from('branches').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
      supabase.from('branch_products').select('*, product:products(*)'),
    ]);
    setBranches((b ?? []) as Branch[]);
    setProducts((p ?? []) as Product[]);
    setAllocations((a ?? []) as BranchProduct[]);
    if (!selectedBranch && (b ?? []).length > 0) {
      setSelectedBranch((b ?? [])[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const isAllocated = (productId: string) => {
    return allocations.some((a) => a.branch_id === selectedBranch && a.product_id === productId);
  };

  const getAllocation = (productId: string) => {
    return allocations.find((a) => a.branch_id === selectedBranch && a.product_id === productId);
  };

  const toggleAllocation = async (productId: string) => {
    setSaving(true);
    const existing = getAllocation(productId);
    if (existing) {
      await supabase.from('branch_products').delete().eq('id', existing.id);
    } else {
      await supabase.from('branch_products').insert({ branch_id: selectedBranch, product_id: productId, active: true });
    }
    await fetchData();
    setSaving(false);
  };

  const updateCustomPrice = async (allocationId: string, field: 'custom_price' | 'custom_service_fee', value: string) => {
    const numValue = value === '' ? null : Number(value);
    await supabase.from('branch_products').update({ [field]: numValue }).eq('id', allocationId);
    fetchData();
  };

  const toggleActive = async (allocation: BranchProduct) => {
    await supabase.from('branch_products').update({ active: !allocation.active }).eq('id', allocation.id);
    fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  if (branches.length === 0 || products.length === 0) {
    return (
      <div>
        <PageHeader title="Alocação de Produtos" subtitle="Defina quais produtos cada filial pode vender" />
        <Card>
          <EmptyState
            icon={<ArrowRightLeft size={48} />}
            title="Cadastre filiais e produtos primeiro"
            description="Você precisa ter filiais e produtos cadastrados antes de fazer alocações."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Alocação de Produtos" subtitle="Defina quais produtos cada filial pode vender" />

      {/* Branch selector */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
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
      </div>

      {/* Products grid */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package size={18} className="text-slate-400" />
          <h2 className="font-semibold text-slate-900">Produtos disponíveis para a filial</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const allocated = isAllocated(p.id);
            const alloc = getAllocation(p.id);
            return (
              <div
                key={p.id}
                className={`border rounded-lg p-4 transition-all ${allocated ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                      <LotteryIcon slug={p.slug} size={28} />
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">{p.name}</h3>
                        <p className="text-xs text-slate-400">Dezenas: {p.min_dezenas}-{p.max_dezenas} · R$ {Number(p.base_price).toFixed(2)}</p>
                      </div>
                    </div>
                  <button
                    onClick={() => toggleAllocation(p.id)}
                    disabled={saving}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                      allocated ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    {allocated ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                </div>
                {allocated && alloc && (
                  <div className="space-y-2 pt-2 border-t border-brand-200">
                    <Input
                      label="Preço customizado"
                      type="number"
                      step="0.01"
                      value={alloc.custom_price ?? ''}
                      onChange={(v) => updateCustomPrice(alloc.id, 'custom_price', v)}
                      placeholder={`Padrão: R$ ${Number(p.base_price).toFixed(2)}`}
                    />
                    <Input
                      label="Taxa customizada"
                      type="number"
                      step="0.01"
                      value={alloc.custom_service_fee ?? ''}
                      onChange={(v) => updateCustomPrice(alloc.id, 'custom_service_fee', v)}
                      placeholder={`Padrão: R$ ${Number(p.service_fee).toFixed(2)}`}
                    />
                    <button onClick={() => toggleActive(alloc)} className="flex items-center gap-2 text-xs">
                      <Badge color={alloc.active ? 'green' : 'slate'}>{alloc.active ? 'Ativo' : 'Inativo'}</Badge>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}


