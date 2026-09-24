(function () {
    'use strict';

    /* ----------------------------------------------------------------
       サイト定数
       URL や外部リンクをまとめて管理する
    ---------------------------------------------------------------- */
    /* 收錄版：上游的站台就是這個 repo 的根目錄，路徑一律寫 '/'。這裡改成相對於
     * 本檔所在的 lab 根目錄，trpg_map_maker/ 底下的頁面也能找到同一組連結。
     * 上游的隱私權政策只在說明 Google Analytics，收錄版拿掉了分析，連結也一併拿掉。 */
    const LAB_ROOT = new URL('.', document.currentScript.src).href;
    const SITE = {
        home: LAB_ROOT,
        toolkitHome: new URL('../../', LAB_ROOT).href,
        twitter: 'https://twitter.com/ihoukentiku',
        github: 'https://github.com/ihoukentiku/ihoukentiku.github.io',
        githubLicense: 'https://github.com/ihoukentiku/ihoukentiku.github.io/blob/main/LICENSE',
        thirdPartyLicense: LAB_ROOT + 'third-party-licenses.html',
    };
    const T = window.T;

    /* ----------------------------------------------------------------
       ヘッダー構築
       ページ上部の共通ヘッダーを動的に生成する
    ---------------------------------------------------------------- */
    function buildHeader() {
        const header = document.getElementById('site-header');
        if (!header) return;

        /* 文字先用 T() 填好，另外掛上 data-i18n：之後切換語言時由共用引擎重套，
         * 不必整個重建（重建會把語言選單換掉）。 */
        header.innerHTML = `
      <div class="header-inner">
        <a href="${SITE.home}" class="site-logo" data-i18n-aria-label="lab.homeAria" aria-label="${T('lab.homeAria')}">
          <span class="logo-en">TRPG Laboratory</span>
          <span class="logo-text" data-i18n-html="lab.logo">${T('lab.logo')}</span>
        </a>
        <nav class="header-nav" data-i18n-aria-label="lab.navAria" aria-label="${T('lab.navAria')}">
          <a class="toolkit-home" href="${SITE.toolkitHome}" data-i18n="nav.home">${T('nav.home')}</a>
          <select id="localeSelect" class="locale-select" data-i18n-aria-label="lang.aria" aria-label="${T('lang.aria')}"></select>
          <button class="hbtn" id="btn-guide" data-i18n-aria-label="lab.guide" aria-label="${T('lab.guide')}" data-i18n-title="lab.guide" title="${T('lab.guide')}">
            <span class="material-symbols-outlined">question_mark</span>
          </button>
          <a class="hbtn" id="btn-twitter" href="${SITE.twitter}" target="_blank"
             rel="noopener noreferrer" data-i18n-aria-label="lab.twitter" aria-label="${T('lab.twitter')}">
            <i class="fab fa-twitter" id="icon-bird"></i>
            <i class="fab fa-x-twitter" id="icon-x" style="display:none"></i>
          </a>
          <button class="hbtn" id="theme-toggle" data-i18n-aria-label="lab.theme" aria-label="${T('lab.theme')}" data-i18n-title="lab.theme" title="${T('lab.theme')}">
            <span class="material-symbols-outlined fill" id="theme-icon">light_mode</span>
          </button>
        </nav>
      </div>
    `;
        I18N.mountSwitcher(document.getElementById('localeSelect'));

        applyTheme(getSavedTheme());
        bindHeaderEvents();
    }

    /* ----------------------------------------------------------------
       テーマ管理
       ダーク / ライトモードの保存・適用を担当する
    ---------------------------------------------------------------- */
    function getSavedTheme() {
        return localStorage.getItem('theme') || 'dark';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const icon = document.getElementById('theme-icon');
        const bird = document.getElementById('icon-bird');
        const x = document.getElementById('icon-x');
        if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
        if (bird && x) {
            /* ダークテーマ → X ロゴ、ライトテーマ → 旧鳥アイコン */
            bird.style.display = theme === 'dark' ? 'none' : '';
            x.style.display = theme === 'dark' ? '' : 'none';
        }
    }

    function bindHeaderEvents() {
        /* テーマ切り替えボタン */
        const toggleBtn = document.getElementById('theme-toggle');
        if (toggleBtn) {
            const icon = document.getElementById('theme-icon');
            toggleBtn.addEventListener('click', () => {
                const cur = document.documentElement.getAttribute('data-theme');
                const next = cur === 'dark' ? 'light' : 'dark';
                /* アイコンを一回転させてから切り替える */
                icon.classList.remove('spinning');
                void icon.offsetWidth; // リフロー強制でアニメーション再生
                icon.classList.add('spinning');
                icon.addEventListener('animationend', () => toggleBtn.classList.remove('spinning'), { once: true });
                localStorage.setItem('theme', next);
                applyTheme(next);
            });
        }

        /* 使い方ガイドボタン */
        const guideBtn = document.getElementById('btn-guide');
        if (guideBtn) {
            guideBtn.addEventListener('click', () => openModal('guide-modal'));
        }
    }

    /* ----------------------------------------------------------------
       モーダル制御
       開閉時に背景スクロールをロック / アンロックする
    ---------------------------------------------------------------- */
    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('open');
        /* 背景のスクロールを止める */
        document.body.style.overflow = 'hidden';
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('open');
        /* 他に開いているモーダルがなければスクロールを戻す */
        if (!document.querySelector('.modal-overlay.open')) {
            document.body.style.overflow = '';
        }
    }

    function initModals() {
        /* 閉じるボタン */
        document.querySelectorAll('.modal-close').forEach((btn) => {
            btn.addEventListener('click', () => {
                const overlay = btn.closest('.modal-overlay');
                if (overlay) {
                    overlay.classList.remove('open');
                    if (!document.querySelector('.modal-overlay.open')) {
                        document.body.style.overflow = '';
                    }
                }
            });
        });

        /* オーバーレイ部分クリックで閉じる */
        document.querySelectorAll('.modal-overlay').forEach((overlay) => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('open');
                    if (!document.querySelector('.modal-overlay.open')) {
                        document.body.style.overflow = '';
                    }
                }
            });
        });

        /* Escape キーで閉じる */
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
                document.body.style.overflow = '';
            }
        });
    }

    /* ----------------------------------------------------------------
       使い方ガイド内リンク追加
       フッターがないページでも法的リンクへアクセスできるよう、
       ガイドモーダルの末尾にリンクブロックを追加する
    ---------------------------------------------------------------- */
    function buildGuideLinks() {
        const guideContent = document.getElementById('guide-content');
        if (!guideContent) return;

        /* すでに追加済みなら二重挿入しない */
        if (guideContent.querySelector('.guide-legal-links')) return;

        const linksEl = document.createElement('div');
        linksEl.className = 'guide-legal-links';
        linksEl.innerHTML = `
      <a href="${SITE.githubLicense}" target="_blank" rel="noopener">
        <i class="fab fa-github"></i> MIT License
      </a>
      <a href="${SITE.thirdPartyLicense}" data-i18n="lab.thirdParty">${T('lab.thirdParty')}</a>
      <span class="guide-legal-copy" data-i18n="lab.copyright">${T('lab.copyright')}</span>
    `;
        guideContent.appendChild(linksEl);
    }

    /* ----------------------------------------------------------------
       フッター構築
       フッターが存在するページにのみ実行される
    ---------------------------------------------------------------- */
    function buildFooter() {
        const footer = document.querySelector('.site-footer .container');
        if (!footer) return;
        footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-links">
          <a href="${SITE.githubLicense}" target="_blank" rel="noopener">
            <i class="fab fa-github"></i> MIT License
          </a>
          <a href="${SITE.thirdPartyLicense}" data-i18n="lab.thirdParty">${T('lab.thirdParty')}</a>
        </div>
        <p class="footer-copy" data-i18n="lab.copyright">${T('lab.copyright')}</p>
      </div>
    `;
    }

    function syncHeaderToMain() {
        const main = document.getElementById('main');
        const headerInner = document.querySelector('.header-inner');
        if (!main || !headerInner) return;

        const maxWidth = getComputedStyle(main).maxWidth;
        // main に max-width が設定されていれば header-inner に適用
        if (maxWidth && maxWidth !== 'none') {
            headerInner.style.maxWidth = maxWidth;
        }
    }

    /* ----------------------------------------------------------------
       カスタム number スピナー
       input[type="number"] を自動検出し、左に − 右に + ボタンを追加する。
       ページロード時に自動実行。動的に追加された要素には
       initNumSpinners(container) を呼び出す。

       動作:
         - クリックで ±step（step 属性があればその値、なければ 1）
         - 長押し 400ms 後から 60ms ごとに連続入力
         - min / max 属性を遵守
         - 値変化後に input イベントと change イベントを dispatch
    ---------------------------------------------------------------- */
    function initNumSpinners(root) {
        const inputs = (root || document).querySelectorAll('input[type="number"].custom-spinner');
        inputs.forEach(function (input) {
            /* すでにラップ済みならスキップ */
            if (input.closest('.num-wrap')) return;

            var step = parseFloat(input.step) || 1;
            var isInt = Number.isInteger(step);

            /* ラッパー生成 */
            var wrap = document.createElement('div');
            wrap.className = 'num-wrap';

            /* − ボタン */
            var btnDec = document.createElement('button');
            btnDec.type = 'button';
            btnDec.className = 'num-btn num-btn-dec';
            btnDec.textContent = '−';
            btnDec.setAttribute('aria-label', T('lab.decrease'));
            btnDec.dataset.i18nAriaLabel = 'lab.decrease';
            btnDec.tabIndex = -1;

            /* ＋ ボタン */
            var btnInc = document.createElement('button');
            btnInc.type = 'button';
            btnInc.className = 'num-btn num-btn-inc';
            btnInc.textContent = '＋';
            btnInc.setAttribute('aria-label', T('lab.increase'));
            btnInc.dataset.i18nAriaLabel = 'lab.increase';
            btnInc.tabIndex = -1;

            /* input をラッパーに移す */
            input.parentNode.insertBefore(wrap, input);
            wrap.appendChild(btnDec);
            wrap.appendChild(input);
            wrap.appendChild(btnInc);

            /* 値変化ヘルパー */
            function applyDelta(delta) {
                var min = input.min !== '' ? parseFloat(input.min) : -Infinity;
                var max = input.max !== '' ? parseFloat(input.max) : Infinity;
                var cur = parseFloat(input.value) || 0;
                var next = Math.min(max, Math.max(min, cur + delta));
                input.value = isInt ? Math.round(next) : next;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            btnDec.addEventListener('click', function () {
                applyDelta(-step);
            });
            btnInc.addEventListener('click', function () {
                applyDelta(+step);
            });

            /* 長押し連続入力 */
            var pressTimer = null;
            var repeatTimer = null;

            function startRepeat(delta) {
                pressTimer = setTimeout(function () {
                    repeatTimer = setInterval(function () {
                        applyDelta(delta);
                    }, 60);
                }, 400);
            }
            function stopRepeat() {
                clearTimeout(pressTimer);
                clearInterval(repeatTimer);
            }

            [
                [btnDec, -step],
                [btnInc, +step],
            ].forEach(function (pair) {
                var btn = pair[0],
                    delta = pair[1];
                btn.addEventListener('mousedown', function () {
                    startRepeat(delta);
                });
                btn.addEventListener(
                    'touchstart',
                    function () {
                        startRepeat(delta);
                    },
                    { passive: true }
                );
                ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) {
                    btn.addEventListener(ev, stopRepeat);
                });
            });
        });
    }

    /* グローバルに公開するユーティリティ */
    window.IKLab = { openModal, closeModal, SITE, initNumSpinners };

    document.addEventListener('DOMContentLoaded', () => {
        buildHeader();
        buildFooter();
        initModals();
        buildGuideLinks();
        syncHeaderToMain();
        initNumSpinners();
    });
})();
