import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
  onClick?: () => void;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = true,
  hover = false,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-xl border border-gray-200 shadow-sm',
        padding && 'p-6',
        hover && 'hover:shadow-md transition-shadow cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle, action, className }) => {
  return (
    <div className={clsx('flex items-start justify-between mb-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  change?: string;
  changeType?: 'increase' | 'decrease' | 'neutral';
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  iconBg = 'bg-primary-50',
  change,
  changeType = 'neutral',
  className,
}) => {
  return (
    <Card className={clsx('', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {change && (
            <p
              className={clsx('text-xs font-medium mt-1', {
                'text-green-600': changeType === 'increase',
                'text-red-600': changeType === 'decrease',
                'text-gray-500': changeType === 'neutral',
              })}
            >
              {changeType === 'increase' && '↑ '}
              {changeType === 'decrease' && '↓ '}
              {change}
            </p>
          )}
        </div>
        <div className={clsx('p-3 rounded-xl', iconBg)}>{icon}</div>
      </div>
    </Card>
  );
};
