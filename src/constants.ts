import type { IconCategories, ExternalLinksIconSettings } from './types';

export const ICON_CATEGORIES: IconCategories = {
	URL_SCHEME: [
		'goodlinks', 'zotero', 'snippetslab', 'siyuan', 'eagle', 
		'bear', 'prodrafts', 'things', 'shortcut', 'file'
	] as const,
	WEB: {
		'github': 'github.com',
		'sspai': 'sspai.com',
		'mp.weixin.qq': 'mp.weixin.qq.com',
		'xiaoyuzhoufm': 'xiaoyuzhoufm.com',
		'douban': 'douban.com',
		'bilibili': 'bilibili.com',
		'youtube': 'youtube.com',
		'medium': 'medium.com',
		'ollama': 'ollama.com',
		'modelscope': 'modelscope.cn',
		'huggingface': 'huggingface.co',
		'openrouter': 'openrouter.ai',
		'siliconflow': 'siliconflow.cn',
		'douyin': 'douyin.com',
		'v.douyin': 'v.douyin.com',
		'tiktok': 'tiktok.com',
		'baidu': 'baidu.com',
		'v.flomo': 'v.flomoapp.com',
		'wikipedia': 'wikipedia.org',
		'archive': 'archive.org',
		'google': 'google.com',
		'docs.google': 'docs.google.com',
		'cloud.google': 'cloud.google.com'
	},
	SPECIAL: {
		'obsidianweb': {
			selector: 'body.fancy-obsidian-web-link .external-link[href^="https://"][href*="obsidian.md"]'
		},
		'obsidiannote': {
			selector: 'body.fancy-internal-obsidian-link .internal-link, body.fancy-both-obsidian-link .internal-link, body.fancy-external-obsidian-link .external-link[href^="obsidian://"]:not([href^="obsidian://adv-uri"][href*="settingid"]), body.fancy-both-obsidian-link .external-link[href^="obsidian://"]:not([href^="obsidian://adv-uri"][href*="settingid"])'
		},
		'advancedurisetting': {
			selector: 'body.fancy-advanced-uri-link .external-link[href^="obsidian://adv-uri"][href*="settingid"]'
		},
		'google': {
			selector: 'body.fancy-web-link .external-link[href^="https://"][href*="google.com"]:not([href*="docs.google.com"]):not([href*="cloud.google.com"])'
		},
		'googledocs': {
			selector: 'body.fancy-web-link .external-link[href^="https://"][href*="docs.google.com"]'
		},
		'googlecloud': {
			selector: 'body.fancy-web-link .external-link[href^="https://"][href*="cloud.google.com"]'
		}
	}
};

export const CSS_SELECTORS = {
	URL_SCHEME: '.external-link',
	WEB_LINK: '.external-link[href^="http"]',
	CUSTOM_DATA: '.external-link'
} as const;

export const CSS_CONSTANTS = {
	ICON_SIZE: '0.8em',
	ICON_MARGIN: '3px',
	STYLE_ID: 'external-links-icon-styles'
} as const;

import { BUILTIN_ICONS } from './builtin-icons';

export const DEFAULT_SETTINGS: ExternalLinksIconSettings = {
	icons: BUILTIN_ICONS,
	customIcons: {}
};
