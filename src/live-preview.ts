import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
	Decoration, type DecorationSet, EditorView,
	type PluginValue,
	ViewPlugin, type ViewUpdate, WidgetType
} from '@codemirror/view';
import { getCachedIconImage } from './utils';
import { preferDarkThemeFromDocument } from './svg';
import { matchIcon } from './icon-matcher';
import type { GetSettingsFn, GetSettingsVersionFn } from './scanner';

class IconWidget extends WidgetType {
	constructor(readonly iconImage: string, readonly isBefore: boolean) { super(); }

	toDOM(_view: EditorView): HTMLElement {
		const span = createSpan();
		span.className = 'external-links-icon-inline'
			+ (this.isBefore ? ' external-links-icon-position-before' : '');
		span.style.setProperty('--external-link-icon-image', `url("${this.iconImage}")`);
		return span;
	}

	eq(other: IconWidget): boolean {
		return this.iconImage === other.iconImage && this.isBefore === other.isBefore;
	}

	ignoreEvent(): boolean { return true; }
}

const linkMarkDecoration = Decoration.mark({ class: 'external-links-icon-enabled' });

// URI scheme 检测（RFC 3986 scheme = 字母开头，后接字母/数字/+/-/.）
const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
// 向后搜索 `]]` 的窗口上限，防止异常文档（如缺失闭合符）时全量扫描
const ALIAS_END_SEARCH_LIMIT = 500;
// 向前搜索 `[` 的窗口上限，同上
const OPEN_BRACKET_SEARCH_LIMIT = 200;

function isStringUrlNode(name: string): boolean {
	if (name.startsWith('formatting_')) return false;
	return name === 'string_url' || name.endsWith('_string_url');
}

function isInternalLinkNode(name: string): boolean {
	if (name.startsWith('formatting_')) return false;
	// 精确匹配 target 节点；天然排除 embed（hmd-embed_*）与 alias/pipe 子类型节点。
	// 光标不在行上时，带 alias 的 wikilink 被拆为兄弟节点：
	//   [[target|alias]] → hmd-internal-link_link-has-alias(target) + _link-alias-pipe + _link-alias(alias)
	return name === 'hmd-internal-link' || name === 'hmd-internal-link_link-has-alias';
}

interface LinkInfo {
	linkFrom: number;
	linkTo: number;
	href: string;
}

function findLinkInfoForStringUrl(view: EditorView, stringUrlNode: { from: number; to: number }): LinkInfo | null {
	let href = view.state.doc.sliceString(stringUrlNode.from, stringUrlNode.to);
	if (!href) return null;

	if (href.startsWith('`') && href.endsWith('`') && href.length > 2) {
		href = href.slice(1, -1);
	}

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
	const searchStart = Math.max(0, stringUrlNode.from - OPEN_BRACKET_SEARCH_LIMIT);
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
	private getSettingsVersion: GetSettingsVersionFn;
	private lastSettingsVersion = 0;
	private lastCursorLine = -1;

	constructor(view: EditorView, getSettings: GetSettingsFn, getSettingsVersion: GetSettingsVersionFn) {
		this.getSettings = getSettings;
		this.getSettingsVersion = getSettingsVersion;
		this.decorations = this.buildDecorations(view);
	}

	update(update: ViewUpdate): void {
		const newVersion = this.getSettingsVersion();
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
		const settingsVersion = this.getSettingsVersion();
		const preferDark = preferDarkThemeFromDocument();
		const cursorPos = view.state.selection.main.head;
		const cursorLine = view.state.doc.lineAt(cursorPos).number;
		const isBefore = settings.iconPosition === 'before';

		const decoItems: { from: number; to: number; decoration: Decoration }[] = [];

		for (const { from, to } of view.visibleRanges) {
			syntaxTree(view.state).iterate({
				from,
				to,
				enter(node) {
					if (isStringUrlNode(node.name)) {
						const info = findLinkInfoForStringUrl(view, node);
						if (!info) return;

						const linkLine = view.state.doc.lineAt(info.linkFrom);
						if (linkLine.number === cursorLine) return;

						// 无 URI scheme 的 markdown link（相对/绝对路径）指向库内文件，按内部链接匹配
						const hasScheme = URI_SCHEME_RE.test(info.href);
						const chosen = matchIcon(info.href, hasScheme, !hasScheme, settings, settingsVersion);
						if (!chosen) return;

						let image: string | undefined;
						try {
							image = getCachedIconImage(chosen.id, chosen.svgData, chosen.themeDarkSvgData, preferDark);
						} catch { /* skip failed icons */ }
						if (!image) return;

						decoItems.push({
							from: isBefore ? info.linkFrom : info.linkTo,
							to: isBefore ? info.linkFrom : info.linkTo,
							decoration: Decoration.widget({
								widget: new IconWidget(image, isBefore),
								side: isBefore ? -1 : 1
							})
						});

						decoItems.push({
							from: info.linkFrom,
							to: info.linkTo,
							decoration: linkMarkDecoration
						});
					} else if (isInternalLinkNode(node.name)) {
						const linkFrom = node.from;
						const linkLine = view.state.doc.lineAt(linkFrom);

						if (linkLine.number === cursorLine) return;

						const nodeText = view.state.doc.sliceString(node.from, node.to);
						let href = '';
						const pipeIdx = nodeText.indexOf('|');
						if (pipeIdx >= 0) {
							href = nodeText.slice(0, pipeIdx);
						} else {
							href = nodeText;
						}

						if (!href) return;

						const chosen = matchIcon(href, false, true, settings, settingsVersion);
						if (!chosen) return;

						let image: string | undefined;
						try {
							image = getCachedIconImage(chosen.id, chosen.svgData, chosen.themeDarkSvgData, preferDark);
						} catch { /* skip failed icons */ }
						if (!image) return;

						// wikilink 边界：`[[` 在 target 节点前 2 字符处；
						// 带 alias 时 target 之后还有 `|alias`，需向后搜索 `]]` 才是真正的链接结尾
						const markFrom = node.from - 2;
						let markTo = node.to + 2;
						if (node.name.endsWith('_link-has-alias')) {
							const rest = view.state.doc.sliceString(node.to, Math.min(node.to + ALIAS_END_SEARCH_LIMIT, view.state.doc.length));
							const close = rest.indexOf(']]');
							if (close < 0) return;
							markTo = node.to + close + 2;
						}

						decoItems.push({
							from: isBefore ? markFrom : markTo,
							to: isBefore ? markFrom : markTo,
							decoration: Decoration.widget({
								widget: new IconWidget(image, isBefore),
								side: isBefore ? -1 : 1
							})
						});

						decoItems.push({
							from: markFrom,
							to: markTo,
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

export function createLivePreviewExtension(getSettings: GetSettingsFn, getSettingsVersion: GetSettingsVersionFn): Extension[] {
	return [
		ViewPlugin.fromClass(
			class extends LivePreviewIconPlugin {
				constructor(view: EditorView) {
					super(view, getSettings, getSettingsVersion);
				}
			},
			{
				decorations: (v) => v.decorations
			}
		)
	];
}
