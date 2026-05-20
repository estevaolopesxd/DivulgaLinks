import React from 'react';
import { clsx } from 'clsx';
import { LoadingSpinner } from './LoadingSpinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 focus:ring-primary-500 disabled:bg-primary-300',
  secondary:
    'bg-secondary-500 text-white hover:bg-secondary-600 active:bg-secondary-700 focus:ring-secondary-500 disabled:bg-secondary-300',
  danger:
    'bg-red-500 text-white hover:bg-red-600 active:bg-red-700 focus:ring-red-500 disabled:bg-red-300',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus:ring-gray-400 disabled:text-gray-300',
  outline:
    'bg-transparent border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus:ring-gray-400 disabled:text-gray-300 disabled:border-gray-200',
};

const sizeClasses: Record<Size, string> = {
  xs: 'px-2.5 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        (disabled || loading) && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      {loading ? (
        <>
          <LoadingSpinner size="sm" className="text-current" />
          {children && <span>{children}</span>}
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
          {children && <span>{children}</span>}
          {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
        </>
      )}
    </button>
  );
};
