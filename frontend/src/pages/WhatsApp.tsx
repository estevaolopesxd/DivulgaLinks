import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Smartphone, QrCode, Users, Radio, Wifi, WifiOff, Loader2, Trash2, RefreshCw } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { whatsappApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge, statusToBadgeVariant, statusLabel } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { WhatsAppAccount, WhatsAppGroup } from '../types';

export const WhatsApp: React.FC = () => {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [qrModalAccount, setQrModalAccount] = useState<WhatsAppAccount | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('');
  const [groupsModal, setGroupsModal] = useState<{ account: WhatsAppAccount; type: 'groups' | 'channels' } | null>(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['whatsapp'],
    queryFn: whatsappApi.list,
    retry: false,
    refetchInterval: 5000,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['whatsapp-groups', groupsModal?.account.id, groupsModal?.type],
    queryFn: () =>
      groupsModal
        ? groupsModal.type === 'groups'
          ? whatsappApi.getGroups(groupsModal.account.id)
          : whatsappApi.getChannels(groupsModal.account.id)
        : Promise.resolve([]),
    enabled: !!groupsModal,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; phoneNumber: string }) => whatsappApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('Conta adicionada!');
      setAddModalOpen(false);
      setNewName('');
      setNewPhone('');
    },
    onError: () => toast.error('Erro ao adicionar conta.'),
  });

  const initMutation = useMutation({
    mutationFn: (id: string) => whatsappApi.initialize(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      const account = (accounts as WhatsAppAccount[]).find((a) => a.id === id);
      if (account) {
        setQrModalAccount(account);
        connectSocket(id);
      }
    },
    onError: () => toast.error('Erro ao inicializar conta.'),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => whatsappApi.disconnect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('Conta desconectada.');
    },
    onError: () => toast.error('Erro ao desconectar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => whatsappApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      toast.success('Conta removida.');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover conta.'),
  });

  const connectSocket = (accountId: string) => {
    if (socketRef.current) socketRef.current.disconnect();
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? '', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('subscribe:whatsapp', accountId);
    });
    socket.on('whatsapp:qr', ({ qr }: { accountId: string; qr: string }) => {
      setQrCode(qr);
      setQrStatus('QR gerado, escaneie com seu WhatsApp');
    });
    socket.on('whatsapp:status', ({ status }: { accountId: string; status: string }) => {
      setQrStatus(status);
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
      if (status === 'CONNECTED') {
        toast.success('WhatsApp conectado com sucesso!');
        setQrModalAccount(null);
        socket.disconnect();
      }
    });
  };

  useEffect(() => {
    return () => { socketRef.current?.disconnect(); };
  }, []);

  const openQrModal = (account: WhatsAppAccount) => {
    setQrModalAccount(account);
    setQrCode(account.qrCode ?? '');
    setQrStatus('');
    if (account.status === 'QR_PENDING' && account.qrCode) {
      connectSocket(account.id);
    } else {
      initMutation.mutate(account.id);
    }
  };

  if (isLoading) return <PageLoader />;

  const StatusIcon = ({ status }: { status: WhatsAppAccount['status'] }) => {
    if (status === 'CONNECTED') return <Wifi size={18} className="text-green-500" />;
    if (status === 'CONNECTING') return <Loader2 size={18} className="text-blue-500 animate-spin" />;
    if (status === 'QR_PENDING') return <QrCode size={18} className="text-yellow-500" />;
    return <WifiOff size={18} className="text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{(accounts as WhatsAppAccount[]).length} conta{(accounts as WhatsAppAccount[]).length !== 1 ? 's' : ''}</p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddModalOpen(true)}>
          Conectar WhatsApp
        </Button>
      </div>

      {(accounts as WhatsAppAccount[]).length === 0 ? (
        <EmptyState
          icon={<Smartphone size={28} />}
          title="Nenhuma conta WhatsApp"
          description="Conecte uma conta WhatsApp para começar a enviar mensagens."
          action={{ label: 'Conectar WhatsApp', onClick: () => setAddModalOpen(true), icon: <Plus size={16} /> }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(accounts as WhatsAppAccount[]).map((account) => (
            <div key={account.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
              {/* Top */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                    <StatusIcon status={account.status} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{account.name}</p>
                    <p className="text-sm text-gray-500">{account.phoneNumber}</p>
                  </div>
                </div>
                <Badge variant={statusToBadgeVariant(account.status)} dot>
                  {statusLabel(account.status)}
                </Badge>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {account.status === 'CONNECTED' ? (
                  <>
                    <Button size="xs" variant="outline" icon={<Users size={12} />}
                      onClick={() => setGroupsModal({ account, type: 'groups' })}>
                      Grupos
                    </Button>
                    <Button size="xs" variant="outline" icon={<Radio size={12} />}
                      onClick={() => setGroupsModal({ account, type: 'channels' })}>
                      Canais
                    </Button>
                    <Button size="xs" variant="outline" icon={<WifiOff size={12} />}
                      loading={disconnectMutation.isPending}
                      onClick={() => disconnectMutation.mutate(account.id)}>
                      Desconectar
                    </Button>
                  </>
                ) : (
                  <Button size="xs" variant="primary" icon={<QrCode size={12} />}
                    loading={initMutation.isPending}
                    onClick={() => openQrModal(account)}>
                    {account.status === 'QR_PENDING' ? 'Ver QR Code' : 'Conectar'}
                  </Button>
                )}
                <Button size="xs" variant="ghost" icon={<Trash2 size={12} />}
                  onClick={() => setDeleteTarget(account)} className="ml-auto text-red-500 hover:text-red-600 hover:bg-red-50">
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add account modal */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Conectar WhatsApp" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={createMutation.isPending} onClick={() => createMutation.mutate({ name: newName, phoneNumber: newPhone })}>
              Conectar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Nome da Conta" required placeholder="Ex: Conta Principal" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input label="Número do Telefone" placeholder="+55 (11) 99999-9999" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <p className="text-xs text-gray-500">Após criar a conta, você precisará escanear um QR Code no seu WhatsApp para conectar.</p>
        </div>
      </Modal>

      {/* QR Code modal */}
      <Modal isOpen={!!qrModalAccount} onClose={() => { setQrModalAccount(null); socketRef.current?.disconnect(); }} title="Conectar WhatsApp" size="sm">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Smartphone size={16} />
            <span>{qrModalAccount?.phoneNumber}</span>
          </div>

          {qrCode ? (
            <div className="border-4 border-gray-200 rounded-xl p-2 bg-white shadow-sm">
              <img src={`data:image/png;base64,${qrCode}`} alt="QR Code" className="w-56 h-56" />
            </div>
          ) : (
            <div className="w-56 h-56 border-4 border-gray-200 rounded-xl flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Loader2 size={32} className="animate-spin" />
                <p className="text-xs">Gerando QR Code...</p>
              </div>
            </div>
          )}

          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">Escaneie o QR Code</p>
            <p className="text-xs text-gray-500 mt-1">
              Abra o WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
          </div>

          {qrStatus && (
            <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg w-full justify-center">
              <RefreshCw size={12} className="animate-spin" />
              {qrStatus}
            </div>
          )}
        </div>
      </Modal>

      {/* Groups/Channels modal */}
      <Modal isOpen={!!groupsModal} onClose={() => setGroupsModal(null)}
        title={groupsModal?.type === 'groups' ? 'Grupos do WhatsApp' : 'Canais do WhatsApp'} size="md">
        <div className="space-y-2">
          {(groups as WhatsAppGroup[]).length === 0 ? (
            <EmptyState
              icon={groupsModal?.type === 'groups' ? <Users size={24} /> : <Radio size={24} />}
              title={`Nenhum ${groupsModal?.type === 'groups' ? 'grupo' : 'canal'} encontrado`}
              description="A conta não participa de nenhum grupo/canal ainda."
            />
          ) : (
            (groups as WhatsAppGroup[]).map((g) => (
              <div key={g.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Users size={14} className="text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{g.name}</p>
                  {g.participantCount !== undefined && (
                    <p className="text-xs text-gray-500">{g.participantCount} participantes</p>
                  )}
                </div>
                <Badge variant={g.isAdmin ? 'success' : 'default'} size="sm">
                  {g.isAdmin ? 'Admin' : 'Membro'}
                </Badge>
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
        <p className="text-sm text-gray-700">Tem certeza que deseja remover a conta <strong>{deleteTarget?.name}</strong>?</p>
      </Modal>
    </div>
  );
};
