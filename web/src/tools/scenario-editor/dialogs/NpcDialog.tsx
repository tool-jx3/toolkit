/**
 * 角色卡的詳細編輯（F161～F165）：各系統的欄位、自動計算（淡色斜體的提示）、候選清單、備忘、自己加的分頁。
 */
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { Button, Dialog, DialogClose, IconButton, Notice, Select, TextArea } from '@/ui';
import { bridge } from '../bridge';
import { findBlock } from '../model/blocks';
import {
  COC_AB,
  cocAbList,
  cocCats,
  cocNeedsArg,
  cocSkillsOf,
  DX3RD_AB,
  DX3RD_BREEDS,
  DX3RD_KIND,
  DX3RD_SKILL_DEFS,
  DX3RD_SYN,
  dxBreedN,
  EMO_BASE_SKILLS,
  EMO_CATS,
  EMO_EMOTIONS,
  EMO_RES_SLOTS,
  EMO_SKILLS,
  EMOKLORE_AB,
  emoAttrOf,
  emoDefOf,
  emoNorm,
  emoRefLabel,
  NPC_LISTS,
  type NpcListKey,
} from '../model/npc/data';
import {
  type AutoValues,
  COC_MAX_ROWS,
  computeNpcAuto,
  getNpcField,
  newCocSkill,
  newDxCombo,
  newDxEffect,
  newEmoSkill,
  setNpcField,
} from '../model/npc/model';
import { uid } from '../model/text';
import type { Npc } from '../model/types';
import { addArt, editNpc, SYS_OPTIONS } from '../panel/NpcProps';
import { setUi, useDoc, useUi } from '../store';
import { S } from '../strings';
import { copyCcfolia, useCcfUi } from './CcfDialogs';

const inputCls =
  'h-7 w-full min-w-0 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-sm text-fg placeholder:italic placeholder:text-muted';

interface Ctx {
  id: string;
  np: Npc;
  A: AutoValues;
}

function NField({
  c,
  path,
  label,
  list,
  w,
}: {
  c: Ctx;
  path: string;
  label: string;
  list?: NpcListKey;
  w?: string;
}) {
  const v = String(getNpcField(c.np, path) ?? '');
  const a = c.A[path];
  return (
    <label className={`flex min-w-0 flex-col gap-0.5 text-xs ${w ?? ''}`}>
      <span className="text-muted">{label}</span>
      <input
        className={inputCls}
        value={v}
        list={list ? `se-npc-${list}` : undefined}
        placeholder={a == null || a === '' ? '' : String(a)}
        onChange={(e) => editNpc(c.id, (np) => setNpcField(np, path, e.target.value))}
      />
    </label>
  );
}

/** 表格裡的欄位（標籤只給螢幕閱讀器） */
function TField({
  c,
  path,
  label,
  list,
}: {
  c: Ctx;
  path: string;
  label: string;
  list?: NpcListKey | string;
}) {
  const v = String(getNpcField(c.np, path) ?? '');
  const a = c.A[path];
  return (
    <input
      aria-label={label}
      className={inputCls}
      value={v}
      list={list ? (list.startsWith('se-') ? list : `se-npc-${list}`) : undefined}
      placeholder={a == null || a === '' ? '' : String(a)}
      onChange={(e) => editNpc(c.id, (np) => setNpcField(np, path, e.target.value))}
    />
  );
}

function Fold({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-sm font-semibold"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        {title}
        {!open ? (
          <span className="ml-2 text-xs font-normal text-muted">
            （收合：不出現在紙面、列印與匯出）
          </span>
        ) : null}
      </button>
      {open ? <div className="border-t border-border p-2">{children}</div> : null}
    </div>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="m-0 mt-2 text-sm font-bold text-accent">{children}</h3>;
}

export function NpcDialog() {
  const id = useUi((s) => s.npcEdit);
  const over = useUi((s) => (id ? s.layout.over.includes(id) : false));
  const b = useDoc((s) => (id ? findBlock(s.data, id)?.b : null));
  const np = b?.npc;
  const A = useMemo(() => (np ? computeNpcAuto(np) : {}), [np]);
  const close = () => setUi({ npcEdit: null });
  return (
    <Dialog
      open={!!id && !!np}
      onOpenChange={(o) => !o && close()}
      title="角色卡"
      size="xl"
      description={np ? `${np.name || '（沒有名字）'}：修改會立刻反映到紙面。` : undefined}
      footer={
        id ? (
          <>
            <Button variant="secondary" onClick={() => void copyCcfolia(id)}>
              複製 CCFOLIA 棋子
            </Button>
            <Button variant="secondary" onClick={() => useCcfUi.setState({ importId: id })}>
              讀入 CCFOLIA 棋子
            </Button>
            <Button variant="secondary" onClick={() => void addArt(id)}>
              {np?.art ? '更換立繪' : '加上立繪'}
            </Button>
            <Button variant="secondary" onClick={() => setUi({ preview: id })}>
              查看成品
            </Button>
            <DialogClose>完成</DialogClose>
          </>
        ) : null
      }
    >
      {id && np ? <NpcBody c={{ id, np, A }} over={over} /> : null}
    </Dialog>
  );
}

function NpcBody({ c, over }: { c: Ctx; over: boolean }) {
  const { np, id } = c;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {Object.entries(NPC_LISTS).map(([k, list]) => (
        <datalist key={k} id={`se-npc-${k}`}>
          {list.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
      {over ? (
        <Notice tone="warning">
          這張卡在所在的頁面放不下（紙面上有紅色虛線）。可以收合備忘或分頁、刪減內容，或在前面加換頁。
        </Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted">系統</span>
          <Select
            size="sm"
            value={np.sys}
            onValueChange={(v) => editNpc(id, (x) => (x.sys = v))}
            options={SYS_OPTIONS}
            aria-label="系統"
          />
        </div>
        {np.sys === 'coc' ? (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">版本</span>
            <Select
              size="sm"
              aria-label="版本"
              value={np.coc.ver}
              onValueChange={(v) => editNpc(id, (x) => (x.coc.ver = v))}
              options={[
                { value: '7', label: '第 7 版' },
                { value: '6', label: '第 6 版' },
              ]}
            />
          </div>
        ) : null}
        <NField c={c} path="kana" label="讀音" />
        <NField c={c} path="name" label="名字" />
        <NField c={c} path="role" label="年齡・性別・職業／立場" w="col-span-2" />
      </div>
      {np.sys === 'emoklore' ? (
        <EmoBody c={c} />
      ) : np.sys === 'dx3rd' ? (
        <DxBody c={c} />
      ) : (
        <CocBody c={c} />
      )}
      <Fold
        open={np.memoOpen}
        onToggle={() => editNpc(id, (x) => (x.memoOpen = !x.memoOpen))}
        title="備忘"
      >
        <TextArea
          rows={4}
          aria-label="備忘"
          value={np.memo}
          onChange={(e) => editNpc(id, (x) => (x.memo = e.target.value))}
        />
      </Fold>
      {np.tabs.map((t, i) => (
        <Fold
          key={t.id}
          open={t.open}
          onToggle={() => editNpc(id, (x) => (x.tabs[i].open = !x.tabs[i].open))}
          title={t.title.trim() || '（未命名的分頁）'}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <input
                aria-label="分頁的標題"
                className={inputCls}
                value={t.title}
                placeholder="分頁的標題"
                onChange={(e) => editNpc(id, (x) => (x.tabs[i].title = e.target.value))}
              />
              <IconButton
                size="sm"
                variant="ghost"
                label="刪除這個分頁"
                icon={<X />}
                onClick={async () => {
                  if (
                    await bridge.confirm({
                      title: S.confirm.deleteTab(t.title.trim() || '（未命名的分頁）'),
                      danger: true,
                      confirmLabel: S.confirm.del,
                    })
                  )
                    editNpc(id, (x) => {
                      x.tabs = x.tabs.filter((y) => y.id !== t.id);
                    });
                }}
              />
            </div>
            <TextArea
              rows={3}
              aria-label="分頁的內容"
              value={t.text}
              onChange={(e) => editNpc(id, (x) => (x.tabs[i].text = e.target.value))}
            />
          </div>
        </Fold>
      ))}
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          onClick={() =>
            editNpc(id, (x) => x.tabs.push({ id: uid(), title: '', text: '', open: true }))
          }
        >
          新增分頁
        </Button>
      </div>
    </div>
  );
}

/* ---------- Emoklore ---------- */

function EmoBody({ c }: { c: Ctx }) {
  const e = c.np.emoklore;
  const id = c.id;
  return (
    <>
      <H>能力值</H>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {EMOKLORE_AB.map(([k, l]) => (
          <NField key={k} c={c} path={`emoklore.ab.${k}`} label={l} list="emoAb" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NField c={c} path="emoklore.hp" label="HP" />
        <NField c={c} path="emoklore.mp" label="MP" />
        <NField c={c} path="emoklore.kyomei" label="初始共鳴等級" list="emoKyomei" />
        <NField c={c} path="emoklore.kyodo" label="強度" />
      </div>
      <H>共鳴感情</H>
      <div className="grid gap-2 sm:grid-cols-3">
        {EMO_RES_SLOTS.map(([slot, label, hint]) => {
          const r = e.res[slot];
          const attr = emoAttrOf(r.attr);
          return (
            <div key={slot} className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {label}（{hint}）
              </span>
              <div className="flex gap-1">
                <Select
                  size="sm"
                  aria-label={`${label}的屬性`}
                  value={r.attr || 'none'}
                  onValueChange={(v) =>
                    editNpc(id, (x) => (x.emoklore.res[slot].attr = v === 'none' ? '' : v))
                  }
                  options={[
                    { value: 'none', label: '屬性' },
                    ...EMO_EMOTIONS.map((a) => ({ value: a.k, label: `${a.k}（${a.label}）` })),
                  ]}
                />
                <TField
                  c={c}
                  path={`emoklore.res.${slot}.name`}
                  label={`${label}的感情`}
                  list={`se-npc-emo-${slot}`}
                />
                <datalist id={`se-npc-emo-${slot}`}>
                  {(attr?.items ?? EMO_EMOTIONS.flatMap((a) => a.items)).map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
            </div>
          );
        })}
      </div>
      <H>習得技能</H>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="p-1">類別</th>
              <th className="p-1">技能</th>
              <th className="p-1">種類</th>
              <th className="p-1">參照能力</th>
              <th className="p-1">Lv</th>
              <th className="p-1">判定值</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {e.skills.map((sk, i) => {
              const def = emoDefOf(sk.n);
              const names = EMO_SKILLS.filter(
                (d) => d.kind !== 'base' && (!sk.cat || d.cat === sk.cat),
              ).map((d) => d.n);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: 技能列沒有 id，位置就是身分
                <tr key={`${i}-${sk.n}`}>
                  <td className="p-0.5">
                    <Select
                      size="sm"
                      aria-label="類別"
                      value={sk.cat || 'none'}
                      onValueChange={(v) =>
                        editNpc(id, (x) => (x.emoklore.skills[i].cat = v === 'none' ? '' : v))
                      }
                      options={[
                        { value: 'none', label: '（全部）' },
                        ...EMO_CATS.map((k) => ({ value: k, label: k })),
                      ]}
                    />
                  </td>
                  <td className="p-0.5">
                    <TField
                      c={c}
                      path={`emoklore.skills.${i}.n`}
                      label="技能"
                      list={`se-npc-emosk-${i}`}
                    />
                    <datalist id={`se-npc-emosk-${i}`}>
                      {names.map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </td>
                  <td className="p-0.5">
                    {def?.arg ? (
                      <TField c={c} path={`emoklore.skills.${i}.arg`} label="種類" />
                    ) : null}
                  </td>
                  <td className="p-0.5">
                    <Select
                      size="sm"
                      aria-label="參照能力"
                      value={sk.ref || 'auto'}
                      onValueChange={(v) =>
                        editNpc(id, (x) => (x.emoklore.skills[i].ref = v === 'auto' ? '' : v))
                      }
                      options={[
                        { value: 'auto', label: `自動（${emoRefLabel(def) || '—'}）` },
                        ...(def?.refs ?? []).map((r) => ({
                          value: r,
                          label: EMOKLORE_AB.find((a) => a[0] === r)?.[1] ?? r,
                        })),
                      ]}
                    />
                  </td>
                  <td className="p-0.5">
                    <TField c={c} path={`emoklore.skills.${i}.lv`} label="Lv" list="emoLv" />
                  </td>
                  <td className="p-0.5">
                    <TField c={c} path={`emoklore.skills.${i}.v`} label="判定值" />
                  </td>
                  <td className="p-0.5">
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label="刪除這一列"
                      icon={<X />}
                      disabled={e.skills.length <= 1}
                      onClick={() => editNpc(id, (x) => x.emoklore.skills.splice(i, 1))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          onClick={() => editNpc(id, (x) => x.emoklore.skills.push(newEmoSkill()))}
        >
          新增技能
        </Button>
      </div>
      <Fold
        open={e.baseOpen}
        onToggle={() => editNpc(id, (x) => (x.emoklore.baseOpen = !x.emoklore.baseOpen))}
        title="基本技能"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EMO_BASE_SKILLS.map((def) => (
            <NField
              key={def.n}
              c={c}
              path={`emoklore.base.${emoNorm(def.n)}`}
              label={`${def.n}（${emoRefLabel(def)}）`}
            />
          ))}
        </div>
        <p className="m-0 mt-1 text-xs text-muted">
          基本技能只在這裡顯示；空白時用自動計算的判定值。
        </p>
      </Fold>
    </>
  );
}

/* ---------- Double Cross 3rd ---------- */

function DxBody({ c }: { c: Ctx }) {
  const d = c.np.dx3rd;
  const id = c.id;
  const n = dxBreedN(d.breed) || 3;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="text-muted">血統</span>
          <Select
            size="sm"
            aria-label="血統"
            value={d.breed || 'none'}
            onValueChange={(v) => editNpc(id, (x) => (x.dx3rd.breed = v === 'none' ? '' : v))}
            options={[
              { value: 'none', label: '—' },
              ...DX3RD_BREEDS.map(([k, l, m]) => ({ value: k, label: `${l}（${m}）` })),
            ]}
          />
        </div>
        {Array.from({ length: n }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 症候群的第幾格
          <div key={i} className="flex flex-col gap-0.5 text-xs">
            <span className="text-muted">症候群 {i + 1}</span>
            <Select
              size="sm"
              aria-label={`症候群 ${i + 1}`}
              value={d.syns[i] || 'none'}
              onValueChange={(v) =>
                editNpc(id, (x) => {
                  while (x.dx3rd.syns.length < 3) x.dx3rd.syns.push('');
                  x.dx3rd.syns[i] = v === 'none' ? '' : v;
                })
              }
              options={[
                { value: 'none', label: '—' },
                ...DX3RD_SYN.map((s) => ({ value: s.k, label: s.n })),
              ]}
            />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-8">
        {DX3RD_AB.map(([k, l]) => (
          <NField key={k} c={c} path={`dx3rd.ab.${k}`} label={l} list="dxAb" />
        ))}
        <NField c={c} path="dx3rd.act" label="行動值" />
        <NField c={c} path="dx3rd.hp" label="HP 最大值" list="dxHp" />
        <NField c={c} path="dx3rd.stock" label="常備化 Pt" list="dxSk" />
        <NField c={c} path="dx3rd.enc" label="侵蝕率" list="dxEnc" />
      </div>
      <H>技能</H>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {DX3RD_SKILL_DEFS.map((s) => (
          <div key={s.k} className="flex flex-col gap-1">
            <NField c={c} path={`dx3rd.skills.${s.k}`} label={s.n} list="dxSk" />
            {s.arg ? <TField c={c} path={`dx3rd.sarg.${s.k}`} label={`${s.n}的種類`} /> : null}
          </div>
        ))}
      </div>
      <H>效果</H>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-muted">
              {[
                '種類',
                '名稱',
                'Lv',
                '時機',
                '技能',
                '難度',
                '對象',
                '射程',
                '侵蝕值',
                '限制',
                '',
              ].map((h) => (
                <th key={h} className="p-1">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.effects.map((f, i) => (
              <tr key={f.id || i}>
                <td className="p-0.5">
                  <Select
                    size="sm"
                    aria-label="種類"
                    value={f.kind || 'none'}
                    onValueChange={(v) =>
                      editNpc(id, (x) => (x.dx3rd.effects[i].kind = v === 'none' ? '' : v))
                    }
                    options={[
                      { value: 'none', label: '—' },
                      ...DX3RD_KIND.map((k) => ({ value: k.k, label: k.n })),
                    ]}
                  />
                </td>
                {(['n', 'lv', 'timing', 'skill', 'dif', 'tgt', 'rng', 'enc', 'lim'] as const).map(
                  (k) => (
                    <td key={k} className="p-0.5">
                      <TField c={c} path={`dx3rd.effects.${i}.${k}`} label={k} />
                    </td>
                  ),
                )}
                <td className="p-0.5">
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label="刪除這一列"
                    icon={<X />}
                    onClick={() => editNpc(id, (x) => x.dx3rd.effects.splice(i, 1))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          onClick={() => editNpc(id, (x) => x.dx3rd.effects.push({ ...newDxEffect(), id: uid() }))}
        >
          新增效果
        </Button>
      </div>
      <H>組合技</H>
      {d.combos.map((cb, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 組合技沒有 id，位置就是身分
        <div key={i} className="flex flex-col gap-1 rounded-md border border-border p-2">
          <div className="flex items-end gap-1">
            <NField c={c} path={`dx3rd.combos.${i}.n`} label="名稱" w="flex-1" />
            <IconButton
              size="sm"
              variant="ghost"
              label="刪除這個組合技"
              icon={<X />}
              onClick={() => editNpc(id, (x) => x.dx3rd.combos.splice(i, 1))}
            />
          </div>
          <fieldset
            className="m-0 flex min-w-0 flex-wrap gap-x-3 gap-y-1 border-0 p-0 text-xs"
            aria-label="組合的效果"
          >
            {d.effects
              .filter((f) => f.id && f.n.trim())
              .map((f) => (
                <label key={f.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={cb.pick.includes(f.id)}
                    onChange={(e) =>
                      editNpc(id, (x) => {
                        const p = new Set(x.dx3rd.combos[i].pick);
                        if (e.target.checked) p.add(f.id);
                        else p.delete(f.id);
                        x.dx3rd.combos[i].pick = [...p];
                      })
                    }
                  />
                  {f.n}
                </label>
              ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            <NField c={c} path={`dx3rd.combos.${i}.extra`} label="其他組合" />
            <NField c={c} path={`dx3rd.combos.${i}.cmb`} label="組合（文字）" />
            <NField c={c} path={`dx3rd.combos.${i}.timing`} label="時機" />
            <NField c={c} path={`dx3rd.combos.${i}.skill`} label="技能" />
            <NField c={c} path={`dx3rd.combos.${i}.hit`} label="命中" />
            <NField c={c} path={`dx3rd.combos.${i}.atk`} label="攻擊力" />
            <NField c={c} path={`dx3rd.combos.${i}.tgt`} label="對象" />
            <NField c={c} path={`dx3rd.combos.${i}.rng`} label="射程" />
            <NField c={c} path={`dx3rd.combos.${i}.enc`} label="侵蝕值" />
            <NField c={c} path={`dx3rd.combos.${i}.cond`} label="條件" />
            <NField c={c} path={`dx3rd.combos.${i}.eff`} label="效果" w="col-span-2" />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          onClick={() => editNpc(id, (x) => x.dx3rd.combos.push(newDxCombo()))}
        >
          新增組合技
        </Button>
        <Button size="sm" variant="secondary" onClick={() => useCcfUi.setState({ ytId: id })}>
          讀入 Yutosheet 的表格
        </Button>
      </div>
    </>
  );
}

/* ---------- 克蘇魯 ---------- */

function CocBody({ c }: { c: Ctx }) {
  const k = c.np.coc;
  const id = c.id;
  const v6 = k.ver === '6';
  const subs: [string, string, NpcListKey?][] = v6
    ? [
        ['hp', '耐久'],
        ['mp', 'MP'],
        ['san', '理智'],
        ['idea', '靈感'],
        ['luck', '幸運'],
        ['know', '知識'],
        ['db', 'DB', 'db'],
        ['mov', 'MOV', 'mov'],
      ]
    : [
        ['hp', '耐久'],
        ['mp', 'MP'],
        ['san', '理智'],
        ['luck', '幸運'],
        ['build', '體格', 'build'],
        ['db', 'DB', 'db'],
        ['mov', 'MOV', 'mov'],
      ];
  return (
    <>
      <H>能力值</H>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {COC_AB.map(([a, l]) => (
          <NField key={a} c={c} path={`coc.ab.${a}`} label={l} list={cocAbList(k.ver, a)} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {subs.map(([s, l, list]) => (
          <NField key={s} c={c} path={`coc.sub.${s}`} label={l} list={list} />
        ))}
      </div>
      <H>主要技能</H>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th className="p-1">類別</th>
              <th className="p-1">技能</th>
              <th className="p-1">專業領域</th>
              <th className="p-1">％</th>
              <th className="p-1" />
            </tr>
          </thead>
          <tbody>
            {k.skills.map((sk, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 技能列沒有 id，位置就是身分
              <tr key={i}>
                <td className="p-0.5">
                  <Select
                    size="sm"
                    aria-label="類別"
                    value={sk.free ? 'free' : sk.cat || 'none'}
                    onValueChange={(v) =>
                      editNpc(id, (x) => {
                        const s = x.coc.skills[i];
                        s.free = v === 'free';
                        s.cat = v === 'none' || v === 'free' ? '' : v;
                      })
                    }
                    options={[
                      { value: 'none', label: '（全部）' },
                      ...cocCats(k.ver).map((x) => ({ value: x, label: x })),
                      { value: 'free', label: '自己輸入' },
                    ]}
                  />
                </td>
                <td className="p-0.5">
                  {sk.free ? (
                    <TField c={c} path={`coc.skills.${i}.n`} label="技能" />
                  ) : (
                    <Select
                      size="sm"
                      aria-label="技能"
                      value={sk.n || 'none'}
                      onValueChange={(v) =>
                        editNpc(id, (x) => (x.coc.skills[i].n = v === 'none' ? '' : v))
                      }
                      options={[
                        { value: 'none', label: '—' },
                        ...[
                          ...new Set([...(sk.n ? [sk.n] : []), ...cocSkillsOf(k.ver, sk.cat)]),
                        ].map((x) => ({ value: x, label: x })),
                      ]}
                    />
                  )}
                </td>
                <td className="p-0.5">
                  {cocNeedsArg(k.ver, sk.n) || sk.arg ? (
                    <TField c={c} path={`coc.skills.${i}.arg`} label="專業領域" />
                  ) : null}
                </td>
                <td className="p-0.5">
                  <TField c={c} path={`coc.skills.${i}.v`} label="％" list="cocSk" />
                </td>
                <td className="p-0.5">
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label="刪除這一列"
                    icon={<X />}
                    onClick={() => editNpc(id, (x) => x.coc.skills.splice(i, 1))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          disabled={k.skills.length >= COC_MAX_ROWS}
          onClick={() => editNpc(id, (x) => x.coc.skills.push(newCocSkill()))}
        >
          新增技能（最多 {COC_MAX_ROWS} 列）
        </Button>
      </div>
      <H>武器</H>
      {k.weapons.map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 武器沒有 id，位置就是身分
        <div key={i} className="flex items-end gap-1">
          <NField c={c} path={`coc.weapons.${i}.n`} label="名稱" w="flex-[2]" />
          <NField c={c} path={`coc.weapons.${i}.v`} label="技能％" list="cocSk" w="flex-1" />
          <NField c={c} path={`coc.weapons.${i}.dmg`} label="傷害" list="dmg" w="flex-1" />
          <IconButton
            size="sm"
            variant="ghost"
            label="刪除這個武器"
            icon={<X />}
            onClick={() => editNpc(id, (x) => x.coc.weapons.splice(i, 1))}
          />
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus />}
          disabled={k.weapons.length >= COC_MAX_ROWS}
          onClick={() => editNpc(id, (x) => x.coc.weapons.push({ n: '', v: '', dmg: '' }))}
        >
          新增武器
        </Button>
      </div>
    </>
  );
}
