(function () {
    'use strict';

    /* ----------------------------------------------------------------
        ツール定義
        新しいツールを追加する際はここにオブジェクトを追記するだけでよい
        ---------------------------------------------------------------- */
    const TOOLS = [
        {
            id: 'coc7-dice',
            title: 'CoC7 ダイスツール',
            titleEn: 'DICE ROLLER',
            icon: 'casino',
            desc: '新クトゥルフ神話TRPG専用ダイスツール。技能値を入力してワンクリックでロール判定。カスタムロール・ダイスログ・効果音に対応。オフラインセッションでも快適に使えます。',
            url: 'coc7_dice.html',
        },
        {
            id: 'coc7-sheet',
            title: 'CoC7 探索者シート',
            titleEn: 'CHARACTER SHEET',
            icon: 'person_pin',
            desc: '新クトゥルフ神話TRPG用キャラクターシート。能力値・技能・バックストーリーをブラウザで管理し、そのまま印刷可能。データはブラウザに保存されます。',
            url: 'coc7_Investigator_sheet.html',
        },
        {
            id: 'coc-npc',
            title: 'CoC NPC作成/管理ツール',
            titleEn: 'NPC GENERATOR',
            icon: 'groups',
            desc: 'CoC7・CoC6どちらにも対応したNPC作成/管理ツールです。複数のNPCをリストで管理しながら編集でき、ダイス式を入力してワンクリックで能力値をロール。派生値（HP・MP・SANなど）は自動計算されます。',
            url: 'coc_npc_token.html',
        },
        {
            id: 'trpg-map-maker',
            title: 'TRPGマップエディタ',
            titleEn: 'MAP EDITOR',
            icon: 'map',
            desc: 'ブラウザだけで動くTRPGマップ作成ツール。地面・壁・部屋・装飾のテクスチャパターンや図形描画でバトルマップや間取り図を作成。スクエア/ヘクス対応。',
            url: 'trpg_map_maker/map_list.html',
        },
        {
            id: 'grid-map',
            title: 'グリッド作成',
            titleEn: 'GRID GEN.',
            icon: 'grid_on',
            desc: 'グリッド（マス目）画像をカスタマイズして生成・ダウンロード。マスサイズ・色・縮小・角丸・座標表示などを自由に設定できます。',
            url: 'grid_maker.html',
        },
        {
            id: 'hex-map',
            title: 'ヘクス作成',
            titleEn: 'HEX GRID GEN.',
            icon: 'hexagon',
            desc: 'ヘクス（六角形）画像をカスタマイズして生成・ダウンロード。サイズ・向き・座標・色・線種を自由に設定でき、ココフォリア等のオンセツールにも対応します。',
            url: 'hex_maker.html',
        },
        {
            id: 'grid-ruler',
            title: 'グリッド定規作成',
            titleEn: 'GRID RULER GEN.',
            icon: 'straighten',
            desc: 'グリッドマップ用の距離計測定規を生成。距離ごとに色を塗り分け、マスをクリックして個別に文字・色を設定できます。ファイル名にグリッドサイズを自動付与。',
            url: 'grid_ruler.html',
        },
        {
            id: 'hex-ruler',
            title: 'ヘクス定規作成',
            titleEn: 'HEX RULER GEN.',
            icon: 'hexagon',
            desc: 'ヘクスマップ用の距離計測定規を生成。距離ごとに色を塗り分け、ヘクスをクリックして個別に文字・色を設定できます。グリッドサイズ対応でコフォリア等にも使いやすい形で出力。',
            url: 'hex_ruler.html',
        },
        {
            id: 'bcdice-damage',
            title: 'BCDice ダメージ計算',
            titleEn: 'DAMAGE CALC.',
            icon: 'bolt',
            desc: 'BCDiceのダメージロールログから装甲適用後の合計ダメージを自動算出し、ココフォリア用HP減少コマンドを生成。装甲持ちの敵への複数回攻撃時に特に威力を発揮します。',
            url: 'damage_sum.html',
        },
    ];

    /* ----------------------------------------------------------------
        更新情報
        新しい情報は先頭に追記する（最新順で表示される）
        ---------------------------------------------------------------- */
    const NEWS = [
        { date: '2026-06-02', tag: 'NEW', text: 'TRPGマップエディタを公開しました。' },
        { date: '2026-03-21', tag: 'UPDATE', text: 'NPCコマ作成ツールをリニューアルしました。' },
        { date: '2026-03-21', tag: 'NEW', text: 'グリッド定規・ヘクス定規作成ツールを追加しました。' },
        { date: '2026-03-19', tag: 'UPDATE', text: 'グリッド作成ツールのUIを刷新しました。' },
        { date: '2026-03-11', tag: 'UPDATE', text: 'サイトのデザインを刷新しました。' },
        { date: '2025-10-06', tag: 'UPDATE', text: 'カスタム探索者シートに保存機能を追加しました。' },
        { date: '2025-10-04', tag: 'NEW', text: 'CoC7 カスタム探索者シートを追加しました。' },
        { date: '2025-09-28', tag: 'UPDATE', text: 'トップページを大幅リニューアルしました。' },
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
        <span class="news-text">${item.text}</span>
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
        <a class="tool-card" href="${t.url}" rel="noopener noreferrer" aria-label="${t.title}">
            <div class="card-top">
            <div class="card-icon-wrap">
                <span class="material-symbols-outlined${['bolt', 'casino', 'groups', 'person_pin'].includes(t.icon) ? ' fill' : ''}">${t.icon}</span>
            </div>
            <div>
                <div class="card-title-en">${t.titleEn}</div>
                <h3 class="card-title-ja">${t.title}</h3>
            </div>
            </div>
            <div class="card-body">
            <p class="card-desc">${t.desc}</p>
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
    });
})();

