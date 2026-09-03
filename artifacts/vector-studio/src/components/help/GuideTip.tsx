import { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function GuideTip({
  children,
  label,
  detail,
  shortcut,
  side = 'right',
}: {
  children: ReactNode;
  label: string;
  detail?: string;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 border border-white/10 bg-popover px-3 py-2 text-popover-foreground shadow-xl">
        <div className="flex items-center gap-2">
          <strong className="text-xs">{label}</strong>
          {shortcut && <kbd className="rounded border border-white/15 bg-black/30 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{shortcut}</kbd>}
        </div>
        {detail && <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{detail}</p>}
      </TooltipContent>
    </Tooltip>
  );
}