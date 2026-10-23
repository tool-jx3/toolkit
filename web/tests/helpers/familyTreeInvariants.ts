/**
 * 家系圖資料的不變式（規格第 5 節「指到不存在的人要清掉」）：每一次操作之後，資料裡的 id 參照都要指到存在的人。
 * 回傳違反的項目（空陣列＝沒問題）。單元測試的隨機操作與 e2e 都用。
 */
import { isMember, isSpouse, type People } from '@/tools/family-tree/model/types';

export function refProblems(people: People): string[] {
  const out: string[] = [];
  for (const [key, p] of Object.entries(people)) {
    if (p.id !== key) out.push(`${key}: id ${p.id} 和鍵不同`);
    if (!Number.isFinite(p.order)) out.push(`${key}: order 不是數字`);
    if (isMember(p)) {
      if (p.fatherId && !people[p.fatherId]) out.push(`${key}: fatherId ${p.fatherId} 不存在`);
      if (p.motherId && !people[p.motherId]) out.push(`${key}: motherId ${p.motherId} 不存在`);
      if (p.fatherId === p.id) out.push(`${key}: 父親是自己`);
      if (p.motherId === p.id) out.push(`${key}: 母親是自己`);
      if (p.adopt?.fatherId) {
        const a = people[p.adopt.fatherId];
        if (!isMember(a)) out.push(`${key}: adopt.fatherId ${p.adopt.fatherId} 不存在或不是成員`);
        if (p.adopt.fatherId === p.id) out.push(`${key}: 繼父是自己`);
      }
    } else if (isSpouse(p)) {
      if (!isMember(people[p.spouseOf]))
        out.push(`${key}: spouseOf ${p.spouseOf} 不存在或不是成員`);
      if (p.link) {
        if (!isMember(people[p.link.personId]))
          out.push(`${key}: link.personId ${p.link.personId} 不存在或不是成員`);
        if (p.link.pairId) {
          if (!isSpouse(people[p.link.pairId]))
            out.push(`${key}: link.pairId ${p.link.pairId} 不存在或不是配偶`);
          if (p.link.pairId === p.id) out.push(`${key}: pairId 是自己`);
        }
      }
    }
  }
  return out;
}
