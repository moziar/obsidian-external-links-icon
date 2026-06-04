import type { ExternalLinksIconSettings } from './types';

export const ICON_CATEGORIES = {
	URL_SCHEME: [
		'goodlinks', 'zotero', 'snippetslab', 'siyuan', 'eagle', 
		'bear', 'prodrafts', 'things', 'shortcut', 'file', 'craft', 'obsidiannote', 'advancedurisetting'
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
		'cloud.google': 'cloud.google.com',
		'zhihu': 'zhihu.com',
		'latepost': 'latepost.com'
	}
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
};
