import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Send, Play, Square, MessageSquare, Trash2, ExternalLink, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { telegramApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge, statusToBadgeVariant, statusLabel } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { TelegramBot, TelegramChat } from '../types';

export const Telegram: React.FC = () => {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [chatsModal, setChatsModal] = useState<TelegramBot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TelegramBot | null>(null);
  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const { data: bots = [], isLoading } = useQuery({
    queryKey: ['telegram'],
    queryFn: telegramApi.list,
    retry: false,
  });

  const { data: chats = [] } = useQuery({
    queryKey: ['telegram-chats', chatsModal?.id],
    queryFn: () => chatsModal ? telegramApi.getChats(chatsModal.id) : Promise.resolve([]),
    enabled: !!chatsModal,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; token: string }) => telegramApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram'] });
      toast.success('Bot adicionado com sucesso!');
      setAddModalOpen(false);
      setNewName('');
      setNewToken('');
    },
    onError: () => toast.error('Erro ao adicionar bot. Verifique o token.'),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => telegramApi.start(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['telegram'] }); toast.success('Bot iniciado!'); },
    onError: () => toast.error('Erro ao iniciar bot.'),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => telegramApi.stop(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['telegram'] }); toast.success('Bot pausado.'); },
    onError: () => toast.error('Erro ao pausar bot.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram'] });
      toast.success('Bot removido.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover bot.'),
  });

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{(bots as TelegramBot[]).length} bot{(bots as TelegramBot[]).length !== 1 ? 's' : ''}</p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddModalOpen(true)}>
          Adicionar Bot
        </Button>
      </div>

      {(bots as TelegramBot[]).length === 0 ? (
        <EmptyState
          icon={<Send size={28} />}
          title="Nenhum bot Telegram"
          description="Adicione seu primeiro bot do Telegram para começar a enviar mensagens."
          action={{ label: 'Adicionar Bot', onClick: () => setAddModalOpen(true), icon: <Plus size={16} /> }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(bots as TelegramBot[]).map((bot) => (
            <div key={bot.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
              {/* Top */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${bot.status === 'ACTIVE' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                    <Send size={20} className={bot.status === 'ACTIVE' ? 'text-blue-500' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{bot.name}</p>
                    {bot.username && (
                      <a
                        href={`https://t.me/${bot.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                      >
                        @{bot.username}
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
                <Badge variant={statusToBadgeVariant(bot.status)} dot>
                  {statusLabel(bot.status)}
                </Badge>
              </div>

              {/* Token preview */}
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">Token</p>
                <p className="text-sm font-mono text-gray-600 mt-0.5">{bot.token.slice(0, 10)}{'*'.repeat(15)}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {bot.status === 'ACTIVE' ? (
                  <Button size="xs" variant="outline" icon={<Square size={12} />}
                    loading={stopMutation.isPending}
                    onClick={() => stopMutation.mutate(bot.id)}>
                    Pausar
                  </Button>
                ) : (
                  <Button size="xs" variant="primary" icon={<Play size={12} />}
                    loading={startMutation.isPending}
                    onClick={() => startMutation.mutate(bot.id)}>
                    Iniciar
                  </Button>
                )}
                {bot.status === 'ACTIVE' && (
                  <Button size="xs" variant="outline" icon={<MessageSquare size={12} />}
                    onClick={() => setChatsModal(bot)}>
                    Ver Chats
                  </Button>
                )}
                <Button size="xs" variant="ghost" icon={<Trash2 size={12} />}
                  onClick={() => setDeleteTarget(bot)}
                  className="ml-auto text-red-500 hover:text-red-600 hover:bg-red-50" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Bot Modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Adicionar Bot Telegram" size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName, token: newToken })}>
              Adicionar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Nome do Bot" required placeholder="Ex: Bot Promoções" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div>
            <Input
              label="Token do Bot"
              required
              type={showToken ? 'text' : 'password'}
              placeholder="123456789:AABBCCDDeeffGGHH..."
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              hint="Obtenha o token com o @BotFather no Telegram"
            />
            <button type="button" onClick={() => setShowToken(!showToken)} className="text-xs text-primary-600 hover:underline mt-1">
              {showToken ? 'Ocultar' : 'Mostrar'} token
            </button>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Como obter o token:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Abra o Telegram e procure por <strong>@BotFather</strong></li>
              <li>Envie o comando <code className="bg-blue-100 px-1 rounded">/newbot</code></li>
              <li>Siga as instruções e copie o token gerado</li>
              <li>Cole o token no campo acima</li>
            </ol>
          </div>
        </div>
      </Modal>

      {/* Chats modal */}
      <Modal isOpen={!!chatsModal} onClose={() => setChatsModal(null)}
        title={`Chats de ${chatsModal?.name}`} size="md">
        <div className="space-y-2">
          {(chats as TelegramChat[]).length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={24} />}
              title="Nenhum chat encontrado"
              description="O bot ainda não foi adicionado a nenhum grupo ou canal."
            />
          ) : (
            (chats as TelegramChat[]).map((chat) => (
              <div key={chat.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Users size={14} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{chat.title}</p>
                  <p className="text-xs text-gray-500 capitalize">{chat.type}{chat.memberCount ? ` • ${chat.memberCount} membros` : ''}</p>
                </div>
              </div>
            ))
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
        <p className="text-sm text-gray-700">Remover o bot <strong>{deleteTarget?.name}</strong>?</p>
      </Modal>
    </div>
  );
};
