import type { ExternalLinksIconSettings, IconItem } from './types';
import { ICON_CATEGORIES, DEFAULT_SETTINGS } from './constants';

let cachedIcons: IconItem[] | null = null;
let cachedVersion: number = -1;

export interface MatchContext {
	href: string;
	hrefLower: string;
	isExternal: boolean;
	isInternal: boolean;
	fancyUrlScheme: boolean;
	fancyWebLink: boolean;
	fancyObsidianWeb: boolean;
	fancyAdvancedUri: boolean;
	obsidianNoteMode: 'none' | 'internal' | 'external' | 'both';
	isNoteLink: boolean;
}

/**
 * 提取链接目标的文件扩展名（小写、不带点），无扩展名返回 ''。
 * 兼容 `[[note|alias]]`、`[[note#heading]]`、`[text](path/file.md)` 及 URL 编码路径。
 */
function getLinkExtension(href: string): string {
	let h = href.split('|')[0].split('#')[0];
	try { h = decodeURIComponent(h); } catch { /* keep raw on malformed encoding */ }
	const lastSlash = Math.max(h.lastIndexOf('/'), h.lastIndexOf('\\'));
	const file = lastSlash >= 0 ? h.slice(lastSlash + 1) : h;
	const dot = file.lastIndexOf('.');
	if (dot <= 0 || dot === file.length - 1) return '';
	return file.slice(dot + 1).toLowerCase();
}

/** 判断内部链接是否指向 Obsidian 原生文档（无扩展名的 wikilink、md 或 canvas 文件）。 */
function isNoteHref(href: string): boolean {
	const ext = getLinkExtension(href);
	return ext === '' || ext === 'md' || ext === 'canvas';
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
	const isNoteLink = isInternal && isNoteHref(href);
	return {
		href,
		hrefLower: href.toLowerCase(),
		isExternal,
		isInternal,
		fancyUrlScheme,
		fancyWebLink,
		fancyObsidianWeb,
		fancyAdvancedUri,
		obsidianNoteMode,
		isNoteLink
	};
}

function matchSpecialIcon(icon: IconItem, ctx: MatchContext): boolean | null {
	const hrefLower = ctx.hrefLower;

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
				// 只匹配原生文档（笔记/canvas）链接；指向图片等附件的内部链接不显示图标
				if (!ctx.isNoteLink) return false;
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
		default:
			return null;
	}
}

function matchGenericIcon(icon: IconItem, ctx: MatchContext): boolean {
	const hrefLower = ctx.hrefLower;

	if (icon.linkType === 'scheme') {
		if (!ctx.fancyUrlScheme) return false;
		if (!ctx.isExternal) return false;
		const idx = hrefLower.indexOf('://');
		if (idx <= 0) return false;
		const scheme = hrefLower.slice(0, idx);
		const expected = (icon.target.length > 0 ? icon.target[0] : icon.id || '').toLowerCase();
		if (!expected) return false;
		return scheme === expected;
	}

	if (icon.linkType === 'url') {
		if (!ctx.fancyWebLink) return false;
		if (!ctx.isExternal) return false;
		if (!hrefLower.startsWith('http://') && !hrefLower.startsWith('https://')) return false;
		const patterns = (icon.target.length > 0 ? icon.target : [icon.id || '']).map(p => p.toLowerCase());
		return patterns.some(p => p && hrefLower.indexOf(p) !== -1);
	}

	return false;
}

export function iconMatchesContext(icon: IconItem, ctx: MatchContext): boolean {
	if (!ctx.isExternal && !ctx.isInternal) return false;
	const special = matchSpecialIcon(icon, ctx);
	if (special !== null) return special;
	return matchGenericIcon(icon, ctx);
}

export function getSortedIcons(icons: Record<string, IconItem>): IconItem[] {
	return Object.values(icons).sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function getUrlTarget(icon: IconItem): string {
	const targets = icon.target.length > 0 ? icon.target : [icon.id || ''];
	return targets.reduce((a, b) => b.length > a.length ? b : a, '').toLowerCase();
}

export function getAllIconsSorted(settings: ExternalLinksIconSettings, settingsVersion: number = 0): IconItem[] {
	if (cachedIcons !== null && cachedVersion === settingsVersion) {
		return cachedIcons;
	}

	const customUrl = getSortedIcons(settings.customIcons || {}).filter(i => i.linkType === 'url');
	const builtinUrl = getBuiltinIconsByOrder('url');
	const builtinScheme = getBuiltinIconsByOrder('scheme');
	const customScheme = getSortedIcons(settings.customIcons || {}).filter(i => i.linkType === 'scheme');

	// URL: custom first, then builtin, sorted by target length descending (most specific first)
	const urlIcons = [...customUrl, ...builtinUrl].sort((a, b) => {
		return getUrlTarget(b).length - getUrlTarget(a).length;
	});

	// Scheme: builtin first, then custom
	const schemeIcons = [...builtinScheme, ...customScheme];

	const result = [...urlIcons, ...schemeIcons];

	cachedIcons = result;
	cachedVersion = settingsVersion;
	return result;
}

function getBuiltinIconsByOrder(linkType: 'url' | 'scheme'): IconItem[] {
	const keys = linkType === 'url' ? ICON_CATEGORIES.WEB : ICON_CATEGORIES.URL_SCHEME;
	const icons = DEFAULT_SETTINGS.icons || {};
	return keys.map(key => icons[key]).filter(Boolean);
}

export function matchIcon(
	href: string,
	isExternal: boolean,
	isInternal: boolean,
	settings: ExternalLinksIconSettings,
	settingsVersion: number = 0
): IconItem | null {
	const ctx = getMatchContext(href, isExternal, isInternal, settings);
	const icons = getAllIconsSorted(settings, settingsVersion);
	if (!icons.length) return null;

	for (const icon of icons) {
		if (iconMatchesContext(icon, ctx)) {
			return icon;
		}
	}
	return null;
}
