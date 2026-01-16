import { Plugin, PluginSettingTab, Setting, App, Notice } from 'obsidian';

import { sanitizeSvg, prepareSvgForSettings, preferDarkThemeFromDocument } from './svg';

import { ExternalLinksIconSettings } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { isValidSvgData } from './utils';
import { ExternalLinksIconSettingTab } from './settings';
import { getIconSelector } from './icon-selector';

// The main plugin implementation. Settings and UI have been moved into `src/settings.ts` and `src/ui.ts`.

export default class ExternalLinksIcon extends Plugin {
	settings!: ExternalLinksIconSettings;
	private scanner: import('./scanner').Scanner | null = null;
	private readonly SCAN_DEBOUNCE_KEY = 'scan-links';

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ExternalLinksIconSettingTab(this.app, this));

		try {
			const Scanner = (await import('./scanner')).Scanner;
			this.scanner = new Scanner(() => this.settings);
			this.scanner.start();
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.scanner?.scheduleScan(0)));
			this.registerEvent(this.app.workspace.on('layout-change', () => this.scanner?.scheduleScan(40)));
			this.registerEvent(this.app.workspace.on('css-change', () => this.scanner?.refreshIconsForThemeChange()))
			this.scanner.scheduleScan();
		} catch {
			this.scanner?.scanAndAnnotateLinks();
		}
	}

	onunload(): void {
		this.scanner?.stop();
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
		this.scanner?.scheduleScan();
	}
}
