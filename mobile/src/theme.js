/**
 * Paleta i typografia wspólne z aplikacją webową — te same wartości kolorów,
 * żeby telefon i przeglądarka wyglądały jak jedno narzędzie, a nie dwa różne.
 * Motyw jasny i ciemny wybiera system telefonu.
 */
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F0F2ED',
  surface: '#FFFFFF',
  surface2: '#E6E9E1',
  surface3: '#DCE0D5',
  ink: '#17211C',
  inkSoft: '#515D55',
  inkFaint: '#7C877E',
  line: '#CCD2C4',
  lineStrong: '#B4BCA9',
  accent: '#2B6777',
  accentStrong: '#1D4B58',
  accentTint: '#DEEAEC',
  onAccent: '#F5FAFA',
  ok: '#3E7D4E',
  okTint: '#E1EEE3',
  warn: '#A9711A',
  warnTint: '#F3E7D2',
  crit: '#A23B2E',
  critTint: '#F3DFDA',
  thin: '#6B5B95',
  thinTint: '#E7E2F1',
};

const dark = {
  bg: '#10151A',
  surface: '#171E1B',
  surface2: '#1D2622',
  surface3: '#26312B',
  ink: '#E9EEEA',
  inkSoft: '#AAB6AD',
  inkFaint: '#7C877E',
  line: '#2B3530',
  lineStrong: '#3B463F',
  accent: '#5CB2C4',
  accentStrong: '#8AD0DE',
  accentTint: '#1E3338',
  onAccent: '#0B1E22',
  ok: '#77C48D',
  okTint: '#1D3324',
  warn: '#E3AC53',
  warnTint: '#3A2E17',
  crit: '#E28874',
  critTint: '#3B241E',
  thin: '#B4A3E0',
  thinTint: '#2C2740',
};

export const STATUS = {
  new: { label: 'Nowe', color: 'warn', tint: 'warnTint' },
  progress: { label: 'W trakcie', color: 'accent', tint: 'accentTint' },
  done: { label: 'Zrobione', color: 'ok', tint: 'okTint' },
};

export const radius = { sm: 6, md: 10, lg: 14, pill: 100 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? dark : light;
  return { colors, isDark: scheme === 'dark', radius, spacing };
}

export { light, dark };
