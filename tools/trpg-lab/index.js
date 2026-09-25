(function () {
    'use strict';

    /* ----------------------------------------------------------------
        ツール定義
        新しいツールを追加する際はここにオブジェクトを追記するだけでよい
        ---------------------------------------------------------------- */
    const TOOLS = [
        {
            id: 'coc7-dice',
            titleKey: 'tool.dice.title',
            titleEn: 'DICE ROLLER',
            icon: 'casino',
            descKey: 'tool.dice.desc',
            url: 'coc7_dice.html',
        },
        {
            id: 'coc7-sheet',
            titleKey: 'tool.sheet.title',
            titleEn: 'CHARACTER SHEET',
            icon: 'person_pin',
            descKey: 'tool.sheet.desc',
            url: 'coc7_Investigator_sheet.html',
        },
        {
            id: 'coc-npc',
            titleKey: 'tool.npc.title',
            titleEn: 'NPC GENERATOR',
            icon: 'groups',
            descKey: 'tool.npc.desc',
            url: 'coc_npc_token.html',
        },
        {
            id: 'trpg-map-maker',
            titleKey: 'tool.map.title',
            titleEn: 'MAP EDITOR',
            icon: 'map',
            descKey: 'tool.map.desc',
            url: 'trpg_map_maker/map_list.html',
        },
        {
            id: 'grid-map',
            titleKey: 'tool.grid.title',
            titleEn: 'GRID GEN.',
            icon: 'grid_on',
            descKey: 'tool.grid.desc',
            url: 'grid_maker.html',
        },
        {
            id: 'hex-map',
            titleKey: 'tool.hex.title',
            titleEn: 'HEX GRID GEN.',
            icon: 'hexagon',
            descKey: 'tool.hex.desc',
            url: 'hex_maker.html',
        },
        {
            id: 'grid-ruler',
            titleKey: 'tool.gridRuler.title',
            titleEn: 'GRID RULER GEN.',
            icon: 'straighten',
            descKey: 'tool.gridRuler.desc',
            url: 'grid_ruler.html',
        },
        {
            id: 'hex-ruler',
            titleKey: 'tool.hexRuler.title',
            titleEn: 'HEX RULER GEN.',
            icon: 'hexagon',
            descKey: 'tool.hexRuler.desc',
            url: 'hex_ruler.html',
        },
        {
            id: 'bcdice-damage',
            titleKey: 'tool.damage.title',
            titleEn: 'DAMAGE CALC.',
            icon: 'bolt',
            descKey: 'tool.damage.desc',
            url: 'damage_sum.html',
        },
    ];

    /* ----------------------------------------------------------------
        更新情報
        新しい情報は先頭に追記する（最新順で表示される）
        ---------------------------------------------------------------- */
    const NEWS = [
        { date: '2026-06-02', tag: 'NEW', textKey: 'news.mapEditor' },
        { date: '2026-03-21', tag: 'UPDATE', textKey: 'news.npcRenewal' },
        { date: '2026-03-21', tag: 'NEW', textKey: 'news.rulers' },
        { date: '2026-03-19', tag: 'UPDATE', textKey: 'news.gridUi' },
        { date: '2026-03-11', tag: 'UPDATE', textKey: 'news.siteDesign' },
        { date: '2025-10-06', tag: 'UPDATE', textKey: 'news.sheetSave' },
        { date: '2025-10-04', tag: 'NEW', textKey: 'news.sheetNew' },
        { date: '2025-09-28', tag: 'UPDATE', textKey: 'news.topRenewal' },
    ];

    /* ----------------------------------------------------------------
        HTML 生成ヘルパー
        ---------------------------------------------------------------- */

    /** 更新情報1件分の HTML 文字列を返す */
    function newsItemHTML(item) {
        return `<div class="news-item">
        <div class="news-item-upper">
            <span class="news-date">${item.date}</span>
            <span class="news-tag tag-${item.tag}">${item.tag}</span>
        </div>
        <span class="news-text">${T(item.textKey)}</span>
        </div>`;
    }

    /* ----------------------------------------------------------------
        描画処理
        ---------------------------------------------------------------- */

    /** 更新情報を描画する（最新1件 + モーダル全件） */
    function renderNews() {
        const latestEl = document.getElementById('latest-news');
        const allEl = document.getElementById('all-news-list');

        /* インフォバーには最新1件だけ表示（CSS で長文は省略する） */
        if (latestEl && NEWS.length) {
            latestEl.innerHTML = newsItemHTML(NEWS[0]);
        }

        /* モーダルには全件表示 */
        if (allEl) {
            allEl.innerHTML = NEWS.map(newsItemHTML).join('');
        }
    }

    /** ツールカードを描画する */
    function renderTools() {
        const grid = document.getElementById('tools-grid');
        if (!grid) return;

        /* ツール数を見出し横に表示 */
        const countEl = document.getElementById('tools-count');
        if (countEl) countEl.textContent = `${TOOLS.length} TOOLS`;

        grid.innerHTML = TOOLS.map(
            (t) => `
        <a class="tool-card" href="${t.url}" rel="noopener noreferrer" aria-label="${T(t.titleKey)}">
            <div class="card-top">
            <div class="card-icon-wrap">
                <span class="material-symbols-outlined${['bolt', 'casino', 'groups', 'person_pin'].includes(t.icon) ? ' fill' : ''}">${t.icon}</span>
            </div>
            <div>
                <div class="card-title-en">${t.titleEn}</div>
                <h3 class="card-title-ja">${T(t.titleKey)}</h3>
            </div>
            </div>
            <div class="card-body">
            <p class="card-desc">${T(t.descKey)}</p>
            </div>
            <div class="card-arrow">
            <span>OPEN</span>
            <span class="material-symbols-outlined">arrow_forward</span>
            </div>
        </a>
        `
        ).join('');
    }

    /** 更新情報モーダルの「すべて見る」ボタンをバインドする */
    function bindNewsModal() {
        const btn = document.getElementById('open-news-modal');
        if (btn) {
            btn.addEventListener('click', () => window.IKLab && window.IKLab.openModal('news-modal'));
        }
    }

    /* ----------------------------------------------------------------
        初期化
        ---------------------------------------------------------------- */
    document.addEventListener('DOMContentLoaded', () => {
        renderNews();
        renderTools();
        bindNewsModal();
        /* 卡片與更新情報都是 JS 畫的，切換語言時整批重畫。 */
        I18N.onChange(() => {
            renderNews();
            renderTools();
        });
    });
})();

