/**
 * 「立繪工作台」：部件選擇（PartPicker＋core/compose）、圖層順序（LayerList 的上移／下移）、
 * 表情清單（SelectableCardList）、合輯圖（core/sheet）、ZIP 專案檔＋三選一（serializeProjectZip、useChoice）。
 */
import { Download, FolderOpen, Grid3x3, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { composeLayers, drawLayers } from '@/core/compose';
import { downloadBlob, downloadBytes, pickFiles, readAsBytes } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import { captionMeasure, drawSheet, layoutSheet } from '@/core/sheet';
import { parseProjectBytes, serializeProjectZip } from '@/core/storage';
import {
  Button,
  Field,
  LayerList,
  PartPicker,
  ProjectMenu,
  Section,
  SelectableCardList,
  TextArea,
  useChoice,
  useConfirm,
  useToast,
} from '@/ui';
import { type FaceParts, makeFaceParts } from './art';
import { type DemoExpression, useG3, useG3Preview } from './store';

type Draft = { eyes: string | null; mouth: string | null; decorations: string[] };

function layersOf(parts: FaceParts, d: Draft) {
  const find = (list: FaceParts['eyes'], id: string | null) =>
    list.find((p) => p.id === id)?.layer ?? null;
  return [
    ...parts.base,
    find(parts.eyes, d.eyes),
    find(parts.mouths, d.mouth),
    ...d.decorations.map((id) => find(parts.decorations, id)),
  ];
}

function Composite({ parts, draft, size }: { parts: FaceParts; draft: Draft; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawLayers(ctx, layersOf(parts, draft), { x: 0, y: 0, width: c.width, height: c.height });
  }, [parts, draft]);
  return (
    <canvas
      ref={ref}
      width={size * 2}
      height={size * 2}
      className="checker block rounded-md"
      style={{ width: size, height: size }}
    />
  );
}

const FONT = '600 26px "Noto Sans TC", sans-serif';

export function G3PartsDemo() {
  const parts = useMemo(() => makeFaceParts(), []);
  const draft = useG3((s) => s.data.draft);
  const list = useG3((s) => s.data.expressions);
  const update = useG3((s) => s.update);
  const editingId = useG3Preview((s) => s.data.editingId);
  const setPreview = useG3Preview((s) => s.patch);
  const confirm = useConfirm();
  const choose = useChoice();
  const toast = useToast();
  const sheet = useRef<HTMLCanvasElement>(null);
  const [sheetInfo, setSheetInfo] = useState<string | null>(null);
  const [lastChoice, setLastChoice] = useState<string>('（還沒選）');

  /* 清單縮圖：每筆疊成 128 px 的小圖（同一份 drawLayers 規則） */
  const thumbs = useMemo(
    () =>
      new Map(
        list.map((e) => [e.id, composeLayers(layersOf(parts, e), { width: 128, height: 128 })]),
      ),
    [list, parts],
  );
  const nameOf = (id: string | null, l: FaceParts['eyes']) => l.find((p) => p.id === id)?.name;
  const summary = (e: DemoExpression) =>
    [nameOf(e.eyes, parts.eyes), nameOf(e.mouth, parts.mouths)].filter(Boolean).join(' · ') +
      (e.decorations.length ? ` · 裝飾×${e.decorations.length}` : '') || '空白表情';

  const setDraft = (patch: Partial<G3Draft>) => update((d) => void Object.assign(d.draft, patch));
  const save = () => {
    if (!draft.eyes && !draft.mouth && !draft.decorations.length) {
      toast({ title: '請至少選一個部件', tone: 'warning' });
      return;
    }
    update((d) => {
      const data = {
        label: d.draft.label.trim(),
        eyes: d.draft.eyes,
        mouth: d.draft.mouth,
        decorations: [...d.draft.decorations],
      };
      const cur = d.expressions.find((e) => e.id === editingId);
      if (cur) Object.assign(cur, data);
      else d.expressions.push({ id: `e${Date.now().toString(36)}`, checked: true, ...data });
    });
    toast({ title: editingId ? '已修改' : '已儲存', tone: 'success' });
    setPreview({ editingId: null });
  };

  const makeSheet = () => {
    const picked = list.filter((e) => e.checked);
    if (!picked.length) {
      toast({ title: '請勾選要放進合輯圖的表情', tone: 'warning' });
      return null;
    }
    const layout = layoutSheet({
      count: picked.length,
      cellSize: 160,
      gap: 12,
      fontSize: 26,
      captions: picked.map((e) => e.label),
      measure: captionMeasure(FONT),
    });
    const c = document.createElement('canvas');
    c.width = layout.width;
    c.height = layout.height;
    const ctx = c.getContext('2d');
    if (ctx)
      drawSheet(ctx, layout, {
        font: FONT,
        color: '#222222',
        background: '#ffffff',
        drawCell: (x, i, r) => drawLayers(x, layersOf(parts, picked[i]), r),
      });
    setSheetInfo(
      `表情 ${picked.length} 個 · ${layout.columns}×${layout.rows} · 輸出 ${layout.width}×${layout.height} px`,
    );
    return c;
  };

  return (
    <>
      <Section title="部件選擇 PartPicker＋core/compose" persistKey="_gallery:g3:parts">
        <div className="flex flex-wrap items-start gap-3">
          <Composite parts={parts} draft={draft} size={120} />
          <div className="flex min-w-40 flex-1 flex-col gap-2">
            <Field label="標籤">
              <TextArea
                rows={2}
                value={draft.label}
                onChange={(e) => setDraft({ label: e.target.value })}
              />
            </Field>
            <div className="flex gap-1">
              <Button size="sm" variant="primary" icon={<Save />} onClick={save}>
                {editingId ? '完成修改' : '儲存表情'}
              </Button>
              {editingId ? (
                <Button size="sm" onClick={() => setPreview({ editingId: null })}>
                  取消編輯
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <PartPicker
          label="眼睛"
          mode="single"
          base={parts.base}
          options={parts.eyes}
          value={draft.eyes ? [draft.eyes] : []}
          onChange={([id]) => setDraft({ eyes: id ?? null })}
          thumbSize={64}
        />
        <PartPicker
          label="嘴巴"
          mode="single"
          base={parts.base}
          options={parts.mouths.map((m, i) => ({ ...m, custom: i === 2 }))}
          value={draft.mouth ? [draft.mouth] : []}
          onChange={([id]) => setDraft({ mouth: id ?? null })}
          onRemove={(o) => toast({ title: `示範：刪除「${o.name}」前要先確認` })}
          thumbSize={64}
        />
        <PartPicker
          label="裝飾"
          mode="multiple"
          base={parts.base}
          options={parts.decorations}
          value={draft.decorations}
          onChange={(next) => setDraft({ decorations: next })}
          thumbSize={64}
        />
        <LayerList
          aria-label="裝飾圖層（上面＝前面）"
          items={[...draft.decorations].reverse().map((id, i) => ({
            id,
            name: `${i + 1}. ${nameOf(id, parts.decorations) ?? id}`,
          }))}
          moveButtons={{ up: '往前一層', down: '往後一層' }}
          onMove={(from, to) => {
            const n = draft.decorations.length;
            const next = [...draft.decorations];
            const [it] = next.splice(n - 1 - from, 1);
            next.splice(n - 1 - to, 0, it);
            setDraft({ decorations: next });
          }}
          empty="目前沒有裝飾。"
          compact
        />
      </Section>
      <Section
        title="表情清單 SelectableCardList＋合輯圖 core/sheet"
        persistKey="_gallery:g3:cards"
      >
        <SelectableCardList
          title="表情清單"
          items={list.map((e) => ({
            id: e.id,
            title: e.label,
            summary: summary(e),
            thumbnail: thumbs.get(e.id) as HTMLCanvasElement | undefined,
            checked: e.checked,
          }))}
          editingId={editingId}
          onCheckedChange={(id, v) =>
            update((d) => {
              const e = d.expressions.find((x) => x.id === id);
              if (e) e.checked = v;
            })
          }
          onEdit={(id) => {
            const e = list.find((x) => x.id === id);
            if (!e) return;
            setDraft({
              eyes: e.eyes,
              mouth: e.mouth,
              decorations: [...e.decorations],
              label: e.label,
            });
            setPreview({ editingId: id });
          }}
          onDuplicate={(id) =>
            update((d) => {
              const i = d.expressions.findIndex((x) => x.id === id);
              if (i >= 0)
                d.expressions.splice(i + 1, 0, {
                  ...structuredClone(d.expressions[i]),
                  id: `e${Date.now().toString(36)}`,
                  label: `${d.expressions[i].label}（複製）`,
                });
            })
          }
          onDelete={async (id) => {
            const e = list.find((x) => x.id === id);
            if (
              !(await confirm({
                title: `刪除「${e?.label || '此表情'}」？`,
                danger: true,
                confirmLabel: '刪除',
              }))
            )
              return;
            update((d) => {
              d.expressions = d.expressions.filter((x) => x.id !== id);
            });
            if (editingId === id) setPreview({ editingId: null });
          }}
          onCheckAll={(v) =>
            update((d) => {
              for (const e of d.expressions) e.checked = v;
            })
          }
          onDeleteChecked={async () => {
            const n = list.filter((e) => e.checked).length;
            if (!n) return toast({ title: '沒有勾選的表情', tone: 'warning' });
            if (
              !(await confirm({
                title: `刪除勾選的 ${n} 個表情？`,
                danger: true,
                confirmLabel: '刪除',
              }))
            )
              return;
            update((d) => {
              d.expressions = d.expressions.filter((e) => !e.checked);
            });
          }}
          empty="先選部件，再按「儲存表情」。"
        />
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            icon={<Grid3x3 />}
            onClick={() => {
              const c = makeSheet();
              const v = sheet.current;
              if (!c || !v) return;
              v.width = c.width;
              v.height = c.height;
              v.getContext('2d')?.drawImage(c, 0, 0);
            }}
          >
            產生合輯圖
          </Button>
          <Button
            size="sm"
            icon={<Download />}
            onClick={async () => {
              const c = makeSheet();
              if (c) downloadBlob(await canvasToBlob(c), 'emotion-grid-demo.png');
            }}
          >
            下載合輯圖
          </Button>
        </div>
        {sheetInfo ? (
          <p className="m-0 text-xs text-muted" data-testid="sheet-info">
            {sheetInfo}
          </p>
        ) : null}
        <canvas
          ref={sheet}
          width={1}
          height={1}
          className={sheetInfo ? 'checker block max-w-full rounded-md' : 'hidden'}
        />
      </Section>
      <Section title="ZIP 專案檔＋三選一 useChoice" persistKey="_gallery:g3:project">
        <p className="m-0 text-xs text-muted">
          serializeProjectZip：project.json＋files/（圖片原封不動）；parseProjectBytes 自動分辨 ZIP
          或舊的 JSON。 ProjectMenu 給 getFiles 就會存成
          ZIP。匯入時清單不是空的就三選一（加在後面／取代／取消）。
        </p>
        <div className="flex flex-wrap items-center gap-2" data-testid="g3-project-menu">
          <span className="text-xs text-muted">ProjectMenu（夾帶圖片）：</span>
          <ProjectMenu<{ expressions: DemoExpression[] }>
            toolId="_gallery-g3"
            getData={() => ({ expressions: useG3.getState().data.expressions })}
            getFiles={async () => [
              {
                name: 'face.png',
                data: new Uint8Array(await (await canvasToBlob(parts.base[0])).arrayBuffer()),
              },
            ]}
            fileNameFor={(d) =>
              `g3-demo_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
            }
            beforeSave={() => (useG3.getState().data.expressions.length ? null : '還沒有表情')}
            confirmOpen={() =>
              useG3.getState().data.expressions.length
                ? {
                    title: '開啟專案檔？',
                    description: '目前的表情清單會被取代，而且無法復原；建議先存成專案檔。',
                    confirmLabel: '選擇檔案',
                    danger: true,
                  }
                : null
            }
            onLoad={(data, _file, files) => {
              if (!Array.isArray(data.expressions)) return false;
              update((d) => {
                d.expressions = data.expressions;
              });
              setLastChoice(`開啟專案檔（附帶 ${files.size} 個檔案）`);
            }}
            onReset={() =>
              update((d) => {
                d.expressions = [];
              })
            }
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            icon={<Save />}
            onClick={async () => {
              const png = new Uint8Array(await (await canvasToBlob(parts.base[0])).arrayBuffer());
              downloadBytes(
                serializeProjectZip('_gallery-g3', 1, { expressions: list }, [
                  { name: 'face.png', data: png },
                ]),
                'g3-demo.zip',
                'application/zip',
              );
            }}
          >
            存成 ZIP 專案檔
          </Button>
          <Button
            size="sm"
            icon={<FolderOpen />}
            onClick={async () => {
              const [file] = await pickFiles({ accept: '.zip,.json' });
              if (!file) return;
              try {
                const p = parseProjectBytes<{ expressions: DemoExpression[] }>(
                  await readAsBytes(file),
                  '_gallery-g3',
                );
                const incoming = p.data.expressions ?? [];
                const how = list.length
                  ? await choose({
                      title: `匯入 ${incoming.length} 個表情`,
                      description: `目前清單已有 ${list.length} 個表情。`,
                      choices: [
                        { value: 'append', label: '加在後面' },
                        { value: 'replace', label: '取代目前的清單', variant: 'danger' },
                      ],
                    })
                  : 'replace';
                setLastChoice(how ?? '取消');
                if (!how) return;
                update((d) => {
                  const fresh = incoming.map((e, i) => ({
                    ...e,
                    id: `i${Date.now().toString(36)}${i}`,
                  }));
                  d.expressions = how === 'append' ? [...d.expressions, ...fresh] : fresh;
                });
                toast({
                  title: `已匯入 ${incoming.length} 個（附帶 ${p.files.size} 個檔案）`,
                  tone: 'success',
                });
              } catch (e) {
                toast({
                  title: '無法匯入',
                  description: e instanceof Error ? e.message : String(e),
                  tone: 'danger',
                });
              }
            }}
          >
            匯入專案檔…
          </Button>
          <Button
            size="sm"
            onClick={async () =>
              setLastChoice(
                (await choose({
                  title: '三選一示範',
                  choices: [
                    { value: 'append', label: '加入' },
                    { value: 'replace', label: '取代', variant: 'danger' },
                  ],
                })) ?? '取消',
              )
            }
          >
            三選一示範
          </Button>
        </div>
        <p className="m-0 text-xs text-muted" data-testid="choice-answer">
          上次的選擇：{lastChoice}
        </p>
      </Section>
    </>
  );
}

type G3Draft = Draft & { label: string };
