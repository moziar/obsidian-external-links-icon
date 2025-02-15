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

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
}
