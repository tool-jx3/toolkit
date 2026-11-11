/**
 * 推理劇本的範例（規格 F130）：本站自己寫的「山茶花莊的停電之夜」（一個晚上、五個人物、一個地點），
 * 人名、地名、事件全部原創。示範這一批的功能：偽裝的證詞與真相（時間、地點和證詞不同）、伏字、完全保密、
 * 調查後公開、GM 專用的線、被害者的退場時刻、時刻的標示（18:00 起的一晚）、背景的停電。
 */
import { emptyCalendar } from './calendar';
import { defaultSession } from './session';
import { newEvent, type TimelineDoc, type TimelineEvent } from './types';

const t = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h >= 24
    ? `第 2 天 ${String(h - 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    : `第 1 天 ${hhmm}`;
};

export function mysteryDoc(): TimelineDoc {
  const ev = (p: Partial<TimelineEvent>): TimelineEvent => newEvent({ title: '', ...p });
  return {
    title: '山茶花莊的停電之夜',
    mode: 'day',
    era: '',
    dayOne: '',
    sample: false,
    showNow: false,
    session: defaultSession('clock'),
    lanes: [
      {
        id: 'mx-lin',
        name: '莊主 林宏遠',
        kind: 'npc',
        color: '#6b7280',
        parentId: '',
        gm: false,
        exit: { time: t('21:15'), label: '死亡' },
      },
      {
        id: 'mx-ye',
        name: '醫師 葉承恩',
        kind: 'character',
        color: '#e0565b',
        parentId: '',
        gm: false,
      },
      {
        id: 'mx-zhou',
        name: '秘書 周雅婷',
        kind: 'character',
        color: '#4f7cff',
        parentId: '',
        gm: false,
      },
      {
        id: 'mx-shen',
        name: '畫家 沈墨',
        kind: 'character',
        color: '#2fa37a',
        parentId: '',
        gm: false,
      },
      { id: 'mx-chen', name: '管家 老陳', kind: 'npc', color: '#d9902f', parentId: '', gm: false },
      { id: 'mx-study', name: '書房', kind: 'place', color: '#8a63d2', parentId: '', gm: false },
    ],
    categories: [{ id: 'mx-clue', name: '線索', color: '#2b9fc2' }],
    events: [
      ev({
        id: 'mx-dinner',
        title: '晚宴',
        kind: 'background',
        start: t('18:30'),
        end: t('20:00'),
        place: '餐廳',
        description: '莊主宣布下個月要重寫遺囑，席間氣氛僵硬。',
      }),
      ev({
        id: 'mx-blackout',
        title: '停電',
        kind: 'background',
        start: t('21:00'),
        end: t('21:20'),
        description: '整棟山莊停電二十分鐘。',
      }),
      ev({
        id: 'mx-lin-papers',
        title: '回書房處理文件',
        kind: 'range',
        start: t('20:10'),
        end: t('21:00'),
        laneId: 'mx-lin',
        place: '書房',
      }),
      ev({
        id: 'mx-lin-dark',
        title: '在書房喝茶',
        kind: 'range',
        start: t('21:00'),
        end: t('21:15'),
        laneId: 'mx-lin',
        place: '書房',
        scope: 'redacted',
        truth: { title: '喝下被下了藥的茶，倒在書桌旁', start: '', end: '', place: '書房' },
      }),
      ev({
        id: 'mx-ye-room',
        title: '在二樓客房看書，沒有離開房間',
        kind: 'range',
        start: t('20:30'),
        end: t('22:00'),
        laneId: 'mx-ye',
        place: '二樓客房',
        scope: 'alibi',
        truth: {
          title: '趁停電從後樓梯進書房，在莊主的茶裡下藥',
          start: t('21:00'),
          end: t('21:10'),
          place: '書房',
        },
        gmNote: '客房的窗戶看得到溫室：要是有人在溫室，就可能看見後樓梯的手電筒光。',
      }),
      ev({
        id: 'mx-ye-call',
        title: '聽到管家呼救，趕到書房急救',
        start: t('22:05'),
        laneId: 'mx-ye',
        place: '書房',
      }),
      ev({
        id: 'mx-zhou-office',
        title: '在一樓辦公室整理帳本',
        kind: 'range',
        start: t('20:00'),
        end: t('21:00'),
        laneId: 'mx-zhou',
        place: '一樓辦公室',
      }),
      ev({
        id: 'mx-zhou-dark',
        title: '停電時待在辦公室等電來',
        kind: 'range',
        start: t('21:00'),
        end: t('21:20'),
        laneId: 'mx-zhou',
        place: '一樓辦公室',
        scope: 'alibi',
        revealed: true,
        truth: {
          title: '摸黑到書房門外偷聽莊主講電話，聽到「遺囑」兩個字就離開',
          start: t('21:02'),
          end: t('21:06'),
          place: '書房外的走廊',
        },
      }),
      ev({
        id: 'mx-shen-sketch',
        title: '在溫室寫生',
        kind: 'range',
        start: t('20:00'),
        end: t('21:30'),
        laneId: 'mx-shen',
        place: '溫室',
      }),
      ev({
        id: 'mx-shen-light',
        title: '看見後樓梯有手電筒的光',
        start: t('21:05'),
        laneId: 'mx-shen',
        place: '溫室',
        categoryId: 'mx-clue',
        description: '光從二樓往一樓移動，大約一分鐘就不見了。',
      }),
      ev({
        id: 'mx-chen-fuse',
        title: '去地下室換保險絲',
        kind: 'range',
        start: t('21:00'),
        end: t('21:20'),
        laneId: 'mx-chen',
        place: '地下室',
      }),
      ev({
        id: 'mx-chen-key',
        title: '把書房的備用鑰匙藏進玄關的花瓶',
        start: t('21:30'),
        laneId: 'mx-chen',
        place: '玄關',
        gm: true,
        gmNote: '管家早就知道遺囑的事，怕被懷疑才把鑰匙藏起來；和命案無關（紅鯡魚）。',
      }),
      ev({
        id: 'mx-chen-found',
        title: '送宵夜到書房，發現莊主倒在地上',
        start: t('22:00'),
        laneId: 'mx-chen',
        place: '書房',
      }),
      ev({
        id: 'mx-study-cup',
        title: '書桌上留著半杯冷掉的茶',
        start: t('22:00'),
        laneId: 'mx-study',
        place: '書房',
        categoryId: 'mx-clue',
      }),
    ],
    markers: [
      { id: 'mx-police', label: '警察抵達', time: t('23:30'), color: '#2b9fc2', gm: false },
    ],
    progress: { on: false, time: '', plOnly: false },
    calendar: emptyCalendar(),
    links: [
      {
        id: 'mx-k1',
        from: 'mx-ye-room',
        to: 'mx-lin-dark',
        kind: 'cause',
        note: '下藥',
        gm: true,
      },
      {
        id: 'mx-k2',
        from: 'mx-shen-light',
        to: 'mx-ye-room',
        kind: 'conflict',
        note: '有人在停電時走後樓梯',
        gm: true,
        revealed: true,
      },
      { id: 'mx-k3', from: 'mx-chen-found', to: 'mx-ye-call', kind: 'cause', note: '', gm: false },
    ],
  };
}
