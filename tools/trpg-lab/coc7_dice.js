document.addEventListener('DOMContentLoaded', () => {
    /* ---- DOM 参照 ---- */
    const bdMinusBtn = document.getElementById('bd-minus-btn');
    const bdPlusBtn = document.getElementById('bd-plus-btn');
    const skillMinusBtn = document.getElementById('skill-minus-btn');
    const skillPlusBtn = document.getElementById('skill-plus-btn');
    const bdInput = document.getElementById('bd-input');
    const skillInput = document.getElementById('skill-input');
    const rollBtn = document.getElementById('roll-btn');

    const customRollInput = document.getElementById('custom-roll-input');
    const customClearBtn = document.getElementById('custom-clear-btn');
    const customRollBtn = document.getElementById('custom-roll-btn');
    const addDiceBtns = document.querySelectorAll('.add-dice-btn');

    const resultContainer = document.getElementById('result-container');
    const diceDisplay = document.getElementById('dice-display');
    const resultText = document.getElementById('result-text');
    const successLevel = document.getElementById('success-level');

    const logButton = document.getElementById('log-button');
    const logCard = document.getElementById('log-card');
    const logList = document.getElementById('log-list');
    const logClearBtn = document.getElementById('log-clear-btn');
    const logCloseBtn = document.getElementById('log-close-btn');

    const diceSound = document.getElementById('dice-sound');

    /* ---- BD/PD ボタン ---- */
    bdMinusBtn.addEventListener('click', () => {
        const v = parseInt(bdInput.value);
        if (v > -2) bdInput.value = v - 1;
    });
    bdPlusBtn.addEventListener('click', () => {
        const v = parseInt(bdInput.value);
        if (v < 2) bdInput.value = v + 1;
    });

    /* ---- 技能値ボタン ---- */
    skillMinusBtn.addEventListener('click', () => {
        const v = parseInt(skillInput.value);
        if (!v) skillInput.value = 0;
        else if (v > 0) skillInput.value = v - 1;
    });
    skillPlusBtn.addEventListener('click', () => {
        const v = parseInt(skillInput.value);
        skillInput.value = v ? v + 1 : 1;
    });

    /* ---- ユーティリティ ---- */
    function rollDice(sides) {
        return Math.floor(Math.random() * sides) + 1;
    }

    function getSuccessLevel(roll, skill) {
        if (roll === 1) return { text: 'クリティカル', cls: 'critical' };
        if (skill < 50 && roll >= 96) return { text: 'ファンブル', cls: 'fumble' };
        if (skill >= 50 && roll === 100) return { text: 'ファンブル', cls: 'fumble' };
        if (roll <= Math.floor(skill / 5)) return { text: 'イクストリーム成功', cls: 'extreme' };
        if (roll <= Math.floor(skill / 2)) return { text: 'ハード成功', cls: 'hard' };
        if (roll <= skill) return { text: 'レギュラー成功', cls: 'regular' };
        return { text: '失敗', cls: 'failure' };
    }

    function createDiceSymbol(value, isPercent = false, index = 0) {
        const span = document.createElement('span');
        span.classList.add('dice-symbol');
        span.textContent = isPercent ? (value === 0 ? '00' : String(value).padStart(2, '0')) : value;
        span.style.animation = `dice-pop-in 0.28s cubic-bezier(0.34,1.56,0.64,1) ${index * 30}ms both`;
        return span;
    }

    function animateDiceSymbol(span, finalValue, isPercent = false, duration = 800, interval = 50) {
        const iterations = Math.floor(duration / interval);
        let count = 0;
        const anim = setInterval(() => {
            count++;
            if (isPercent) {
                const rand = Math.floor(Math.random() * 10);
                span.textContent = rand === 0 ? '00' : String(rand) + '0';
            } else {
                span.textContent = Math.floor(Math.random() * 10);
            }
            if (count >= iterations) {
                clearInterval(anim);
                span.textContent = isPercent ? (finalValue === 0 ? '00' : finalValue) : finalValue;
            }
        }, interval);
    }

    function playSoundAndClear() {
        diceDisplay.innerHTML = '';
        if (diceSound) {
            diceSound.currentTime = 0;
            diceSound.play().catch(() => {});
        }
    }

    /* ---- ローカルストレージ履歴管理 ---- */
    const HISTORY_KEY = 'iklab_coc7_dice_v1';
    const HISTORY_MAX = 200;

    function loadHistory() {
        try {
            return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        } catch {
            return [];
        }
    }

    function saveHistory(entries) {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, HISTORY_MAX)));
        } catch {}
    }

    function appendLog(text) {
        const timeStamp = new Date().toLocaleTimeString();
        const li = document.createElement('li');
        li.classList.add('log-line');

        const tsSpan = document.createElement('span');
        tsSpan.classList.add('timestamp');
        tsSpan.textContent = `[${timeStamp}]`;

        const txtSpan = document.createElement('span');
        txtSpan.classList.add('log-text');
        txtSpan.textContent = text;

        li.appendChild(tsSpan);
        li.appendChild(txtSpan);
        logList.prepend(li);

        /* ローカルストレージへ保存 */
        const history = loadHistory();
        history.unshift({ time: timeStamp, text });
        saveHistory(history);
    }

    /* 起動時に履歴を復元（アニメーションなし） */
    (function restoreHistory() {
        const history = loadHistory();
        history.forEach((entry) => {
            const li = document.createElement('li');
            li.classList.add('log-line');
            li.style.animation = 'none'; /* 復元時はアニメーション無効 */

            const tsSpan = document.createElement('span');
            tsSpan.classList.add('timestamp');
            tsSpan.textContent = `[${entry.time}]`;

            const txtSpan = document.createElement('span');
            txtSpan.classList.add('log-text');
            txtSpan.textContent = entry.text;

            li.appendChild(tsSpan);
            li.appendChild(txtSpan);
            logList.appendChild(li); /* 古い順に追加（prepend でなく append）*/
        });
    })();

    /* ---- 技能ロール ---- */
    rollBtn.addEventListener('click', () => {
        const bd_pd = parseInt(bdInput.value) || 0;
        const skill = skillInput.value ? parseInt(skillInput.value) : null;

        const oneDigit = rollDice(10) - 1; // 0〜9
        const rollTimes = 1 + Math.abs(bd_pd);
        const percentDice = [];
        for (let i = 0; i < rollTimes; i++) percentDice.push((rollDice(10) - 1) * 10);

        const candidates = percentDice.map((d) => {
            const v = d + oneDigit;
            return v === 0 ? 100 : v;
        });

        // 採用するインデックスを特定する
        let finalRoll, chosenIdx;
        if (bd_pd > 0) {
            finalRoll = Math.min(...candidates);
            chosenIdx = candidates.indexOf(finalRoll);
        } else if (bd_pd < 0) {
            finalRoll = Math.max(...candidates);
            chosenIdx = candidates.indexOf(finalRoll);
        } else {
            finalRoll = candidates[0];
            chosenIdx = 0;
        }

        /* 表示更新 */
        playSoundAndClear();

        // %ダイスのspanを配列で保持して後からハイライト適用できるようにする
        const percentSpans = [];
        percentDice.forEach((d, i) => {
            const span = createDiceSymbol(d, true, i);
            diceDisplay.appendChild(span);
            animateDiceSymbol(span, d, true);
            percentSpans.push(span);
        });
        const oneSpan = createDiceSymbol(oneDigit, false, percentDice.length);
        diceDisplay.appendChild(oneSpan);
        animateDiceSymbol(oneSpan, oneDigit, false);

        resultText.textContent = '...';
        resultText.classList.remove('result-pop');
        successLevel.textContent = '';
        successLevel.className = 'success-level';

        setTimeout(() => {
            resultText.textContent = `${finalRoll}`;
            void resultText.offsetWidth;
            resultText.classList.add('result-pop');
            if (skill) {
                const { text, cls } = getSuccessLevel(finalRoll, skill);
                successLevel.textContent = text;
                successLevel.className = `success-level ${cls} result-pop`;
            }
            // BD/PDがある場合のみ採用・非採用のハイライトを付ける
            if (bd_pd !== 0) {
                percentSpans.forEach((span, i) => {
                    if (i !== chosenIdx) {
                        span.classList.add('dimmed');
                    }
                });
            }
        }, 800);

        /* ログ */
        const skillText = skill !== null ? `[${skill}]` : '[]';
        const bdText = `BD/PD[${bd_pd}]`;
        const candidatesText = candidates.join(', ');
        const successText = skill ? ` ＞ ${getSuccessLevel(finalRoll, skill).text}` : '';
        appendLog(`技能値${skillText} ${bdText} ＞ ${candidatesText} ＞ ${finalRoll}${successText}`);
    });

    /* ---- カスタムロール ---- */
    customClearBtn.addEventListener('click', () => {
        customRollInput.value = '';
    });

    customRollBtn.addEventListener('click', () => {
        let command = customRollInput.value;
        if (!command) return;

        command = command
            .replace(/\s+/g, '')
            .replace(/[＋]/g, '+')
            .replace(/[－−]/g, '-')
            .replace(/[ｄＤ]/g, 'D')
            .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

        try {
            const parts = command.match(/([+-]?[^+-]+)/g);
            if (!parts) throw new Error('invalid');

            const diceResults = [];
            let total = 0;

            parts.forEach((part) => {
                const sign = part[0] === '+' || part[0] === '-' ? part[0] : '+';
                const body = part.replace(/^[+-]/, '');
                const diceMatch = body.match(/^(\d+)?D(\d+)$/i);

                if (diceMatch) {
                    const num = parseInt(diceMatch[1] || '1');
                    const sides = parseInt(diceMatch[2]);
                    const rolls = [];
                    for (let i = 0; i < num; i++) {
                        const r = rollDice(sides);
                        rolls.push(sign === '-' ? -r : r);
                    }
                    diceResults.push({ type: sign + num + 'D' + sides, rolls });
                    total += rolls.reduce((s, r) => s + r, 0);
                } else {
                    const val = parseInt(body);
                    diceResults.push({ type: sign + val, rolls: [] });
                    total += sign === '-' ? -val : val;
                }
            });

            /* ダイス表示 */
            playSoundAndClear();
            let diceIdx = 0;
            diceResults.forEach((item) => {
                if (!item.rolls.length) return;
                item.rolls.forEach((r) => {
                    const absR = Math.abs(r);
                    const span = createDiceSymbol(absR, false, diceIdx++);
                    diceDisplay.appendChild(span);
                    const sidesMatch = item.type.match(/D(\d+)$/i);
                    const sides = sidesMatch ? parseInt(sidesMatch[1]) : 6;
                    let count = 0;
                    const anim = setInterval(() => {
                        count++;
                        span.textContent = Math.floor(Math.random() * sides) + 1;
                        if (count >= 16) {
                            clearInterval(anim);
                            span.textContent = absR;
                        }
                    }, 50);
                });
            });

            resultText.textContent = '...';
            resultText.classList.remove('result-pop');
            successLevel.textContent = '';
            successLevel.className = 'success-level';
            setTimeout(() => {
                resultText.textContent = total;
                void resultText.offsetWidth;
                resultText.classList.add('result-pop');
                resultContainer.scrollTop = resultContainer.scrollHeight;
            }, 800);

            /* ログ */
            const detail = diceResults
                .map((item, idx) => {
                    if (item.rolls.length) {
                        const m = item.type.match(/^([+-]?)(\d+)D(\d+)$/i);
                        const sign = m[1] || '+';
                        const dSig = idx === 0 && sign === '+' ? '' : sign;
                        return `${dSig}${m[2]}D${m[3]}[${item.rolls.map((r) => Math.abs(r)).join(',')}]`;
                    } else {
                        const m = item.type.match(/^([+-]?)(\d+)$/);
                        const sign = m[1] || '+';
                        const dSig = idx === 0 && sign === '+' ? '' : sign;
                        return `${dSig}${m[2]}`;
                    }
                })
                .join('');
            appendLog(`${command} ＞ ${detail} ＞ ${total}`);
        } catch (e) {
            alert('無効なダイスコマンドです。\n例: 2D6+1D4+3');
        }
    });

    /* Enter キーでカスタムロール実行 */
    customRollInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') customRollBtn.click();
    });

    /* ---- ダイス追加ボタン ---- */
    addDiceBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const diceType = btn.dataset.diceType;
            let cur = customRollInput.value
                .trim()
                .replace(/\s+/g, '')
                .replace(/[＋]/g, '+')
                .replace(/[－−]/g, '-')
                .replace(/[ｄＤ]/g, 'D')
                .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));

            const parts = cur ? cur.match(/([+-]?[^+-]+)/g) : [];
            let lastPart = parts.length ? parts[parts.length - 1] : '';

            const diceRegex = /^([+-]?)(\d+)?D(\d+)$/i;
            const numRegex = /^([+-]?)(\d+)$/;
            const matchDice = lastPart.match(diceRegex);
            const matchBtnD = diceType.match(/^(\d+)?D(\d+)$/i);

            if (matchDice && matchBtnD) {
                const sign = matchDice[1] || '+';
                const num = parseInt(matchDice[2] || '1');
                const sides = matchDice[3];
                const btnNum = parseInt(matchBtnD[1] || '1');
                if (sides === matchBtnD[2]) {
                    parts[parts.length - 1] = sign === '-' ? lastPart + '+' + diceType : `${sign}${num + btnNum}D${sides}`;
                    customRollInput.value = parts.join('').replace(/^\+/, '');
                    return;
                }
            }

            const matchNum = lastPart.match(numRegex);
            const matchBtnN = diceType.match(/^(\d+)$/);
            if (matchNum && matchBtnN) {
                const sign = matchNum[1] || '+';
                const num = parseInt(matchNum[2]);
                const btnV = parseInt(matchBtnN[1]);
                parts[parts.length - 1] = sign === '-' ? lastPart + '+' + diceType : `${sign}${num + btnV}`;
                customRollInput.value = parts.join('').replace(/^\+/, '');
                return;
            }

            if (cur) {
                const prefix = /^[+-]/.test(diceType) ? '' : '+';
                customRollInput.value = cur + prefix + diceType;
            } else {
                customRollInput.value = diceType.replace(/^\+/, '');
            }
        });
    });

    /* ---- ログ表示 / 削除 / 閉じる ---- */
    logButton.addEventListener('click', () => {
        logCard.classList.add('log-open');
        logButton.style.display = 'none';
    });
    logCloseBtn.addEventListener('click', () => {
        logCard.classList.remove('log-open');
        logButton.style.display = '';
    });
    logClearBtn.addEventListener('click', () => {
        if (!logList.children.length) return;
        if (confirm('すべてのログを削除しますか？')) {
            logList.innerHTML = '';
            try {
                localStorage.removeItem(HISTORY_KEY);
            } catch {}
        }
    });
});

