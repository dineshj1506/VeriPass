import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  }[size];

  const variantStyles = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold focus:ring-emerald-400 shadow-md shadow-emerald-500/20",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 focus:ring-slate-400 border border-slate-700",
    outline: "border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 focus:ring-emerald-400",
    danger: "bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-400 shadow-md shadow-rose-600/20",
    ghost: "text-slate-300 hover:bg-slate-800 hover:text-white focus:ring-slate-400",
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

export interface CardProps {
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Card({ title, subtitle, badge, children, footer, className = "" }: CardProps) {
  return (
    <div className={`bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl p-6 ${className}`}>
      {(title || subtitle || badge) && (
        <div className="flex items-start justify-between mb-4 border-b border-slate-800/80 pb-3">
          <div>
            {title && <h3 className="text-lg font-semibold text-slate-100">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {badge && <div>{badge}</div>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-5 pt-3 border-t border-slate-800/80">{footer}</div>}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, id, className = "", ...props }: InputProps) {
  const inputId = id || props.name || Math.random().toString(36).substring(2, 9);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-3.5 py-2.5 bg-slate-950 border ${
          error ? "border-rose-500 focus:ring-rose-400" : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500/20"
        } rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${className}`}
        {...props}
      />
      {helper && !error && <p className="text-xs text-slate-400 mt-1">{helper}</p>}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
}

export interface BadgeProps {
  variant?: "success" | "danger" | "warning" | "neutral" | "info";
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  const styles = {
    success: "bg-emerald-950/80 text-emerald-400 border border-emerald-800/60",
    danger: "bg-rose-950/80 text-rose-400 border border-rose-800/60",
    warning: "bg-amber-950/80 text-amber-400 border border-amber-800/60",
    neutral: "bg-slate-800 text-slate-300 border border-slate-700",
    info: "bg-sky-950/80 text-sky-400 border border-sky-800/60",
  }[variant];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles} ${className}`}>
      {children}
    </span>
  );
}

export function AlertBanner({
  type = "info",
  title,
  message,
}: {
  type?: "warning" | "danger" | "info" | "success";
  title?: string;
  message: string;
}) {
  const styles = {
    warning: "bg-amber-950/40 border-amber-800/60 text-amber-300",
    danger: "bg-rose-950/40 border-rose-800/60 text-rose-300",
    info: "bg-sky-950/40 border-sky-800/60 text-sky-300",
    success: "bg-emerald-950/40 border-emerald-800/60 text-emerald-300",
  }[type];

  return (
    <div className={`p-4 border rounded-xl text-sm ${styles}`}>
      {title && <h4 className="font-semibold mb-1">{title}</h4>}
      <p>{message}</p>
    </div>
  );
}
