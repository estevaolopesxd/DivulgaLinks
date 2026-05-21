import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, XCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { templatesApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { MessageTemplate } from '../types';

// ─── Variable chips ───────────────────────────────────────────────────────────

const VARIABLES = [
  { tag: '{{name}}', label: 'Nome' },
  { tag: '{{description}}', label: 'Descrição completa' },
  { tag: '{{shortDescription}}', label: 'Desc. curta (120 chars)' },
  { tag: '{{price}}', label: 'Preço (R$)' },
  { tag: '{{originalPrice}}', label: 'Preço original (R$)' },
  { tag: '{{priceBlock}}', label: 'Preço (tachado)' },
  { tag: '{{priceBlockLines}}', label: 'Preço (2 linhas)' },
  { tag: '{{discount}}', label: 'Desconto %' },
  { tag: '{{url}}', label: 'Link curto' },
];

// ─── Form state ───────────────────────────────────────────────────────────────

interface TemplateFormData {
  name: string;
  content: string;
  isActive: boolean;
}

const emptyForm: TemplateFormData = {
  name: '',
  content: '',
  isActive: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export const Templates: React.FC = () => {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MessageTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);

  // ─── Queries & mutations ──────────────────────────────────────────────────

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: TemplateFormData) => templatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Modelo criado com sucesso!');
      closeModal();
    },
    onError: () => toast.error('Erro ao criar modelo.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TemplateFormData> }) =>
      templatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Modelo atualizado!');
      closeModal();
    },
    onError: () => toast.error('Erro ao atualizar modelo.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      templatesApi.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: () => toast.error('Erro ao alterar status do modelo.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      toast.success('Modelo removido.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover modelo.'),
  });

  // ─── Modal helpers ────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditTarget(t);
    setForm({ name: t.name, content: t.content, isActive: t.isActive });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Informe o nome do modelo.');
    if (!form.content.trim()) return toast.error('O conteúdo do modelo não pode estar vazio.');
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  // ─── Variable chip insertion ──────────────────────────────────────────────

  const insertVariable = (tag: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setForm((f) => ({ ...f, content: f.content + tag }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = form.content.slice(0, start);
    const after = form.content.slice(end);
    const next = before + tag + after;
    setForm((f) => ({ ...f, content: next }));
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) return <PageLoader />;

  const activeCount = templates.filter((t) => t.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Modelos de Mensagem</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Templates usados para envio nas campanhas. Quando há múltiplos ativos, um é escolhido aleatoriamente a cada envio.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
          Novo Modelo
        </Button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
        <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 space-y-1">
          <p className="font-medium">Variáveis disponíveis nos templates</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-blue-600">
            <li><code className="font-mono">{'{{priceBlock}}'}</code> — mostra "De ~~R$ X~~ por *R$ Y*" se houver preço original, ou apenas "*R$ Y*"</li>
            <li><code className="font-mono">{'{{price}}'}</code> — preço atual formatado (ex: R$ 51,90)</li>
            <li><code className="font-mono">{'{{originalPrice}}'}</code> — preço original formatado</li>
            <li><code className="font-mono">{'{{url}}'}</code> — link curto de rastreamento (gerado automaticamente)</li>
            <li><code className="font-mono">{'{{discount}}'}</code> — percentual de desconto (ex: 15%)</li>
            <li><code className="font-mono">{'{{name}}'}</code> — nome do produto</li>
            <li><code className="font-mono">{'{{description}}'}</code> — descrição do produto</li>
          </ul>
        </div>
      </div>

      {/* Stats bar */}
      {templates.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{templates.length} modelo{templates.length !== 1 ? 's' : ''} cadastrado{templates.length !== 1 ? 's' : ''}</span>
          <span className="text-gray-300">•</span>
          <span className="text-green-600 font-medium">{activeCount} ativo{activeCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Content */}
      {templates.length === 0 ? (
        <EmptyState
          title="Nenhum modelo cadastrado"
          description="Crie seu primeiro modelo de mensagem. Enquanto nenhum modelo estiver ativo, o template padrão embutido será usado."
          action={{ label: 'Criar primeiro modelo', onClick: openCreate, icon: <Plus size={16} /> }}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-medium text-gray-500 w-48">Nome</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Conteúdo</th>
                <th className="text-center px-5 py-3 font-medium text-gray-500 w-24">Ativo</th>
                <th className="text-right px-5 py-3 font-medium text-gray-500 w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  {/* Name */}
                  <td className="px-5 py-3 font-medium text-gray-900 align-top">
                    {t.name}
                  </td>

                  {/* Content preview */}
                  <td className="px-5 py-3 text-gray-500 align-top">
                    <span className="font-mono text-xs leading-relaxed whitespace-pre-wrap line-clamp-2">
                      {t.content.length > 80 ? t.content.slice(0, 80) + '...' : t.content}
                    </span>
                  </td>

                  {/* Toggle */}
                  <td className="px-5 py-3 text-center align-top">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={t.isActive}
                      disabled={toggleMutation.isPending}
                      onClick={() => toggleMutation.mutate({ id: t.id, isActive: !t.isActive })}
                      className={`relative inline-flex w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:opacity-50 ${
                        t.isActive ? 'bg-primary-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          t.isActive ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(t)}
                        className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 rounded-lg py-1.5 px-2.5 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 bg-gray-100 hover:bg-red-50 rounded-lg py-1.5 px-2.5 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Editar Modelo' : 'Novo Modelo de Mensagem'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeModal}>Cancelar</Button>
            <Button variant="primary" loading={isSaving} onClick={handleSubmit}>
              {editTarget ? 'Salvar Alterações' : 'Criar Modelo'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nome"
            required
            placeholder="Ex: Promoção com desconto"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />

          {/* Variable chips */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-1.5">Inserir variável</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => insertVariable(v.tag)}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-colors font-mono"
                >
                  {v.tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Conteúdo <span className="text-red-500">*</span>
            </label>
            <textarea
              ref={textareaRef}
              required
              rows={8}
              placeholder={"Ex: *{{name}}*\n\nDe ~~R$ {{originalPrice}}~~ por apenas *R$ {{price}}* ({{discount}} OFF)\n\nAcesse: {{url}}"}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:border-gray-400 placeholder:text-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors resize-y min-h-[160px] font-mono"
            />
            <p className="text-xs text-gray-500">Use formatação do WhatsApp: *negrito*, _itálico_, ~~tachado~~</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
              className={`relative w-10 h-5 rounded-full transition-colors focus:outline-none ${
                form.isActive ? 'bg-primary-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.isActive ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">Modelo ativo</span>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
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
              Tem certeza que deseja excluir o modelo{' '}
              <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Templates;
