import { useEffect, useState } from 'react';
import { Tag, Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PageHeader } from './Layout';
import { Card, Button, Input, Select, Modal, Badge, Spinner, EmptyState } from './ui';
import type { FinCategory, FinSubcategory, Branch } from '../lib/types';

export function FinancialCategories() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [categories, setCategories] = useState<FinCategory[]>([]);
  const [subcategories, setSubcategories] = useState<FinSubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<FinCategory | null>(null);
  const [editingSub, setEditingSub] = useState<FinSubcategory | null>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'expense', active: true });
  const [subForm, setSubForm] = useState({ name: '', category_id: '', active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchData = async () => {
    if (!selectedBranch) { setLoading(false); return; }
    setLoading(true);
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabase.from('fin_categories').select('*').eq('branch_id', selectedBranch).order('name'),
      supabase.from('fin_subcategories').select('*').eq('branch_id', selectedBranch).order('name'),
    ]);
    setCategories((cats ?? []) as FinCategory[]);
    setSubcategories((subs ?? []) as FinSubcategory[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedBranch]);

  const branchOptions = branches.map((b) => ({ value: b.id, label: b.name }));

  const openNewCat = () => {
    setEditingCat(null);
    setCatForm({ name: '', type: 'expense', active: true });
    setError(null);
    setCatModalOpen(true);
  };

  const openEditCat = (c: FinCategory) => {
    setEditingCat(c);
    setCatForm({ name: c.name, type: c.type, active: c.active });
    setError(null);
    setCatModalOpen(true);
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) { setError('Nome é obrigatório.'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      branch_id: selectedBranch,
      name: catForm.name.trim(),
      type: catForm.type,
      active: catForm.active,
    };
    if (editingCat) {
      await supabase.from('fin_categories').update(payload).eq('id', editingCat.id);
    } else {
      await supabase.from('fin_categories').insert(payload);
    }
    setSaving(false);
    setCatModalOpen(false);
    fetchData();
  };

  const removeCat = async (c: FinCategory) => {
    if (!confirm(`Excluir a categoria "${c.name}"?`)) return;
    await supabase.from('fin_categories').delete().eq('id', c.id);
    fetchData();
  };

  const openNewSub = () => {
    setEditingSub(null);
    setSubForm({ name: '', category_id: categories[0]?.id ?? '', active: true });
    setError(null);
    setSubModalOpen(true);
  };

  const openEditSub = (s: FinSubcategory) => {
    setEditingSub(s);
    setSubForm({ name: s.name, category_id: s.category_id, active: s.active });
    setError(null);
    setSubModalOpen(true);
  };

  const saveSub = async () => {
    if (!subForm.name.trim()) { setError('Nome é obrigatório.'); return; }
    if (!subForm.category_id) { setError('Selecione uma categoria.'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      branch_id: selectedBranch,
      category_id: subForm.category_id,
      name: subForm.name.trim(),
      active: subForm.active,
    };
    if (editingSub) {
      await supabase.from('fin_subcategories').update(payload).eq('id', editingSub.id);
    } else {
      await supabase.from('fin_subcategories').insert(payload);
    }
    setSaving(false);
    setSubModalOpen(false);
    fetchData();
  };

  const removeSub = async (s: FinSubcategory) => {
    if (!confirm(`Excluir a subcategoria "${s.name}"?`)) return;
    await supabase.from('fin_subcategories').delete().eq('id', s.id);
    fetchData();
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';

  if (loading && !categories.length) {
    return <div className="flex items-center justify-center py-20"><Spinner className="text-brand-500" /></div>;
  }

  return (
    <div>
      <PageHeader
        title="Categorias e Subcategorias"
        subtitle="Cadastro de categorias financeiras por filial"
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Select value={selectedBranch} onChange={setSelectedBranch} options={branchOptions} placeholder="Selecionar filial" />
            )}
            <Button onClick={openNewCat}><Plus size={18} /> Nova Categoria</Button>
            <Button variant="secondary" onClick={openNewSub}><Plus size={18} /> Nova Subcategoria</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categories */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Categorias</h2>
          {categories.length === 0 ? (
            <Card><EmptyState icon={<Tag size={48} />} title="Nenhuma categoria" description="Cadastre categorias para organizar suas contas." /></Card>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => (
                <Card key={c.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.type === 'expense' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        <Tag size={18} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{c.name}</h3>
                        <Badge color={c.type === 'expense' ? 'red' : 'green'}>{c.type === 'expense' ? 'Despesa' : 'Receita'}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={c.active ? 'green' : 'slate'}>{c.active ? 'Ativa' : 'Inativa'}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => openEditCat(c)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => removeCat(c)}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Subcategories */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Subcategorias</h2>
          {subcategories.length === 0 ? (
            <Card><EmptyState icon={<FolderTree size={48} />} title="Nenhuma subcategoria" description="Cadastre subcategorias para detalhar suas contas." /></Card>
          ) : (
            <div className="space-y-2">
              {subcategories.map((s) => (
                <Card key={s.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                        <FolderTree size={18} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900">{s.name}</h3>
                        <p className="text-xs text-slate-400">{catName(s.category_id)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge color={s.active ? 'green' : 'slate'}>{s.active ? 'Ativa' : 'Inativa'}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => openEditSub(s)}><Pencil size={14} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => removeSub(s)}><Trash2 size={14} /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category Modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title={editingCat ? 'Editar Categoria' : 'Nova Categoria'}>
        <div className="space-y-4">
          <Input label="Nome *" value={catForm.name} onChange={(v) => setCatForm({ ...catForm, name: v })} placeholder="Ex: Aluguel" required />
          <Select label="Tipo" value={catForm.type} onChange={(v) => setCatForm({ ...catForm, type: v })} options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Receita' }]} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={catForm.active} onChange={(e) => setCatForm({ ...catForm, active: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-slate-700">Categoria ativa</span>
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveCat} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>

      {/* Subcategory Modal */}
      <Modal open={subModalOpen} onClose={() => setSubModalOpen(false)} title={editingSub ? 'Editar Subcategoria' : 'Nova Subcategoria'}>
        <div className="space-y-4">
          <Input label="Nome *" value={subForm.name} onChange={(v) => setSubForm({ ...subForm, name: v })} placeholder="Ex: Energia elétrica" required />
          <Select label="Categoria" value={subForm.category_id} onChange={(v) => setSubForm({ ...subForm, category_id: v })} options={categories.map((c) => ({ value: c.id, label: `${c.name} (${c.type === 'expense' ? 'Despesa' : 'Receita'})` }))} placeholder="Selecione" required />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={subForm.active} onChange={(e) => setSubForm({ ...subForm, active: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
            <span className="text-sm text-slate-700">Subcategoria ativa</span>
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSubModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveSub} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
