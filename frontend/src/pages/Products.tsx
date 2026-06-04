import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Upload, Download, Search, Filter, Pencil, Trash2,
  ShoppingBag, ExternalLink, Tag, XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { productsApi, platformsApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Input, TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { Product, Platform, PreviewProduct } from '../types';

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function discountPct(original: number, current: number) {
  return Math.round(((original - current) / original) * 100);
}


interface ProductForm {
  title: string;
  description: string;
  price: string;
  originalPrice: string;
  imageUrl: string;
  affiliateUrl: string;
  category: string;
  tags: string;
  isActive: boolean;
  platformId: string;
}

const emptyProductForm: ProductForm = {
  title: '', description: '', price: '', originalPrice: '',
  imageUrl: '', affiliateUrl: '', category: '', tags: '',
  isActive: true, platformId: '',
};

export const Products: React.FC = () => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterActive, setFilterActive] = useState<string>('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importQuery, setImportQuery] = useState('');
  const [importPlatform, setImportPlatform] = useState('');
  const [previewProducts, setPreviewProducts] = useState<PreviewProduct[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importSort, setImportSort] = useState<'sales' | 'commission' | 'price'>('sales');
  const [form, setForm] = useState<ProductForm>(emptyProductForm);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', page, search, filterPlatform, filterCategory, filterActive],
    queryFn: () => productsApi.list({
      page,
      limit: 12,
      search: search || undefined,
      platformId: filterPlatform || undefined,
      category: filterCategory || undefined,
      isActive: filterActive === 'true' ? true : filterActive === 'false' ? false : undefined,
    }),
    retry: false,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<Product, 'id' | 'importedAt'>) => productsApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); toast.success('Produto criado!'); setAddModalOpen(false); setForm(emptyProductForm); },
    onError: () => toast.error('Erro ao criar produto.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) => productsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); toast.success('Produto atualizado!'); setEditTarget(null); setForm(emptyProductForm); },
    onError: () => toast.error('Erro ao atualizar produto.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['products'] }); toast.success('Produto removido.'); setDeleteTarget(null); },
    onError: () => toast.error('Erro ao remover produto.'),
  });

  const importCSVMutation = useMutation({
    mutationFn: (file: File) => productsApi.importCSV(file),
    onSuccess: (data) => { toast.success(`${data.imported} produtos importados!`); queryClient.invalidateQueries({ queryKey: ['products'] }); setCsvModalOpen(false); setCsvFile(null); },
    onError: () => toast.error('Erro ao importar CSV.'),
  });

  const searchPlatformMutation = useMutation({
    mutationFn: ({ platformId, query }: { platformId: string; query: string }) =>
      productsApi.searchFromPlatform(platformId, query, 20),
    onSuccess: (data) => {
      setPreviewProducts(data);
      setSelectedIds(new Set(data.map((p) => p.externalId)));
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao buscar produtos.'),
  });

  const importSelectedMutation = useMutation({
    mutationFn: ({ platformId, products }: { platformId: string; products: PreviewProduct[] }) =>
      productsApi.importSelected(platformId, products),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setImportModalOpen(false);
      setPreviewProducts([]);
      setSelectedIds(new Set());
      setImportQuery('');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao importar.'),
  });

  const products = productsData?.data ?? [];
  const total = productsData?.total ?? 0;
  const totalPages = productsData?.totalPages ?? 1;

  const openEdit = (p: Product) => {
    setEditTarget(p);
    setForm({
      title: p.title, description: p.description ?? '', price: String(p.price),
      originalPrice: String(p.originalPrice ?? ''), imageUrl: p.imageUrl ?? '',
      affiliateUrl: p.affiliateUrl, category: p.category ?? '',
      tags: (p.tags ?? []).join(', '), isActive: p.isActive, platformId: p.platformId ?? '',
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title, description: form.description || undefined,
      price: parseFloat(form.price), originalPrice: form.originalPrice ? parseFloat(form.originalPrice) : undefined,
      imageUrl: form.imageUrl || undefined, affiliateUrl: form.affiliateUrl,
      category: form.category || undefined, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      isActive: form.isActive, platformId: form.platformId || undefined,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) setCsvFile(file);
    else toast.error('Por favor, envie um arquivo .csv');
  };

  if (isLoading) return <PageLoader />;

  const platformOptions = (platforms as Platform[]).map((p) => ({ value: p.id, label: p.name }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-sm text-gray-500">{total} produto{total !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Upload size={14} />} onClick={() => setCsvModalOpen(true)}>
            Importar CSV
          </Button>
          <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={() => setImportModalOpen(true)}>
            Importar da Plataforma
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { setEditTarget(null); setForm(emptyProductForm); setAddModalOpen(true); }}>
            Adicionar Produto
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            leftIcon={<Search size={15} />}
          />
        </div>
        <Select
          options={[{ value: '', label: 'Todas as plataformas' }, ...platformOptions]}
          value={filterPlatform}
          onChange={(e) => { setFilterPlatform(e.target.value); setPage(1); }}
          containerClassName="w-48"
        />
        <Select
          options={[
            { value: '', label: 'Todas as categorias' },
            { value: 'Smartphones', label: 'Smartphones' },
            { value: 'Notebooks', label: 'Notebooks' },
            { value: 'Periféricos', label: 'Periféricos' },
          ]}
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          containerClassName="w-44"
        />
        <Select
          options={[
            { value: '', label: 'Todos os status' },
            { value: 'true', label: 'Ativos' },
            { value: 'false', label: 'Inativos' },
          ]}
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value); setPage(1); }}
          containerClassName="w-40"
        />
        {(search || filterPlatform || filterCategory || filterActive) && (
          <Button variant="ghost" size="sm" icon={<Filter size={14} />} onClick={() => { setSearch(''); setFilterPlatform(''); setFilterCategory(''); setFilterActive(''); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Product grid */}
      {products.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={28} />}
          title="Nenhum produto encontrado"
          description="Adicione produtos manualmente ou importe de uma plataforma de afiliados."
          action={{ label: 'Adicionar Produto', onClick: () => setAddModalOpen(true), icon: <Plus size={16} /> }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {products.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                {/* Image */}
                <div className="relative h-40 bg-gray-100 flex items-center justify-center">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBag size={32} className="text-gray-300" />
                  )}
                  {/* Active toggle */}
                  <button
                    onClick={() => updateMutation.mutate({ id: p.id, data: { isActive: !p.isActive } })}
                    className={`absolute top-2 right-2 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${p.isActive ? 'bg-green-500' : 'bg-gray-400'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.isActive ? 'translate-x-[18px]' : 'translate-x-1'}`} />
                  </button>
                  {p.category && (
                    <span className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {p.category}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-gray-800 line-clamp-2">{p.title}</h3>
                  <div className="flex items-baseline gap-2 mt-auto">
                    <span className="text-base font-bold text-gray-900">{formatBRL(p.price)}</span>
                    {p.originalPrice && p.originalPrice > p.price && (
                      <>
                        <span className="text-xs text-gray-400 line-through">{formatBRL(p.originalPrice)}</span>
                        <Badge variant="success" size="sm">{discountPct(p.originalPrice, p.price)}% off</Badge>
                      </>
                    )}
                  </div>
                  {p.clicks !== undefined && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Tag size={11} />
                      <span>{p.clicks} cliques</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 flex items-center gap-2">
                  <a href={p.affiliateUrl} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary-600 bg-gray-100 hover:bg-primary-50 rounded-lg py-1.5 transition-colors">
                    <ExternalLink size={12} />Ver link
                  </a>
                  <button onClick={() => openEdit(p)} className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 rounded-lg py-1.5 px-3 transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-red-50 rounded-lg py-1.5 px-3 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} limit={12} onPageChange={setPage} />
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={addModalOpen || !!editTarget} onClose={() => { setAddModalOpen(false); setEditTarget(null); }} title={editTarget ? 'Editar Produto' : 'Adicionar Produto'} size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setAddModalOpen(false); setEditTarget(null); }}>Cancelar</Button>
            <Button variant="primary" loading={isSaving} onClick={handleFormSubmit}>
              {editTarget ? 'Salvar Alterações' : 'Adicionar'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <Input label="Título" required value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          <TextArea label="Descrição" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Preço (R$)" type="number" required step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} />
            <Input label="Preço Original (R$)" type="number" step="0.01" value={form.originalPrice} onChange={(e) => setForm(f => ({ ...f, originalPrice: e.target.value }))} />
          </div>
          <Input label="URL da Imagem" type="url" value={form.imageUrl} onChange={(e) => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
          <Input label="URL de Afiliado" type="url" required value={form.affiliateUrl} onChange={(e) => setForm(f => ({ ...f, affiliateUrl: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Categoria" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} />
            <Input label="Tags (separadas por vírgula)" value={form.tags} onChange={(e) => setForm(f => ({ ...f, tags: e.target.value }))} />
          </div>
          <Select label="Plataforma" options={[{ value: '', label: 'Nenhuma' }, ...platformOptions]} value={form.platformId} onChange={(e) => setForm(f => ({ ...f, platformId: e.target.value }))} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${form.isActive ? 'bg-primary-500' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-gray-700">Produto ativo</span>
          </div>
        </form>
      </Modal>

      {/* CSV Import Modal */}
      <Modal isOpen={csvModalOpen} onClose={() => { setCsvModalOpen(false); setCsvFile(null); }} title="Importar CSV" size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setCsvModalOpen(false); setCsvFile(null); }}>Cancelar</Button>
            <Button variant="primary" loading={importCSVMutation.isPending} disabled={!csvFile} onClick={() => csvFile && importCSVMutation.mutate(csvFile)}>
              Importar
            </Button>
          </div>
        }
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setCsvDragging(true); }}
          onDragLeave={() => setCsvDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${csvDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'}`}
        >
          <Upload size={32} className="mx-auto text-gray-400 mb-3" />
          {csvFile ? (
            <p className="text-sm font-medium text-primary-600">{csvFile.name}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-700">Arraste seu arquivo CSV aqui</p>
              <p className="text-xs text-gray-400 mt-1">ou clique para selecionar</p>
            </>
          )}
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCsvFile(f); }} />
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Colunas esperadas: <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">title, price, originalPrice, affiliateUrl, imageUrl, category, tags</code>
        </p>
      </Modal>

      {/* Platform Import Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => { setImportModalOpen(false); setPreviewProducts([]); setSelectedIds(new Set()); setImportQuery(''); }}
        title="Importar da Plataforma"
        size="2xl"
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-500">
              {previewProducts.length > 0 && `${selectedIds.size} de ${previewProducts.length} selecionados`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setImportModalOpen(false); setPreviewProducts([]); setSelectedIds(new Set()); }}>
                Fechar
              </Button>
              {previewProducts.length > 0 && (
                <Button
                  variant="primary"
                  loading={importSelectedMutation.isPending}
                  disabled={selectedIds.size === 0}
                  icon={<Download size={15} />}
                  onClick={() => {
                    const selected = previewProducts.filter((p) => selectedIds.has(p.externalId));
                    importSelectedMutation.mutate({ platformId: importPlatform, products: selected });
                  }}
                >
                  Importar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Busca */}
          <div className="flex gap-2">
            <Select
              options={[{ value: '', label: 'Plataforma' }, ...platformOptions]}
              value={importPlatform}
              onChange={(e) => { setImportPlatform(e.target.value); setPreviewProducts([]); setSelectedIds(new Set()); }}
              containerClassName="w-40 flex-shrink-0"
            />
            <Input
              placeholder="Buscar produtos..."
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importPlatform && importQuery && searchPlatformMutation.mutate({ platformId: importPlatform, query: importQuery })}
              containerClassName="flex-1"
              leftIcon={<Search size={15} />}
            />
            <Button
              variant="primary"
              loading={searchPlatformMutation.isPending}
              disabled={!importPlatform || !importQuery}
              onClick={() => searchPlatformMutation.mutate({ platformId: importPlatform, query: importQuery })}
            >
              Buscar
            </Button>
          </div>

          {/* Ordenação + selecionar tudo */}
          {previewProducts.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Ordenar por:</span>
                {(['sales', 'commission', 'price'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setImportSort(s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      importSort === s
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'border-gray-300 text-gray-600 hover:border-primary-400'
                    }`}
                  >
                    {s === 'sales' ? '🔥 Mais vendidos' : s === 'commission' ? '💰 Maior comissão' : '💲 Menor preço'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (selectedIds.size === previewProducts.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(previewProducts.map((p) => p.externalId)));
                  }
                }}
                className="text-xs text-primary-600 hover:underline"
              >
                {selectedIds.size === previewProducts.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>
          )}

          {/* Lista de produtos */}
          {previewProducts.length > 0 && (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {[...previewProducts]
                .sort((a, b) =>
                  importSort === 'sales' ? b.sales - a.sales
                  : importSort === 'commission' ? b.commissionRate - a.commissionRate
                  : a.price - b.price,
                )
                .map((p) => {
                  const checked = selectedIds.has(p.externalId);
                  const discount = p.originalPrice && p.originalPrice > p.price
                    ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)
                    : 0;
                  return (
                    <div
                      key={p.externalId}
                      onClick={() => {
                        const next = new Set(selectedIds);
                        if (checked) next.delete(p.externalId); else next.add(p.externalId);
                        setSelectedIds(next);
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        checked ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <input type="checkbox" checked={checked} readOnly className="flex-shrink-0 accent-primary-500" />
                      <div className="w-12 h-12 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                        {p.imageUrl
                          ? <img src={p.imageUrl} className="w-12 h-12 object-cover" alt="" />
                          : <ShoppingBag size={18} className="text-gray-400 m-auto mt-3" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">{p.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-sm font-bold text-green-700">{formatBRL(p.price)}</span>
                          {discount > 0 && (
                            <span className="text-xs line-through text-gray-400">{formatBRL(p.originalPrice!)}</span>
                          )}
                          {discount > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">-{discount}%</span>
                          )}
                          {p.commissionRate > 0 && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">💰 {p.commissionRate}%</span>
                          )}
                          {p.sales > 0 && (
                            <span className="text-xs text-gray-400">🔥 {p.sales.toLocaleString('pt-BR')} vendidos</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {searchPlatformMutation.isSuccess && previewProducts.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-4">Nenhum produto encontrado.</p>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar exclusão" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="danger" loading={deleteMutation.isPending} icon={<Trash2 size={14} />} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Excluir</Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <XCircle size={20} className="text-red-600" />
          </div>
          <p className="text-sm text-gray-700">Excluir <strong>{deleteTarget?.title}</strong>? Esta ação não pode ser desfeita.</p>
        </div>
      </Modal>
    </div>
  );
};
