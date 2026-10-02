/**
 * CoC 劇本排版工具：標記的規則（規格 3.5.1～3.5.3、3.6～3.8、3.10）、存檔的整理（2.2）。
 */
import { describe, expect, it } from 'vitest';
import {
  absorbFrontMatter,
  BLANK_KEYS,
  blankMeta,
  defaultSettings,
  fromLegacy,
  metaFromFront,
  normalizeSettings,
  normalizeZoom,
  restoreData,
} from '@/tools/coc-typesetter/model';
import {
  boxOpen,
  canOpenSlash,
  charCount,
  classifyLines,
  FORMATS,
  filterFormats,
  isBoxClose,
  isDesc,
  isJudge,
  isPageBreak,
  isStructural,
  judgeHead,
  lineOfPos,
  lineStartPos,
  plainTitle,
  planFormat,
  SNIPPETS,
  slashQuery,
  splitDeco,
  splitFrontMatter,
} from '@/tools/coc-typesetter/syntax';

describe('區塊的判斷（3.5.2）', () => {
  it('框的開頭：四種、不分大小寫、可以有標籤；後面緊接別的字不算', () => {
    expect(boxOpen(':::kp')).toEqual({ kind: 'kp', label: '' });
    expect(boxOpen('::: PL 資料卡：信件')).toEqual({ kind: 'pl', label: '資料卡：信件' });
    expect(boxOpen(':::note  補充 ')).toEqual({ kind: 'note', label: '補充' });
    expect(boxOpen(':::Warn')).toEqual({ kind: 'warn', label: '' });
    expect(boxOpen(':::kpx')).toBeNull();
    expect(boxOpen(' :::kp')).toBeNull();
    expect(boxOpen(':::info')).toBeNull();
    expect(isBoxClose(':::')).toBe(true);
    expect(isBoxClose(':::  ')).toBe(true);
    expect(isBoxClose('::: x')).toBe(false);
  });

  it('換頁：兩邊至少一個 =，可以有空白', () => {
    for (const l of ['===換頁===', '=換頁=', ' == 換頁 ==== '])
      expect(isPageBreak(l), l).toBe(true);
    for (const l of ['換頁', '===換頁', '===改ページ===']) expect(isPageBreak(l), l).toBe(false);
  });

  it('描述、檢定、結束檢定結果的行', () => {
    expect(isDesc('  > 霧')).toBe(true);
    expect(isJudge(' ▼【偵查】成功')).toBe(true);
    expect(judgeHead(' ▼  【偵查】成功')).toBe('【偵查】成功');
    for (const l of ['## 章', '###### 小', '▼x', ':::kp', '> 描述', '==換頁=='])
      expect(isStructural(l), l).toBe(true);
    for (const l of ['#標題', '| a |', '- 清單', '一般文字'])
      expect(isStructural(l), l).toBe(false);
  });
});

describe('技能與理智檢定（3.5.3）', () => {
  const kinds = (t: string) => splitDeco(t).flatMap((p) => (p.kind ? [`${p.kind}:${p.text}`] : []));

  it('技能：【】包住 1～40 個字', () => {
    expect(kinds('用【偵查】或【圖書館使用】')).toEqual(['skill:【偵查】', 'skill:【圖書館使用】']);
    expect(kinds('【】')).toEqual([]);
    expect(kinds(`【${'字'.repeat(41)}】`)).toEqual([]);
    expect(kinds(`【${'字'.repeat(40)}】`)).toHaveLength(1);
  });

  it('理智檢定的各種寫法', () => {
    for (const t of [
      'SANc（0/1d3）',
      'SANC(1/1d6)',
      'SAN 檢定（0/1）',
      'SAN值check（1/1d4）',
      'SAN Check(0/1)',
      'SC（0/1）',
      'SC (1/1d2)',
      '理智檢定（0/1d2）',
    ])
      expect(kinds(`進行 ${t} 吧`), t).toEqual([`san:${t}`]);
  });

  it('SC 前面不能是英文字母；括號裡 1～24 個字；小寫 san 不算', () => {
    expect(kinds('DESC（說明）')).toEqual([]);
    expect(kinds('。SC（0/1）')).toEqual(['san:SC（0/1）']);
    expect(kinds('SANc（）')).toEqual([]);
    expect(kinds(`SANc（${'1'.repeat(25)}）`)).toEqual([]);
    expect(kinds('sanc（0/1）')).toEqual([]);
  });

  it('一段文字切開後接回去不變，由左到右', () => {
    const t = '先【聆聽】再 SANc（0/1）然後【偵查】';
    const parts = splitDeco(t);
    expect(parts.map((p) => p.text).join('')).toBe(t);
    expect(kinds(t)).toEqual(['skill:【聆聽】', 'san:SANc（0/1）', 'skill:【偵查】']);
  });
});

describe('封面資訊（3.5.1）', () => {
  it('開頭的 --- 區塊：半形或全形冒號、空白去掉、BOM 與前面的空白可以有', () => {
    const r = splitFrontMatter(
      '﻿\n---\n標題: 霧港\n副標題：短篇\n\n 作者 ：  某人 \n建議人數: 2 人\n---\n## 正文',
    );
    expect(r?.items).toEqual([
      { key: '標題', value: '霧港' },
      { key: '副標題', value: '短篇' },
      { key: '作者', value: '某人' },
      { key: '建議人數', value: '2 人' },
    ]);
    expect(r?.body).toBe('## 正文');
  });

  it('有一行不是「項目: 內容」、沒有項目、沒有結尾時不算', () => {
    expect(splitFrontMatter('---\n標題: 霧港\n這一行不是\n---\n')).toBeNull();
    expect(splitFrontMatter('---\n\n---\n')).toBeNull();
    expect(splitFrontMatter('---\n標題: 霧港\n')).toBeNull();
    expect(splitFrontMatter('前言\n---\n標題: 霧港\n---\n')).toBeNull();
    /* 結尾的 --- 後面直接結束也算 */
    expect(splitFrontMatter('---\n標題: 霧港\n---')?.body).toBe('');
  });

  it('搬進封面與概要：整份取代、重複的標題取第一個、其餘依序成為概要；刪掉開頭的空白行', () => {
    const r = absorbFrontMatter(
      '---\n作者: 甲\n標題: 一\n標題: 二\n舞台: 台北\n舞台: 台中\n---\n\n\n## 正文\n',
    );
    expect(r?.meta).toEqual({
      title: '一',
      subtitle: '',
      author: '甲',
      items: [
        { key: '舞台', value: '台北' },
        { key: '舞台', value: '台中' },
      ],
    });
    expect(r?.text).toBe('## 正文\n');
    expect(absorbFrontMatter('## 沒有封面資訊')).toBeNull();
    expect(metaFromFront([{ key: '副標題', value: 'x' }]).subtitle).toBe('x');
  });
});

describe('文字欄的分色（3.6）', () => {
  it('各種行', () => {
    const text = [
      '# 大標',
      '## 章',
      '### 探索',
      '> 描述',
      '▼【偵查】成功',
      '結果一',
      '| a |',
      '',
      '| b |',
      '===換頁===',
      '```',
      '## 不是標題',
      '```',
      '普通',
    ].join('\n');
    expect(classifyLines(text).map((c) => c.kind ?? '')).toEqual([
      'h1',
      'h2',
      'h3',
      'desc',
      'judge',
      'jbody',
      'jbody',
      '',
      'table',
      'pb',
      'code',
      'code',
      'code',
      '',
    ]);
  });

  it('框：開頭、框裡、結尾依種類；遇到第一個 ::: 就結束（巢狀不另外算）', () => {
    const c = classifyLines(':::kp 標籤\n內容\n:::note\n內\n:::\n外面\n:::');
    expect(c[0]).toEqual({ kind: 'box-open', box: 'kp' });
    expect(c[1]).toEqual({ box: 'kp', inBox: true });
    expect(c[2]).toEqual({ kind: 'box-open', box: 'note' });
    expect(c[3]).toEqual({ box: 'note', inBox: true });
    expect(c[4]).toEqual({ kind: 'box-close', box: 'note' });
    expect(c[5]).toEqual({});
    /* 不在框裡的 ::: 不是結尾 */
    expect(c[6]).toEqual({});
  });

  it('檢定結果遇到其他種類的行結束', () => {
    const c = classifyLines('▼ 檢定\n結果\n> 描述\n不是結果');
    expect(c.map((x) => x.kind ?? '')).toEqual(['judge', 'jbody', 'desc', '']);
  });
});

describe('插入格式（3.7）', () => {
  it('11 種格式都有範本；按鈕名稱照規格', () => {
    expect(FORMATS.map((f) => f.button)).toEqual([
      '章',
      '探索',
      '描述',
      '檢定',
      'KP 資訊',
      '公開資訊',
      '補充',
      '注意',
      'SANc',
      '資料表',
      '換頁',
    ]);
    for (const f of FORMATS) expect(SNIPPETS[f.key]).toBeTruthy();
  });

  it('獨立成段：前面空一行、後面接換行；暫定文字呈選取狀態', () => {
    const v = '前文\n後文';
    const p = planFormat(v, 'h2', 2, 2);
    expect(p.text).toBe('\n\n## 章名\n');
    const out = v.slice(0, p.start) + p.text + v.slice(p.end);
    expect(out).toBe('前文\n\n## 章名\n\n後文');
    /* 後面的內容不是以換行開頭時補一個換行 */
    expect(planFormat('前文後文', 'h3', 2, 2).text).toBe('\n\n### 地點或場景的名稱\n\n');
    expect(out.slice(p.selStart, p.selEnd)).toBe('章名');
  });

  it('前面以一個換行結尾時只補一個換行；在最前面或最後面不補', () => {
    expect(planFormat('前文\n', 'pb', 3, 3).text).toBe('\n===換頁===\n');
    expect(planFormat('前文\n\n', 'pb', 4, 4).text).toBe('===換頁===\n');
    expect(planFormat('', 'pb', 0, 0).text).toBe('===換頁===\n');
    /* 沒有暫定文字：游標放在插入的內容後面 */
    const p = planFormat('前文\n\n', 'pb', 4, 4);
    expect(p.selStart).toBe(4 + '===換頁===\n'.length);
    expect(p.selEnd).toBe(p.selStart);
  });

  it('行內的 SANc 直接插在游標處', () => {
    const p = planFormat('進行。', 'san', 2, 2);
    expect(p.text).toBe('SANc（0/1d3）');
    const out = `進行${p.text}。`;
    expect(out.slice(p.selStart, p.selEnd)).toBe('0/1d3');
  });

  it('有選取：章、描述、框、檢定包住選取的整行；SANc 只包選取的字', () => {
    const v = '甲\n# 舊標題\n乙';
    let p = planFormat(v, 'h2', 4, 6);
    expect(v.slice(0, p.start) + p.text + v.slice(p.end)).toBe('甲\n\n## 舊標題\n\n乙');
    const v2 = '一行\n> 二行\n三行';
    p = planFormat(v2, 'desc', 1, 6);
    expect(v2.slice(0, p.start) + p.text + v2.slice(p.end)).toBe('> 一行\n> 二行\n\n三行');
    p = planFormat('甲\n乙\n', 'kp', 0, 4);
    expect(p.text).toBe(':::kp\n甲\n乙\n:::\n');
    p = planFormat('一\n\n二', 'judge', 0, 4);
    expect(p.text).toBe('▼【偵查】成功\n一\n二\n');
    expect(p.text.slice(p.selStart - p.start, p.selEnd - p.start)).toBe('偵查');
    p = planFormat('進行0/1吧', 'san', 2, 5);
    expect(p.text).toBe('SANc（0/1）');
  });

  it('資料表、換頁沒有包法：取代選取的文字插入範本', () => {
    const p = planFormat('甲乙丙', 'pb', 1, 2);
    expect(p.start).toBe(1);
    expect(p.end).toBe(2);
    expect(p.text).toBe('\n\n===換頁===\n\n');
  });

  it('從「/」選單：「/」到游標被範本取代（不包選取）', () => {
    const v = '前文\n\n/kp';
    const p = planFormat(v, 'kp', v.length, v.length, [4, v.length]);
    const out = v.slice(0, p.start) + p.text + v.slice(p.end);
    expect(out).toBe(`前文\n\n${SNIPPETS.kp.replace('⟦', '').replace('⟧', '')}`);
  });
});

describe('「/」選單（3.7.3）', () => {
  it('行首（前面只有空白）的半形或全形斜線才開', () => {
    expect(canOpenSlash('/', 0)).toBe(true);
    expect(canOpenSlash('甲\n  ／', 4)).toBe(true);
    expect(canOpenSlash('甲/', 1)).toBe(false);
    expect(canOpenSlash('甲', 0)).toBe(false);
  });

  it('篩選字：游標在斜線之前、有空白、超過 16 字、斜線不見了就關閉', () => {
    expect(slashQuery('/kp', 0, 3)).toBe('kp');
    expect(slashQuery('/kp', 0, 0)).toBeNull();
    expect(slashQuery('/k p', 0, 4)).toBeNull();
    expect(slashQuery(`/${'a'.repeat(17)}`, 0, 18)).toBeNull();
    expect(slashQuery('xkp', 0, 3)).toBeNull();
  });

  it('依名稱、關鍵字（英文不分大小寫）、代號開頭篩選', () => {
    expect(filterFormats('')).toHaveLength(11);
    expect(filterFormats('KP').map((f) => f.key)).toEqual(['kp']);
    expect(filterFormats('檢定').map((f) => f.key)).toEqual(['judge', 'san']);
    expect(filterFormats('h').map((f) => f.key)).toEqual(
      expect.arrayContaining(['h2', 'h3', 'pl']),
    );
    expect(filterFormats('換頁').map((f) => f.key)).toEqual(['pb']);
    expect(filterFormats('xyz')).toEqual([]);
  });
});

describe('字數、行號、標題', () => {
  it('字數：拿掉所有空白與換行（3.10）', () => {
    expect(charCount('## 章\n\n甲 乙\t丙　')).toBe(6);
  });
  it('行號與行首', () => {
    const v = '甲\n乙乙\n\n丙';
    expect(lineOfPos(v, 0)).toBe(0);
    expect(lineOfPos(v, 3)).toBe(1);
    expect(lineOfPos(v, v.length)).toBe(3);
    expect(lineStartPos(v, 2)).toBe(5);
    expect(lineStartPos(v, 9)).toBe(v.length);
  });
  it('書眉與檔名用的標題拿掉 * _ `', () => {
    expect(plainTitle('**霧港**_的`光`')).toBe('霧港的光');
  });
});

describe('存檔的整理（2.2）', () => {
  it('新建的預設', () => {
    expect(defaultSettings()).toEqual({
      paper: 'A5',
      theme: 'mono',
      cover: true,
      toc: true,
      chapter: true,
      header: true,
      zoom: 'auto',
    });
    expect(blankMeta().items.map((x) => x.key)).toEqual(BLANK_KEYS);
    expect(BLANK_KEYS).toEqual(['規則版本', '建議人數', '遊玩時間', '建議技能', '撕卡率']);
  });

  it('舊版的設定：配色對應、不認得的用預設、顯示比例是字串', () => {
    expect(
      normalizeSettings({ paper: 'B5', theme: 'shinkai', zoom: '0.75', cover: false }),
    ).toEqual({ ...defaultSettings(), paper: 'B5', theme: 'night', zoom: 0.75, cover: false });
    expect(normalizeSettings({ theme: 'aishu' }).theme).toBe('antique');
    expect(normalizeSettings({ paper: 'B4', theme: 'x', toc: 'yes' })).toEqual(defaultSettings());
    expect(normalizeZoom('auto')).toBe('auto');
    expect(normalizeZoom('1.25')).toBe(1.25);
    expect(normalizeZoom('9')).toBe('auto');
    expect(normalizeZoom(null)).toBe('auto');
  });

  it('舊版的存檔：內文、封面與概要、設定；壞掉時 null；開頭的封面資訊讀進表單', () => {
    const legacy = JSON.stringify({
      text: '---\n標題: 舊作\n---\n## 一\n',
      meta: { title: '會被取代', items: [{ key: 'a', value: 'b' }, { key: 1 }] },
      settings: { paper: 'A4', theme: 'aishu', zoom: '1' },
    });
    const d = fromLegacy(legacy);
    expect(d?.text).toBe('## 一\n');
    expect(d?.meta.title).toBe('舊作');
    expect(d?.meta.items).toEqual([]);
    expect(d?.settings).toMatchObject({ paper: 'A4', theme: 'antique', zoom: 1 });
    expect(fromLegacy('{壞掉')).toBeNull();
    expect(fromLegacy('null')).toBeNull();
    const plain = fromLegacy(
      JSON.stringify({ text: 3, meta: { items: [{ key: 'k', value: 'v' }] } }),
    );
    expect(plain?.text).toBe('');
    expect(plain?.meta).toEqual({
      title: '',
      subtitle: '',
      author: '',
      items: [{ key: 'k', value: 'v' }],
    });
    expect(plain?.settings).toEqual(defaultSettings());
  });

  it('新版的存檔：CRLF 換成 LF', () => {
    expect(restoreData({ text: '甲\r\n乙\r丙' })?.text).toBe('甲\n乙\n丙');
    expect(restoreData('x')).toBeNull();
  });
});
