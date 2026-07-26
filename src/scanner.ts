import type { ExternalLinksIconSettings, IconItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getCachedIconImage } from './utils';
import { preferDarkThemeFromDocument } from './svg';
import { getMatchContext, iconMatchesContext, getAllIconsSorted } from './icon-matcher';
import { MarkdownRenderChild } from 'obsidian';


export type GetSettingsFn = () => ExternalLinksIconSettings;
export type GetSettingsVersionFn = () => number;

/**
 * MarkdownRenderChild that manages icons for links within a single rendered section.
 * Created by registerMarkdownPostProcessor and bound to the section's lifecycle:
 * when core post-processors (callouts, task lists) rebuild the DOM, this child
 * unloads automatically, cleaning up any icons it applied. The next post-processor
 * pass creates a fresh child for the rebuilt DOM — no flicker, no stale state.
 */
export class IconLinkRenderChild extends MarkdownRenderChild {
	private getSettings: GetSettingsFn;
	private getSettingsVersion: GetSettingsVersionFn;
	private scanner: Scanner;
	private managedElements: Set<HTMLElement> = new Set();

	constructor(containerEl: HTMLElement, scanner: Scanner) {
		super(containerEl);
		this.scanner = scanner;
		this.getSettings = scanner.getSettings;
		this.getSettingsVersion = scanner.getSettingsVersion;
	}

	onload(): void {
		try {
			const containerEl = this.containerEl;
			const settings = this.getSettings();
			const settingsVersion = this.getSettingsVersion();
			const preferDark = preferDarkThemeFromDocument();
			const icons: IconItem[] = getAllIconsSorted(settings, settingsVersion);

			const links = containerEl.querySelectorAll('.external-link, .internal-link');
			for (const el of Array.from(links)) {
				if (!el.instanceOf(HTMLElement)) continue;

				const href = el.getAttribute('href') || '';
				const isExternal = el.classList.contains('external-link');
				const isInternal = el.classList.contains('internal-link');

				let chosen: IconItem | null = null;
				const ctx = getMatchContext(href, isExternal, isInternal, settings);
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

				let image: string | undefined;
				try {
					image = getCachedIconImage(chosen.id, chosen.svgData, chosen.themeDarkSvgData, preferDark);
				} catch { /* skip failed icons */ }
				if (!image) continue;

				el.style.setProperty('--external-link-icon-image', `url("${image}")`);
			el.classList.add('external-links-icon-enabled');

			this.managedElements.add(el);
				this.scanner.registerIconElement(chosen.id, el);
			}
		} catch (e) {
			console.error('Failed to annotate links in IconLinkRenderChild.onload:', e);
		}
	}

	onunload(): void {
		for (const el of this.managedElements) {
			try {
				el.classList.remove('external-links-icon-enabled');
				el.style.removeProperty('--external-link-icon-image');
			} catch { /* element may already be detached */ }
			this.scanner.unregisterIconElement(el);
		}
		this.managedElements.clear();
	}
}

export class Scanner {
	getSettings: GetSettingsFn;
	getSettingsVersion: GetSettingsVersionFn;
	private scanTimerId: number | null = null;
	private mutationObserver: MutationObserver | null = null;
	private observedRoots: Element[] = [];
	private observeSelectors: string[];
	private iconElementsByName: Map<string, Set<HTMLElement>> = new Map();
	private lastSettingsVersion = -1;
	private lastPreferDark: boolean | null = null;

	constructor(getSettings: GetSettingsFn, observeSelectors?: string[], getSettingsVersion?: GetSettingsVersionFn) {
		this.getSettings = getSettings;
		this.getSettingsVersion = getSettingsVersion || (() => 0);
		this.observeSelectors = observeSelectors || ['.markdown-preview-view', '.view-content', '.workspace-leaf-content'];
	}

	start(): void {
		this.mutationObserver = new MutationObserver((mutations) => {
			if (this.isOwnMutation(mutations)) return;
			// Fallback for dynamic DOM changes post-render (embeds, etc.). Initial render
			// is handled by registerMarkdownPostProcessor in main.ts, so no delay needed here.
			window.requestAnimationFrame(() => this.scheduleScan(0));
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

		// Initial scan removed: registerMarkdownPostProcessor handles reading mode render
		// timing precisely. layout-change / active-leaf-change events cover other cases.
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
			const doc = activeDocument;

			const settings = this.getSettings();
			const settingsVersion = this.getSettingsVersion();
			const icons: IconItem[] = getAllIconsSorted(settings, settingsVersion);

			// Update icon position body class
			doc.body.classList.remove('external-links-icon-position-before');
			if (settings.iconPosition === 'before') {
				doc.body.classList.add('external-links-icon-position-before');
			}

			const previewRoots = doc.querySelectorAll('.markdown-preview-view');

			// Check if anything has actually changed
			const settingsOrThemeChanged = this.lastSettingsVersion !== settingsVersion || this.lastPreferDark !== preferDark;
			
			// Pre-compute all icon images
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

			// Track elements that need icon changes
			const elementsToUpdate: Array<{ el: HTMLElement; shouldHaveIcon: boolean; iconId?: string; image?: string }> = [];
			const processedElements = new Set<Element>();

			for (const root of rootSources) {
				const elements = root.querySelectorAll('.external-link, .internal-link');
				if (!elements || elements.length === 0) continue;

				for (const el of Array.from(elements)) {
					if (processedElements.has(el)) continue;
					if (!el.instanceOf(HTMLElement)) continue;

					processedElements.add(el);

					const href = el.getAttribute('href') || '';
					const isExternal = el.classList.contains('external-link');
					const isInternal = el.classList.contains('internal-link');

					let chosen: IconItem | null = null;
					const ctx = getMatchContext(href, isExternal, isInternal, settings);
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

					if (chosen) {
					const image = iconImages.get(chosen.id);
					if (image) {
						elementsToUpdate.push({
							el,
							shouldHaveIcon: true,
							iconId: chosen.id,
							image,
						});
					} else {
						elementsToUpdate.push({ el, shouldHaveIcon: false });
					}
				} else {
					elementsToUpdate.push({ el, shouldHaveIcon: false });
				}
				}
			}

			if (settingsOrThemeChanged) {
		// Full refresh: settings or theme changed. IconLinkRenderChild manages element
		// registration via its own onload/onunload, so we only need to update styles
		// on already-annotated elements here. Don't clear iconElementsByName — children
		// own its contents.
		for (const update of elementsToUpdate) {
			if (update.shouldHaveIcon && update.iconId && update.image) {
				try {
					update.el.style.setProperty('--external-link-icon-image', `url("${update.image}")`);
				} catch (err) {
					console.warn('Failed to apply icon style for', update.iconId, err);
				}
			} else if (!update.shouldHaveIcon) {
				// Element lost its icon (e.g., link type no longer matches)
				update.el.classList.remove('external-links-icon-enabled');
				update.el.style.removeProperty('--external-link-icon-image');
				this.unregisterIconElement(update.el);
			}
		}
	} else {
		// Incremental update: only update elements whose icon actually changed.
		// IconLinkRenderChild owns iconElementsByName; we just refresh styles here.
		for (const update of elementsToUpdate) {
			const el = update.el;
			const hasIcon = el.classList.contains('external-links-icon-enabled');
			const currentImage = el.style.getPropertyValue('--external-link-icon-image');

			if (update.shouldHaveIcon) {
				const expectedImage = `url("${update.image}")`;

				if (!hasIcon || currentImage !== expectedImage) {
					el.style.setProperty('--external-link-icon-image', expectedImage);
					el.classList.add('external-links-icon-enabled');
				}
			} else {
				if (hasIcon) {
					el.classList.remove('external-links-icon-enabled');
					el.style.removeProperty('--external-link-icon-image');
					this.unregisterIconElement(el);
				}
			}
		}
	}

		this.lastSettingsVersion = settingsVersion;
		this.lastPreferDark = preferDark;
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

	/**
	 * Register an element annotated by an IconLinkRenderChild. Called on child.onload.
	 * Maintains the iconElementsByName index for theme-change refresh and full scans.
	 */
	registerIconElement(iconId: string, el: HTMLElement): void {
		let set = this.iconElementsByName.get(iconId);
		if (!set) {
			set = new Set<HTMLElement>();
			this.iconElementsByName.set(iconId, set);
		}
		set.add(el);
	}

	/**
	 * Unregister an element when its IconLinkRenderChild unloads.
	 * Called automatically on DOM rebuild (callout restructuring, etc.).
	 */
	unregisterIconElement(el: HTMLElement): void {
		for (const set of this.iconElementsByName.values()) {
			set.delete(el);
		}
	}

}
