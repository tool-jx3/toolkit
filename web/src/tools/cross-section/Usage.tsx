/**
 * 頁首「說明」的使用方式（本站自己寫的說明；文字在 strings.ts）。
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
