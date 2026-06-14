import type { ExternalLinksIconSettings } from './types';

export const ICON_CATEGORIES = {
	URL_SCHEME: [
		'goodlinks', 'zotero', 'snippetslab', 'siyuan', 'eagle',
		'bear', 'prodrafts', 'things', 'shortcut', 'file', 'craft', 'obsidiannote', 'advancedurisetting','notion-scheme'
	] as const,
	WEB: [
		'github', 'sspai', 'mp.weixin.qq', 'xiaoyuzhoufm', 'douban',
		'bilibili', 'youtube', 'medium', 'ollama', 'modelscope',
		'huggingface', 'openrouter', 'siliconflow', 'douyin', 'baidu',
		'flomo', 'wikipedia', 'archive', 'docs.google', 'google sheet',
		'google slides', 'google play', 'cloud.google', 'google maps',
		'google', 'obsidianweb', 'zhihu', 'latepost', 'feishu', 'notion', 'app store'
	] as const,
};

import { BUILTIN_ICONS } from './builtin-icons';

export const DEFAULT_SETTINGS: ExternalLinksIconSettings = {
	icons: BUILTIN_ICONS,
	customIcons: {},
	language: 'auto',
	fancyUrlScheme: true,
	fancyWebLink: true,
	fancyObsidianWebLink: true,
	fancyObsidianNoteLink: 'none',
	fancyAdvancedUriLink: true,
	iconPosition: 'after',
};
