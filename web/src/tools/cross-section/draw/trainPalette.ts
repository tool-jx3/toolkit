/**
 * 列車用的顏色（本站自己配）：彩色樣式是淡彩的車身（每種車廂一色）、靛灰的底盤、淡色的天空；
 * 其他五種樣式是由那個樣式的紙、墨、結構的顏色調出來的定值（樣式只換顏色，結構不變）。
 * 每個顏色都和原作資料夾裡所有檔的顏色保持距離（ΔE76 10 以上，或三個通道都差 12 以上；規格 3.7、3.13）。
 */
import type { CarType, Scenery, StyleId } from '../model/types';
import type { Palette } from './palette';

export interface TrainColors {
  /** 車身（每種車廂） */
  livery: Record<CarType, string>;
  /** 底盤、轉向架 */
  chassis: string;
  wheel: string;
  rail: string;
  sleeper: string;
  ballast: string;
  /** 窗外的玻璃、拉下來的百葉窗 */
  glass: string;
  blind: string;
  /** 煙 */
  smoke: string;
  /** 天空（上、下） */
  sky: Record<Scenery, readonly [string, string]>;
  /** 遠景的剪影、隧道的內壁、高架橋的鋼梁、田野 */
  far: string;
  lining: string;
  girder: string;
  field: string;
  /** 星、月 */
  star: string;
  moon: string;
}

const TRAIN: Record<StyleId, TrainColors> = {
  color: {
    livery: {
      loco: '#7a7fa6',
      suite: '#9fb7e8',
      berth: '#aaddc5',
      dining: '#e8a9a0',
      lounge: '#c9b0e6',
      coach: '#a6c4e0',
      baggage: '#ccce92',
      observation: '#b8d69a',
      escort: '#b4b4c8',
    },
    chassis: '#544c70',
    wheel: '#8a8aa6',
    rail: '#6c6e8a',
    sleeper: '#c2c2d4',
    ballast: '#ebc9c0',
    glass: '#cfe4ff',
    blind: '#e6d2f0',
    smoke: '#e4e0f2',
    sky: {
      starlit: ['#1b1446', '#4a3a7a'],
      blizzard: ['#c9cfe8', '#f7ebfe'],
      viaduct: ['#9aa0ba', '#e1dff0'],
      tunnel: ['#33284a', '#55466b'],
      meadow: ['#93c5fd', '#e6fade'],
    },
    far: '#3a2f63',
    lining: '#6b6280',
    girder: '#8b8fb0',
    field: '#b9dc8c',
    star: '#c1e2ff',
    moon: '#fbf5a8',
  },
  blueprint: {
    livery: {
      loco: '#193e71',
      suite: '#224677',
      berth: '#2b4d7c',
      dining: '#193e71',
      lounge: '#224677',
      coach: '#2b4d7c',
      baggage: '#193e71',
      observation: '#224677',
      escort: '#2b4d7c',
    },
    chassis: '#617694',
    wheel: '#405a7e',
    rail: '#788aa4',
    sleeper: '#183b6a',
    ballast: '#1c457d',
    glass: '#7fb0e8',
    blind: '#4d72a3',
    smoke: '#3a629a',
    sky: {
      starlit: ['#142e51', '#2a5692'],
      blizzard: ['#183d6f', '#1f4d8c'],
      viaduct: ['#274369', '#2d5893'],
      tunnel: ['#5c7291', '#39547a'],
      meadow: ['#14335c', '#335d96'],
    },
    far: '#5074a5',
    lining: '#455e81',
    girder: '#506889',
    field: '#355f98',
    star: '#ffedff',
    moon: '#fff2b4',
  },
  parchment: {
    livery: {
      loco: '#f0c297',
      suite: '#eaba92',
      berth: '#e5b48f',
      dining: '#f0c297',
      lounge: '#eaba92',
      coach: '#e5b48f',
      baggage: '#f0c297',
      observation: '#eaba92',
      escort: '#e5b48f',
    },
    chassis: '#bb8c74',
    wheel: '#d0a382',
    rail: '#ac756a',
    sleeper: '#eec096',
    ballast: '#deae8b',
    glass: '#e1f8dc',
    blind: '#e1b28f',
    smoke: '#e6b590',
    sky: {
      starlit: ['#ecbd94', '#fccd9f'],
      blizzard: ['#f4c599', '#fdce9f'],
      viaduct: ['#e5b38c', '#fdce9f'],
      tunnel: ['#bd8d75', '#d4a583'],
      meadow: ['#f2c397', '#fdce9f'],
    },
    far: '#d3a481',
    lining: '#cc9e81',
    girder: '#c3947b',
    field: '#e7b893',
    star: '#4e2a18',
    moon: '#ad801e',
  },
  draft: {
    livery: {
      loco: '#ddd7e8',
      suite: '#d8d2e2',
      berth: '#cfcbdb',
      dining: '#ddd7e8',
      lounge: '#d8d2e2',
      coach: '#cfcbdb',
      baggage: '#ddd7e8',
      observation: '#d8d2e2',
      escort: '#cfcbdb',
    },
    chassis: '#9997b0',
    wheel: '#afadc1',
    rail: '#8a88a3',
    sleeper: '#d5d1e2',
    ballast: '#d8d2e3',
    glass: '#dbe6fa',
    blind: '#dfd8e7',
    smoke: '#eae0ef',
    sky: {
      starlit: ['#cbc8d8', '#e3dae8'],
      blizzard: ['#f4e5f6', '#ffedff'],
      viaduct: ['#d7ccdc', '#ffedff'],
      tunnel: ['#9d9ab2', '#b4b1c5'],
      meadow: ['#e6dae7', '#ffedff'],
    },
    far: '#d1cddd',
    lining: '#acaabf',
    girder: '#a4a2b9',
    field: '#f0e4f5',
    star: '#30305a',
    moon: '#a9acc1',
  },
  noir: {
    livery: {
      loco: '#1d102a',
      suite: '#251832',
      berth: '#2e1f3c',
      dining: '#1d102a',
      lounge: '#251832',
      coach: '#2e1f3c',
      baggage: '#1d102a',
      observation: '#251832',
      escort: '#2e1f3c',
    },
    chassis: '#645572',
    wheel: '#4a3658',
    rail: '#796b83',
    sleeper: '#20132d',
    ballast: '#160723',
    glass: '#77869d',
    blind: '#463457',
    smoke: '#2d1e3a',
    sky: {
      starlit: ['#2b1d39', '#170823'],
      blizzard: ['#1f132c', '#12041e'],
      viaduct: ['#382749', '#22142b'],
      tunnel: ['#624f6e', '#463052'],
      meadow: ['#281b36', '#291a31'],
    },
    far: '#433053',
    lining: '#4c3a5c',
    girder: '#584566',
    field: '#261c34',
    star: '#efe0f5',
    moon: '#e8b769',
  },
  terminal: {
    livery: {
      loco: '#271303',
      suite: '#2a1b03',
      berth: '#332005',
      dining: '#271303',
      lounge: '#2a1b03',
      coach: '#332005',
      baggage: '#271303',
      observation: '#2a1b03',
      escort: '#332005',
    },
    chassis: '#6e4e1e',
    wheel: '#442f0a',
    rail: '#7c5415',
    sleeper: '#201b00',
    ballast: '#261301',
    glass: '#764e13',
    blind: '#473210',
    smoke: '#3e2d0a',
    sky: {
      starlit: ['#1b1900', '#2c1d03'],
      blizzard: ['#1e1b01', '#281404'],
      viaduct: ['#352106', '#2e1e03'],
      tunnel: ['#6c4e1e', '#412c0a'],
      meadow: ['#1d1a00', '#322002'],
    },
    far: '#4b3202',
    lining: '#472f02',
    girder: '#4d3202',
    field: '#3c240b',
    star: '#ffb43a',
    moon: '#e4b45f',
  },
};

/** 列車的顏色（照樣式） */
export const trainColors = (p: Palette): TrainColors => TRAIN[p.id] ?? TRAIN.color;
