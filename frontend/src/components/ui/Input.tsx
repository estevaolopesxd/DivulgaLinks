import React from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  containerClassName,
  className,
  id,
  ...props
}) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={clsx('flex flex-col gap-1', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          {...props}
          className={clsx(
            'w-full px-3 py-2 text-sm rounded-lg border transition-colors',
            'placeholder:text-gray-400 text-gray-900',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            error
              ? 'border-red-300 bg-red-50 focus:ring-red-500'
              : 'border-gray-300 bg-white hover:border-gray-400',
            leftIcon && 'pl-9',
            rightIcon && 'pr-9',
            props.disabled && 'opacity-60 cursor-not-allowed bg-gray-50',
            className
          )}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  hint,
  containerClassName,
  className,
  id,
  ...props
}) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={clsx('flex flex-col gap-1', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        {...props}
        className={clsx(
          'w-full px-3 py-2 text-sm rounded-lg border transition-colors resize-y min-h-[100px]',
          'placeholder:text-gray-400 text-gray-900',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
          error
            ? 'border-red-300 bg-red-50 focus:ring-red-500'
            : 'border-gray-300 bg-white hover:border-gray-400',
          props.disabled && 'opacity-60 cursor-not-allowed bg-gray-50',
          className
        )}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
};
