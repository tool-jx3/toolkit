/**
 * 場景頁（F170～F210）：建立區（快速建立、名稱符號、從素材挑選、貼上建立、場景範本）、場景一覽（點選、Shift 範圍、
 * Ctrl 切換、批次選取模式、勾選工具、拖曳排序）、場景詳細（標題列、前景、備忘、詳細設定、立繪、演出、切入、共用部件差異）、
 * 記住設定並貼上的面板。
 */
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  BookmarkCheck,
  CircleHelp,
  Copy,
  Film,
  Sparkles,
  Star,
  Trash2,
  UserSquare2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Checkbox, cn, IconButton, Select, TextInput, Tooltip, useConfirm } from '@/ui';
import {
  addEffect,
  addScene,
  assignCutin,
  clearOverride,
  deleteSceneMarker,
  duplicateEffect,
  layoutScene,
  sceneById,
  setOverride,
  setTachieAppear,
  setTachieFace,
  swapTachie,
  updateEffect,
  updateSceneTachie,
} from '../actions';
import { Card, Hint, ImageField, Labeled, NumCell, Row, Thumb, useNotify } from '../common';
import { sceneText } from '../exportRoom';
import {
  effectivePart,
  effectRect,
  materialLookup,
  overrideKinds,
  tachieChipLabel,
  tachieFamily,
} from '../geometry';
import {
  cutinTemplateItems,
  ensureMaterial,
  presetItems,
  saveCutinTemplate,
  saveEffectPreset,
} from '../library';
import type { BackgroundMode, Scene, SceneMarker } from '../model';
import { openFade, openMultiPick } from '../ops';
import {
  type ClipKind,
  clipFromScene,
  duplicateScene,
  moveBefore,
  moveSelected,
  moveSelectedTo,
  pasteClip,
  syncSceneToRoom,
} from '../scenes';
import {
  commit,
  layout,
  patchLayout,
  setSession,
  settings,
  useLayout,
  useLibrary,
  useProject,
  useSession,
  useSettings,
} from '../store';
import { S } from '../strings';

export function ScenesPage() {
  const sceneId = useSession((s) => s.sceneId);
  const scene = useProject((s) => s.data.scenes.find((x) => x.id === sceneId));
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="scenes-page">
      <CreateArea />
      <div className="grid min-w-0 grid-cols-1 gap-3 2xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <SceneList />
        {scene ? (
          <SceneDetail scene={scene} />
        ) : (
          <Card>
            <Hint>{S.pickScene}</Hint>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------- 建立區（F170～F175） ---------- */

function CreateArea() {
  const n = useNotify();
  const symbols = useSettings((s) => s.data.symbols);
  const [collapsed, setCollapsed] = useState(false);
  const [name, setName] = useState('');
  const [fg, setFg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const create = () => {
    let id = '';
    commit((d) => {
      id = addScene(d, name, fg).id;
    });
    setSession({ sceneId: id, sceneSel: [] });
    setName('');
    input.current?.focus();
    n(S.sceneCreated, 'success');
  };
  const syms = symbols.split(/[\s,、]+/).filter(Boolean);
  const batch = (
    <>
      <Button size="sm" onClick={() => openMultiPick('scene', n)}>
        {S.fromMaterialsScene}
      </Button>
      <Button size="sm" onClick={() => setSession({ modal: { kind: 'bulk' } })}>
        {S.bulkCreate}
      </Button>
      <Button size="sm" onClick={() => setSession({ modal: { kind: 'sceneTemplates' } })}>
        {S.sceneTemplates}
      </Button>
    </>
  );
  return (
    <Card
      title={S.createArea}
      actions={
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? S.createExpand : S.createCollapse}
        </Button>
      }
    >
      {collapsed ? (
        <Row>{batch}</Row>
      ) : (
        <>
          <Row className="items-end">
            <Labeled label={S.quickName} className="min-w-0 flex-1">
              <TextInput
                id="quick-scene-name"
                ref={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                  if (!name.trim()) return;
                  e.preventDefault();
                  create();
                }}
              />
            </Labeled>
            <Labeled label={S.quickFg}>
              <ImageField
                aria-label={S.quickFg}
                value={fg}
                onChange={setFg}
                empty={S.quickFgEmpty}
                useFor="fg"
              />
            </Labeled>
            <Button variant="primary" onClick={create}>
              {S.quickCreate}
            </Button>
          </Row>
          <Row>
            <span className="text-xs text-muted">{S.symbols}</span>
            {syms.map((sym) => (
              <Button
                key={sym}
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName((v) => v + sym);
                  input.current?.focus();
                }}
              >
                {sym}
              </Button>
            ))}
          </Row>
          <Row>{batch}</Row>
        </>
      )}
    </Card>
  );
}

/* ---------- 場景一覽（F176～F179、F181） ---------- */

function SceneList() {
  const scenes = useProject((s) => s.data.scenes);
  const cutins = useProject((s) => s.data.cutins);
  const sess = useSession();
  const n = useNotify();
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const sel = new Set(sess.sceneSel);
  const click = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && sess.sceneId) {
      const a = scenes.findIndex((s) => s.id === sess.sceneId);
      const b = scenes.findIndex((s) => s.id === id);
      const range = scenes.slice(Math.min(a, b), Math.max(a, b) + 1).map((s) => s.id);
      setSession({ sceneSel: [...new Set([...sess.sceneSel, ...range])] });
      return;
    }
    if (e.ctrlKey || e.metaKey || sess.multiPickMode) {
      setSession({
        sceneSel: sel.has(id) ? sess.sceneSel.filter((x) => x !== id) : [...sess.sceneSel, id],
        sceneId: id,
      });
      return;
    }
    setSession({
      sceneId: id,
      sceneSel: [],
      advancedSceneId: sess.advancedSceneId === id ? id : null,
    });
  };
  const move = (fn: (list: Scene[]) => Scene[]) => {
    if (!sel.size) return n(S.needChecked, 'warning');
    commit((d) => {
      d.scenes = fn(d.scenes);
    });
  };
  return (
    <Card title={S.sceneList} sub={`${scenes.length} 個`}>
      <Row>
        <Button
          size="sm"
          variant={sess.multiPickMode ? 'primary' : 'ghost'}
          aria-pressed={sess.multiPickMode}
          onClick={() => {
            setSession({ multiPickMode: !sess.multiPickMode });
            n(sess.multiPickMode ? S.multiModeOff : S.multiModeOn);
          }}
        >
          {S.multiMode(sess.multiPickMode)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSession({ sceneSel: scenes.map((s) => s.id) })}
        >
          {S.checkAll}
        </Button>
        {sel.size ? (
          <Button size="sm" variant="ghost" onClick={() => setSession({ sceneSel: [] })}>
            {S.checkNone(sel.size)}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSession({ modal: { kind: 'sceneRename' } })}
          disabled={!scenes.length}
        >
          {S.sceneRename}
        </Button>
      </Row>
      {sel.size ? (
        <Row>
          <Button size="sm" onClick={() => move((l) => moveSelected(l, sel, -1))}>
            {S.moveUp}
          </Button>
          <Button size="sm" onClick={() => move((l) => moveSelected(l, sel, 1))}>
            {S.moveDown}
          </Button>
          <Button size="sm" onClick={() => move((l) => moveSelectedTo(l, sel, 'top'))}>
            {S.moveTop}
          </Button>
          <Button size="sm" onClick={() => move((l) => moveSelectedTo(l, sel, 'bottom'))}>
            {S.moveBottom}
          </Button>
        </Row>
      ) : null}
      {!scenes.length ? <Hint>{S.noScenes}</Hint> : null}
      <ol
        className="m-0 flex max-h-[60dvh] list-none flex-col gap-1 overflow-y-auto p-0"
        aria-label={S.sceneList}
      >
        {scenes.map((s, i) => {
          const hasTachie = s.markers.some((m) => m.kind === 'tachie');
          const hasEffect = s.markers.some((m) => m.kind !== 'tachie');
          const hasCutin = !!s.cutinId && cutins.some((c) => c.id === s.cutinId);
          return (
            <li
              key={s.id}
              data-scene-row={s.id}
              aria-current={s.id === sess.sceneId ? 'true' : undefined}
              data-checked={sel.has(s.id) || undefined}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', s.id);
                setDragIds(sel.has(s.id) ? sess.sceneSel : [s.id]);
              }}
              onDragOver={(e) => {
                if (!dragIds) return;
                e.preventDefault();
                setOver(s.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                if (!dragIds) return;
                e.preventDefault();
                const ids = new Set(dragIds);
                commit((d) => {
                  d.scenes = moveBefore(d.scenes, ids, s.id);
                });
                setDragIds(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragIds(null);
                setOver(null);
              }}
              onClick={(e) => click(s.id, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSession({ sceneId: s.id, sceneSel: [] });
              }}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: 場景列可用鍵盤聚焦，Enter 開啟
              tabIndex={0}
              className={cn(
                'flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-transparent p-1 text-sm hover:bg-surface-3 focus-visible:focus-ring',
                s.id === sess.sceneId && 'border-accent bg-accent-soft',
                sel.has(s.id) && 'bg-warning-soft',
                over === s.id && 'border-t-2 border-t-accent',
              )}
            >
              <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">
                {i + 1}
              </span>
              {s.foregroundUrl ? (
                <Thumb name={s.foregroundUrl} className="h-7 w-12" fit="cover" />
              ) : (
                <span className="h-px w-12 shrink-0 bg-border" />
              )}
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="flex shrink-0 gap-0.5 text-muted [&_svg]:size-3.5">
                {hasTachie ? <UserSquare2 aria-label={S.sceneMarks.tachie} /> : null}
                {hasCutin ? <Sparkles aria-label={S.sceneMarks.cutin} /> : null}
                {hasEffect ? <Film aria-label={S.sceneMarks.effect} /> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ---------- 場景詳細（F182～F206） ---------- */

function Fold({
  id,
  title,
  count,
  help,
  children,
}: {
  id: 'tachie' | 'effect' | 'cutin' | 'parts';
  title: string;
  count: string;
  help: string;
  children: ReactNode;
}) {
  const folds = useLayout((s) => s.data.sceneFolds);
  const open = folds[id] !== false;
  return (
    <section
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-2"
      data-section={id}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          className="flex items-center gap-1 text-left text-sm font-semibold"
          onClick={() => patchLayout({ sceneFolds: { ...layout().sceneFolds, [id]: !open } })}
        >
          {open ? '▾' : '▸'} {title}
        </button>
        <span className="text-xs text-muted">{count}</span>
        <Tooltip content={help}>
          <button
            type="button"
            aria-label={help}
            className="inline-flex rounded-sm text-muted focus-visible:focus-ring [&_svg]:size-3.5"
          >
            <CircleHelp />
          </button>
        </Tooltip>
      </div>
      {open ? children : null}
    </section>
  );
}

function SceneDetail({ scene }: { scene: Scene }) {
  const n = useNotify();
  const confirm = useConfirm();
  const p = useProject((s) => s.data);
  const sess = useSession();
  const idx = p.scenes.findIndex((s) => s.id === scene.id);
  const upd = (fn: (s: Scene) => void) =>
    commit((d) => {
      const s = sceneById(d, scene.id);
      if (s) fn(s);
    });
  const advanced = sess.advancedSceneId === scene.id;
  const bookmarked = sess.clip?.id === scene.id;
  const sync = async (which: 'this' | 'checked' | 'all') => {
    const ids =
      which === 'this'
        ? [scene.id]
        : which === 'checked'
          ? sess.sceneSel
          : p.scenes.map((s) => s.id);
    if (!ids.length) return;
    if (
      which !== 'this' &&
      !(await confirm({ title: S.syncRoom, description: S.syncConfirm(ids.length) }))
    )
      return;
    commit((d) => {
      for (const s of d.scenes) if (ids.includes(s.id)) syncSceneToRoom(s, d.room);
    });
    n(S.syncDone(ids.length), 'success');
  };
  return (
    <Card className="min-w-0" data-testid="scene-detail">
      <Row>
        <span className="text-sm text-muted tabular-nums">{idx + 1}.</span>
        <TextInput
          aria-label={S.quickName}
          value={scene.name}
          onChange={(e) =>
            upd((s) => {
              s.name = e.target.value;
            })
          }
          className="min-w-0 flex-1"
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.sceneCopy}
          icon={<Copy />}
          onClick={() => {
            let id = '';
            commit((d) => {
              const i = d.scenes.findIndex((s) => s.id === scene.id);
              const c = duplicateScene(d.scenes[i]);
              d.scenes.splice(i + 1, 0, c);
              id = c.id;
            });
            setSession({ sceneId: id });
          }}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.sceneUp}
          icon={<ArrowUp />}
          onClick={() =>
            commit((d) => {
              d.scenes = moveSelected(d.scenes, new Set([scene.id]), -1);
            })
          }
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.sceneDown}
          icon={<ArrowDown />}
          onClick={() =>
            commit((d) => {
              d.scenes = moveSelected(d.scenes, new Set([scene.id]), 1);
            })
          }
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.sceneDelete}
          icon={<Trash2 />}
          onClick={() => {
            commit((d) => {
              d.scenes = d.scenes.filter((s) => s.id !== scene.id);
            });
            setSession({ sceneId: null, sceneSel: sess.sceneSel.filter((x) => x !== scene.id) });
          }}
        />
        <IconButton
          size="sm"
          variant={bookmarked ? 'primary' : 'ghost'}
          label={bookmarked ? S.sceneBookmarkOn : S.sceneBookmark}
          icon={bookmarked ? <BookmarkCheck /> : <Bookmark />}
          pressed={bookmarked}
          onClick={() => {
            if (bookmarked) setSession({ clip: null });
            else {
              setSession({ clip: clipFromScene(scene) });
              n(S.clipSaved(scene.name), 'success');
            }
          }}
        />
      </Row>
      <Row>
        <Labeled label={S.sceneForeground}>
          <ImageField
            aria-label={S.sceneForeground}
            value={scene.foregroundUrl}
            onChange={(v) =>
              upd((s) => {
                s.foregroundUrl = v;
              })
            }
            useFor="fg"
          />
        </Labeled>
        <Labeled label={S.sceneMemo} className="min-w-0 flex-1">
          <textarea
            aria-label={S.sceneMemo}
            rows={2}
            value={scene.memo}
            onChange={(e) =>
              upd((s) => {
                s.memo = e.target.value;
              })
            }
            className="w-full rounded-md border border-border-strong bg-surface-2 p-1.5 text-sm text-fg focus-visible:focus-ring"
          />
        </Labeled>
      </Row>
      <button
        type="button"
        aria-expanded={advanced}
        className="self-start text-sm text-accent"
        onClick={() => setSession({ advancedSceneId: advanced ? null : scene.id })}
      >
        {advanced ? '▾' : '▸'} {S.sceneAdvanced}
      </button>
      {advanced ? (
        <div
          className="flex flex-col gap-2 rounded-md bg-surface-2 p-2"
          data-testid="scene-advanced"
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Labeled label={S.sceneText}>
              <textarea
                aria-label={S.sceneText}
                rows={3}
                value={scene.text}
                onChange={(e) =>
                  upd((s) => {
                    s.text = e.target.value;
                  })
                }
                className="w-full rounded-md border border-border-strong bg-surface p-1.5 text-sm text-fg focus-visible:focus-ring"
              />
            </Labeled>
            <Labeled label={S.sceneFinal}>
              <pre
                className="m-0 min-h-16 rounded-md border border-border bg-surface p-1.5 text-sm whitespace-pre-wrap text-fg"
                data-testid="final-text"
              >
                {sceneText(scene, p.cutins) || S.sceneFinalNone}
              </pre>
            </Labeled>
          </div>
          <Hint>{S.sceneTextHint}</Hint>
          <Row>
            <Labeled label={`${S.sceneFieldSize} ${S.width}`}>
              <NumCell
                aria-label={`${S.sceneFieldSize} ${S.width}`}
                value={scene.fieldWidth}
                min={1}
                onCommit={(v) =>
                  upd((s) => {
                    s.fieldWidth = Math.max(1, Math.round(v ?? s.fieldWidth));
                  })
                }
              />
            </Labeled>
            <Labeled label={`${S.sceneFieldSize} ${S.height}`}>
              <NumCell
                aria-label={`${S.sceneFieldSize} ${S.height}`}
                value={scene.fieldHeight}
                min={1}
                onCommit={(v) =>
                  upd((s) => {
                    s.fieldHeight = Math.max(1, Math.round(v ?? s.fieldHeight));
                  })
                }
              />
            </Labeled>
            <Checkbox
              checked={scene.autoCrop}
              onCheckedChange={(v) =>
                upd((s) => {
                  s.autoCrop = !!v;
                })
              }
              aria-label={S.sceneAutoCrop}
              label={S.sceneAutoCrop}
            />
            <Checkbox
              checked={scene.displayGrid}
              onCheckedChange={(v) =>
                upd((s) => {
                  s.displayGrid = !!v;
                })
              }
              aria-label={S.sceneGrid}
              label={S.sceneGrid}
            />
          </Row>
          <Row>
            <Labeled label={S.sceneBackground}>
              <Select
                aria-label={S.sceneBackground}
                value={scene.backgroundMode}
                onValueChange={(v) =>
                  upd((s) => {
                    s.backgroundMode = v as BackgroundMode;
                  })
                }
                options={(['room', 'foreground', 'image', 'none'] as const).map((v) => ({
                  value: v,
                  label: S.sceneBgModes[v],
                }))}
              />
            </Labeled>
            {scene.backgroundMode === 'image' ? (
              <Labeled label={S.sceneBgImage}>
                <ImageField
                  aria-label={S.sceneBgImage}
                  value={scene.backgroundUrl}
                  onChange={(v) =>
                    upd((s) => {
                      s.backgroundUrl = v;
                    })
                  }
                />
              </Labeled>
            ) : null}
          </Row>
          <Row>
            <span className="text-xs font-semibold">{S.syncRoom}</span>
            <Button size="sm" onClick={() => void sync('this')}>
              {S.syncThis}
            </Button>
            <Button size="sm" disabled={!sess.sceneSel.length} onClick={() => void sync('checked')}>
              {S.syncChecked(sess.sceneSel.length)}
            </Button>
            <Button size="sm" onClick={() => void sync('all')}>
              {S.syncAll}
            </Button>
          </Row>
          <Hint>{S.syncHint}</Hint>
        </div>
      ) : null}
      <TachieSection scene={scene} />
      <EffectSection scene={scene} />
      <CutinSection scene={scene} />
      <OverrideSection scene={scene} />
    </Card>
  );
}

/** 從預覽圖層跳過來時，捲到對應的列並閃一下 */
function useFlash(id: string) {
  const flash = useSession((s) => s.flash);
  const ref = useRef<HTMLDivElement>(null);
  const on = !!flash && flash.endsWith(`:${id}`);
  useEffect(() => {
    if (!on) return;
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setSession({ flash: null }), 1200);
    return () => clearTimeout(t);
  }, [on]);
  return { ref, on };
}

/* ---------- 立繪（F192～F194） ---------- */

function TachieRow({ scene, m }: { scene: Scene; m: SceneMarker }) {
  const p = useProject((s) => s.data);
  const { ref, on } = useFlash(m.id);
  const tc = m.refId ? p.tachie.find((x) => x.id === m.refId) : undefined;
  const fam = tc ? tachieFamily(p, tc) : [];
  const rootId = tc ? (tc.baseId && fam.some((x) => x.id === tc.baseId) ? tc.baseId : tc.id) : null;
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-2 rounded-sm p-1',
        on && 'bg-accent-soft',
      )}
      data-scene-tachie={m.id}
    >
      <button
        type="button"
        className="min-w-0 truncate text-sm text-accent hover:underline"
        onClick={() =>
          m.refId && setSession({ modal: { kind: 'source', ref: { kind: 'tachie', id: m.refId } } })
        }
      >
        {m.name || tc?.character}
      </button>
      <Labeled label={S.tachieFace}>
        <Select
          aria-label={`${S.tachieFace}：${m.name}`}
          disabled={fam.length < 2}
          value={m.refId ?? ''}
          onValueChange={(v) => commit((d, c) => setTachieFace(d, scene.id, m.id, v, c))}
          options={
            fam.length
              ? fam.map((x) => ({
                  value: x.id,
                  label: x.id === rootId ? S.tachieMain : x.expression || S.tachieFace,
                }))
              : [{ value: m.refId ?? '', label: S.tachieMain }]
          }
        />
      </Labeled>
      <IconButton
        size="sm"
        variant="ghost"
        label={S.tachieSwapLeft}
        icon={<ArrowLeft />}
        onClick={() => commit((d) => swapTachie(d, scene.id, m.id, -1))}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={S.tachieSwapRight}
        icon={<ArrowRight />}
        onClick={() => commit((d) => swapTachie(d, scene.id, m.id, 1))}
      />
      {(
        [
          ['x', S.posX],
          ['y', S.posY],
          ['height', S.tachieSize],
        ] as const
      ).map(([k, label]) => (
        <Labeled key={k} label={label}>
          <NumCell
            aria-label={`${label}：${m.name}`}
            value={m[k]}
            className="w-16"
            onCommit={(v) =>
              v != null && commit((d, c) => updateSceneTachie(d, scene.id, m.id, { [k]: v }, c))
            }
          />
        </Labeled>
      ))}
    </div>
  );
}

function TachieSection({ scene }: { scene: Scene }) {
  const tachie = useProject((s) => s.data.tachie);
  const gap = useSettings((s) => s.data.tachieGap);
  const placed = scene.markers.filter((m) => m.kind === 'tachie');
  const mains = tachie.filter((t) => !t.baseId);
  const p = useProject((s) => s.data);
  return (
    <Fold id="tachie" title={S.secTachie} count={S.count(placed.length)} help={S.secHelp.tachie}>
      {!tachie.length ? <Hint>{S.tachieEmpty}</Hint> : null}
      {/* biome-ignore lint/a11y/useSemanticElements: 一組可個別勾選的立繪，不是表單分組 */}
      <div className="flex flex-wrap gap-1" role="group" aria-label={S.secTachie}>
        {mains.map((t) => {
          const fam = new Set(tachieFamily(p, t).map((x) => x.id));
          const on = placed.some((m) => m.refId && fam.has(m.refId));
          return (
            <Checkbox
              key={t.id}
              checked={on}
              label={tachieChipLabel(t)}
              onCheckedChange={(v) => commit((d, c) => setTachieAppear(d, scene.id, t.id, !!v, c))}
              className={cn(
                'rounded-full border border-border px-2 py-0.5',
                on && 'border-accent bg-accent-soft',
              )}
            />
          );
        })}
      </div>
      {placed.map((m) => (
        <TachieRow key={m.id} scene={scene} m={m} />
      ))}
      {placed.length > 1 ? (
        <Row>
          <Button size="sm" onClick={() => commit((d, c) => layoutScene(d, scene.id, c))}>
            {S.tachieLayout}
          </Button>
          <Labeled label={S.tachieGapShort}>
            <NumCell
              aria-label={S.tachieGap}
              value={gap}
              onCommit={(v) => useSettings.getState().patch({ tachieGap: v ?? 0 })}
            />
          </Labeled>
        </Row>
      ) : null}
    </Fold>
  );
}

/* ---------- 演出（F195～F200） ---------- */

function EffectRow({ scene, m }: { scene: Scene; m: SceneMarker }) {
  const n = useNotify();
  const confirm = useConfirm();
  const p = useProject((s) => s.data);
  const libData = useLibrary((s) => s.data);
  const presets = presetItems(libData);
  const { ref, on } = useFlash(m.id);
  const [opts, setOpts] = useState(false);
  const upd = (patch: Partial<SceneMarker>) =>
    commit((d, c) => updateEffect(d, scene.id, m.id, patch, c));
  const r = effectRect(m, scene, materialLookup(p.materials));
  const match = presets.find(
    (x) =>
      x.name === m.name &&
      (x.imageUrl ?? '') === (m.imageUrl ?? '') &&
      (x.text ?? '') === (m.text ?? '') &&
      x.kind === (m.kind === 'full' ? 'full' : 'free'),
  );
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2',
        on && 'ring-2 ring-accent',
      )}
      data-scene-effect={m.id}
    >
      <Row>
        <ImageField
          aria-label={`${S.effectImageEmpty}：${m.name}`}
          value={m.imageUrl}
          onChange={(v) => upd({ imageUrl: v })}
          empty={S.effectImageEmpty}
          useFor="effect"
        />
        <Labeled label={S.effectMode}>
          <Select
            aria-label={`${S.effectMode}：${m.name}`}
            value={m.kind}
            onValueChange={(v) => upd({ kind: v as 'full' | 'free' })}
            options={[
              { value: 'full', label: S.effectModes.full },
              { value: 'free', label: S.effectModes.free },
            ]}
          />
        </Labeled>
        <Labeled label={S.zOrder}>
          <NumCell
            aria-label={`${S.zOrder}：${m.name}`}
            value={m.z}
            className="w-16"
            onCommit={(v) => v != null && upd({ z: v })}
          />
        </Labeled>
        {match ? (
          <span className="text-xs text-warning">{S.effectPresetMatch(match.name)}</span>
        ) : null}
      </Row>
      {m.kind === 'full' ? (
        m.fullFit === 'contain' ? (
          <Hint>{S.effectContain}</Hint>
        ) : (
          <Checkbox
            checked={m.fullFit === 'cover'}
            onCheckedChange={(v) => upd({ fullFit: v ? 'cover' : 'stretch' })}
            aria-label={`${S.effectCover}：${m.name}`}
            label={
              <>
                {S.effectCover}
                <span className="text-muted tabular-nums">
                  （{r.width}×{r.height}）
                </span>
              </>
            }
          />
        )
      ) : (
        <Row>
          {(
            [
              ['x', S.posX],
              ['y', S.posY],
              ['width', S.width],
              ['height', S.height],
            ] as const
          ).map(([k, label]) => (
            <Labeled key={k} label={label}>
              <NumCell
                aria-label={`${label}：${m.name}`}
                value={m[k]}
                className="w-16"
                onCommit={(v) => v != null && upd({ [k]: v })}
              />
            </Labeled>
          ))}
          <Checkbox
            checked={m.lockAspect}
            onCheckedChange={(v) => upd({ lockAspect: !!v })}
            aria-label={`${S.partLockAspect}：${m.name}`}
            label={S.partLockAspect}
          />
        </Row>
      )}
      <Row>
        <Button size="sm" variant="ghost" aria-expanded={opts} onClick={() => setOpts(!opts)}>
          {opts ? '▾' : '▸'} {S.effectOptions}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openFade({ kind: 'scene', sceneId: scene.id, effectId: m.id }, m.imageUrl)}
        >
          {S.effectFade}
        </Button>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.effectToPreset}
          icon={<Star className={match ? 'fill-current' : ''} />}
          onClick={async () => {
            const dup = presetItems().find((x) => x.name === m.name);
            if (
              dup &&
              !(await confirm({ title: S.effectToPreset, description: S.presetDup(m.name) }))
            )
              return;
            await saveEffectPreset(
              {
                name: m.name,
                imageUrl: m.imageUrl,
                kind: m.kind === 'full' ? 'full' : 'free',
                fullFit: m.fullFit,
                z: m.z,
                width: m.width,
                height: m.height,
                text: m.text,
              },
              dup?.id,
            );
            n(S.presetSaved, 'success');
          }}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.effectCopy}
          icon={<Copy />}
          onClick={() => commit((d) => void duplicateEffect(d, scene.id, m.id))}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.effectDelete}
          icon={<Trash2 />}
          onClick={() => commit((d) => deleteSceneMarker(d, scene.id, m.id))}
        />
      </Row>
      {opts ? (
        <Row>
          <Labeled label={S.effectName}>
            <TextInput
              aria-label={S.effectName}
              value={m.name}
              onChange={(e) => upd({ name: e.target.value })}
            />
          </Labeled>
          <Labeled label={S.effectText} className="min-w-0 flex-1">
            <TextInput
              aria-label={S.effectText}
              value={m.text}
              onChange={(e) => upd({ text: e.target.value })}
            />
          </Labeled>
        </Row>
      ) : null}
    </div>
  );
}

function EffectSection({ scene }: { scene: Scene }) {
  const n = useNotify();
  const lib = useLibrary((s) => s.data);
  const [choice, setChoice] = useState('new');
  const list = scene.markers.filter((m) => m.kind !== 'tachie');
  const options: { value: string; label: string; disabled?: boolean }[] = [
    { value: 'new', label: S.effectNew },
  ];
  for (const e of lib.effectPresets) {
    if (e.type === 'separator')
      options.push({ value: `sep:${e.id}`, label: `── ${e.label} ──`, disabled: true });
    else options.push({ value: e.item.id, label: e.item.name });
  }
  const add = async () => {
    const preset =
      choice === 'new' ? null : (presetItems(lib).find((x) => x.id === choice) ?? null);
    if (preset?.imageUrl) {
      await ensureMaterial(preset.imageUrl, {
        label: preset.imageLabel || preset.name,
        tags: ['effect'],
      });
    }
    commit((d, c) => void addEffect(d, scene.id, preset, c));
    n(S.effectAdded, 'success');
  };
  return (
    <Fold id="effect" title={S.secEffect} count={S.count(list.length)} help={S.secHelp.effect}>
      <Row>
        <Select
          aria-label={S.secEffect}
          value={choice}
          onValueChange={setChoice}
          options={options}
        />
        <Button size="sm" variant="primary" onClick={() => void add()}>
          {S.effectAdd}
        </Button>
      </Row>
      {list.map((m) => (
        <EffectRow key={m.id} scene={scene} m={m} />
      ))}
    </Fold>
  );
}

/* ---------- 切入（F201～F203） ---------- */

function CutinSection({ scene }: { scene: Scene }) {
  const n = useNotify();
  const confirm = useConfirm();
  const cutins = useProject((s) => s.data.cutins);
  const cur = scene.cutinId ? cutins.find((c) => c.id === scene.cutinId) : undefined;
  const [choice, setChoice] = useState(cur?.id ?? 'new');
  const upd = (patch: { name?: string; imageUrl?: string | null }) =>
    commit((d) => {
      const c = d.cutins.find((x) => x.id === cur?.id);
      if (c) Object.assign(c, patch);
    });
  return (
    <Fold id="cutin" title={S.secCutin} count={S.cutinCount(cur ? 1 : 0)} help={S.secHelp.cutin}>
      <Row>
        <Select
          aria-label={S.cutinChoice}
          value={choice}
          onValueChange={setChoice}
          options={[
            { value: 'new', label: S.cutinNew },
            ...cutins.map((c) => ({ value: c.id, label: c.name || S.pages.cutins })),
          ]}
        />
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            commit((d) => void assignCutin(d, scene.id, choice));
            n(S.cutinAssigned, 'success');
          }}
        >
          {S.effectAdd}
        </Button>
      </Row>
      {cur ? (
        <Row>
          <ImageField
            aria-label={`${S.cutinChoice}：${cur.name}`}
            value={cur.imageUrl}
            onChange={(v) => upd({ imageUrl: v })}
            useFor="effect"
          />
          <TextInput
            aria-label={S.cutinName}
            value={cur.name}
            onChange={(e) => upd({ name: e.target.value })}
            className="min-w-0 flex-1"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const dup = cutinTemplateItems().find((x) => x.name === cur.name);
              if (
                dup &&
                !(await confirm({
                  title: S.cutinToTemplate,
                  description: S.cutinDupConfirm(cur.name),
                }))
              )
                return;
              await saveCutinTemplate(cur, dup?.id);
              n(S.cutinSavedN(1), 'success');
            }}
          >
            {S.cutinToTemplate}
          </Button>
          <IconButton
            size="sm"
            variant="ghost"
            label={S.cutinUnassign}
            icon={<X />}
            onClick={() =>
              commit((d) => {
                sceneById(d, scene.id)!.cutinId = null;
              })
            }
          />
        </Row>
      ) : null}
    </Fold>
  );
}

/* ---------- 共用部件的差異（F204～F206） ---------- */

function OverrideRow({ scene, partId }: { scene: Scene; partId: string }) {
  const n = useNotify();
  const part = useProject((s) => s.data.parts.find((x) => x.id === partId));
  const open = useSession((s) => !!s.overrideOpen[partId]);
  const { ref, on } = useFlash(partId);
  if (!part) return null;
  const e = effectivePart(part, scene);
  const o = scene.overrides[partId];
  const kinds = overrideKinds(o);
  const set = (patch: Parameters<typeof setOverride>[3]) =>
    commit((d) => setOverride(d, scene.id, partId, patch));
  const toggle = () => {
    const cur = useSession.getState().overrideOpen;
    const next = { ...cur };
    if (next[partId]) delete next[partId];
    else next[partId] = true;
    setSession({ overrideOpen: next });
  };
  const label = !kinds.length
    ? S.overrideState.same
    : kinds.includes('hidden')
      ? S.overrideState.hidden
      : `${kinds.map((k) => S.overrideState[k]).join('・')} ${S.overrideState.changed}`;
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2',
        on && 'ring-2 ring-accent',
      )}
      data-override={partId}
    >
      <Row>
        <ImageField
          aria-label={`${S.overrideImage}：${part.name}`}
          value={e.imageUrl}
          onChange={(v) => set({ imageUrl: v === part.imageUrl ? undefined : v })}
          size="sm"
        />
        <button
          type="button"
          className="min-w-0 truncate text-sm text-accent hover:underline"
          onClick={() =>
            setSession({ modal: { kind: 'source', ref: { kind: 'part', id: part.id } } })
          }
        >
          {part.name}
        </button>
        <span
          className={cn(
            'rounded-sm px-1.5 text-xs',
            kinds.length ? 'bg-warning-soft' : 'bg-surface-3 text-muted',
          )}
          data-override-state
        >
          {label}
        </span>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={toggle}>
          {S.overrideEdit}
        </Button>
        {kinds.length || open ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              commit((d) => clearOverride(d, scene.id, partId));
              n(S.overrideResetDone);
            }}
          >
            {S.overrideReset}
          </Button>
        ) : null}
      </Row>
      {open ? (
        <Row>
          {(
            [
              ['x', S.posX],
              ['y', S.posY],
              ['width', S.width],
              ['height', S.height],
              ['z', S.zOrder],
            ] as const
          ).map(([k, label]) => (
            <Labeled key={k} label={label}>
              <NumCell
                aria-label={`${label}：${part.name}`}
                value={o?.[k] ?? null}
                placeholder={String(part[k])}
                className="w-16"
                onCommit={(v) => set({ [k]: v == null ? undefined : v })}
              />
            </Labeled>
          ))}
          <Checkbox
            checked={!!o?.hidden}
            onCheckedChange={(v) => set({ hidden: v ? true : undefined })}
            aria-label={`${S.overrideHide}：${part.name}`}
            label={S.overrideHide}
          />
        </Row>
      ) : null}
    </div>
  );
}

function OverrideSection({ scene }: { scene: Scene }) {
  const allParts = useProject((s) => s.data.parts);
  const parts = allParts.filter((x) => x.kind === 'marker');
  const all = useSession((s) => s.overridesAll);
  const diff = parts.filter((x) => overrideKinds(scene.overrides[x.id]).length);
  const shown = all ? parts : diff;
  return (
    <Fold id="parts" title={S.secParts} count={S.count(diff.length)} help={S.secHelp.parts}>
      <Row>
        <Button size="sm" variant="ghost" onClick={() => setSession({ overridesAll: !all })}>
          {all ? S.overridesShowDiff : S.overridesShowAll(parts.length)}
        </Button>
      </Row>
      <Hint>{S.overridesPanelNote}</Hint>
      {!parts.length ? (
        <Hint>{S.overridesNoMarkers}</Hint>
      ) : !shown.length ? (
        <Hint>{S.overridesNoDiff}</Hint>
      ) : null}
      {shown.map((x) => (
        <OverrideRow key={x.id} scene={scene} partId={x.id} />
      ))}
    </Fold>
  );
}

/* ---------- 記住設定並貼上（F208～F210） ---------- */

export function ClipDock() {
  const clip = useSession((s) => s.clip);
  const page = useSession((s) => s.page);
  const sess = useSession();
  const n = useNotify();
  const scene = useProject((s) => s.data.scenes.find((x) => x.id === sess.sceneId));
  if (!clip || page !== 'scenes') return null;
  const tachie = clip.markers.filter((m) => m.kind === 'tachie');
  const effects = clip.markers.filter((m) => m.kind !== 'tachie');
  const paste = (kind: ClipKind) => {
    const ids = sess.sceneSel.length ? sess.sceneSel : scene ? [scene.id] : [];
    if (!ids.length) return n(S.clipNoTarget, 'warning');
    commit((d) => {
      for (const s of d.scenes)
        if (ids.includes(s.id)) pasteClip(clip, s, kind, d.room, settings().tachieGap);
    });
    n(S.clipPasted(ids.length), 'success');
  };
  return (
    <section
      aria-label={S.clipTitle}
      data-testid="clip-dock"
      className="sticky bottom-10 z-10 flex flex-col gap-2 rounded-lg border border-warning bg-surface p-3 shadow-2 md:flex-row"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
        <b className="text-sm">{S.clipFrom(clip.name)}</b>
        <div className="flex items-center gap-2">
          {clip.foregroundUrl ? (
            <Thumb name={clip.foregroundUrl} className="h-10 w-16" fit="cover" />
          ) : (
            <span className="text-muted">{S.clipNoFg}</span>
          )}
          <span className="flex flex-wrap gap-1">
            {tachie.map((m) => (
              <span key={m.id} className="rounded-full bg-surface-3 px-1.5">
                {m.name}
              </span>
            ))}
          </span>
        </div>
        <span>
          {S.secEffect} {effects.length}・{S.secCutin} {clip.cutinId ? 1 : 0}
        </span>
        <span className="text-muted">{S.clipTargets(sess.sceneSel.length, scene?.name ?? '')}</span>
        <span className="text-muted">{S.clipNotes}</span>
      </div>
      <div className="flex flex-wrap content-start gap-1 md:w-80">
        <Button size="sm" variant="primary" onClick={() => paste('all')}>
          {S.clipAll}
        </Button>
        <Button size="sm" onClick={() => paste('tachie')}>
          {S.clipKinds.tachie(tachie.length)}
        </Button>
        <Button size="sm" onClick={() => paste('effect')}>
          {S.clipKinds.effect(effects.length)}
        </Button>
        <Button size="sm" onClick={() => paste('cutin')}>
          {S.clipKinds.cutin(clip.cutinId ? 1 : 0)}
        </Button>
        <Button size="sm" onClick={() => paste('overrides')}>
          {S.clipKinds.overrides}
        </Button>
        <Button size="sm" onClick={() => paste('text')}>
          {S.clipKinds.text}
        </Button>
        <Button size="sm" onClick={() => paste('image')}>
          {S.clipKinds.image}
        </Button>
        <IconButton
          size="sm"
          label={S.clipClose}
          icon={<X />}
          onClick={() => setSession({ clip: null })}
        />
      </div>
    </section>
  );
}
