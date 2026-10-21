import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'subtle';
  size?: 'default' | 'sm' | 'icon';
  children: ReactNode;
};
const variants = {
  default: 'bg-action text-white hover:bg-action-hover shadow-sm',
  outline: 'border border-line bg-surface text-ink hover:border-orange/60 hover:bg-orange-wash',
  ghost: 'text-ink hover:bg-surface-soft',
  subtle: 'bg-surface-soft text-ink hover:bg-orange-wash',
};
const sizes = { default: 'min-h-12 px-5 py-3', sm: 'min-h-11 px-4 py-2.5 text-sm', icon: 'size-11 p-0' };
export function Button({ className, variant = 'default', size = 'default', children, ...props }: Props) {
  return <button className={cn('inline-flex flex-wrap items-center justify-center gap-2 rounded-xl text-sm font-semibold transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action active:translate-y-px disabled:pointer-events-none disabled:opacity-45', variants[variant], sizes[size], className)} {...props}>{children}</button>;
}
