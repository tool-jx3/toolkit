/**
 * 卡庫：每一張卡都列出來（卡組、種類、題材、氣氛、搜尋）；「放進新劇本」挑卡（每一欄一張），用放進去的卡開始一份劇本。
 */
import { Check, Play, Plus, Search, X } from 'lucide-react';
import { Button, cn, Select, TextInput, useToast } from '@/ui';
import { libraryFullMessage, startFromCatalog } from '../actions';
import {
  ANY,
  belongsToPc,
  CARD_CATS,
  type Card,
  type CardCat,
  cardNo,
  cardsOf,
  type Deck,
  type DeckId,
  findCard,
  getDeck,
} from '../data';
import { usePrefs } from '../store';
import { S } from '../strings';
import { DeckSwitch } from './Start';

function tagText(deck: Deck, card: Card): string {
  if (belongsToPc(card.cat)) return '';
  const m = card.missions ?? [];
  const t = card.tones ?? [];
  const ms =
    !m.length || m.includes(ANY)
      ? S.catalog.anyMission
      : m.map((x) => deck.missions.find((y) => y.id === x)?.name ?? x).join('、');
  const ts =
    !t.length || t.includes(ANY)
      ? S.catalog.anyTone
      : t.map((x) => deck.tones.find((y) => y.id === x)?.name ?? x).join('、');
  return `${ms}／${ts}`;
}

/** 合不合篩選的題材或氣氛：'all' 不限；卡沒標或標了「全部」也算合（PC 的卡沒有標） */
const fits = (list: readonly string[] | undefined, want: string) =>
  want === 'all' || !list?.length || list.includes(ANY) || list.includes(want);

/** 種類的名稱（焦點附上每種氣氛的叫法） */
function catLabel(deck: Deck, cat: CardCat): string {
  if (cat !== 'tone') return S.cats[cat];
  return `${S.cats.tone}（${deck.tones.map((t) => t.slot).join('・')}）`;
}

export function CatalogView() {
  const prefs = usePrefs((s) => s.data);
  const patch = usePrefs((s) => s.patch);
  const toast = useToast();
  const deck = getDeck(prefs.catalogDeck);
  const picks = prefs.catalogPicks;
  const q = prefs.catalogQuery.trim();
  const cats = prefs.catalogCat === 'all' ? CARD_CATS : [prefs.catalogCat];
  const mission = deck.missions.some((m) => m.id === prefs.catalogMission)
    ? prefs.catalogMission
    : 'all';
  const tone = deck.tones.some((t) => t.id === prefs.catalogTone) ? prefs.catalogTone : 'all';
  const cards = cats
    .flatMap((c) => cardsOf(deck, c))
    .filter((c) => fits(c.missions, mission) && fits(c.tones, tone));
  const shown = q
    ? cards.filter((c) => [c.title, c.text, c.question].some((t) => t.includes(q)))
    : cards;
  const picked = CARD_CATS.filter((c) => picks[c] && findCard(deck, picks[c]));
  const toggle = (card: Card) => {
    const next = { ...picks };
    if (next[card.cat] === card.id) delete next[card.cat];
    else next[card.cat] = card.id;
    patch({ catalogPicks: next });
  };
  const toneName = (card: Card) =>
    card.cat === 'tone' ? (deck.tones.find((t) => card.tones?.includes(t.id))?.slot ?? '') : '';
  return (
    <div className="flex flex-col gap-3 pb-24" data-testid="catalog">
      <header className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-bold text-fg">{S.catalog.title}</h2>
        <p className="m-0 text-sm text-muted">{S.catalog.lead}</p>
        <div className="self-start">
          <DeckSwitch
            value={prefs.catalogDeck}
            onChange={(d: DeckId) =>
              patch({ catalogDeck: d, catalogPicks: {}, catalogMission: 'all', catalogTone: 'all' })
            }
          />
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            aria-label={S.catalog.filter}
            data-testid="catalog-filter"
            value={prefs.catalogCat}
            onValueChange={(v) => patch({ catalogCat: v as CardCat | 'all' })}
            options={[
              { value: 'all', label: `${S.catalog.filter}：${S.catalog.all}` },
              ...CARD_CATS.map((c) => ({ value: c, label: catLabel(deck, c) })),
            ]}
          />
          <Select
            aria-label={S.catalog.missionFilter}
            data-testid="catalog-mission"
            value={mission}
            onValueChange={(v) => patch({ catalogMission: v })}
            options={[
              { value: 'all', label: `${S.catalog.missionFilter}：${S.catalog.anyFilter}` },
              ...deck.missions.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
          <Select
            aria-label={S.catalog.toneFilter}
            data-testid="catalog-tone"
            value={tone}
            onValueChange={(v) => patch({ catalogTone: v })}
            options={[
              { value: 'all', label: `${S.catalog.toneFilter}：${S.catalog.anyFilter}` },
              ...deck.tones.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <TextInput
              type="search"
              className="w-full min-w-0 pl-8"
              aria-label={S.catalog.search}
              placeholder={S.catalog.search}
              value={prefs.catalogQuery}
              onChange={(e) => patch({ catalogQuery: e.target.value })}
            />
          </div>
        </div>
        <p className="m-0 text-sm text-muted" data-testid="catalog-count" aria-live="polite">
          {S.catalog.count(shown.length, deck.cards.length)}
        </p>
      </header>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => {
          const on = picks[c.cat] === c.id;
          return (
            <li
              key={c.id}
              data-testid="catalog-card"
              data-card={c.id}
              className={cn(
                'flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-3',
                on ? 'border-accent' : 'border-border',
              )}
            >
              <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className="font-semibold text-accent">
                  {c.cat === 'tone' ? toneName(c) : S.cats[c.cat]}
                </span>
                <span className="tabular-nums">{S.card.no(cardNo(deck, c.id))}</span>
              </span>
              <strong className="text-sm text-fg">{c.title}</strong>
              <span className="text-xs leading-relaxed text-muted">{c.text}</span>
              <span className="text-xs text-fg">
                <span className="mr-1 font-semibold text-accent">{S.card.question}</span>
                {c.question}
              </span>
              {tagText(deck, c) ? (
                <span className="text-xs text-muted" title={S.catalog.tags}>
                  {tagText(deck, c)}
                </span>
              ) : null}
              <div className="mt-auto pt-1">
                {belongsToPc(c.cat) ? (
                  <span className="text-xs text-muted">{S.catalog.pcCard}</span>
                ) : (
                  <Button
                    size="sm"
                    variant={on ? 'primary' : 'secondary'}
                    icon={on ? <Check /> : <Plus />}
                    aria-pressed={on}
                    onClick={() => toggle(c)}
                  >
                    {on ? S.catalog.using : S.catalog.use}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {picked.length ? (
        <div
          data-testid="catalog-bar"
          className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface p-2 shadow-2"
        >
          <span className="text-sm font-semibold text-fg">{S.catalog.selected(picked.length)}</span>
          <ul className="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-1 p-0">
            {picked.map((cat) => {
              const card = findCard(deck, picks[cat]);
              if (!card) return null;
              return (
                <li
                  key={cat}
                  className="flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-0.5 pl-2 text-xs text-fg"
                >
                  <span className="text-muted">{S.cats[cat]}</span>
                  {card.title}
                  <button
                    type="button"
                    aria-label={S.catalog.remove(S.cats[cat])}
                    className="inline-flex size-5 items-center justify-center rounded-full hover:bg-surface-3 [&_svg]:size-3.5"
                    onClick={() => toggle(card)}
                  >
                    <X />
                  </button>
                </li>
              );
            })}
          </ul>
          <Button size="sm" variant="ghost" onClick={() => patch({ catalogPicks: {} })}>
            {S.catalog.clear}
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Play />}
            onClick={() => {
              const r = startFromCatalog(prefs.catalogDeck, picks);
              if (!r.ok) {
                toast({ title: libraryFullMessage(), tone: 'warning', replace: true });
                return;
              }
              patch({ catalogPicks: {}, view: 'make' });
              toast(
                r.droppedTone
                  ? { title: S.catalog.toneReplaced(r.droppedTone), tone: 'warning', replace: true }
                  : { title: S.catalog.started, tone: 'success', replace: true },
              );
            }}
          >
            {S.catalog.start(picked.length)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
