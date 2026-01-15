import { Plugin, PluginSettingTab, Setting, App, Notice } from 'obsidian';

import { sanitizeSvg, prepareSvgForSettings, preferDarkThemeFromDocument } from './svg';

import { LinkType, IconItem, ExternalLinksIconSettings } from './types';
import { ICON_CATEGORIES, CSS_SELECTORS, CSS_CONSTANTS, DEFAULT_SETTINGS } from './constants';
import { encodeSvgData, isValidSvgData } from './utils';
import { ExternalLinksIconSettingTab } from './settings';
import { getIconSelector } from './icon-selector';

// The main plugin implementation. Settings and UI have been moved into `src/settings.ts` and `src/ui.ts`.

export default class ExternalLinksIcon extends Plugin {
	settings!: ExternalLinksIconSettings;
	private generatedCss = '';
	private scanner: import('./scanner').Scanner | null = null;
	private readonly SCAN_DEBOUNCE_KEY = 'scan-links';

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ExternalLinksIconSettingTab(this.app, this));
		this.applyIconStyles();

		try {
			const Scanner = (await import('./scanner')).Scanner;
			this.scanner = new Scanner(() => this.settings);
			this.scanner.start();
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scanner?.scheduleScan()));
			this.registerEvent(this.app.workspace.on('layout-change', () => this.scanner?.scheduleScan()));
			this.scanner.scheduleScan();
		} catch {
			this.scanner?.scanAndAnnotateLinks();
		}
	}

	onunload(): void {
		this.removeIconStyles();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.validateAndFixSettings();
	}

	private validateAndFixSettings(): void {
		let order = 0;
		for (const key in this.settings.customIcons) {
			if (Object.prototype.hasOwnProperty.call(this.settings.customIcons, key)) {
				const icon = this.settings.customIcons[key];
				if (typeof icon.order !== 'number') icon.order = order++;
				if (!icon.linkType) icon.linkType = 'url';
				if (!icon.svgData || !isValidSvgData(icon.svgData)) icon.svgData = this.getDefaultSvgData();
			}
		}
	}

	getDefaultSvgData(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>';
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.applyIconStyles();
	}

	private removeIconStyles(): void {
		this.generatedCss = '';
		document.querySelectorAll('.external-links-icon-inline').forEach(el => el.remove());
		// remove injected style element if present
		try {
			const old = document.getElementById(CSS_CONSTANTS.STYLE_ID);
			if (old && old.parentNode) old.parentNode.removeChild(old);
		} catch (e) { /* ignore DOM errors */ }
		this.scanner?.stop();
	}

	private applyIconStyles(): void {
		this.generatedCss = this.generateCSS();
		// ensure style element exists and update its content
		try {
			let styleEl = document.getElementById(CSS_CONSTANTS.STYLE_ID);
			if (!styleEl) {
				styleEl = document.createElement('style');
				styleEl.id = CSS_CONSTANTS.STYLE_ID;
				document.head && document.head.appendChild(styleEl);
			}
			styleEl.textContent = this.generatedCss;
		} catch (e) { /* ignore DOM errors */ }
		this.scanner?.scheduleScan();
	}

	private generateCSS(): string {
		const cssRules: string[] = [];
		cssRules.push(this.getBaseCSSRules());
		const predefinedIcons = this.getSortedIcons(DEFAULT_SETTINGS.icons || {});
		predefinedIcons.forEach(icon => cssRules.push(this.generateIconCSS(icon)));
		const customIcons = this.getSortedIcons(this.settings.customIcons || {});
		customIcons.forEach(icon => cssRules.push(this.generateIconCSS(icon)));
		return cssRules.filter(rule => rule.trim()).join('\n');
	}

	private getBaseCSSRules(): string {
		return `:root { --external-link-icon-size: ${CSS_CONSTANTS.ICON_SIZE}; }
		.external-link::after, .internal-link::after { box-shadow: none !important; -webkit-box-shadow: none !important; filter: none !important; -webkit-filter: none !important; background-repeat: no-repeat !important; background-size: contain !important; background-position: center !important; vertical-align: middle !important; }`;
	}
	private getSortedIcons(icons: Record<string, IconItem>): IconItem[] { return Object.values(icons).sort((a,b)=> (a.order||0)-(b.order||0)); }
	private generateIconCSS(icon: IconItem): string {
		try { const encodedSvg = encodeSvgData(icon.svgData); if (icon.themeDarkSvgData) return this.generateThemeSpecificCSS(icon, encodedSvg); return this.generateSingleThemeCSS(icon, encodedSvg); } catch { return ''; }
	}

	private generateThemeSpecificCSS(icon: IconItem, lightEncodedSvg: string): string {
		try {
			const darkEncodedSvg = icon.themeDarkSvgData ? encodeSvgData(icon.themeDarkSvgData) : undefined;
			const selector = this.getIconSelector(icon);
			const baseAfter = `content: " "; display: inline-block; width: ${CSS_CONSTANTS.ICON_SIZE}; height: ${CSS_CONSTANTS.ICON_SIZE}; margin-left: ${CSS_CONSTANTS.ICON_MARGIN}; background-size: contain; background-repeat: no-repeat; background-position: center; vertical-align: middle;`;
			const wrapWithTheme = (sel: string, themeClass: string) => sel.split(',').map(s => { s = s.trim(); if (/^body\b/.test(s)) return s.replace(/^body\b/, `body.${themeClass}`); return `body.${themeClass} ${s}`; }).join(', ');
			const lightSelector = wrapWithTheme(selector, 'theme-light');
			const darkSelector = wrapWithTheme(selector, 'theme-dark');
			return `\n\t\t\t\t${lightSelector} { background: none; padding-right: 0; }\n\t\t\t\t${darkSelector} { background: none; padding-right: 0; }\n\t\t\t\t${lightSelector}::after { ${baseAfter} background-image: url("${lightEncodedSvg}"); }\n\t\t\t\t${darkSelector}::after { ${baseAfter} background-image: url("${darkEncodedSvg}"); }\n\t\t`;
		} catch { return this.generateSingleThemeCSS(icon, lightEncodedSvg); }
	}

	private generateSingleThemeCSS(icon: IconItem, encodedSvg: string): string { const selector = getIconSelector(icon).trim(); const baseAfter = `content: " "; display: inline-block; width: ${CSS_CONSTANTS.ICON_SIZE}; height: ${CSS_CONSTANTS.ICON_SIZE}; margin-left: ${CSS_CONSTANTS.ICON_MARGIN}; background-size: contain; background-repeat: no-repeat; background-position: center; vertical-align: middle;`; const parts = selector.split(',').map(s => s.trim()).filter(Boolean); const rules: string[] = []; for (const p of parts) { rules.push(`${p} { background: none; padding-right: 0; }`); rules.push(`${p}::after { ${baseAfter} background-image: url("${encodedSvg}"); }`); } return rules.join('\n'); }

	private getIconSelector(icon: IconItem): string {
		if (this.isSpecialIcon(icon.name)) return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
		if (icon.linkType === 'scheme') { const scheme = icon.target || icon.name; return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`; }
		if (this.isSpecialWebIcon(icon.name)) return ICON_CATEGORIES.SPECIAL[icon.name].selector.replace(/:?:after/g, '');
		const domain = this.getWebDomain(icon.name);
		if (domain) return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`;
		if (icon.linkType === 'url') { const domain = icon.target || icon.name; return `${CSS_SELECTORS.WEB_LINK}[href*="${domain}"]`; }
		if (this.isUrlSchemeIcon(icon.name) && !icon.linkType) { const scheme = icon.target || icon.name; return `${CSS_SELECTORS.URL_SCHEME}[href^="${scheme}://"]`; }
		return `${CSS_SELECTORS.CUSTOM_DATA}[data-icon="${icon.name}"]`;
	}

	private isSpecialIcon(iconName: string): iconName is keyof typeof ICON_CATEGORIES.SPECIAL { return iconName in ICON_CATEGORIES.SPECIAL; }
	private isSpecialWebIcon(iconName: string): boolean { return iconName in ICON_CATEGORIES.SPECIAL && !ICON_CATEGORIES.URL_SCHEME.includes(String(iconName)); }
	private isUrlSchemeIcon(iconName: string): boolean { return ICON_CATEGORIES.URL_SCHEME.includes(String(iconName)); }
	private getWebDomain(iconName: string): string | undefined { return ICON_CATEGORIES.WEB[iconName as keyof typeof ICON_CATEGORIES.WEB]; }
}