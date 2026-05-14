import { syntaxTree } from '@codemirror/language';
import { Facet, RangeSetBuilder, type Extension } from '@codemirror/state';
import {
	Decoration, type DecorationSet, EditorView,
	type PluginValue,
	ViewPlugin, type ViewUpdate, WidgetType
} from '@codemirror/view';
import type { IconItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { getCachedIconImage } from './utils';
import { preferDarkThemeFromDocument } from './svg';
import { matchIcon, getSortedIcons } from './icon-matcher';
import type { GetSettingsFn } from './scanner';

export const settingsVersionFacet = Facet.define<number, number>({
	combine: (values) => values[0] ?? 0
});

class IconWidget extends WidgetType {
	constructor(readonly iconImage: string, readonly hideSuffix: boolean) { super(); }

	toDOM(_view: EditorView): HTMLElement {
		const span = activeDocument.createElement('span');
		span.className = 'external-links-icon-inline' + (this.hideSuffix ? ' external-links-icon-hide-suffix' : '');
		span.style.setProperty('--external-link-icon-image', `url("${this.iconImage}")`);
		return span;
	}

	eq(other: IconWidget): boolean {
		return this.iconImage === other.iconImage && this.hideSuffix === other.hideSuffix;
	}

	ignoreEvent(): boolean { return true; }
}

const linkMarkDecoration = Decoration.mark({ class: 'external-links-icon-enabled' });
const linkMarkHideSuffixDecoration = Decoration.mark({ class: 'external-links-icon-enabled external-links-icon-hide-suffix' });

interface LinkInfo {
	linkFrom: number;
	linkTo: number;
	href: string;
}

function findLinkInfoForStringUrl(view: EditorView, stringUrlNode: { from: number; to: number }): LinkInfo | null {
	const href = view.state.doc.sliceString(stringUrlNode.from, stringUrlNode.to);
	if (!href) return null;

	const urlEnd = stringUrlNode.to;
	const docEnd = view.state.doc.length;

	let closeParenPos = -1;
	if (urlEnd < docEnd) {
		const nextChar = view.state.doc.sliceString(urlEnd, urlEnd + 1);
		if (nextChar === ')') {
			closeParenPos = urlEnd + 1;
		}
	}
	if (closeParenPos < 0) return null;

	const linkTo = closeParenPos;

	let openBracketPos = -1;
	const searchStart = Math.max(0, stringUrlNode.from - 200);
	const textBefore = view.state.doc.sliceString(searchStart, stringUrlNode.from);
	const lastOpenBracket = textBefore.lastIndexOf('[');
	if (lastOpenBracket >= 0) {
		openBracketPos = searchStart + lastOpenBracket;
	}
	if (openBracketPos < 0) return null;

	const linkFrom = openBracketPos;

	return { linkFrom, linkTo, href };
}

class LivePreviewIconPlugin implements PluginValue {
	decorations: DecorationSet = Decoration.none;
	private getSettings: GetSettingsFn;
	private lastSettingsVersion = 0;
	private lastCursorLine = -1;

	constructor(view: EditorView, getSettings: GetSettingsFn) {
		this.getSettings = getSettings;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		const newVersion = update.state.facet(settingsVersionFacet);
		const versionChanged = newVersion !== this.lastSettingsVersion;

		const cursorPos = update.state.selection.main.head;
		const cursorLine = update.state.doc.lineAt(cursorPos).number;
		const cursorLineChanged = cursorLine !== this.lastCursorLine;
		this.lastCursorLine = cursorLine;

		if (update.docChanged || update.viewportChanged || versionChanged || cursorLineChanged) {
			this.lastSettingsVersion = newVersion;
			this.decorations = this.buildDecorations(update.view);
		}
	}

	destroy(): void {}

	buildDecorations(view: EditorView): DecorationSet {
		const builder = new RangeSetBuilder<Decoration>();
		const settings = this.getSettings();
		const preferDark = preferDarkThemeFromDocument();
		const cursorPos = view.state.selection.main.head;
		const cursorLine = view.state.doc.lineAt(cursorPos).number;

		const icons: IconItem[] = getSortedIcons(DEFAULT_SETTINGS.icons || {}).concat(getSortedIcons(settings.customIcons || {}));
		if (!icons.length) {
			return builder.finish();
		}

		const iconImageCache = new Map<string, string>();
		for (const icon of icons) {
			if (!iconImageCache.has(icon.name)) {
				try {
					const image = getCachedIconImage(icon.name, icon.svgData, icon.themeDarkSvgData, preferDark);
					iconImageCache.set(icon.name, image);
				} catch {
					// skip failed icons
				}
			}
		}

		const decoItems: { from: number; to: number; decoration: Decoration }[] = [];

		for (const { from, to } of view.visibleRanges) {
			syntaxTree(view.state).iterate({
				from,
				to,
				enter(node) {
					if (node.name === 'string_url') {
						const info = findLinkInfoForStringUrl(view, node);
						if (!info) return;

						const linkLine = view.state.doc.lineAt(info.linkFrom);
						if (linkLine.number === cursorLine) return;

						const chosen = matchIcon(info.href, true, false, settings);
						if (!chosen) return;

						const image = iconImageCache.get(chosen.name);
						if (!image) return;

						const hideSuffix = chosen.linkType === 'scheme' &&
							(Boolean((DEFAULT_SETTINGS.icons || {})[chosen.name]) ||
								Boolean(settings?.customIcons?.[chosen.name]));

						decoItems.push({
							from: info.linkTo,
							to: info.linkTo,
							decoration: Decoration.widget({
								widget: new IconWidget(image, hideSuffix),
								side: 1
							})
						});

						decoItems.push({
							from: info.linkFrom,
							to: info.linkTo,
							decoration: hideSuffix ? linkMarkHideSuffixDecoration : linkMarkDecoration
						});
					} else if (node.name === 'hmd-internal-link') {
						const linkFrom = node.from;
						const linkLine = view.state.doc.lineAt(linkFrom);

						if (linkLine.number === cursorLine) return;

						const fullText = view.state.doc.sliceString(node.from, node.to);
						let href = '';
						if (fullText.startsWith('[[')) {
							const pipeIdx = fullText.indexOf('|');
							if (pipeIdx >= 0) {
								href = fullText.slice(2, pipeIdx);
							} else {
								href = fullText.slice(2, fullText.length - 2);
							}
						}

						if (!href) return;

						const chosen = matchIcon(href, false, true, settings);
						if (!chosen) return;

						const image = iconImageCache.get(chosen.name);
						if (!image) return;

						const endPos = node.to + 2;

						decoItems.push({
							from: endPos,
							to: endPos,
							decoration: Decoration.widget({
								widget: new IconWidget(image, false),
								side: 1
							})
						});

						decoItems.push({
							from: node.from,
							to: endPos,
							decoration: linkMarkDecoration
						});
					}
				}
			});
		}

		decoItems.sort((a, b) => a.from - b.from || a.to - b.to);
		for (const item of decoItems) {
			builder.add(item.from, item.to, item.decoration);
		}

		return builder.finish();
	}
}

export function createLivePreviewExtension(getSettings: GetSettingsFn): Extension[] {
	return [
		settingsVersionFacet.of(0),
		ViewPlugin.fromClass(
			class extends LivePreviewIconPlugin {
				constructor(view: EditorView) {
					super(view, getSettings);
				}
			},
			{
				decorations: (v) => v.decorations
			}
		)
	];
}
