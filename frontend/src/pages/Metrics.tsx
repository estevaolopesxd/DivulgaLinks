import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Send, XCircle, MousePointer, CheckCircle, TrendingUp, Megaphone,
  MapPin, Filter,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { metricsApi, campaignsApi, platformsApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import type { MessageVolumePoint, CampaignMetric, DestinationMetric, PlatformMetric, HourlyPoint, MetricsSummary, TopProduct } from '../types';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { start: toDateInputValue(start), end: toDateInputValue(end) };
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtNum(n: number): string {
  return n.toLocaleString('pt-BR');
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  iconBg: string;
  loading?: boolean;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, iconBg, loading }) => (
  <Card>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
        {loading ? (
          <Skeleton className="h-8 w-20 mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        )}
      </div>
      <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg}`}>{icon}</div>
    </div>
  </Card>
);

// ─── Destination type badge ───────────────────────────────────────────────────

function destTypeBadge(type: string) {
  if (type.startsWith('WHATSAPP')) return <Badge variant="success">{type.replace('WHATSAPP_', 'WA ')}</Badge>;
  return <Badge variant="info">{type.replace('TELEGRAM_', 'TG ')}</Badge>;
}

// ─── Tabs type ───────────────────────────────────────────────────────────────

type TableTab = 'destinos' | 'plataformas' | 'produtos';

// ─── Component ────────────────────────────────────────────────────────────────

const Metrics: React.FC = () => {
  const dates = defaultDates();

  // Filter state
  const [startDate, setStartDate] = useState(dates.start);
  const [endDate, setEndDate] = useState(dates.end);
  const [granularity, setGranularity] = useState('day');
  const [campaignId, setCampaignId] = useState('');
  const [platformId, setPlatformId] = useState('');

  // Applied filters (only update on "Aplicar")
  const [applied, setApplied] = useState({
    startDate: dates.start,
    endDate: dates.end,
    granularity: 'day',
    campaignId: '',
    platformId: '',
  });

  const [tableTab, setTableTab] = useState<TableTab>('destinos');

  // ─── Reference data ──────────────────────────────────────────────────────────

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.list(),
  });

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => platformsApi.list(),
  });

  // ─── Metrics queries ─────────────────────────────────────────────────────────

  const baseParams = { startDate: applied.startDate, endDate: applied.endDate };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['metrics', 'summary', applied],
    queryFn: () => metricsApi.getSummary(baseParams),
  });

  const { data: volume, isLoading: volumeLoading } = useQuery({
    queryKey: ['metrics', 'volume', applied],
    queryFn: () => metricsApi.getVolume({
      ...baseParams,
      granularity: applied.granularity,
      ...(applied.campaignId ? { campaignId: applied.campaignId } : {}),
      ...(applied.platformId ? { platformId: applied.platformId } : {}),
    }),
  });

  const { data: hourly, isLoading: hourlyLoading } = useQuery({
    queryKey: ['metrics', 'hourly', applied],
    queryFn: () => metricsApi.getHourly({
      ...baseParams,
      ...(applied.campaignId ? { campaignId: applied.campaignId } : {}),
    }),
  });

  const { data: campaignMetrics, isLoading: campaignMetricsLoading } = useQuery({
    queryKey: ['metrics', 'campaigns', applied],
    queryFn: () => metricsApi.getCampaigns({
      ...baseParams,
      ...(applied.campaignId ? { campaignId: applied.campaignId } : {}),
    }),
  });

  const { data: destMetrics, isLoading: destLoading } = useQuery({
    queryKey: ['metrics', 'destinations', applied],
    queryFn: () => metricsApi.getDestinations(baseParams),
  });

  const { data: platformMetrics, isLoading: platformMetricsLoading } = useQuery({
    queryKey: ['metrics', 'platforms', applied],
    queryFn: () => metricsApi.getPlatforms(baseParams),
  });

  const { data: topProducts, isLoading: topLoading } = useQuery({
    queryKey: ['metrics', 'top-products', applied],
    queryFn: () => metricsApi.getTopProducts({ ...baseParams, limit: 20 }),
  });

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const applyFilters = () => {
    setApplied({ startDate, endDate, granularity, campaignId, platformId });
  };

  const clearFilters = () => {
    const d = defaultDates();
    setStartDate(d.start);
    setEndDate(d.end);
    setGranularity('day');
    setCampaignId('');
    setPlatformId('');
    setApplied({ startDate: d.start, endDate: d.end, granularity: 'day', campaignId: '', platformId: '' });
  };

  // ─── Computed ─────────────────────────────────────────────────────────────────

  const volumeData: MessageVolumePoint[] = volume ?? [];
  const hourlyData: HourlyPoint[] = hourly ?? [];
  const campaignData: CampaignMetric[] = campaignMetrics ?? [];
  const destData: DestinationMetric[] = destMetrics ?? [];
  const platformData: PlatformMetric[] = platformMetrics ?? [];
  const topData: TopProduct[] = topProducts ?? [];
  const summaryData: MetricsSummary | undefined = summary;

  // Fill missing hours 0-23
  const hourlyFull = Array.from({ length: 24 }, (_, h) => {
    const found = hourlyData.find((p) => p.hour === h);
    return { hour: `${String(h).padStart(2, '0')}h`, count: found?.count ?? 0 };
  });

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Métricas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Análise detalhada de disparos</p>
      </div>

      {/* Filter bar */}
      <Card>
        <div className="flex flex-wrap gap-3 items-end">
          <Input
            label="Data inicial"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            containerClassName="w-40"
          />
          <Input
            label="Data final"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            containerClassName="w-40"
          />
          <Select
            label="Granularidade"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
            options={[
              { value: 'day', label: 'Dia' },
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mês' },
            ]}
            containerClassName="w-36"
          />
          <Select
            label="Campanha"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            options={[
              { value: '', label: 'Todas' },
              ...(campaigns ?? []).map((c) => ({ value: c.id, label: c.name })),
            ]}
            containerClassName="w-48"
          />
          <Select
            label="Plataforma"
            value={platformId}
            onChange={(e) => setPlatformId(e.target.value)}
            options={[
              { value: '', label: 'Todas' },
              ...(platforms ?? []).map((p) => ({ value: p.id, label: p.name })),
            ]}
            containerClassName="w-44"
          />
          <div className="flex gap-2 pb-0.5">
            <Button onClick={applyFilters} icon={<Filter size={15} />}>
              Aplicar Filtros
            </Button>
            <Button variant="ghost" onClick={clearFilters}>
              Limpar
            </Button>
          </div>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <SummaryCard
          title="Total Enviadas"
          value={fmtNum(summaryData?.totalSent ?? 0)}
          icon={<Send size={18} className="text-green-600" />}
          iconBg="bg-green-50"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Total Falhas"
          value={fmtNum(summaryData?.totalFailed ?? 0)}
          icon={<XCircle size={18} className="text-red-600" />}
          iconBg="bg-red-50"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Total Cliques"
          value={fmtNum(summaryData?.totalClicks ?? 0)}
          icon={<MousePointer size={18} className="text-blue-600" />}
          iconBg="bg-blue-50"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Taxa de Entrega"
          value={fmtPct(summaryData?.deliveryRate ?? 0)}
          icon={<CheckCircle size={18} className="text-green-600" />}
          iconBg="bg-green-50"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Taxa de Cliques"
          value={fmtPct(summaryData?.clickRate ?? 0)}
          icon={<TrendingUp size={18} className="text-blue-600" />}
          iconBg="bg-blue-50"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Campanhas Ativas"
          value={fmtNum(summaryData?.activeCampaigns ?? 0)}
          icon={<Megaphone size={18} className="text-purple-600" />}
          iconBg="bg-purple-50"
          loading={summaryLoading}
        />
        <SummaryCard
          title="Destinos Ativos"
          value={fmtNum(summaryData?.activeDestinations ?? 0)}
          icon={<MapPin size={18} className="text-orange-600" />}
          iconBg="bg-orange-50"
          loading={summaryLoading}
        />
      </div>

      {/* Volume chart — full width */}
      <Card>
        <CardHeader title="Volume de Mensagens" subtitle="Enviadas e falhas ao longo do tempo" />
        {volumeLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : volumeData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-gray-400 text-sm">Sem dados para o período selecionado</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={volumeData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatShortDate}
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value, name) => [fmtNum(Number(value)), name === 'sent' ? 'Enviadas' : 'Falhas']}
                labelFormatter={(label) => formatShortDate(String(label))}
              />
              <Legend
                formatter={(value) => (value === 'sent' ? 'Enviadas' : 'Falhas')}
                iconType="circle"
                iconSize={8}
              />
              <Area type="monotone" dataKey="sent" stroke="#22c55e" strokeWidth={2} fill="url(#colorSent)" />
              <Area type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} fill="url(#colorFailed)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Second row: hourly + campaign performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly distribution */}
        <Card>
          <CardHeader title="Distribuição por Hora" subtitle="Disparos por hora do dia" />
          {hourlyLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyFull} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => [fmtNum(Number(v)), 'Disparos']} />
                <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Campaign performance */}
        <Card>
          <CardHeader title="Performance por Campanha" subtitle="Mensagens enviadas por campanha" />
          {campaignMetricsLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : campaignData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                layout="vertical"
                data={campaignData.slice(0, 8)}
                margin={{ top: 5, right: 20, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={100}
                />
                <Tooltip formatter={(v) => [fmtNum(Number(v)), 'Enviadas']} />
                <Bar dataKey="sent" fill="#0ea5e9" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Tables section */}
      <Card padding={false}>
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['destinos', 'plataformas', 'produtos'] as TableTab[]).map((tab) => {
            const labels: Record<TableTab, string> = {
              destinos: 'Por Destino',
              plataformas: 'Por Plataforma',
              produtos: 'Top Produtos',
            };
            return (
              <button
                key={tab}
                onClick={() => setTableTab(tab)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tableTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Destinos */}
        {tableTab === 'destinos' && (
          <div className="overflow-x-auto">
            {destLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : destData.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Sem dados para o período</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Destino</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Enviadas</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Falhas</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliques</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Taxa de entrega</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {destData.map((d) => {
                    const total = d.sent + d.failed;
                    const rate = total > 0 ? (d.sent / total) * 100 : 0;
                    return (
                      <tr key={d.destinationId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                        <td className="px-4 py-3">{destTypeBadge(d.type)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtNum(d.sent)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{fmtNum(d.failed)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{fmtNum(d.clicks)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div
                                className="bg-green-500 h-1.5 rounded-full"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-10 text-right">{fmtPct(rate)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Plataformas */}
        {tableTab === 'plataformas' && (
          <div className="overflow-x-auto">
            {platformMetricsLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : platformData.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Sem dados para o período</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Plataforma</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Produtos</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Disparos</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliques</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {platformData.map((p) => (
                    <tr key={p.platformId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="default">{p.type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtNum(p.products)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmtNum(p.messagesSent)}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{fmtNum(p.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Top Produtos */}
        {tableTab === 'produtos' && (
          <div className="overflow-x-auto">
            {topLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : topData.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">Sem dados para o período</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">#</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Produto</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Disparos</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliques</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">CTR</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {topData.map((item, idx) => {
                    const ctr = item.sent > 0 ? (item.clicks / item.sent) * 100 : 0;
                    return (
                      <tr key={item.product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.product.imageUrl ? (
                              <img
                                src={item.product.imageUrl}
                                alt={item.product.title}
                                className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0" />
                            )}
                            <span className="font-medium text-gray-900 line-clamp-1">{item.product.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtNum(item.sent)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{fmtNum(item.clicks)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${ctr >= 5 ? 'text-green-600' : ctr >= 2 ? 'text-orange-500' : 'text-gray-600'}`}>
                            {fmtPct(ctr)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Metrics;
