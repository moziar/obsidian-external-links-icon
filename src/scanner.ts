import type { ExternalLinksIconSettings, IconItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getCachedIconImage } from './utils';
import { preferDarkThemeFromDocument, getSvgSourceForTheme } from './svg';
import { getMatchContext, iconMatchesContext, getAllIconsSorted } from './icon-matcher';


export type GetSettingsFn = () => ExternalLinksIconSettings;

export class Scanner {
	private getSettings: GetSettingsFn;
	private scanTimerId: number | null = null;
	private mutationObserver: MutationObserver | null = null;
	private observedRoots: Element[] = [];
	private observeSelectors: string[];
	private iconElementsByName: Map<string, Set<HTMLElement>> = new Map();

	constructor(getSettings: GetSettingsFn, observeSelectors?: string[]) {
		this.getSettings = getSettings;
		this.observeSelectors = observeSelectors || ['.markdown-preview-view', '.view-content', '.workspace-leaf-content'];
	}

	start(): void {
		this.mutationObserver = new MutationObserver((mutations) => {
			if (this.isOwnMutation(mutations)) return;
			this.scheduleScan();
		});

		const observeSelectors = this.observeSelectors;
		const doc = activeDocument;
		const roots = Array.from(doc.querySelectorAll(observeSelectors.join(',')));

		try { this.mutationObserver?.observe(doc.body, { attributes: true, attributeFilter: ['class'] }); } catch { /* ignore */ }

		if (roots.length) {
			this.observedRoots = roots;
			roots.forEach(r => {
				try { this.mutationObserver?.observe(r, { childList: true, subtree: true }); } catch { /* ignore root observe errors */ }
			});
		} else {
			this.observedRoots = [];
			try { this.mutationObserver?.observe(doc.body, { childList: true, subtree: true }); } catch { /* ignore */ }
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

	scheduleScan(delay = 100): void {
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
			if (m.type === 'attributes' && m.attributeName === 'class') {
				return false;
			}
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

	scanAndAnnotateLinks(): void {
		try {
			const preferDark = preferDarkThemeFromDocument();
			this.iconElementsByName.clear();
			const doc = activeDocument;

			// Update icon position body class
			doc.body.classList.remove('external-links-icon-position-before');

			const previewRoots = doc.querySelectorAll('.markdown-preview-view');
			previewRoots.forEach(el => {
				el.querySelectorAll('.external-links-icon-enabled').forEach(child => {
					child.classList.remove('external-links-icon-enabled');
					child.classList.remove('external-links-icon-hide-suffix');
					if (child.instanceOf(HTMLElement)) {
						child.style.removeProperty('--external-link-icon-image');
					}
				});
			});

			const settings = this.getSettings();
			if (settings.iconPosition === 'before') {
				doc.body.classList.add('external-links-icon-position-before');
			}
			const applied = new Set<Element>();
			const icons: IconItem[] = getAllIconsSorted(settings);
			if (!icons.length) return;

			const iconImages = new Map<string, string>();
			for (const icon of icons) {
				try {
					const image = getCachedIconImage(icon.id, icon.svgData, icon.themeDarkSvgData, preferDark);
					iconImages.set(icon.id, image);
				} catch (err) {
					console.warn('Failed to encode icon style for', icon.id, err);
				}
			}

			const rootSources = (this.observedRoots && this.observedRoots.length) ? this.observedRoots : Array.from(previewRoots);
			for (const root of rootSources) {
				const elements = root.querySelectorAll('.external-link, .internal-link');
				if (!elements || elements.length === 0) continue;
				for (const el of Array.from(elements)) {
					if (applied.has(el)) continue;
					if (!el.instanceOf(HTMLElement)) continue;

					const href = el.getAttribute('href') || '';
					const isExternal = el.classList.contains('external-link');
					const isInternal = el.classList.contains('internal-link');

					let chosen: IconItem | null = null;
					const ctx = getMatchContext(href, isExternal, isInternal, this.getSettings());
					for (const icon of icons) {
						if (iconMatchesContext(icon, ctx)) {
							chosen = icon;
							break;
						}
					}

					const dataIcon = el.getAttribute('data-icon') || '';
					if (!chosen && dataIcon) {
						chosen = icons.find(icon => icon.id === dataIcon) || null;
					}

					if (!chosen) continue;
					const image = iconImages.get(chosen.id);
					if (!image) continue;

					try {
						el.style.setProperty('--external-link-icon-image', `url("${image}")`);
						el.classList.add('external-links-icon-enabled');

						if (chosen.linkType === 'scheme') {
							const isBuiltInScheme = Boolean((DEFAULT_SETTINGS.icons || {})[chosen.id]);
							const isCustomScheme = Boolean(settings?.customIcons?.[chosen.id]);
							if (isBuiltInScheme || isCustomScheme) {
								el.classList.add('external-links-icon-hide-suffix');
							}
						}

						applied.add(el);
						let set = this.iconElementsByName.get(chosen.id);
						if (!set) {
							set = new Set<HTMLElement>();
							this.iconElementsByName.set(chosen.id, set);
						}
						set.add(el);
					} catch (err) {
						console.warn('Failed to apply icon style for', chosen.name, err);
					}
				}
			}
		} catch (e) {
			console.error('Failed to scan and annotate links for icons:', e);
		}
	}

	reobserveIfChanged(): void {
		const doc = activeDocument;
		const currentRoots = Array.from(doc.querySelectorAll(this.observeSelectors.join(',')));
		const changed = currentRoots.length !== this.observedRoots.length ||
			!currentRoots.every((r, i) => r === this.observedRoots[i]);
		if (!changed) return;

		this.observedRoots = currentRoots;
		this.mutationObserver?.disconnect();

		try { this.mutationObserver?.observe(doc.body, { attributes: true, attributeFilter: ['class'] }); } catch { /* ignore */ }

		if (currentRoots.length) {
			currentRoots.forEach(r => {
				try { this.mutationObserver?.observe(r, { childList: true, subtree: true }); } catch { /* ignore */ }
			});
		} else {
			try { this.mutationObserver?.observe(doc.body, { childList: true, subtree: true }); } catch { /* ignore */ }
		}
	}

	refreshIconsForThemeChange(): void {
		try {
			if (!this.iconElementsByName.size) return;
			const preferDark = preferDarkThemeFromDocument();
			const settings = this.getSettings();
			const allIcons: Record<string, IconItem> = Object.assign({}, DEFAULT_SETTINGS.icons || {}, settings.customIcons || {});
			const imageCache = new Map<string, string>();
			for (const [name, elements] of this.iconElementsByName) {
				const icon = allIcons[name];
				if (!icon) continue;
				let image = imageCache.get(name);
				if (!image) {
					try {
						image = getCachedIconImage(name, icon.svgData, icon.themeDarkSvgData, preferDark);
						imageCache.set(name, image);
					} catch (err) {
						console.warn('Failed to encode icon style for theme refresh', name, err);
						continue;
					}
				}
				for (const el of Array.from(elements)) {
					if (!el.instanceOf(HTMLElement) || !el.isConnected) {
						elements.delete(el);
						continue;
					}
					try {
						el.style.setProperty('--external-link-icon-image', `url("${image}")`);
					} catch (err) {
						console.warn('Failed to update icon style for theme refresh', name, err);
					}
				}
			}
		} catch (e) {
			console.error('Failed to refresh link icons for theme change:', e);
		}
	}

	handleCssChange(): void {
		this.refreshIconsForThemeChange();
	}

}
