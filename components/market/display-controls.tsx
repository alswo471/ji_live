import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NameLocale, Theme } from '@/hooks/use-display-preferences';

export function DisplayControls({ theme, nameLocale, setTheme, setNameLocale }: {
  theme: Theme;
  nameLocale: NameLocale;
  setTheme: (theme: Theme) => void;
  setNameLocale: (locale: NameLocale) => void;
}) {
  return <div className="flex items-center gap-2">
    <fieldset className="flex rounded-xl border bg-card/60 p-1">
      <legend className="sr-only">종목명 표기</legend>
      <button type="button" aria-pressed={nameLocale === 'ko'} aria-label="한글명으로 보기" onClick={() => setNameLocale('ko')} className={`min-h-9 rounded-lg px-2.5 text-xs font-bold transition-colors ${nameLocale === 'ko' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>한글</button>
      <button type="button" aria-pressed={nameLocale === 'en'} aria-label="영문명으로 보기" onClick={() => setNameLocale('en')} className={`min-h-9 rounded-lg px-2.5 text-xs font-bold transition-colors ${nameLocale === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>EN</button>
    </fieldset>
    <Button variant="outline" size="icon" className="size-11 rounded-xl bg-card/60" aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  </div>;
}
