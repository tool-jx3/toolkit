/*!
 * mock.v1.js - a stand-in for CCFOLIA's room screen (/rooms/{room}), for the preview
 *
 * The message box's structure, base styles and behavior are copied from CCFOLIA's bundle
 * (1.37.4, 2026-09-25); see css.v1.js for the tree. The board, pieces, buttons and chat drawer
 * around it are rough stand-ins, there only so a CSS that fails to hide the room shows it here too.
 * Class names starting with "ccf-" exist only here; the generated CSS must never rely on them.
 *
 * Behavior (as CCFOLIA):
 *   - messages wait in a queue; the front one is shown
 *   - the text is typed one character at a time: 80ms, or 800ms after 。、,. and line breaks
 *   - 1.2s after the last character the queue moves on; the last message stays on screen
 *   - "close" moves the queue on and slides the box out; MUI then sets visibility: hidden inline
 *   - a new message opens it again
 */
(function () {
  "use strict";

  const P = window.MboxPresets;
  const FONT = '"Roboto", "Helvetica", "Arial", sans-serif';
  const SHADOW6 = "0px 3px 5px -1px rgba(0,0,0,0.2), 0px 6px 10px 0px rgba(0,0,0,0.14), 0px 1px 18px 0px rgba(0,0,0,0.12)";
  // MUI dark mode lightens a Paper by its elevation: 11% white for elevation 6.
  const OVERLAY6 = "linear-gradient(rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.11))";
  const DRAWER_W = 360;

  const BASE_CSS = `
*, *::before, *::after { box-sizing: inherit; }
html { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
html, body, #root { height: 100%; margin: 0; }
body { background-color: #121212; color: #fff; font-family: ${FONT}; font-size: 0.875rem; line-height: 1.43; overflow: hidden; }
img { user-select: none; }
.MuiPaper-root { background-color: #121212; color: #fff; transition: box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms; }
.MuiPaper-rounded { border-radius: 4px; }
.MuiPaper-elevation6 { box-shadow: ${SHADOW6}; background-image: ${OVERLAY6}; }
.MuiToolbar-root { position: relative; display: flex; align-items: center; }
.MuiToolbar-gutters { padding-left: 16px; padding-right: 16px; }
@media (min-width: 600px) { .MuiToolbar-gutters { padding-left: 24px; padding-right: 24px; } }
.MuiToolbar-dense { min-height: 48px; }
.MuiTypography-root { margin: 0; }
.MuiTypography-subtitle2 { font-family: ${FONT}; font-weight: 500; font-size: 0.875rem; line-height: 1.57; letter-spacing: 0.00714em; }
.MuiTypography-body1 { font-family: ${FONT}; font-weight: 400; font-size: 1rem; line-height: 1.5; letter-spacing: 0.00938em; }
.MuiTypography-body2 { font-family: ${FONT}; font-weight: 400; font-size: 0.875rem; line-height: 1.43; letter-spacing: 0.01071em; }
.${P.RESULT_CLASS.success} { color: #2196f3; }
.${P.RESULT_CLASS.failure} { color: #dc004e; }
.${P.RESULT_CLASS.neutral} { color: rgba(255, 255, 255, 0.7); }
.MuiButtonBase-root { display: inline-flex; align-items: center; justify-content: center; position: relative; box-sizing: border-box; background-color: transparent;
  outline: 0; border: 0; margin: 0; border-radius: 0; padding: 0; cursor: pointer; user-select: none; vertical-align: middle; color: inherit; }
.MuiIconButton-root { text-align: center; flex: 0 0 auto; font-size: 1.5rem; padding: 8px; border-radius: 50%; overflow: visible; color: #fff; }
.MuiIconButton-edgeEnd { margin-right: -12px; }
.MuiIconButton-sizeLarge { padding: 12px; font-size: 1.75rem; }
.MuiSvgIcon-root { user-select: none; width: 1em; height: 1em; display: inline-block; fill: currentColor; flex-shrink: 0; font-size: 1.5rem; }
.MuiIconButton-sizeLarge .MuiSvgIcon-root { font-size: inherit; }

/* ---- the room around the message box (stand-ins) ---- */
.ccf-room { position: absolute; inset: 0; }
.ccf-screen { position: absolute; left: 0; top: 0; bottom: 0; right: ${DRAWER_W}px; overflow: hidden;
  background: radial-gradient(ellipse at 30% 30%, #4b5a7a, transparent 60%), radial-gradient(ellipse at 75% 80%, #6a4a3a, transparent 55%), #1d2130; }
.ccf-field { position: absolute; left: 50%; top: 46%; width: 62%; height: 62%; transform: translate(-50%, -50%);
  background: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 48px 48px, linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 48px 48px, #2d3348;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.2); }
.ccf-piece { position: absolute; width: 72px; height: 144px; background-size: contain; background-repeat: no-repeat; background-position: bottom; }
.ccf-appbar { position: absolute; left: 0; right: 0; top: 0; height: 64px; display: flex; align-items: center; gap: 18px; padding: 0 24px; background: rgba(33,33,33,0.9); font-weight: 700; }
.ccf-appbar i { width: 22px; height: 22px; border-radius: 50%; background: #e0e0e0; opacity: 0.8; }
.ccf-appbar .ccf-grow { flex: 1; }
.ccf-status { position: absolute; left: 8px; top: 72px; display: grid; gap: 6px; }
.ccf-status div { width: 190px; height: 44px; background: rgba(255,255,255,0.92); color: #222; font-size: 12px; font-weight: 700; padding: 4px 8px; border-radius: 2px; }
.ccf-zoom { position: absolute; right: 24px; bottom: 150px; display: grid; gap: 10px; }
.ccf-zoom b { width: 26px; height: 26px; background: #fff; border-radius: 2px; }
.ccf-fab { position: absolute; right: 24px; bottom: 24px; width: 56px; height: 56px; border-radius: 50%; background: #fff; box-shadow: ${SHADOW6}; }
.ccf-drawer { position: absolute; right: 0; top: 0; bottom: 0; width: ${DRAWER_W}px; background: rgba(44,44,44,0.87); border-left: 1px solid rgba(255,255,255,0.12); display: flex; flex-direction: column; }
.ccf-drawer header { height: 64px; display: flex; align-items: center; justify-content: center; font-weight: 700; background: #212121; }
.ccf-log { flex: 1; padding: 12px 16px; display: grid; align-content: end; gap: 14px; color: rgba(255,255,255,0.85); }
.ccf-log p { margin: 0; }
.ccf-log b { display: block; color: #6fb6ff; font-size: 13px; }
.ccf-form { height: 190px; background: #1e1e1e; border-top: 1px solid rgba(255,255,255,0.12); padding: 12px 16px; color: #777; }

/* ---- message box, as CCFOLIA styles it ---- */
.ccf-mb { margin: 0 auto; max-width: 720px; position: absolute; left: 16px; right: 88px; bottom: 16px; z-index: 102; }
.ccf-mb-img { width: 240px; position: absolute; bottom: 100%; left: 8px; z-index: -1; transform-origin: bottom center; }
.ccf-mb-box { position: relative; z-index: 1; background: rgba(22, 22, 22, 0.84); color: #f5f5f5; }
.ccf-mb-dice { margin-left: 180px; position: absolute; bottom: 100%; right: 16px; z-index: -1; display: flex; flex-wrap: wrap-reverse; justify-content: center; }
.ccf-mb-dice img { opacity: 0; animation: ccf-dice 600ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both; width: 75px; height: 75px; }
.ccf-mb-head { display: flex; justify-content: flex-start; align-items: center; background: rgba(0, 0, 0, 0); }
.ccf-mb-result { margin-left: 16px; }
.ccf-grow { flex-grow: 1; }
.ccf-mb-content { padding: 0 24px 16px; height: 80px; overflow-y: auto; }
.ccf-mb-text { white-space: pre-wrap; }
@media (max-width: 899.95px) {
  .ccf-mb-img { width: 180px; }
  .ccf-mb-dice { margin-left: 60px; }
  .ccf-mb-dice img { width: 50px; height: 50px; }
}
@media (max-width: 599.95px) { .ccf-mb-img { width: 120px; } }
@keyframes ccf-dice {
  0% { opacity: 0; transform: rotate(0deg) scale(0) translate(0, 0); }
  100% { opacity: 1; transform: rotate(720deg) scale(1) translate(0, 0); }
}
`;

  const ICON = {
    skip: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
    close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  };
  const svg = d => `<svg class="MuiSvgIcon-root" focusable="false" aria-hidden="true" viewBox="0 0 24 24"><path d="${d}"></path></svg>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dataUrl = text => "data:image/svg+xml," + encodeURIComponent(text).replace(/'/g, "%27");

  // ---------------------------------------------------------------- images

  const portraitCache = new Map();
  // Sample portraits for the message box: shape "tall" (whole figure) or "square" (bust),
  // or url: the user's own image, which every speaker then shows.
  let sample = { shape: "tall", url: "" };

  // A standing figure, 240 x 480, transparent around it. "square" frames its head and shoulders.
  function portraitUrl(who, shape) {
    const key = who + "|" + (shape || "tall");
    if (portraitCache.has(key)) return portraitCache.get(key);
    const s = P.SPEAKERS[who] || P.SPEAKERS.hinata;
    const frame = shape === "square" ? "width='240' height='240' viewBox='0 22 240 240'" : "width='240' height='480' viewBox='0 0 240 480'";
    const url = dataUrl(`<svg xmlns='http://www.w3.org/2000/svg' ${frame}>`
      + `<path d='M58 118c0-52 28-84 62-84s62 32 62 84v96c-18 10-106 10-124 0z' fill='${s.hair}'/>`
      + `<rect x='106' y='150' width='28' height='30' fill='${s.skin}'/>`
      + `<path d='M60 196c10-18 34-26 60-26s50 8 60 26l14 150c-26 14-122 14-148 0z' fill='${s.cloth}'/>`
      + `<path d='M60 200c-12 40-18 90-14 140l16 2c2-48 8-96 12-128z' fill='${s.cloth}'/>`
      + `<path d='M180 200c12 40 18 90 14 140l-16 2c-2-48-8-96-12-128z' fill='${s.cloth}'/>`
      + `<circle cx='54' cy='346' r='10' fill='${s.skin}'/><circle cx='186' cy='346' r='10' fill='${s.skin}'/>`
      + "<path d='M86 340h68l-6 132h-20l-6-104-6 104h-20z' fill='#2a2a36'/>"
      + "<path d='M106 176l14 22 14-22' fill='#f2ede4'/>"
      + `<ellipse cx='120' cy='112' rx='40' ry='46' fill='${s.skin}'/>`
      + "<ellipse cx='104' cy='118' rx='5' ry='7' fill='#2a2230'/><ellipse cx='136' cy='118' rx='5' ry='7' fill='#2a2230'/>"
      + "<path d='M112 138q8 6 16 0' stroke='#b0686a' stroke-width='3' fill='none' stroke-linecap='round'/>"
      + `<path d='M78 108c4-38 26-54 42-54s38 16 42 54c-12-18-26-26-42-26s-30 8-42 26z' fill='${s.hair}'/>`
      + "</svg>");
    portraitCache.set(key, url);
    return url;
  }

  const sampleImage = who => sample.url || portraitUrl(who, sample.shape);

  // Dice faces, drawn instead of CCFOLIA's /images/{faces}_dice/ PNGs.
  function dieUrl(faces, label, dark) {
    const bg = dark ? "#8a1c2b" : "#f4f1ea", ink = dark ? "#ffffff" : "#1c1c24";
    const shape = faces === 6
      ? `<rect x='8' y='8' width='84' height='84' rx='16' fill='${bg}' stroke='#00000055' stroke-width='3'/>`
      : `<path d='M50 4 94 40 50 96 6 40z' fill='${bg}' stroke='#00000055' stroke-width='3'/>`;
    const size = String(label).length > 1 ? 30 : 38;
    return dataUrl("<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>" + shape
      + `<text x='50' y='${faces === 6 ? 50 : 46}' font-family='Arial' font-weight='700' font-size='${size}' fill='${ink}' text-anchor='middle' dominant-baseline='central'>${label}</text></svg>`);
  }

  // [faces, value] -> image urls; a 1D100 is a tens die and a ones die, as CCFOLIA shows it.
  function diceImages(dice) {
    const out = [];
    for (const [faces, value] of dice || []) {
      if (faces === 100) {
        const tens = Math.floor((value % 100) / 10), ones = value % 10;
        out.push(dieUrl(10, tens ? tens + "0" : "00", true), dieUrl(10, String(ones), false));
      } else {
        out.push(dieUrl(faces, String(value), false));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- page

  /* TRPG Toolkit 合輯：盤面周圍的替身裡，房間名稱、狀態欄與聊天記錄是範例資料，跟著語言換；
   * 聊天抽屜的標題、輸入欄的提示字，以及訊息框與按鈕的 aria-label 是 CCFOLIA 自己的介面文字，
   * CCFOLIA 只有日文介面，照原樣保留，預覽才會跟實際畫面一樣。訊息被秘密骰換掉後的
   * 內文，以及依結果文字判斷成敗的正規表示式，也都是照 CCFOLIA 的實際輸出。 */
  function standInText() {
    const S = P.SPEAKERS;
    return {
      appbar: `${esc(T("mock.roomName"))} <span class='ccf-grow'></span><i></i><i></i><i></i><i></i><i></i>`,
      status: `<div>${esc(S.hinata.name)}　HP 11/11　SAN 55</div><div>${esc(S.ren.name)}　HP 12/12　SAN 60</div>`,
      log: `<p><b>KP</b>${esc(T("mock.log.gate"))}</p><p><b>${esc(S.hinata.name)}</b>${esc(T("mock.log.first"))}</p>`,
    };
  }

  function documentHtml() {
    const pieces = [["hinata", 24, 30], ["ren", 44, 34], ["shizuku", 62, 28]]
      .map(([who, x, y]) => `<div class='ccf-piece' style='left: ${x}%; top: ${y}%; background-image: url("${portraitUrl(who)}")'></div>`).join("");
    const text = standInText();
    return "<!doctype html><html lang='ja'><head><meta charset='utf-8'>"
      + `<style id="ccf-base">${BASE_CSS}</style><style id="obs-custom"></style></head>`
      + "<body><div id='root'><div class='ccf-room'>"
      + "<div class='ccf-screen' id='ccf-screen'>"
      + `<div class='ccf-field'></div>${pieces}`
      + `<div class='ccf-appbar'>${text.appbar}</div>`
      + `<div class='ccf-status'>${text.status}</div>`
      + "<div class='ccf-zoom'><b></b><b></b><b></b></div><div class='ccf-fab'></div>"
      + "</div>"
      + "<div class='ccf-drawer'><header>ルームチャット</header>"
      + `<div class='ccf-log'>${text.log}</div>`
      + "<div class='ccf-form'>メッセージを入力</div></div>"
      + "</div></div></body></html>";
  }

  // ---------------------------------------------------------------- message box

  const PAUSE = /[\r\n。、,.]/;
  const SPEAKING = 80, PAUSING = 800, NEXT_AFTER = 1200, ENTER_MS = 225, EXIT_MS = 195;

  function mem(doc) {
    const win = doc.defaultView;
    return win.__mb || (win.__mb = { queue: [], el: null, shownId: null, timer: 0, nextTimer: 0, closed: false, serial: 0 });
  }

  function boxHtml() {
    const button = (label, d) => `<button class='MuiButtonBase-root MuiIconButton-root MuiIconButton-edgeEnd MuiIconButton-sizeLarge' tabindex='-1' type='button' aria-label='${label}'>${svg(d)}</button>`;
    return "<div class='MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation6 ccf-mb' role='status' aria-live='polite' aria-atomic='true' aria-label='メッセージ'>"
      + "<div class='MuiPaper-root MuiPaper-elevation MuiPaper-rounded MuiPaper-elevation6 ccf-mb-box'>"
      + "<div class='ccf-mb-dice'></div>"
      + "<div class='MuiToolbar-root MuiToolbar-gutters MuiToolbar-dense ccf-mb-head'>"
      + "<h6 class='MuiTypography-root MuiTypography-subtitle2'></h6>"
      + "<div class='ccf-grow'></div>"
      + button("スキップ", ICON.skip) + button("閉じる", ICON.close)
      + "</div>"
      + "<div class='ccf-mb-content'><p class='MuiTypography-root MuiTypography-body1 ccf-mb-text'></p></div>"
      + "</div></div>";
  }

  // MUI Slide, direction "up": off-screen means moved down by the distance to the window's bottom.
  function offscreen(el) {
    const win = el.ownerDocument.defaultView;
    el.style.transform = "";
    return `translateY(${Math.round(win.innerHeight - el.getBoundingClientRect().top)}px)`;
  }

  function slideIn(doc) {
    const m = mem(doc), el = m.el;
    m.closed = false;
    el.style.visibility = "";
    el.style.transition = "";
    el.style.transform = offscreen(el);
    void el.offsetHeight;
    el.style.transition = `transform ${ENTER_MS}ms cubic-bezier(0, 0, 0.2, 1) 0ms`;
    el.style.transform = "none";
  }

  function slideOut(doc) {
    const m = mem(doc), el = m.el;
    m.closed = true;
    el.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 0.6, 1) 0ms`;
    el.style.transform = offscreen(el);
    setTimeout(() => { if (m.closed) el.style.visibility = "hidden"; }, EXIT_MS);
  }

  // What CCFOLIA derives from a message: the text, "🎲 ＞ 成功" and its color.
  function view(msg) {
    const s = P.SPEAKERS[msg.who] || P.SPEAKERS.hinata;
    const roll = !!msg.result || !!msg.secret;
    const result = msg.result && !msg.secret ? (msg.result.match(/＞[^＞]+$/) || [msg.result])[0] : "";
    const kind = !result ? "" : /成功|スペシャル/.test(msg.result) ? "success" : /失敗/.test(msg.result) ? "failure" : "neutral";
    return {
      name: s.name, image: s.portrait === false ? null : sampleImage(msg.who),
      text: msg.secret ? "シークレットダイス" : T(msg.text), result, kind,
      dice: roll && !msg.secret ? diceImages(msg.dice) : [],
    };
  }

  function show(doc, msg) {
    const m = mem(doc);
    if (!m.el) {
      doc.getElementById("ccf-screen").insertAdjacentHTML("beforeend", boxHtml());
      m.el = doc.querySelector(".ccf-mb");
      m.el.querySelectorAll("button")[0].addEventListener("click", () => next(doc));
      m.el.querySelectorAll("button")[1].addEventListener("click", () => close(doc));
      slideIn(doc);
    } else if (m.closed) {
      slideIn(doc);
    }
    const v = view(msg), el = m.el;
    m.shownId = msg.id;
    m.shown = msg;

    // Portrait: rendered only when the message has one.
    let img = el.querySelector(":scope > img");
    if (v.image && !img) {
      el.insertAdjacentHTML("afterbegin", "<img class='ccf-mb-img' draggable='false' alt=''>");
      img = el.querySelector(":scope > img");
    } else if (!v.image && img) {
      img.remove();
      img = null;
    }
    if (img && img.getAttribute("src") !== v.image) img.setAttribute("src", v.image);

    // Dice: new elements per roll (keyed by the message's time), so their animation replays.
    el.querySelector(".ccf-mb-dice").innerHTML = v.dice
      .map((src, i) => `<img src='${src}' draggable='false' style='animation-delay: ${i * 100}ms'>`).join("");

    const head = el.querySelector(".ccf-mb-head");
    head.querySelector("h6").textContent = v.name;
    head.querySelector(".ccf-mb-result")?.remove();
    if (v.result) {
      head.querySelector("h6").insertAdjacentHTML("afterend",
        `<p class='MuiTypography-root MuiTypography-body2 ${P.RESULT_CLASS[v.kind]} ccf-mb-result'>🎲 ${esc(v.result)}</p>`);
    }
    type(doc, v.text);
  }

  function type(doc, text) {
    const m = mem(doc), p = m.el.querySelector(".ccf-mb-text"), box = p.parentElement;
    clearTimeout(m.timer);
    clearTimeout(m.nextTimer);
    p.textContent = "";
    let i = 0;
    const step = () => {
      if (i < text.length) {
        const c = text.charAt(i++);
        p.textContent += c;
        box.scrollTop = 999999;
        m.timer = setTimeout(step, PAUSE.test(c) ? PAUSING : SPEAKING);
      } else {
        m.nextTimer = setTimeout(() => next(doc), NEXT_AFTER);
      }
    };
    step();
  }

  // The queue moves on; the next message shows, or the last one stays.
  function next(doc) {
    const m = mem(doc);
    clearTimeout(m.nextTimer);
    if (m.queue.length && m.queue[0].id === m.shownId) m.queue.shift();
    if (m.queue.length) show(doc, m.queue[0]);
  }

  function send(doc, msg) {
    const m = mem(doc);
    const item = Object.assign({ id: "mb" + (++m.serial) }, msg);
    m.queue.push(item);
    if (m.queue.length === 1) show(doc, item);
  }

  function close(doc) {
    const m = mem(doc);
    if (!m.el || m.closed) return;
    if (m.queue.length && m.queue[0].id === m.shownId) m.queue.shift();
    slideOut(doc);
    if (m.queue.length) setTimeout(() => show(doc, m.queue[0]), EXIT_MS + 20);
  }

  function reset(doc) {
    const m = mem(doc);
    clearTimeout(m.timer);
    clearTimeout(m.nextTimer);
    m.queue.length = 0;
    m.shownId = null;
    m.closed = false;
    if (m.el) m.el.remove();
    m.el = null;
  }

  // data: { css, sample: { shape, url } }
  function update(doc, data) {
    const style = doc.getElementById("obs-custom");
    if (style.textContent !== data.css) style.textContent = data.css;
    const next = data.sample || sample;
    if (next.shape === sample.shape && (next.url || "") === sample.url) return;
    sample = { shape: next.shape === "square" ? "square" : "tall", url: next.url || "" };
    // Swap the portrait of the message on screen right away.
    const m = mem(doc), img = m.el && m.el.querySelector(":scope > img");
    const v = m.shown && view(m.shown);
    if (img && v && v.image) img.setAttribute("src", v.image);
  }

  /* TRPG Toolkit 合輯：切換語言時重寫盤面周圍的範例文字；畫面上的那則訊息也用新語言
   * 重新顯示一次（跟 CCFOLIA 換下一則時一樣從頭打字）。已經關掉的訊息框維持關閉。 */
  function relabel(doc) {
    const text = standInText();
    doc.querySelector(".ccf-appbar").innerHTML = text.appbar;
    doc.querySelector(".ccf-status").innerHTML = text.status;
    doc.querySelector(".ccf-log").innerHTML = text.log;
    const m = mem(doc);
    if (m.el && !m.closed && m.shown) show(doc, m.shown);
  }

  window.MboxMock = { documentHtml, update, send, close, reset, portraitUrl, relabel };
})();
