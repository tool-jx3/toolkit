/**
 * 修改選取的棋子（規格 1.8）：名稱、先攻值、棋子大小、盤面、顏色、參照網址、立繪、差分、狀態、參數、聊天面板、備註、
 * 三個開關、上下移、複製一個、刪除、複製 CCFOLIA 角色資料。第一次修改時清單固定下來（之後輸入欄不能改）。
 */
import { ArrowDown, ArrowUp, ClipboardCopy, CopyPlus, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { copyText } from '@/core/files';
import {
  Button,
  Checkbox,
  ColorField,
  cn,
  Field,
  IconButton,
  NumberInput,
  Select,
  TextArea,
  TextInput,
  useToast,
} from '@/ui';
import { OptionalNumberInput } from '@/ui/OptionalNumberInput';
import { copyPiece, deletePiece, editPiece, movePiece, renamePiece, viewAt } from './actions';
import type { PieceView } from './derived';
import { isTooBig, type Piece, SIZE_MAX, SIZE_MIN, sizeText } from './model';
import { pieceClipboard } from './output';
import { ImageSelect, Thumb, useImageDrop } from './parts';
import { useDoc } from './store';
import { S } from './strings';

type ListKey = 'status' | 'params';

function Rows({ i, piece, list }: { i: number; piece: Piece; list: ListKey }) {
  const title = list === 'status' ? S.edStatus : S.edParams;
  const rows = piece[list];
  const add = () =>
    editPiece(i, (c) => {
      if (list === 'status') c.status.push({ label: '', value: 0, max: 0 });
      else c.params.push({ label: '', value: '' });
    });
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" data-testid={`ed-${list}`}>
      <legend className="mb-1 p-0 text-xs font-semibold text-muted">{title}</legend>
      {rows.map((row, r) => {
        const n = r + 1;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: 列沒有 id，位置就是它的身分
            key={r}
            className={cn(
              'grid min-w-0 items-center gap-1',
              list === 'status'
                ? 'grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_auto_auto]'
                : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]',
            )}
          >
            <TextInput
              aria-label={S.edRowCell(title, n, S.edLabel)}
              placeholder={list === 'status' ? S.edStatusPlaceholder : S.edParamPlaceholder}
              value={row.label}
              onChange={(e) =>
                editPiece(i, (c) => {
                  c[list][r].label = e.target.value;
                })
              }
              className="h-8 text-xs"
            />
            {list === 'status' ? (
              <>
                <NumberInput
                  aria-label={S.edRowCell(title, n, S.edCurrent)}
                  value={(row as Piece['status'][number]).value}
                  precision={2}
                  onChange={(v) =>
                    editPiece(i, (c) => {
                      c.status[r].value = v;
                    })
                  }
                  size="sm"
                />
                <NumberInput
                  aria-label={S.edRowCell(title, n, S.edMax)}
                  value={(row as Piece['status'][number]).max}
                  precision={2}
                  onChange={(v) =>
                    editPiece(i, (c) => {
                      c.status[r].max = v;
                    })
                  }
                  size="sm"
                />
              </>
            ) : (
              <TextInput
                aria-label={S.edRowCell(title, n, S.edValue)}
                placeholder={S.edValue}
                value={(row as Piece['params'][number]).value}
                onChange={(e) =>
                  editPiece(i, (c) => {
                    c.params[r].value = e.target.value;
                  })
                }
                className="h-8 text-xs"
              />
            )}
            <IconButton
              label={S.edRowUp(title, n)}
              icon={<ArrowUp />}
              size="sm"
              variant="ghost"
              disabled={r === 0}
              onClick={() =>
                editPiece(i, (c) => {
                  const l = c[list] as unknown[];
                  [l[r - 1], l[r]] = [l[r], l[r - 1]];
                })
              }
            />
            <IconButton
              label={S.edRowRemove(title, n)}
              icon={<Trash2 />}
              size="sm"
              variant="ghost"
              onClick={() =>
                editPiece(i, (c) => {
                  c[list].splice(r, 1);
                })
              }
            />
          </div>
        );
      })}
      <div>
        <Button size="sm" icon={<Plus />} onClick={add}>
          {list === 'status' ? S.edAddStatus : S.edAddParam}
        </Button>
      </div>
    </fieldset>
  );
}

function Faces({ i, view }: { i: number; view: PieceView }) {
  const images = useDoc((s) => s.data.images);
  const c = view.piece;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" data-testid="ed-faces">
      <legend className="mb-1 p-0 text-xs font-semibold text-muted">{S.edFaces}</legend>
      <Checkbox
        checked={c.autoFaces}
        onCheckedChange={(v) =>
          editPiece(i, (x) => {
            x.autoFaces = v === true;
          })
        }
        label={S.edAutoFaces(c.name || S.pieceNameFallback)}
      />
      {view.faces.map((f) => (
        <div
          key={`${f.auto}-${f.index}-${f.label}`}
          className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-start gap-2"
          data-testid="ed-face"
        >
          <Thumb image={f.image} className="h-12 w-12" />
          {f.auto ? (
            <span className="self-center text-xs text-muted">
              {S.edFaceAuto(f.label, f.image?.name ?? '')}
            </span>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1">
                <TextInput
                  aria-label={S.edFaceLabel}
                  placeholder={S.edFaceLabelPlaceholder}
                  value={f.label}
                  onChange={(e) =>
                    editPiece(i, (x) => {
                      x.faces[f.index].label = e.target.value;
                    })
                  }
                  className="h-8 min-w-0 flex-1 text-xs"
                />
                <IconButton
                  label={S.edFaceRemove(f.label)}
                  icon={<Trash2 />}
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    editPiece(i, (x) => {
                      x.faces.splice(f.index, 1);
                    })
                  }
                />
              </div>
              <ImageSelect
                images={images}
                value={c.faces[f.index]?.imageId ?? f.image?.id ?? ''}
                onChange={(v) =>
                  editPiece(i, (x) => {
                    x.faces[f.index].imageId = v || null;
                    x.faces[f.index].imageName = '';
                  })
                }
                label={S.edFaceImage(f.label)}
                area="list"
                lead={[{ value: '', label: S.noImage }]}
              />
              {!f.image ? <span className="text-xs text-warning">{S.edFaceNoImage}</span> : null}
            </div>
          )}
        </div>
      ))}
      <div>
        <Button
          size="sm"
          icon={<ImagePlus />}
          onClick={() =>
            editPiece(i, (x) => {
              x.faces.push({ label: '', imageId: null, imageName: '' });
            })
          }
        >
          {S.edAddFace}
        </Button>
      </div>
    </fieldset>
  );
}

export function Editor({ i, view, count }: { i: number; view: PieceView; count: number }) {
  const toast = useToast();
  const opts = useDoc((s) => s.data.opts);
  const images = useDoc((s) => s.data.images);
  const c = view.piece;
  const p = view.portrait;
  const drop = useImageDrop(
    (id) =>
      editPiece(i, (x) => {
        x.image = id;
      }),
    'list',
  );
  const boardText = S.edBoardOptions(opts.active);

  const copyClipboard = async () => {
    const v = viewAt(i);
    if (!v) return;
    const ok = await copyText(pieceClipboard({ ...v.piece, ...v, invisible: v.piece.invisible }));
    toast(
      ok
        ? { title: S.copied, description: S.copiedHint, tone: 'success' }
        : { title: S.copyFailed, tone: 'danger' },
    );
  };

  return (
    <section
      {...drop.handlers}
      aria-label={S.editorTitle}
      data-testid="editor"
      data-over={drop.over || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3',
        drop.over && 'border-accent bg-accent-soft',
      )}
    >
      <h3 className="m-0 text-xs font-normal text-muted">{S.editorTitle}</h3>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label={S.edName}>
          <TextInput value={c.name} onChange={(e) => renamePiece(i, e.target.value)} />
        </Field>
        <Field label={S.edInitiative}>
          <NumberInput
            value={c.initiative}
            precision={2}
            onChange={(v) =>
              editPiece(i, (x) => {
                x.initiative = v;
              })
            }
          />
        </Field>
        <Field label={S.edSize}>
          <OptionalNumberInput
            value={c.size}
            placeholder={String(opts.size)}
            min={SIZE_MIN}
            max={SIZE_MAX}
            onChange={(v) =>
              editPiece(i, (x) => {
                x.size = v;
              })
            }
          />
        </Field>
        <Field label={S.edBoard}>
          <Select
            value={c.active == null ? 'inherit' : c.active ? 'on' : 'off'}
            onValueChange={(v) =>
              editPiece(i, (x) => {
                x.active = v === 'inherit' ? null : v === 'on';
              })
            }
            options={[
              { value: 'inherit', label: boardText.inherit },
              { value: 'on', label: boardText.on },
              { value: 'off', label: boardText.off },
            ]}
          />
        </Field>
        <Field label={S.edColor}>
          <ColorField
            value={c.color}
            onChange={(v) =>
              editPiece(i, (x) => {
                x.color = v.slice(0, 7);
              })
            }
          />
        </Field>
        <Field label={S.edUrl}>
          <TextInput
            type="url"
            placeholder={S.edUrlPlaceholder}
            value={c.externalUrl}
            onChange={(e) =>
              editPiece(i, (x) => {
                x.externalUrl = e.target.value;
              })
            }
          />
        </Field>
      </div>

      <fieldset
        className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
        data-testid="ed-portrait"
      >
        <legend className="mb-1 p-0 text-xs font-semibold text-muted">{S.edPortrait}</legend>
        <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
          <Thumb image={p} className="h-24 w-[4.5rem]" />
          <div className="flex min-w-0 flex-col gap-1">
            <ImageSelect
              images={images}
              value={c.image}
              onChange={(v) =>
                editPiece(i, (x) => {
                  x.image = v;
                })
              }
              label={S.edPortrait}
              area="list"
              lead={[
                { value: 'auto', label: S.edPortraitAuto },
                { value: 'none', label: S.edPortraitNone },
              ]}
            />
            {c.image === 'auto' ? (
              <span className="text-xs text-muted" data-testid="ed-portrait-note">
                {p
                  ? S.edPortraitUsing(p.name)
                  : S.edPortraitHint(c.imageName || c.name || S.pieceNameFallback)}
              </span>
            ) : null}
            {isTooBig(p) && p ? (
              <span className="text-xs text-warning">
                {S.edPortraitBig(p.name, sizeText(p.size))}
              </span>
            ) : null}
          </div>
        </div>
      </fieldset>

      <Faces i={i} view={view} />

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Rows i={i} piece={c} list="status" />
        <Rows i={i} piece={c} list="params" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={S.edCommands}>
          <TextArea
            rows={5}
            spellCheck={false}
            value={c.commands}
            onChange={(e) =>
              editPiece(i, (x) => {
                x.commands = e.target.value;
              })
            }
            className="font-mono text-xs"
            data-testid="ed-commands"
          />
        </Field>
        <Field label={S.edMemo}>
          <TextArea
            rows={5}
            value={c.memo}
            onChange={(e) =>
              editPiece(i, (x) => {
                x.memo = e.target.value;
              })
            }
            className="text-xs"
          />
        </Field>
      </div>

      <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-1.5">
        <Checkbox
          checked={view.secret}
          onCheckedChange={(v) =>
            editPiece(i, (x) => {
              x.secret = v === true;
            })
          }
          label={S.edSecret}
        />
        <Checkbox
          checked={c.invisible}
          onCheckedChange={(v) =>
            editPiece(i, (x) => {
              x.invisible = v === true;
            })
          }
          label={S.edInvisible}
        />
        <Checkbox
          checked={view.hideStatus}
          onCheckedChange={(v) =>
            editPiece(i, (x) => {
              x.hideStatus = v === true;
            })
          }
          label={S.edHideStatus}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" icon={<ArrowUp />} disabled={i <= 0} onClick={() => movePiece(i, -1)}>
          {S.edUp}
        </Button>
        <Button
          size="sm"
          icon={<ArrowDown />}
          disabled={i >= count - 1}
          onClick={() => movePiece(i, 1)}
        >
          {S.edDown}
        </Button>
        <Button size="sm" icon={<CopyPlus />} onClick={() => copyPiece(i)}>
          {S.edCopy}
        </Button>
        <Button
          size="sm"
          icon={<ClipboardCopy />}
          title={S.edClipboardHint}
          onClick={() => void copyClipboard()}
        >
          {S.edClipboard}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => deletePiece(i)}>
          {S.edDelete}
        </Button>
      </div>
    </section>
  );
}
