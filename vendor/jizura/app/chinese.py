"""繁體中文版的介面字串（TRPG Toolkit 新增）。結構照上游 app/english.py：日文原始碼為準，
建置時把下列日文片段換成繁中。鍵與 english.py 相同，長的先換，避免短片段先吃掉長句的一部分。"""

BODY = {}

UI = {}

EXPORT = {}


def replace_copy(source, glossary):
    # 長的先換：完整句子不會被較短的標籤先替換掉一半。
    for japanese, chinese in sorted(glossary.items(), key=lambda pair: -len(pair[0])):
        source = source.replace(japanese, chinese)
    return source


def localize_body(source):
    return replace_copy(source, BODY)


def localize_js(source, filename):
    if filename.endswith('12_ui.js'):
        return replace_copy(source, UI)
    if filename.endswith('11_export.js'):
        return replace_copy(source, EXPORT)
    return source
