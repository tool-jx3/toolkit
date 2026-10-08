/**
 * 使用方式（頁首「說明」與設定欄最下面的「使用方式」區塊共用；規格 F91）。
 */
import { USAGE } from './strings';

export function Usage() {
  return (
    <>
      <p>{USAGE.intro}</p>
      <ol className="mt-2">
        {USAGE.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {USAGE.sections.map((sec) => (
        <div key={sec.title}>
          <p className="mt-3 font-semibold">{sec.title}</p>
          <ul>
            {sec.items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-3 font-semibold">{USAGE.namingTitle}</p>
      <p>{USAGE.namingIntro}</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {USAGE.namingHead.map((h) => (
                <th key={h} className="border-b border-border px-1.5 py-1 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {USAGE.naming.map(([name, alias, part]) => (
              <tr key={name}>
                <td className="border-b border-border px-1.5 py-1 font-mono">{name}</td>
                <td className="border-b border-border px-1.5 py-1">{alias}</td>
                <td className="border-b border-border px-1.5 py-1">{part}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
