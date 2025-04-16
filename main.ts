import {Plugin} from 'obsidian';

interface ExternalLinksIconSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: ExternalLinksIconSettings = {
	mySetting: 'default'
}

export default class ExternalLinksIcon extends Plugin {
	settings: ExternalLinksIconSettings;

	async onload() {
		await this.loadSettings();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
}
