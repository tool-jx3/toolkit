import { describe, expect, it } from 'vitest';
import {
  fileNameWithExt,
  formatBytes,
  matchesAccept,
  safeFileName,
  sequenceName,
  splitExtension,
} from '@/core/files';

describe('檔名清理', () => {
  it.each([
    ['艾琳的立繪', '艾琳的立繪'],
    ['a/b\\c:d*e?f"g<h>i|j', 'a_b_c_d_e_f_g_h_i_j'],
    ['  多個   空白  ', '多個 空白'],
    ['...隱藏檔...', '隱藏檔'],
    ['CON', '_CON'],
    ['nul.txt', '_nul.txt'],
    ['', 'untitled'],
    ['???', 'untitled'],
    ['tab\there\nnewline', 'tab here newline'],
    ['🎲骰子', '🎲骰子'],
  ])('%j → %j', (input, expected) => {
    expect(safeFileName(input)).toBe(expected);
  });

  it('長度以字元計，不切斷中文', () => {
    const s = safeFileName('一二三四五六七八九十', { maxLength: 4 });
    expect(s).toBe('一二三四');
  });

  it('副檔名與連番', () => {
    expect(fileNameWithExt('角色:A', '.png')).toBe('角色_A.png');
    expect(splitExtension('a.b.PNG')).toEqual({ base: 'a.b', ext: 'png' });
    expect(splitExtension('.gitignore')).toEqual({ base: '.gitignore', ext: '' });
    expect(sequenceName('frame', 0, 12, 'png')).toBe('frame_0001.png');
    expect(sequenceName('frame', 9, 12000, 'png')).toBe('frame_00010.png');
  });
});

describe('其他檔案工具', () => {
  it('大小格式', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  });

  it('accept 規則', () => {
    expect(matchesAccept({ name: 'a.PNG', type: 'image/png' }, 'image/*')).toBe(true);
    expect(matchesAccept({ name: 'a.ttf', type: '' }, '.ttf,.otf')).toBe(true);
    expect(matchesAccept({ name: 'a.txt', type: 'text/plain' }, 'image/*,.json')).toBe(false);
    expect(matchesAccept({ name: 'a.json', type: 'application/json' }, 'application/json')).toBe(
      true,
    );
  });
});
