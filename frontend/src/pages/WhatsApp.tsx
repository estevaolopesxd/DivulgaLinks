import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Smartphone, QrCode, Users, Radio, Wifi, WifiOff, Loader2, Trash2,
  RefreshCw, Settings, Clock, Calendar, Zap, Timer, Filter as FilterIcon,
  CheckCircle2, ChevronRight,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import QRCodeSVG from 'react-qr-code';
import toast from 'react-hot-toast';
import { whatsappApi, groupConfigApi, platformsApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge, statusToBadgeVariant, statusLabel } from '../components/ui/Badge';
import { Input, TextArea } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { WhatsAppAccount, WhatsAppGroup, DestinationConfig } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Config form ──────────────────────────────────────────────────────────────

interface ConfigForm {
  isActive: boolean;
  restrictTime: boolean;
  allowedStartTime: string;
  allowedEndTime: string;
  allowedWeekdays: number[];
  maxMessagesPerDay: string;
  minIntervalMinutes: string;
  filterPlatforms: boolean;
  allowedPlatformIds: string[];
  useCustomTemplate: boolean;
  customTemplate: string;
}

const emptyConfigForm = (): ConfigForm => ({
  isActive: true,
  restrictTime: false,
  allowedStartTime: '08:00',
  allowedEndTime: '22:00',
  allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
  maxMessagesPerDay: '',
  minIntervalMinutes: '',
  filterPlatforms: false,
  allowedPlatformIds: [],
  useCustomTemplate: false,
  customTemplate: '',
});

function existingToForm(c: DestinationConfig): ConfigForm {
  return {
    isActive: c.isActive,
    restrictTime: Boolean(c.allowedStartTime),
    allowedStartTime: c.allowedStartTime ?? '08:00',
    allowedEndTime: c.allowedEndTime ?? '22:00',
    allowedWeekdays: (c.allowedWeekdays ?? []).length > 0 ? (c.allowedWeekdays ?? []) : [0, 1, 2, 3, 4, 5, 6],
    maxMessagesPerDay: c.maxMessagesPerDay != null ? String(c.maxMessagesPerDay) : '',
    minIntervalMinutes: c.minIntervalMinutes != null ? String(c.minIntervalMinutes) : '',
    filterPlatforms: (c.allowedPlatformIds ?? []).length > 0,
    allowedPlatformIds: c.allowedPlatformIds ?? [],
    useCustomTemplate: Boolean(c.customTemplate),
    customTemplate: c.customTemplate ?? '',
  };
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({
  checked, onChange, label,
}) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${checked ? 'bg-primary-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ marginTop: 3 }} />
    </button>
    {label && <span className="text-sm text-gray-700">{label}</span>}
  </div>
);

// ─── Config summary chips ─────────────────────────────────────────────────────

const Chip: React.FC<{ icon: React.ReactNode; text: string; muted?: boolean }> = ({ icon, text, muted }) => (
  <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${muted ? 'bg-gray-50 text-gray-400' : 'bg-green-50 text-green-700'}`}>
    {icon}<span>{text}</span>
  </div>
);

// ─── Config tabs ──────────────────────────────────────────────────────────────

type CTab = 'horarios' | 'limites' | 'plataformas' | 'template';
const CTABS: { key: CTab; label: string }[] = [
  { key: 'horarios', label: 'Horários' },
  { key: 'limites', label: 'Limites' },
  { key: 'plataformas', label: 'Plataformas' },
  { key: 'template', label: 'Template' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export const WhatsApp: React.FC = () => {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [qrModalAccount, setQrModalAccount] = useState<WhatsAppAccount | null>(null);
  const [qrCode, setQrCode] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<string>('');
  const [groupsModal, setGroupsModal] = useState<{ account: WhatsAppAccount; type: 'groups' | 'channels' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppAccount | null>(null);

  // Config modal state
  const [configTarget, setConfigTarget] = useState<{
    group: WhatsAppGroup;
    account: WhatsAppAccount;
    type: 'WHATSAPP_GROUP' | 'WHATSAPP_CHANNEL';
    existing: DestinationConfig | null;
  } | null>(null);
  const [configForm, setConfigForm] = useState<ConfigForm>(emptyConfigForm());
  const [configTab, setConfigTab] = useState<CTab>('horarios');

  // Add account form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // ─── Queries ─────────────────────────────────────────────────────────────────

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

  // Load configs for the current account so we can show which groups are configured
  const { data: existingConfigs = [] } = useQuery({
    queryKey: ['group-config', groupsModal?.account.id],
    queryFn: () =>
      groupsModal ? groupConfigApi.list({ accountId: groupsModal.account.id }) : Promise.resolve([]),
    enabled: !!groupsModal,
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ['platforms'],
    queryFn: platformsApi.list,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────────

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
      connectSocket(id);
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

  const saveConfigMutation = useMutation({
    mutationFn: (payload: Partial<DestinationConfig>) =>
      configTarget?.existing
        ? groupConfigApi.update(configTarget.existing.id, payload)
        : groupConfigApi.upsert(payload),
    onSuccess: () => {
      toast.success('Configuração salva!');
      queryClient.invalidateQueries({ queryKey: ['group-config'] });
      setConfigTarget(null);
    },
    onError: () => toast.error('Erro ao salvar configuração.'),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (id: string) => groupConfigApi.delete(id),
    onSuccess: () => {
      toast.success('Configuração removida.');
      queryClient.invalidateQueries({ queryKey: ['group-config'] });
    },
    onError: () => toast.error('Erro ao remover configuração.'),
  });

  // ─── Socket ───────────────────────────────────────────────────────────────────

  const connectSocket = (accountId: string) => {
    if (socketRef.current) socketRef.current.disconnect();
    const socket = io(import.meta.env.VITE_SOCKET_URL ?? '', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      socket.emit('subscribe:whatsapp', accountId);
      whatsappApi.getQR(accountId).then(({ qrCode: qr }) => {
        if (qr) { setQrCode(qr); setQrStatus('Escaneie agora! O QR expira em ~20 segundos'); }
      }).catch(() => {});
    });
    socket.on('whatsapp:qr', ({ qr }: { accountId: string; qr: string }) => {
      setQrCode(qr);
      setQrStatus('Escaneie agora! O QR expira em ~20 segundos');
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

  // ─── Config modal helpers ─────────────────────────────────────────────────────

  const openConfig = (
    group: WhatsAppGroup,
    account: WhatsAppAccount,
    type: 'WHATSAPP_GROUP' | 'WHATSAPP_CHANNEL',
  ) => {
    const existing = existingConfigs.find((c) => c.destinationId === group.id) ?? null;
    setConfigTarget({ group, account, type, existing });
    setConfigForm(existing ? existingToForm(existing) : emptyConfigForm());
    setConfigTab('horarios');
  };

  const handleSaveConfig = () => {
    if (!configTarget) return;
    const f = configForm;
    const payload: Partial<DestinationConfig> = {
      destinationId: configTarget.group.id,
      destinationType: configTarget.type,
      accountId: configTarget.account.id,
      displayName: configTarget.group.name,
      isActive: f.isActive,
      allowedStartTime: f.restrictTime ? f.allowedStartTime : undefined,
      allowedEndTime: f.restrictTime ? f.allowedEndTime : undefined,
      allowedWeekdays: f.allowedWeekdays,
      maxMessagesPerDay: f.maxMessagesPerDay ? Number(f.maxMessagesPerDay) : undefined,
      minIntervalMinutes: f.minIntervalMinutes ? Number(f.minIntervalMinutes) : undefined,
      allowedPlatformIds: f.filterPlatforms ? f.allowedPlatformIds : [],
      customTemplate: f.useCustomTemplate ? f.customTemplate : undefined,
    };
    saveConfigMutation.mutate(payload);
  };

  const setF = <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) =>
    setConfigForm((f) => ({ ...f, [key]: value }));

  if (isLoading) return <PageLoader />;

  const StatusIcon = ({ status }: { status: WhatsAppAccount['status'] }) => {
    if (status === 'CONNECTED') return <Wifi size={18} className="text-green-500" />;
    if (status === 'CONNECTING') return <Loader2 size={18} className="text-blue-500 animate-spin" />;
    if (status === 'QR_PENDING') return <QrCode size={18} className="text-yellow-500" />;
    return <WifiOff size={18} className="text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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
                  onClick={() => setDeleteTarget(account)} className="ml-auto text-red-500 hover:text-red-600 hover:bg-red-50" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add account modal ─────────────────────────────────────────────────── */}
      <Modal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} title="Conectar WhatsApp" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>Cancelar</Button>
            <Button variant="primary" loading={createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName, phoneNumber: newPhone })}>
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

      {/* ── QR Code modal ────────────────────────────────────────────────────── */}
      <Modal isOpen={!!qrModalAccount} onClose={() => { setQrModalAccount(null); socketRef.current?.disconnect(); }} title="Conectar WhatsApp" size="sm">
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Smartphone size={16} />
            <span>{qrModalAccount?.phoneNumber}</span>
          </div>
          {qrCode ? (
            <div className="border-4 border-gray-200 rounded-xl p-4 bg-white shadow-sm">
              <QRCodeSVG value={qrCode} size={224} level="M" />
            </div>
          ) : (
            <div className="w-64 h-64 border-4 border-gray-200 rounded-xl flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Loader2 size={32} className="animate-spin" />
                <p className="text-xs">Gerando QR Code...</p>
              </div>
            </div>
          )}
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">Escaneie o QR Code</p>
            <p className="text-xs text-gray-500 mt-1">Abra o WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
          </div>
          {qrStatus && (
            <div className="flex items-center gap-2 bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg w-full justify-center">
              <RefreshCw size={12} className="animate-spin" />
              {qrStatus}
            </div>
          )}
        </div>
      </Modal>

      {/* ── Groups / Channels modal ───────────────────────────────────────────── */}
      <Modal
        isOpen={!!groupsModal}
        onClose={() => setGroupsModal(null)}
        title={groupsModal?.type === 'groups' ? `Grupos — ${groupsModal?.account.name}` : `Canais — ${groupsModal?.account.name}`}
        size="lg"
      >
        <div className="space-y-2">
          {(groups as WhatsAppGroup[]).length === 0 ? (
            <EmptyState
              icon={groupsModal?.type === 'groups' ? <Users size={24} /> : <Radio size={24} />}
              title={`Nenhum ${groupsModal?.type === 'groups' ? 'grupo' : 'canal'} encontrado`}
              description="A conta ainda não participa de grupos/canais, ou aguarde um momento para carregar."
            />
          ) : (
            (groups as WhatsAppGroup[]).map((g) => {
              const destType = groupsModal?.type === 'groups' ? 'WHATSAPP_GROUP' : 'WHATSAPP_CHANNEL';
              const cfg = existingConfigs.find((c) => c.destinationId === g.id);
              return (
                <div key={g.id} className="border border-gray-100 rounded-xl p-3 hover:bg-gray-50 transition-colors">
                  {/* Group header row */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      {groupsModal?.type === 'groups' ? (
                        <Users size={15} className="text-green-600" />
                      ) : (
                        <Radio size={15} className="text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{g.name}</p>
                      <p className="text-xs text-gray-400">
                        {g.participantCount !== undefined ? `${g.participantCount} participantes` : 'ID: ' + g.id.slice(0, 20) + '…'}
                      </p>
                    </div>
                    {/* Config status */}
                    {cfg ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Toggle
                          checked={cfg.isActive}
                          onChange={(v) => {
                            groupConfigApi.update(cfg.id, { isActive: v })
                              .then(() => queryClient.invalidateQueries({ queryKey: ['group-config'] }))
                              .catch(() => toast.error('Erro ao alterar status'));
                          }}
                        />
                        <button
                          onClick={() => groupsModal && openConfig(g, groupsModal.account, destType as 'WHATSAPP_GROUP' | 'WHATSAPP_CHANNEL')}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Editar configuração"
                        >
                          <Settings size={15} />
                        </button>
                        <button
                          onClick={() => deleteConfigMutation.mutate(cfg.id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Remover configuração"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : (
                      <Button
                        size="xs"
                        variant="primary"
                        icon={<Settings size={12} />}
                        onClick={() => groupsModal && openConfig(g, groupsModal.account, destType as 'WHATSAPP_GROUP' | 'WHATSAPP_CHANNEL')}
                      >
                        Configurar
                      </Button>
                    )}
                  </div>

                  {/* Config summary chips (if configured) */}
                  {cfg && (
                    <div className="flex flex-wrap gap-1 mt-2 ml-12">
                      <Chip icon={<CheckCircle2 size={10} />} text="Configurado" />
                      {cfg.allowedStartTime && (
                        <Chip icon={<Clock size={10} />} text={`${cfg.allowedStartTime}–${cfg.allowedEndTime}`} />
                      )}
                      {(cfg.allowedWeekdays ?? []).length < 7 && (
                        <Chip icon={<Calendar size={10} />} text={(cfg.allowedWeekdays ?? []).map((d) => WEEKDAYS[d]).join(', ')} />
                      )}
                      {cfg.maxMessagesPerDay != null && (
                        <Chip icon={<Zap size={10} />} text={`Máx ${cfg.maxMessagesPerDay}/dia`} />
                      )}
                      {cfg.minIntervalMinutes != null && (
                        <Chip icon={<Timer size={10} />} text={`Delay ${cfg.minIntervalMinutes}min`} />
                      )}
                      {(cfg.allowedPlatformIds ?? []).length > 0 && (
                        <Chip icon={<FilterIcon size={10} />} text={`${(cfg.allowedPlatformIds ?? []).length} plataforma(s)`} />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* ── Group Config modal ────────────────────────────────────────────────── */}
      <Modal
        isOpen={!!configTarget}
        onClose={() => setConfigTarget(null)}
        title={`Configurar: ${configTarget?.group.name}`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Toggle checked={configForm.isActive} onChange={(v) => setF('isActive', v)} />
              <span className="text-sm text-gray-600">Ativo</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfigTarget(null)}>Cancelar</Button>
              <Button variant="primary" loading={saveConfigMutation.isPending} onClick={handleSaveConfig}>
                Salvar
              </Button>
            </div>
          </div>
        }
      >
        {/* Info row */}
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-xs text-green-800">
          <ChevronRight size={13} className="text-green-500 flex-shrink-0" />
          <span>
            <strong>{configTarget?.account.name}</strong>
            {' → '}
            <strong>{configTarget?.group.name}</strong>
            {' — as campanhas que incluírem este grupo usarão estas regras.'}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 -mx-6 px-6 mb-5 gap-1">
          {CTABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setConfigTab(t.key)}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                configTab === t.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Horários */}
        {configTab === 'horarios' && (
          <div className="space-y-4">
            <Toggle
              checked={configForm.restrictTime}
              onChange={(v) => setF('restrictTime', v)}
              label="Restringir horário de envio"
            />
            {configForm.restrictTime && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Início" type="time" value={configForm.allowedStartTime}
                  onChange={(e) => setF('allowedStartTime', e.target.value)} />
                <Input label="Fim" type="time" value={configForm.allowedEndTime}
                  onChange={(e) => setF('allowedEndTime', e.target.value)} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Dias da semana</label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((day, idx) => {
                  const active = configForm.allowedWeekdays.includes(idx);
                  return (
                    <button key={idx} type="button"
                      onClick={() => {
                        const next = active
                          ? configForm.allowedWeekdays.filter((d) => d !== idx)
                          : [...configForm.allowedWeekdays, idx].sort();
                        setF('allowedWeekdays', next);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        active ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Limites */}
        {configTab === 'limites' && (
          <div className="space-y-4">
            <Input
              label="Máximo de mensagens por dia"
              type="number" min={1}
              value={configForm.maxMessagesPerDay}
              onChange={(e) => setF('maxMessagesPerDay', e.target.value)}
              placeholder="Sem limite"
              hint="Deixe em branco para sem limite"
            />
            <Input
              label="Delay mínimo entre mensagens (minutos)"
              type="number" min={1}
              value={configForm.minIntervalMinutes}
              onChange={(e) => setF('minIntervalMinutes', e.target.value)}
              placeholder="Sem delay"
              hint="Tempo mínimo entre um envio e o próximo para este grupo"
            />
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <p className="font-semibold mb-1">Dica de boas práticas:</p>
              <p>Use delay mínimo de 5–15 minutos entre mensagens para evitar banimento do número. Limite de 10–20 mensagens/dia por grupo é recomendado.</p>
            </div>
          </div>
        )}

        {/* Tab: Plataformas */}
        {configTab === 'plataformas' && (
          <div className="space-y-4">
            <Toggle
              checked={configForm.filterPlatforms}
              onChange={(v) => setF('filterPlatforms', v)}
              label="Filtrar por plataformas específicas para este grupo"
            />
            <p className="text-xs text-gray-500">
              Se ativo, apenas produtos das plataformas selecionadas abaixo serão enviados para este grupo.
              Se desativo, aceita produtos de qualquer plataforma.
            </p>
            {configForm.filterPlatforms && (
              <div className="space-y-2">
                {(platforms as { id: string; name: string; type: string }[]).length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma plataforma cadastrada. Vá em Plataformas para adicionar.</p>
                ) : (
                  (platforms as { id: string; name: string; type: string }[]).map((p) => {
                    const checked = configForm.allowedPlatformIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer select-none">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = checked
                              ? configForm.allowedPlatformIds.filter((id) => id !== p.id)
                              : [...configForm.allowedPlatformIds, p.id];
                            setF('allowedPlatformIds', next);
                          }}
                          className="w-4 h-4 rounded text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 flex-1">{p.name}</span>
                        <Badge variant="default" className="text-xs">{p.type}</Badge>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: Template */}
        {configTab === 'template' && (
          <div className="space-y-4">
            <Toggle
              checked={configForm.useCustomTemplate}
              onChange={(v) => setF('useCustomTemplate', v)}
              label="Usar template personalizado para este grupo"
            />
            <p className="text-xs text-gray-500">
              Se desativado, o template da campanha será usado. Se ativado, este template substitui o da campanha.
            </p>
            {configForm.useCustomTemplate && (
              <>
                <TextArea
                  label="Template personalizado"
                  value={configForm.customTemplate}
                  onChange={(e) => setF('customTemplate', e.target.value)}
                  placeholder={'🔥 *{{name}}*\n\n💰 R$ {{price}}\n\n🔗 {{url}}'}
                  className="min-h-[140px] font-mono text-sm"
                />
                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                  <p className="font-medium text-gray-700 mb-1.5">Variáveis disponíveis:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['{{name}}', '{{price}}', '{{originalPrice}}', '{{description}}', '{{url}}', '{{category}}'].map((v) => (
                      <code key={v} className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">{v}</code>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Delete account confirm ────────────────────────────────────────────── */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar exclusão" size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="danger" loading={deleteMutation.isPending} icon={<Trash2 size={14} />}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Excluir</Button>
          </div>
        }
      >
        <p className="text-sm text-gray-700">Tem certeza que deseja remover a conta <strong>{deleteTarget?.name}</strong>?</p>
      </Modal>
    </div>
  );
};
