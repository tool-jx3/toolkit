/**
 * 可收合的「使用方式」說明。內容由工具提供（步驟清單、注意事項）。
 */
import { BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { Section } from './Section';

export interface UsageSectionProps {
  children: ReactNode;
  title?: string;
  defaultOpen?: boolean;
  /** 記住展開狀態（通常是工具 id） */
  persistKey?: string;
  className?: string;
}

export function UsageSection({
  children,
  title = '使用方式',
  defaultOpen = false,
  persistKey,
  className,
}: UsageSectionProps) {
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-1.5">
          <BookOpen aria-hidden className="size-4 text-accent" />
          {title}
        </span>
      }
      defaultOpen={defaultOpen}
      persistKey={persistKey ? `${persistKey}:usage` : undefined}
      className={className}
    >
      <div className="text-sm leading-relaxed text-fg [&_li]:my-0.5 [&_ol]:m-0 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </Section>
  );
}
