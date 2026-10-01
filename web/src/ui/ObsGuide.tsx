/**
 * 共用的「在 OBS 裡設定瀏覽器來源」說明區塊（G4 工具共用）。文字是本專案自己寫的，內容依各規格的 OBS 事實：
 * 新增瀏覽器來源、網址、寬高、清空自訂 CSS 再貼上、登入（用「互動」）、透過 OBS 控制音訊、OBS 31 以上、
 * 瀏覽器來源不能複製、電腦字型的注意事項。
 */
import type { ReactNode } from 'react';
import { CCFOLIA_LOGIN_URL, OBS } from '@/ccfolia';
import { cn } from './cn';

export interface ObsGuideProps {
  /** 標題（預設「在 OBS 裡設定」） */
  title?: ReactNode;
  /** 要填的網址是什麼（例：「角色狀態頁的網址」） */
  urlLabel: ReactNode;
  /** 實際的網址（有的話一起列出） */
  url?: string | null;
  /** 來源大小（寬高，或一段說明） */
  size?: { width: number; height: number } | ReactNode;
  /**
   * 登入方式：interact＝在來源上按右鍵「互動」直接登入；
   * swap-url＝先把網址暫時換成 https://ccfolia.com/ 再用「互動」登入，登入後換回來；
   * none＝不需要登入（例如 Discord Streamkit）。
   */
  login?: 'interact' | 'swap-url' | 'none';
  /** swap-url 時提醒「在互動視窗裡只登入、不要進入房間」（聊天頁用） */
  loginOnly?: boolean;
  /** 提醒開「透過 OBS 控制音訊」並靜音（房間畫面會播 BGM 與音效） */
  audio?: boolean;
  /** 需要 OBS 某版本以上的功能（例：{ version: 31, features: ['危急演出', '裂痕'] }） */
  obs?: { version?: number; features?: readonly string[] } | null;
  /** 提醒瀏覽器來源不能複製（每個角色／每組各新增一個） */
  multipleSources?: boolean;
  /** 有用到電腦字型時列出（提醒安裝）；true 只顯示一般提醒 */
  localFonts?: readonly string[] | boolean;
  /** 額外的步驟（接在貼上 CSS 之後） */
  extraSteps?: readonly ReactNode[];
  /** 免責聲明；false 不顯示（預設 CCFOLIA 的版本） */
  disclaimer?: ReactNode | false;
  children?: ReactNode;
  className?: string;
}

function isSize(v: unknown): v is { width: number; height: number } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { width?: unknown }).width === 'number' &&
    typeof (v as { height?: unknown }).height === 'number'
  );
}

const DEFAULT_DISCLAIMER = '本工具與 CCFOLIA 官方無關；CCFOLIA 改版時可能需要重新產生 CSS。';

export function ObsGuide({
  title = '在 OBS 裡設定',
  urlLabel,
  url,
  size,
  login = 'interact',
  loginOnly,
  audio,
  obs,
  multipleSources,
  localFonts,
  extraSteps = [],
  disclaimer = DEFAULT_DISCLAIMER,
  children,
  className,
}: ObsGuideProps) {
  const sizeText = isSize(size)
    ? `寬 ${Math.round(size.width)} × 高 ${Math.round(size.height)}`
    : (size as ReactNode);
  const fonts = Array.isArray(localFonts) ? localFonts : [];
  return (
    <section
      className={cn('flex flex-col gap-2 text-sm', className)}
      aria-label={typeof title === 'string' ? title : 'OBS 設定說明'}
    >
      {title ? <h3 className="m-0 text-sm font-semibold text-fg">{title}</h3> : null}
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-fg">
        <li>在 OBS 的「來源」按「＋」，選「瀏覽器」新增一個瀏覽器來源。</li>
        <li>
          「網址」填{urlLabel}
          {url ? (
            <>
              ：<code className="font-mono text-xs break-all">{url}</code>
            </>
          ) : null}
          。
        </li>
        {sizeText ? <li>「寬度」與「高度」填 {sizeText}。</li> : null}
        <li>把「自訂 CSS」欄原有的內容整段刪掉，再貼上這裡複製的 CSS，按「確定」。</li>
        {extraSteps.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 步驟是固定順序的說明
          <li key={i}>{s}</li>
        ))}
      </ol>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted">
        {login === 'interact' ? (
          <li>
            畫面一片空白時：在來源上按右鍵選「互動」，在跳出的視窗裡登入 CCFOLIA
            並進入房間（之後會記住）。
          </li>
        ) : null}
        {login === 'swap-url' ? (
          <li>
            第一次使用或畫面空白時：先把來源網址暫時改成{' '}
            <code className="font-mono text-xs">{CCFOLIA_LOGIN_URL}</code>，
            在來源上按右鍵選「互動」登入，再把網址改回來（登入狀態所有瀏覽器來源共用）。
            {loginOnly
              ? '在互動視窗裡只要登入，不要進入房間；不小心進了房間時，把網址改成上面的首頁再改回來即可。'
              : null}
          </li>
        ) : null}
        {audio ? (
          <li>
            勾選「透過 OBS 控制音訊」，並在混音器把這個來源靜音，否則房間的 BGM
            與骰子音效會重複播放。
          </li>
        ) : null}
        {obs ? (
          <li>
            {obs.features?.length ? `${obs.features.join('、')}需要` : '部分效果需要'} OBS{' '}
            {obs.version ?? OBS.minVersionForHas} 以上；較舊的 OBS
            只是這些效果不會動，其他照常顯示。
          </li>
        ) : null}
        {multipleSources ? (
          <li>
            瀏覽器來源不能「貼上（複製）」，「貼上（參照）」會共用同一個來源；需要第二個時請再新增一個瀏覽器來源。
            位置與大小可以用右鍵的「複製變換」→「貼上變換」對齊。
          </li>
        ) : null}
        {localFonts ? (
          <li>
            {fonts.length ? `用到電腦字型（${fonts.join('、')}）：` : '使用電腦字型時：'}跑 OBS
            的電腦也要安裝同一套字型；字型沒有漢字時，漢字會退回一般黑體。
          </li>
        ) : null}
      </ul>
      {children}
      {disclaimer ? <p className="m-0 text-xs text-muted">{disclaimer}</p> : null}
    </section>
  );
}
