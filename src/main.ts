import { MarkdownView, Plugin } from 'obsidian';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

import { ExternalLinksIconSettings, type IconItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { isValidSvgData } from './utils';
import { ExternalLinksIconSettingTab } from './settings';
import { createLivePreviewExtension } from './live-preview';
import { setLanguage } from './lang/helper';

export default class ExternalLinksIcon extends Plugin {
	settings!: ExternalLinksIconSettings;
	private scanner: import('./scanner').Scanner | null = null;
	private settingsVersion = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ExternalLinksIconSettingTab(this.app, this));

		this.registerEditorExtension(createLivePreviewExtension(() => this.settings));

		if (process.env.NODE_ENV === 'development') {
			this.addCommand({
				id: 'debug-syntax-tree',
				name: 'Debug: dump syntax tree to console',
				callback: () => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view) return;
					const editorView = (view.editor as unknown as { cm: EditorView }).cm;
					if (!editorView) return;

					const d = editorView.state.doc;
					const lines: string[] = ['=== Syntax Tree Debug ==='];
					const seen = new Set<string>();

					const cursor = syntaxTree(editorView.state).cursor();
					let depth = 0;

					function visit() {
						const name = cursor.name;
						if (!seen.has(name)) seen.add(name);
						const from = cursor.from;
						const to = cursor.to;
						const text = d.sliceString(from, Math.min(to, from + 60));
						const indent = '  '.repeat(depth);
						lines.push(`${indent}${name} [${from}..${to}] "${text.replace(/\n/g, '\\n')}"`);

						if (cursor.firstChild()) {
							depth++;
							visit();
							while (cursor.nextSibling()) {
								visit();
							}
							cursor.parent();
							depth--;
						}
					}

					visit();

					lines.push('', '=== All unique node names ===');
					lines.push(...Array.from(seen).sort());

					for (const line of lines) {
						console.debug(line);
					}
				}
			});
		}

		try {
			const Scanner = (await import('./scanner')).Scanner;
			this.scanner = new Scanner(() => this.settings);
			this.scanner.start();
			this.registerEvent(this.app.workspace.on('active-leaf-change', () => { this.scanner?.reobserveIfChanged(); this.scanner?.scheduleScan(0); }));
			this.registerEvent(this.app.workspace.on('layout-change', () => { this.scanner?.reobserveIfChanged(); this.scanner?.scheduleScan(40); }));
			this.registerEvent(this.app.workspace.on('css-change', () => this.scanner?.handleCssChange()))
			this.scanner.scheduleScan();
		} catch {
			this.scanner?.scanAndAnnotateLinks();
		}
	}

	onunload(): void {
		this.scanner?.stop();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as ExternalLinksIconSettings;
		this.validateAndFixSettings();
		this.applyLanguage();
	}

	private validateAndFixSettings(): void {
		let order = 0;
		const migrated: Record<string, IconItem> = {};
		for (const key in this.settings.customIcons) {
			if (Object.prototype.hasOwnProperty.call(this.settings.customIcons, key)) {
				const icon = this.settings.customIcons[key];
				if (typeof icon.order !== 'number') icon.order = order++;
				if (!icon.linkType) icon.linkType = 'url';
				if (!icon.svgData || !isValidSvgData(icon.svgData)) icon.svgData = this.getDefaultSvgData();
				if (!icon.id) icon.id = key;
				migrated[icon.id] = icon;
				order = (icon.order || 0) + 1;
			}
		}
		this.settings.customIcons = migrated;
	}

	getDefaultSvgData(): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>';
	}

	applyLanguage(): void {
		setLanguage(this.settings.language || 'auto');
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.scanner?.scheduleScan();
		this.settingsVersion++;
		this.app.workspace.updateOptions();
	}
}
