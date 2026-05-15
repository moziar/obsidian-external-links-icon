import { getLanguage } from 'obsidian';
import en from './locale/en';
import zhCN from './locale/zh-cn';

const localeMap: Record<string, Record<keyof typeof en, string>> = {
	en,
	zh: zhCN,
	'zh-CN': zhCN,
	'zh-TW': zhCN,
	'zh-Hans': zhCN,
};

let overrideLang: string | null = null;

export function setLanguage(lang: string | null): void {
	overrideLang = lang;
}

export function t(str: keyof typeof en): string {
	let lang: string;
	if (overrideLang && overrideLang !== 'auto') {
		lang = overrideLang;
	} else {
		lang = getLanguage();
	}
	const locale = localeMap[lang];
	return (locale && locale[str]) || en[str];
}
