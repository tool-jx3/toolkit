/**
 * 公民 ID 的機讀區（MRZ）：照 ICAO 9303 第 6 部的 TD2 格式（兩行、每行 36 個字元）由欄位產生，含檢查碼。
 * （原作 sinforge-ui 的機讀區只把欄位接起來、沒有檢查碼；本站照真的格式做，D24。）
 *
 * 第一行：證件代碼「ID」＋發行地代碼（3）＋姓名（31：`姓<<名`，空白與連字號換成 `<`，其他不是英文字母的字拿掉）。
 * 第二行：證件號碼（9）＋檢查碼＋國籍（3，同發行地）＋出生日期 YYMMDD＋檢查碼＋性別（M／F／<）＋到期日 YYMMDD＋檢查碼
 *        ＋選用欄（7）＋總檢查碼（第 1～10、14～20、22～35 個字元）。
 * 證件號碼超過 9 碼時（TD2 的長號碼）：前 9 碼放號碼欄、檢查碼的位置放 `<`，其餘的碼與整個號碼的檢查碼放進選用欄。
 */

/** 只留 A～Z、0～9（重音字母去掉重音、小寫轉大寫），其他字換成 fill（undefined＝拿掉） */
function mrzChars(s: string, fill: '<' | undefined): string {
  const up = String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
  let out = '';
  for (const ch of up) {
    if (/[A-Z0-9]/.test(ch)) out += ch;
    else if (fill) out += fill;
  }
  return out;
}

const pad = (s: string, n: number): string => s.padEnd(n, '<').slice(0, n);

/** 一個字元的值：0～9＝0～9、A～Z＝10～35、`<`＝0 */
function charValue(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  return 0;
}

/** ICAO 9303 的檢查碼（權重 7、3、1 循環，加總除以 10 的餘數） */
export function checkDigit(s: string): string {
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += charValue(s[i]) * w[i % 3];
  return String(sum % 10);
}

/** 日期文字 → YYMMDD（YYYY-MM-DD、YYYY.MM.DD、YYYY/MM/DD、YYYYMMDD；看不懂＝`<<<<<<`） */
export function mrzDate(text: string): string {
  const m = /^\s*(\d{4})[-./ ]?(\d{1,2})[-./ ]?(\d{1,2})\s*$/.exec(String(text ?? ''));
  if (!m) return '<<<<<<';
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '<<<<<<';
  return `${m[1].slice(2)}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

/** 性別：M／F（男／女也認），其他＝`<` */
export function mrzSex(text: string): string {
  const c =
    [
      ...String(text ?? '')
        .trim()
        .toUpperCase(),
    ][0] ?? '';
  if (c === 'M' || c === '男') return 'M';
  if (c === 'F' || c === '女') return 'F';
  if (c === 'X') return 'X';
  return '<';
}

/** 姓名欄：姓<<名（31 個字元） */
export function mrzName(surname: string, given: string, len = 31): string {
  const part = (s: string) =>
    String(s ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[\s\-‐-―']+/g, '<')
      .replace(/[^A-Z<]/g, '')
      .replace(/<+/g, '<')
      .replace(/^<|<$/g, '');
  const sur = part(surname);
  const giv = part(given);
  return pad(giv ? `${sur}<<${giv}` : sur, len);
}

export interface MrzInput {
  /** 發行地代碼（3 個英文字母；同時當國籍） */
  state: string;
  number: string;
  surname: string;
  given: string;
  sex: string;
  dob: string;
  expires: string;
}

/** TD2 的兩行 */
export function buildMrz(f: MrzInput): [string, string] {
  const state = pad(mrzChars(f.state, undefined).replace(/[0-9]/g, ''), 3);
  const line1 = pad(`ID${state}${mrzName(f.surname, f.given)}`, 36);
  const num = mrzChars(f.number, undefined);
  let numField: string;
  let numCheck: string;
  let optional: string;
  if (num.length <= 9) {
    numField = pad(num, 9);
    numCheck = checkDigit(numField);
    optional = pad('', 7);
  } else {
    numField = num.slice(0, 9);
    numCheck = '<';
    optional = pad(`${num.slice(9, 15)}${checkDigit(num.slice(0, 15))}`, 7);
  }
  const dob = mrzDate(f.dob);
  const exp = mrzDate(f.expires);
  const head = `${numField}${numCheck}${state}${dob}${checkDigit(dob)}${mrzSex(f.sex)}${exp}${checkDigit(exp)}${optional}`;
  const composite = checkDigit(head.slice(0, 10) + head.slice(13, 20) + head.slice(21, 35));
  return [line1, `${head}${composite}`];
}
