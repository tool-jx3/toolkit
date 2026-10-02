/**
 * 設定欄的「頁面」分頁（F210～F213、F054、F055）：對象頁面、刪除頁面、封面頁、版權頁、背景。
 */
import { useState } from 'react';
import { formatDataSize, readAsDataUrl } from '@/core/files';
import { Button, Checkbox, Field, Section, Segmented, Slider } from '@/ui';
import { bridge } from '../bridge';
import { BG_WARN_BYTES, pickRawImage } from '../images';
import type { PageBg } from '../model/types';
import { blocksOnPages, deletePages, makeColophon, makeCover, pageAt } from '../ops';
import { pageSettingAt } from '../render/html';
import { edit, say, setUi, useDoc, useUi } from '../store';
import { S } from '../strings';

/** 花紋的名稱（舊原稿的其他花紋照樣顯示） */
export const BG_NAMES: Record<string, string> = {
  none: '素色',
  'bg-paper': '紙紋',
  'bg-grid': '方格',
  'bg-rule': '橫線',
  'bg-dot': '點',
  'bg-vignette': '暗角',
  'bg-band': '色帶',
  'bg-parch': '羊皮紙',
  'bg-fog': '霧',
};

export function PagesTab() {
  const d = useDoc((s) => s.data);
  const total = useUi((s) => s.total);
  const pageSel = useUi((s) => s.pageSel);
  const [bg, setBg] = useState<Omit<PageBg, 'img'> & { img: string | null }>({
    preset: 'none',
    img: null,
    fit: 'cover',
    opa: 35,
  });
  const n = pageSel.length ? blocksOnPages(pageSel).length : 0;
  const toggle = (i: number, on: boolean) => {
    const cur = new Set(pageSel);
    if (on) cur.add(i);
    else cur.delete(i);
    setUi({ pageSel: [...cur].sort((a, b) => a - b) });
  };
  const pickBg = async () => {
    const f = await pickRawImage();
    if (!f) return;
    if (
      f.size > BG_WARN_BYTES &&
      !(await bridge.confirm({ title: S.confirm.bigBg, confirmLabel: '使用' }))
    )
      return;
    const url = await readAsDataUrl(f);
    setBg((b) => ({ ...b, img: url }));
  };
  const apply = () => {
    if (!pageSel.length) {
      say(S.status.pickPage, 'warn');
      return;
    }
    edit((x) => {
      for (const i of pageSel) {
        const p = pageAt(x, i);
        p.bg = { preset: bg.preset, img: bg.img ?? p.bg.img, fit: bg.fit, opa: bg.opa };
      }
    });
    say(S.status.bgApplied(pageSel.length));
  };
  const remove = () => {
    if (!pageSel.length) {
      say(S.status.pickPage, 'warn');
      return;
    }
    edit((x) => {
      for (const i of pageSel)
        pageAt(x, i).bg = { preset: 'none', img: null, fit: 'cover', opa: 35 };
    });
    say(S.status.bgRemoved(pageSel.length));
  };
  return (
    <div className="flex flex-col gap-2">
      <Section
        title="對象頁面"
        fixed
        description="勾選的頁面是刪除頁面、背景、單欄／雙欄的對象（與紙面頁首的勾選同步）。"
      >
        <ul
          className="m-0 flex max-h-60 list-none flex-col gap-0.5 overflow-auto p-0"
          aria-label="頁面"
        >
          {Array.from({ length: total }, (_, i) => {
            const st = pageSettingAt(d, i);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 頁面以頁碼為身分
              <li key={i}>
                <Checkbox
                  checked={pageSel.includes(i)}
                  onCheckedChange={(v) => toggle(i, !!v)}
                  label={`P.${i + 1}　${st.cols === 2 ? '雙欄' : '單欄'}／${BG_NAMES[st.bg.preset] ?? st.bg.preset}${st.bg.img ? '＋圖片' : ''}`}
                />
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setUi({ pageSel: Array.from({ length: total }, (_, i) => i) })}
          >
            選取全部頁面
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setUi({ pageSel: [] })}>
            取消選取
          </Button>
        </div>
        <Field
          label="刪除頁面"
          hint={
            pageSel.length
              ? `會刪除勾選頁面上的 ${n} 個段落（連同結束那一頁的換頁）。`
              : '先勾選要刪除的頁面。'
          }
        >
          <Button size="sm" variant="danger" onClick={() => void deletePages()}>
            刪除勾選的頁面
          </Button>
        </Field>
      </Section>
      <Section title="封面與版權頁" fixed>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="secondary" onClick={makeCover}>
            建立封面頁
          </Button>
          <Button size="sm" variant="secondary" onClick={makeColophon}>
            建立版權頁
          </Button>
        </div>
      </Section>
      <Section title="背景" fixed>
        <Field label="花紋">
          <Segmented
            size="sm"
            value={bg.preset === 'bg-paper' ? 'bg-paper' : 'none'}
            onValueChange={(v) => setBg((b) => ({ ...b, preset: v }))}
            options={[
              { value: 'none', label: '素色' },
              { value: 'bg-paper', label: '紙紋' },
            ]}
          />
        </Field>
        <Field
          label="背景圖"
          hint={
            bg.img
              ? `已選擇（${formatDataSize(Math.round((bg.img.length * 3) / 4))}）`
              : '超過 2.5 MB 時會先確認。'
          }
        >
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" onClick={() => void pickBg()}>
              選擇圖片
            </Button>
            {bg.img ? (
              <Button size="sm" variant="ghost" onClick={() => setBg((b) => ({ ...b, img: null }))}>
                不使用圖片
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="大小">
          <Segmented
            size="sm"
            value={bg.fit}
            onValueChange={(v) => setBg((b) => ({ ...b, fit: v }))}
            options={[
              { value: 'cover', label: '覆蓋整面' },
              { value: 'contain', label: '完整放入' },
              { value: 'repeat', label: '平鋪' },
            ]}
          />
        </Field>
        <Field label="濃度">
          <Slider
            value={bg.opa}
            min={5}
            max={100}
            unit="%"
            onChange={(v) => setBg((b) => ({ ...b, opa: Math.round(v) }))}
          />
        </Field>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={apply}>
            套用到選取的頁面
          </Button>
          <Button size="sm" variant="secondary" onClick={remove}>
            移除背景
          </Button>
        </div>
      </Section>
    </div>
  );
}
