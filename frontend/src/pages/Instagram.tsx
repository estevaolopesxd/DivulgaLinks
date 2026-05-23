import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Instagram as InstagramIcon,
  Plus,
  Trash2,
  Send,
  Edit2,
  Image,
  Film,
  LayoutGrid,
  BookOpen,
  Upload,
  X,
  Calendar,
  Clock,
  User,
  Settings,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { instagramApi } from '../services/api';
import type { InstagramAccount, InstagramPost, InstagramMediaType, InstagramPostStatus } from '../types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';

// ── Status helpers ────────────────────────────────────────────────────────────

const statusVariant = (status: InstagramPostStatus) => {
  const map: Record<InstagramPostStatus, 'default' | 'info' | 'yellow' | 'success' | 'danger'> = {
    DRAFT: 'default',
    SCHEDULED: 'info',
    PUBLISHING: 'yellow',
    PUBLISHED: 'success',
    FAILED: 'danger',
  };
  return map[status] ?? 'default';
};

const statusLabel = (status: InstagramPostStatus) => {
  const map: Record<InstagramPostStatus, string> = {
    DRAFT: 'Rascunho',
    SCHEDULED: 'Agendado',
    PUBLISHING: 'Publicando',
    PUBLISHED: 'Publicado',
    FAILED: 'Falhou',
  };
  return map[status] ?? status;
};

const mediaTypeLabel = (type: InstagramMediaType) => {
  const map: Record<InstagramMediaType, string> = {
    IMAGE: 'Imagem',
    REEL: 'Reel',
    CAROUSEL: 'Carrossel',
    STORY: 'Story',
  };
  return map[type] ?? type;
};

// ── Create/Edit Post Modal ────────────────────────────────────────────────────

interface PostModalProps {
  accounts: InstagramAccount[];
  post?: InstagramPost | null;
  onClose: () => void;
  onSuccess: () => void;
}

const mediaTypes: { type: InstagramMediaType; label: string; icon: React.ReactNode; multi: boolean; video: boolean }[] = [
  { type: 'IMAGE', label: 'Imagem', icon: <Image size={18} />, multi: false, video: false },
  { type: 'REEL', label: 'Reel', icon: <Film size={18} />, multi: false, video: true },
  { type: 'CAROUSEL', label: 'Carrossel', icon: <LayoutGrid size={18} />, multi: true, video: false },
  { type: 'STORY', label: 'Story', icon: <BookOpen size={18} />, multi: false, video: false },
];

const PostModal: React.FC<PostModalProps> = ({ accounts, post, onClose, onSuccess }) => {
  const [accountId, setAccountId] = useState(post?.accountId ?? accounts[0]?.id ?? '');
  const [mediaType, setMediaType] = useState<InstagramMediaType>(post?.mediaType ?? 'IMAGE');
  const [mediaUrls, setMediaUrls] = useState<string[]>(post?.mediaUrls ?? []);
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [hashtags, setHashtags] = useState(post?.hashtags ?? '');
  const [schedule, setSchedule] = useState(!!post?.scheduledAt);
  const [scheduledAt, setScheduledAt] = useState(
    post?.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : '',
  );
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>(post?.mediaUrls ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMulti = mediaTypes.find((m) => m.type === mediaType)?.multi ?? false;
  const isVideo = mediaTypes.find((m) => m.type === mediaType)?.video ?? false;
  const accept = isVideo ? 'video/mp4' : 'image/jpeg,image/png,image/webp';

  const createMutation = useMutation({
    mutationFn: instagramApi.createPost,
    onSuccess: () => {
      toast.success(schedule ? 'Post agendado com sucesso!' : 'Post criado com sucesso!');
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao criar post'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InstagramPost> }) =>
      instagramApi.updatePost(id, data),
    onSuccess: () => {
      toast.success('Post atualizado com sucesso!');
      onSuccess();
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao atualizar post'),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const limit = isMulti ? 10 : 1;
    const toUpload = files.slice(0, limit);

    setUploading(true);
    try {
      const results = await Promise.all(toUpload.map((f) => instagramApi.uploadMedia(f)));
      const newUrls = results.map((r) => r.url);
      if (isMulti) {
        setMediaUrls((prev) => [...prev, ...newUrls].slice(0, 10));
        setPreviews((prev) => [...prev, ...newUrls].slice(0, 10));
      } else {
        setMediaUrls(newUrls);
        setPreviews(newUrls);
      }
    } catch (err) {
      toast.error('Erro ao fazer upload de arquivo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHashtagsChange = (val: string) => {
    // Auto-prepend # to each tag if missing
    const normalized = val
      .split(/\s+/)
      .map((t) => (t && !t.startsWith('#') ? `#${t}` : t))
      .join(' ');
    setHashtags(normalized);
  };

  const handleSubmit = () => {
    if (!accountId) { toast.error('Selecione uma conta'); return; }
    if (mediaUrls.length === 0) { toast.error('Adicione pelo menos uma mídia'); return; }

    const data: Partial<InstagramPost> = {
      accountId,
      mediaType,
      mediaUrls,
      caption: caption || undefined,
      hashtags: hashtags || undefined,
      scheduledAt: schedule && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
    };

    if (post) {
      updateMutation.mutate({ id: post.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || uploading;
  const minDateTime = new Date().toISOString().slice(0, 16);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={post ? 'Editar Publicação' : 'Nova Publicação'}
      size="2xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={isLoading}
            icon={schedule ? <Calendar size={16} /> : <Send size={16} />}
          >
            {schedule ? 'Agendar' : 'Publicar Agora'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Account select */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <User size={13} className="inline mr-1 opacity-60" />
            Conta Instagram
          </label>
          {accounts.length === 1 ? (
            /* Só 1 conta — exibe como card estático */
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              {accounts[0].profilePictureUrl ? (
                <img
                  src={accounts[0].profilePictureUrl}
                  alt={accounts[0].username}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                  <User size={14} className="text-white" />
                </div>
              )}
              <span className="text-sm font-medium text-gray-800">@{accounts[0].username}</span>
              {accounts[0].pageName && (
                <span className="text-xs text-gray-400 ml-auto truncate">{accounts[0].pageName}</span>
              )}
            </div>
          ) : (
            /* Múltiplas contas — dropdown */
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username}{acc.pageName ? ` (${acc.pageName})` : ''}
                </option>
              ))}
            </select>
          )}
          {accounts.length === 1 && (
            <p className="text-xs text-gray-400 mt-1">
              Para publicar em outras contas, conecte-as na aba <strong>Contas</strong>.
            </p>
          )}
        </div>

        {/* Media type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Mídia</label>
          <div className="grid grid-cols-4 gap-2">
            {mediaTypes.map((m) => (
              <button
                key={m.type}
                type="button"
                onClick={() => { setMediaType(m.type); setMediaUrls([]); setPreviews([]); }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                  mediaType === m.type
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Media upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isMulti ? `Mídias (até 10)` : 'Mídia'}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={isMulti}
            onChange={handleFileChange}
            className="hidden"
          />
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {previews.map((url, i) => (
                <div key={i} className="relative group">
                  {isVideo ? (
                    <video
                      src={url}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                  ) : (
                    <img
                      src={url}
                      alt={`Mídia ${i + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {(isMulti ? previews.length < 10 : previews.length === 0) && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors flex items-center justify-center gap-2"
            >
              <Upload size={16} />
              {uploading ? 'Enviando...' : `Clique para ${isVideo ? 'selecionar vídeo' : 'adicionar imagem'}`}
            </button>
          )}
        </div>

        {/* Caption */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Legenda</label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Escreva a legenda da publicação..."
          />
        </div>

        {/* Hashtags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hashtags</label>
          <Input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            onBlur={(e) => handleHashtagsChange(e.target.value)}
            placeholder="#marketing #afiliados #oferta"
          />
          <p className="text-xs text-gray-400 mt-1">Separe com espaços. O # será adicionado automaticamente.</p>
        </div>

        {/* Schedule toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSchedule((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              schedule ? 'bg-primary-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                schedule ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">Agendar publicação</span>
        </div>

        {schedule && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Clock size={14} className="inline mr-1" />
              Data e hora
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={minDateTime}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export const Instagram: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'configuracoes' | 'contas' | 'publicacoes'>('contas');
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState<InstagramPost | null>(null);
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [authCode, setAuthCode] = useState('');

  // Config form state
  const [cfgAppId, setCfgAppId] = useState('');
  const [cfgAppSecret, setCfgAppSecret] = useState('');
  const [cfgRedirectUri, setCfgRedirectUri] = useState('http://localhost:7654/instagram/callback');

  // Handle OAuth callback code in URL
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      navigate('/instagram', { replace: true });
      setAuthCode(code);
      setActiveTab('contas');
    }
  }, [searchParams, navigate]);

  // Queries
  const { data: igConfig, refetch: refetchConfig } = useQuery({
    queryKey: ['instagram-config'],
    queryFn: instagramApi.getConfig,
    staleTime: 60_000,
  });

  // Populate config form when data loads
  useEffect(() => {
    if (igConfig) {
      setCfgAppId(igConfig.appId ?? '');
      setCfgRedirectUri(igConfig.redirectUri ?? 'http://localhost:7654/instagram/callback');
    }
  }, [igConfig]);

  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['instagram-accounts'],
    queryFn: instagramApi.listAccounts,
  });

  const { data: postsData, isLoading: loadingPosts } = useQuery({
    queryKey: ['instagram-posts', filterAccountId, filterStatus],
    queryFn: () =>
      instagramApi.listPosts({
        accountId: filterAccountId || undefined,
        status: filterStatus || undefined,
      }),
    enabled: activeTab === 'publicacoes',
  });

  const { data: authUrlData } = useQuery({
    queryKey: ['instagram-auth-url'],
    queryFn: instagramApi.getAuthUrl,
    staleTime: 60_000,
  });

  // Mutations
  const connectMutation = useMutation({
    mutationFn: instagramApi.connect,
    onSuccess: () => {
      toast.success('Conta Instagram conectada com sucesso!');
      setAuthCode('');
      queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao conectar conta'),
  });

  const disconnectMutation = useMutation({
    mutationFn: instagramApi.disconnect,
    onSuccess: () => {
      toast.success('Conta desconectada');
      queryClient.invalidateQueries({ queryKey: ['instagram-accounts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao desconectar'),
  });

  const publishMutation = useMutation({
    mutationFn: instagramApi.publishPost,
    onSuccess: () => {
      toast.success('Publicação iniciada!');
      queryClient.invalidateQueries({ queryKey: ['instagram-posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao publicar'),
  });

  const deleteMutation = useMutation({
    mutationFn: instagramApi.deletePost,
    onSuccess: () => {
      toast.success('Post excluído');
      queryClient.invalidateQueries({ queryKey: ['instagram-posts'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao excluir post'),
  });

  const saveConfigMutation = useMutation({
    mutationFn: instagramApi.saveConfig,
    onSuccess: () => {
      toast.success('Configurações salvas! Agora você pode conectar sua conta.');
      setCfgAppSecret('');
      refetchConfig();
      queryClient.invalidateQueries({ queryKey: ['instagram-auth-url'] });
    },
    onError: (err: Error) => toast.error(err.message ?? 'Erro ao salvar configurações'),
  });

  const handleSaveConfig = () => {
    if (!cfgAppId.trim()) { toast.error('App ID é obrigatório'); return; }
    if (!cfgRedirectUri.trim()) { toast.error('URI de redirecionamento é obrigatória'); return; }
    saveConfigMutation.mutate({
      appId: cfgAppId.trim(),
      appSecret: cfgAppSecret.trim() || undefined,
      redirectUri: cfgRedirectUri.trim(),
    });
  };

  const handleConnect = () => {
    if (!authCode.trim()) { toast.error('Cole o código de autorização'); return; }
    connectMutation.mutate(authCode.trim());
  };

  const handleDisconnect = (id: string) => {
    if (!window.confirm('Deseja desconectar esta conta do Instagram?')) return;
    disconnectMutation.mutate(id);
  };

  const handleAuthRedirect = () => {
    if (authUrlData?.authUrl) {
      window.location.href = authUrlData.authUrl;
    }
  };

  const posts = postsData?.posts ?? [];

  const isTokenExpired = (account: InstagramAccount) => {
    if (!account.tokenExpiresAt) return false;
    return new Date(account.tokenExpiresAt) < new Date();
  };

  const isTokenExpiringSoon = (account: InstagramAccount) => {
    if (!account.tokenExpiresAt) return false;
    const exp = new Date(account.tokenExpiresAt);
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return exp < soon && exp > new Date();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <InstagramIcon size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Instagram</h1>
            <p className="text-sm text-gray-500">Gerencie contas e publique conteúdo</p>
          </div>
        </div>

        {activeTab === 'publicacoes' && accounts.length > 0 && (
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => { setEditingPost(null); setShowPostModal(true); }}
          >
            Nova Publicação
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {(
          [
            { key: 'configuracoes', label: 'Configurações', icon: <Settings size={14} /> },
            { key: 'contas',        label: 'Contas',        icon: <User size={14} /> },
            { key: 'publicacoes',   label: 'Publicações',   icon: <Image size={14} /> },
          ] as const
        ).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {icon}
            {label}
            {key === 'configuracoes' && igConfig && !igConfig.configured && (
              <span className="ml-1 w-2 h-2 rounded-full bg-orange-400 inline-block" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Configurações ── */}
      {activeTab === 'configuracoes' && (
        <div className="space-y-6 max-w-2xl">
          {/* Status banner */}
          {igConfig?.configured ? (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-green-600 flex-shrink-0" />
              <p className="text-sm text-green-800 font-medium">
                App Meta configurado. Você pode conectar contas na aba <strong>Contas</strong>.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <AlertCircle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-orange-800">
                Configure o App Meta abaixo para habilitar o login com Instagram.
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Settings size={16} />
              Como criar o App Meta (uma vez só)
            </h2>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>
                Acesse{' '}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-600 underline inline-flex items-center gap-0.5"
                >
                  developers.facebook.com/apps <ExternalLink size={11} />
                </a>{' '}
                e clique em <strong>Criar aplicativo</strong>
              </li>
              <li>Escolha o tipo <strong>Empresa</strong> e avance</li>
              <li>
                No painel do app, vá em <strong>Adicionar produto</strong> e adicione{' '}
                <strong>Instagram Graph API</strong>
              </li>
              <li>
                Em <strong>Configurações → Básico</strong> copie o{' '}
                <strong>ID do Aplicativo</strong> e o <strong>Chave secreta</strong>
              </li>
              <li>
                Em <strong>Instagram → Configurações da API</strong>, adicione a URI de
                redirecionamento exatamente como configurada abaixo
              </li>
            </ol>
          </div>

          {/* Config form */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Credenciais do App Meta</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App ID <span className="text-red-500">*</span>
              </label>
              <Input
                value={cfgAppId}
                onChange={(e) => setCfgAppId(e.target.value)}
                placeholder="Ex: 1234567890123456"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                App Secret{' '}
                {igConfig?.configured && (
                  <span className="text-gray-400 font-normal text-xs">(deixe em branco para manter o atual)</span>
                )}
              </label>
              <Input
                type="password"
                value={cfgAppSecret}
                onChange={(e) => setCfgAppSecret(e.target.value)}
                placeholder={igConfig?.configured ? '••••••••••••••••' : 'Cole o App Secret aqui'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URI de Redirecionamento OAuth <span className="text-red-500">*</span>
              </label>
              <Input
                value={cfgRedirectUri}
                onChange={(e) => setCfgRedirectUri(e.target.value)}
                placeholder="https://seusite.com/instagram/callback"
              />
              <p className="text-xs text-gray-400 mt-1">
                Copie esta URL e cadastre exatamente assim no painel do App Meta →
                Instagram → Configurações da API → URIs de redirecionamento.
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="primary"
                onClick={handleSaveConfig}
                loading={saveConfigMutation.isPending}
                icon={<CheckCircle2 size={15} />}
              >
                Salvar Configurações
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Contas ── */}
      {activeTab === 'contas' && (
        <div className="space-y-6">
          {/* Warning if not configured */}
          {igConfig && !igConfig.configured && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
              <AlertCircle size={18} className="text-orange-500 flex-shrink-0" />
              <p className="text-sm text-orange-800">
                Configure o App Meta na aba{' '}
                <button
                  className="underline font-semibold"
                  onClick={() => setActiveTab('configuracoes')}
                >
                  Configurações
                </button>{' '}
                antes de conectar uma conta.
              </p>
            </div>
          )}

          {/* Connect section */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">Conectar conta Instagram</h2>
            <p className="text-sm text-gray-600 mb-4">
              Clique no botão abaixo para autorizar acesso à sua conta Instagram Business via Facebook.
              Após autorizar, você será redirecionado de volta automaticamente.{' '}
              <strong>Repita o processo para cada conta adicional.</strong>
            </p>
            <Button
              variant="primary"
              icon={<InstagramIcon size={16} />}
              onClick={handleAuthRedirect}
              className="mb-4"
              disabled={!igConfig?.configured}
            >
              Conectar com Instagram
            </Button>

            {!igConfig?.configured && (
              <p className="text-xs text-gray-400 mb-4">
                Configure o App Meta na aba Configurações para habilitar este botão.
              </p>
            )}

            <div className="border-t border-gray-100 pt-4 mt-2">
              <p className="text-xs text-gray-500 mb-2">
                Se o redirecionamento automático não funcionar, cole o código de autorização abaixo:
              </p>
              <div className="flex gap-2">
                <Input
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Cole o código de autorização aqui..."
                  className="flex-1"
                />
                <Button
                  variant="primary"
                  onClick={handleConnect}
                  loading={connectMutation.isPending}
                  disabled={!authCode.trim()}
                >
                  Conectar
                </Button>
              </div>
            </div>
          </div>

          {/* Accounts list */}
          {loadingAccounts ? (
            <PageLoader />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={<InstagramIcon size={32} />}
              title="Nenhuma conta conectada"
              description="Conecte sua conta Instagram Business para começar a publicar."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc) => {
                const expired = isTokenExpired(acc);
                const expiringSoon = isTokenExpiringSoon(acc);
                return (
                  <div
                    key={acc.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {acc.profilePictureUrl ? (
                        <img
                          src={acc.profilePictureUrl}
                          alt={acc.username}
                          className="w-12 h-12 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                          <User size={20} className="text-white" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">@{acc.username}</p>
                        {acc.pageName && (
                          <p className="text-xs text-gray-500 truncate">{acc.pageName}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={acc.isActive ? 'success' : 'default'} dot>
                        {acc.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                      {expired && <Badge variant="danger">Token expirado</Badge>}
                      {!expired && expiringSoon && (
                        <Badge variant="warning">Expira em breve</Badge>
                      )}
                    </div>

                    {acc.tokenExpiresAt && (
                      <p className="text-xs text-gray-400">
                        Token expira: {new Date(acc.tokenExpiresAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}

                    <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => handleDisconnect(acc.id)}
                        loading={disconnectMutation.isPending}
                        icon={<Trash2 size={14} />}
                      >
                        Desconectar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Publicações ── */}
      {activeTab === 'publicacoes' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={filterAccountId}
              onChange={(e) => setFilterAccountId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas as contas</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  @{acc.username}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todos os status</option>
              <option value="DRAFT">Rascunho</option>
              <option value="SCHEDULED">Agendado</option>
              <option value="PUBLISHING">Publicando</option>
              <option value="PUBLISHED">Publicado</option>
              <option value="FAILED">Falhou</option>
            </select>
          </div>

          {/* Posts list */}
          {loadingPosts ? (
            <PageLoader />
          ) : posts.length === 0 ? (
            <EmptyState
              icon={<InstagramIcon size={32} />}
              title="Nenhuma publicação encontrada"
              description="Crie sua primeira publicação para o Instagram."
              action={
                accounts.length > 0
                  ? {
                      label: 'Nova Publicação',
                      onClick: () => { setEditingPost(null); setShowPostModal(true); },
                      icon: <Plus size={16} />,
                    }
                  : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col"
                >
                  {/* Media preview */}
                  <div className="relative bg-gray-100 h-44">
                    {post.mediaUrls[0] ? (
                      post.mediaType === 'REEL' ? (
                        <video
                          src={post.mediaUrls[0]}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <img
                          src={post.mediaUrls[0]}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <Image size={40} />
                      </div>
                    )}
                    {post.mediaUrls.length > 1 && (
                      <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                        +{post.mediaUrls.length - 1}
                      </span>
                    )}
                  </div>

                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={statusVariant(post.status)} dot>
                        {statusLabel(post.status)}
                      </Badge>
                      <Badge variant="default">{mediaTypeLabel(post.mediaType)}</Badge>
                    </div>

                    {post.caption && (
                      <p className="text-sm text-gray-700 line-clamp-2">{post.caption}</p>
                    )}

                    {post.scheduledAt && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar size={12} />
                        {new Date(post.scheduledAt).toLocaleString('pt-BR')}
                      </p>
                    )}

                    {post.account && (
                      <p className="text-xs text-gray-400">@{post.account.username}</p>
                    )}

                    {post.failedReason && (
                      <p className="text-xs text-red-500 truncate" title={post.failedReason}>
                        Erro: {post.failedReason}
                      </p>
                    )}

                    <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
                      {(post.status === 'DRAFT' || post.status === 'FAILED') && (
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Send size={14} />}
                          onClick={() => publishMutation.mutate(post.id)}
                          loading={publishMutation.isPending}
                          className="flex-1"
                        >
                          Publicar
                        </Button>
                      )}
                      {post.status !== 'PUBLISHED' && post.status !== 'PUBLISHING' && (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<Edit2 size={14} />}
                          onClick={() => { setEditingPost(post); setShowPostModal(true); }}
                        >
                          Editar
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Trash2 size={14} />}
                        onClick={() => {
                          if (window.confirm('Excluir esta publicação?')) {
                            deleteMutation.mutate(post.id);
                          }
                        }}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <span className="sr-only">Excluir</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Post Modal */}
      {showPostModal && (
        <PostModal
          accounts={accounts}
          post={editingPost}
          onClose={() => { setShowPostModal(false); setEditingPost(null); }}
          onSuccess={() => {
            setShowPostModal(false);
            setEditingPost(null);
            queryClient.invalidateQueries({ queryKey: ['instagram-posts'] });
          }}
        />
      )}
    </div>
  );
};

export default Instagram;
