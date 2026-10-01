import { TemplateGallery, type TemplateItem } from '@/ui';
import type { DemoSettings } from '../demo';
import { useDemo } from '../store';

type Preset = Partial<DemoSettings>;

const swatch = (a: string, b: string, text: string, color: string) => (
  <span
    className="flex size-full items-center justify-center text-base font-bold"
    style={{ background: `linear-gradient(135deg, ${a}, ${b})`, color }}
  >
    {text}
  </span>
);

const TEMPLATES: TemplateItem<Preset>[] = [
  {
    id: 'crit',
    name: '大成功',
    description: '金色文字、紫色骰子',
    tags: ['判定'],
    thumbnail: swatch('#b79ce0', '#5a3e88', '大成功', '#f0c36d'),
    data: {
      text: '大成功！',
      textColor: '#f0c36d',
      die: {
        kind: 'linear',
        angle: 135,
        stops: [
          { offset: 0, color: '#b79ce0' },
          { offset: 1, color: '#5a3e88' },
        ],
      },
      ease: 'bounce',
    },
  },
  {
    id: 'fumble',
    name: '大失敗',
    description: '紅色文字、灰色骰子',
    tags: ['判定'],
    thumbnail: swatch('#9a9a9a', '#3a3a3a', '大失敗', '#f2877e'),
    data: {
      text: '大失敗……',
      textColor: '#f2877e',
      die: {
        kind: 'linear',
        angle: 135,
        stops: [
          { offset: 0, color: '#9a9a9a' },
          { offset: 1, color: '#3a3a3a' },
        ],
      },
      ease: 'snap',
      sparkles: false,
    },
  },
  {
    id: 'sanity',
    name: 'SAN 檢定',
    description: '青綠色、彈簧落下',
    tags: ['CoC'],
    thumbnail: swatch('#7fcf9a', '#1d7340', 'SAN', '#ffffff'),
    data: {
      text: 'SAN 檢定',
      textColor: '#ffffff',
      die: {
        kind: 'radial',
        angle: 0,
        stops: [
          { offset: 0, color: '#7fcf9a' },
          { offset: 1, color: '#1d7340' },
        ],
      },
      ease: 'spring',
    },
  },
];

/** 範本庫：套用前確認，套用後可以復原 */
export function TemplatesDemo() {
  const update = useDemo((s) => s.update);
  const text = useDemo((s) => s.data.text);
  const active = TEMPLATES.find((t) => t.data.text === text)?.id ?? null;
  return (
    <TemplateGallery
      aria-label="示範動畫範本"
      templates={TEMPLATES}
      activeId={active}
      onApply={(t) =>
        update((d) => {
          Object.assign(d, t.data);
        })
      }
    />
  );
}
