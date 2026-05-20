import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MessageSquare, MousePointerClick, Search, Download, ChevronDown, ChevronUp, Calendar
} from 'lucide-react';
import { logsApi } from '../services/api';
import { Badge, statusToBadgeVariant, statusLabel } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { MessageLog, ClickLog } from '../types';

function formatDateTime(str: string) {
  return new Date(str).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function maskIp(ip?: string) {
  if (!ip) return '—';
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.***.***`;
  return ip.slice(0, 8) + '***';
}


export const Logs: React.FC = () => {
  const [tab, setTab] = useState<'messages' | 'clicks'>('messages');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data: msgData, isLoading: msgLoading } = useQuery({
    queryKey: ['logs-messages', page, search, statusFilter, campaignFilter, startDate, endDate],
    queryFn: () => logsApi.getMessageLogs({ page, limit: 15, search, status: statusFilter, campaignId: campaignFilter, startDate, endDate }),
    retry: false,
    enabled: tab === 'messages',
  });

  const { data: clickData, isLoading: clickLoading } = useQuery({
    queryKey: ['logs-clicks', page, startDate, endDate],
    queryFn: () => logsApi.getClickLogs({ page, limit: 15, startDate, endDate }),
    retry: false,
    enabled: tab === 'clicks',
  });

  const messages = msgData?.data ?? [];
  const clicks = clickData?.data ?? [];
  const total = tab === 'messages' ? (msgData?.total ?? 0) : (clickData?.total ?? 0);
  const totalPages = tab === 'messages' ? (msgData?.totalPages ?? 1) : (clickData?.totalPages ?? 1);

  const handleExportCSV = () => {
    const rows = tab === 'messages'
      ? [['ID', 'Campanha', 'Produto', 'Destino', 'Status', 'Data'], ...(messages as MessageLog[]).map(m => [m.id, m.campaign?.name ?? '', m.product?.title ?? '', m.destinationId, m.status, formatDateTime(m.createdAt)])]
      : [['ID', 'Produto', 'Código', 'IP', 'Data'], ...(clicks as ClickLog[]).map(c => [c.id, c.product?.title ?? '', c.trackingCode, c.ip ?? '', formatDateTime(c.createdAt)])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = tab === 'messages' ? msgLoading : clickLoading;

  return (
    <div className="space-y-5">
      {/* Tabs + Export */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button onClick={() => { setTab('messages'); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'messages' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <MessageSquare size={14} />Mensagens
          </button>
          <button onClick={() => { setTab('clicks'); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'clicks' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <MousePointerClick size={14} />Cliques
          </button>
        </div>
        <Button variant="outline" size="sm" icon={<Download size={14} />} onClick={handleExportCSV}>
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        {tab === 'messages' && (
          <>
            <Input
              placeholder="Buscar mensagem..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              leftIcon={<Search size={15} />}
              containerClassName="flex-1 min-w-[180px]"
            />
            <Select
              options={[
                { value: '', label: 'Todos os status' },
                { value: 'SENT', label: 'Enviadas' },
                { value: 'FAILED', label: 'Falhas' },
                { value: 'PENDING', label: 'Pendentes' },
                { value: 'CLICKED', label: 'Clicadas' },
              ]}
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              containerClassName="w-44"
            />
          </>
        )}
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400 flex-shrink-0" />
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} containerClassName="w-36" />
          <span className="text-gray-400 text-xs">até</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} containerClassName="w-36" />
        </div>
        {(search || statusFilter || campaignFilter || startDate || endDate) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); setCampaignFilter(''); setStartDate(''); setEndDate(''); }}>
            Limpar
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <PageLoader />
      ) : tab === 'messages' ? (
        <>
          {(messages as MessageLog[]).length === 0 ? (
            <EmptyState icon={<MessageSquare size={28} />} title="Nenhuma mensagem encontrada" description="Ajuste os filtros ou aguarde o envio de mensagens." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Data/Hora', 'Campanha', 'Produto', 'Destino', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(messages as MessageLog[]).map((m) => (
                    <React.Fragment key={m.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(m.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-800">{m.campaign?.name ?? m.campaignId}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <span className="text-sm text-gray-700 truncate block">{m.product?.title ?? m.productId ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500">{m.destinationType}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusToBadgeVariant(m.status)}>{statusLabel(m.status)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setExpandedRow(expandedRow === m.id ? null : m.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            {expandedRow === m.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                      </tr>
                      {expandedRow === m.id && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3 bg-gray-50">
                            <div className="text-xs font-mono text-gray-600 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                              {m.message}
                            </div>
                            {m.failedReason && (
                              <p className="text-xs text-red-600 mt-2">Motivo da falha: {m.failedReason}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <Pagination page={page} totalPages={totalPages} total={total} limit={15} onPageChange={setPage} />
          )}
        </>
      ) : (
        <>
          {(clicks as ClickLog[]).length === 0 ? (
            <EmptyState icon={<MousePointerClick size={28} />} title="Nenhum clique registrado" description="Os cliques nos links de afiliados aparecerão aqui." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Data/Hora', 'Produto', 'Código de Rastreio', 'IP (mascarado)'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(clicks as ClickLog[]).map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDateTime(c.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-800">{c.product?.title ?? c.productId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-700">{c.trackingCode}</code>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{maskIp(c.ip)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > 0 && (
            <Pagination page={page} totalPages={totalPages} total={total} limit={15} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
};
