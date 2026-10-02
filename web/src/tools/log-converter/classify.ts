/**
 * 訊息分類（規格 2.5）與合併同人連續對話（F47）。結果是「則」的清單：每一則有全域的訊息序號（從 1 起），
 * 分割、插圖位置、預覽區段都用這個序號。
 */
import { LOG_SYSTEM_SPEAKER } from '@/ccfolia';
import type { LogFormat, SourceMessage } from './load';

/** 閒聊、旁白、系統訊息、對話 */
export type EntryKind = 'chat' | 'narration' | 'system' | 'dialogue';

export interface LogEntry {
  /** 訊息序號（合併後從 1 起，含不輸出的訊息） */
  num: number;
  kind: EntryKind;
  tab: string;
  speaker: string;
  /** 每一則原本的訊息是一行（安全的 HTML；行內可以有 <br>） */
  lines: string[];
  /** 新格式這一則的頭像（合併時用第一則的） */
  avatar: string | null;
}

export interface ClassifyOptions {
  /** 旁白角色（完全相同的字串） */
  narrator: string;
  /** 閒聊分頁的名稱（null＝不指定） */
  chatTab: string | null;
  /** 合併同人連續對話 */
  merge: boolean;
}

/** 舊格式的擲骰寫法：內容 HTML 原文含「cc<=」或「數字＋d＋數字」（不分大小寫） */
const LEGACY_DICE = /cc<=|\d+d\d+/i;

/** 一則訊息的分類（2.5：新舊格式的順序不同） */
export function classifyMessage(
  format: LogFormat,
  m: Pick<SourceMessage, 'tab' | 'speaker' | 'system' | 'roll' | 'rawHtml'>,
  { narrator, chatTab }: Pick<ClassifyOptions, 'narrator' | 'chatTab'>,
): EntryKind {
  if (format === 'v2') {
    if (m.system || m.roll) return 'system';
    if (chatTab !== null && chatTab !== '' && m.tab === chatTab) return 'chat';
    if (narrator && m.speaker === narrator) return 'narration';
    return 'dialogue';
  }
  if (chatTab !== null && chatTab !== '' && m.tab === chatTab) return 'chat';
  if (m.speaker === narrator) return 'narration';
  if (m.speaker === LOG_SYSTEM_SPEAKER || LEGACY_DICE.test(m.rawHtml)) return 'system';
  return 'dialogue';
}

/**
 * 分類＋（選擇時）合併同一位發言者、同一個分頁、連續的「對話」；旁白、閒聊、系統訊息不合併。
 * 合併後那一則用第一則的頭像。
 */
export function buildEntries(
  format: LogFormat,
  messages: readonly SourceMessage[],
  options: ClassifyOptions,
): LogEntry[] {
  const out: LogEntry[] = [];
  for (const m of messages) {
    const kind = classifyMessage(format, m, options);
    const last = out[out.length - 1];
    if (
      options.merge &&
      kind === 'dialogue' &&
      last &&
      last.kind === 'dialogue' &&
      last.speaker === m.speaker &&
      last.tab === m.tab
    ) {
      last.lines.push(m.html);
      continue;
    }
    out.push({
      num: out.length + 1,
      kind,
      tab: m.tab,
      speaker: m.speaker,
      lines: [m.html],
      avatar: m.avatar,
    });
  }
  return out;
}
