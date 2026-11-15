/**
 * 劇本骨架抽卡（plot-deck）的卡片資料：每一類的張數、id 與參照、題材 × 氣氛都抽得到、文字只有繁中。
 */
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/core/names';
import {
  ANY,
  belongsToPc,
  CARD_CATS,
  type CardCat,
  cardsOf,
  DECK_IDS,
  DECKS,
  findCard,
} from '@/tools/plot-deck/data';
import fantasySrc from '@/tools/plot-deck/data/fantasy.ts?raw';
import modernSrc from '@/tools/plot-deck/data/modern.ts?raw';
import { drawStory, themeWeight } from '@/tools/plot-deck/model/draw';
import { newScenario, STORY_KEYS } from '@/tools/plot-deck/model/scenario';
import stringsSrc from '@/tools/plot-deck/strings.ts?raw';

/** 每一類的張數（規格 D3） */
const COUNTS: Record<string, Record<CardCat, number>> = {
  modern: {
    core: 30,
    intro: 8,
    obstacle: 8,
    truth: 10,
    ending: 8,
    stage: 8,
    tone: 18,
    clue: 8,
    npc: 8,
    relation: 6,
    secret: 6,
  },
  fantasy: {
    core: 25,
    intro: 8,
    obstacle: 8,
    truth: 10,
    ending: 8,
    stage: 8,
    tone: 15,
    clue: 8,
    npc: 8,
    relation: 6,
    secret: 6,
  },
};

const KINDS: Record<string, readonly string[]> = {
  modern: ['crowded', 'enclosed', 'outskirts'],
  fantasy: ['road', 'settlement', 'depths', 'wilds'],
};

/** 日文的假名（平假名、片假名、半形片假名、片假名擴充）；中點「・」（U+30FB）台灣也用，不算 */
const KANA = /[\u3040-\u30fa\u30fc-\u30ff\u31f0-\u31ff\uff66-\uff9f]/u;
/**
 * 常見的簡體字與日本的新字體（台灣的繁中不用的寫法）。台灣照樣用的字（里、台、才、只、后、干、云、系…）不列。
 */
const NOT_TC =
  /[们这个为说时对会发经过还没现两点问题实际东区门车马鸟鱼龙风飞见观语读谁请让认识边远进运连选钱银铁错长开关间闻阳阴队陈张刘赵杨吴郑韩罗杰乐书买卖亲爱头写样机构动劳务业产广应库废断继结给绝统线组细终网联声听职脸脑节苏药补规视觉计订记讲许论设访证评诉词试诗诚话该详误课调谈谢贝负财责败账货质贪贫购贵费贴资赏赔赖赚赛赞跃践轨转轮软轻载较辆辈输辞达迁迈违迟适递遗邮邻释针钓钟钢钥铃锁键镇闪闭闲闷阅阶陆险隐难雾静须顶项顺预领频颜飘饭饮饰饱饿馆驶验骑骗鲜鸡鸭麦齐龄着带热丽岁处备笔复杂冲义图团园圆场块坏坚坛壳梦夺奋妇妈孙宁宝宽审宫寻导寿将尔尘尝层岛岭币师帅帐帘并庄庙庞异弃弹强归当录彻径忆态怀总恋恶悬惊惯戏战户扑执扩扫扬扰抚抢护报担拟拥择挂挡挣挤挥损换据掷摄摆摇携数敛斋斩无旧昼显晒晓暂术杀权条来极枪柜标栏树桥档检楼歼毁毕气汇汤沟泪泼洁浅测济浓涂涛涨渊渐温湾湿溃满滚滞滤滥潜灭灯灵灾炉炼烂烛烟焕爷牵状独狭猎猫献环琐电画畅疗疮疯痒瘫癫盏监盘睁瞒矿码砖础确礼祸离种积称稳穷窃竞笼筑筹签简粮紧纠红约级纪纯纱纳纵纷纸纹纺纽练绅织绍绑绕绘络绢绣绩绪续绳维绵综绿缓编缘缠缩缴罚罢羡翘耸聪肃肠肤肿胀胁胆胜胶脉脏脐脚脱腊舆舰舱艰艳芜苍苹茎荐荡荣荤莱获营萧萨蓝蔼蕴虏虑虚虫虾蚀蚁蚂蛮蜡衔衬袄袜袭装觅览讨训议讯讳讶讹讽诀诈诊译诛诞诡询诱诸谅谊谋谍谎谐谓谜谣谦谨谱谴贞贡贤贩贬贮贯贱贷贸贺贼贾贿赁赂赋赌赎赐赠赡赶趋踊踪蹿躯轧轩轰轴辅辉辑辖辗辩辽逊逻邓郁酝酱酿鉴钉钝钞钦钩钮钻铅铜铭铲铸铺链销锄锅锋锐锡锣锤锦锯锻镜镰闯闸闹阁阐阔阵随隶雏雳霁靥韦韧页顽顾顿颁颂颇颈颊颗额颠颤饥饲饶饺饼馅馈驯驰驱驳驴驹驻驼驾骂骄骆骇骚骤鲁鲤鲸鳄鸣鸥鸦鸽鸿鹅鹊鹏鹤鹰黄齿龟広済図駅売読気楽円様歳黒単関戦変継続険験権剣薬鉄転伝囲圧拠帰辺込渋弾霊竜獣闘縁価処姫]/u;

/** 原始碼（註解也算） */
const SOURCES: Record<string, string> = {
  'strings.ts': stringsSrc,
  'data/modern.ts': modernSrc,
  'data/fantasy.ts': fantasySrc,
};

/** 字串裡的全部文字（卡的欄位） */
function texts(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const id of DECK_IDS) {
    const deck = DECKS[id];
    for (const c of deck.cards) {
      for (const t of [c.title, c.text, c.question, ...c.answers, c.synopsis])
        if (t) out.push({ where: `${id}/${c.id}`, text: t });
    }
    for (const m of deck.missions) out.push({ where: `${id}/mission`, text: m.name + m.desc });
    for (const t of deck.tones)
      out.push({ where: `${id}/tone`, text: t.name + t.desc + t.slot + t.opener });
    for (const n of deck.names) out.push({ where: `${id}/names`, text: n });
  }
  return out;
}

describe('plot-deck 卡片資料', () => {
  for (const id of DECK_IDS) {
    const deck = DECKS[id];
    const missions = new Set(deck.missions.map((m) => m.id));
    const tones = new Set(deck.tones.map((t) => t.id));

    describe(deck.name, () => {
      it('每一類的張數', () => {
        const got = Object.fromEntries(CARD_CATS.map((c) => [c, cardsOf(deck, c).length]));
        expect(got).toEqual(COUNTS[id]);
        expect(deck.missions).toHaveLength(6);
        expect(deck.tones).toHaveLength(id === 'modern' ? 6 : 5);
      });

      it('id 不重複、前綴是種類；必填的欄位都有', () => {
        const ids = deck.cards.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const c of deck.cards) {
          expect(c.id.startsWith(`${c.cat}.`), c.id).toBe(true);
          expect(c.title.trim(), c.id).not.toBe('');
          expect(c.text.trim(), c.id).not.toBe('');
          expect(c.question.trim(), c.id).not.toBe('');
          expect(c.answers.length, c.id).toBeGreaterThanOrEqual(3);
          expect(new Set(c.answers).size, c.id).toBe(c.answers.length);
          if (c.cat === 'truth') {
            expect(c.synopsis, c.id).toContain('{stage}');
            expect(c.synopsis, c.id).toContain('{tone}');
          }
          if (c.cat === 'stage') expect(c.kinds?.length, c.id).toBeGreaterThan(0);
        }
        /* 同一類裡標題不重複 */
        for (const cat of CARD_CATS) {
          const titles = cardsOf(deck, cat).map((c) => c.title);
          expect(new Set(titles).size, cat).toBe(titles.length);
        }
      });

      it('題材、氣氛、場所的種類與參照都是有效的', () => {
        for (const c of deck.cards) {
          for (const m of c.missions ?? []) expect(m === ANY || missions.has(m), c.id).toBe(true);
          for (const t of c.tones ?? []) expect(t === ANY || tones.has(t), c.id).toBe(true);
          for (const k of [...(c.kinds ?? []), ...(c.fits ?? [])])
            expect(KINDS[id], c.id).toContain(k);
          if (belongsToPc(c.cat)) {
            expect(c.missions, c.id).toBeUndefined();
            expect(c.tones, c.id).toBeUndefined();
          }
          for (const kind of ['prefer', 'avoid'] as const) {
            for (const [cat, list] of Object.entries(c.links?.[kind] ?? {})) {
              for (const ref of list ?? [])
                expect(findCard(deck, ref)?.cat, `${c.id} → ${ref}`).toBe(cat);
            }
          }
        }
      });

      it('餘韻與焦點：各屬一種氣氛，每種氣氛餘韻 5 張、焦點 3 張；餘韻合的真相 3 張以上、結局 3 張', () => {
        for (const [cat, per] of [
          ['core', 5],
          ['tone', 3],
        ] as const) {
          for (const t of tones) {
            const n = cardsOf(deck, cat).filter((c) => c.tones?.length === 1 && c.tones[0] === t);
            expect(n.length, `${cat} ${t}`).toBe(per);
          }
        }
        for (const c of cardsOf(deck, 'core')) {
          expect(c.question).toBe(cardsOf(deck, 'core')[0].question);
          expect(c.truths?.length ?? 0, c.id).toBeGreaterThanOrEqual(3);
          expect(c.endings?.length ?? 0, c.id).toBe(3);
          for (const t of c.truths ?? []) expect(findCard(deck, t)?.cat, t).toBe('truth');
          for (const e of c.endings ?? []) expect(findCard(deck, e)?.cat, e).toBe('ending');
          expect(c.missions?.length ?? 0, c.id).toBeGreaterThanOrEqual(2);
        }
        /* 每張真相與結局都至少合一張餘韻 */
        const cores = cardsOf(deck, 'core');
        for (const c of [...cardsOf(deck, 'truth'), ...cardsOf(deck, 'ending')])
          expect(
            cores.some((k) => k.truths?.includes(c.id) || k.endings?.includes(c.id)),
            c.id,
          ).toBe(true);
      });

      it('每個題材 × 氣氛：故事的每一類都有 2 張以上合題材或氣氛的卡；餘韻與焦點各 3 張', () => {
        for (const m of missions) {
          for (const t of tones) {
            for (const cat of STORY_KEYS) {
              const ok = cardsOf(deck, cat).filter((c) => themeWeight(c, m, t) >= 1);
              const need = cat === 'core' || cat === 'tone' ? 3 : 2;
              expect(ok.length, `${m} × ${t}：${cat}`).toBeGreaterThanOrEqual(need);
            }
          }
        }
      });

      it('每個題材 × 氣氛都抽得出整副（種子固定，各抽 20 次）', () => {
        for (const m of missions) {
          for (const t of tones) {
            const rng = seededRandom(`${id}-${m}-${t}`);
            for (let i = 0; i < 20; i++) {
              const sc = newScenario(id, { mission: m, tone: t });
              drawStory(deck, sc, rng);
              for (const k of STORY_KEYS)
                expect(sc.slots[k].card, `${m} × ${t}：${k}`).toBeTruthy();
              expect(findCard(deck, sc.slots.core.card)?.tones).toEqual([t]);
              expect(findCard(deck, sc.slots.tone.card)?.tones).toEqual([t]);
            }
          }
        }
      });
    });
  }

  it('卡片與介面的文字沒有日文的假名、簡體字或日本的新字體', () => {
    /* 檢查本身有效 */
    expect(KANA.test('カード')).toBe(true);
    expect(KANA.test('調查・偵探')).toBe(false);
    expect(NOT_TC.test('这张卡')).toBe(true);
    expect(NOT_TC.test('気配')).toBe(true);
    expect(NOT_TC.test('里長與廟口的北斗')).toBe(false);
    for (const { where, text } of texts()) {
      expect(KANA.test(text), `${where}：${text}`).toBe(false);
      expect(NOT_TC.test(text), `${where}：${text}（${text.match(NOT_TC)?.[0]}）`).toBe(false);
    }
    for (const [file, text] of Object.entries(SOURCES)) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        expect(KANA.test(line), `${file}:${i + 1} ${line}`).toBe(false);
        const hit = line.match(NOT_TC)?.[0];
        expect(hit, `${file}:${i + 1} ${line}`).toBeUndefined();
      });
    }
  });
});
