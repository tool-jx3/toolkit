/**
 * 範本載入時預設「只有 GM 看得到」的房間（規格 F225、D37；原作 v1.12 的做法：員工區、機房、後台、私室…）。
 *
 * 對象是第一次走進去不該一眼就看到的地方；館內圖上會有的、一進門就看得到的房間，還有放了隱藏線索的房間
 * （PL 要逛的地方）不放。照範本的標記寫（範本 id → 樓層名稱 → 房間名稱），不照房間種類：
 * 同樣是「辦公」，警察局的所長室有線索、要讓 PL 逛，圖書館的館員辦公室才是員工區。
 * 標記的房間名稱在同一層必須只有一間（單元測試檢查）。載入後就是一般的 `gm: true`，使用者可以在屬性面板關掉。
 */
import type { TplFloor } from './builder';

export const GM_DEFAULT_ROOMS: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  /* 地下室的鍋爐室（機房）、傭人房（員工區） */
  mansion: { B1: ['鍋爐室'], '1F': ['傭人房'] },
  /* 餐廳後面的廚房（後台） */
  hotel: { '1F': ['廚房'] },
  /* 病房樓層的器材室（後台） */
  hospital: { '2F': ['器材室'] },
  /* 備勤室（員工區）、槍械室（警察才進得去） */
  police: { '1F': ['備勤室', '槍械室'] },
  /* 地下的機房與倉庫、館員辦公室（員工區） */
  library: { B1: ['機房', '倉庫'], '1F': ['館員辦公室'] },
  /* 廟公住的房間（私室） */
  temple: { '1F': ['廟公房'] },
  /* 舊書店的後倉（後台） */
  cult: { '1F': ['後倉'] },
  /* 廢棄醫院：鍋爐室、廢棄物間、器材室 */
  'abandoned-hospital': { B1: ['鍋爐室', '廢棄物間'], '2F': ['器材室'] },
};

/** 把標記的房間設成 gm: true（直接改傳進來的樓層） */
export function applyGmDefaults(id: string, floors: readonly TplFloor[]): void {
  const byFloor = GM_DEFAULT_ROOMS[id];
  if (!byFloor) return;
  for (const f of floors) {
    const names = byFloor[f.name];
    if (!names) continue;
    for (const r of f.rooms) if (names.includes(r.name)) r.gm = true;
  }
}
