/** 把設定欄的某一區捲進畫面（已經看得到時不動）；id 是包住 Section 的元素 */
export function revealSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < 56 || r.top > window.innerHeight - 80)
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
