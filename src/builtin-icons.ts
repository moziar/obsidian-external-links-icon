import type { IconItem } from './types';
import { BUILTIN_SCHEME_ICONS } from './builtin-scheme-icons';
import { BUILTIN_WEB_ICONS } from './builtin-web-icons';

export const BUILTIN_ICONS: Record<string, IconItem> = {
    ...BUILTIN_SCHEME_ICONS,
    ...BUILTIN_WEB_ICONS,
};
