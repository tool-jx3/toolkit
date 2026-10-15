/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 頁首「說明」的使用方式（改寫自原作的說明，只講第一批有的功能；文字在 strings.ts）。
 */
import { S } from './strings';

export function Usage() {
  return (
    <>
      <ol>
        {S.usage.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p>{S.usage.note}</p>
    </>
  );
}
