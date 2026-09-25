"""TRPG Toolkit 版的建置：從 src/、app/、vendor/ 產生兩個單檔頁面。

    python3 vendor/jizura/build_toolkit.py

    tools/jizura/index.html     繁體中文版（app/chinese.py、app/chinese.js 的翻譯）
    tools/jizura/ja/index.html  日文版（上游原文）

做法照上游 build.py 產生英文版的方式：日文原始碼為準，建置時以翻譯表替換介面
字串（app/chinese.py），部件、風格、氣氛的名稱在各表現包登錄完之後、編輯器啟動
之前改寫（app/chinese.js）。與上游 build.py 不同的地方：

- 不輸出英文版；頁首的語言切換改成合輯的「← TRPG Toolkit」與繁中／日文兩頁互換，
  選擇會記在合輯共用的 localStorage 鍵（trpg-toolkit-locale），別的工具頁也會跟著。
- 拿掉 canonical、hreflang 與 OG／Twitter meta（那是原作者站台的識別）。
- 繁中版的介面字型改用 Noto Sans TC（IBM Plex Sans JP 的漢字是日文字形）。
"""
import glob, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(ROOT))
sys.path.insert(0, ROOT)
sys.dont_write_bytecode = True  # 不在 vendor/ 底下留 __pycache__
from app.chinese import localize_body, localize_js  # noqa: E402

read = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
SOURCES = sorted(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'src', '*.js')))
MUX = '/*! mp4-muxer v5.2.2 | MIT License | (c) 2023 Vanilagy | see THIRD_PARTY_NOTICES.md */\n' + read('vendor/mp4-muxer.min.js')
UI_MARKER = '/* ============================================================\n   JIZURA — editor UI'
LOCALE_KEY = 'trpg-toolkit-locale'

# 合輯的頁首控制：回首頁連結放在品牌標誌前面，語言切換沿用上游 .lang-switch 的外觀。
TOOLKIT_CSS = '''
/* ---- TRPG Toolkit ---- */
.tk-home { flex: none; font: 500 11px var(--mono); color: var(--muted); text-decoration: none; white-space: nowrap; }
.tk-home:hover { color: var(--text); }
'''
ZH_FONT_CSS = '''
:root { --ui: "Noto Sans TC", "IBM Plex Sans JP", "Noto Sans JP", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif; }
'''


def nav(lang):
    zh = lang == 'zh-TW'
    here = '<span aria-current="page">{}</span>'
    if zh:
        items = here.format('繁體中文') + '<a href="ja/" lang="ja" data-locale="ja">日本語</a>'
        label = '顯示語言'
    else:
        items = '<a href="../" lang="zh-Hant-TW" data-locale="zh-TW">繁體中文</a>' + here.format('日本語')
        label = '表示言語'
    return f'<nav class="lang-switch" aria-label="{label}">{items}</nav>'


def home_link(lang):
    href = '../../' if lang == 'zh-TW' else '../../../'
    return f'<a class="tk-home" href="{href}">← TRPG Toolkit</a>'


def locale_script(lang):
    # 繁中版：使用者在合輯裡選過日文就換到日文版。日文版：選過別的語言（不是日文）就回繁中版；
    # 沒選過的話尊重網址，不自動換頁。點語言切換時先記下選擇再換頁。
    if lang == 'zh-TW':
        redirect = "if (l === 'ja') location.replace('ja/' + location.search + location.hash);"
    else:
        redirect = "if (l && l !== 'ja') location.replace('../' + location.search + location.hash);"
    return f'''<script>
(function () {{
  var KEY = '{LOCALE_KEY}';
  try {{ var l = localStorage.getItem(KEY); {redirect} }} catch (e) {{}}
  document.addEventListener('click', function (e) {{
    var a = e.target.closest && e.target.closest('a[data-locale]');
    if (!a) return;
    try {{ localStorage.setItem(KEY, a.getAttribute('data-locale')); }} catch (err) {{}}
  }});
}})();
</script>'''


def build(lang):
    zh = lang == 'zh-TW'
    title = 'JIZURA 字面 — 歌詞動態影片產生器' if zh else 'JIZURA 字面'
    body = read('app/body.html')
    body = body.replace('    <div class="brand">', '    ' + home_link(lang) + '\n    <div class="brand">', 1)
    body = body.replace('    <div class="acts">', '    ' + nav(lang) + '\n    <div class="acts">', 1)
    if home_link(lang) not in body or nav(lang) not in body:
        raise ValueError('Could not place the toolkit header controls')
    if zh:
        body = localize_body(body)
        script = '\n'.join(localize_js(read(f), f) for f in SOURCES)
        if UI_MARKER not in script:
            raise ValueError('Could not find browser UI entry point')
        script = script.replace(UI_MARKER, read('app/chinese.js') + '\n' + UI_MARKER, 1)
    else:
        script = '\n'.join(read(f) for f in SOURCES)
    font_link = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap">\n'
                 if zh else '')
    html = f'''<!doctype html>
<!--
JIZURA 字面 https://github.com/852wa/JIZURA
本檔由 TRPG Toolkit 的 vendor/jizura/build_toolkit.py 產生；要修改請改原始碼後重新建置。

{read('LICENSE').strip()}
-->
<html lang="{'zh-Hant-TW' if zh else 'ja'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{font_link}{locale_script(lang)}
<style>
{read('app/style.css')}{TOOLKIT_CSS}{ZH_FONT_CSS if zh else ''}
</style>
</head>
<body>
{body}
<script>
{MUX}
</script>
<script>
{script}
</script>
</body>
</html>
'''
    target = os.path.join(REPO, 'tools', 'jizura', 'index.html' if zh else os.path.join('ja', 'index.html'))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    open(target, 'w', encoding='utf-8').write(html)
    print(os.path.relpath(target, REPO), len(html), 'bytes')


build('zh-TW')
build('ja')
