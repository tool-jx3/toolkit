/**
 * 元件展示頁「OBS 疊加」分頁（G4 共用層）：模擬場景與 CssPreviewFrame、示範 CSS 的設定（復原手勢）、
 * 瀏覽器來源網址、OBS 說明、步驟列、錨點、項目清單、測試數值與測試訊息、字型（css 模式）、圖片嵌入。
 * 預覽欄（右邊）在 obs/ObsPreview.tsx。
 */
import { Crop, Eraser, Link2, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { characterUrlFrom, chatUrlFrom, classifyImageUrl, roomUrlFrom } from '@/ccfolia';
import type { MockStatus, MockVoiceUser } from '@/ccfolia/mock';
import {
  cropToDataUri,
  type EmbeddedImage,
  fileToDataUri,
  formatEmbedBytes,
  getImageData,
  loadImage,
  measureImageUrl,
  type Rect,
  transparentTrimRect,
  urlToDataUri,
} from '@/core/image';
import { historyGesture, useUndoRedo } from '@/core/storage';
import {
  AnchorGrid,
  Button,
  ColorField,
  CropConfirmSummary,
  CropDialog,
  Field,
  FontPicker,
  IconButton,
  ImageDrop,
  ItemListEditor,
  LocalFontDialog,
  MessageComposer,
  Notice,
  NumberInput,
  ObsGuide,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  SourceUrlField,
  StepNav,
  Stepper,
  supportsLocalFontList,
  TestValueRow,
  TestValueShortcuts,
  TextInput,
  Toggle,
} from '@/ui';
import { applyTestShortcut } from '@/ui/TestValueRow';
import {
  CHAT_MAIN,
  CHAT_SECRET,
  characterScene,
  chatScene,
  type DemoSceneKind,
  nextChatMessage,
  ROOM_EXAMPLES,
  ROOM_SPEAKERS,
  roomScene,
  STREAMKIT_USERS,
  streamkitScene,
} from '../obs/scenes';
import { type ObsDemoSettings, useObsPreview, useObsSettings } from '../obs/store';

const SCENE_OPTIONS: { value: DemoSceneKind; label: string }[] = [
  { value: 'character', label: '狀態頁' },
  { value: 'room', label: '訊息框' },
  { value: 'chat', label: '聊天' },
  { value: 'streamkit', label: 'Streamkit' },
];

/* ---------- 各場景的模擬資料 ---------- */

function CharacterControls() {
  const [statuses, setStatuses] = useState<MockStatus[]>(characterScene.state.statuses);
  const [initiative, setInitiative] = useState(characterScene.state.initiative);
  useEffect(() => characterScene.update({ statuses, initiative }), [statuses, initiative]);
  const set = (i: number, patch: Partial<MockStatus>) =>
    setStatuses((l) => l.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <>
      {statuses.map((st, i) => (
        <TestValueRow
          // biome-ignore lint/suspicious/noArrayIndexKey: 狀態列是固定順序
          key={i}
          label={st.label}
          onLabelChange={(label) => set(i, { label })}
          value={st.value}
          max={st.max}
          onValueChange={(value) => set(i, { value })}
          onMaxChange={(max) => set(i, { max, value: Math.min(st.value, max) })}
        />
      ))}
      <TestValueShortcuts
        onApply={(k) =>
          setStatuses((l) =>
            l.map((s) => ({
              ...s,
              value: applyTestShortcut(k, s.value, s.max, { threshold: 25 }),
            })),
          )
        }
      />
      <Field label="先攻（0 時徽章消失）" layout="inline">
        <NumberInput
          value={initiative}
          onChange={setInitiative}
          min={0}
          max={99}
          className="w-24"
        />
      </Field>
    </>
  );
}

function RoomControls() {
  const [speaker, setSpeaker] = useState<string>('erin');
  const [kind, setKind] = useState('chat');
  const [n, setN] = useState(1);
  useEffect(() => {
    if (roomScene.phase === 'empty') roomScene.send(ROOM_EXAMPLES[0]);
  }, []);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            roomScene.send(ROOM_EXAMPLES[n % ROOM_EXAMPLES.length]);
            setN(n + 1);
          }}
        >
          送出範例訊息
        </Button>
        <Button size="sm" onClick={() => roomScene.close()}>
          關閉訊息框
        </Button>
        <Button
          size="sm"
          onClick={() => {
            roomScene.reset();
            roomScene.send(ROOM_EXAMPLES[0]);
          }}
        >
          重新開始
        </Button>
      </div>
      <MessageComposer
        speakers={ROOM_SPEAKERS.map((s) => ({
          value: s.value,
          label: s.label,
          description: 'description' in s ? s.description : undefined,
        }))}
        speaker={speaker}
        onSpeakerChange={setSpeaker}
        kinds={[
          { value: 'chat', label: '聊天' },
          { value: 'dice', label: '擲骰', needsResult: true },
        ]}
        kind={kind}
        onKindChange={setKind}
        onSend={(m) => {
          const sp = ROOM_SPEAKERS.find((s) => s.value === m.speaker) ?? ROOM_SPEAKERS[0];
          roomScene.send({
            name: sp.label,
            text: m.command,
            portrait: sp.portrait,
            result: m.result,
            dice: m.result ? [{ faces: 10, value: 50 }] : undefined,
          });
        }}
      />
    </>
  );
}

function ChatControls() {
  const [tab, setTab] = useState(String(chatScene.state.selected));
  const [snack, setSnack] = useState(false);
  useEffect(() => chatScene.update({ selected: Number(tab) }), [tab]);
  useEffect(() => chatScene.update({ snackbar: snack ? '已重新連線' : null }), [snack]);
  return (
    <>
      <Field label="預覽分頁">
        <Segmented
          value={tab}
          onValueChange={setTab}
          options={[
            { value: '0', label: '主分頁' },
            { value: '1', label: '秘匿分頁' },
          ]}
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['chat', '聊天'],
            ['success', '成功'],
            ['failure', '失敗'],
            ['other', '無成敗'],
            ['system', '系統訊息'],
          ] as const
        ).map(([k, label]) => (
          <Button key={k} size="sm" onClick={() => chatScene.addMessage(nextChatMessage(k))}>
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            chatScene.update({
              tabs: chatScene.state.tabs.map((t, i) => ({
                ...t,
                messages: i === 0 ? CHAT_MAIN : CHAT_SECRET,
              })),
            })
          }
        >
          回到初始訊息
        </Button>
      </div>
      <Field label="通知條（MuiSnackbar）" layout="inline">
        <Toggle checked={snack} onCheckedChange={setSnack} />
      </Field>
    </>
  );
}

function StreamkitControls() {
  const [users, setUsers] = useState<MockVoiceUser[]>(STREAMKIT_USERS);
  useEffect(() => streamkitScene.update({ users }), [users]);
  const set = (id: string, patch: Partial<MockVoiceUser>) =>
    setUsers((l) => l.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {users.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-24 text-sm">{u.name}</span>
          <Toggle
            label="在頻道"
            checked={u.inChannel !== false}
            onCheckedChange={(v) => set(u.id, { inChannel: v })}
          />
          <Toggle
            label="說話中"
            checked={!!u.speaking}
            onCheckedChange={(v) => set(u.id, { speaking: v })}
          />
        </li>
      ))}
    </ul>
  );
}

/* ---------- 示範 CSS 的設定（復原手勢） ---------- */

/** set('color')(value)：改一個設定欄位 */
function useSetter() {
  const update = useObsSettings((st) => st.update);
  return <K extends keyof ObsDemoSettings>(key: K) =>
    (value: ObsDemoSettings[K]) =>
      update((d) => {
        (d as ObsDemoSettings)[key] = value;
      });
}

function CssSettings({ scene }: { scene: DemoSceneKind }) {
  const s = useObsSettings((st) => st.data);
  const set = useSetter();
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useObsSettings);
  const steps = useStore(useObsSettings.temporal, (t) => t.pastStates.length);
  const g = historyGesture(useObsSettings);
  return (
    <Section
      title="示範 CSS 的設定"
      description="滑桿用 historyGesture：拖曳中即時更新，放開才記成一步復原。"
      actions={
        <>
          <IconButton label="復原" icon={<Undo2 />} size="sm" onClick={undo} disabled={!canUndo} />
          <IconButton label="重做" icon={<Redo2 />} size="sm" onClick={redo} disabled={!canRedo} />
        </>
      }
    >
      <p className="m-0 text-xs text-muted" data-testid="obs-undo-steps">
        可復原 {steps} 步
      </p>
      <Show when={scene === 'character'}>
        <Field label="條的顏色">
          <ColorField value={s.color} onChange={set('color')} />
        </Field>
        <Field label="字型（css 模式）">
          <FontPicker
            mode="css"
            value={s.font}
            onChange={set('font')}
            previewText="生命 HP 12/12"
          />
        </Field>
        <Field label="文字外框線">
          <Segmented
            value={s.outline}
            onValueChange={set('outline')}
            options={[
              { value: 'soft', label: '柔邊陰影' },
              { value: 'stroke', label: '描邊' },
              { value: 'glow', label: '發光' },
              { value: 'none', label: '無' },
            ]}
            fullWidth
          />
        </Field>
        <Field label="危急門檻" hint="剩餘比例低於門檻時條會發光（:has()，OBS 31 以上）。">
          <Slider
            value={s.threshold}
            onChange={g.live(set('threshold'))}
            onCommit={g.commit}
            min={5}
            max={95}
            step={5}
            unit="%"
          />
        </Field>
      </Show>
      <Show when={scene === 'room'}>
        <Field label="舊紙質感" layout="inline">
          <Toggle checked={s.paper} onCheckedChange={set('paper')} />
        </Field>
        <Field label="四角括號" layout="inline">
          <Toggle checked={s.brackets} onCheckedChange={set('brackets')} />
        </Field>
        <Field label="略過／關閉按鈕" hint="「滑鼠移上才顯示」可以用預覽工具列的滑鼠按鈕模擬。">
          <Segmented
            value={s.buttons}
            onValueChange={set('buttons')}
            options={[
              { value: 'hover', label: '滑鼠移上才顯示' },
              { value: 'always', label: '一直顯示' },
              { value: 'never', label: '不顯示' },
            ]}
            fullWidth
          />
        </Field>
      </Show>
      <Show when={scene === 'chat'}>
        <Field label="則數">
          <Slider
            value={s.count}
            onChange={g.live(set('count'))}
            onCommit={g.commit}
            min={1}
            max={10}
            unit="則"
          />
        </Field>
        <Field label="只列出擲骰" layout="inline" hint="需要 OBS 31 以上。">
          <Toggle checked={s.diceOnly} onCheckedChange={set('diceOnly')} />
        </Field>
      </Show>
      <Show when={scene === 'streamkit'}>
        <Field label="誰的立繪">
          <Select
            value={s.tachieUser}
            onValueChange={set('tachieUser')}
            options={STREAMKIT_USERS.map((u) => ({ value: u.id, label: `${u.name}（${u.id}）` }))}
          />
        </Field>
        <Field label="基準位置">
          <AnchorGrid value={s.anchor} onValueChange={set('anchor')} />
        </Field>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Toggle label="彈跳" checked={s.bounce} onCheckedChange={set('bounce')} />
          <Toggle label="安靜時變暗" checked={s.dim} onCheckedChange={set('dim')} />
          <Toggle
            label="不在頻道時隱藏"
            checked={s.hideWhenAway}
            onCheckedChange={set('hideWhenAway')}
          />
        </div>
      </Show>
      <Field label="檔名">
        <TextInput
          value={s.fileName}
          onFocus={g.begin}
          onChange={(e) => set('fileName')(e.target.value)}
          onBlur={g.commit}
        />
      </Field>
    </Section>
  );
}

/* ---------- 網址 ---------- */

function UrlSection({ scene }: { scene: DemoSceneKind }) {
  const room = useObsSettings((st) => st.data.room);
  const set = useSetter();
  const [character, setCharacter] = useState('');
  const url =
    scene === 'character'
      ? characterUrlFrom(character, room)
      : scene === 'room'
        ? roomUrlFrom(room)
        : scene === 'chat'
          ? chatUrlFrom(room)
          : null;
  return (
    <Section title="瀏覽器來源網址 SourceUrlField" defaultOpen={false}>
      <Field label="房間網址" hint="貼 CCFOLIA 房間網址或只貼房間 ID。">
        <TextInput
          value={room}
          placeholder="https://ccfolia.com/rooms/…"
          onChange={(e) => set('room')(e.target.value)}
        />
      </Field>
      <Show when={scene === 'character'}>
        <Field label="角色 ID（或棋子網址）">
          <TextInput value={character} onChange={(e) => setCharacter(e.target.value)} />
        </Field>
      </Show>
      <Field label="要填進瀏覽器來源的網址">
        <SourceUrlField
          url={url}
          placeholder={scene === 'streamkit' ? '用 Streamkit 網站產生的網址' : undefined}
          missingWarning={
            scene === 'streamkit'
              ? undefined
              : scene === 'chat'
                ? '還沒有網址。要用房間網址＋/chat 的聊天頁，直接用房間網址會拍到整個房間。'
                : '還沒有網址。請先填房間網址。'
          }
        />
      </Field>
    </Section>
  );
}

/* ---------- 其他元件 ---------- */

function StepperDemo() {
  const [step, setStep] = useState(0);
  const steps = [
    { label: '使用者', description: '登錄 Discord ID' },
    { label: '立繪與效果', description: '圖片、位置、說話效果' },
    { label: '組合與輸出', description: '選人與外觀，複製 CSS' },
  ];
  return (
    <Section title="步驟列 Stepper／StepNav" defaultOpen={false}>
      <Stepper steps={steps} value={step} onValueChange={setStep} />
      <StepNav value={step} count={steps.length} onValueChange={setStep} />
    </Section>
  );
}

interface DemoUser {
  id: string;
  memo: string;
  name: string;
}

function ItemListDemo() {
  const [users, setUsers] = useState<DemoUser[]>([
    { id: '123456789012345678', memo: '艾琳的玩家', name: '艾琳' },
    { id: '223456789012345678', memo: '', name: '' },
  ]);
  const [sel, setSel] = useState<string | null>(users[0].id);
  return (
    <Section title="項目清單 ItemListEditor" defaultOpen={false}>
      <ItemListEditor<DemoUser>
        aria-label="使用者"
        title="使用者"
        items={users}
        getId={(u) => u.id}
        getName={(u) => u.memo}
        placeholder="無名稱"
        selectedId={sel}
        onSelect={setSel}
        onAdd={() =>
          setUsers((l) => [
            ...l,
            { id: `3${String(l.length).padStart(17, '0')}`, memo: '', name: '' },
          ])
        }
        addLabel="新增使用者"
        onRename={(id, memo) => setUsers((l) => l.map((u) => (u.id === id ? { ...u, memo } : u)))}
        renameLabel="備忘名稱"
        renderMeta={(u) => <span className="font-mono">ID {u.id}</span>}
        onRemove={(id) => setUsers((l) => l.filter((u) => u.id !== id))}
        confirmRemove={(u) => ({
          title: `刪除「${u.memo || '無名稱'}」？`,
          description: '用到這個人的已儲存組合也會一起刪除。',
        })}
        emptyText="還沒有使用者。"
      />
    </Section>
  );
}

function FontDemo() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState('');
  return (
    <Section title="電腦字型清單 LocalFontDialog" defaultOpen={false}>
      <p className="m-0 text-xs text-muted">
        FontPicker 的 mode="css"：沒有上傳字型、字重固定 400～900、電腦字型可以手動輸入或從清單選。
      </p>
      {supportsLocalFontList() ? (
        <Button onClick={() => setOpen(true)}>從電腦字型清單選</Button>
      ) : (
        <Notice tone="info">
          這個瀏覽器無法列出電腦字型（桌面版 Chrome、Edge 可以），所以「從清單選」按鈕不會出現。
        </Notice>
      )}
      {picked ? <p className="m-0 text-sm">選了：{picked}</p> : null}
      <LocalFontDialog open={open} onOpenChange={setOpen} value={picked} onPick={setPicked} />
    </Section>
  );
}

function ImageEmbedDemo() {
  const [img, setImg] = useState<(EmbeddedImage & { bitmap: ImageBitmap }) | null>(null);
  const [maxWidth, setMaxWidth] = useState(0);
  const [msg, setMsg] = useState<{
    tone: 'success' | 'danger' | 'warning' | 'info';
    text: string;
  } | null>(null);
  const [trim, setTrim] = useState<{ rect: Rect; bytes: number | null } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [url, setUrl] = useState('');

  const adopt = async (e: EmbeddedImage, note: string) => {
    const bitmap = await loadImage(e.dataUri);
    setImg({ ...e, bitmap });
    setTrim(null);
    setMsg({
      tone: 'success',
      text: `${note}：${e.width}×${e.height}px、${formatEmbedBytes(e.bytes)}${e.resized ? '（已縮小並存成 PNG）' : ''}`,
    });
  };

  return (
    <Section title="圖片嵌入（data URI）與裁切" defaultOpen={false}>
      <Field label="嵌入時的最大寬度" hint="0＝原尺寸；比這寬的圖等比縮小並改存 PNG。">
        <NumberInput
          value={maxWidth}
          onChange={setMaxWidth}
          min={0}
          max={4096}
          unit="px"
          className="w-32"
        />
      </Field>
      <ImageDrop
        compact
        hint="上限 8 MB；會轉成 data URI"
        onFiles={async (files) => {
          try {
            await adopt(
              await fileToDataUri(files[0], { maxBytes: 8 * 1024 * 1024, maxWidth }),
              '已嵌入',
            );
          } catch (e) {
            setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
          }
        }}
      />
      <Field label="或貼圖片網址">
        <div className="flex gap-2">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          <Button
            icon={<Link2 />}
            onClick={async () => {
              const c = classifyImageUrl(url);
              if (!c.valid)
                return setMsg({ tone: 'warning', text: '這不是 http(s) 網址或 data URI。' });
              try {
                await adopt(await urlToDataUri(url, { maxWidth }), '網址已轉成嵌入');
              } catch (e) {
                const size = await measureImageUrl(url);
                setMsg({
                  tone: 'danger',
                  text: `${e instanceof Error ? e.message : String(e)}${size ? `（圖片本身可以顯示：${size.width}×${size.height}px）` : ''}`,
                });
              }
            }}
          >
            轉成嵌入
          </Button>
        </div>
      </Field>
      {msg ? (
        <Notice tone={msg.tone} className="text-xs">
          {msg.text}
        </Notice>
      ) : null}
      {img ? (
        <>
          <img
            src={img.dataUri}
            alt="嵌入的圖片"
            className="checker max-h-40 self-start rounded-sm border border-border"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              icon={<Eraser />}
              onClick={async () => {
                const r = transparentTrimRect(getImageData(img.bitmap));
                if (!r) return setMsg({ tone: 'info', text: '沒有可修的留白。' });
                setTrim({ rect: r, bytes: null });
                const after = await cropToDataUri(img.bitmap, r);
                setTrim({ rect: r, bytes: after.bytes });
              }}
            >
              修掉透明留白
            </Button>
            <Button icon={<Crop />} onClick={() => setCropOpen(true)}>
              指定範圍裁切
            </Button>
          </div>
          {trim ? (
            <>
              <CropConfirmSummary
                before={{ width: img.width, height: img.height }}
                after={{ width: trim.rect.width, height: trim.rect.height }}
                beforeBytes={img.bytes}
                afterBytes={trim.bytes}
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={async () =>
                    adopt(await cropToDataUri(img.bitmap, trim.rect), '已修掉留白')
                  }
                >
                  套用
                </Button>
                <Button onClick={() => setTrim(null)}>取消</Button>
              </div>
            </>
          ) : null}
          <CropDialog
            open={cropOpen}
            onOpenChange={setCropOpen}
            image={img.bitmap}
            aspect={null}
            freeDraw
            rawInputs
            initialRect={{ x: 0, y: 0, width: img.width, height: img.height }}
            confirm={{
              beforeBytes: img.bytes,
              estimateBytes: async (r) => (await cropToDataUri(img.bitmap, r)).bytes,
            }}
            onConfirm={async (r) => adopt(await cropToDataUri(img.bitmap, r), '已裁切')}
          />
        </>
      ) : null}
    </Section>
  );
}

/* ---------- 分頁本體 ---------- */

export function ObsDemo() {
  const scene = useObsPreview((st) => st.data.scene);
  const setPreview = useObsPreview((st) => st.patch);
  const room = useObsSettings((st) => st.data.room);
  return (
    <div className="flex flex-col gap-3">
      <Section title="模擬頁 CssPreviewFrame" fixed>
        <p className="m-0 text-xs text-muted">
          右邊的預覽是 iframe 裡的模擬頁（ccfolia/mock）套上示範 CSS（core/css）。DOM
          結構照規格的外部事實， 產生的 CSS 在真的 CCFOLIA／Streamkit 上也會生效。
        </p>
        <Segmented
          aria-label="模擬頁"
          value={scene}
          onValueChange={(v) => setPreview({ scene: v })}
          options={SCENE_OPTIONS}
          fullWidth
        />
        {scene === 'character' ? <CharacterControls /> : null}
        {scene === 'room' ? <RoomControls /> : null}
        {scene === 'chat' ? <ChatControls /> : null}
        {scene === 'streamkit' ? <StreamkitControls /> : null}
      </Section>
      <CssSettings scene={scene} />
      <UrlSection scene={scene} />
      <Section title="OBS 說明 ObsGuide" defaultOpen={false}>
        <ObsGuide
          urlLabel={
            scene === 'chat'
              ? '房間網址＋/chat 的聊天頁'
              : scene === 'room'
                ? '房間網址（不加 /chat）'
                : scene === 'character'
                  ? '角色狀態頁的網址'
                  : 'Streamkit 網站產生的語音小工具網址'
          }
          url={scene === 'chat' ? chatUrlFrom(room) : scene === 'room' ? roomUrlFrom(room) : null}
          login={scene === 'streamkit' ? 'none' : scene === 'character' ? 'interact' : 'swap-url'}
          loginOnly={scene === 'chat'}
          audio={scene === 'room'}
          obs={scene === 'room' ? null : { version: 31 }}
          multipleSources={scene !== 'room'}
          localFonts
          disclaimer={
            scene === 'streamkit'
              ? '本工具與 Discord 官方無關；Streamkit 改版時可能需要重新產生 CSS。'
              : undefined
          }
        />
      </Section>
      <StepperDemo />
      <ItemListDemo />
      <FontDemo />
      <ImageEmbedDemo />
    </div>
  );
}
