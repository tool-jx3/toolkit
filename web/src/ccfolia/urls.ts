/**
 * CCFOLIA 與 Discord Streamkit 的網址：解析使用者貼上的文字、組出 OBS 瀏覽器來源要填的網址。
 *
 * 依據（外部事實，見 docs/refactor/specs/ 各 G4 規格的網址小節）：
 * - 房間：`https://ccfolia.com/rooms/{房間ID}`；聊天另開視窗：`…/rooms/{房間ID}/chat`；
 *   角色狀態頁：`…/rooms/{房間ID}/characters/{角色ID}`。ID 由英數、`_`、`-` 組成。
 * - Streamkit 語音小工具：`https://streamkit.discord.com/overlay/voice/{伺服器ID}/{頻道ID}?…`。
 */

export const CCFOLIA_ORIGIN = 'https://ccfolia.com';

/** 可以當成 ID 的字元（英數、底線、連字號） */
const ID_CHARS = 'A-Za-z0-9_-';
const WHOLE_ID = new RegExp(`^[${ID_CHARS}]{4,}$`);

function idAfter(text: string, segment: string): string | null {
  const m = new RegExp(`${segment}/([${ID_CHARS}]+)`).exec(text);
  return m ? m[1] : null;
}

/**
 * 房間 ID：文字中「rooms/」後面的那一段；或整段文字（去掉前後空白）就是 4 個字元以上的 ID。
 * 解析不到時回傳 null（不丟錯誤）。
 *
 * parseRoomId('https://ccfolia.com/rooms/Zz99/chat?x=1') → 'Zz99'；parseRoomId('abc') → null
 */
export function parseRoomId(text: string | null | undefined): string | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  return idAfter(s, 'rooms') ?? (WHOLE_ID.test(s) ? s : null);
}

/** 角色 ID：文字中「characters/」後面的那一段；或整段是 4 個字元以上的 ID */
export function parseCharacterId(text: string | null | undefined): string | null {
  const s = String(text ?? '').trim();
  if (!s) return null;
  return idAfter(s, 'characters') ?? (WHOLE_ID.test(s) ? s : null);
}

export interface CharacterRef {
  roomId: string | null;
  characterId: string | null;
}

/**
 * 角色欄＋房間網址欄 → 房間 ID 與角色 ID。
 * 角色欄若貼的是含房間的完整網址，以其中的房間為準；否則用房間網址欄的。
 */
export function resolveCharacterRef(characterField: string, roomField: string): CharacterRef {
  const c = String(characterField ?? '').trim();
  const roomInChar = idAfter(c, 'rooms');
  return {
    roomId: roomInChar ?? parseRoomId(roomField),
    characterId: parseCharacterId(c),
  };
}

/** 房間畫面：`https://ccfolia.com/rooms/{房間ID}`（訊息框產生器用；不加 /chat、不帶查詢參數） */
export function roomUrl(roomId: string): string {
  return `${CCFOLIA_ORIGIN}/rooms/${roomId}`;
}

/** 聊天另開視窗：`https://ccfolia.com/rooms/{房間ID}/chat`（聊天視窗產生器用） */
export function chatUrl(roomId: string): string {
  return `${roomUrl(roomId)}/chat`;
}

/** 角色狀態頁：`https://ccfolia.com/rooms/{房間ID}/characters/{角色ID}`（狀態條產生器用） */
export function characterUrl(roomId: string, characterId: string): string {
  return `${roomUrl(roomId)}/characters/${characterId}`;
}

/** 從使用者輸入直接得到房間網址；解析不到時 null */
export const roomUrlFrom = (text: string): string | null => {
  const id = parseRoomId(text);
  return id ? roomUrl(id) : null;
};

/** 從使用者輸入直接得到聊天頁網址；解析不到時 null */
export const chatUrlFrom = (text: string): string | null => {
  const id = parseRoomId(text);
  return id ? chatUrl(id) : null;
};

/** 角色欄＋房間欄 → 角色狀態頁網址；缺任一個時 null */
export function characterUrlFrom(characterField: string, roomField: string): string | null {
  const { roomId, characterId } = resolveCharacterRef(characterField, roomField);
  return roomId && characterId ? characterUrl(roomId, characterId) : null;
}

/** 範例網址（還沒填房間時寫進 CSS 開頭說明）。佔位文字可自訂，例如 '{房間ID}'、'<房間ID>' */
export const EXAMPLE_IDS = { room: '{房間ID}', character: '{角色ID}' } as const;

export function exampleRoomUrl(room: string = EXAMPLE_IDS.room): string {
  return roomUrl(room);
}
export function exampleChatUrl(room: string = EXAMPLE_IDS.room): string {
  return chatUrl(room);
}
export function exampleCharacterUrl(
  room: string = EXAMPLE_IDS.room,
  character: string = EXAMPLE_IDS.character,
): string {
  return characterUrl(room, character);
}

/** 登入用：暫時把來源網址換成這個，在 OBS「互動」視窗登入後再換回來 */
export const CCFOLIA_LOGIN_URL = `${CCFOLIA_ORIGIN}/`;

/* ---------- Discord／Streamkit ---------- */

/** Discord Streamkit Overlay 網站（在這裡選 Install for OBS → Voice Widget 產生網址） */
export const STREAMKIT_OVERLAY_URL = 'https://streamkit.discord.com/overlay';

/** 語音小工具網址的常見參數（以 Streamkit 網站實際產生的為準；觀察日期 2026-09） */
export const STREAMKIT_VOICE_PARAMS = [
  'icon',
  'online',
  'logo',
  'text_color',
  'text_size',
  'text_outline_color',
  'text_outline_size',
  'text_shadow_color',
  'text_shadow_size',
  'bg_color',
  'bg_opacity',
  'bg_shadow_color',
  'bg_shadow_size',
  'invite_code',
  'limit_speaking',
  'small_avatars',
  'hide_names',
  'fade_chat',
] as const;

export interface StreamkitVoiceUrl {
  guildId: string;
  channelId: string;
  params: Record<string, string>;
}

/** 解析語音小工具網址；不是語音小工具的網址時 null */
export function parseStreamkitVoiceUrl(text: string): StreamkitVoiceUrl | null {
  let u: URL;
  try {
    u = new URL(String(text ?? '').trim());
  } catch {
    return null;
  }
  if (u.hostname !== 'streamkit.discord.com') return null;
  const m = /^\/overlay\/voice\/(\d+)\/(\d+)\/?$/.exec(u.pathname);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2], params: Object.fromEntries(u.searchParams) };
}

/** 組出語音小工具網址 */
export function streamkitVoiceUrl(
  guildId: string,
  channelId: string,
  params: Record<string, string | number | boolean> = {},
): string {
  const q = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string]),
  ).toString();
  return `${STREAMKIT_OVERLAY_URL}/voice/${guildId}/${channelId}${q ? `?${q}` : ''}`;
}

/**
 * Discord 使用者 ID：去掉所有非數字字元（例：「 1234-5678abc9012345678 」→「123456789012345678」）。
 * 去完是空的時回傳 null。正常的 ID 是 17～20 位數字（工具不檢查位數）。
 */
export function parseDiscordUserId(text: string | null | undefined): string | null {
  const digits = String(text ?? '').replace(/\D+/g, '');
  return digits || null;
}

/** 這個使用者的 Discord 頭像網址前綴（`…/avatars/{ID}/{雜湊}.png`）；預設頭像不含 ID */
export const DISCORD_CDN = 'https://cdn.discordapp.com';
export const discordAvatarUrl = (userId: string, hash: string, size = 128): string =>
  `${DISCORD_CDN}/avatars/${userId}/${hash}.png?size=${size}`;
/** 沒有自訂頭像的人用的預設頭像（0～5）；網址不含使用者 ID，無法辨認是誰 */
export const discordDefaultAvatarUrl = (index: number): string =>
  `${DISCORD_CDN}/embed/avatars/${((Math.trunc(index) % 6) + 6) % 6}.png`;

/**
 * 圖片網址在 Streamkit 頁面上能不能直接顯示（Streamkit 的內容安全政策；舊版工具的判斷，觀察日期 2026-09）：
 * - data：一定可以（嵌入）。
 * - direct：discordapp.com、discord.com、discordapp.net、imgur.com（含子網域）且不是會過期的連結。
 * - expiring：Discord 附件連結（cdn.discordapp.com/attachments/、/ephemeral-attachments/、media.discordapp.net/），
 *   自 2023 年起帶簽章參數，約 24 小時後失效。
 * - other：其他主機（可能被擋，未實測）。
 * valid：是不是 http(s) 網址或 data URI（格式不對時工具要在欄位旁提示）。
 */
export type ImageUrlKind = 'data' | 'direct' | 'expiring' | 'other';

export const STREAMKIT_DIRECT_HOSTS = [
  'discordapp.com',
  'discord.com',
  'discordapp.net',
  'imgur.com',
] as const;

export function classifyImageUrl(text: string): { kind: ImageUrlKind; valid: boolean } {
  const s = String(text ?? '').trim();
  if (/^data:/i.test(s)) return { kind: 'data', valid: true };
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { kind: 'other', valid: false };
  }
  const valid = u.protocol === 'https:' || u.protocol === 'http:';
  if (!valid) return { kind: 'other', valid: false };
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const expiring =
    (host === 'cdn.discordapp.com' &&
      (path.startsWith('/attachments/') || path.startsWith('/ephemeral-attachments/'))) ||
    host === 'media.discordapp.net';
  if (expiring) return { kind: 'expiring', valid };
  const direct = STREAMKIT_DIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return { kind: direct ? 'direct' : 'other', valid };
}
