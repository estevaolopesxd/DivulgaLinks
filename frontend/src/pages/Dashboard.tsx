import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Package, Megaphone, MessageSquare, MousePointerClick, TrendingUp, ShoppingBag } from 'lucide-react';
import { dashboardApi } from '../services/api';
import { StatCard, Card, CardHeader } from '../components/ui/Card';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { DashboardStats } from '../types';

const PIE_COLORS = ['#10B981', '#EF4444', '#F59E0B'];

function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


export const Dashboard: React.FC = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
    retry: false,
  });

  const s: DashboardStats = {
    totalProducts:       stats?.totalProducts       ?? 0,
    activeCampaigns:     stats?.activeCampaigns     ?? 0,
    messagesToday:       stats?.messagesToday       ?? 0,
    totalClicks:         stats?.totalClicks         ?? 0,
    clicksTimeline:      stats?.clicksTimeline      ?? [],
    topProducts:         stats?.topProducts         ?? [],
    messageStats:        stats?.messageStats        ?? { sent: 0, failed: 0, pending: 0 },
    campaignPerformance: stats?.campaignPerformance ?? [],
  };

  if (isLoading) return <PageLoader />;

  const pieData = [
    { name: 'Enviadas', value: s.messageStats.sent },
    { name: 'Falhas', value: s.messageStats.failed },
    { name: 'Pendentes', value: s.messageStats.pending },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Total de Produtos"
          value={s.totalProducts.toLocaleString('pt-BR')}
          icon={<Package size={22} className="text-primary-500" />}
          iconBg="bg-primary-50"
          change="12% este mês"
          changeType="increase"
        />
        <StatCard
          title="Campanhas Ativas"
          value={s.activeCampaigns}
          icon={<Megaphone size={22} className="text-secondary-500" />}
          iconBg="bg-secondary-50"
          change="2 novas"
          changeType="increase"
        />
        <StatCard
          title="Mensagens Hoje"
          value={s.messagesToday.toLocaleString('pt-BR')}
          icon={<MessageSquare size={22} className="text-purple-500" />}
          iconBg="bg-purple-50"
          change="8% vs ontem"
          changeType="increase"
        />
        <StatCard
          title="Total de Cliques"
          value={s.totalClicks.toLocaleString('pt-BR')}
          icon={<MousePointerClick size={22} className="text-orange-500" />}
          iconBg="bg-orange-50"
          change="15% este mês"
          changeType="increase"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Clicks timeline */}
        <Card className="xl:col-span-2">
          <CardHeader title="Cliques nos Últimos 30 Dias" subtitle="Evolução diária de cliques" />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={s.clicksTimeline} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                tickLine={false}
                interval={4}
              />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,.1)' }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                name="Cliques"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Message stats pie */}
        <Card>
          <CardHeader title="Status das Mensagens" />
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={PIE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }}
                formatter={(val) => [Number(val).toLocaleString('pt-BR'), '']}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Campaign performance */}
        <Card>
          <CardHeader title="Performance por Campanha" subtitle="Mensagens enviadas vs cliques" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={s.campaignPerformance.map((cp) => ({
                name: cp.campaign.name.length > 12 ? cp.campaign.name.slice(0, 12) + '…' : cp.campaign.name,
                Enviadas: cp.sent,
                Cliques: cp.clicks,
              }))}
              margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB' }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
              />
              <Bar dataKey="Enviadas" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cliques" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Top products */}
        <Card padding={false}>
          <div className="p-6 pb-3">
            <CardHeader
              title="Top 5 Produtos"
              subtitle="Por número de cliques"
              action={
                <div className="flex items-center gap-1 text-xs text-primary-600 font-medium">
                  <TrendingUp size={14} />
                  Este mês
                </div>
              }
            />
          </div>
          <div className="divide-y divide-gray-50">
            {s.topProducts.slice(0, 5).map((tp, i) => (
              <div key={tp.product.id} className="flex items-center gap-3 px-6 py-3">
                <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {tp.product.imageUrl ? (
                    <img src={tp.product.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  ) : (
                    <ShoppingBag size={14} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{tp.product.title}</p>
                  <p className="text-xs text-gray-500">{formatBRL(tp.product.price)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{tp.clicks.toLocaleString('pt-BR')}</p>
                  <p className="text-xs text-gray-400">cliques</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
