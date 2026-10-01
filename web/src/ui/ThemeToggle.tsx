/** 深／淺色切換按鈕 */
import { Moon, Sun } from 'lucide-react';
import { IconButton } from './Button';
import { useTheme } from './theme';

export function ThemeToggle({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const [theme, setTheme] = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <IconButton
      label={theme === 'dark' ? '切換成淺色' : '切換成深色'}
      icon={theme === 'dark' ? <Sun /> : <Moon />}
      size={size}
      onClick={() => setTheme(next)}
    />
  );
}
