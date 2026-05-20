import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Search, Users as UsersIcon,
  ShieldCheck, UserCheck, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usersApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/LoadingSpinner';
import type { User } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatDate(iso?: string): string {
  if (!iso) return 'Nunca';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
}

const emptyForm: UserForm = {
  name: '', email: '', password: '', role: 'USER', isActive: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);

  // ─── Queries (always called — disabled when not admin) ──────────────────────

  const queryParams = {
    page,
    limit: 15,
    ...(search ? { search } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
    ...(statusFilter === 'active' ? { isActive: true } : statusFilter === 'inactive' ? { isActive: false } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => usersApi.list(queryParams),
    enabled: isAdmin,
  });

  const users: User[] = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const { data: allData } = useQuery({
    queryKey: ['users', 'all-stats'],
    queryFn: () => usersApi.list({ limit: 1000 }),
    enabled: isAdmin,
  });
  const allUsers = allData?.data ?? [];
  const totalCount = allData?.total ?? 0;
  const adminCount = allUsers.filter((u) => u.role === 'ADMIN').length;
  const activeCount = allUsers.filter((u) => u.isActive).length;

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role: string }) =>
      usersApi.create(data),
    onSuccess: () => {
      toast.success('Usuário criado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: () => toast.error('Erro ao criar usuário.'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UserForm> }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      toast.success('Usuário atualizado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: () => toast.error('Erro ao atualizar usuário.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      toast.success('Usuário removido.');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao remover usuário.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Erro ao alterar status.'),
  });

  // ─── Modal helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, isActive: u.isActive });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editTarget) {
      const payload: Partial<UserForm> = { name: form.name, email: form.email, role: form.role, isActive: form.isActive };
      if (form.password) payload.password = form.password;
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate({ name: form.name, email: form.email, password: form.password, role: form.role });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ─── Access guard ───────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center">
        <AlertCircle size={48} className="text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">Acesso negado</h2>
        <p className="text-gray-500 mt-2">Apenas administradores podem acessar esta página.</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os usuários do sistema</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          Novo Usuário
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50">
              <UsersIcon size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total de Usuários</p>
              <p className="text-2xl font-bold text-gray-900">{totalCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50">
              <ShieldCheck size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Admins</p>
              <p className="text-2xl font-bold text-gray-900">{adminCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-50">
              <UserCheck size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Ativos</p>
              <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              leftIcon={<Search size={15} />}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'Todos os cargos' },
                { value: 'ADMIN', label: 'Admin' },
                { value: 'USER', label: 'Usuário' },
              ]}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'Todos os status' },
                { value: 'active', label: 'Ativos' },
                { value: 'inactive', label: 'Inativos' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <PageLoader />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<UsersIcon size={40} />}
          title="Nenhum usuário encontrado"
          description="Tente ajustar os filtros ou crie um novo usuário."
          action={{ label: 'Novo Usuário', onClick: openCreate, icon: <Plus size={16} /> }}
        />
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Usuário</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cargo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Último acesso</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Campanhas</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      {/* Avatar + name + email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor(u.name)}`}>
                            <span className="text-white text-sm font-bold">{getInitials(u.name)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{u.name}{isSelf && <span className="ml-1 text-xs text-gray-400">(você)</span>}</p>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3">
                        {u.role === 'ADMIN' ? (
                          <Badge variant="purple">Admin</Badge>
                        ) : (
                          <Badge variant="info">Usuário</Badge>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {u.isActive ? (
                          <Badge variant="success" dot>Ativo</Badge>
                        ) : (
                          <Badge variant="danger" dot>Inativo</Badge>
                        )}
                      </td>
                      {/* Last login */}
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(u.lastLoginAt)}</td>
                      {/* Campaign count */}
                      <td className="px-4 py-3 text-gray-700">{u._count?.campaigns ?? 0}</td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Editar"
                            onClick={() => openEdit(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            title={u.isActive ? 'Desativar' : 'Ativar'}
                            onClick={() => toggleMutation.mutate(u.id)}
                            disabled={isSelf}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {u.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                          <button
                            title={isSelf ? 'Não é possível remover a si mesmo' : 'Remover'}
                            onClick={() => !isSelf && setDeleteTarget(u)}
                            disabled={isSelf}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={15}
              onPageChange={setPage}
            />
          </div>
        </Card>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Editar Usuário' : 'Novo Usuário'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button
              type="submit"
              form="user-form"
              loading={isSaving}
            >
              {editTarget ? 'Salvar' : 'Criar Usuário'}
            </Button>
          </div>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Nome"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome completo"
          />
          <Input
            label="E-mail"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@exemplo.com"
          />
          <Input
            label="Senha"
            type="password"
            required={!editTarget}
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={editTarget ? 'Deixe em branco para manter' : 'Senha'}
          />
          <Select
            label="Cargo"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'ADMIN' | 'USER' }))}
            options={[
              { value: 'USER', label: 'Usuário' },
              { value: 'ADMIN', label: 'Admin' },
            ]}
          />
          {editTarget && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}
                className={`relative inline-flex w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 ${form.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block w-4 h-4 mt-1 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-gray-600">{form.isActive ? 'Ativo' : 'Inativo'}</span>
            </div>
          )}
        </form>
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
          Tem certeza que deseja remover o usuário <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
        </p>
      </Modal>
    </div>
  );
};

export default Users;
