## External links icon
[![GitHub Release](https://img.shields.io/github/v/release/moziar/obsidian-external-links-icon)](https://github.com/moziar/obsidian-external-links-icon/releases/latest)
[![Total Downloads](https://img.shields.io/github/downloads/moziar/obsidian-external-links-icon/total?label=Total%20Downloads)](https://github.com/moziar/obsidian-external-links-icon/releases)
[![Latest Downloads](https://img.shields.io/github/downloads/moziar/obsidian-external-links-icon/latest/total?label=Latest%20Downloads)](https://github.com/moziar/obsidian-external-links-icon/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/moziar/obsidian-external-links-icon?label=Last%20Commit)](https://github.com/moziar/obsidian-external-links-icon/commits/master)

A simple plugin that automatically adds icons to the external and internal links, designed to work seamlessly in your local environment.

![demo.png](demo.png)

<details>
	<summary><h2>Built-in links</h2></summary>

![links](links.png)

### URL Scheme
- GoodLinks
- Zotero
- SnippetsLab
- SiYuan Note
- Eagle
- Bear
- Prodrafts
- Things
- Apple Shortcuts
- Advanced-URI

### WebSite
- Github
- 少数派 SSPai
- 微信公众号
- Medium
- 小宇宙 FM
- 豆瓣 Douban
- 哔哩哔哩 BiliBili
- YouTube
- Ollama
- ModelScope
- Hugging Face
- OpenRouter
- SiliconFlow
- 抖音/TikTok
- Baidu
- flomo
- Wikipedia
- Archive.org
- Google Docs
- Google Cloud
- Other Google site

### Obsidian
- Website
  - official site
  - help doc
  - forum
- Note Link
  - internal link
  - external vault link

</details>

## Custom Icons
To add a custom icon, click **Add Website** or **Add URL Scheme** in the settings.

- Only **SVG** format is supported.
- We recommend compressing your SVG file before uploading to improve performance.

## Performance
This plugin is designed for high performance.

Every image has been meticulously optimized, with most displayed in `SVG` format.

Some icons are adaptive to the _Base color scheme_ and will automatically adjust their highlight color accordingly.

## Installation
Use the [BRAT](https://github.com/TfTHacker/obsidian42-brat) to install this plugin.

1. Install [BRAT](https://obsidian.md/plugins?id=obsidian42-brat) Obsidian plugin
2. Use `BRAT: Plugins: Add a beta plugin for testing` command to install a new plugin
3. Enter `moziar/obsidian-external-links-icon` on the popup window
4. Enjoy

## Setting
By default, both URL Scheme and WebSite icon are enabled. You could disable any of them via the **Style Setting plugin**.

There are two different Obsidian icons to help users better distinguish between Obsidian web links and note links.

Obsidian Note Link icon is disabled by default. You can enable either _internal link_, _external link_, or both, or disable them entirely — it all depends on your workflow.

![style-setting](style-setting.png)

## Credit
The implementation borrows from [marginnote-companion](https://github.com/aidenlx/marginnote-companion).
