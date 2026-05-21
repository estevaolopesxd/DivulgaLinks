import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Clock, Calendar, Zap, Timer, Filter as FilterIcon,
  Search, MessageCircle, Send, BarChart2, Info,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { groupConfigApi, platformsApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input, TextArea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { DestinationConfig, DestinationDailyStats } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEST_TYPES: { value: DestinationConfig['destinationType']; label: string }[] = [
  { value: 'WHATSAPP_GROUP', label: 'WhatsApp - Grupo' },
  { value: 'WHATSAPP_CHANNEL', label: 'WhatsApp - Canal' },
  { value: 'TELEGRAM_GROUP', label: 'Telegram - Grupo' },
  { value: 'TELEGRAM_CHANNEL', label: 'Telegram - Canal' },
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isWhatsApp(type: string): boolean {
  return type.startsWith('WHATSAPP');
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface ConfigForm {
  destinationType: DestinationConfig['destinationType'];
  destinationId: string;
  displayName: string;
  accountId: string;
  isActive: boolean;
  // Schedules
  restrictTime: boolean;
  allowedStartTime: string;
  allowedEndTime: string;
  allowedWeekdays: number[];
  // Limits
  maxMessagesPerDay: string;
  minIntervalMinutes: string;
  // Platforms
  filterPlatforms: boolean;
  allowedPlatformIds: string[];
  // Template
  useCustomTemplate: boolean;
  customTemplate: string;
}

const emptyForm: ConfigForm = {
  destinationType: 'WHATSAPP_GROUP',
  destinationId: '',
  displayName: '',
  accountId: '',
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
};

function configToForm(c: DestinationConfig): ConfigForm {
  return {
    destinationType: c.destinationType,
    destinationId: c.destinationId,
    displayName: c.displayName,
    accountId: c.accountId,
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

function formToPayload(f: ConfigForm): Partial<DestinationConfig> {
  return {
    destinationType: f.destinationType,
    destinationId: f.destinationId,
    displayName: f.displayName,
    accountId: f.accountId,
    isActive: f.isActive,
    allowedStartTime: f.restrictTime ? f.allowedStartTime : undefined,
    allowedEndTime: f.restrictTime ? f.allowedEndTime : undefined,
    allowedWeekdays: f.allowedWeekdays,
    maxMessagesPerDay: f.maxMessagesPerDay ? Number(f.maxMessagesPerDay) : undefined,
    minIntervalMinutes: f.minIntervalMinutes ? Number(f.minIntervalMinutes) : undefined,
    allowedPlatformIds: f.filterPlatforms ? f.allowedPlatformIds : [],
    customTemplate: f.useCustomTemplate ? f.customTemplate : undefined,
  };
}

// ─── Toggle button ────────────────────────────────────────────────────────────

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string }> = ({
  checked, onChange, label,
}) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${checked ? 'bg-primary-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block w-3.5 h-3.5 mt-0.75 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} style={{ marginTop: 3 }} />
    </button>
    {label && <span className="text-sm text-gray-700">{label}</span>}
  </div>
);

// ─── Config chip ──────────────────────────────────────────────────────────────

const Chip: React.FC<{ icon: React.ReactNode; text: string; muted?: boolean }> = ({ icon, text, muted }) => (
  <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${muted ? 'bg-gray-50 text-gray-400' : 'bg-gray-100 text-gray-700'}`}>
    <span className="flex-shrink-0">{icon}</span>
    <span>{text}</span>
  </div>
);

// ─── Modal tabs ───────────────────────────────────────────────────────────────

type ConfigTab = 'identification' | 'schedules' | 'limits' | 'platforms' | 'template';

const TAB_LABELS: Record<ConfigTab, string> = {
  identification: 'Identificação',
  schedules: 'Horários',
  limits: 'Limites',
  platforms: 'Plataformas',
  template: 'Template',
};

// ─── Component ────────────────────────────────────────────────────────────────

const GroupConfig: React.FC = () => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DestinationConfig | null>(null);
  const [activeTab, setActiveTab] = useState<ConfigTab>('identification');
  const [form, setForm] = useState<ConfigForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<DestinationConfig | null>(null);
  const [statsTarget, setStatsTarget] = useState<DestinationConfig | null>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────────

  const { data: configs, isLoading } = useQuery({
    queryKey: ['group-config'],
    queryFn: () => groupConfigApi.list(),
  });

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => platformsApi.list(),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['group-config-stats', statsTarget?.id],
    queryFn: () => statsTarget ? groupConfigApi.getStats(statsTarget.id) : Promise.resolve(null),
    enabled: Boolean(statsTarget),
  });

  // ─── Mutations ────────────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: (data: Partial<DestinationConfig>) =>
      editTarget ? groupConfigApi.update(editTarget.id, data) : groupConfigApi.upsert(data),
    onSuccess: () => {
      toast.success(editTarget ? 'Configuração atualizada!' : 'Configuração criada!');
      queryClient.invalidateQueries({ queryKey: ['group-config'] });
      closeModal();
    },
    onError: () => toast.error('Erro ao salvar configuração.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => groupConfigApi.delete(id),
    onSuccess: () => {
      toast.success('Configuração removida.');
      queryClient.invalidateQueries({ queryKey: ['group-config'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover configuração.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      groupConfigApi.update(id, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-config'] });
    },
    onError: () => toast.error('Erro ao alterar status.'),
  });

  // ─── Modal helpers ────────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setActiveTab('identification');
    setModalOpen(true);
  };

  const openEdit = (c: DestinationConfig) => {
    setEditTarget(c);
    setForm(configToForm(c));
    setActiveTab('identification');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate(formToPayload(form));
  };

  const setField = <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ─── Filter ───────────────────────────────────────────────────────────────────

  const filtered = (configs ?? []).filter((c) => {
    if (search && !c.displayName.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter && c.destinationType !== typeFilter) return false;
    if (statusFilter === 'active' && !c.isActive) return false;
    if (statusFilter === 'inactive' && c.isActive) return false;
    return true;
  });

  // ─── Stats chart data ─────────────────────────────────────────────────────────

  const statsDays: DestinationDailyStats[] = statsData?.stats ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuração de Grupos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Defina regras específicas por grupo ou canal</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          Nova Configuração
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <Info size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
        <span>Configure horários, limites diários e filtros de plataforma para cada destino individualmente.</span>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search size={15} />}
            />
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: '', label: 'Todos os tipos' },
                ...DEST_TYPES,
              ]}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: '', label: 'Todos' },
                { value: 'active', label: 'Ativos' },
                { value: 'inactive', label: 'Inativos' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FilterIcon size={40} />}
          title="Nenhuma configuração encontrada"
          description="Adicione configurações para controlar o comportamento de envio por grupo"
          action={{ label: 'Nova Configuração', onClick: openCreate, icon: <Plus size={16} /> }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((cfg) => {
            const wa = isWhatsApp(cfg.destinationType);
            const daysLabel = (cfg.allowedWeekdays ?? []).length === 7
              ? 'Todos os dias'
              : (cfg.allowedWeekdays ?? []).map((d) => WEEKDAYS[d]).join(', ');

            return (
              <Card key={cfg.id} className="flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {wa ? (
                      <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                        <MessageCircle size={16} className="text-green-600" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Send size={16} className="text-blue-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{cfg.displayName}</p>
                      <Badge variant="default" className="text-xs mt-0.5">
                        {cfg.accountId}
                      </Badge>
                    </div>
                  </div>
                  <Toggle
                    checked={cfg.isActive}
                    onChange={(v) => toggleMutation.mutate({ id: cfg.id, isActive: v })}
                  />
                </div>

                {/* Config chips */}
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    icon={<Clock size={12} />}
                    text={cfg.allowedStartTime ? `${cfg.allowedStartTime} - ${cfg.allowedEndTime}` : 'Sem restrição'}
                    muted={!cfg.allowedStartTime}
                  />
                  <Chip
                    icon={<Calendar size={12} />}
                    text={daysLabel}
                    muted={(cfg.allowedWeekdays ?? []).length === 7}
                  />
                  <Chip
                    icon={<Zap size={12} />}
                    text={cfg.maxMessagesPerDay != null ? `Max ${cfg.maxMessagesPerDay}/dia` : 'Sem limite'}
                    muted={cfg.maxMessagesPerDay == null}
                  />
                  <Chip
                    icon={<Timer size={12} />}
                    text={cfg.minIntervalMinutes != null ? `Min ${cfg.minIntervalMinutes}min` : 'Sem delay'}
                    muted={cfg.minIntervalMinutes == null}
                  />
                  <Chip
                    icon={<FilterIcon size={12} />}
                    text={(cfg.allowedPlatformIds ?? []).length > 0 ? `${(cfg.allowedPlatformIds ?? []).length} plataforma${(cfg.allowedPlatformIds ?? []).length > 1 ? 's' : ''}` : 'Todas plataformas'}
                    muted={(cfg.allowedPlatformIds ?? []).length === 0}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-gray-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={14} />}
                    onClick={() => openEdit(cfg)}
                    className="flex-1"
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<BarChart2 size={14} />}
                    onClick={() => setStatsTarget(cfg)}
                    className="flex-1"
                  >
                    Estatísticas
                  </Button>
                  <button
                    title="Remover"
                    onClick={() => setDeleteTarget(cfg)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Editar Configuração' : 'Nova Configuração'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button
              type="submit"
              form="config-form"
              loading={upsertMutation.isPending}
            >
              {editTarget ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        }
      >
        {/* Tab bar */}
        <div className="flex border-b border-gray-200 -mx-6 px-6 mb-5 gap-1">
          {(Object.keys(TAB_LABELS) as ConfigTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <form id="config-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Tab 1: Identification */}
          {activeTab === 'identification' && (
            <>
              <Select
                label="Tipo de destino"
                value={form.destinationType}
                onChange={(e) => setField('destinationType', e.target.value as DestinationConfig['destinationType'])}
                options={DEST_TYPES}
                required
              />
              <Input
                label="ID do destino"
                value={form.destinationId}
                onChange={(e) => setField('destinationId', e.target.value)}
                placeholder="JID do grupo (ex: 120363...@g.us)"
                hint="JID do grupo para WhatsApp ou ID do chat para Telegram"
                required
              />
              <Input
                label="Nome amigável"
                value={form.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                placeholder="Ex: Grupo Promoções Tech"
                required
              />
              <Input
                label="Conta / Bot"
                value={form.accountId}
                onChange={(e) => setField('accountId', e.target.value)}
                placeholder="ID da conta WhatsApp ou bot Telegram"
              />
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700">Ativo</label>
                <Toggle checked={form.isActive} onChange={(v) => setField('isActive', v)} />
              </div>
            </>
          )}

          {/* Tab 2: Schedules */}
          {activeTab === 'schedules' && (
            <>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={form.restrictTime}
                  onChange={(v) => setField('restrictTime', v)}
                  label="Restringir horário de envio"
                />
              </div>
              {form.restrictTime && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Início"
                    type="time"
                    value={form.allowedStartTime}
                    onChange={(e) => setField('allowedStartTime', e.target.value)}
                  />
                  <Input
                    label="Fim"
                    type="time"
                    value={form.allowedEndTime}
                    onChange={(e) => setField('allowedEndTime', e.target.value)}
                  />
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Dias da semana permitidos</label>
                <div className="flex gap-2 flex-wrap">
                  {WEEKDAYS.map((day, idx) => {
                    const active = form.allowedWeekdays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const next = active
                            ? form.allowedWeekdays.filter((d) => d !== idx)
                            : [...form.allowedWeekdays, idx].sort();
                          setField('allowedWeekdays', next);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? 'bg-primary-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Tab 3: Limits */}
          {activeTab === 'limits' && (
            <>
              <Input
                label="Máximo de mensagens por dia"
                type="number"
                min={1}
                value={form.maxMessagesPerDay}
                onChange={(e) => setField('maxMessagesPerDay', e.target.value)}
                placeholder="Sem limite"
                hint="Deixe em branco para sem limite"
              />
              <Input
                label="Intervalo mínimo entre mensagens (minutos)"
                type="number"
                min={1}
                value={form.minIntervalMinutes}
                onChange={(e) => setField('minIntervalMinutes', e.target.value)}
                placeholder="Sem delay"
                hint="Deixe em branco para sem delay"
              />
            </>
          )}

          {/* Tab 4: Platforms */}
          {activeTab === 'platforms' && (
            <>
              <Toggle
                checked={form.filterPlatforms}
                onChange={(v) => setField('filterPlatforms', v)}
                label="Filtrar por plataformas específicas"
              />
              {form.filterPlatforms && (
                <div className="flex flex-col gap-2 mt-2">
                  {(platforms ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhuma plataforma configurada.</p>
                  ) : (
                    (platforms ?? []).map((p) => {
                      const checked = form.allowedPlatformIds.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? form.allowedPlatformIds.filter((id) => id !== p.id)
                                : [...form.allowedPlatformIds, p.id];
                              setField('allowedPlatformIds', next);
                            }}
                            className="w-4 h-4 rounded text-primary-500 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700">{p.name}</span>
                          <Badge variant="default" className="text-xs">{p.type}</Badge>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}

          {/* Tab 5: Template */}
          {activeTab === 'template' && (
            <>
              <Toggle
                checked={form.useCustomTemplate}
                onChange={(v) => setField('useCustomTemplate', v)}
                label="Usar template personalizado"
              />
              {form.useCustomTemplate && (
                <>
                  <TextArea
                    label="Template personalizado"
                    value={form.customTemplate}
                    onChange={(e) => setField('customTemplate', e.target.value)}
                    placeholder="Ex: 🔥 *{{name}}*&#10;&#10;R$ {{price}}&#10;&#10;{{url}}"
                    className="min-h-[140px] font-mono text-xs"
                  />
                  <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
                    <p className="font-medium text-gray-700">Variáveis disponíveis:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['{{name}}', '{{price}}', '{{originalPrice}}', '{{description}}', '{{url}}', '{{category}}'].map((v) => (
                        <code key={v} className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600">{v}</code>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </form>
      </Modal>

      {/* Statistics Modal */}
      <Modal
        isOpen={Boolean(statsTarget)}
        onClose={() => setStatsTarget(null)}
        title={`Estatísticas — ${statsTarget?.displayName}`}
        size="lg"
      >
        {statsLoading ? (
          <div className="space-y-3">
            <div className="animate-pulse bg-gray-200 h-48 rounded-lg" />
          </div>
        ) : (
          <>
            {statsDays.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">Sem dados disponíveis</div>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: 'Total enviadas', value: statsDays.reduce((a, d) => a + d.messagesSent, 0), color: 'text-green-600' },
                    { label: 'Total falhas', value: statsDays.reduce((a, d) => a + d.messagesFailed, 0), color: 'text-red-600' },
                    { label: 'Total cliques', value: statsDays.reduce((a, d) => a + d.clicks, 0), color: 'text-blue-600' },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className={`text-xl font-bold ${item.color}`}>{item.value.toLocaleString('pt-BR')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>

                {/* Line chart */}
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={statsDays} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value, name) => [
                        Number(value).toLocaleString('pt-BR'),
                        name === 'messagesSent' ? 'Enviadas' : name === 'messagesFailed' ? 'Falhas' : 'Cliques',
                      ]}
                      labelFormatter={(label) => formatShortDate(String(label))}
                    />
                    <Legend
                      formatter={(v) =>
                        v === 'messagesSent' ? 'Enviadas' : v === 'messagesFailed' ? 'Falhas' : 'Cliques'
                      }
                      iconType="circle"
                      iconSize={8}
                    />
                    <Line type="monotone" dataKey="messagesSent" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="messagesFailed" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </>
        )}
      </Modal>

      {/* Delete confirmation */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Confirmar exclusão"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Remover
            </Button>
          </div>
        }
      >
        <p className="text-sm text-gray-600">
          Tem certeza que deseja remover a configuração{' '}
          <span className="font-semibold text-gray-900">{deleteTarget?.displayName}</span>?
        </p>
      </Modal>
    </div>
  );
};

export default GroupConfig;
