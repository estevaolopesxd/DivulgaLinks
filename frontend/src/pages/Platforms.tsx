import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Zap, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { platformsApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { Platform } from '../types';

const PLATFORM_TYPES = [
  { value: 'AMAZON', label: 'Amazon' },
  { value: 'MERCADO_LIVRE', label: 'Mercado Livre' },
  { value: 'SHOPEE', label: 'Shopee' },
  { value: 'ALIEXPRESS', label: 'AliExpress' },
  { value: 'AWIN', label: 'Awin' },
  { value: 'MAGALU', label: 'Magalu' },
];

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  AMAZON: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
  MERCADO_LIVRE: { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200' },
  SHOPEE: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  ALIEXPRESS: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  AWIN: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
  MAGALU: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

const PLATFORM_EMOJIS: Record<string, string> = {
  AMAZON: '🛒',
  MERCADO_LIVRE: '🛍️',
  SHOPEE: '🛍️',
  ALIEXPRESS: '📦',
  AWIN: '🔗',
  MAGALU: '🏪',
};

interface PlatformFormData {
  name: string;
  type: Platform['type'] | '';
  affiliateId: string;
  apiKey: string;
  isActive: boolean;
}

const emptyForm: PlatformFormData = {
  name: '',
  type: '',
  affiliateId: '',
  apiKey: '',
  isActive: true,
};

export const Platforms: React.FC = () => {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Platform | null>(null);
  const [form, setForm] = useState<PlatformFormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Platform | null>(null);

  const { data: platforms = [], isLoading } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<Platform, 'id' | 'createdAt'>) => platformsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      toast.success('Plataforma criada com sucesso!');
      closeModal();
    },
    onError: () => toast.error('Erro ao criar plataforma.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Platform> }) => platformsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      toast.success('Plataforma atualizada!');
      closeModal();
    },
    onError: () => toast.error('Erro ao atualizar plataforma.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => platformsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platforms'] });
      toast.success('Plataforma removida.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover plataforma.'),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => platformsApi.test(id),
    onSuccess: (data) => {
      if (data.success) toast.success('Conexão testada com sucesso!');
      else toast.error(data.message);
    },
    onError: () => toast.error('Erro ao testar conexão.'),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: Platform) => {
    setEditTarget(p);
    setForm({ name: p.name, type: p.type, affiliateId: p.affiliateId, apiKey: p.apiKey ?? '', isActive: p.isActive });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.type) return toast.error('Selecione o tipo de plataforma.');
    const payload = { name: form.name, type: form.type as Platform['type'], affiliateId: form.affiliateId, apiKey: form.apiKey || undefined, isActive: form.isActive };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{platforms.length} plataforma{platforms.length !== 1 ? 's' : ''} cadastrada{platforms.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
          Adicionar Plataforma
        </Button>
      </div>

      {/* Grid */}
      {platforms.length === 0 ? (
        <EmptyState
          title="Nenhuma plataforma cadastrada"
          description="Adicione sua primeira plataforma de afiliados para começar a importar produtos."
          action={{ label: 'Adicionar Plataforma', onClick: openCreate, icon: <Plus size={16} /> }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {platforms.map((p) => {
            const colors = PLATFORM_COLORS[p.type] ?? PLATFORM_COLORS.AWIN;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
                {/* Top row */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center text-2xl`}>
                      {PLATFORM_EMOJIS[p.type]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{p.name}</p>
                      <p className={`text-xs font-medium ${colors.text}`}>
                        {PLATFORM_TYPES.find((t) => t.value === p.type)?.label ?? p.type}
                      </p>
                    </div>
                  </div>
                  <Badge variant={p.isActive ? 'success' : 'danger'} dot>
                    {p.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                {/* Info */}
                <div className="bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">ID de Afiliado</p>
                  <p className="text-sm font-mono text-gray-700 mt-0.5">
                    {p.affiliateId.slice(0, 4)}{'*'.repeat(Math.max(0, p.affiliateId.length - 4))}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => testMutation.mutate(p.id)}
                    disabled={testMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-primary-600 bg-gray-100 hover:bg-primary-50 rounded-lg py-1.5 transition-colors"
                  >
                    <Zap size={13} />
                    Testar
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 rounded-lg py-1.5 transition-colors"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteTarget(p)}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-red-50 rounded-lg py-1.5 px-3 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Editar Plataforma' : 'Adicionar Plataforma'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
              {editTarget ? 'Salvar Alterações' : 'Adicionar'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome"
            required
            placeholder="Ex: Amazon Associates"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Select
            label="Tipo de Plataforma"
            required
            placeholder="Selecione..."
            options={PLATFORM_TYPES}
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Platform['type'] }))}
          />
          <Input
            label={form.type === 'MERCADO_LIVRE' ? 'ID de Afiliado (matt_tool)' : 'ID de Afiliado'}
            required
            placeholder={
              form.type === 'MERCADO_LIVRE'
                ? 'Valor matt_tool do painel de Afiliados ML'
                : form.type === 'AMAZON'
                ? 'Ex: meusite-20'
                : 'ID de afiliado da plataforma'
            }
            value={form.affiliateId}
            onChange={(e) => setForm((f) => ({ ...f, affiliateId: e.target.value }))}
            hint={
              form.type === 'MERCADO_LIVRE'
                ? 'Acesse afiliados.mercadolivre.com.br → Ferramentas → Links de afiliado e copie o valor matt_tool'
                : undefined
            }
          />
          <Input
            label="Chave de API (opcional)"
            type="password"
            placeholder={
              form.type === 'MERCADO_LIVRE'
                ? 'Access Token do app ML (se tiver app próprio cadastrado)'
                : 'Chave de API se necessário'
            }
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
            hint={
              form.type === 'MERCADO_LIVRE'
                ? 'Opcional — necessário apenas se você tiver um App registrado no ML Developers'
                : undefined
            }
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? 'bg-primary-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-700">Plataforma ativa</span>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Confirmar exclusão"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              icon={<Trash2 size={14} />}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Excluir
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <XCircle size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-700">
              Tem certeza que deseja excluir a plataforma <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
