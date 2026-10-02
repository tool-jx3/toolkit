/**
 * 團報文字與清單文字的解讀（規格 3.8.5、F79、F80）。回傳部分欄位的一團，之後再經 importSheet 的整理（第 2～5 步）。
 */
import { canonicalSurvival } from '@/core/sessions';
import { desmallcaps, type PartialRow } from './importSheet';

/** 文字裡的系統名稱 → 正規值（依序比對，第一個符合的） */
const SYSTEM_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/新クトゥルフ神話trpg|新クトゥルフ|新克蘇魯|new\s*coc|coc\s*7版?|coc7/i, 'CoC 7版'],
  [/クトゥルフ神話trpg|克蘇魯神話trpg|coc\s*6版?|coc6/i, 'CoC 6版'],
  [/call of cthulhu|クトゥルフ|克蘇魯|coc(?![0-9])/i, 'CoC 7版'],
  [/エモクロア|emoklore/i, 'エモクロア'],
  [/マーダーミステリー|マダミス|謀殺之謎|murder\s*mystery/i, 'マダミス'],
  [/シノビガミ|忍神/i, 'シノビガミ'],
  [/インセイン|\binsane\b/i, 'インセイン'],
  [/ダブルクロス|雙重十字|double\s*cross/i, 'ダブルクロス The 3rd Edition'],
  [/ソード・?ワールド|劍世界|sword\s*world/i, 'ソード・ワールド2.5'],
  [/フタリソウサ|二人搜查/i, 'フタリソウサ'],
];

/** 文字裡出現的系統（正規值；沒有時空字串） */
export function detectSystemFromText(text: unknown): string {
  const t = desmallcaps(text).normalize('NFKC');
  for (const [re, name] of SYSTEM_PATTERNS) if (re.test(t)) return name;
  return '';
}

/** 去掉行首與行尾的裝飾記號 */
export function stripReportLine(line: string): string {
  return String(line)
    .replace(/^[\s　|｜┊┗▹▸▶►▷➜➤‣・･\-–—―━─=*✦✧✼⟡◤◢◈❖◇◆‖†✩⋆★☆✮✯⚝⛦≛▮▎ᐧ.·°˖˚₊‧꙳⌜⌟୨୧꒰꒱ঌ໒⧉]+/u, '')
    .replace(/[\s　|｜┊◤◢⌜⌟୨୧‧₊˚꙳・.·°˖ ─—―━=✦✧]+$/u, '')
    .trim();
}

const ROLE_LINE_RE =
  /^(kpc\s*[/／]\s*kp|作\s*[/／]\s*kp|kpc|skp|kp|dl|gm|進行|主持|ゲームマスター|キーパー)\s*(?:[：:┊|｜・/／]|\s)\s*(.+)$/i;
const HONOR_RE = /(さん|様|氏|ｻﾝ|樣|桑)\s*$/;
const STOP_RE =
  /(^|\s)#|(20|19)\d{2}\s*[/年.-]|end\b|エンド|エンディング|クリア|scenario\s*clear|全?生還|全?ロスト|撕卡|グッドエンド|✧\s*$/i;

/** 參加者（PC／PL 的組合與 HO） */
function parseParticipants(
  lines: readonly string[],
  headerIdx: number,
): { pcs: string[]; pls: string[]; hos: string[] } {
  const bareHeader = headerIdx >= 0 ? lines[headerIdx].replace(/\s/g, '').toLowerCase() : '';
  let plFirst = /^pl/.test(bareHeader);
  let orderResolved = headerIdx >= 0;
  const pcs: string[] = [];
  const pls: string[] = [];
  const hos: string[] = [];
  for (let i = headerIdx >= 0 ? headerIdx + 1 : 0; i < lines.length; i++) {
    const line = lines[i];
    if (ROLE_LINE_RE.test(line)) {
      if (pcs.length && headerIdx < 0) break;
      continue;
    }
    const hoM = /^(ho|pc)\s*(\d+)/i.exec(line);
    const cleaned = line
      .replace(/^(ho\s*\d+|pc\s*\d+|pc|ho|自由)\s*[:：]?\s*/i, '')
      .replace(/^[┗▹▸➤‣・\-\s]+/, '')
      .trim();
    if (STOP_RE.test(cleaned)) {
      if (pcs.length || pls.length) break;
      continue;
    }
    const parts = cleaned
      .split(/\s*[/／|｜┊]\s*/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length !== 2) {
      if ((pcs.length || pls.length) && headerIdx < 0) break;
      continue;
    }
    if (
      headerIdx < 0 &&
      !hoM &&
      !pcs.length &&
      !HONOR_RE.test(parts[0]) &&
      !HONOR_RE.test(parts[1])
    )
      continue;
    if (!orderResolved) {
      const l0 = HONOR_RE.test(parts[0]);
      const l1 = HONOR_RE.test(parts[1]);
      if (l1 && !l0) plFirst = false;
      else if (l0 && !l1) plFirst = true;
      orderResolved = true;
    }
    if (plFirst) {
      pls.push(parts[0]);
      pcs.push(parts[1]);
    } else {
      pcs.push(parts[0]);
      pls.push(parts[1]);
    }
    if (hoM) hos.push(`${(hoM[1] || 'HO').toUpperCase()}${hoM[2]}`);
  }
  return { pcs, pls, hos };
}

const isParticipantHeader = (l: string): boolean => {
  const bare = l.replace(/\s/g, '').toLowerCase();
  return /^(pc|pl)[・.:：/／┊|｜](pl|pc)/.test(bare) || bare === 'pcpl' || bare === 'plpc';
};

const stripHonor = (n: string) => n.replace(/(様|さん|氏|樣|桑)\s*$/, '').trim();

/** 一篇團報 → 一團（部分欄位） */
export function parseReportBlock(block: string): PartialRow {
  const row: PartialRow = { longNote: block.trim() };
  const norm = desmallcaps(block).normalize('NFKC');
  const lines = norm.split('\n').map(stripReportLine).filter(Boolean);

  const tags = norm.match(/#[^\s#、,，。]+/g) ?? [];
  if (tags.length) row.hashtag = [...new Set(tags)].join(' ');

  const dm = /(20\d{2}|19\d{2})\s*[/.\-年]\s*(\d{1,2})\s*[/.\-月]\s*(\d{1,2})/.exec(norm);
  if (dm) row.date = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;

  row.system = detectSystemFromText(norm);

  for (const line of lines) {
    const bm = /[「『【《〈](.+?)[」』】》〉]/.exec(line);
    if (!bm) continue;
    const s = bm[1].trim();
    if (s && !detectSystemFromText(s) && !/^(kp|dl|gm|pl|pc|ho\d|end|作)/i.test(s)) {
      row.scenario = s;
      break;
    }
  }
  if (!row.scenario) {
    const sysIdx = lines.findIndex((l) => detectSystemFromText(l) && l.length < 30);
    if (sysIdx >= 0 && lines[sysIdx + 1])
      row.scenario = lines[sysIdx + 1].replace(/[「『【《〈」』】》〉]/g, '').trim();
  }

  const gmNames: string[] = [];
  for (const line of lines) {
    if (isParticipantHeader(line)) continue;
    const m = ROLE_LINE_RE.exec(line);
    if (!m) continue;
    for (const n of m[2].split(/[、,，/／|｜]/).map(stripHonor)) {
      if (n && n.length < 24 && !ROLE_LINE_RE.test(n) && !detectSystemFromText(n)) gmNames.push(n);
    }
  }
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    if (
      /^(kp|dl|gm|キーパー|ゲームマスター)…?\s*$/i.test(line) &&
      next &&
      !ROLE_LINE_RE.test(next) &&
      !/[「『]/.test(next) &&
      !isParticipantHeader(next)
    ) {
      const n = stripHonor(next);
      if (n && n.length < 24 && !detectSystemFromText(n)) gmNames.push(n);
    }
  });
  if (gmNames.length) row.gm = [...new Set(gmNames)].join('、');

  const headerIdx = lines.findIndex(isParticipantHeader);
  const { pcs, pls, hos } = parseParticipants(lines, headerIdx);
  if (pcs.length) row.pc = [...new Set(pcs.filter(Boolean))].join(' / ');
  if (pls.length) row.players = [...new Set(pls.filter(Boolean))].join('、');
  if (hos.length) row.ho = [...new Set(hos)].join(' ');

  const resLine = lines.find(
    (l) =>
      /(end\b|エンド|クリア|scenario\s*clear|生還|ロスト|撕卡|グッドエンド|ゲームクリア)/i.test(
        l,
      ) &&
      l.length < 48 &&
      !/[「『【]/.test(l),
  );
  if (resLine) {
    row.ending = resLine.replace(/^[-–—―─\s]+|[-–—―─\s]+$/g, '').trim();
    const s = /全員生還|全員撕卡|全生還|全ロスト|生還|ロスト|撕卡/.exec(resLine);
    if (s) row.survival = canonicalSurvival(s[0]);
  }
  return row;
}

/** 本工具輸出的清單文字（編號行）→ 多團 */
export function parseListExport(raw: string): PartialRow[] {
  const rows: PartialRow[] = [];
  let groupSystem = '';
  let groupGm = '';
  let groupRole = '';
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const gh = /^【\s*(.+?)\s*】$/.exec(line);
    if (gh) {
      const g = gh[1];
      const sys = detectSystemFromText(g);
      if (sys) groupSystem = sys;
      else if (/^(pl|kp|gm|dl)/i.test(g)) groupRole = g.toUpperCase().slice(0, 2);
      else groupGm = g;
      continue;
    }
    if (/^[◼◻■□▪▫◾◽]?\s*GM(した|担当)/.test(line)) {
      groupRole = 'KP';
      continue;
    }
    if (/^[◼◻■□▪▫◾◽]?[\uFE0E\s]*(\d+)\s*(pl|人)/i.test(line)) {
      groupRole = '';
      continue;
    }
    const m = /^\d+[.．)]\s*(.+)$/.exec(line);
    if (!m) continue;
    const parts = m[1].split(/\s*[/／]\s*/).map((p) => p.trim());
    const row: PartialRow = { scenario: parts[0].replace(/[「『【《〈」』】》〉]/g, '').trim() };
    if (parts[1]) row.system = detectSystemFromText(parts[1]) || parts[1];
    if (parts[2] && /^(pl|kp|gm|dl)$/i.test(parts[2])) row.role = parts[2].toUpperCase();
    if (parts[3]) row.date = parts[3];
    if (!row.system && groupSystem) row.system = groupSystem;
    if (!row.role && groupRole) row.role = groupRole;
    if (!row.gm && groupGm) row.gm = groupGm;
    if (row.scenario) rows.push(row);
  }
  return rows;
}

/** 貼上的文字 → 多團（部分欄位）：編號行佔多數時當清單，否則依空行或分隔線切成多篇團報 */
export function parseReportText(text: string): PartialRow[] {
  const raw = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
  if (!raw) return [];
  const bodyLines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const numbered = bodyLines.filter((l) => /^\d+[.．)]\s*\S/.test(l)).length;
  if (numbered >= 3 && numbered >= bodyLines.length * 0.4) return parseListExport(raw);
  return raw
    .split(/\n[ \t　]*\n[ \t　]*\n+|\n[ \t　]*[-=—―━─_]{3,}[ \t　]*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map(parseReportBlock)
    .filter((row) => row.scenario || row.gm || row.players || row.date);
}
