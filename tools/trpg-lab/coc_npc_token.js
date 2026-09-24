(function () {
    'use strict';

    /* ================================================================
       定数
    ================================================================ */
    const STATS = ['STR', 'CON', 'POW', 'DEX', 'APP', 'SIZ', 'INT', 'EDU'];

    const DEFAULT_DICE_7 = { STR: '', CON: '', POW: '', DEX: '', APP: '', SIZ: '', INT: '', EDU: '' };
    const DEFAULT_DICE_6 = { STR: '', CON: '', POW: '', DEX: '', APP: '', SIZ: '', INT: '', EDU: '' };

    // CoC7 DB/Build テーブル (STR+SIZ の合計 — CoC7 は能力値×5 で保存)
    const DB_TABLE_7 = [
        { max: 64, db: '-2', build: -2 },
        { max: 84, db: '-1', build: -1 },
        { max: 124, db: '0', build: 0 },
        { max: 164, db: '+1D4', build: 1 },
        { max: 204, db: '+1D6', build: 2 },
        { max: 284, db: '+2D6', build: 3 },
        { max: 364, db: '+3D6', build: 4 },
        { max: 444, db: '+4D6', build: 5 },
        { max: 524, db: '+5D6', build: 6 },
    ];

    // CoC6 DB テーブル (STR+SIZ の合計)
    const DB_TABLE_6 = [
        { max: 12, db: '-1D6' },
        { max: 16, db: '-1D4' },
        { max: 24, db: '0' },
        { max: 32, db: '+1D4' },
        { max: 40, db: '+1D6' },
        { max: 56, db: '+2D6' },
        { max: 72, db: '+3D6' },
        { max: 88, db: '+4D6' },
        { max: 104, db: '+5D6' },
        { max: 120, db: '+6D6' },
        { max: 136, db: '+7D6' },
        { max: 152, db: '+8D6' },
        { max: 168, db: '+9D6' },
        { max: 184, db: '+10D6' },
    ];

    /* ================================================================
       状態
    ================================================================ */
    let npcs = [];
    let currentId = null;
    let pvMode = 'json';
    let saveTimer = null;

    /* ================================================================
       永続化
    ================================================================ */
    const STORAGE_KEY = 'iklab_coc_npc_token_v1';

    function saveAll() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ npcs, currentId }));
        } catch (e) {}
    }
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveAll, 400);
    }
    function loadAll() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            npcs = data.npcs || [];
            currentId = data.currentId || null;
        } catch (e) {}
    }

    /* ================================================================
       NPC 生成
    ================================================================ */
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function newNpc(version = '7') {
        const dice = version === '7' ? DEFAULT_DICE_7 : DEFAULT_DICE_6;
        const abilities = {};
        STATS.forEach((s) => {
            abilities[s] = { dice: dice[s], value: 0 };
        });
        return {
            id: uid(),
            version,
            name: '新規NPC',
            externalUrl: '',
            abilities,
            hp: 0,
            mp: 0,
            san: 0,
            sanEnabled: true,
            db: '0',
            build: 0,
            mov: '',
            skills: [{ name: '', value: 0 }],
            commands: [{ name: '', expr: '' }],
            commandType: 'CC',
            memo: '',
        };
    }

    function getCurrentNpc() {
        return npcs.find((n) => n.id === currentId) || null;
    }

    /* ================================================================
       計算
    ================================================================ */
    function rollDice(expr) {
        if (!expr || !expr.trim()) return 0;
        try {
            const s = expr.trim().toUpperCase().replace(/\s/g, '');
            // split by + keeping sign, handle leading minus
            const tokens = s
                .replace(/-/g, '+-')
                .split('+')
                .filter((p) => p !== '');
            let total = 0;
            for (const tok of tokens) {
                if (tok.includes('D')) {
                    const [nStr, mStr] = tok.split('D');
                    const n = parseInt(nStr) || 1;
                    const m = parseInt(mStr) || 6;
                    const sign = n < 0 ? -1 : 1;
                    for (let i = 0; i < Math.abs(n); i++) total += sign * (Math.floor(Math.random() * m) + 1);
                } else {
                    total += parseInt(tok) || 0;
                }
            }
            return total;
        } catch (e) {
            return 0;
        }
    }

    function calcDB7(sum) {
        for (const row of DB_TABLE_7) {
            if (sum <= row.max) return { db: row.db, build: row.build };
        }
        const extra = Math.floor((sum - 525) / 80) + 1;
        return { db: `+${5 + extra}D6`, build: 6 + extra };
    }

    function calcDB6(sum) {
        for (const row of DB_TABLE_6) {
            if (sum <= row.max) return row.db;
        }
        const extra = Math.floor((sum - 185) / 16) + 1;
        return `+${10 + extra}D6`;
    }

    function calcDerived(npc) {
        const v = (s) => npc.abilities[s]?.value || 0;
        if (npc.version === '7') {
            npc.hp = Math.floor((v('CON') + v('SIZ')) / 10);
            npc.mp = Math.floor(v('POW') / 5);
            npc.san = v('POW');
            const { db, build } = calcDB7(v('STR') + v('SIZ'));
            npc.db = db;
            npc.build = build;
        } else {
            npc.hp = Math.ceil((v('CON') + v('SIZ')) / 2);
            npc.mp = v('POW');
            npc.san = v('POW') * 5;
            npc.db = calcDB6(v('STR') + v('SIZ'));
        }
    }

    /* ================================================================
       出力生成
    ================================================================ */
    function genJson(npc) {
        const v = (s) => npc.abilities[s]?.value || 0;
        const status = [
            { label: 'HP', value: npc.hp, max: npc.hp },
            { label: 'MP', value: npc.mp, max: npc.mp },
        ];
        if (npc.sanEnabled) status.push({ label: 'SAN', value: npc.san, max: npc.san });

        const params = STATS.map((s) => ({ label: s, value: String(v(s)) }));
        params.push({ label: 'DB', value: npc.db });
        if (npc.version === '7') params.push({ label: 'ビルド', value: String(npc.build) });
        const movVal = parseInt(npc.mov);
        if (!isNaN(movVal) && npc.mov !== '') params.push({ label: npc.version === '7' ? 'MOV' : '移動率', value: String(movVal) });

        return JSON.stringify(
            {
                kind: 'character',
                data: {
                    name: npc.name || '名無し',
                    initiative: v('DEX'),
                    externalUrl: npc.externalUrl || '',
                    status,
                    params,
                    commands: genChaPare(npc),
                    memo: npc.memo || '',
                },
            },
            null,
            2
        );
    }

    function genChaPare(npc) {
        const v = (s) => npc.abilities[s]?.value || 0;
        // CoC6: 能力値は生値 (3〜18)、判定は×5で行う
        const av = (s) => (npc.version === '6' ? v(s) * 5 : v(s));
        const ct = npc.version === '7' ? 'CC' : npc.commandType || 'CC';
        const lines = [];
        if (npc.sanEnabled) lines.push(`${ct}<=${npc.san} 正気度ロール`);
        STATS.forEach((s) => lines.push(`${ct}<=${av(s)} ${s}`));
        npc.skills.filter((s) => s.name).forEach((s) => lines.push(`${ct}<=${s.value} ${s.name}`));
        npc.commands
            .filter((c) => c.expr)
            .forEach((c) => {
                const expr = c.expr.replace(/\{[Dd][Bb]\}|(?<![A-Za-z0-9_{])[Dd][Bb](?![A-Za-z0-9_}])/g, '{DB}');
                lines.push(c.name ? `${c.name} ${expr}` : expr);
            });
        lines.push(`//HP=${npc.hp}`, `//MP=${npc.mp}`);
        if (npc.sanEnabled) lines.push(`//SAN=${npc.san}`);
        lines.push(`//DB=${npc.db}`);
        if (npc.version === '7') lines.push(`//ビルド=${npc.build}`);
        if (npc.mov !== '') lines.push(`//${npc.version === '7' ? 'MOV' : '移動率'}=${npc.mov}`);
        STATS.forEach((s) => lines.push(`//${s}=${v(s)}`));
        return lines.join('\n');
    }

    /* ================================================================
       描画
    ================================================================ */
    function renderList() {
        const body = document.getElementById('npcListBody');
        body.innerHTML = '';
        npcs.forEach((npc) => {
            const el = document.createElement('div');
            el.className = 'npc-item' + (npc.id === currentId ? ' active' : '');
            el.innerHTML =
                `<span class="ver-badge">${npc.version === '7' ? 'CoC7' : 'CoC6'}</span>` +
                `<span class="npc-name">${esc(npc.name || '名無し')}</span>` +
                `<button class="npc-del" data-id="${npc.id}" title="削除">✕</button>`;
            el.addEventListener('click', (e) => {
                if (!e.target.classList.contains('npc-del')) selectNpc(npc.id);
            });
            el.querySelector('.npc-del').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNpc(npc.id);
            });
            body.appendChild(el);
        });
    }

    function renderForm(npc) {
        if (!npc) return;
        // Version
        const verEl = document.querySelector(`input[name="ver"][value="${npc.version}"]`);
        if (verEl) verEl.checked = true;
        applyVerUI(npc.version);

        // Basic
        document.getElementById('npcName').value = npc.name || '';
        // externalUrl not shown in form

        // Command type (CoC6)
        const ctEl = document.querySelector(`input[name="cmdType"][value="${npc.commandType || 'CC'}"]`);
        if (ctEl) ctEl.checked = true;

        // Abilities
        STATS.forEach((s) => {
            const d = document.getElementById(`dice-${s}`);
            const v = document.getElementById(`val-${s}`);
            if (d) d.value = npc.abilities[s]?.dice || '';
            if (v) v.value = npc.abilities[s]?.value ?? 0;
        });

        // Derived
        document.getElementById('npcHp').value = npc.hp;
        document.getElementById('npcMp').value = npc.mp;
        document.getElementById('npcSan').value = npc.san;
        document.getElementById('npcDb').value = npc.db;
        document.getElementById('npcBuild').value = npc.build;
        document.getElementById('npcMov').value = npc.mov || '';
        const sanCk = document.getElementById('sanToggle');
        sanCk.checked = npc.sanEnabled;
        updateSanUI(npc.sanEnabled);

        // Skills
        const sb = document.getElementById('skillsBody');
        sb.innerHTML = '';
        (npc.skills.length ? npc.skills : [{ name: '', value: 0 }]).forEach((sk) => addSkillRow(sk.name, sk.value));

        // Commands
        const cb = document.getElementById('cmdsBody');
        cb.innerHTML = '';
        (npc.commands.length ? npc.commands : [{ name: '', expr: '' }]).forEach((c) => addCmdRow(c.name, c.expr));

        // Memo
        document.getElementById('npcMemo').value = npc.memo || '';
    }

    function renderPreview() {
        const npc = getCurrentNpc();
        const el = document.getElementById('pvText');
        if (!npc) {
            el.textContent = '';
            return;
        }
        el.textContent = pvMode === 'json' ? genJson(npc) : genChaPare(npc);
    }

    function applyVerUI(ver) {
        document.getElementById('buildCell').style.display = ver === '7' ? '' : 'none';
        document.getElementById('cmdTypeRow').style.display = ver === '6' ? '' : 'none';
        document.getElementById('movLabel').textContent = ver === '7' ? 'MOV' : '移動率';
    }

    function updateSanUI(enabled) {
        const cell = document.getElementById('sanCell');
        cell.style.opacity = enabled ? '1' : '0.4';
        cell.style.pointerEvents = enabled ? '' : 'none';
    }

    function pushDerivedToForm(npc) {
        document.getElementById('npcHp').value = npc.hp;
        document.getElementById('npcMp').value = npc.mp;
        document.getElementById('npcSan').value = npc.san;
        document.getElementById('npcDb').value = npc.db;
        document.getElementById('npcBuild').value = npc.build;
    }

    /* ================================================================
       動的行
    ================================================================ */
    function addSkillRow(name = '', value = 0) {
        const el = document.createElement('div');
        el.className = 'dyn-row dyn-row-skill';
        el.innerHTML =
            `<input type="text" class="inp sk-name" value="${esc(String(name))}" placeholder="技能名" />` +
            `<input type="number" class="inp sk-val" value="${value}" min="0" max="999" />` +
            `<button class="dyn-del" title="削除">✕</button>`;
        el.querySelector('.dyn-del').addEventListener('click', () => {
            el.remove();
            onChange();
        });
        el.querySelector('.sk-name').addEventListener('input', onChange);
        el.querySelector('.sk-val').addEventListener('input', onChange);
        document.getElementById('skillsBody').appendChild(el);
    }

    function addCmdRow(name = '', expr = '') {
        const el = document.createElement('div');
        el.className = 'dyn-row dyn-row-cmd';
        el.innerHTML =
            `<input type="text" class="inp cmd-name" value="${esc(String(name))}" placeholder="名前" />` +
            `<input type="text" class="inp inp-mono cmd-expr" value="${esc(String(expr))}" placeholder="1D6+2+DB" />` +
            `<button class="dyn-del" title="削除">✕</button>`;
        el.querySelector('.dyn-del').addEventListener('click', () => {
            el.remove();
            onChange();
        });
        el.querySelector('.cmd-name').addEventListener('input', onChange);
        el.querySelector('.cmd-expr').addEventListener('input', onChange);
        document.getElementById('cmdsBody').appendChild(el);
    }

    /* ================================================================
       フォーム → NPC
    ================================================================ */
    function readFormIntoNpc() {
        const npc = getCurrentNpc();
        if (!npc) return;
        npc.version = document.querySelector('input[name="ver"]:checked')?.value || '7';
        npc.name = document.getElementById('npcName').value;
        npc.externalUrl = npc.externalUrl || '';
        npc.commandType = document.querySelector('input[name="cmdType"]:checked')?.value || 'CC';
        STATS.forEach((s) => {
            npc.abilities[s] = {
                dice: document.getElementById(`dice-${s}`)?.value || '',
                value: parseInt(document.getElementById(`val-${s}`)?.value) || 0,
            };
        });
        npc.hp = parseInt(document.getElementById('npcHp').value) || 0;
        npc.mp = parseInt(document.getElementById('npcMp').value) || 0;
        npc.san = parseInt(document.getElementById('npcSan').value) || 0;
        npc.db = document.getElementById('npcDb').value || '0';
        npc.build = parseInt(document.getElementById('npcBuild').value) || 0;
        npc.mov = document.getElementById('npcMov').value;
        npc.sanEnabled = document.getElementById('sanToggle').checked;
        npc.memo = document.getElementById('npcMemo').value;
        npc.skills = [];
        document.querySelectorAll('#skillsBody .dyn-row').forEach((row) => {
            npc.skills.push({ name: row.querySelector('.sk-name')?.value || '', value: parseInt(row.querySelector('.sk-val')?.value) || 0 });
        });
        npc.commands = [];
        document.querySelectorAll('#cmdsBody .dyn-row').forEach((row) => {
            npc.commands.push({ name: row.querySelector('.cmd-name')?.value || '', expr: row.querySelector('.cmd-expr')?.value || '' });
        });
    }

    /* ================================================================
       アクション
    ================================================================ */
    function onChange() {
        readFormIntoNpc();
        renderPreview();
        renderList();
        scheduleSave();
    }

    function selectNpc(id) {
        if (currentId) readFormIntoNpc();
        currentId = id;
        renderList();
        const npc = getCurrentNpc();
        if (npc) renderForm(npc);
        renderPreview();
        saveAll();
    }

    function addNpc() {
        if (currentId) readFormIntoNpc();
        const ver = document.querySelector('input[name="ver"]:checked')?.value || '7';
        const npc = newNpc(ver);
        npcs.push(npc);
        currentId = npc.id;
        renderList();
        renderForm(npc);
        renderPreview();
        saveAll();
    }

    function deleteNpc(id) {
        if (npcs.length <= 1) return;
        npcs = npcs.filter((n) => n.id !== id);
        if (currentId === id) {
            currentId = npcs[0]?.id || null;
            if (currentId) renderForm(getCurrentNpc());
        }
        renderList();
        renderPreview();
        saveAll();
    }

    function rollAbility(stat) {
        const npc = getCurrentNpc();
        if (!npc) return;
        const dice = document.getElementById(`dice-${stat}`)?.value || npc.abilities[stat]?.dice || '';
        if (!dice) return;
        let val = rollDice(dice);
        if (npc.version === '7') val *= 5;
        val = Math.max(0, val);
        const valEl = document.getElementById(`val-${stat}`);
        if (valEl) valEl.value = val;
        npc.abilities[stat] = { dice, value: val };
        calcDerived(npc);
        pushDerivedToForm(npc);
        renderPreview();
        renderList();
        scheduleSave();
    }

    function rollAll() {
        const npc = getCurrentNpc();
        if (!npc) return;
        STATS.forEach((s) => {
            const dice = document.getElementById(`dice-${s}`)?.value || npc.abilities[s]?.dice || '';
            if (!dice) return;
            let val = rollDice(dice);
            if (npc.version === '7') val *= 5;
            val = Math.max(0, val);
            const el = document.getElementById(`val-${s}`);
            if (el) el.value = val;
            npc.abilities[s] = { dice, value: val };
        });
        calcDerived(npc);
        pushDerivedToForm(npc);
        renderPreview();
        renderList();
        scheduleSave();
    }

    function copyText(text, btn) {
        const orig = btn.textContent;
        const ok = () => {
            btn.textContent = 'コピー完了 ✓';
            setTimeout(() => {
                btn.textContent = orig;
            }, 1600);
        };
        if (navigator.clipboard) {
            navigator.clipboard
                .writeText(text)
                .then(ok)
                .catch(() => fallbackCopy(text, ok));
        } else {
            fallbackCopy(text, ok);
        }
    }

    function fallbackCopy(text, cb) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        cb?.();
    }

    /* ================================================================
       イベント
    ================================================================ */
    function initEvents() {
        document.getElementById('addNpcBtn').addEventListener('click', addNpc);

        // バージョン切り替え
        document.querySelectorAll('input[name="ver"]').forEach((r) => {
            r.addEventListener('change', () => {
                const npc = getCurrentNpc();
                if (npc) {
                    npc.version = r.value;
                    calcDerived(npc);
                    pushDerivedToForm(npc);
                }
                applyVerUI(r.value);
                onChange();
            });
        });

        // コマンド種別 (CoC6)
        document.querySelectorAll('input[name="cmdType"]').forEach((r) => r.addEventListener('change', onChange));

        // 基本情報
        ['npcName', 'npcMemo'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', onChange);
        });

        // 能力値
        STATS.forEach((s) => {
            document.getElementById(`dice-${s}`)?.addEventListener('input', onChange);
            document.getElementById(`val-${s}`)?.addEventListener('input', () => {
                const npc = getCurrentNpc();
                if (npc) {
                    npc.abilities[s].value = parseInt(document.getElementById(`val-${s}`).value) || 0;
                    calcDerived(npc);
                    pushDerivedToForm(npc);
                }
                onChange();
            });
            document.getElementById(`roll-${s}`)?.addEventListener('click', () => rollAbility(s));
        });

        // 派生値 (手動)
        ['npcHp', 'npcMp', 'npcSan', 'npcDb', 'npcBuild', 'npcMov'].forEach((id) => {
            document.getElementById(id)?.addEventListener('input', onChange);
        });

        // SAN トグル
        document.getElementById('sanToggle').addEventListener('change', function () {
            updateSanUI(this.checked);
            onChange();
        });

        // 全ロール
        document.getElementById('rollAllBtn').addEventListener('click', rollAll);

        // 技能・コマンド追加
        document.getElementById('addSkillBtn').addEventListener('click', () => {
            addSkillRow();
            onChange();
        });
        document.getElementById('addCmdBtn').addEventListener('click', () => {
            addCmdRow();
            onChange();
        });

        // プレビュータブ
        document.querySelectorAll('.pv-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pv-tab').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                pvMode = btn.dataset.pv;
                renderPreview();
            });
        });

        // コピーボタン
        document.getElementById('copyBtn').addEventListener('click', function () {
            const npc = getCurrentNpc();
            if (!npc) return;
            copyText(pvMode === 'json' ? genJson(npc) : genChaPare(npc), this);
        });
        document.getElementById('rollCopyBtn').addEventListener('click', function () {
            rollAll();
            const npc = getCurrentNpc();
            if (!npc) return;
            copyText(pvMode === 'json' ? genJson(npc) : genChaPare(npc), this);
        });
    }

    /* ================================================================
       NPCリスト折り畳み
    ================================================================ */
    function initCollapsibleList() {
        const btn = document.getElementById('toggleListBtn');
        const panel = document.getElementById('listPanel');
        if (!btn || !panel) return;
        function updateIcon() {
            btn.querySelector('.material-symbols-outlined').textContent = panel.classList.contains('list-collapsed') ? 'expand_more' : 'expand_less';
        }
        btn.addEventListener('click', () => {
            panel.classList.toggle('list-collapsed');
            updateIcon();
        });
        // デフォルト: 狭いときは折り畳む
        if (window.innerWidth <= 900) {
            panel.classList.add('list-collapsed');
            updateIcon();
        }
    }

    /* ================================================================
       ユーティリティ
    ================================================================ */
    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ================================================================
       初期化
    ================================================================ */
    document.addEventListener('DOMContentLoaded', () => {
        loadAll();
        if (npcs.length === 0) {
            const npc = newNpc('7');
            npcs.push(npc);
            currentId = npc.id;
        } else if (!currentId || !npcs.find((n) => n.id === currentId)) {
            currentId = npcs[0].id;
        }
        renderList();
        renderForm(getCurrentNpc());
        renderPreview();
        initEvents();
        initCollapsibleList();
        if (window.IKLab?.initNumSpinners) IKLab.initNumSpinners();
    });
})();

