import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Play, Square, Pencil, Trash2, Megaphone, Clock, Users,
  Package, ChevronRight, X, MessageSquare, CheckCircle2, CalendarDays,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { campaignsApi, whatsappApi, telegramApi, productsApi, groupConfigApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge, statusToBadgeVariant, statusLabel } from '../components/ui/Badge';
import { Input, TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { Campaign, CampaignDestination, Product, WhatsAppAccount, WhatsAppGroup, TelegramBot, TelegramChat, DestinationConfig } from '../types';


type ModalTab = 'settings' | 'schedule' | 'destinations' | 'products';

const WEEKDAYS = [
  { value: 0, short: 'Dom' },
  { value: 1, short: 'Seg' },
  { value: 2, short: 'Ter' },
  { value: 3, short: 'Qua' },
  { value: 4, short: 'Qui' },
  { value: 5, short: 'Sex' },
  { value: 6, short: 'Sáb' },
];

interface CampaignForm {
  name: string;
  description: string;
  status: Campaign['status'];
  messageTemplate: string;
  intervalMinutes: string;
  delayBetweenMessages: string;
  restrictTime: boolean;
  allowedStartTime: string;
  allowedEndTime: string;
  allowedWeekdays: number[];
  productRepeatMode: 'ALWAYS' | 'ONCE_PER_DAY' | 'NEVER';
}

const emptyCampaignForm: CampaignForm = {
  name: '', description: '', status: 'DRAFT',
  messageTemplate: '🔥 *OFERTA DO DIA* 🔥\n\n🤩💥 *{{name}}*\n\n{{shortDescription}}\n\n{{priceBlockLines}}\n\n🛍️ Compre Aqui 👇\n{{url}}\n\n⏰ Promoção sujeita a alteração sem aviso prévio ou frete.',
  intervalMinutes: '60', delayBetweenMessages: '2000',
  restrictTime: false, allowedStartTime: '08:00', allowedEndTime: '22:00',
  allowedWeekdays: [1, 2, 3, 4, 5],
  productRepeatMode: 'ALWAYS',
};

/** Resumo legível do horário configurado */
const schedulePreview = (form: CampaignForm): string => {
  if (!form.restrictTime) return 'Sem restrição de horário';
  const days = form.allowedWeekdays.length === 7
    ? 'Todos os dias'
    : form.allowedWeekdays.length === 0
      ? 'Nenhum dia selecionado'
      : form.allowedWeekdays.map(d => WEEKDAYS[d].short).join(', ');
  return `${days} · ${form.allowedStartTime} às ${form.allowedEndTime}`;
};

const DEST_TYPES = [
  { value: 'WHATSAPP_GROUP', label: 'WhatsApp - Grupo' },
  { value: 'WHATSAPP_CHANNEL', label: 'WhatsApp - Canal' },
  { value: 'TELEGRAM_GROUP', label: 'Telegram - Grupo' },
  { value: 'TELEGRAM_CHANNEL', label: 'Telegram - Canal' },
];

export const Campaigns: React.FC = () => {
  const queryClient = useQueryClient();

  const [editTarget, setEditTarget] = useState<Campaign | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>('settings');
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [workingCampaign, setWorkingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyCampaignForm);

  // Sub-modal for adding destination
  const [addDestOpen, setAddDestOpen] = useState(false);
  const [destType, setDestType] = useState<CampaignDestination['type'] | ''>('');
  const [destAccount, setDestAccount] = useState('');
  const [selectedDestItems, setSelectedDestItems] = useState<{ id: string; name: string }[]>([]);
  const [destSearch, setDestSearch] = useState('');

  // Sub-modal for adding product
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.list,
    retry: false,
  });

  const { data: waAccounts = [] } = useQuery({
    queryKey: ['whatsapp'],
    queryFn: whatsappApi.list,
    retry: false,
  });

  const { data: tgBots = [] } = useQuery({
    queryKey: ['telegram'],
    queryFn: telegramApi.list,
    retry: false,
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 1, productSearch],
    queryFn: () => productsApi.list({ page: 1, limit: 20, search: productSearch || undefined }),
    retry: false,
  });

  // Destination group/chat lists (fetched when dest modal is open with an account selected)
  const { data: waGroups = [], isLoading: waGroupsLoading } = useQuery({
    queryKey: ['wa-groups', destAccount],
    queryFn: () => whatsappApi.getGroups(destAccount),
    enabled: !!destAccount && destType === 'WHATSAPP_GROUP',
    retry: false,
  });
  const { data: waChannels = [], isLoading: waChannelsLoading } = useQuery({
    queryKey: ['wa-channels', destAccount],
    queryFn: () => whatsappApi.getChannels(destAccount),
    enabled: !!destAccount && destType === 'WHATSAPP_CHANNEL',
    retry: false,
  });
  const { data: tgChats = [], isLoading: tgChatsLoading } = useQuery({
    queryKey: ['tg-chats', destAccount],
    queryFn: () => telegramApi.getChats(destAccount),
    enabled: !!destAccount && (destType === 'TELEGRAM_GROUP' || destType === 'TELEGRAM_CHANNEL'),
    retry: false,
  });
  const { data: destConfigs = [] } = useQuery({
    queryKey: ['dest-configs', destAccount],
    queryFn: () => groupConfigApi.list({ accountId: destAccount }),
    enabled: !!destAccount,
    retry: false,
  });

  // Full campaign detail (with destinations + products) — used in the modal tabs
  const { data: campaignDetail } = useQuery({
    queryKey: ['campaign', workingCampaign?.id],
    queryFn: () => campaignsApi.get(workingCampaign!.id),
    enabled: !!workingCampaign?.id,
    staleTime: 0,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: Omit<Campaign, 'id' | 'createdAt' | 'destinations' | 'products'>) => campaignsApi.create(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campanha criada!');
      setWorkingCampaign(created);
      setActiveTab('destinations');
    },
    onError: () => toast.error('Erro ao criar campanha.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Campaign> }) => campaignsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campanha atualizada!'); },
    onError: () => toast.error('Erro ao atualizar campanha.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campanha removida.'); setDeleteTarget(null); },
    onError: () => toast.error('Erro ao remover campanha.'),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.start(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campanha iniciada!'); },
    onError: () => toast.error('Erro ao iniciar campanha.'),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.stop(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['campaigns'] }); toast.success('Campanha pausada.'); },
    onError: () => toast.error('Erro ao pausar campanha.'),
  });

  const addDestMutation = useMutation({
    mutationFn: async ({
      campaignId, type, accountId, accountType, items,
    }: {
      campaignId: string;
      type: CampaignDestination['type'];
      accountId: string;
      accountType: string;
      items: { id: string; name: string }[];
    }) => {
      await Promise.all(
        items.map((item) =>
          campaignsApi.addDestination(campaignId, {
            type,
            destinationId: item.id,
            destinationName: item.name,
            accountId,
            accountType,
            isActive: true,
          }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', workingCampaign?.id] });
      toast.success('Destino(s) adicionado(s)!');
      clearDestModal();
    },
    onError: () => toast.error('Erro ao adicionar destino(s).'),
  });

  const removeDestMutation = useMutation({
    mutationFn: ({ cid, did }: { cid: string; did: string }) => campaignsApi.removeDestination(cid, did),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', workingCampaign?.id] });
      toast.success('Destino removido.');
    },
  });

  const addProductMutation = useMutation({
    mutationFn: async ({ cid, pids }: { cid: string; pids: string[] }) => {
      await Promise.all(pids.map((pid) => campaignsApi.addProduct(cid, pid)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', workingCampaign?.id] });
      toast.success('Produto(s) adicionado(s)!');
      setSelectedProductIds([]);
    },
    onError: () => toast.error('Erro ao adicionar produto(s).'),
  });

  const removeProductMutation = useMutation({
    mutationFn: ({ cid, pid }: { cid: string; pid: string }) => campaignsApi.removeProduct(cid, pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', workingCampaign?.id] });
      toast.success('Produto removido.');
    },
  });

  const openCreate = () => {
    setEditTarget(null);
    setWorkingCampaign(null);
    setForm(emptyCampaignForm);
    setActiveTab('settings');
    setAddModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditTarget(c);
    setWorkingCampaign(c);
    setForm({
      name: c.name, description: c.description ?? '', status: c.status,
      messageTemplate: c.messageTemplate, intervalMinutes: String(c.intervalMinutes),
      delayBetweenMessages: String(c.delayBetweenMessages),
      restrictTime: !!(c.allowedStartTime && c.allowedEndTime),
      allowedStartTime: c.allowedStartTime ?? '08:00',
      allowedEndTime: c.allowedEndTime ?? '22:00',
      allowedWeekdays: c.allowedWeekdays ?? [1, 2, 3, 4, 5],
      productRepeatMode: c.productRepeatMode ?? 'ALWAYS',
    });
    setActiveTab('settings');
    setAddModalOpen(true);
  };

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      status: form.status,
      messageTemplate: form.messageTemplate,
      intervalMinutes: parseInt(form.intervalMinutes),
      delayBetweenMessages: parseInt(form.delayBetweenMessages),
      isActive: form.status === 'ACTIVE',
      platforms: [],
      allowedStartTime: form.restrictTime ? form.allowedStartTime : undefined,
      allowedEndTime: form.restrictTime ? form.allowedEndTime : undefined,
      allowedWeekdays: form.restrictTime ? form.allowedWeekdays : [],
      productRepeatMode: form.productRepeatMode,
    };
    if (workingCampaign) {
      updateMutation.mutate({ id: workingCampaign.id, data: payload });
      setActiveTab('schedule');
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleAddDest = () => {
    if (!workingCampaign || !destType || !destAccount || selectedDestItems.length === 0) return;
    const accountType = destType.startsWith('WHATSAPP') ? 'WHATSAPP' : 'TELEGRAM';
    addDestMutation.mutate({
      campaignId: workingCampaign.id,
      type: destType as CampaignDestination['type'],
      accountId: destAccount,
      accountType,
      items: selectedDestItems,
    });
  };

  // Prefer full detail (with destinations/products) over the list item
  const currentCampaignData = campaignDetail ?? workingCampaign;

  // Normalise the group/channel/chat list shown in the add-destination modal
  const rawDestList: { id: string; name: string; participantCount?: number }[] =
    destType === 'WHATSAPP_GROUP'
      ? (waGroups as WhatsAppGroup[])
      : destType === 'WHATSAPP_CHANNEL'
        ? (waChannels as WhatsAppGroup[])
        : (tgChats as TelegramChat[]).map((c) => ({ id: c.id, name: c.title, participantCount: c.memberCount }));

  const destListLoading =
    destType === 'WHATSAPP_GROUP' ? waGroupsLoading :
    destType === 'WHATSAPP_CHANNEL' ? waChannelsLoading :
    tgChatsLoading;

  const filteredDestList = rawDestList.filter((item) =>
    !destSearch || item.name.toLowerCase().includes(destSearch.toLowerCase()),
  );

  const clearDestModal = () => {
    setAddDestOpen(false);
    setDestType(''); setDestAccount(''); setSelectedDestItems([]); setDestSearch('');
  };

  if (isLoading) return <PageLoader />;

  const tabs: { key: ModalTab; label: string; icon: React.ReactNode }[] = [
    { key: 'settings', label: 'Configurações', icon: <Pencil size={14} /> },
    { key: 'schedule', label: 'Horário', icon: <CalendarDays size={14} /> },
    { key: 'destinations', label: 'Destinos', icon: <Users size={14} /> },
    { key: 'products', label: 'Produtos', icon: <Package size={14} /> },
  ];

  const statusOptions = [
    { value: 'DRAFT', label: 'Rascunho' },
    { value: 'ACTIVE', label: 'Ativo' },
    { value: 'PAUSED', label: 'Pausado' },
    { value: 'COMPLETED', label: 'Concluído' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{(campaigns as Campaign[]).length} campanha{(campaigns as Campaign[]).length !== 1 ? 's' : ''}</p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={openCreate}>
          Nova Campanha
        </Button>
      </div>

      {(campaigns as Campaign[]).length === 0 ? (
        <EmptyState
          icon={<Megaphone size={28} />}
          title="Nenhuma campanha criada"
          description="Crie sua primeira campanha para começar a automatizar o envio de produtos."
          action={{ label: 'Nova Campanha', onClick: openCreate, icon: <Plus size={16} /> }}
        />
      ) : (
        <div className="space-y-3">
          {(campaigns as Campaign[]).map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${c.status === 'ACTIVE' ? 'bg-green-50 border border-green-200' : c.status === 'PAUSED' ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <Megaphone size={20} className={c.status === 'ACTIVE' ? 'text-green-500' : c.status === 'PAUSED' ? 'text-orange-500' : 'text-gray-400'} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{c.name}</h3>
                    <Badge variant={statusToBadgeVariant(c.status)} dot>{statusLabel(c.status)}</Badge>
                  </div>
                  {c.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{c.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Clock size={11} />{c.intervalMinutes} min de intervalo</span>
                    <span className="flex items-center gap-1"><Users size={11} />{c.destinations?.length ?? 0} destino{(c.destinations?.length ?? 0) !== 1 ? 's' : ''}</span>
                    <span className="flex items-center gap-1"><Package size={11} />{c.products?.length ?? 0} produto{(c.products?.length ?? 0) !== 1 ? 's' : ''}</span>
                    {c.allowedStartTime && c.allowedEndTime && (
                      <span className="flex items-center gap-1 text-primary-500 font-medium">
                        <CalendarDays size={11} />
                        {c.allowedStartTime} – {c.allowedEndTime}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {c.status === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" icon={<Square size={14} />} loading={stopMutation.isPending} onClick={() => stopMutation.mutate(c.id)}>Pausar</Button>
                  ) : (
                    <Button size="sm" variant="primary" icon={<Play size={14} />} loading={startMutation.isPending} onClick={() => startMutation.mutate(c.id)}>Iniciar</Button>
                  )}
                  <Button size="sm" variant="outline" icon={<Pencil size={14} />} onClick={() => openEdit(c)}>Editar</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleteTarget(c)} className="text-red-500 hover:text-red-600 hover:bg-red-50" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => { setAddModalOpen(false); setEditTarget(null); setWorkingCampaign(null); }}
        title={editTarget ? 'Editar Campanha' : 'Nova Campanha'}
        size="xl"
      >
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 -mx-6 px-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.key !== 'settings' && tab.key !== 'schedule' && !workingCampaign) {
                  toast.error('Salve as configurações primeiro.');
                  return;
                }
                setActiveTab(tab.key);
              }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.icon}
              {tab.label}
              {tab.key !== 'settings' && !workingCampaign && (
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 ml-0.5" />
              )}
            </button>
          ))}
        </div>

        {/* Settings tab */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSettingsSubmit} className="space-y-4">
            <Input label="Nome da Campanha" required value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextArea label="Descrição" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            <Select label="Status" options={statusOptions} value={form.status} onChange={(e) => setForm(f => ({ ...f, status: e.target.value as Campaign['status'] }))} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Intervalo (minutos)" type="number" required value={form.intervalMinutes}
                onChange={(e) => setForm(f => ({ ...f, intervalMinutes: e.target.value }))}
                hint="Intervalo entre ciclos de envio" />
              <Input label="Delay entre mensagens (ms)" type="number" required value={form.delayBetweenMessages}
                onChange={(e) => setForm(f => ({ ...f, delayBetweenMessages: e.target.value }))}
                hint="Tempo entre cada mensagem" />
            </div>
            {/* Product repeat mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repetição de produto por destino
              </label>
              <div className="space-y-2">
                {([
                  { value: 'ALWAYS',       label: 'Sempre repetir',    desc: 'Envia todos os produtos a cada ciclo, sem restrição de histórico' },
                  { value: 'ONCE_PER_DAY', label: 'Uma vez por dia',   desc: 'Cada produto é enviado no máximo 1× por dia por grupo/canal' },
                  { value: 'NEVER',        label: 'Nunca repetir',     desc: 'Uma vez enviado a um destino, o produto nunca mais aparece nele' },
                ] as { value: CampaignForm['productRepeatMode']; label: string; desc: string }[]).map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                      form.productRepeatMode === value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="productRepeatMode"
                      value={value}
                      checked={form.productRepeatMode === value}
                      onChange={() => setForm((f) => ({ ...f, productRepeatMode: value }))}
                      className="mt-0.5 accent-primary-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <TextArea
                label="Template da Mensagem"
                required
                value={form.messageTemplate}
                onChange={(e) => setForm(f => ({ ...f, messageTemplate: e.target.value }))}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['{{name}}', '{{description}}', '{{shortDescription}}', '{{price}}', '{{originalPrice}}', '{{priceBlock}}', '{{priceBlockLines}}', '{{discount}}', '{{url}}'].map((v) => (
                  <button key={v} type="button"
                    onClick={() => setForm(f => ({ ...f, messageTemplate: f.messageTemplate + v }))}
                    className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono hover:bg-blue-100 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Clique nas variáveis para inserir no template</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => { setAddModalOpen(false); setWorkingCampaign(null); }}>Cancelar</Button>
              <Button variant="primary" type="submit" loading={createMutation.isPending || updateMutation.isPending}
                icon={<ChevronRight size={15} />} iconPosition="right">
                {workingCampaign ? 'Salvar e Continuar →' : 'Criar e Continuar →'}
              </Button>
            </div>
          </form>
        )}

        {/* Schedule tab */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            {/* Toggle de restrição */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-900">Restringir horário de envio</p>
                <p className="text-xs text-gray-500 mt-0.5">Define em quais horários e dias a campanha pode disparar</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, restrictTime: !f.restrictTime }))}
                className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none ${form.restrictTime ? 'bg-primary-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${form.restrictTime ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {form.restrictTime && (
              <>
                {/* Horário */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Clock size={15} className="text-primary-500" />
                    Janela de horário
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Início</label>
                      <input
                        type="time"
                        value={form.allowedStartTime}
                        onChange={(e) => setForm(f => ({ ...f, allowedStartTime: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fim</label>
                      <input
                        type="time"
                        value={form.allowedEndTime}
                        onChange={(e) => setForm(f => ({ ...f, allowedEndTime: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Dias da semana */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <CalendarDays size={15} className="text-primary-500" />
                    Dias permitidos
                  </p>
                  <div className="flex gap-2">
                    {WEEKDAYS.map((day) => {
                      const active = form.allowedWeekdays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            allowedWeekdays: active
                              ? f.allowedWeekdays.filter(d => d !== day.value)
                              : [...f.allowedWeekdays, day.value].sort(),
                          }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                            active
                              ? 'bg-primary-500 border-primary-500 text-white shadow-sm'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-500'
                          }`}
                        >
                          {day.short}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setForm(f => ({ ...f, allowedWeekdays: [1,2,3,4,5] }))}
                      className="text-xs text-primary-600 hover:underline">Seg–Sex</button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, allowedWeekdays: [0,1,2,3,4,5,6] }))}
                      className="text-xs text-primary-600 hover:underline">Todos</button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={() => setForm(f => ({ ...f, allowedWeekdays: [] }))}
                      className="text-xs text-gray-400 hover:underline">Limpar</button>
                  </div>
                </div>
              </>
            )}

            {/* Preview */}
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-xs text-blue-600 font-medium">Resumo do agendamento</p>
              <p className="text-sm text-blue-800 mt-0.5 font-semibold">{schedulePreview(form)}</p>
              {form.restrictTime && (
                <p className="text-xs text-blue-500 mt-1">
                  Fora dessa janela, o bot aguarda automaticamente até o próximo horário permitido.
                </p>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setActiveTab('settings')}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Voltar
              </button>
              <Button variant="primary" icon={<ChevronRight size={15} />} iconPosition="right"
                onClick={() => {
                  if (!workingCampaign) { return; }
                  updateMutation.mutate({
                    id: workingCampaign.id,
                    data: {
                      allowedStartTime: form.restrictTime ? form.allowedStartTime : undefined,
                      allowedEndTime: form.restrictTime ? form.allowedEndTime : undefined,
                      allowedWeekdays: form.restrictTime ? form.allowedWeekdays : [],
                    },
                  });
                  setActiveTab('destinations');
                }}
              >
                Salvar e Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Destinations tab */}
        {activeTab === 'destinations' && currentCampaignData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">{currentCampaignData.destinations?.length ?? 0} destino{(currentCampaignData.destinations?.length ?? 0) !== 1 ? 's' : ''} adicionado{(currentCampaignData.destinations?.length ?? 0) !== 1 ? 's' : ''}</p>
              <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAddDestOpen(true)}>
                Adicionar Destino
              </Button>
            </div>
            <div className="space-y-2">
              {(currentCampaignData.destinations ?? []).length === 0 ? (
                <EmptyState icon={<Users size={22} />} title="Nenhum destino" description="Adicione grupos ou canais para onde as mensagens serão enviadas." />
              ) : (
                (currentCampaignData.destinations ?? []).map((d) => (
                  <div key={d.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <MessageSquare size={14} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{d.destinationName}</p>
                      <p className="text-xs text-gray-500">{DEST_TYPES.find(t => t.value === d.type)?.label ?? d.type}</p>
                    </div>
                    <button onClick={() => removeDestMutation.mutate({ cid: currentCampaignData.id, did: d.id })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setActiveTab('settings')}>Voltar</Button>
              <Button variant="primary" icon={<ChevronRight size={15} />} iconPosition="right" onClick={() => setActiveTab('products')}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Products tab */}
        {activeTab === 'products' && currentCampaignData && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">{currentCampaignData.products?.length ?? 0} produto{(currentCampaignData.products?.length ?? 0) !== 1 ? 's' : ''} adicionado{(currentCampaignData.products?.length ?? 0) !== 1 ? 's' : ''}</p>
              <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAddProductOpen(true)}>
                Adicionar Produto
              </Button>
            </div>
            <div className="space-y-2">
              {(currentCampaignData.products ?? []).length === 0 ? (
                <EmptyState icon={<Package size={22} />} title="Nenhum produto" description="Adicione produtos que serão divulgados por esta campanha." />
              ) : (
                (currentCampaignData.products ?? []).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg">
                    <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                      {p.imageUrl ? <img src={p.imageUrl} className="w-8 h-8 rounded object-cover" alt="" /> : <Package size={14} className="text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.title}</p>
                      <p className="text-xs text-gray-500">R$ {(p.price ?? 0).toFixed(2)}</p>
                    </div>
                    <button onClick={() => removeProductMutation.mutate({ cid: currentCampaignData.id, pid: p.id })}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setActiveTab('destinations')}>Voltar</Button>
              <Button variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => { setAddModalOpen(false); setWorkingCampaign(null); toast.success('Campanha salva com sucesso!'); }}>
                Concluir
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add destination sub-modal */}
      <Modal isOpen={addDestOpen} onClose={clearDestModal} title="Adicionar Destino" size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={clearDestModal}>Cancelar</Button>
            <Button variant="primary" loading={addDestMutation.isPending} disabled={!destType || !destAccount || selectedDestItems.length === 0} onClick={handleAddDest}>
              {selectedDestItems.length > 1 ? `Adicionar ${selectedDestItems.length} destinos` : 'Adicionar'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Step 1 – type */}
          <Select
            label="Tipo de Destino"
            required
            placeholder="Selecione..."
            options={DEST_TYPES}
            value={destType}
            onChange={(e) => {
              setDestType(e.target.value as CampaignDestination['type']);
              setDestAccount(''); setSelectedDestItems([]); setDestSearch('');
            }}
          />

          {/* Step 2 – account */}
          {destType && (
            destType.startsWith('WHATSAPP') ? (
              <Select
                label="Conta WhatsApp"
                required
                placeholder="Selecione a conta..."
                value={destAccount}
                onChange={(e) => { setDestAccount(e.target.value); setSelectedDestItems([]); setDestSearch(''); }}
                options={(waAccounts as WhatsAppAccount[])
                  .filter((a) => a.status === 'CONNECTED')
                  .map((a) => ({ value: a.id, label: `${a.name} (${a.phoneNumber})` }))}
              />
            ) : (
              <Select
                label="Bot Telegram"
                required
                placeholder="Selecione o bot..."
                value={destAccount}
                onChange={(e) => { setDestAccount(e.target.value); setSelectedDestItems([]); setDestSearch(''); }}
                options={(tgBots as TelegramBot[]).map((b) => ({ value: b.id, label: `${b.name} (@${b.username ?? '?'})` }))}
              />
            )
          )}

          {/* Step 3 – pick from list */}
          {destType && destAccount && (
            <>
              <Input
                placeholder={`Buscar ${destType.includes('CHANNEL') ? 'canal' : 'grupo'}...`}
                value={destSearch}
                onChange={(e) => setDestSearch(e.target.value)}
              />

              {/* Select-all header */}
              {!destListLoading && filteredDestList.length > 0 && (() => {
                const available = filteredDestList.filter(
                  (i) => !currentCampaignData?.destinations?.some((d) => d.destinationId === i.id),
                );
                const allChecked = available.length > 0 && available.every((i) => selectedDestItems.some((s) => s.id === i.id));
                return (
                  <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-100">
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDestItems((prev) => {
                              const ids = new Set(prev.map((p) => p.id));
                              return [...prev, ...available.filter((a) => !ids.has(a.id))];
                            });
                          } else {
                            const ids = new Set(available.map((a) => a.id));
                            setSelectedDestItems((prev) => prev.filter((p) => !ids.has(p.id)));
                          }
                        }}
                        className="accent-primary-500"
                      />
                      Selecionar todos ({available.length} disponíveis)
                    </label>
                    {selectedDestItems.length > 0 && (
                      <span className="text-xs font-medium text-primary-600">
                        {selectedDestItems.length} selecionado{selectedDestItems.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                {destListLoading ? (
                  <div className="text-center py-8 text-sm text-gray-400">Carregando grupos...</div>
                ) : filteredDestList.length === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">
                    {destSearch ? 'Nenhum resultado' : 'Nenhum grupo/canal encontrado'}
                  </div>
                ) : (
                  filteredDestList.map((item) => {
                    const hasConfig = (destConfigs as DestinationConfig[]).some((c) => c.destinationId === item.id);
                    const alreadyAdded = currentCampaignData?.destinations?.some((d) => d.destinationId === item.id);
                    const isChecked = selectedDestItems.some((s) => s.id === item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                          alreadyAdded
                            ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                            : isChecked
                              ? 'border-primary-400 bg-primary-50'
                              : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={!!alreadyAdded}
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDestItems((prev) => [...prev, { id: item.id, name: item.name }]);
                            } else {
                              setSelectedDestItems((prev) => prev.filter((s) => s.id !== item.id));
                            }
                          }}
                          className="accent-primary-500 flex-shrink-0"
                        />
                        {/* Avatar */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-primary-100' : 'bg-gray-100'}`}>
                          <MessageSquare size={13} className={isChecked ? 'text-primary-600' : 'text-gray-400'} />
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isChecked ? 'text-primary-700' : 'text-gray-800'}`}>
                            {item.name}
                          </p>
                          {item.participantCount != null && (
                            <p className="text-xs text-gray-400">{item.participantCount} participante{item.participantCount !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                        {/* Badges */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {hasConfig && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Configurado</span>
                          )}
                          {alreadyAdded && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Já adicionado</span>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Add product sub-modal */}
      <Modal
        isOpen={addProductOpen}
        onClose={() => { setAddProductOpen(false); setSelectedProductIds([]); }}
        title="Adicionar Produto"
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-400">
              {selectedProductIds.length > 0 ? `${selectedProductIds.length} selecionado${selectedProductIds.length !== 1 ? 's' : ''}` : 'Nenhum selecionado'}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setAddProductOpen(false); setSelectedProductIds([]); }}>Fechar</Button>
              <Button
                variant="primary"
                loading={addProductMutation.isPending}
                disabled={selectedProductIds.length === 0 || !currentCampaignData}
                onClick={() => {
                  if (currentCampaignData && selectedProductIds.length > 0) {
                    addProductMutation.mutate({ cid: currentCampaignData.id, pids: selectedProductIds });
                  }
                }}
              >
                {selectedProductIds.length > 1 ? `Adicionar ${selectedProductIds.length} produtos` : 'Adicionar'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <Input placeholder="Buscar produto..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />

          {/* Select-all header */}
          {(productsData?.data ?? []).length > 0 && (() => {
            const available = (productsData?.data ?? []).filter(
              (p) => !currentCampaignData?.products?.some((cp) => cp.id === p.id),
            );
            const allChecked = available.length > 0 && available.every((p) => selectedProductIds.includes(p.id));
            return (
              <div className="flex items-center justify-between px-1 pb-1 border-b border-gray-100">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProductIds((prev) => {
                          const ids = new Set(prev);
                          available.forEach((p) => ids.add(p.id));
                          return [...ids];
                        });
                      } else {
                        const ids = new Set(available.map((p) => p.id));
                        setSelectedProductIds((prev) => prev.filter((id) => !ids.has(id)));
                      }
                    }}
                    className="accent-primary-500"
                  />
                  Selecionar todos ({available.length} disponíveis)
                </label>
                {selectedProductIds.length > 0 && (
                  <span className="text-xs font-medium text-primary-600">{selectedProductIds.length} selecionado{selectedProductIds.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            );
          })()}

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {(productsData?.data ?? []).map((p: Product) => {
              const alreadyAdded = currentCampaignData?.products?.some((cp) => cp.id === p.id);
              const isChecked = selectedProductIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-2.5 border rounded-lg transition-all cursor-pointer ${
                    alreadyAdded
                      ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                      : isChecked
                        ? 'border-primary-400 bg-primary-50'
                        : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={!!alreadyAdded}
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProductIds((prev) => [...prev, p.id]);
                      } else {
                        setSelectedProductIds((prev) => prev.filter((id) => id !== p.id));
                      }
                    }}
                    className="accent-primary-500 flex-shrink-0"
                  />
                  <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {p.imageUrl ? <img src={p.imageUrl} className="w-10 h-10 rounded object-cover" alt="" /> : <Package size={16} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isChecked ? 'text-primary-700' : 'text-gray-800'}`}>{p.title}</p>
                    <p className="text-xs text-gray-500">R$ {(p.price ?? 0).toFixed(2)}</p>
                  </div>
                  {alreadyAdded && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex-shrink-0">Já adicionado</span>
                  )}
                </label>
              );
            })}
          </div>
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
        <p className="text-sm text-gray-700">Excluir a campanha <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.</p>
      </Modal>
    </div>
  );
};
