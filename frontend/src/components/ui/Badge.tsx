import React from 'react';
import { clsx } from 'clsx';

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'orange'
  | 'yellow';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-orange-100 text-orange-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
  yellow: 'bg-yellow-100 text-yellow-700',
};

const dotClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-500',
  success: 'bg-green-500',
  warning: 'bg-orange-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  purple: 'bg-purple-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  children,
  size = 'sm',
  dot = false,
  className,
}) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClasses[variant])} />
      )}
      {children}
    </span>
  );
};

// Convenience helpers
export function statusToBadgeVariant(
  status: string
): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    CONNECTED: 'success',
    ACTIVE: 'success',
    SENT: 'success',
    DISCONNECTED: 'danger',
    INACTIVE: 'danger',
    FAILED: 'danger',
    CONNECTING: 'info',
    QR_PENDING: 'yellow',
    PENDING: 'warning',
    PAUSED: 'orange',
    DRAFT: 'default',
    COMPLETED: 'purple',
    CLICKED: 'info',
  };
  return map[status] ?? 'default';
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    CONNECTED: 'Conectado',
    ACTIVE: 'Ativo',
    SENT: 'Enviado',
    DISCONNECTED: 'Desconectado',
    INACTIVE: 'Inativo',
    FAILED: 'Falhou',
    CONNECTING: 'Conectando',
    QR_PENDING: 'QR Pendente',
    PENDING: 'Pendente',
    PAUSED: 'Pausado',
    DRAFT: 'Rascunho',
    COMPLETED: 'Concluído',
    CLICKED: 'Clicado',
  };
  return map[status] ?? status;
}
