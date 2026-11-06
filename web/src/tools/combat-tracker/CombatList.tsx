/** 參戰者清單：依目前的順序，可拖曳（鎖定順序時不行）；目前輪到的那一列用強調色的框 */
import { historyGesture } from '@/core/storage';
import { SortableList } from '@/ui';
import { type Combatant, currentId, moveCombatant } from './model';
import { Row } from './Row';
import { useCombat } from './store';
import { S } from './strings';

const gesture = historyGesture(useCombat);

export function CombatList() {
  const list = useCombat((s) => s.data.list);
  const settings = useCombat((s) => s.data.settings);
  const cur = useCombat((s) => currentId(s.data));
  return (
    <SortableList<Combatant>
      aria-label={S.list.label}
      items={list}
      getId={(c) => c.id}
      selectedId={cur}
      handleOnly
      sortDisabled={settings.lockOrder}
      onMove={(from, to) => useCombat.getState().update((d) => moveCombatant(d, from, to))}
      onMoveStart={gesture.begin}
      onMoveEnd={gesture.commit}
      empty={S.list.empty}
      renderItem={(c) => (
        <Row c={c} settings={settings} current={c.id === cur} locked={settings.lockOrder} />
      )}
    />
  );
}
