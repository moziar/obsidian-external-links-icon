import type { ExternalLinksIconSettings, IconItem } from './types';
import { ICON_CATEGORIES, CSS_SELECTORS, DEFAULT_SETTINGS } from './constants';

import { prepareSvgForSettings, preferDarkThemeFromDocument } from './svg';

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

		this.scheduleScan();
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

	scheduleScan(delay = 180): void {
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
			// Remove any previous inline icon elements and rebuild fresh.
			document.querySelectorAll('.external-links-icon-inline').forEach(el => el.remove());
			// Remove any suffix-hiding class previously added to links
			document.querySelectorAll('.external-link.external-links-icon-hide-suffix').forEach(el => el.classList.remove('external-links-icon-hide-suffix'));

			const settings = this.getSettings();
			const applied = new Set<Element>();
			const icons: IconItem[] = this.getSortedIcons(DEFAULT_SETTINGS.icons || {}).concat(this.getSortedIcons(settings.customIcons || {}));

			if (!icons.length) return;

			const rootSources = (this.observedRoots && this.observedRoots.length) ? this.observedRoots : [document];
			for (const icon of icons) {
				const selector = this.getIconSelector(icon).trim();
				if (!selector) continue;
				for (const root of rootSources) {
					const elements = (root === document ? document.querySelectorAll(selector) : (root as Element).querySelectorAll(selector));
					if (!elements || elements.length === 0) continue;
					for (const el of Array.from(elements)) {
						if (applied.has(el)) continue;
						if (!(el instanceof HTMLElement)) continue;
// Inline span icon injection removed. Rendering is done via generated CSS ::after rules.
				// Keep logic simple: we will add classes for scheme icons when needed and
				// rely on the generated selectors to apply the ::after background-image.

// For scheme icons, hide Obsidian's default suffix by adding a class.
				if (icon.linkType === 'scheme') {
					const isBuiltInScheme = Boolean((DEFAULT_SETTINGS.icons || {})[icon.name]);
					const isCustomScheme = Boolean(settings?.customIcons?.[icon.name]);
					if (isBuiltInScheme || isCustomScheme) {
						(el as HTMLElement).classList.add('external-links-icon-hide-suffix');
					}
						}

						applied.add(el);
					}
				}
			}
		} catch (e) {
			console.error('Failed to scan and annotate links for icons:', e);
		}
	}

	private getSortedIcons(icons: Record<string, IconItem>): IconItem[] {
		return Object.values(icons).sort((a, b) => (a.order || 0) - (b.order || 0));
	}

	private getIconSelector(icon: IconItem): string {
		if (this.isSpecialIcon(icon.name)) {
			return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
		}
		if (icon.linkType === 'scheme') {
			const scheme = icon.target || icon.name;
			return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
		}
		if (this.isSpecialWebIcon(icon.name)) {
			return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
		}
		const domain = this.getWebDomain(icon.name);
		if (domain) {
			return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
		}
		if (icon.linkType === 'url') {
			const domain = icon.target || icon.name;
			return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
		}
		if (this.isUrlSchemeIcon(icon.name) && !icon.linkType) {
			const scheme = icon.target || icon.name;
			return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`;
		}
		return `${CSS_SELECTORS.CUSTOM_DATA}[data-icon="${icon.name}"]`;
	}

	private isSpecialIcon(iconName: string): iconName is keyof typeof ICON_CATEGORIES.SPECIAL {
		return iconName in ICON_CATEGORIES.SPECIAL;
	}

	private isSpecialWebIcon(iconName: string): boolean {
		return iconName in ICON_CATEGORIES.SPECIAL && !ICON_CATEGORIES.URL_SCHEME.includes(String(iconName));
	}

	private isUrlSchemeIcon(iconName: string): boolean {
		return ICON_CATEGORIES.URL_SCHEME.includes(String(iconName));
	}

	private getWebDomain(iconName: string): string | undefined {
		return ICON_CATEGORIES.WEB[iconName as keyof typeof ICON_CATEGORIES.WEB];
	}
}
