import type { ExternalLinksIconSettings, IconItem } from './types';
import { ICON_CATEGORIES, DEFAULT_SETTINGS } from './constants';

export interface MatchContext {
	href: string;
	isExternal: boolean;
	isInternal: boolean;
	fancyUrlScheme: boolean;
	fancyWebLink: boolean;
	fancyObsidianWeb: boolean;
	fancyAdvancedUri: boolean;
	obsidianNoteMode: 'internal' | 'external' | 'both' | 'none';
}

export function getMatchContext(
	href: string,
	isExternal: boolean,
	isInternal: boolean,
	settings: ExternalLinksIconSettings
): MatchContext {
	const fancyUrlScheme = settings.fancyUrlScheme;
	const fancyWebLink = settings.fancyWebLink;
	const fancyObsidianWeb = settings.fancyObsidianWebLink;
	const fancyAdvancedUri = settings.fancyAdvancedUriLink;
	const obsidianNoteMode = settings.fancyObsidianNoteLink;
	return {
		href,
		isExternal,
		isInternal,
		fancyUrlScheme,
		fancyWebLink,
		fancyObsidianWeb,
		fancyAdvancedUri,
		obsidianNoteMode
	};
}

export function iconMatchesContext(icon: IconItem, ctx: MatchContext): boolean {
	if (!ctx.isExternal && !ctx.isInternal) return false;

	const hrefLower = ctx.href.toLowerCase();

	switch (icon.id) {
		case 'obsidianweb': {
			if (!ctx.fancyObsidianWeb) return false;
			if (!ctx.isExternal) return false;
			if (!hrefLower.startsWith('https://')) return false;
			return hrefLower.indexOf('obsidian.md') !== -1;
		}
		case 'obsidiannote': {
			if (ctx.obsidianNoteMode === 'none') return false;
			if (ctx.isInternal) {
				return ctx.obsidianNoteMode === 'internal' || ctx.obsidianNoteMode === 'both';
			}
			if (ctx.isExternal && (ctx.obsidianNoteMode === 'external' || ctx.obsidianNoteMode === 'both')) {
				if (!hrefLower.startsWith('obsidian://')) return false;
				const isAdvSetting = hrefLower.startsWith('obsidian://adv-uri') && hrefLower.indexOf('settingid') !== -1;
				return !isAdvSetting;
			}
			return false;
		}
		case 'advancedurisetting': {
			if (!ctx.fancyAdvancedUri) return false;
			if (!ctx.isExternal) return false;
			if (!hrefLower.startsWith('obsidian://adv-uri')) return false;
			return hrefLower.indexOf('settingid') !== -1;
		}
		case 'google': {
			if (!ctx.fancyWebLink) return false;
			if (!ctx.isExternal) return false;
			if (!hrefLower.startsWith('https://')) return false;
			if (hrefLower.indexOf('google.com') === -1) return false;
			if (hrefLower.indexOf('docs.google.com') !== -1) return false;
			if (hrefLower.indexOf('cloud.google.com') !== -1) return false;
			return true;
		}
		case 'docs.google': {
			if (!ctx.fancyWebLink) return false;
			if (!ctx.isExternal) return false;
			if (!hrefLower.startsWith('https://')) return false;
			return hrefLower.indexOf('docs.google.com') !== -1;
		}
		case 'cloud.google': {
			if (!ctx.fancyWebLink) return false;
			if (!ctx.isExternal) return false;
			if (!hrefLower.startsWith('https://')) return false;
			return hrefLower.indexOf('cloud.google.com') !== -1;
		}
		default:
			break;
	}

	if (icon.linkType === 'scheme') {
		if (!ctx.fancyUrlScheme) return false;
		if (!ctx.isExternal) return false;
		const idx = hrefLower.indexOf('://');
		if (idx <= 0) return false;
		const scheme = hrefLower.slice(0, idx);
		const expected = (icon.target || icon.id || '').toLowerCase();
		if (!expected) return false;
		return scheme === expected;
	}

	if (icon.linkType === 'url') {
		if (!ctx.fancyWebLink) return false;
		if (!ctx.isExternal) return false;
		if (!hrefLower.startsWith('http://') && !hrefLower.startsWith('https://')) return false;
		const webMap: Record<string, string> = ICON_CATEGORIES.WEB;
		const mapped = webMap[icon.id];
		const pattern = (mapped || icon.target || icon.id || '').toLowerCase();
		if (!pattern) return false;
		return hrefLower.indexOf(pattern) !== -1;
	}

	return false;
}

export function getSortedIcons(icons: Record<string, IconItem>): IconItem[] {
	return Object.values(icons).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getAllIconsSorted(settings: ExternalLinksIconSettings): IconItem[] {
	return getSortedIcons(DEFAULT_SETTINGS.icons || {}).concat(getSortedIcons(settings.customIcons || {}));
}

export function matchIcon(
	href: string,
	isExternal: boolean,
	isInternal: boolean,
	settings: ExternalLinksIconSettings
): IconItem | null {
	const ctx = getMatchContext(href, isExternal, isInternal, settings);
	const icons: IconItem[] = getSortedIcons(DEFAULT_SETTINGS.icons || {}).concat(getSortedIcons(settings.customIcons || {}));
	if (!icons.length) return null;

	for (const icon of icons) {
		if (iconMatchesContext(icon, ctx)) {
			return icon;
		}
	}
	return null;
}
