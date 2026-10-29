/**
 * 元件展示頁「模組」分頁：core/names（NPC 的姓名）的示範——地區、年代、性別、種子，
 * 依人數加權抽 6 個不重複的姓名（npc-names 引入時新增；資料用到才載入）。
 */
import { useEffect, useState } from 'react';
import {
  type GeneratedName,
  generateNames,
  loadNameData,
  NAME_GENDER_LABELS,
  NAME_REGIONS,
  type NameGenderChoice,
  type NameRegion,
  nameReadings,
  regionInfo,
} from '@/core/names';
import { Field, Section, Segmented, TextInput } from '@/ui';

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
