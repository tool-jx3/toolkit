/**
 * 封面與概要（規格 1.4）：標題、副標題、作者、概要項目（上移、下移、刪除、新增）。
 */
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, Field, IconButton, TextInput } from '@/ui';
import { KEY_SUGGESTIONS, type Meta } from './model';
import { updateDoc, useDoc } from './store';
import { S } from './strings';
import { metaApi } from './view';

const LIST_ID = 'coc-key-suggest';

const setMeta = (recipe: (m: Meta) => void) =>
  updateDoc((d) => {
    recipe(d.meta);
  });

export function MetaForm() {
  const meta = useDoc((s) => s.data.meta);
  const title = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLFieldSetElement>(null);
  /** 新增項目後把焦點放到新一列的項目欄 */
  const focusNew = useRef(false);

  useEffect(() => {
    metaApi.focusTitle = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => title.current?.focus()));
    };
  }, []);

  useEffect(() => {
    if (!focusNew.current) return;
    focusNew.current = false;
    const keys = list.current?.querySelectorAll<HTMLInputElement>('input[data-role="key"]');
    keys?.[keys.length - 1]?.focus();
  });

  const move = (i: number, dir: -1 | 1) =>
    setMeta((m) => {
      const j = i + dir;
      if (j < 0 || j >= m.items.length) return;
      const [it] = m.items.splice(i, 1);
      m.items.splice(j, 0, it);
    });

  return (
    <div
      className="flex min-h-0 flex-col gap-4 overflow-auto px-4 pt-3 pb-10"
      data-testid="coc-meta"
    >
      <Field label={S.meta.title}>
        <TextInput
          ref={title}
          value={meta.title}
          placeholder={S.meta.titlePlaceholder}
          className="h-10 text-base font-bold"
          onChange={(e) =>
            setMeta((m) => {
              m.title = e.target.value;
            })
          }
        />
      </Field>
      <Field label={S.meta.subtitle}>
        <TextInput
          value={meta.subtitle}
          placeholder={S.meta.subtitlePlaceholder}
          onChange={(e) =>
            setMeta((m) => {
              m.subtitle = e.target.value;
            })
          }
        />
      </Field>
      <Field label={S.meta.author}>
        <TextInput
          value={meta.author}
          placeholder={S.meta.authorPlaceholder}
          onChange={(e) =>
            setMeta((m) => {
              m.author = e.target.value;
            })
          }
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <fieldset
          ref={list}
          className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
          data-testid="coc-items"
        >
          <legend className="mb-1.5 p-0 text-sm font-medium text-muted">{S.meta.items}</legend>
          {meta.items.map((it, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 項目沒有 id，順序就是身分
              key={i}
              className="grid grid-cols-[minmax(5.5em,8.5em)_minmax(0,1fr)_auto] items-center gap-1.5"
              data-testid="coc-item"
            >
              <TextInput
                data-role="key"
                list={LIST_ID}
                value={it.key}
                placeholder={S.meta.key}
                aria-label={`${S.meta.key} ${i + 1}`}
                onChange={(e) =>
                  setMeta((m) => {
                    m.items[i].key = e.target.value;
                  })
                }
              />
              <TextInput
                data-role="value"
                value={it.value}
                placeholder={S.meta.value}
                aria-label={`${S.meta.value} ${i + 1}`}
                onChange={(e) =>
                  setMeta((m) => {
                    m.items[i].value = e.target.value;
                  })
                }
              />
              <span className="flex">
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`${S.meta.up}（第 ${i + 1} 項）`}
                  icon={<ArrowUp />}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`${S.meta.down}（第 ${i + 1} 項）`}
                  icon={<ArrowDown />}
                  disabled={i === meta.items.length - 1}
                  onClick={() => move(i, 1)}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`${S.meta.remove}（第 ${i + 1} 項）`}
                  icon={<X />}
                  onClick={() =>
                    setMeta((m) => {
                      m.items.splice(i, 1);
                    })
                  }
                />
              </span>
            </div>
          ))}
        </fieldset>
        <datalist id={LIST_ID}>
          {KEY_SUGGESTIONS.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          className="self-start border border-dashed border-border-strong"
          onClick={() => {
            focusNew.current = true;
            setMeta((m) => {
              m.items.push({ key: '', value: '' });
            });
          }}
        >
          {S.meta.add}
        </Button>
      </div>
      <div className="flex flex-col gap-1 text-xs leading-relaxed text-muted">
        <p className="m-0">{S.meta.hint1}</p>
        <p className="m-0">{S.meta.hint2}</p>
      </div>
    </div>
  );
}
