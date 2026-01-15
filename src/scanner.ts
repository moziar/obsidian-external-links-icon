import type { ExternalLinksIconSettings, IconItem } from './types';
import { ICON_CATEGORIES, DEFAULT_SETTINGS } from './constants';
import { encodeSvgData } from './utils';


export type GetSettingsFn = () => ExternalLinksIconSettings;

export class Scanner {
	private getSettings: GetSettingsFn;
	private scanTimerId: number | null = null;
	private mutationObserver: MutationObserver | null = null;
	private observedRoots: Element[] = [];
	private observeSelectors: string[];

	constructor(getSettings: GetSettingsFn, observeSelectors?: string[]) {
		this.getSettings = getSettings;
		this.observeSelectors = observeSelectors || ['.markdown-preview-view', '.markdown-source-view', '.view-content', '.workspace-leaf-content'];
	}

	start(): void {
		this.mutationObserver = new MutationObserver((mutations) => {
			if (this.isOwnMutation(mutations)) return;
			this.scheduleScan();
		});

		const observeSelectors = this.observeSelectors;
		const roots = Array.from(document.querySelectorAll(observeSelectors.join(',')));
		if (roots.length) {
			this.observedRoots = roots;
			roots.forEach(r => {
				try { this.mutationObserver?.observe(r, { childList: true, subtree: true }); } catch (e) { /* ignore root observe errors */ }
			});
			try { this.mutationObserver?.observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* ignore */ }
		} else {
			this.observedRoots = [];
			try { this.mutationObserver?.observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
		}

		this.scheduleScan(60);
	}

	stop(): void {
		if (this.mutationObserver) {
			this.mutationObserver.disconnect();
			this.mutationObserver = null;
		}
		this.observedRoots = [];
		if (this.scanTimerId) {
			window.clearTimeout(this.scanTimerId);
			this.scanTimerId = null;
		}
	}

	scheduleScan(delay = 120): void {
		if (this.scanTimerId) {
			window.clearTimeout(this.scanTimerId);
			this.scanTimerId = null;
		}
		this.scanTimerId = window.setTimeout(() => {
			this.scanTimerId = null;
			this.scanAndAnnotateLinks();
		}, delay);
	}

	private isOwnMutation(mutations: MutationRecord[]): boolean {
		for (const m of mutations) {
			if (m.type === 'childList') {
				for (const n of Array.from(m.addedNodes)) {
					if (n.nodeType !== Node.ELEMENT_NODE) return false;
					const el = n as Element;
					if (el.matches && (el.matches('.external-links-icon-inline') || el.querySelector('.external-links-icon-inline'))) {
						continue;
					}
					return false;
				}
				for (const n of Array.from(m.removedNodes)) {
					if (n.nodeType !== Node.ELEMENT_NODE) return false;
					const el = n as Element;
					if (el.matches && (el.matches('.external-links-icon-inline') || el.querySelector('.external-links-icon-inline'))) {
						continue;
					}
					return false;
				}
			} else {
				return false;
			}
		}
		return true;
	}

	/**
	 * Scan the document and annotate matching links with an inline icon element
	 */
	scanAndAnnotateLinks(): void {
		try {
			// Clean up previous annotations
			document.querySelectorAll('.external-links-icon-enabled').forEach(el => {
				el.classList.remove('external-links-icon-enabled');
				el.classList.remove('external-links-icon-hide-suffix');
				if (el instanceof HTMLElement) {
					el.style.removeProperty('--external-link-icon-image-light');
					el.style.removeProperty('--external-link-icon-image-dark');
				}
			});

			const settings = this.getSettings();
			const applied = new Set<Element>();
			const icons: IconItem[] = this.getSortedIcons(DEFAULT_SETTINGS.icons || {}).concat(this.getSortedIcons(settings.customIcons || {}));
			if (!icons.length) return;

			const body = document.body;
			const bodyClassList = body ? body.classList : null;
			const fancyUrlScheme = !!(bodyClassList && bodyClassList.contains('fancy-url-scheme'));
			const fancyWebLink = !!(bodyClassList && bodyClassList.contains('fancy-web-link'));
			const fancyObsidianWeb = !!(bodyClassList && bodyClassList.contains('fancy-obsidian-web-link'));
			const fancyAdvancedUri = !!(bodyClassList && bodyClassList.contains('fancy-advanced-uri-link'));
			let obsidianNoteMode: 'internal' | 'external' | 'both' | 'none' = 'none';
			if (bodyClassList) {
				if (bodyClassList.contains('fancy-internal-obsidian-link')) obsidianNoteMode = 'internal';
				else if (bodyClassList.contains('fancy-external-obsidian-link')) obsidianNoteMode = 'external';
				else if (bodyClassList.contains('fancy-both-obsidian-link')) obsidianNoteMode = 'both';
			}

			const iconImages = new Map<string, { light: string; dark: string }>();
			for (const icon of icons) {
				try {
					const encodedLight = encodeSvgData(icon.svgData);
					const encodedDark = icon.themeDarkSvgData ? encodeSvgData(icon.themeDarkSvgData) : encodedLight;
					iconImages.set(icon.name, { light: encodedLight, dark: encodedDark });
				} catch (err) {
					console.warn('Failed to encode icon style for', icon.name, err);
				}
			}

			const rootSources = (this.observedRoots && this.observedRoots.length) ? this.observedRoots : [document];
			for (const root of rootSources) {
				const elements = (root === document
					? document.querySelectorAll('.external-link, .internal-link')
					: root.querySelectorAll('.external-link, .internal-link'));
				if (!elements || elements.length === 0) continue;
				for (const el of Array.from(elements)) {
					if (applied.has(el)) continue;
					if (!(el instanceof HTMLElement)) continue;

					const href = el.getAttribute('href') || '';
					const hrefLower = href.toLowerCase();
					let chosen: IconItem | null = null;

					for (const icon of icons) {
						if (this.matchesIcon(icon, el, hrefLower, fancyUrlScheme, fancyWebLink, fancyObsidianWeb, fancyAdvancedUri, obsidianNoteMode)) {
							chosen = icon;
							break;
						}
					}

					if (!chosen) continue;
					const images = iconImages.get(chosen.name);
					if (!images) continue;

					try {
						el.style.setProperty('--external-link-icon-image-light', `url("${images.light}")`);
						el.style.setProperty('--external-link-icon-image-dark', `url("${images.dark}")`);
						el.classList.add('external-links-icon-enabled');

						if (chosen.linkType === 'scheme') {
							const isBuiltInScheme = Boolean((DEFAULT_SETTINGS.icons || {})[chosen.name]);
							const isCustomScheme = Boolean(settings?.customIcons?.[chosen.name]);
							if (isBuiltInScheme || isCustomScheme) {
								el.classList.add('external-links-icon-hide-suffix');
							}
						}

						applied.add(el);
					} catch (err) {
						console.warn('Failed to apply icon style for', chosen.name, err);
					}
				}
			}
		} catch (e) {
			console.error('Failed to scan and annotate links for icons:', e);
		}
	}

	private matchesIcon(
		icon: IconItem,
		el: HTMLElement,
		hrefLower: string,
		fancyUrlScheme: boolean,
		fancyWebLink: boolean,
		fancyObsidianWeb: boolean,
		fancyAdvancedUri: boolean,
		obsidianNoteMode: 'internal' | 'external' | 'both' | 'none'
	): boolean {
		const classList = el.classList;
		const isExternal = classList.contains('external-link');
		const isInternal = classList.contains('internal-link');
		if (!isExternal && !isInternal) return false;

		switch (icon.name) {
			case 'obsidianweb': {
				if (!fancyObsidianWeb) return false;
				if (!isExternal) return false;
				if (!hrefLower.startsWith('https://')) return false;
				return hrefLower.indexOf('obsidian.md') !== -1;
			}
			case 'obsidiannote': {
				if (obsidianNoteMode === 'none') return false;
				if (isInternal) {
					return obsidianNoteMode === 'internal' || obsidianNoteMode === 'both';
				}
				if (isExternal && (obsidianNoteMode === 'external' || obsidianNoteMode === 'both')) {
					if (!hrefLower.startsWith('obsidian://')) return false;
					const isAdvSetting = hrefLower.startsWith('obsidian://adv-uri') && hrefLower.indexOf('settingid') !== -1;
					return !isAdvSetting;
				}
				return false;
			}
			case 'advancedurisetting': {
				if (!fancyAdvancedUri) return false;
				if (!isExternal) return false;
				if (!hrefLower.startsWith('obsidian://adv-uri')) return false;
				return hrefLower.indexOf('settingid') !== -1;
			}
			case 'google': {
				if (!fancyWebLink) return false;
				if (!isExternal) return false;
				if (!hrefLower.startsWith('https://')) return false;
				if (hrefLower.indexOf('google.com') === -1) return false;
				if (hrefLower.indexOf('docs.google.com') !== -1) return false;
				if (hrefLower.indexOf('cloud.google.com') !== -1) return false;
				return true;
			}
			case 'googledocs': {
				if (!fancyWebLink) return false;
				if (!isExternal) return false;
				if (!hrefLower.startsWith('https://')) return false;
				return hrefLower.indexOf('docs.google.com') !== -1;
			}
			case 'googlecloud': {
				if (!fancyWebLink) return false;
				if (!isExternal) return false;
				if (!hrefLower.startsWith('https://')) return false;
				return hrefLower.indexOf('cloud.google.com') !== -1;
			}
			default:
				break;
		}

		if (icon.linkType === 'scheme') {
			if (!fancyUrlScheme) return false;
			if (!isExternal) return false;
			const idx = hrefLower.indexOf('://');
			if (idx <= 0) return false;
			const scheme = hrefLower.slice(0, idx);
			const expected = (icon.target || icon.name || '').toLowerCase();
			if (!expected) return false;
			return scheme === expected;
		}

		if (icon.linkType === 'url') {
			if (!fancyWebLink) return false;
			if (!isExternal) return false;
			if (!hrefLower.startsWith('http://') && !hrefLower.startsWith('https://')) return false;
			const webMap = ICON_CATEGORIES.WEB;
			const mapped = webMap[icon.name as keyof typeof webMap];
			const pattern = (mapped || icon.target || icon.name || '').toLowerCase();
			if (!pattern) return false;
			return hrefLower.indexOf(pattern) !== -1;
		}

		const urlSchemeNames = ICON_CATEGORIES.URL_SCHEME || [];
		if (urlSchemeNames.indexOf(String(icon.name)) !== -1) {
			if (!fancyUrlScheme) return false;
			if (!isExternal) return false;
			const idx = hrefLower.indexOf('://');
			if (idx <= 0) return false;
			const scheme = hrefLower.slice(0, idx);
			const expected = (icon.target || icon.name || '').toLowerCase();
			if (!expected) return false;
			return scheme === expected;
		}

		const dataIcon = el.getAttribute('data-icon') || '';
		return dataIcon === icon.name;
	}

	private getSortedIcons(icons: Record<string, IconItem>): IconItem[] {
		return Object.values(icons).sort((a, b) => (a.order || 0) - (b.order || 0));
	} 
}
