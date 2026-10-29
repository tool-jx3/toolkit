/**
 * 元件展示頁「模組」分頁：core/names（NPC 的姓名）的示範——地區、年代、性別、種子，
 * 依人數加權抽 6 個不重複的姓名（npc-names 引入時新增；資料用到才載入）。
 * 另有 core/names/corpus（弄墨 Inknomu 的考據語料，2026-10）的示範：包、輸出、種子 → 6 個附涵義的姓名。
 */
import { useEffect, useState } from 'react';
import {
  type GeneratedName,
  generateNames,
  loadNameData,
  NAME_GENDER_LABELS,
  NAME_REGIONS,
  type NameGenderChoice,
  type NamePart,
  type NameRegion,
  nameReadings,
  regionInfo,
} from '@/core/names';
import {
  CORPUS_PACKS,
  CORPUS_REGIONS,
  type CorpusName,
  corpusPack,
  corpusPackInfo,
  corpusPackLabel,
  generateCorpusNames,
  loadCorpus,
} from '@/core/names/corpus';
import { Field, Section, Segmented, Select, TextInput } from '@/ui';

const GENDERS = (['male', 'female', 'any'] as const).map((g) => ({
  value: g,
  label: NAME_GENDER_LABELS[g],
}));

export function NamesDemo() {
  const [region, setRegion] = useState<NameRegion>('jp');
  const [era, setEra] = useState('modern');
  const [gender, setGender] = useState<NameGenderChoice>('any');
  const [seed, setSeed] = useState('展示頁');
  const [names, setNames] = useState<GeneratedName[]>([]);
  const info = regionInfo(region);
  const eraId = info.eras.some((e) => e.id === era) ? era : info.eras[0].id;

  useEffect(() => {
    let live = true;
    void loadNameData(region).then((data) => {
      if (live) setNames(generateNames(data, { count: 6, era: eraId, gender, seed }).names);
    });
    return () => {
      live = false;
    };
  }, [region, eraId, gender, seed]);

  return (
    <Section title="NPC 的姓名（core/names）">
      <Field label="地區">
        <Segmented<NameRegion>
          value={region}
          onValueChange={setRegion}
          options={NAME_REGIONS.map((r) => ({ value: r.id, label: r.label }))}
        />
      </Field>
      <Field label="年代" hint={info.eras.find((e) => e.id === eraId)?.hint}>
        <Segmented<string>
          value={eraId}
          onValueChange={setEra}
          options={info.eras.map((e) => ({ value: e.id, label: e.label }))}
        />
      </Field>
      <Field label="性別">
        <Segmented<NameGenderChoice> value={gender} onValueChange={setGender} options={GENDERS} />
      </Field>
      <Field label="種子" hint="同樣的種子與條件，抽出同樣的 6 個。">
        <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
      </Field>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" data-testid="names-demo">
        {names.map((n) => (
          <li key={n.text} className="rounded-md bg-surface-2 px-2 py-1">
            <span className="block text-lg">{n.text}</span>
            <span className="block text-xs text-muted">
              {nameReadings(n)?.romaji ?? NAME_GENDER_LABELS[n.gender]}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const PACK_OPTIONS = CORPUS_REGIONS.map((r) => ({
  label: r.label,
  options: CORPUS_PACKS.filter((p) => p.region === r.id).map((p) => ({
    value: p.id,
    label: corpusPackLabel(p),
  })),
}));
const PARTS = (['full', 'given', 'family'] as const).map((v) => ({
  value: v,
  label: { full: '全名', given: '只有名', family: '只有姓' }[v],
}));

/** 考據語料：平均抽 6 個，附涵義（core/names/corpus） */
export function CorpusDemo() {
  const [pack, setPack] = useState('uk-regency');
  const [part, setPart] = useState<NamePart>('full');
  const [seed, setSeed] = useState('展示頁');
  const [names, setNames] = useState<CorpusName[]>([]);
  useEffect(() => {
    const info = corpusPackInfo(pack);
    if (!info) return;
    let live = true;
    void loadCorpus(info.region).then((data) => {
      const p = corpusPack(data, pack);
      if (live && p) setNames(generateCorpusNames(p, { count: 6, part, seed }).names);
    });
    return () => {
      live = false;
    };
  }, [pack, part, seed]);
  return (
    <Section title="考據語料（core/names/corpus）">
      <Field label="包">
        <Select value={pack} onValueChange={setPack} options={PACK_OPTIONS} />
      </Field>
      <Field label="輸出">
        <Segmented<NamePart> value={part} onValueChange={setPart} options={PARTS} />
      </Field>
      <Field label="種子" hint="同樣的種子、包與輸出，抽出同樣的 6 個（平均抽，附涵義）。">
        <TextInput value={seed} onChange={(e) => setSeed(e.target.value)} />
      </Field>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0" data-testid="corpus-demo">
        {names.map((n) => (
          <li key={n.text} className="rounded-md bg-surface-2 px-2 py-1">
            <span className="block text-lg">{n.text}</span>
            {n.original ? <span className="block text-xs text-muted">{n.original}</span> : null}
            {n.meanings.map((m) => (
              <span key={m} className="block text-xs text-fg">
                {m}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </Section>
  );
}
