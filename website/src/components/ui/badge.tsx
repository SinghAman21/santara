import type { HTMLAttributes } from 'react';
import { cn } from './utils';
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) { return <span className={cn('inline-flex min-h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold tracking-wide text-muted', className)} {...props} />; }
