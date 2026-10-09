/**
 * 劇本文字產生器的操作（規格 1.4～1.11）：清單的手動修改與固定、確定與放回、每張圖做一則、刪除圖片、重來、匯出前的檢查。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEntryBelow,
  addSpeaker,
  addUrl,
  confirmBatch,
  deleteBatch,
  deleteEntry,
  exportRoomZip,
  fillSample,
  makeFacesFromNames,
  makeFromImages,
  moveBatch,
  moveEntry,
  rebuild,
  removeImage,
  resetAll,
  restoreBatch,
  setEntrySpeaker,
  setEntryText,
  setEntryTitle,
  setOpts,
  setScript,
} from '@/tools/scenario-text/actions';
import { entriesOf } from '@/tools/scenario-text/derived';
import { defaultDoc } from '@/tools/scenario-text/model';
import { select, useDoc, useUi } from '@/tools/scenario-text/store';

const doc = () => useDoc.getState().data;
const list = () => entriesOf(doc());
const status = (area: 'shelf' | 'speakers' | 'list' | 'export') => useUi.getState().status[area];

beforeEach(() => {
  useDoc.getState().replace(defaultDoc());
  useDoc.temporal.getState().clear();
  useUi.setState({ selected: -1, status: {} });
});

describe('清單與手動修改', () => {
  it('填入範例：依做法、取消手動修改、選第 1 則', () => {
    fillSample();
    expect(list()).toHaveLength(5);
    expect(useUi.getState().selected).toBe(0);
    setOpts({ mode: 'heading' });
    fillSample();
    expect(list().map((e) => e.title)).toEqual(['圖書館', '書房', '艾莉絲']);
  });

  it('第一次修改時固定清單，之後改文字不重建；從文字重建', () => {
    setScript('艾莉絲「一」\n鮑伯「二」');
    setEntryTitle(1, '路人');
    expect(doc().edited).not.toBeNull();
    expect(list().map((e) => [e.title, e.titleCustom])).toEqual([
      ['艾莉絲', false],
      ['路人', true],
    ]);
    setScript('完全不同的文字');
    expect(list()).toHaveLength(2);
    rebuild();
    expect(doc().edited).toBeNull();
    expect(list().map((e) => e.text)).toEqual(['完全不同的文字']);
    expect(useUi.getState().selected).toBe(-1);
    expect(status('list')?.text).toBe('已從文字重建清單。');
  });

  it('換說話者：標題＝他的名稱、差分清空；換成沒有立繪時標題不變', () => {
    setScript('路人「嗨」');
    const bob = doc().speakers[1].id;
    setEntrySpeaker(0, bob);
    expect(list()[0]).toMatchObject({ title: '鮑伯', kind: 'speaker', speakerId: bob, face: '' });
    setEntrySpeaker(0, null);
    expect(list()[0]).toMatchObject({ title: '鮑伯', speakerId: null });
  });

  it('上移、下移、在下面加一則、刪除（選取跟著）', () => {
    setScript('艾莉絲「一」\n鮑伯「二」\n艾莉絲「三」');
    moveEntry(0, 1);
    expect(list().map((e) => e.text)).toEqual(['「二」', '「一」', '「三」']);
    expect(useUi.getState().selected).toBe(1);
    addEntryBelow(1);
    expect(list().map((e) => [e.text, e.line])).toEqual([
      ['「二」', 2],
      ['「一」', 1],
      ['（新的劇本文字）', null],
      ['「三」', 3],
    ]);
    expect(useUi.getState().selected).toBe(2);
    deleteEntry(3);
    expect(useUi.getState().selected).toBe(2);
    deleteEntry(0);
    expect(useUi.getState().selected).toBe(0);
    expect(list().map((e) => e.text)).toEqual(['「一」', '（新的劇本文字）']);
  });

  it('清單變短時選取跟著夾回範圍；清單變空後再貼上不會選回原來的位置', () => {
    setScript('艾莉絲「一」\n鮑伯「二」\n艾莉絲「三」');
    select(2);
    setScript('艾莉絲「一」\n鮑伯「二」');
    expect(useUi.getState().selected).toBe(1);
    setScript('');
    expect(useUi.getState().selected).toBe(-1);
    setScript('艾莉絲「一」\n鮑伯「二」\n艾莉絲「三」');
    expect(useUi.getState().selected).toBe(-1);
  });

  it('可以復原（修改前的清單與文字）', () => {
    vi.useFakeTimers();
    try {
      /* 400 ms 內的連續變更算一步：兩次變更隔開 */
      vi.setSystemTime(1_000_000);
      setScript('艾莉絲「一」');
      vi.setSystemTime(1_010_000);
      setEntryText(0, '改過');
      expect(doc().edited?.[0].text).toBe('改過');
      useDoc.temporal.getState().undo();
      expect(doc().edited).toBeNull();
      expect(doc().script).toBe('艾莉絲「一」');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('確定與放回（F39、F57、F58）', () => {
  it('確定：收進已確定、文字清空、摘要是「標題：本文」前 28 字', () => {
    setScript(`艾莉絲「${'很長的台詞'.repeat(10)}」`);
    expect(confirmBatch()).toBe(true);
    expect(doc().script).toBe('');
    expect(doc().confirmed).toHaveLength(1);
    expect(doc().confirmed[0].label).toBe(
      '艾莉絲：「很長的台詞很長的台詞很長的台詞很長的台詞很長的…',
    );
    expect(status('list')?.text).toBe('已確定（1 則），可以輸入下一段文字。');
    expect(confirmBatch()).toBe(false);
  });

  it('放回：目前的清單先確定（排到最後）；差分名稱開關維持目前的', () => {
    setScript('艾莉絲「一」');
    confirmBatch();
    setOpts({ mode: 'heading', faceInTitle: true });
    setScript('■A\nb');
    setEntryTitle(0, '改過的標題');
    expect(restoreBatch(0)).toBe(true);
    expect(doc().script).toBe('艾莉絲「一」');
    expect(doc().opts).toMatchObject({ mode: 'script', faceInTitle: true });
    expect(doc().edited).toBeNull();
    expect(doc().confirmed).toHaveLength(1);
    expect(doc().confirmed[0]).toMatchObject({ mode: 'heading', edited: true, script: '■A\nb' });
    expect(doc().confirmed[0].entries[0].title).toBe('改過的標題');
    expect(status('list')?.text).toBe('已放回；原本的文字已經移到已確定的最後。');
    /* 再放回手動修改過的那批 */
    setScript('');
    expect(restoreBatch(0)).toBe(false);
    expect(doc().edited?.[0].title).toBe('改過的標題');
    expect(status('list')?.text).toBe('已放回。修改後請再按一次確定。');
  });

  it('上移、下移、刪除', () => {
    for (const t of ['一', '二', '三']) {
      setScript(`艾莉絲「${t}」`);
      confirmBatch();
    }
    moveBatch(2, -1);
    expect(doc().confirmed.map((b) => b.script)).toEqual([
      '艾莉絲「一」',
      '艾莉絲「三」',
      '艾莉絲「二」',
    ]);
    moveBatch(0, -1);
    deleteBatch(1);
    expect(doc().confirmed.map((b) => b.script)).toEqual(['艾莉絲「一」', '艾莉絲「二」']);
  });
});

describe('圖片庫的操作', () => {
  it('網址：檢查 https、同網址不重複、名稱取路徑最後一段', () => {
    expect(addUrl('http://x/a.png')).toBeNull();
    expect(status('shelf')?.tone).toBe('danger');
    const id = addUrl(' https://example.com/img/%E9%91%B0%E5%8C%99.png ');
    expect(doc().images).toEqual([
      {
        id,
        kind: 'url',
        name: '鑰匙',
        credit: '',
        url: 'https://example.com/img/%E9%91%B0%E5%8C%99.png',
      },
    ]);
    expect(addUrl('https://example.com/img/%E9%91%B0%E5%8C%99.png')).toBe(id);
    expect(doc().images).toHaveLength(1);
  });

  it('每張圖做一則：清單還沒用到的圖、清單切成手動修改、選第一則新加的', () => {
    const key = addUrl('https://example.com/%E9%91%B0%E5%8C%99.png') as string;
    const map = addUrl('https://example.com/map.png') as string;
    setOpts({ mode: 'heading' });
    setScript('■鑰匙\n一把鑰匙');
    makeFromImages();
    expect(doc().edited).not.toBeNull();
    expect(list().map((e) => [e.title, e.text, e.image, e.titleCustom])).toEqual([
      ['鑰匙', '一把鑰匙', 'auto', false],
      ['map', '', map, true],
    ]);
    expect(useUi.getState().selected).toBe(1);
    expect(status('shelf')?.text).toBe(
      '已依圖片加了 1 則劇本文字（清單已經用到的 1 張略過）。本文是空的，請一則一則填。',
    );
    makeFromImages();
    expect(status('shelf')?.text).toBe('圖片庫的圖片都已經用在清單裡了。');
    expect(key).toBeTruthy();
  });

  it('刪除：用到的地方變成「沒有圖」，可以復原', () => {
    const id = addUrl('https://example.com/a.png') as string;
    const sp = doc().speakers[0].id;
    useDoc.getState().update((d) => {
      d.speakers[0].imageId = id;
    });
    setScript('艾莉絲「一」');
    setEntryTitle(0, 'x');
    useDoc.getState().update((d) => {
      if (d.edited) d.edited[0].image = id;
    });
    removeImage(id, true);
    expect(doc().images).toHaveLength(0);
    expect(doc().speakers.find((s) => s.id === sp)?.imageId).toBeNull();
    expect(doc().edited?.[0].image).toBe('none');
    expect(status('shelf')?.text).toBe('已刪除；用到的地方變成「沒有圖」。');
  });

  it('從圖片庫建立差分：說話者名稱空白、找不到、建立', () => {
    const empty = addSpeaker('');
    makeFacesFromNames(empty);
    expect(status('speakers')?.text).toBe('請先填說話者的名稱。');
    const alice = doc().speakers[0].id;
    makeFacesFromNames(alice);
    expect(status('speakers')?.text).toBe(
      '找不到以「艾莉絲」開頭的圖片。請把圖片名稱改成「艾莉絲_笑臉」這種形式。',
    );
    addUrl('https://example.com/%E8%89%BE%E8%8E%89%E7%B5%B2_%E7%AC%91%E8%87%89.png');
    addUrl('https://example.com/%E8%89%BE%E8%8E%89%E7%B5%B2.png');
    makeFacesFromNames(alice);
    expect(status('speakers')?.text).toBe('已建立 1 個差分：笑臉。也設定了立繪。');
    const a = doc().speakers[0];
    expect(a.faces.map((f) => f.label)).toEqual(['笑臉']);
    expect(a.imageId).toBe(doc().images[1].id);
    makeFacesFromNames(alice);
    expect(status('speakers')?.text).toBe('沒有可以新建的差分（都已經建好了）。');
  });
});

describe('重來、匯出前的檢查', () => {
  it('重來：圖片庫留著、其他回預設', () => {
    addUrl('https://example.com/a.png');
    addSpeaker('丙');
    setScript('x');
    confirmBatch();
    resetAll();
    expect(doc().images).toHaveLength(1);
    expect(doc().speakers.map((s) => s.name)).toEqual(['艾莉絲', '鮑伯']);
    expect(doc().confirmed).toEqual([]);
    expect(doc().script).toBe('');
  });

  it('本文空白的一則擋下匯出（指出位置；目前清單時選取那一則）', async () => {
    setScript('艾莉絲「一」\n艾莉絲「二」');
    setEntryText(1, '   ');
    await exportRoomZip();
    expect(status('export')).toMatchObject({
      tone: 'danger',
      text: '有本文空白的劇本文字（目前的清單）。CCFOLIA 會改送聊天欄裡的文字，請填入本文或刪除。',
    });
    expect(useUi.getState().selected).toBe(1);
    confirmBatch();
    setScript('鮑伯「三」');
    await exportRoomZip();
    expect(status('export')?.text).toContain('（已確定的第 1 批）');
  });
});
