/*! ココフォリア部屋ZIPメーカー — 画面側 v2 */
(function () {
	"use strict"
	var C = window.CcfoliaCore
	var APNG = window.CcfoliaApng
	/* TRPG Toolkit 合輯：上游用 window.__CCFOLIA_BUILD__.variant === "demo" 把
	 * localStorage 的鍵與 IndexedDB 的資料庫名換成另一組，好讓 Web 公開用的 DEMO
	 * 不去動到正常版的存檔。這裡不是 DEMO 版，那組分支已經移除；這個函式留著是
	 * 因為它散落在十幾處呼叫點，維持原樣比較好跟上游對照。 */
	function scopedStorageKey(base) {
		return base
	}
	/* 預設專案名會跟著語言走。存檔裡留的是當時那個語言的字串，所以判斷
	 * 「使用者還沒自己取過名字」時，三種語言的預設名都要算進去。 */
	function defaultProjectName() {
		return T("project.default")
	}
	function isUntouchedProjectName(name) {
		return ["project.default", "project.new"].some(function (key) {
			return Object.keys(I18N.messages).some(function (locale) {
				return (I18N.messages[locale] || {})[key] === name
			})
		})
	}

	var packer = new C.Packer()
	var ROLES = ["前景", "立ち絵", "パネル", "枠", "駒アイコン", "演出", "その他"]
	var PROJ_VERSION = 10

	/* ---------------- 状態 ---------------- */
	var state = {
		project: defaultProjectName(),
		settings: { maxEdge: 1200, quality: 0.8, convert: true },
		room: {
			fieldWidth: 40,
			fieldHeight: 30,
			backgroundUrl: null,
			foregroundUrl: null,
			displayGrid: false,
			bgmCrossfade: true,
			useLegacyDice: false,
			tachieAlignBottom: true,
			tachieBottom: 15,
			tachieHeight: 18,
			tachieZ: 30,
			variables: [],
		},
		images: [],
		baseMarkers: [],
		tachie: [], // 立ち絵ライブラリ（NPC）
		scenes: [],
		characters: [],
		effects: [], // カットイン
		sceneTemplates: [], // シーンテンプレート
		storyTexts: [], // シナリオテキスト
		kp: null, // KP駒（進行管理）ジェネレーターの設定
		memo: "",
		tasks: [],
	}
	var ui = {
		tab: "home",
		rightOpen: true,
		rightPinned: true,
		rightTab: "media",
		rightWidth: 340,
		bottomOpen: false,
		sideCollapsed: false,
		mediaRoles: [],
		mediaFilter: "",
		tachieGroup: "",
		sceneId: null, // プレビュー・メディア操作の対象シーン
		scopeScene: true, // プレビューでの移動をシーンだけに効かせるか
		sceneSel: [], // 一覧で選んでいるシーン
		multiPick: false, // まとめ選択モード（クリックで追加選択）
		storySel: [], // 一覧で選んでいるシナリオテキスト
		storyFocusId: null, // Shift範囲選択の基準
		previewPad: 0, // プレビューを引いて盤面の外まで見る（％）
		modal: null, // "bulk" | "tpl"
		imgSel: [], // 素材一覧で選んでいるもの
		imgQ: "", // 素材一覧の名前しぼりこみ
		imgRoles: [], // 素材一覧のタグしぼりこみ
		ren: { pre: "", start: 1, digits: 2 }, // 連番で名前をつける
		rep: { from: "", to: "" }, // 名前の置きかえ
		infoImg: null, // 詳細ポップアップの対象
		roomZoom: 0.82, roomPanX: 0, roomPanY: 0,
		sceneZoom: 1, scenePanX: 0, scenePanY: 0, scenePvHeight: 220, sceneSpace: false, scenePvSel: null,
		sceneAdvancedOpenId: null,
		roomSel: [], roomLayers: true, roomSpace: false, roomRealistic: false, roomQuick: null, roomPhSel: null,
		partTemplates: [], partTemplatesLoaded: false,
		settingsCat: "display",
		kpFolds: {},
		charFaceOpen: {},
		storyTemplatesOpen: false,
		cutinSel: [],
		cutinSelectMode: false,
		cutinTemplatesOpen: false,
		emPresetHighlightId: null,
		apng: null,
		imageMaker: null,
	}
	window.__state = state
	window.__ui = ui

	var toastTimer = null

	/* ---------------- 小道具 ---------------- */
	function $(sel, root) {
		return (root || document).querySelector(sel)
	}
	function all(sel, root) {
		return Array.prototype.slice.call((root || document).querySelectorAll(sel))
	}
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
		})
	}
	function kb(n) {
		if (n < 1024) return n + " B"
		if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB"
		return (n / 1024 / 1024).toFixed(1) + " MB"
	}
	function uid() {
		return Math.random().toString(36).slice(2, 9)
	}
	function toast(msg, kind) {
		var t = $("#toast")
		t.textContent = msg
		t.className = "toast show " + (kind || "")
		clearTimeout(toastTimer)
		toastTimer = setTimeout(function () {
			t.className = "toast"
		}, 4000)
	}
	function imageByName(name) {
		for (var i = 0; i < state.images.length; i++)
			if (state.images[i].name === name) return state.images[i]
		return null
	}
	function thumbOf(name) {
		var im = imageByName(name)
		return im ? im.url : ""
	}
	function sceneById(id) {
		for (var i = 0; i < state.scenes.length; i++)
			if (state.scenes[i].id === id) return state.scenes[i]
		return null
	}
	function currentScene() {
		return ui.sceneId ? sceneById(ui.sceneId) : null
	}
	function emById(sc, id) {
		if (!sc || !sc.extraMarkers) return null
		for (var i = 0; i < sc.extraMarkers.length; i++)
			if (sc.extraMarkers[i].id === id) return sc.extraMarkers[i]
		return null
	}
	function partById(id) {
		for (var i = 0; i < state.baseMarkers.length; i++)
			if (state.baseMarkers[i].id === id) return state.baseMarkers[i]
		return null
	}

	/* ---------------- 保存（ブラウザ内・メモとタスクと画面設定） ---------------- */
	var LSKEY = scopedStorageKey("ccfolia-zip-maker-v2")
	function snapHalf(v) {
		return C.roundGrid(v)
	}
	function normalizeGridData() {
		function vals(o, keys, min) { if(!o)return;keys.forEach(function(k){if(o[k]==null||o[k]==="")return;o[k]=snapHalf(o[k]);if(min&&o[k]<1)o[k]=1}) }
		vals(state.room,["fieldWidth","fieldHeight","tachieBottom","tachieHeight","tachiePosition"])
		;(state.baseMarkers||[]).forEach(function(b){vals(b,["x","y"]);vals(b,["width","height"],true)})
		;(state.tachie||[]).forEach(function(t){vals(t,["x","y","dy"]);vals(t,["widthM","heightM"],true)})
		;(state.scenes||[]).forEach(function(s){vals(s,["fieldWidth","fieldHeight"],true);Object.keys(s.overrides||{}).forEach(function(id){var ov=s.overrides[id];if(ov){vals(ov,["x","y"]);vals(ov,["width","height"],true)}});(s.extraMarkers||[]).forEach(function(m){vals(m,["x","y"]);vals(m,["width","height"],true)})})
		;(state.characters||[]).forEach(function(c){vals(c,["x","y"]);vals(c,["width","height"],true)})
	}

	/* ---------------- 素材の役割（複数可） ---------------- */
	/* TRPG Toolkit 合輯：ROLES 的七個值會寫進 localStorage 的存檔與 .ccproj，
	 * 也會拿來互相比對，所以一律維持原文；只有要顯示給人看的時候才翻。
	 * 「背景」是舊檔留下來的值，讀進來時會換成「前景」，這裡一併給個名字。 */
	var ROLE_KEYS = {
		前景: "role.fg",
		立ち絵: "role.tachie",
		パネル: "role.panel",
		枠: "role.frame",
		駒アイコン: "role.token",
		演出: "role.effect",
		その他: "role.other",
		背景: "role.bg",
	}
	function roleName(r) {
		var key = ROLE_KEYS[r]
		return key ? T(key) : String(r == null ? "" : r)
	}
	function rolesOf(im) {
		if (Array.isArray(im.roles) && im.roles.length) return im.roles
		var r = im.role === "背景" ? "前景" : im.role
		return [r || "その他"]
	}
	function hasRole(im, r) {
		return rolesOf(im).indexOf(r) >= 0
	}
	function roleLabel(im) {
		return rolesOf(im).map(roleName).join("・")
	}
	function toggleRole(im, r, on) {
		var rs = rolesOf(im).slice()
		var at = rs.indexOf(r)
		if (on && at < 0) rs.push(r)
		if (!on && at >= 0) rs.splice(at, 1)
		if (!rs.length) rs = ["その他"]
		im.roles = rs
		im.role = rs[0]
	}

	/* ---------------- 縦横比（部屋デザイン・マーカー） ---------------- */
	// 基本は縦横比を変えない。lockAspect を false にすると例外的に変えられる
	function aspectOf(o) {
		var im = o && o.imageUrl ? imageByName(o.imageUrl) : null
		if (im && im.w && im.h) return im.w / im.h
		if (o && o.aspect) return Number(o.aspect)
		return null
	}
	function keepAspect(o) {
		if (!o) return false
		if (o.kind === "full") return false // 全画面の演出は盤面にあわせる
		return o.lockAspect !== false
	}
	// changed: "width" | "height" | "image"
	function fixAspect(o, changed) {
		var a = aspectOf(o)
		if (!a) return o
		o.aspect = a
		if (!keepAspect(o)) return o
		if (changed === "height") o.width = Math.max(1, snapHalf(o.height * a))
		else o.height = Math.max(1, snapHalf(o.width / a))
		return o
	}
	function aspectNote(o) {
		var im = o && o.imageUrl ? imageByName(o.imageUrl) : null
		if (!im || !im.w) return ""
		return T("aspect.001", im.w, im.h)
	}
	function lockChip(attrs, on) {
		return (
			'<label class="lockchip' +
			(on ? " on" : "") +
			'" title="' + T("aspect.002") + '"><input type="checkbox" ' +
			attrs +
			(on ? " checked" : "") +
			"> " + T("aspect.003") + "</label>"
		)
	}

	/* ---------------- 立ち絵ライブラリ ---------------- */
	function tachieById(id) {
		for (var i = 0; i < state.tachie.length; i++) {
			if (state.tachie[i].id === id) return state.tachie[i]
		}
		return null
	}
	// 表情差分は大元（baseId）の大きさ・足元・重なり順を受け継ぐ。solo で別設定
	function tachieBase(tc) {
		if (!tc || !tc.baseId) return null
		var b = tachieById(tc.baseId)
		return b && b.id !== tc.id ? b : null
	}
	function tachieSrc(tc) {
		var b = tachieBase(tc)
		return b && !tc.solo ? b : tc
	}
	// 縦横比は絶対にいじらない：高さから幅を自動計算
	function fitTachie(tc) {
		var im = tc.imageUrl ? imageByName(tc.imageUrl) : null
		if (im && im.w && im.h) tc.aspect = im.w / im.h
		if (!tc.aspect) tc.aspect = 0.72
		var src = tachieSrc(tc)
		if (src !== tc) tc.heightM = src.heightM || state.room.tachieHeight || 18
		tc.heightM = Math.max(1, snapHalf(tc.heightM || state.room.tachieHeight || 18))
		tc.widthM = Math.max(1, snapHalf(tc.heightM * tc.aspect))
		return tc
	}
	// 基本は「前景画像と下揃え」（部屋のベース設定）
	function tachieBottomLine() {
		var b = state.room.tachieBottom
		return b == null ? state.room.fieldHeight / 2 : Number(b)
	}
	function tachieAlignMode() {
		if (!state.room.tachieAlign) state.room.tachieAlign = state.room.tachieAlignBottom === false ? "center" : "bottom"
		return state.room.tachieAlign
	}
	function tachieY(tc) {
		var dy = Number(tachieSrc(tc).dy || 0), h = Number(tc.heightM || 18), line = tachieBottomLine(), mode=tachieAlignMode()
		if (mode === "top") return snapHalf(line + h / 2 + dy)
		if (mode === "center") return snapHalf(line + dy)
		return snapHalf(line - h / 2 - dy)
	}
	function tachieDefaultX(){ return snapHalf(Number(state.room.tachiePosition)||0) }
	function tachieZ(tc) {
		var src = tachieSrc(tc)
		return src.z != null ? src.z : state.room.tachieZ || 21
	}
	function tachieGroups() {
		var out = []
		state.tachie.forEach(function (tc) {
			var g = tc.group || ""
			if (g && out.indexOf(g) < 0) out.push(g)
		})
		return out
	}
	function tachieInGroup() {
		return state.tachie.filter(function (tc) {
			return !ui.tachieGroup || (tc.group || "") === ui.tachieGroup
		})
	}
	function sceneTachieMarkers(s) {
		return (s.extraMarkers || []).filter(function (m) {
			return m.kind === "tachie"
		})
	}
	// 登場している立ち絵を等間隔に並べる
	function layoutTachie(s) {
		var list = sceneTachieMarkers(s)
		if (!list.length) return
		var gap = Number(settingsBag().tachieGap)
		if (!isFinite(gap)) gap = 0
		var total = list.reduce(function (sum, m) { return sum + (Number(m.width) || 0) }, 0) + gap * Math.max(0, list.length - 1)
		var left = (tachieAlignMode()==="position" ? tachieDefaultX() : 0) - total / 2
		list.forEach(function (m) {
			var w = Number(m.width) || 0
			m.x = snapHalf(left + w / 2)
			left += w + gap
		})
	}
	// ライブラリの変更を全シーンの立ち絵に反映（横位置はシーンごとに残す）
	function applyRoomTachieHeight() {
		var h=Math.max(1,snapHalf(Number(state.room.tachieHeight)||18))
		state.room.tachieHeight=h
		state.tachie.forEach(function(tc){ if(!tc.baseId||tc.solo) tc.heightM=h })
		syncTachie()
	}
	function syncTachie() {
		state.tachie.forEach(function (x) {
			fitTachie(x)
		})
		state.scenes.forEach(function (s) {
			;(s.extraMarkers || []).forEach(function (m) {
				if (!m.refId) return
				var tc = tachieById(m.refId)
				if (!tc) return
				m.kind = "tachie"
				m.name = tc.name
				m.imageUrl = tc.imageUrl
				m.width = tc.widthM
				m.height = tc.heightM
				m.z = tachieZ(tc)
				if (m.y == null) m.y = tachieY(tc)
			})
		})
	}

	function localProjectKey() {
		return String(state.project || defaultProjectName()).trim() || defaultProjectName()
	}
	function saveLocal() {
		try {
			var j = JSON.parse(localStorage.getItem(LSKEY) || "null") || {}
			if (!j.projects) j.projects = {}
			j.projects[localProjectKey()] = { memo: state.memo, tasks: state.tasks }
			j.ui = ui
			delete j.memo
			delete j.tasks
			localStorage.setItem(LSKEY, JSON.stringify(j))
		} catch (e) {}
	}
	function loadLocal() {
		try {
			var j = JSON.parse(localStorage.getItem(LSKEY) || "null")
			if (!j) return
			var pj = j.projects && j.projects[localProjectKey()]
			if (pj) {
				if (typeof pj.memo === "string") state.memo = pj.memo
				if (Array.isArray(pj.tasks)) state.tasks = pj.tasks
			} else {
				if (typeof j.memo === "string") state.memo = j.memo
				if (Array.isArray(j.tasks)) state.tasks = j.tasks
			}
			if (j.ui) {
				ui.rightOpen = j.ui.rightOpen !== false
				ui.rightPinned = j.ui.rightPinned !== false
				ui.rightTab = j.ui.rightTab === "preview" ? "preview" : "media"
				ui.rightWidth = Number(j.ui.rightWidth) || 340
				ui.bottomOpen = j.ui.bottomOpen === true
				ui.sideCollapsed = j.ui.sideCollapsed === true
			}
		} catch (e) {}
	}

	/* ---------------- 取り消し・やり直し ---------------- */
	var HKEYS = [
		"project",
		"room",
		"baseMarkers",
		"tachie",
		"scenes",
		"characters",
		"effects",
		"sceneTemplates",
		"storyTexts",
		"kp",
		"images",
		"memo",
		"tasks",
	]
	var histPast = [],
		histFuture = [],
		histLast = null,
		histBusy = false,
		tplHistPast = [],
		tplHistFuture = [],
		historyDomain = "project"
	function snapNow() {
		try {
			var o = {}
			HKEYS.forEach(function (k) {
				o[k] = state[k]
			})
			return JSON.stringify(o)
		} catch (e) {
			return null
		}
	}
	var savedProjectSnapshot = null
	function projectSnapshot() {
		try {
			settingsBag()
			var o = JSON.parse(snapNow())
			if (!o.kp) o.kp = newKpSettings()
			if (!Array.isArray(o.kp.skills)) o.kp.skills = []
			if (o.room) delete o.room.previewTachie
			return JSON.stringify(o)
		} catch (e) {
			return null
		}
	}
	function markProjectSaved(snapshot) {
		savedProjectSnapshot = snapshot || projectSnapshot()
	}
	function isProjectDirty() {
		var current = projectSnapshot()
		return savedProjectSnapshot != null && current != null && current !== savedProjectSnapshot
	}
	window.addEventListener("beforeunload", function (e) {
		if (!isProjectDirty()) return
		e.preventDefault()
		e.returnValue = ""
	})
	function restoreSnap(js) {
		var j = null
		try {
			j = JSON.parse(js)
		} catch (e) {
			return
		}
		if (!j) return
		HKEYS.forEach(function (k) {
			if (j[k] !== undefined) state[k] = j[k]
		})
		histLast = js
		histBusy = true
		ui.modal = null
		render()
		histBusy = false
		updateHistButtons()
	}
	// どこで変わっても拾えるように、少しずつ見張って区切りを作ります
	function historyWatch() {
		if (histBusy) return
		var s = snapNow()
		if (s == null) return
		if (histLast == null) {
			histLast = s
			return
		}
		if (s === histLast) return
		histPast.push(histLast)
		if (histPast.length > 40) histPast.shift()
		histFuture.length = 0
		histLast = s
		historyDomain = "project"
		autoSaveTick(s)
		updateHistButtons()
	}
	function templateHistoryClone(v) {
		return v == null ? null : JSON.parse(JSON.stringify(v))
	}
	function templateHistoryPush(id, before, after) {
		tplHistPast.push({ id: id, before: templateHistoryClone(before), after: templateHistoryClone(after) })
		if (tplHistPast.length > 40) tplHistPast.shift()
		tplHistFuture.length = 0
		historyDomain = "template"
		updateHistButtons()
	}
	function templateSettingsHistoryPush(key, before, after) {
		tplHistPast.push({ kind: "settings", key: key, before: templateHistoryClone(before), after: templateHistoryClone(after) })
		if (tplHistPast.length > 40) tplHistPast.shift()
		tplHistFuture.length = 0
		historyDomain = "template"
		updateHistButtons()
	}
	async function templateHistoryApply(entry, undoDirection) {
		if (entry.kind === "settings") {
		if (entry.key === "emPresetState") {
				var emState = templateHistoryClone(undoDirection ? entry.before : entry.after) || {}
				state.settings.emPresets = Array.isArray(emState.emPresets) ? emState.emPresets : []
				state.settings.emPresetLayout = Array.isArray(emState.emPresetLayout) ? emState.emPresetLayout : []
				normalizeEmPresetSettings()
			} else if (entry.key === "cutinTemplateState") {
				var cutinState = templateHistoryClone(undoDirection ? entry.before : entry.after) || {}
				state.settings.cutinTemplates = Array.isArray(cutinState.cutinTemplates) ? cutinState.cutinTemplates : []
				state.settings.cutinTemplateLayout = Array.isArray(cutinState.cutinTemplateLayout) ? cutinState.cutinTemplateLayout : []
				normalizeCutinTemplateSettings()
			} else settingsBag()[entry.key] = templateHistoryClone(undoDirection ? entry.before : entry.after) || []
			persistAppSettings()
			render()
			historyDomain = "template"
			updateHistButtons()
			return
		}
		var db = await favDb(), value = undoDirection ? entry.before : entry.after
		var store = db.transaction("partTemplates", "readwrite").objectStore("partTemplates")
		if (value) await idbRequest(store.put(value))
		else await idbRequest(store.delete(entry.id))
		await partTemplateLoad()
		historyDomain = "template"
		updateHistButtons()
	}
	function undoTemplate() {
		if (!tplHistPast.length) return false
		var entry = tplHistPast.pop()
		tplHistFuture.push(entry)
		return templateHistoryApply(entry, true).then(function () { return true }).catch(function () { tplHistFuture.pop(); tplHistPast.push(entry); return false })
	}
	function redoTemplate() {
		if (!tplHistFuture.length) return false
		var entry = tplHistFuture.pop()
		tplHistPast.push(entry)
		return templateHistoryApply(entry, false).then(function () { return true }).catch(function () { tplHistPast.pop(); tplHistFuture.push(entry); return false })
	}
	function undo() {
		if (historyDomain === "template" && tplHistPast.length) {
			var templateUndo = undoTemplate()
			if (templateUndo && typeof templateUndo.then === "function") return templateUndo.then(function (ok) { if (ok) toast(T("undo.001")); return ok })
			if (templateUndo) return toast(T("undo.001"))
		}
		historyWatch()
		if (!histPast.length) return toast(T("undo.002"), "warn")
		histFuture.push(snapNow())
		restoreSnap(histPast.pop())
		toast(T("undo.003"))
	}
	function redo() {
		if (historyDomain === "template" && tplHistFuture.length) {
			var templateRedo = redoTemplate()
			if (templateRedo && typeof templateRedo.then === "function") return templateRedo.then(function (ok) { if (ok) toast(T("undo.004")); return ok })
			if (templateRedo) return toast(T("undo.004"))
		}
		if (!histFuture.length) return toast(T("undo.005"), "warn")
		histPast.push(snapNow())
		restoreSnap(histFuture.pop())
		toast(T("undo.006"))
	}
	function updateHistButtons() {
		var u = $("#undoBtn"),
			r = $("#redoBtn")
		if (u) u.disabled = !(histPast.length || tplHistPast.length)
		if (r) r.disabled = !(histFuture.length || tplHistFuture.length)
	}
	function resetHistory() {
		histPast.length = 0
		histFuture.length = 0
		histLast = snapNow()
		historyDomain = "project"
		updateHistButtons()
	}

	/* ---------------- 自動保存（このブラウザの中に5つ） ---------------- */
	var AKEY = scopedStorageKey("ccfolia-zip-maker-auto")
	var autoAt = 0
	function autoList() {
		try {
			var a = JSON.parse(localStorage.getItem(AKEY) || "[]")
			return Array.isArray(a) ? a : []
		} catch (e) {
			return []
		}
	}
	function autoSaveTick(s) {
		var now = Date.now()
		if (now - autoAt < 600000) return
		autoAt = now
		try {
			var arr = autoList()
			arr.unshift({ at: now, title: state.project || "", data: s })
			localStorage.setItem(AKEY, JSON.stringify(arr.slice(0, 5)))
		} catch (e) {}
	}
	function autoRestore(at) {
		var hit = autoList().filter(function (a) {
			return String(a.at) === String(at)
		})[0]
		if (!hit) return
		if (!confirm(T("autosave.001"))) return
		histPast.push(snapNow())
		restoreSnap(hit.data)
		toast(T("autosave.002"), "ok")
	}
	function timeLabel(ms) {
		var d = new Date(ms)
		function p(n) {
			return (n < 10 ? "0" : "") + n
		}
		return (
			d.getMonth() + 1 + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes())
		)
	}

	/* ---------------- ツール設定のいれもの ---------------- */
	var APP_SETTINGS_KEY = scopedStorageKey("ccfolia-zip-maker-settings-v1")
	var appSettingsLoaded = false
	function storedAppSettings() {
		try {
			var v = JSON.parse(localStorage.getItem(APP_SETTINGS_KEY) || "null")
			return v && typeof v === "object" && !Array.isArray(v) ? v : null
		} catch (e) { return null }
	}
	function persistAppSettings() {
		try { localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(state.settings || {})) } catch (e) {}
	}
	function emPresetImageName(p) {
		if (!p) return ""
		if (p.imageName) return String(p.imageName)
		var im = p.imageUrl ? imageByName(p.imageUrl) : null
		return String((im && (im.originalName || im.label || im.name)) || p.imageUrl || "")
	}
	function emPresetById(id) {
		var ps = settingsBag().emPresets || []
		for (var i = 0; i < ps.length; i++) if (ps[i] && ps[i].id === id) return ps[i]
		return null
	}
	function emPresetStateClone() {
		var s = settingsBag()
		return { emPresets: templateHistoryClone(s.emPresets || []), emPresetLayout: templateHistoryClone(s.emPresetLayout || []) }
	}
	function emPresetHistory(before, after) {
		templateSettingsHistoryPush("emPresetState", before, after)
	}
	function normalizeEmPresetSettings() {
		var s = state.settings || (state.settings = {}), changed = false, seen = {}
		if (!Array.isArray(s.emPresets)) { s.emPresets = []; changed = true }
		var ps = s.emPresets
		ps.forEach(function (p) {
			if (!p || typeof p !== "object") return
			if (!p.id || seen[p.id]) { p.id = C.newId(); changed = true }
			seen[p.id] = true
			if (p.text == null) { p.text = ""; changed = true }
		})
		var oldLayout = Array.isArray(s.emPresetLayout) ? s.emPresetLayout : null
		var layout = [], used = {}, sepSeen = {}
		if (oldLayout) oldLayout.forEach(function (entry) {
			if (!entry || typeof entry !== "object") return
			if (entry.type === "separator") {
				if (!entry.id || sepSeen[entry.id]) entry.id = C.newId()
				sepSeen[entry.id] = true
				layout.push({ type: "separator", id: entry.id, label: String(entry.label || "") })
				return
			}
			var id = entry.id, exists = ps.some(function (p) { return p && p.id === id })
			if (id && !used[id] && exists) { used[id] = true; layout.push({ type: "preset", id: id }) }
		})
		ps.forEach(function (p) { if (p && p.id && !used[p.id]) { used[p.id] = true; layout.push({ type: "preset", id: p.id }) } })
		if (!oldLayout || JSON.stringify(oldLayout) !== JSON.stringify(layout)) { s.emPresetLayout = layout; changed = true }
		if (changed && appSettingsLoaded) persistAppSettings()
		return s
	}
	function normalizeCutinTemplateSettings() {
		var s = state.settings || (state.settings = {}), changed = false, seen = {}
		if (!Array.isArray(s.cutinTemplates)) { s.cutinTemplates = []; changed = true }
		var templates = s.cutinTemplates
		templates.forEach(function (tp) {
			if (!tp || typeof tp !== "object") return
			if (!tp.id || seen[tp.id]) { tp.id = C.newId(); changed = true }
			seen[tp.id] = true
			if (tp.name == null) { tp.name = T("settings.001"); changed = true }
			if (tp.imageUrl === undefined) { tp.imageUrl = null; changed = true }
			var nextImageName = emPresetImageName(tp)
			if (tp.imageName !== nextImageName) { tp.imageName = nextImageName; changed = true }
		})
		var oldLayout = Array.isArray(s.cutinTemplateLayout) ? s.cutinTemplateLayout : null, layout = [], used = {}, sepSeen = {}
		if (oldLayout) oldLayout.forEach(function (entry) {
			if (!entry || typeof entry !== "object") return
			if (entry.type === "separator") {
				if (!entry.id || sepSeen[entry.id]) entry.id = C.newId()
				sepSeen[entry.id] = true
				layout.push({ type: "separator", id: entry.id, label: String(entry.label || "") })
				return
			}
			var id = entry.id, exists = templates.some(function (tp) { return tp && tp.id === id })
			if (id && !used[id] && exists) { used[id] = true; layout.push({ type: "template", id: id }) }
		})
		templates.forEach(function (tp) { if (tp && tp.id && !used[tp.id]) { used[tp.id] = true; layout.push({ type: "template", id: tp.id }) } })
		if (!oldLayout || JSON.stringify(oldLayout) !== JSON.stringify(layout)) { s.cutinTemplateLayout = layout; changed = true }
		if (changed && appSettingsLoaded) persistAppSettings()
		return s
	}
	function settingsBag() {
		if (!appSettingsLoaded) {
			var savedSettings = storedAppSettings()
			if (savedSettings) state.settings = Object.assign({}, state.settings || {}, savedSettings)
			appSettingsLoaded = true
		}
		var s = state.settings
		if (!Array.isArray(s.sites) || !s.sites.length)
			s.sites = exSites().map(function (x) {
				return { n: x.n, u: x.u }
			})
		if (s.guides === undefined) s.guides = true
		if (!s.guideColor) s.guideColor = "#7cc5ff"
		if (!Array.isArray(s.syms) || !s.syms.length) s.syms = SYMS.slice()
		if (!s.defaults) s.defaults = {}
		if (!s.defaults.part) s.defaults.part = 4
		if (!s.defaults.tachieH) s.defaults.tachieH = 18
		if (s.defaults.panelW == null) s.defaults.panelW = 0
		if (!s.defaults.z) s.defaults.z = {}
		if (s.defaults.z.part == null) s.defaults.z.part = 20
		if (s.defaults.z.panel == null) s.defaults.z.panel = 40
		if (s.defaults.z.tachie == null) s.defaults.z.tachie = 30
		if (s.defaults.z.effect == null) s.defaults.z.effect = 10
		if (s.tachieGap == null) s.tachieGap = 0
		normalizeEmPresetSettings()
		normalizeCutinTemplateSettings()
		if (!s.libTpl) s.libTpl = { part: [], panel: [], cutin: [] }
		if (!Array.isArray(state.storyTexts)) state.storyTexts = []
		if (!Array.isArray(s.storyTemplates)) s.storyTemplates = []
		if (!Array.isArray(s.charTemplates)) s.charTemplates = []
		if (!Array.isArray(s.kpTemplates)) s.kpTemplates = []
		if (s.noimage == null) s.noimage = false
		if (s.noimageCount == null) s.noimageCount = 1
		if (s.noimageZ == null) s.noimageZ = 45
		var dz = state.room.defaultZ
		if (dz && Number(dz.part) === 10 && Number(dz.panel) === 15 && Number(dz.tachie) === 21 && Number(dz.effect) === 40) {
			state.room.defaultZ = { part: 20, panel: 40, tachie: 30, effect: 10 }
			state.room.tachieZ = 30
		}
		return s
	}
	function allSites() {
		return settingsBag().sites
	}
	// URLの中の{検索ワード}のところにキーワードが入ります（なければ後ろにつけます）
	function exUrl(u, q) {
		var e = encodeURIComponent(q)
		if (String(u).indexOf("{検索ワード}") >= 0) return String(u).split("{検索ワード}").join(e)
		return u + e
	}

	setInterval(historyWatch, 800)
	document.addEventListener("change", function (e) {
		var tg = e.target
		if (tg && tg.id === "hLoad" && tg.files && tg.files[0]) loadProject(tg.files[0])
	})

	/* ---------------- 画像選択ボタン ---------------- */
	function imgSelect(current, attrs, emptyLabel) {
		var empty = emptyLabel || T("imgbtn.001")
		var im = current ? imageByName(current) : null
		return (
			'<button type="button" class="imgpick" ' +
			(attrs || "") +
			' data-empty="' +
			esc(empty) +
			'" data-current="' +
			esc(current || "") +
			'">' +
			(im ? '<img src="' + im.url + '" alt="">' : '<span class="ph">＋</span>') +
			'<span class="nm">' +
			esc(im ? im.label : empty) +
			"</span></button>"
		)
	}

	/* ---------------- 画像選択パネル ---------------- */
	var pickTarget = null
	var pickBack = null
	var pickRole = ""
	var pickRoleBase = ""

	function openPicker(btn) {
		pickTarget = btn
		pickRole = btn.dataset.pickRole || ""
		pickRoleBase = pickRole
		// 別モーダル上から開く場合も、画像ピッカーを最前面に積む。
		// z-indexだけに頼らず、既存のモーダルDOM順を利用する。
		var picker = $("#picker")
		if (picker && picker.parentNode === document.body) document.body.appendChild(picker)
		$("#pfilter").value = ""
		renderPickerGrid("")
		$("#picker").classList.add("show")
		setTimeout(function () {
			$("#pfilter").focus()
		}, 30)
	}
	function closePicker() {
		$("#picker").classList.remove("show")
		pickTarget = null
		pickRole = ""
		pickRoleBase = ""
	}
	function renderPickerGrid(filter) {
		var q = (filter || "").toLowerCase()
		var cur = pickTarget ? pickTarget.dataset.current : ""
		var empty = pickTarget ? pickTarget.dataset.empty : T("imgbtn.001")
		var roleName = pickRoleBase || ""
		var h =
			(roleName
				? '<div class="picker-filters"><span class="hint">' + T("picker.001") + '</span><button type="button" class="chip' +
					(pickRole === "" ? " on" : "") +
					'" data-prole="">' + T("picker.002") + '</button><button type="button" class="chip' +
					(pickRole === roleName ? " on" : "") +
					'" data-prole="' + esc(roleName) + '">' + esc(roleName) + ' ×</button></div>'
				: "") +
			'<div class="picker-actions' + (cur ? ' has-edit' : '') + '"><div class="ptile" data-pupload="1"><span class="ph">＋</span><span class="nm">' + T("picker.003") + '</span><span class="sz">' + T("picker.004") + '</span></div>' +
			'<div class="ptile sm" data-pmake="solid"><span class="ph">🎨</span><span class="nm">' + T("picker.005") + '</span></div>' +
			(cur
				? '<div class="ptile sm" data-pmake="edit"><span class="ph">✂</span><span class="nm">' + T("picker.006") + '</span></div>'
				: "") +
			'<div class="ptile sm" data-pmake="apng"><span class="ph">✨</span><span class="nm">' + T("picker.007") + '</span></div>' +
			'<div class="ptile sm" data-pmake="maker"><span class="ph">🖌</span><span class="nm">' + T("picker.008") + '</span></div>' +
			'<div class="ptile' +
			(cur ? "" : " sel") +
			'" data-name=""><span class="ph">—</span><span class="nm">' +
			esc(empty) +
			"</span></div></div>"
		var n = 0
		state.images.forEach(function (im) {
			var hay = (im.label + " " + roleLabel(im)).toLowerCase()
			if (pickRole && !hasRole(im, pickRole)) return
			if (q && hay.indexOf(q) === -1) return
			n++
			h +=
				'<div class="ptile' +
				(im.name === cur ? " sel" : "") +
				'" title="' + esc(im.label || im.originalName || im.name || "") + '" data-name="' +
				im.name +
				'"><img data-animated="' + (im.animated ? "1" : "") + '" src="' +
				im.url +
				'" alt=""><span class="nm">' +
				esc(im.label) +
				'</span><span class="sz">' +
				roleLabel(im) + " " +
				(im.w ? im.w + "×" + im.h : "") +
				"</span></div>"
		})
		if (!n && q) h += '<p class="hint">' + T("picker.009") + '</p>'
		if (!state.images.length)
			h += '<p class="hint">' + T("picker.010") + '</p>'
		$("#pgrid").innerHTML = h
	}
	function restartPickerAnimation(img) {
		if (!img || img.dataset.replaying === "1") return
		var src = img.getAttribute("src")
		var parent = img.parentNode
		if (!src || !parent) return
		var fresh = img.cloneNode(true)
		fresh.dataset.replaying = "1"
		fresh.removeAttribute("src")
		parent.replaceChild(fresh, img)
		requestAnimationFrame(function () {
			if (fresh.isConnected) {
				fresh.src = src
				delete fresh.dataset.replaying
			}
		})
	}
	document.addEventListener("pointerover", function (e) {
		var tile = e.target && e.target.closest ? e.target.closest("#pgrid .ptile[data-name]") : null
		if (!tile) return
		var from = e.relatedTarget
		if (tile && from && from.nodeType && tile.contains(from)) return
		var img = tile.querySelector('img[data-animated="1"]')
		if (!img) return
		restartPickerAnimation(img)
	})
	// ピッカーを開いたまま画像を追加して、その場で選んだ状態にする
	async function uploadInto(files) {
		var keep = pickTarget
		var names = (await addFiles(files)) || []
		pickTarget = keep
		if (!pickTarget) return
		if (names.length === 1) return choosePick(names[0])
		$("#picker").classList.add("show")
		var f = $("#pfilter")
		renderPickerGrid(f ? f.value : "")
	}
	function choosePick(name) {
		if (!pickTarget) return
		applyInput({
			id: pickTarget.id,
			dataset: pickTarget.dataset,
			value: name || "",
			checked: false,
		})
		closePicker()
		render()
	}
	function applyImagePickerResult(target, name) {
		if (!target) return false
		var maker = ui.imageMaker
		// 画像メーカーを開いたまま元の入力先へ返す場合も、通常の
		// 画像選択入力として処理する。メーカー専用分岐へ戻らないよう
		// 一時的に専用状態だけ外し、処理後に復元する。
		ui.imageMaker = null
		try {
			applyInput({ id: target.id, dataset: target.dataset, value: name || "", checked: false })
			return true
		} finally {
			ui.imageMaker = maker
		}
	}

	/* ---------------- 素材の役割を推測（自動命名補助） ---------------- */
	function guessRole(w, h) {
		if (!w || !h) return "その他"
		var a = w / h
		if (a >= 2.1) return "枠"
		if (a >= 1.15 && w >= 800) return "前景"
		if (a >= 0.85 && a <= 1.15 && w <= 512) return "駒アイコン"
		if (a <= 0.9 && h >= 700) return "立ち絵"
		if (a <= 0.9) return "パネル"
		return "その他"
	}
	// IMG_1234 / スクリーンショット / 名前なし などは「仮の名前」とみなす
	function isVagueName(s) {
		var t = String(s || "").trim()
		if (!t || t.length <= 2) return true
		if (/^\d+$/.test(t)) return true
		return /^(img|dsc|dscn|image|photo|pic|untitled|screenshot|スクリーンショット|無題|名称未設定|ダウンロード|download|螢幕擷取畫面|螢幕截圖|未命名|下載|스크린샷|제목 없음|다운로드)[-_ ()0-9.]*$/i.test(
			t,
		)
	}
	function autoRename() {
		var counters = {}
		var n = 0
		state.images.forEach(function (im) {
			if (!isVagueName(im.label)) return
			var r = rolesOf(im)[0] || "その他"
			counters[r] = (counters[r] || 0) + 1
			im.label = roleName(r) + counters[r]
			n++
		})
		render()
		toast(n ? n + T("guess.001") : T("guess.002"), n ? "ok" : "warn")
	}

	/* ---------------- 画像取り込み ---------------- */
	// 動く PNG（APNG）は先頭に acTL という印がある。見つけたら変換せずそのまま入れる
	async function isAnimated(file) {
		if (file.type === "image/gif") return true
		var looksWebp = /webp/i.test(file.type || "") || /\.webp$/i.test(file.name || "")
		if (looksWebp) {
			try {
				var webp = new Uint8Array(await file.slice(0, 262144).arrayBuffer())
				for (var wi = 0; wi + 8 < webp.length; wi++) {
					if (webp[wi] === 0x41 && webp[wi + 1] === 0x4e && webp[wi + 2] === 0x49 && webp[wi + 3] === 0x4d) return true
					if (webp[wi] === 0x56 && webp[wi + 1] === 0x50 && webp[wi + 2] === 0x38 && webp[wi + 3] === 0x58 && (webp[wi + 8] & 0x02)) return true
				}
			} catch (e) {}
			return false
		}
		var looksPng =
			/png/i.test(file.type || "") || /\.png$/i.test(file.name || "")
		if (!looksPng) return false
		try {
			var buf = new Uint8Array(await file.slice(0, 262144).arrayBuffer())
			for (var i = 8; i + 8 < buf.length; i++) {
				if (
					buf[i] === 0x61 &&
					buf[i + 1] === 0x63 &&
					buf[i + 2] === 0x54 &&
					buf[i + 3] === 0x4c
				)
					return true
				if (
					buf[i] === 0x49 &&
					buf[i + 1] === 0x44 &&
					buf[i + 2] === 0x41 &&
					buf[i + 3] === 0x54
				)
					return false
			}
		} catch (e) {}
		return false
	}
	async function shrinkToWebp(file) {
		var bmp = await createImageBitmap(file)
		var ow = bmp.width,
			oh = bmp.height
		var max = state.settings.maxEdge
		var scale = Math.min(1, max / Math.max(ow, oh))
		var w = Math.max(1, Math.round(ow * scale))
		var h = Math.max(1, Math.round(oh * scale))
		var cv = document.createElement("canvas")
		cv.width = w
		cv.height = h
		cv.getContext("2d").drawImage(bmp, 0, 0, w, h)
		bmp.close && bmp.close()
		var blob = await new Promise(function (res) {
			cv.toBlob(res, "image/webp", state.settings.quality)
		})
		return { blob: blob, w: w, h: h, ow: ow, oh: oh }
	}
	async function sizeOf(file) {
		try {
			var bmp = await createImageBitmap(file)
			var r = { w: bmp.width, h: bmp.height }
			bmp.close && bmp.close()
			return r
		} catch (e) {
			return { w: 0, h: 0 }
		}
	}

	var busyDepth = 0
	function busyStart(text, total) { busyDepth++; var el=$("#busy"), tx=$("#busyText"), sub=$("#busySub"), bar=$("#busyBar"); if(!el)return; el.classList.add("show"); if(tx)tx.textContent=text||T("import.001"); if(sub)sub.textContent=total ? "0 / "+total : T("import.002"); if(bar)bar.style.width="4%" }
	function busyProgress(done,total,text){var tx=$("#busyText"),sub=$("#busySub"),bar=$("#busyBar");if(text&&tx)tx.textContent=text;if(sub)sub.textContent=done+" / "+total;if(bar)bar.style.width=Math.max(4,Math.round(done/Math.max(1,total)*100))+"%"}
	function busyEnd(){busyDepth=Math.max(0,busyDepth-1);if(!busyDepth){var el=$("#busy");if(el)el.classList.remove("show")}}

	async function addFiles(files, options) {
		files = Array.prototype.slice.call(files || [])
		options = options || {}
		busyStart(files.length > 1 ? T("import.003") : T("import.004"), files.length)
		var added = 0,
			dup = 0,
			ng = 0,
			addedNames = []
		for (var i = 0; i < files.length; i++) {
			var file = files[i]
			busyProgress(i, files.length, T("import.005", file.name))
			if (!/^image\//.test(file.type)) {
				ng++
				continue
			}
			try {
				var blob = file,
					w = 0,
					h = 0
				// GIFとAPNGはアニメを壊さないようにそのまま入れる
				var ani = await isAnimated(file)
				if (state.settings.convert && !ani && !options.preserve) {
					var r = await shrinkToWebp(file)
					w = r.w
					h = r.h
					// 変換して逆に重くなったら元を使う
					if (r.blob && r.blob.size < file.size) blob = r.blob
				} else {
					var s = await sizeOf(file)
					w = s.w
					h = s.h
				}
				var name = await packer.add(blob, file.name)
				if (imageByName(name)) {
					dup++
					addedNames.push(name)
					continue
				}
				var base = file.name.replace(/\.[^.]+$/, "")
				state.images.push({
					id: uid(),
					label: base,
					role: ani ? "演出" : guessRole(w, h),
					roles: ani ? ["演出"] : [guessRole(w, h)],
					animated: ani,
					vague: isVagueName(base),
					name: name,
					originalName: file.name,
					before: file.size,
					after: blob.size,
					w: w,
					h: h,
					url: URL.createObjectURL(blob),
				})
				addedNames.push(name)
				added++
			} catch (e) {
				ng++
			}
		}
		// ベース背景が空なら、背景っぽい素材を自動でセット
		if (!state.room.backgroundUrl) {
			for (var k = 0; k < state.images.length; k++) {
				if (hasRole(state.images[k], "前景")) {
					state.room.backgroundUrl = state.images[k].name
					break
				}
			}
		}
		render()
		var heavy = []
		addedNames.forEach(function (nm) {
			var im = imageByName(nm)
			if (im && im.animated && im.after > 2 * 1024 * 1024)
				heavy.push(
					"・" +
						(im.label || T("import.006")) +
						"（" +
						Math.round((im.after / 1048576) * 10) / 10 +
						"MB）",
				)
		})
		if (heavy.length)
			setTimeout(function () {
				alert(
					T("import.007", heavy.length, heavy.join("\n")),
				)
			}, 60)
		var msg = added + T("import.008")
		if (dup) msg += T("import.009", dup)
		if (ng) msg += T("import.010", ng)
		toast(msg, added ? "ok" : "warn")
		busyProgress(files.length, files.length, T("import.011"))
		setTimeout(busyEnd, 180)
		return addedNames
	}

	/* ---------------- 描画：全体 ---------------- */
	function rememberCharUiState() {
		all("[data-kpfold]").forEach(function (details) {
			ui.kpFolds[details.dataset.kpfold] = details.open
		})
		all("[data-charfaces]").forEach(function (details) {
			ui.charFaceOpen[details.dataset.charfaces] = details.open
		})
	}
	function rememberSceneAdvancedUiState() {
		var details = $(".scene-advanced[data-scene-advanced]")
		if (details) ui.sceneAdvancedOpenId = details.open ? details.dataset.sceneAdvanced : null
	}
	function render() {
		rememberCharUiState()
		rememberSceneAdvancedUiState()
		normalizeGridData()
		document.documentElement.style.setProperty("--right", ui.rightWidth + "px")
		var homeMode = ui.tab === "home"
		var roomMode = ui.tab === "room" || ui.tab === "parts" || ui.tab === "panels"
		var scenesMode = ui.tab === "scenes"
		document.body.classList.toggle("home-mode", homeMode)
		document.body.classList.toggle("room-design-mode", roomMode)
		document.body.classList.toggle("scenes-mode", scenesMode)
		document.body.classList.toggle("right-open", ui.rightOpen && !roomMode)
		document.body.classList.toggle("right-pinned", ui.rightPinned && !roomMode)
		document.body.classList.toggle("bottom-open", ui.bottomOpen)
		document.body.classList.toggle("side-collapsed", ui.sideCollapsed)
		$("#rpin").classList.toggle("on", ui.rightPinned)
		$("#btoggle").textContent = (ui.bottomOpen ? "▾" : "▴") + T("render.001")
		$("#projTitle").textContent = state.project
		$("#projTitle").title = state.project || ""

		renderSide()
		renderMain()
		updateEmMatchLabels()
		positionSceneClipDock()
		if (ui.tab === "room") bindPreviewDrag()
		renderRight()
		renderBottom()
		renderModal()
		all('input[step="0.5"]:not(#apngDuration)').forEach(function(input){input.step="1"})
		enableFastTooltips()
		$("#summary").textContent =
			T("render.002", state.images.length, state.scenes.length, state.baseMarkers.length, state.characters.length)
		saveLocal()
	}
	function positionSceneClipDock() {
		var dock = $(".sceneclipdock"), detail = $(".scene-workspace>.sdetail")
		if (!dock || !detail) return
		var r = detail.getBoundingClientRect()
		dock.style.left = Math.max(10, Math.round(r.left + 12)) + "px"
		dock.style.right = Math.max(10, Math.round(window.innerWidth - r.right + 12)) + "px"
	}
	window.addEventListener("resize", positionSceneClipDock)
	function enableFastTooltips() {
		all('[title]').forEach(function(el){var s=el.getAttribute('title');if(!s)return;el.classList.add('fast-tip');el.dataset.fastTip=s;if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',s);el.removeAttribute('title')})
	}
	document.addEventListener('mouseover',function(e){var el=e.target.closest?e.target.closest('#side [data-fast-tip]'):null,tip=$('#sideHoverTip'),side=$('#side');if(!el||!tip||!side)return;var r=el.getBoundingClientRect(),sr=side.getBoundingClientRect();tip.textContent=el.dataset.fastTip;tip.classList.add('show');var tw=tip.getBoundingClientRect().width,left=Math.min(sr.right+8,Math.max(10,window.innerWidth-tw-10));tip.style.left=left+'px';tip.style.top=Math.max(20,Math.min(window.innerHeight-20,r.top+r.height/2))+'px'})
	document.addEventListener('mouseout',function(e){var el=e.target.closest?e.target.closest('#side [data-fast-tip]'):null,tip=$('#sideHoverTip');if(!el||!tip||(e.relatedTarget&&el.contains(e.relatedTarget)))return;tip.classList.remove('show')})
	document.addEventListener('mouseover',function(e){var el=e.target.closest?e.target.closest('body.scenes-mode .tip[data-tip],body.scenes-mode [data-fast-tip]'):null,tip=$('#sideHoverTip');if(!el||!tip)return;var r=el.getBoundingClientRect(),msg=el.dataset.tip||el.dataset.fastTip||'';tip.textContent=msg;tip.classList.add('show');var tw=tip.getBoundingClientRect().width,left=r.right+8;if(left+tw>window.innerWidth-10)left=Math.max(10,r.left-tw-8);tip.style.left=left+'px';tip.style.top=Math.max(20,Math.min(window.innerHeight-20,r.top+r.height/2))+'px'})
	document.addEventListener('mouseout',function(e){var el=e.target.closest?e.target.closest('body.scenes-mode .tip[data-tip],body.scenes-mode [data-fast-tip]'):null,tip=$('#sideHoverTip');if(!el||!tip||(e.relatedTarget&&el.contains(e.relatedTarget)))return;tip.classList.remove('show')})

	// 追加機能のポップアップ
	function renderModal() {
		var mv = $("#modal2")
		if (!mv) return
		var imageMakerKeepScroll = 0
		if (ui.modal === "imageMaker") {
			imageMakerScrollProbe("renderModal開始")
			imageMakerDragProbe("renderModal", { phase: "start" })
			var currentImageMakerPanel = document.querySelector(".image-maker-settings")
			imageMakerKeepScroll = currentImageMakerPanel ? currentImageMakerPanel.scrollTop : 0
		}
		cancelScheduledApngModalRender()
		cancelScheduledImageMakerRender()
		stopApngPreview()
		mv.classList.toggle("show", !!ui.modal)
		mv.classList.toggle("edit-mode", ui.modal === "edit")
		mv.classList.toggle("apng-mode", ui.modal === "apng")
		mv.classList.toggle("image-maker-mode", ui.modal === "imageMaker")
		var closeButton = $("#m2close")
		if (closeButton) closeButton.disabled = !!(ui.modal === "apng" && ui.apng && ui.apng.busy || ui.modal === "imageMaker" && ui.imageMaker && ui.imageMaker.busy)
		if (!ui.modal) {
			$("#m2body").innerHTML = ""
			return
		}
		var MTITLE = {
			bulk: T("render.003"),
			tpl: T("render.004"),
			multi: T("render.005"),
			edit: T("render.006"),
			apng: T("render.007"),
			imageMaker: T("picker.008"),
			solid: T("picker.005"),
			src: T("render.008"),
			info: T("render.009"),
			sren: T("render.010"),
			sname: T("render.011"),
			tpldetail: T("render.012"),
			imgren: T("render.013"),
			broken: T("render.014"),
			story: T("render.015"),
			parttpl: T("render.016"),
		}
		$("#m2title").textContent = MTITLE[ui.modal] || T("render.017")
		$("#m2body").innerHTML =
			ui.modal === "info"
				? imgInfoBlock()
				: ui.modal === "bulk"
					? bulkBlock()
				: ui.modal === "multi"
					? multiPickBlock()
					: ui.modal === "edit"
						? imgEditBlock()
						: ui.modal === "apng"
							? apngBlock()
						: ui.modal === "imageMaker"
							? imageMakerBlock()
						: ui.modal === "solid"
							? solidBlock()
							: ui.modal === "src"
								? srcEditBlock()
								: ui.modal === "sren"
									? renameBlock()
									: ui.modal === "sname"
										? sceneNameBlock()
										: ui.modal === "tpldetail"
											? tplDetailBlock()
											: ui.modal === "imgren"
												? imgRenameBlock()
												: ui.modal === "broken"
													? brokenBlock()
												: ui.modal === "story"
												? storyBlock()
											: ui.modal === "parttpl"
												? partTemplateBlock()
										: sceneTplBlock()
		if (ui.modal === "edit") { applyEditPreview(); initCropEditor(); initEditGradientEditor() }
		if (ui.modal === "sren") initSceneRenameGutter()
		if (ui.modal === "apng") startApngPreview()
		if (ui.modal === "imageMaker") {
			initImageMakerView()
			var nextImageMakerPanel = document.querySelector(".image-maker-settings")
			if (nextImageMakerPanel && imageMakerKeepScroll > 0) nextImageMakerPanel.scrollTop = imageMakerKeepScroll
			imageMakerScrollProbe("renderModal結束")
			imageMakerScrollProbe("同步還原後")
			imageMakerDragProbe("renderModal", { phase: "end" })
		}
	}

	/* 切語言時要跟著變，所以不在載入時就算好 */
	function menuGroups() {
		return [
			{ label: T("render.018"), items: [
				{ tab: "room", ic: "🎨", name: T("render.019") },
				{ tab: "images", ic: "🖼", name: T("render.020") },
			] },
			{ label: T("render.021"), items: [
				{ tab: "scenes", ic: "🎬", name: T("render.022") },
				{ tab: "tachie", ic: "🧍", name: T("render.023") },
				{ tab: "cutins", ic: "🔔", name: T("settings.001") },
				{ tab: "story", ic: "📖", name: T("render.024") },
			] },
			{ label: T("render.025"), items: [{ tab: "chars", ic: "🎭", name: T("render.025") }] },
			{ label: T("render.026"), items: [{ tab: "save", ic: "💾", name: T("render.027") }] },
		]
	}
	function countOf(t) {
		if (t === "images") return state.images.length
		if (t === "parts") return partsList("part").length
		if (t === "panels") return partsList("panel").length
		if (t === "tachie") return state.tachie.length
		if (t === "scenes") return state.scenes.length
		if (t === "cutins") return state.effects.length
		if (t === "chars") return state.characters.length
		return 0
	}
	function renderSide() {
		var tip=$('#sideHoverTip');if(tip)tip.classList.remove('show')
		var h = '<button class="side-toggle" id="sideToggle" title="'+(ui.sideCollapsed?T("render.028"):T("render.029"))+'" aria-label="'+(ui.sideCollapsed?T("render.028"):T("render.029"))+'">'+(ui.sideCollapsed?'»':'«')+'</button><button class="nav home-nav' + (ui.tab === "home" ? " active" : "") + '" data-tab="home" title="' + T("render.030") + '"><span class="ic">⌂</span><span class="navtext">' + T("render.030") + '</span></button>'
		menuGroups().forEach(function (g) {
			h += '<div class="navgroup"><div class="navlabel">' + g.label + '</div>'
			g.items.forEach(function (m) {
				var c = countOf(m.tab)
				h += '<button class="nav' + (ui.tab === m.tab ? " active" : "") + '" data-tab="' + m.tab + '" title="'+m.name+'"><span class="ic">' + m.ic + '</span><span class="navtext">' + m.name + '</span>' + (c ? '<span class="badge">' + c + '</span>' : '') + '</button>'
			})
			h += '</div>'
		})
		h += '<div class="navspace"></div>' +
			'<div class="navgroup tools"><div class="navlabel">' + T("role.other") + '</div>' +
			'<button class="nav' + (ui.tab === "settings" ? " active" : "") + '" data-tab="settings" title="' + T("render.031") + '"><span class="ic">⚙️</span><span class="navtext">' + T("render.031") + '</span></button></div>' +
			'<div class="navnote">' + T("render.032") + '</div>'
		$("#side").innerHTML = h
	}

	function renderMain() {
		if (ui.tab === "parts" || ui.tab === "panels") ui.tab = "room"
		var html = ""
		if (ui.tab === "home") html = viewHome()
		if (ui.tab === "images") html = viewImages()
		if (ui.tab === "room") html = viewRoom()
		if (ui.tab === "parts") html = viewParts()
		if (ui.tab === "panels") html = viewPanels()
		if (ui.tab === "tachie") html = viewTachie()
		if (ui.tab === "scenes") html = viewScenes()
		if (ui.tab === "story") html = viewStory()
		if (ui.tab === "cutins") html = viewCutins()
		if (ui.tab === "chars") html = viewChars()
		if (ui.tab === "save") html = viewSave()
		if (ui.tab === "settings") html = viewSettings()
		if(ui.tab!=="room")html=pageHeading(ui.tab)+html
		$("#main").innerHTML = '<div class="wrap">' + html + "</div>"
	}
	function pageHeading(tab) {
		var titles={home:["HOME",T("render.030")],images:["MATERIALS",T("render.020")],scenes:["SCENES",T("render.022")],tachie:["STANDING CHARACTERS",T("render.023")],cutins:["CUT-INS",T("settings.001")],story:["SCENARIO TEXT",T("render.024")],chars:["CHARACTERS",T("render.025")],save:["SAVE & EXPORT",T("render.027")],settings:["SETTINGS",T("render.031")]},v=titles[tab];return v?'<div class="page-head"><span class="eyebrow">'+v[0]+'</span><h1>'+v[1]+'</h1></div>':''
	}

	/* ---------------- 各画面 ---------------- */
	function homeStep(n, icon, title, text, tab, stateText, active) {
		return '<button class="home-step' + (active ? ' next' : '') + '" data-goto="' + tab + '">' +
			'<span class="home-num">' + n + '</span><span class="home-step-icon">' + icon + '</span>' +
			'<span class="home-step-copy"><b>' + title + '</b><small>' + text + '</small></span>' +
			'<span class="home-state">' + stateText + '</span><span class="home-arrow">›</span></button>'
	}
	function homePlan() {
		var broken = brokenImageUses().length
		var roomTouched = !isUntouchedProjectName(state.project)
		var next = broken ? "broken" : !roomTouched ? "room" : !state.images.length ? "images" : !state.baseMarkers.length ? "parts" : !state.scenes.length ? "scenes" : "save"
		return { broken: broken, next: next, roomTouched: roomTouched }
	}
	function editProjectName() {
		var v = window.prompt(T("screen.001"), state.project || defaultProjectName())
		if (v == null) return
		v = String(v).trim()
		if (!v) return toast(T("screen.002"), "warn")
		state.project = v
		render()
		toast(T("screen.003"), "ok")
	}

	function viewHome() {
		var p = homePlan()
		var nextMap = {
			broken: [T("home.001"), T("home.002", p.broken), T("home.003")],
			room: [T("home.004"), T("home.005"), T("home.006")],
			images: [T("home.007"), T("home.008"), T("home.009")],
			parts: [T("home.010"), T("home.011"), T("home.006")],
			scenes: [T("home.012"), T("home.013"), T("home.014")],
			save: [T("home.015"), T("home.016"), T("home.017")],
		}
		var nx = nextMap[p.next]
		var nextTab = p.next === "broken" ? "home" : (p.next === "parts" ? "room" : p.next)
		var continueTab = ui.lastWorkTab && ui.lastWorkTab !== "home" ? ui.lastWorkTab : (state.scenes.length ? "scenes" : "room")
		var ready = state.scenes.length > 0 && !p.broken
		return '<section class="home-hero"><div><span class="eyebrow">' + T("home.018") + '</span><button class="home-project-name" id="homeProjectName" title="' + T("home.019") + '">' + esc(state.project) + '<span>✎</span></button><p>' + T("home.020") + '</p></div>' +
			'<div class="home-hero-actions"><button class="btn" data-goto="' + continueTab + '">' + T("home.021") + '</button><button class="btn pri" id="homeLoad">' + T("home.022") + '</button>' +
			'<button class="btn" id="homeSample">' + T("sample.load") + '</button></div></section>' +
			(p.broken ? '<div class="home-alert"><b>' + T("home.023") + '</b><span>' + T("home.024") + ' ' + p.broken + T("home.025") + '</span><button class="btn kill" id="homeBroken">' + T("home.026") + '</button></div>' : '') +
			'<section class="home-next"><div class="home-next-mark">NEXT</div><div><h2>' + nx[0] + '</h2><p>' + nx[1] + '</p></div><button class="btn pri" ' + (p.next === "broken" ? 'id="homeBroken"' : 'data-goto="' + nextTab + '"') + '>' + nx[2] + '</button></section>' +
			'<div class="home-grid"><section><div class="home-section-head"><div><h2>' + T("home.027") + '</h2><p>' + T("home.028") + '</p></div></div><div class="home-steps">' +
			homeStep(1,"🎨",T("render.019"),T("home.029"),"room",state.room.fieldWidth + T("home.030", state.room.fieldHeight),p.next === "room") +
			homeStep(2,"🖼",T("home.031"),T("home.032"),"images",state.images.length ? state.images.length + T("home.033") : T("home.034"),p.next === "images") +
			homeStep(3,"🧩",T("home.035"),T("home.036"),"room",state.baseMarkers.length ? state.baseMarkers.length + T("home.025") : T("home.037"),p.next === "parts") +
			homeStep(4,"🎬",T("render.021"),T("home.038"),"scenes",state.scenes.length ? state.scenes.length + T("render.022") : T("home.034"),p.next === "scenes") +
			homeStep(5,"🎭",T("home.039"),T("home.040"),"chars",state.characters.length ? state.characters.length + T("home.041") : T("home.037"),false) +
			homeStep(6,"✓",T("home.042"),T("home.043"),"save",ready ? T("home.044") : T("home.045"),p.next === "save") +
			'</div></section><aside class="home-overview"><h2>' + T("home.046") + '</h2><dl><div><dt>' + T("render.020") + '</dt><dd>' + state.images.length + T("home.033") + '</dd></div><div><dt>' + T("render.022") + '</dt><dd>' + state.scenes.length + '</dd></div><div><dt>' + T("render.019") + '</dt><dd>' + partsList("part").length + '</dd></div><div><dt>' + T("home.047") + '</dt><dd>' + partsList("panel").length + '</dd></div><div><dt>' + roleName("立ち絵") + '</dt><dd>' + state.tachie.length + '</dd></div><div><dt>' + T("render.025") + '</dt><dd>' + state.characters.length + T("home.041") + '</dd></div></dl><div class="home-quick"><h3>' + T("home.048") + '</h3><button class="btn" data-goto="scenes">' + T("home.049") + '</button><button class="btn" data-goto="images">' + T("home.050") + '</button><button class="btn" data-goto="room">' + T("home.051") + '</button></div><p class="home-note">' + T("home.052") + '</p></aside></div>'
	}

	// 役割は複数つけられます（前景とパネルの両方など）
	function roleChips(im) {
		return (
			'<span class="rchips">' +
			ROLES.map(function (r) {
				return (
					'<label class="chip' +
					(hasRole(im, r) ? " on" : "") +
					'"><input type="checkbox" data-imgrole="' +
					im.id +
					'" data-role="' +
					r +
					'"' +
					(hasRole(im, r) ? " checked" : "") +
					"> " +
					roleName(r) +
					"</label>"
				)
			}).join("") +
			"</span>"
		)
	}

	function favDb(){return new Promise(function(ok,no){var q=indexedDB.open("ccfolia-zip-maker",3);q.onupgradeneeded=function(){if(!q.result.objectStoreNames.contains("favorites"))q.result.createObjectStore("favorites",{keyPath:"id"});if(!q.result.objectStoreNames.contains("partTemplates"))q.result.createObjectStore("partTemplates",{keyPath:"id"});if(!q.result.objectStoreNames.contains("templateMedia"))q.result.createObjectStore("templateMedia",{keyPath:"id"})};q.onsuccess=function(){ok(q.result)};q.onerror=function(){no(q.error)}})}
	async function favLoad(){try{var db=await favDb(),tx=db.transaction("favorites","readonly"),rq=tx.objectStore("favorites").getAll();rq.onsuccess=function(){ui.favs=(rq.result||[]).map(function(x){x.url=URL.createObjectURL(x.blob);return x});ui.favLoaded=true;renderMain()}}catch(e){ui.favLoaded=true}}
	async function favAdd(id){var im=state.images.filter(function(x){return x.id===id})[0];if(!im)return;var blob=await fetch(im.url).then(function(x){return x.blob()}),x={id:im.name,label:im.label,roles:(im.roles||[im.role]),blob:blob,type:blob.type,w:im.w,h:im.h};var db=await favDb();db.transaction("favorites","readwrite").objectStore("favorites").put(x);toast(T("home.053"),"ok");favLoad()}
	async function favUse(id){var x=(ui.favs||[]).filter(function(v){return v.id===id})[0];if(!x)return;var out=await addFiles([new File([x.blob],x.label+"."+(x.type.indexOf("png")>=0?"png":"webp"),{type:x.type})]);if(out&&out[0]){var im=imageByName(out[0]);if(im){im.label=x.label;im.roles=x.roles;im.role=x.roles[0]}}render();toast(T("home.054"),"ok")}
	async function favDel(id){var db=await favDb();db.transaction("favorites","readwrite").objectStore("favorites").delete(id);favLoad()}
	function idbRequest(req){return new Promise(function(ok,no){req.onsuccess=function(){ok(req.result)};req.onerror=function(){no(req.error)}})}
	async function partTemplateBlob(rec,db){if(rec&&rec.imageBlob)return rec.imageBlob;if(!rec||!rec.imageResource)return null;var row=await idbRequest(db.transaction("templateMedia","readonly").objectStore("templateMedia").get(rec.imageResource));return row&&row.blob}
	async function partTemplateLoad(){try{var db=await favDb(),rows=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").getAll());(ui.partTemplates||[]).forEach(function(x){if(x.previewUrl)URL.revokeObjectURL(x.previewUrl);Object.keys(x._mediaUrls||{}).forEach(function(k){URL.revokeObjectURL(x._mediaUrls[k])})});ui.partTemplates=await Promise.all((rows||[]).map(async function(x){var blob=await partTemplateBlob(x,db);if(!x.imageResource&&blob){var pk=new C.Packer();x.imageResource=await pk.add(blob,(x.image||{}).originalName||"template-image")}x._blob=blob;x.previewUrl=blob?URL.createObjectURL(blob):"";x._mediaUrls={};for(var i=0;i<(x.media||[]).length;i++){var ref=x.media[i],row=await idbRequest(db.transaction("templateMedia","readonly").objectStore("templateMedia").get(ref.resource));if(row&&row.blob)x._mediaUrls[ref.resource]=URL.createObjectURL(row.blob)}return x}));ui.partTemplatesLoaded=true;if(ui.modal==="parttpl")renderModal();else if(ui.tab==="settings"||ui.tab==="images"||ui.tab==="chars")renderMain()}catch(e){ui.partTemplates=[];ui.partTemplatesLoaded=true;toast(T("home.055"),"warn")}}
	async function partTemplateSave(id){var b=partById(id),im=b&&b.imageUrl?imageByName(b.imageUrl):null,blob=b&&b.imageUrl?packer.blobOf(b.imageUrl):null;if(!b||!im||!blob)return toast(T("home.056"),"warn");var db=await favDb(),rows=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").getAll()),role=partsRole(b),name=String(b.name||T("home.057")).trim(),same=(rows||[]).filter(function(x){return x.part&&x.part.role===role&&String(x.part.name||"").trim()===name}),recId=C.newId(),before=same.length?templateHistoryClone(same[0]):null;if(same.length){if(confirm(T("home.058", name))){recId=same[0].id}else{var renamed=prompt(T("home.059"),name+T("home.060"));if(renamed==null||!String(renamed).trim())return null;name=String(renamed).trim();if((rows||[]).some(function(x){return x.part&&x.part.role===role&&String(x.part.name||"").trim()===name})){toast(T("home.061", name),"warn");return null}}}var part={role:role,name:name,x:snapHalf(b.x),y:snapHalf(b.y),width:Math.max(1,snapHalf(b.width)),height:Math.max(1,snapHalf(b.height)),z:Number(b.z)||0,lockAspect:b.lockAspect!==false,lockMove:!!b.lockMove,visible:b.visible!==false,text:b.text||"",scope:b.scope||"room"},meta={label:im.label||im.originalName||im.name,originalName:im.originalName||im.label||"template-image",type:blob.type,w:im.w||0,h:im.h||0,before:im.before||blob.size,after:blob.size},rec={id:recId,createdAt:same.length&&recId===same[0].id?same[0].createdAt:Date.now(),updatedAt:Date.now(),part:part,imageResource:im.name,image:meta},tx=db.transaction(["partTemplates","templateMedia"],"readwrite");await Promise.all([idbRequest(tx.objectStore("templateMedia").put({id:im.name,blob:blob,image:meta})),idbRequest(tx.objectStore("partTemplates").put(rec))]);templateHistoryPush(rec.id,before,rec);toast(same.length&&recId===same[0].id?T("home.062"):T("home.063"),"ok");await partTemplateLoad();return rec.id}
	async function partTemplateImageUse(id,resource){var db=await favDb(),rec=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").get(id));if(!rec)return null;resource=resource||rec.imageResource;var ref=(rec.media||[]).find(function(x){return x.resource===resource}),row=resource?await idbRequest(db.transaction("templateMedia","readonly").objectStore("templateMedia").get(resource)):null,blob=row&&row.blob||await partTemplateBlob(rec,db),im=ref&&ref.image||rec.image||row&&row.image||{};if(!blob)return null;var name=await packer.add(blob,im.originalName||"template-image");if(!imageByName(name))state.images.push({id:uid(),label:im.label||T("home.064"),role:"その他",roles:["その他"],animated:/gif|apng/i.test(blob.type||""),vague:false,name:name,originalName:im.originalName,before:im.before||blob.size,after:blob.size,w:im.w||0,h:im.h||0,url:URL.createObjectURL(blob)});return name}
	async function partTemplateUse(id){var db=await favDb(),rec=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").get(id));if(!rec)return;historyWatch();var name=await partTemplateImageUse(id);if(!name)return;var p=JSON.parse(JSON.stringify(rec.part));p.id=C.newId();p.imageUrl=name;delete p.passThrough;state.baseMarkers.unshift(p);historyDomain="project";ui.modal=null;ui.roomSel=[p.id];render();saveLocal();toast(T("home.065"),"ok")}
	async function partTemplateDelete(id){var db=await favDb(),old=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").get(id));if(!old)return;await idbRequest(db.transaction("partTemplates","readwrite").objectStore("partTemplates").delete(id));templateHistoryPush(id,old,null);await partTemplateLoad();toast(T("home.066"),"ok")}
	async function partTemplateRename(id,name){var db=await favDb(),rec=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").get(id));if(!rec)return;var before=templateHistoryClone(rec);if(rec.part)rec.part.name=name;else if(rec.character)rec.name=name;rec.updatedAt=Date.now();await idbRequest(db.transaction("partTemplates","readwrite").objectStore("partTemplates").put(rec));var row=(ui.partTemplates||[]).find(function(x){return x.id===id});if(row){if(row.part)row.part.name=name;else if(row.character)row.name=name}templateHistoryPush(id,before,rec)}
	function partTemplateBlock(){if(!ui.partTemplatesLoaded){ui.partTemplatesLoaded="loading";partTemplateLoad()}var rows=(ui.partTemplates||[]).filter(function(x){return !!x.part}),h='<p class="hint">' + T("home.067") + '</p>';if(!rows.length)return h+'<p class="hint">' + T("home.068") + '</p>';h+='<div class="part-template-grid">';rows.forEach(function(x){h+='<article class="part-template-item">'+(x.previewUrl?'<img src="'+x.previewUrl+'" alt="">':'<span class="ph">' + T("home.069") + '</span>')+'<div><b>'+esc(x.part.name)+'</b><small>'+(x.part.role==="panel"?T("home.070"):T("home.071"))+'</small><small>'+x.part.width+' × '+x.part.height+'</small></div><button class="btn pri" data-parttpluse="'+x.id+'">' + T("home.072") + '</button></article>'});return h+'</div>'}
	function templateImageMeta(im,blob){return {label:im.label||im.originalName||im.name,originalName:im.originalName||im.label||"template-image",type:blob.type,w:im.w||0,h:im.h||0,before:im.before||blob.size,after:blob.size}}
	async function saveEffectPresetImage(name){
		if(!name)return
		var im=imageByName(name),blob=packer.blobOf(name)
		if(!im||!blob)return
		try{
			var db=await favDb(),meta=templateImageMeta(im,blob);meta.animated=!!im.animated
			await idbRequest(db.transaction("templateMedia","readwrite").objectStore("templateMedia").put({id:name,blob:blob,image:meta}))
		}catch(e){}
	}
	async function saveEffectPresetImages(){
		var ps=settingsBag().emPresets||[]
		for(var i=0;i<ps.length;i++)await saveEffectPresetImage(ps[i].imageUrl)
	}
	async function restoreEffectPresetImage(preset){
		if(!preset||!preset.imageUrl)return null
		var existing=imageByName(preset.imageUrl)
		if(existing)return existing.name
		try{
			var db=await favDb(),row=await idbRequest(db.transaction("templateMedia","readonly").objectStore("templateMedia").get(preset.imageUrl))
			if(!row||!row.blob)return null
			var meta=row.image||{},name=await packer.add(row.blob,meta.originalName||"effect-image")
			if(!imageByName(name))state.images.push({id:uid(),label:meta.label||roleName("演出"),role:"演出",roles:["演出"],animated:!!meta.animated,vague:false,name:name,originalName:meta.originalName||"effect-image",before:meta.before||row.blob.size,after:row.blob.size,w:meta.w||0,h:meta.h||0,url:URL.createObjectURL(row.blob)})
			if(preset.imageUrl!==name){preset.imageUrl=name;persistAppSettings()}
			return name
		}catch(e){return null}
	}
	function effectPresetImage(preset){return restoreEffectPresetImage(preset)}
	function addSceneEffectFromPreset(scene,preset,defaultFit){
		return effectPresetImage(preset).then(function(imageName){
			var marker={id:C.newId(),kind:preset&&preset.kind!=="full"?"other":"full",name:preset?preset.name:T("home.073"),imageUrl:imageName||null,text:preset&&preset.text!=null?String(preset.text):"",x:0,y:0,width:preset&&preset.width||6,height:preset&&preset.height||6,z:preset&&preset.z!=null?preset.z:roomZ().effect,fullFit:preset&&preset.fullFit||(defaultFit||"cover"),lockAspect:true}
			if(marker.kind==="full")applyEmMode(marker)
			if(!scene.extraMarkers)scene.extraMarkers=[]
			scene.extraMarkers.push(marker);ui.sceneId=scene.id;render();toast(T("home.074"),"ok")
			return marker
		})
	}
	async function characterTemplateSave(id){var c=state.characters.find(function(x){return x.id===id});if(!c)return null;if(c.isKp){toast(T("home.075"),"warn");return null}var db=await favDb(),rows=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").getAll()),name=String(c.name||T("home.076")).trim()||T("home.076"),same=(rows||[]).filter(function(x){return x.character&&String(x.name||"").trim()===name}),recId=C.newId();if(same.length){if(confirm(T("home.077", name))){recId=same[0].id}else{var renamed=prompt(T("home.059"),name+T("home.060"));if(renamed==null||!String(renamed).trim())return null;name=String(renamed).trim();if((rows||[]).some(function(x){return x.character&&String(x.name||"").trim()===name})){toast(T("home.078", name),"warn");return null}}}var data=JSON.parse(JSON.stringify(c));delete data.id;["x","y","z","width","height","active","selected"].forEach(function(k){delete data[k]});var refs=[];if(data.iconUrl)refs.push({kind:"icon",resource:data.iconUrl});(data.faces||[]).forEach(function(f,i){if(f.imageUrl)refs.push({kind:"face",index:i,resource:f.imageUrl})});var media=[],puts={};for(var i=0;i<refs.length;i++){var ref=refs[i],im=imageByName(ref.resource),blob=packer.blobOf(ref.resource);if(!im||!blob){if(ref.kind==="icon")data.iconUrl=null;else if(data.faces&&data.faces[ref.index])data.faces[ref.index].imageUrl=null;continue}var meta=templateImageMeta(im,blob);media.push({kind:ref.kind,index:ref.index,resource:im.name,image:meta});puts[im.name]={id:im.name,blob:blob,image:meta}}var main=media.find(function(x){return x.kind==="icon"})||media[0],rec={id:recId,createdAt:same.length&&recId===same[0].id?same[0].createdAt:Date.now(),updatedAt:Date.now(),category:"character",name:name,character:data,media:media,imageResource:main&&main.resource||null,image:main&&main.image||null},tx=db.transaction(["partTemplates","templateMedia"],"readwrite"),jobs=[idbRequest(tx.objectStore("partTemplates").put(rec))];Object.keys(puts).forEach(function(k){jobs.push(idbRequest(tx.objectStore("templateMedia").put(puts[k])))});await Promise.all(jobs);toast(same.length&&recId===same[0].id?T("home.079"):T("home.080"),"ok");await partTemplateLoad();return rec.id}
	async function characterTemplateMediaUse(rec,db){var data=JSON.parse(JSON.stringify(rec.character||{})),media=rec.media||[];if(data.iconUrl)data.iconUrl=null;(data.faces||[]).forEach(function(f){if(f.imageUrl)f.imageUrl=null});for(var i=0;i<media.length;i++){var ref=media[i],row=await idbRequest(db.transaction("templateMedia","readonly").objectStore("templateMedia").get(ref.resource)),blob=row&&row.blob,im=ref.image||row&&row.image||{};if(!blob)continue;var name=await packer.add(blob,im.originalName||"template-image");if(!imageByName(name))state.images.push({id:uid(),label:im.label||T("home.064"),role:"その他",roles:["その他"],animated:/gif|apng/i.test(blob.type||""),vague:false,name:name,originalName:im.originalName,before:im.before||blob.size,after:blob.size,w:im.w||0,h:im.h||0,url:URL.createObjectURL(blob)});if(ref.kind==="icon")data.iconUrl=name;else if(ref.kind==="face"&&data.faces&&data.faces[ref.index])data.faces[ref.index].imageUrl=name}return data}
	async function characterTemplateUse(id){var db=await favDb(),rec=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").get(id));if(!rec||!rec.character)return null;historyWatch();var c=await characterTemplateMediaUse(rec,db);c.id=uid();state.characters.push(c);historyDomain="project";render();saveLocal();toast(T("home.081"),"ok");return c.id}
	async function characterTemplateSaveTracked(id){var db=await favDb(),c=state.characters.find(function(x){return x.id===id}),rows=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").getAll()),before=null;if(c)before=(rows||[]).filter(function(x){return x.character&&String(x.name||"").trim()===String(c.name||"").trim()})[0]||null;var out=await characterTemplateSave(id);if(out){var after=await idbRequest(db.transaction("partTemplates","readonly").objectStore("partTemplates").get(out));templateHistoryPush(out,before,after)}return out}
	function characterTemplateBlock(){
		if(!ui.partTemplatesLoaded){ui.partTemplatesLoaded="loading";partTemplateLoad()}
		var rows=(ui.partTemplates||[]).filter(function(x){return !!x.character}),legacy=settingsBag().charTemplates||[],h='<div class="char-template-save"><b class="grow">' + T("home.076") + '</b><span class="hint">' + T("home.082") + '</span></div>'
		if(!rows.length&&!legacy.length)return h+'<p class="hint">' + T("home.083") + '</p>'
		rows.forEach(function(x){
			var c=x.character||{},kind=c.isKp?T("home.084"):c.kind==='enemy'?T("home.085"):c.kind==='ally'?T("home.086"):T("home.087"),summary=[kind,c.hp==null?null:"HP "+c.hp,c.mp==null?null:"MP "+c.mp,c.armor==null?null:T("home.088", c.armor),c.noDodge?T("home.089"):c.dodge==null?null:T("home.090", c.dodge),T("home.091", ((c.skills||[]).length)),T("home.092", ((c.faces||[]).length))].filter(Boolean).join("・")
			h+='<div class="char-template-row" data-chartpl-row="'+x.id+'">'+(x.previewUrl?'<img class="char-template-thumb" src="'+x.previewUrl+'" alt="'+esc(x.name||T("home.076"))+'">':'<span class="char-template-thumb ph">' + T("home.069") + '</span>')+'<div class="char-template-meta"><b>'+esc(x.name||T("home.076"))+'</b><small>'+esc(summary)+'</small></div><div class="char-template-actions"><button class="btn sm" data-chartpldetail="'+x.id+'">' + T("home.093") + '</button><button class="btn sm" data-chartpluse="'+x.id+'">' + T("home.072") + '</button><button class="x" data-chartpldel="'+x.id+'">' + T("home.094") + '</button></div></div>'
		})
		legacy.forEach(function(tp){h+='<div class="row"><b class="grow">'+esc(tp.name||T("home.076"))+' <span class="hint">' + T("home.095") + '</span></b><button class="btn sm" data-chartplapply="'+tp.id+'">' + T("home.072") + '</button><button class="x" data-chartpldel="'+tp.id+'">' + T("home.094") + '</button></div>'})
		return h
	}
	function partTemplateMediaBlock(){if(!ui.partTemplatesLoaded){ui.partTemplatesLoaded="loading";partTemplateLoad()}var map={};(ui.partTemplates||[]).forEach(function(x){var role=x.character?"character":x.part&&x.part.role||"part",refs=x.character?(x.media||[]):x.imageResource?[{resource:x.imageResource,image:x.image}]:[],seen={};refs.forEach(function(ref){var k=ref.resource;if(!k||seen[k])return;seen[k]=true;if(!map[k])map[k]={id:x.id,resource:k,url:(x._mediaUrls||{})[k]||x.previewUrl||"",label:(ref.image||x.image||{}).label||(x.character?x.name:x.part.name),count:0,roles:[]};map[k].count++;if(map[k].roles.indexOf(role)<0)map[k].roles.push(role)})});var all=Object.keys(map).map(function(k){return map[k]}),available=[];all.forEach(function(x){x.roles.forEach(function(r){if(available.indexOf(r)<0)available.push(r)})});var filter=ui.tplMediaFilter||"all";if(filter!=="all"&&available.indexOf(filter)<0)filter=ui.tplMediaFilter="all";var rows=all.filter(function(x){return filter==="all"||x.roles.indexOf(filter)>=0}),names={part:T("home.096"),panel:T("home.070"),character:T("render.025"),scene:T("render.022"),cutin:T("settings.001")};if(!all.length)return '';var h='<div class="card template-media-card"><h2>' + T("home.097") + '<span class="sub">' + T("home.098") + '</span></h2><div class="row template-media-filters"><button class="chip'+(filter==="all"?' on':'')+'" data-tplmediafilter="all">' + T("home.099") + '</button>';available.forEach(function(r){h+='<button class="chip'+(filter===r?' on':'')+'" data-tplmediafilter="'+r+'">'+names[r]+'</button>'});h+='</div><div class="favgrid">';rows.forEach(function(x){h+='<div class="favitem">'+(x.url?'<img src="'+x.url+'">':'')+'<b>'+esc(x.label)+'</b><small>' + T("home.100")+x.count+T("home.101") + '</small><small>'+x.roles.map(function(r){return names[r]}).join(' / ')+'</small><button class="btn sm" data-parttplimage="'+x.id+'" data-tplresource="'+x.resource+'">' + T("home.102") + '</button></div>'});return h+'</div></div>'}
	function partTemplateUseCount(name){var n=0;(ui.partTemplates||[]).forEach(function(x){if(x.imageResource===name)n++;else if((x.media||[]).some(function(ref){return ref.resource===name}))n++});return n}
	function favPoolBlock(){var fs=ui.favs||[];if(!ui.favLoaded){ui.favLoaded="loading";favLoad()}var h='<div class="card"><h2>' + T("home.103") + '<span class="sub">' + T("home.104") + '</span></h2>';if(!fs.length)return h+'<p class="hint">' + T("home.105") + '</p></div>';h+='<div class="favgrid">';fs.forEach(function(x){h+='<div class="favitem"><img src="'+x.url+'"><b>'+esc(x.label)+'</b><button class="btn sm" data-favuse="'+x.id+'">' + T("home.106") + '</button><button class="x" data-favdel="'+x.id+'">' + T("home.107") + '</button></div>'});return h+'</div></div>'}

	function viewImages() {
		var before = 0,
			after = 0,
			vague = 0
		state.images.forEach(function (im) {
			before += im.before
			after += im.after
			if (isVagueName(im.label)) vague++
		})
		var h =
			'<div class="card"><h2>' + T("images.001") + '<span class="sub">' + T("images.002") + '</span></h2>' +
			'<p class="hint">' + T("images.003") + '</p>' +
			'<div id="drop" class="drop">' + T("images.004") + '<br><span class="hint">' + T("images.005") + '</span><br><label class="btn">' + T("images.006") + '<input type="file" id="pick" accept="image/*" multiple hidden></label></div>' +
			'<div class="row image-material-options"><label>' + T("images.007") + ' <input type="number" id="maxEdge" value="' +
			state.settings.maxEdge +
			'" min="200" max="4000" step="100"> px</label>' +
			'<label><input type="checkbox" id="convert"' +
			(state.settings.convert ? " checked" : "") +
			'> ' + T("images.008") + '</label></div><div class="image-create-tools"><span class="sub">' + T("images.009") + '</span><div class="row"><button class="btn" id="openSolid">' + T("images.010") + '</button><button class="btn" data-apngopen="material">' + T("images.011") + '</button><button class="btn" data-imakeropen="material">' + T("images.012") + '</button></div></div>'
		if (state.images.length) {
			h +=
				'<p class="good">' + T("images.013") + ' ' +
				kb(before) +
				" → <b>" +
				kb(after) +
				"</b>" +
				(before > 0 ? T("images.014", Math.round((1 - after / before) * 100)) : "") +
				"</p>"
		}
		h += "</div>"
		h += exSearchCard()
		h += brokenBanner()
		if (!state.images.length) return h + favPoolBlock() + partTemplateMediaBlock()

		h += '<div class="card"><h2>' + T("images.015") + '<span class="sub">' + T("images.016") + '</span></h2>'
		h += imgToolbar()
		h += '<div class="grid" id="imggrid">' + imgTiles() + "</div>"
		h += "</div>"
		h += favPoolBlock()
		h += partTemplateMediaBlock()
		h += '<div class="dockspace"></div>'
		return h + imgDockBar()
	}

	/* ---------------- 素材一覧のしぼりこみ・まとめ操作 ---------------- */
	function imgSelIds() {
		if (!Array.isArray(ui.imgSel)) ui.imgSel = []
		return ui.imgSel
	}
	function selImages() {
		var ids = imgSelIds()
		return state.images.filter(function (im) {
			return ids.indexOf(im.id) >= 0
		})
	}
	function imgFiltered() {
		var q = String(ui.imgQ || "").toLowerCase()
		var rs = Array.isArray(ui.imgRoles) ? ui.imgRoles : []
		return state.images.filter(function (im) {
			if (q && String(im.label || "").toLowerCase().indexOf(q) === -1) return false
			if (rs.length) {
				var okr = false
				rs.forEach(function (r) {
					if (hasRole(im, r)) okr = true
				})
				if (!okr) return false
			}
			return true
		})
	}
	function imgTiles() {
		var list = imgFiltered()
		var ids = imgSelIds()
		var h = ""
		list.forEach(function (im) {
			var on = ids.indexOf(im.id) >= 0
			var tplCount = partTemplateUseCount(im.name)
			h +=
				'<div class="thumb' +
				(on ? " sel" : "") +
				'" data-imgsel="' +
				im.id +
				'" title="' + T("matlist.001") + '"><span class="mk">' +
				(on ? "✓" : "") +
				'</span><img src="' +
				im.url +
				'" alt="">' +
				'<input class="lbl" data-imglabel="' +
				im.id +
				'" value="' +
				esc(im.label) +
				'">' +
				'<div class="meta">' +
				roleChips(im) +
				(im.animated ? ' <span class="tag warn">' + T("matlist.002") + '</span>' : "") +
				(tplCount ? ' <span class="tag">' + T("home.100")+tplCount+T("home.025") + '</span>' : "") +
				'</div><button class="x favstar" data-favadd="' + im.id + '" title="' + T("matlist.003") + '">☆</button><button class="x" data-imginfo="' +
				im.id +
				'">' + T("home.093") + '</button><button class="x" data-editimg="' +
				im.id +
				'">' + T("matlist.004") + '</button><button class="x" data-delimg="' +
				im.id +
				'">' + T("home.094") + '</button></div>'
		})
		if (!list.length)
			h += '<p class="hint">' + T("matlist.005") + '</p>'
		return h
	}
	function imgToolbar() {
		var n = selImages().length
		var rs = Array.isArray(ui.imgRoles) ? ui.imgRoles : []
		var h =
			'<div class="row"><input id="imgq2" class="w2" placeholder="' + T("matlist.006") + '" value="' +
			esc(ui.imgQ || "") +
			'">' +
			ROLES.map(function (r) {
				return (
					'<button class="chip' +
					(rs.indexOf(r) >= 0 ? " on" : "") +
					'" data-imgrolef="' +
					r +
					'">' +
					roleName(r) +
					"</button>"
				)
			}).join("") +
			(rs.length
				? '<button class="chip" data-imgrolef="*">' + T("matlist.007") + '</button>'
				: "") +
			"</div>"
		h +=
			'<div class="row"><button class="btn" id="imgSelAll">' + T("matlist.008") + '</button>' +
			'<button class="btn" id="imgRenameMode">' + T("matlist.009") + '</button>' +
			'<button class="btn" id="imgSelNone">' + T("matlist.010") + '</button>' +
			'<span class="tag" id="imgSelCount">' +
			n +
			" " + T("matlist.011") + "</span></div>"
		return (
			h +
			(n
				? '<p class="hint">' + T("matlist.012") + '<b>' + T("matlist.013") + '</b>' + T("matlist.014") + '</p>'
				: '<p class="hint">' + T("matlist.015") + '<b>' + T("matlist.016") + '</b>' + T("matlist.017") + '</p>')
		)
	}
	// えらんでいるときだけ、画面の下からにゅっと出てくる操作パネル
	function imgDockBar() {
		var n = selImages().length
		if (!n) return ""
		if (ui.dockMin)
			return (
				'<div class="dockbar mini" id="imgdock"><div class="dhead"><b>' +
				n +
				' ' + T("matlist.018") + '</b><button class="btn" id="imgDockOpen">' + T("matlist.019") + '</button>' +
				'<span class="gap"></span>' +
				'<button class="btn kill" id="imgSelNone2">' + T("matlist.020") + '</button></div></div>'
			)
		var h =
			'<div class="dockbar" id="imgdock"><div class="dhead"><b>' +
			n +
			' ' + T("matlist.018") + '</b><button class="btn" id="imgDockMin">' + T("matlist.021") + '</button>' +
			'<span class="gap"></span>' +
			'<button class="btn kill" id="imgSelNone2">' + T("matlist.020") + '</button></div>'
		if (!ui.ren) ui.ren = { pre: "", start: 1, digits: 2 }
		if (!ui.rep) ui.rep = { from: "", to: "" }
		var rn = ui.ren
		var rp = ui.rep
		h +=
			'<div class="selbar">' +
			'<div class="row"><b>' + T("matlist.022") + '</b>' +
			ROLES.map(function (r) {
				return (
					'<button class="chip" data-imgtag="' +
					r +
					'" data-tagon="1">＋' +
					roleName(r) +
					"</button>"
				)
			}).join("") +
			"</div>" +
			'<div class="row"><b>' + T("matlist.023") + '</b>' +
			ROLES.map(function (r) {
				return (
					'<button class="chip" data-imgtag="' +
					r +
					'" data-tagon="0">−' +
					roleName(r) +
					"</button>"
				)
			}).join("") +
			"</div>" +
			'<div class="row"><b>' + T("matlist.024") + '</b>' +
			'<label>' + T("matlist.025") + ' <input id="renPre" class="w1" value="' +
			esc(rn.pre || "") +
			'" placeholder="' + T("matlist.026") + '"></label>' +
			'<label>' + T("matlist.027") + ' <input type="number" id="renStart" style="width:74px" value="' +
			(rn.start != null ? rn.start : 1) +
			'" min="0"></label>' +
			'<label>' + T("matlist.028") + ' <input type="number" id="renDigits" style="width:64px" value="' +
			(rn.digits || 2) +
			'" min="1" max="4"></label>' +
			'<button class="btn" id="imgRen">' + T("matlist.029") + '</button>' +
			'<span class="hint">' + T("matlist.030") + '</span></div>' +
			'<div class="row"><b>' + T("matlist.031") + '</b>' +
			'<label>' + T("matlist.032") + ' <input id="repFrom" class="w1" value="' +
			esc(rp.from || "") +
			'"></label>' +
			'<label>' + T("matlist.033") + ' <input id="repTo" class="w1" value="' +
			esc(rp.to || "") +
			'"></label>' +
			'<button class="btn" id="imgRep">' + T("matlist.034") + '</button></div>' +
			'<div class="row"><b>' + T("matlist.035") + '</b>' +
			'<button class="btn" data-imgmake="tachie">' + T("matlist.036") + '</button>' +
			'<button class="btn" data-imgmake="part">' + T("matlist.037") + '</button>' +
			'<button class="btn" data-imgmake="panel">' + T("matlist.038") + '</button>' +
			'<button class="btn" data-imgmake="scene">' + T("matlist.039") + '</button>' +
			'<button class="btn" data-imgmake="cutin">' + T("matlist.040") + '</button></div>' +
			'<div class="row"><button class="btn" id="imgDel">' + T("matlist.041") + '</button>' +
			'<span class="hint">' + T("matlist.042") + '</span></div>' +
			"</div></div>"
		return h
	}
	// 入力欄のフォーカスを保つため、タイルと件数だけ描き直す
	function imgGridRefresh() {
		var g = $("#imggrid")
		if (g) g.innerHTML = imgTiles()
		var c = $("#imgSelCount")
		if (c) c.textContent = selImages().length + T("matlist.043")
		imgDockRefresh()
	}
	// 下の操作パネルだけを差し替える
	function imgDockRefresh() {
		var html = imgDockBar()
		var dk = $("#imgdock")
		if (dk) {
			if (html) dk.outerHTML = html
			else if (dk.parentNode) dk.parentNode.removeChild(dk)
			return
		}
		var host = $("#main")
		if (host && html) host.insertAdjacentHTML("beforeend", html)
	}
	// 選択の見た目と下のパネルだけを更新（スクロール位置を保つ）
	function imgSelRefresh() {
		var g = $("#imggrid")
		if (g) g.innerHTML = imgTiles()
		var c = $("#imgSelCount")
		if (c) c.textContent = selImages().length + T("matlist.043")
		imgDockRefresh()
		saveLocal()
	}
	function tagSel(r, on) {
		var ims = selImages()
		if (!ims.length) return toast(T("matlist.044"), "warn")
		ims.forEach(function (im) {
			toggleRole(im, r, on)
		})
		render()
		toast(
			ims.length + T("matlist.045", (on ? T("matlist.046") : T("matlist.047"))),
			"ok",
		)
	}
	// その素材がどこで使われているか
	function imgUsage(im) {
		var nm = im.name
		var used = []
		if (state.room.backgroundUrl === nm) used.push(T("matlist.048"))
		if (state.room.foregroundUrl === nm) used.push(T("matlist.049"))
		state.baseMarkers.forEach(function (b) {
			if (b.imageUrl === nm)
				used.push(
					(partsRole(b) === "panel" ? T("matlist.050") : T("matlist.051")) +
						(b.name || "") +
						"」",
				)
		})
		state.tachie.forEach(function (tc) {
			if (tc.imageUrl === nm) used.push(T("matlist.052", (tc.name || "")))
		})
		state.effects.forEach(function (ef) {
			if (ef.imageUrl === nm) used.push(T("matlist.053", (ef.name || "")))
		})
		state.characters.forEach(function (c) {
			if (c.iconUrl === nm) used.push(T("matlist.054", (c.name || "")))
		})
		state.scenes.forEach(function (sc) {
			var sn = T("matlist.055", (sc.name || ""))
			if (sc.foregroundUrl === nm) used.push(sn + T("matlist.056"))
			if (sceneBackgroundMode(sc) === "image" && sc.backgroundUrl === nm) used.push(sn + T("matlist.057"))
			;(sc.extraMarkers || []).forEach(function (em) {
				if (em.imageUrl === nm) used.push(sn + T("matlist.058"))
				if (em.kind === "tachie" && em.refId) {
					var rtc = tachieById(em.refId)
					if (rtc && rtc.imageUrl === nm)
						used.push(sn + T("matlist.059", (rtc.name || "")))
				}
			})
			var ov = sc.overrides || {}
			Object.keys(ov).forEach(function (k) {
				if (ov[k] && ov[k].imageUrl === nm) used.push(sn + T("matlist.060"))
			})
		})
		return used
	}
	function delSel() {
		var ims = selImages()
		if (!ims.length) return toast(T("matlist.044"), "warn")
		var u = 0
		ims.forEach(function (im) {
			if (imgUsage(im).length) u++
		})
		var msg = ims.length + T("matlist.061")
		if (u)
			msg +=
				T("matlist.062", u)
		if (!window.confirm(msg + T("matlist.063"))) return
		var ids = imgSelIds().slice()
		state.images = state.images.filter(function (im) {
			return ids.indexOf(im.id) === -1
		})
		ui.imgSel = []
		render()
		toast(ims.length + T("matlist.064"), "ok")
	}
	function imgRenameList() {
		var ids = imgSelIds()
		return ids.length ? imgFiltered().filter(function (im) { return ids.indexOf(im.id) >= 0 }) : imgFiltered()
	}
	function imgRenameBlock() {
		var list = imgRenameList()
		if (!list.length) return '<p class="hint">' + T("matlist.065") + '</p>'
		ui.imgRenIds = list.map(function (im) { return im.id })
		var h = '<p class="hint">' + T("matlist.066") + '</p><div class="renwrap"><textarea id="imgrenText" rows="' + Math.min(20, Math.max(6, list.length)) + '">' + esc(list.map(function (im) { return im.label || "" }).join("\n")) + '</textarea><div class="renlist">'
		list.forEach(function (im, i) { h += '<div class="r"><span class="no">' + (i + 1) + '</span><img src="' + im.url + '" alt=""><span class="nm">' + esc(im.label || T("matlist.067")) + '</span></div>' })
		return h + '</div></div><div class="row"><button class="btn pri" id="imgrenGo">' + T("matlist.068") + '</button></div>'
	}
	function applyImgRename() {
		var ta = $("#imgrenText"), lines = ta ? ta.value.split("\n") : [], ids = ui.imgRenIds || [], n = 0
		ids.forEach(function (id, i) { var im = state.images.filter(function (x) { return x.id === id })[0], v = (lines[i] || "").trim(); if (im && v && v !== im.label) { im.label = v; n++ } })
		ui.modal = null; render(); toast(n + T("matlist.069"), "ok")
	}

	function seqRename() {
		var ims = selImages()
		if (!ims.length) return toast(T("matlist.044"), "warn")
		var rn = ui.ren || { pre: "", start: 1, digits: 2 }
		var pre = String(rn.pre || "").trim()
		var num = Number(rn.start)
		if (!isFinite(num)) num = 1
		var dg = Math.max(1, Math.min(4, Number(rn.digits) || 2))
		var ids = imgSelIds()
		imgFiltered().forEach(function (im) {
			if (ids.indexOf(im.id) === -1) return
			var v = String(num)
			while (v.length < dg) v = "0" + v
			im.label = pre + v
			num++
		})
		render()
		toast(ims.length + T("matlist.070"), "ok")
	}
	function findReplace() {
		var ims = selImages()
		if (!ims.length) return toast(T("matlist.044"), "warn")
		var rp = ui.rep || { from: "", to: "" }
		var from = String(rp.from || "")
		if (!from) return toast(T("matlist.071"), "warn")
		var n = 0
		ims.forEach(function (im) {
			var b = String(im.label || "")
			var a = b.split(from).join(String(rp.to || ""))
			if (a !== b) {
				im.label = a
				n++
			}
		})
		render()
		toast(
			n ? n + T("matlist.072") : T("matlist.073"),
			n ? "ok" : "warn",
		)
	}
	function makeFromSel(kind) {
		var ids = imgSelIds()
		var order = imgFiltered().filter(function (im) {
			return ids.indexOf(im.id) >= 0
		})
		if (!order.length) return toast(T("matlist.044"), "warn")
		var rev = order.slice().reverse() // 上に積むものは逆順に入れて並びをそろえる
		if (kind === "tachie")
			rev.forEach(function (im) {
				addTachieLib({ name: im.label, imageUrl: im.name })
			})
		else if (kind === "part" || kind === "panel")
			rev.forEach(function (im) {
				addPart({ role: kind, name: im.label, imageUrl: im.name })
			})
		else if (kind === "cutin")
			rev.forEach(function (im) {
				state.effects.unshift({
					id: C.newId(),
					name: im.label,
					imageUrl: im.name,
				})
			})
		else
			order.forEach(function (im) {
				state.scenes.push(newScene(im.label, im.name))
			})
		ui.tab =
			kind === "tachie"
				? "tachie"
				: kind === "part"
					? "parts"
					: kind === "panel"
						? "panels"
						: kind === "cutin"
							? "cutins"
							: "scenes"
		if (ui.tab === "scenes" && state.scenes.length)
			ui.sceneId = state.scenes[state.scenes.length - 1].id
		render()
		toast(
			order.length +
				T("matlist.074", (kind === "tachie"
					? roleName("立ち絵")
					: kind === "part"
						? T("render.019")
						: kind === "panel"
							? T("home.070")
							: kind === "cutin"
								? T("settings.001")
								: T("render.022"))),
			"ok",
		)
	}
	function imgUsageLinks(im) {
		var nm = im.name, out = []
		function add(label, tab, sceneId) { out.push({ label: label, tab: tab, sceneId: sceneId || "" }) }
		if (state.room.backgroundUrl === nm) add(T("matlist.075"), "room")
		if (state.room.foregroundUrl === nm) add(T("matlist.076"), "room")
		state.baseMarkers.forEach(function (b) { if (b.imageUrl === nm) add((partsRole(b) === "panel" ? T("matlist.077") : T("matlist.078")) + (b.name || ""), partsRole(b) === "panel" ? "panels" : "parts") })
		state.tachie.forEach(function (tc) { if (tc.imageUrl === nm) add(T("matlist.079", (tc.name || "")), "tachie") })
		state.effects.forEach(function (ef) { if (ef.imageUrl === nm) add(T("matlist.080", (ef.name || "")), "cutins") })
		state.characters.forEach(function (c) { if (c.iconUrl === nm) add(T("matlist.081", (c.name || "")), "chars") })
		state.scenes.forEach(function (sc) {
			var sn = T("matlist.082", (sc.name || ""))
			if (sc.foregroundUrl === nm || (sceneBackgroundMode(sc) === "image" && sc.backgroundUrl === nm)) add(sn, "scenes", sc.id)
			;(sc.extraMarkers || []).forEach(function (em) {
				var tc = em.kind === "tachie" && em.refId ? tachieById(em.refId) : null
				if (em.imageUrl === nm || (tc && tc.imageUrl === nm)) add(sn, "scenes", sc.id)
			})
		})
		return out
	}

	function imgInfoBlock() {
		var im = state.images.filter(function (x) { return x.id === ui.infoImg })[0]
		if (!im) return '<p class="hint">' + T("matlist.083") + '</p>'
		var use = imgUsageLinks(im)
		return (
			'<div class="imginfo">' +
			'<div class="imginfo-pv"><img src="' + im.url + '" alt=""></div>' +
			'<div class="imginfo-data"><h3>' + esc(im.label) + '</h3>' +
			'<dl><dt>' + T("matlist.084") + '</dt><dd>' + (im.w ? im.w + "×" + im.h + "px" : T("matlist.085")) + '</dd>' +
			'<dt>' + T("matlist.086") + '</dt><dd>' + kb(im.before) + " → " + kb(im.after) + '</dd>' +
			'<dt>' + T("matlist.087") + '</dt><dd>' + esc(rolesOf(im).join("・") || T("matlist.088")) + '</dd>' +
			(im.animated ? '<dt>' + T("matlist.089") + '</dt><dd><span class="tag warn">' + T("matlist.002") + '</span><br><span class="hint">' + T("matlist.090") + '</span></dd>' : "") +
			'<dt>' + T("matlist.091") + '</dt><dd class="mono">' + esc(im.name) + '</dd></dl>' +
			'<div class="imguses"><b>' + T("matlist.092") + '</b>' +
			(use.length ? '<div class="imguse-links">' + use.map(function (x) { return '<button class="btn" data-imggoto="' + x.tab + '" data-imgscene="' + esc(x.sceneId) + '">' + esc(x.label) + '</button>' }).join('') + '</div>' : '<p class="hint">' + T("matlist.093") + '</p>') +
			'</div></div></div>' + imgUseButtons()
		)
	}

	// 詳細ポップアップから、その1枚をすぐ使う
	function imgUseButtons() {
		var sc = currentScene()
		return (
			'<div class="row"><b>' + T("matlist.094") + '</b>' +
			(sc
				? '<button class="btn" data-imguse="fg">' + T("matlist.095") +
					esc(sc.name || "") +
					T("matlist.096") + '</button>'
				: "") +
			'<button class="btn" data-imguse="basefg">' + T("matlist.097") + '</button>' +
			'<button class="btn" data-imguse="tachie">' + T("matlist.036") + '</button>' +
			'<button class="btn" data-imguse="part">' + T("matlist.037") + '</button>' +
			'<button class="btn" data-imguse="panel">' + T("matlist.038") + '</button>' +
			'<button class="btn" data-imguse="cutin">' + T("matlist.040") + '</button></div>'
		)
	}

	/* ---------------- 素材から一括作成（複数選択） ---------------- */
	function mpLabel() {
		var k = ui.pickFor || "scenes"
		return k === "tachie"
			? T("multi.001")
			: k === "cutins"
				? T("multi.002")
				: k === "part"
					? T("multi.003")
					: k === "panel"
						? T("multi.004")
						: T("home.014")
	}
	/* 値としても表示名としても使われていたので、資料用と顯示用に分けた */
	function mpRole() {
		return (ui.pickFor || "scenes") === "tachie" ? "立ち絵" : "前景"
	}
	function mpRoleName() {
		return roleName(mpRole())
	}
	function pickCandidates() {
		var k = ui.pickFor || "scenes"
		if (ui.pickAll || k === "cutins" || k === "part" || k === "panel")
			return state.images.slice()
		return state.images.filter(function (im) {
			return hasRole(im, mpRole())
		})
	}
	function mpTiles() {
		var q = String(ui.pickQ || "").toLowerCase()
		var h = "",
			n = 0
		pickCandidates().forEach(function (im) {
			if (q && String(im.label || "").toLowerCase().indexOf(q) === -1) return
			n++
			var at = (ui.pickSel || []).indexOf(im.name)
			h +=
				'<div class="ptile' +
				(at >= 0 ? " sel" : "") +
				'" data-mp="' +
				im.name +
				'"><img src="' +
				im.url +
				'" alt=""><span class="nm">' +
				esc(im.label) +
				'</span><span class="sz">' +
				(at >= 0 ? T("multi.005", (at + 1)) : roleLabel(im)) +
				"</span></div>"
		})
		if (!n)
			h +=
				'<p class="hint">' + T("multi.006") + '</p>'
		return h
	}
	function multiPickBlock() {
		return (
			'<p class="hint">' + T("multi.007") + '<b>' + T("multi.008") + '</b>' + T("multi.009") + '</p>' +
			'<div class="row"><input id="mpq" class="w2" placeholder="' + T("matlist.006") + '" value="' +
			esc(ui.pickQ || "") +
			'">' +
			'<button class="btn" id="mpAll">' + T("multi.010") + '</button>' +
			'<button class="btn" id="mpNone">' + T("multi.011") + '</button>' +
			'<label><input type="checkbox" id="mpEvery"' +
			(ui.pickAll ? " checked" : "") +
			'> 「' +
			mpRoleName() +
			T("multi.012") + '</label></div>' +
			'<div id="mpgrid">' +
			mpTiles() +
			"</div>" +
			'<div class="row"><button class="btn pri" id="mpGo">' + T("multi.013") + ' ' +
			(ui.pickSel || []).length +
			" " + T("multi.014") +
			mpLabel() +
			"</button></div>"
		)
	}
	// 入力欄のフォーカスを保つため、タイルと件数だけ描き直す
	function mpRefresh() {
		var g = $("#mpgrid")
		if (g) g.innerHTML = mpTiles()
		var b = $("#mpGo")
		if (b)
			b.textContent = T("multi.015", (ui.pickSel || []).length, mpLabel())
	}
	function openMultiPick(kind) {
		if (!state.images.length) return toast(T("multi.016"), "warn")
		ui.pickFor = kind
		ui.pickSel = []
		ui.pickQ = ""
		ui.pickAll = false
		if (!pickCandidates().length) ui.pickAll = true
		ui.modal = "multi"
		render()
	}
	function runMultiPick() {
		var names = (ui.pickSel || []).slice()
		if (!names.length) return toast(T("multi.017"), "warn")
		var k = ui.pickFor || "scenes"
		var order = k === "scenes" ? names : names.slice().reverse()
		order.forEach(function (nm) {
			var im = imageByName(nm)
			if (!im) return
			if (k === "tachie") addTachieLib({ name: im.label, imageUrl: im.name })
			else if (k === "cutins")
				state.effects.unshift({ id: C.newId(), name: im.label, imageUrl: im.name })
			else if (k === "part" || k === "panel")
				addPart({ role: k, name: im.label, imageUrl: im.name })
			else state.scenes.push(newScene(im.label, im.name))
		})
		ui.modal = null
		ui.pickSel = []
		ui.tab =
			k === "tachie"
				? "tachie"
				: k === "cutins"
					? "cutins"
					: k === "part"
						? "parts"
						: k === "panel"
							? "panels"
							: "scenes"
		if (k === "scenes" && state.scenes.length)
			ui.sceneId = state.scenes[state.scenes.length - 1].id
		render()
		toast(names.length + T("multi.018"), "ok")
	}

	/* ---------------- 素材をさがす（外部サイト） ---------------- */
	/* 切語言時要跟著變，所以不在載入時就算好 */
	function exSites() {
		return [
			{ n: T("find.001"), u: "https://www.google.com/search?tbm=isch&q={検索ワード}" },
			{ n: T("find.002"), u: "https://www.irasutoya.com/search?q={検索ワード}" },
			{ n: T("find.003"), u: "https://www.photo-ac.com/main/search?q={検索ワード}" },
			{ n: T("find.004"), u: "https://www.pakutaso.com/search.html?search={検索ワード}" },
			{ n: "Pixabay", u: "https://pixabay.com/ja/images/search/{検索ワード}" },
			{ n: "Unsplash", u: "https://unsplash.com/s/photos/{検索ワード}" },
			{ n: "BOOTH", u: "https://booth.pm/ja/search/{検索ワード}" },
			{ n: T("find.005"), u: "https://commons.nicovideo.jp/search?keyword={検索ワード}" },
			{ n: T("find.006"), u: "https://booth.pm/ja/search/ココフォリア%20{検索ワード}" },
		]
	}
	function exSearchCard() {
		return (
			'<div class="card"><h2>' + T("find.007") + '<span class="sub">' + T("find.008") + '</span></h2>' +
			'<div class="row"><input id="imgq" class="w3" placeholder="' + T("find.009") + '"></div>' +
			'<div class="exlinks">' +
			allSites().map(function (x) {
				return (
					'<button class="btn" data-ex="' + esc(x.u) + '">' + esc(x.n) + "</button>"
				)
			}).join("") +
			"</div>" +
			'<p class="hint">' + T("find.010") + '</p></div>'
		)
	}

	/* ---------------- 1色の画像を作る ---------------- */
	var SOLIDS = ["#000000", "#ffffff", "#8b0000", "#0b1a2a", "#14321c", "#2a1b3a"]
	function solidBlock() {
		if (!ui.solid) ui.solid = { color: "#000000", w: 8, name: "" }
		var so = ui.solid
		return (
			'<p class="hint">' + T("solid.001") + '</p>' +
			'<div class="row"><label>' + T("solid.002") + ' <input type="color" id="solidColor" value="' +
			esc(so.color) +
			'"></label>' +
			'<label>' + T("solid.003") + ' <input class="w2" id="solidName" value="' +
			esc(so.name || "") +
			'" placeholder="' + T("solid.004") + '"></label>' +
			'<label>' + T("matlist.084") + ' <select id="solidSize">' +
			[8, 16, 64, 256]
				.map(function (v) {
					return (
						'<option value="' +
						v +
						'"' +
						(Number(so.w) === v ? " selected" : "") +
						">" +
						v +
						"×" +
						v +
						"px</option>"
					)
				})
				.join("") +
			"</select></label></div>" +
			'<div class="row"><span class="hint">' + T("solid.005") + '</span>' +
			SOLIDS.map(function (c) {
				return (
					'<button class="swatch" data-solidc="' +
					c +
					'" title="' +
					c +
					'" style="background:' +
					c +
					'"></button>'
				)
			}).join("") +
			"</div>" +
			'<div class="row"><button class="btn pri" id="solidGo">' + T("solid.006") + '</button></div>' +
			'<p class="hint">' + T("solid.007") + '</p>'
		)
	}
	async function makeSolid() {
		var so = ui.solid || { color: "#000000", w: 8, name: "" }
		var side = Number(so.w) || 8
		var cv = document.createElement("canvas")
		cv.width = side
		cv.height = side
		var cx = cv.getContext("2d")
		cx.fillStyle = so.color || "#000000"
		cx.fillRect(0, 0, side, side)
		var blob = await new Promise(function (res) {
			cv.toBlob(res, "image/png")
		})
		if (!blob) return toast(T("solid.008"), "warn")
		var nm = String(so.name || "").trim() || T("solid.009", so.color)
		var added = await addFiles([
			new File([blob], nm + ".png", { type: "image/png" }),
		])
		if (added && added.length) {
			var im = imageByName(added[0])
			if (im) {
				im.label = nm
				im.roles = ["前景"]
				im.role = "前景"
				im.vague = false
			}
		}
		ui.modal = null
		var pbS = pickBack
		pickBack = null
		if (pbS && added && added.length) {
			applyInput({
				id: pbS.id,
				dataset: pbS.dataset,
				value: added[0],
				checked: false,
			})
		} else {
			ui.tab = "images"
		}
		render()
		toast(T("solid.010", nm), "ok")
	}

	/* ---------------- APNGの演出画像を作る ---------------- */
	var apngPreviewFrame = 0
	var apngPreviewToken = 0
	var apngModalRenderFrame = 0
	var apngModalRenderToken = 0
	function cancelScheduledApngModalRender() {
		if (!apngModalRenderFrame) return
		cancelAnimationFrame(apngModalRenderFrame)
		apngModalRenderFrame = 0
		apngModalRenderToken++
	}
	// 入力・changeイベント中にm2bodyを置き換えると、フォーカス解除と再描画が競合するため次フレームへ送る
	function scheduleApngModalRender(model) {
		var token = ++apngModalRenderToken
		if (apngModalRenderFrame) cancelAnimationFrame(apngModalRenderFrame)
		apngModalRenderFrame = requestAnimationFrame(function () {
			apngModalRenderFrame = 0
			if (token !== apngModalRenderToken || ui.modal !== "apng" || ui.apng !== model) return
			renderModal()
		})
	}
	function apngStaticImage(name) {
		var im = name ? imageByName(name) : null
		return im && !im.animated ? im : null
	}
	function apngSourceImage(model) {
		return model && model.sourceTemp ? model.sourceTemp : apngStaticImage(model && model.sourceName)
	}
	function releaseApngSource(model) {
		if (model && model.sourceTemp && model.sourceTemp.url) URL.revokeObjectURL(model.sourceTemp.url)
		if (model) model.sourceTemp = null
	}
	function apngContextLabel(context) {
		if (!context || context.kind === "material") return T("apng.001")
		if (context.kind === "scene") return T("apng.002")
		if (context.kind === "preset") return T("apng.003")
		if (context.kind === "picker") return T("apng.004")
		return T("apng.001")
	}
	function apngNormalizeUi(model, changed) {
		if (!model) return null
		if (!model.sourceTemp && !apngStaticImage(model.sourceName)) model.sourceName = ""
		var hasImage = !!apngSourceImage(model)
		if (!APNG || !APNG.validPair(model.start, model.end) || (!hasImage && APNG.needsImage(model.start, model.end))) {
			model.start = hasImage ? "transparent" : "transparent"
			model.end = hasImage ? "image" : "color"
		}
		if (changed === "start" && model.start === model.end) model.end = model.start === "transparent" ? (hasImage ? "image" : "color") : "transparent"
		if (changed === "end" && model.start === model.end) model.start = model.end === "transparent" ? (hasImage ? "image" : "color") : "transparent"
		if (!hasImage && (model.start === "image" || model.end === "image")) {
			if (model.start === "image") model.start = model.end === "transparent" ? "color" : "transparent"
			if (model.end === "image") model.end = model.start === "transparent" ? "color" : "transparent"
		}
		return model
	}
	function apngSetEndpoint(model, changed, value) {
		if (!model) return null
		var oldStart = model.start, oldEnd = model.end, hasImage = !!apngSourceImage(model)
		if (changed === "start") {
			if (hasImage && value === oldEnd && value !== oldStart) {
				model.start = value
				model.end = oldStart
			} else model.start = value
		} else if (changed === "end") {
			if (hasImage && value === oldStart && value !== oldEnd) {
				model.end = value
				model.start = oldEnd
			} else model.end = value
		}
		return apngNormalizeUi(model, changed)
	}
	function openApngMaker(context, sourceName, sourceTemp) {
		if (ui.apng) releaseApngSource(ui.apng)
		var requested = sourceName ? imageByName(sourceName) : null
		var source = requested && !requested.animated ? requested : null
		stopApngPreview()
		ui.apng = {
			context: context || { kind: "material" },
			sourceName: source ? source.name : "",
			sourceTemp: sourceTemp || null,
			sourceRejected: !!(requested && requested.animated),
			start: source || sourceTemp ? "image" : "transparent",
			end: source || sourceTemp ? "transparent" : "color",
			color: "#000000",
			duration: APNG.DEFAULTS.duration,
			loop: false,
			busy: false,
			resultSize: 0,
			resultName: "",
			resultMessage: "",
			error: "",
		}
		ui.modal = "apng"
		render()
	}
	function apngEndpointOptions(value, other, hasImage) {
		var labels = { transparent: T("apng.005"), image: T("apng.006"), color: T("solid.002") }
		return APNG.ENDPOINTS.map(function (endpoint) {
			var disabled = endpoint === "image" && !hasImage
			return '<option value="' + endpoint + '"' + (value === endpoint ? " selected" : "") + (disabled ? " disabled" : "") + ">" + labels[endpoint] + "</option>"
		}).join("")
	}
	function apngBlock() {
		var model = apngNormalizeUi(ui.apng)
		if (!model || !APNG) return '<p class="hint">' + T("apng.007") + '</p>'
		var source = apngSourceImage(model), usesColor = model.start === "color" || model.end === "color", duration = APNG.normalizeDuration(model.duration), frameCount = APNG.frameCountFor({ duration: duration, fps: APNG.DEFAULTS.fps })
		var durationLabel = (duration / 1000).toFixed(1), sourceOptions = '<option value="">' + T("apng.008") + '</option>' + (model.sourceTemp ? '<option value="__apng_temp__" selected>' + T("apng.009") + '</option>' : '') + state.images.filter(function (im) { return !im.animated }).map(function (im) {
			return '<option value="' + esc(im.name) + '"' + (source && source.name === im.name ? " selected" : "") + ">" + esc(im.label || im.originalName || T("apng.006")) + "</option>"
		}).join("")
		var result = ""
		if (model.resultSize) {
			result = '<div class="apng-result good"><b>' + T("apng.010") + '</b><span>' + T("apng.011") + ' ' + kb(model.resultSize) + "</span>" +
				(model.resultName ? '<small>' + esc(model.resultName) + "</small>" : "") +
				(model.resultSize > 1024 * 1024 ? '<p class="hint">' + T("apng.012") + '</p>' : "") +
				(model.resultMessage ? '<p class="hint">' + esc(model.resultMessage) + "</p>" : "") + "</div>"
		}
		if (model.error) result += '<p class="bad" role="alert">' + esc(model.error) + "</p>"
		return '<div class="apng-maker"><div class="apng-preview-pane"><div class="apng-preview-stage"><canvas id="apngPreview"></canvas>' +
			(source ? '<img id="apngSourceImage" src="' + esc(source.url) + '" alt="" hidden>' : "") +
			'</div><p class="hint">' + T("apng.013") + '</p></div>' +
			'<div class="apng-settings"><p class="hint">' + T("apng.014") + '<b>' + esc(apngContextLabel(model.context)) + "</b></p>" +
			'<label class="apng-source-field">' + T("apng.015") + '<select id="apngSource">' + sourceOptions + "</select></label>" +
			(model.sourceRejected ? '<p class="hint warn">' + T("apng.016") + '</p>' : "") +
			'<div class="apng-endpoints"><label>' + T("apng.017") + '<select id="apngStart">' + apngEndpointOptions(model.start, model.end, !!source) + '</select></label><span aria-hidden="true">→</span><label>' + T("apng.018") + '<select id="apngEnd">' + apngEndpointOptions(model.end, model.start, !!source) + "</select></label></div>" +
			(usesColor ? '<label class="apng-color-field"><span>' + T("solid.002") + '</span><input type="color" id="apngColor" value="' + esc(model.color || "#000000") + '"></label>' : "") +
			'<label class="apng-duration-field">' + T("apng.019") + '<input type="number" id="apngDuration" min="' + (APNG.DEFAULTS.minDuration / 1000).toFixed(1) + '" max="' + (APNG.DEFAULTS.maxDuration / 1000).toFixed(1) + '" step="' + (APNG.DEFAULTS.durationStep / 1000).toFixed(1) + '" value="' + durationLabel + '"> ' + T("apng.020") + '</label>' +
			'<label class="apng-loop-field">' + T("apng.021") + '<select id="apngLoop"><option value="off"' + (model.loop ? "" : " selected") + '>' + T("matlist.088") + '</option><option value="on"' + (model.loop ? " selected" : "") + '>' + T("apng.022") + '</option></select></label>' +
			'<div class="apng-summary"><b>' + T("apng.023") + durationLabel + T("apng.024") + ' ' + frameCount + T("apng.025") + '</b><span>' + T("apng.021") + ' ' + (model.loop ? T("apng.022") : T("matlist.088")) + '</span><span>' + T("apng.026") + APNG.DEFAULTS.maxEdge + T("apng.027") + '</span><span>' + T("apng.028") + '</span></div>' +
			'<button class="btn pri apng-generate" id="apngGo"' + (model.busy ? " disabled" : "") + ">" + (model.busy ? T("apng.029") : T("apng.030")) + "</button>" + result + "</div></div>"
	}
	function refreshApngSummary(model) {
		var settings = document.querySelector("#m2body .apng-settings"), summary = settings && settings.querySelector(".apng-summary")
		if (!settings || !summary || !model) return
		var duration = APNG.normalizeDuration(model.duration), label = (duration / 1000).toFixed(1), frameCount = APNG.frameCountFor({ duration: duration, fps: APNG.DEFAULTS.fps })
		var title = summary.querySelector("b"), rows = summary.querySelectorAll("span")
		if (title) title.textContent = T("apng.031", label, frameCount)
		if (rows[0]) rows[0].textContent = T("apng.032", (model.loop ? T("apng.022") : T("matlist.088")))
		var result = settings.querySelector(".apng-result"), error = settings.querySelector('[role="alert"]')
		if (result) result.remove()
		if (error) error.remove()
	}
	function stopApngPreview() {
		apngPreviewToken++
		if (apngPreviewFrame) cancelAnimationFrame(apngPreviewFrame)
		apngPreviewFrame = 0
	}
	function drawApngPreviewFrame(canvas, image, model, progress) {
		if (!canvas || !model) return
		var source = apngSourceImage(model), sw = source ? Math.max(1, source.w || (image && image.naturalWidth) || 1) : APNG.DEFAULTS.colorSize
		var sh = source ? Math.max(1, source.h || (image && image.naturalHeight) || 1) : APNG.DEFAULTS.colorSize
		var scale = Math.min(1, 720 / Math.max(sw, sh)), width = Math.max(1, Math.round(sw * scale)), height = Math.max(1, Math.round(sh * scale))
		if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
		var cx = canvas.getContext("2d")
		cx.clearRect(0, 0, width, height)
		var imageAndColor = model.start === "image" && model.end === "color" || model.start === "color" && model.end === "image"
		var imageAmount = imageAndColor ? 1 : model.end === "image" ? progress : model.start === "image" ? 1 - progress : 0
		if (imageAmount > 0 && image && image.complete && image.naturalWidth) {
			cx.save(); cx.globalAlpha = imageAmount; cx.drawImage(image, 0, 0, width, height); cx.restore()
		}
		var colorAmount = 0
		if (model.start === "color" && model.end === "transparent") colorAmount = 1 - progress
		else if (model.start === "transparent" && model.end === "color") colorAmount = progress
		else if (model.start === "color" && model.end === "image") colorAmount = 1 - progress
		else if (model.start === "image" && model.end === "color") colorAmount = progress
		if (colorAmount > 0) {
			cx.save(); cx.globalAlpha = colorAmount; cx.fillStyle = model.color || "#000000"; cx.fillRect(0, 0, width, height); cx.restore()
		}
	}
	function startApngPreview() {
		stopApngPreview()
		var canvas = $("#apngPreview"), image = $("#apngSourceImage"), model = ui.apng
		if (!canvas || !model || ui.modal !== "apng") return
		var token = ++apngPreviewToken, started = performance.now(), duration = APNG.normalizeDuration(model.duration), pause = 300
		function frame(now) {
			if (token !== apngPreviewToken || ui.modal !== "apng" || ui.apng !== model) return
			var elapsed = (now - started) % (duration + pause), progress = elapsed >= duration ? 1 : elapsed / duration
			drawApngPreviewFrame(canvas, image, model, progress)
			apngPreviewFrame = requestAnimationFrame(frame)
		}
		apngPreviewFrame = requestAnimationFrame(frame)
	}
	function apngSourceData(model) {
		var im = apngSourceImage(model)
		if (!im) {
			if (APNG.needsImage(model.start, model.end)) return Promise.reject(new Error(T("apng.033")))
			return Promise.resolve({ source: null, width: APNG.DEFAULTS.colorSize, height: APNG.DEFAULTS.colorSize })
		}
		var blob = im.blob || packer.blobOf(im.name)
		if (!blob) return Promise.reject(new Error(T("apng.034")))
		return createImageBitmap(blob).then(function (bmp) {
			var scale = Math.min(1, APNG.DEFAULTS.maxEdge / Math.max(bmp.width, bmp.height)), width = Math.max(1, Math.round(bmp.width * scale)), height = Math.max(1, Math.round(bmp.height * scale))
			var canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height
			var cx = canvas.getContext("2d", { willReadFrequently: true }); cx.clearRect(0, 0, width, height); cx.drawImage(bmp, 0, 0, width, height)
			bmp.close && bmp.close()
			return { source: new Uint8Array(cx.getImageData(0, 0, width, height).data), width: width, height: height }
		})
	}
	function apngFileName(model) {
		var source = apngSourceImage(model), base = source ? String(source.originalName || source.label || T("apng.006")).replace(/\.[^.]+$/, "") : T("apng.035")
		base = base.replace(/[\\/:*?"<>|]/g, "_").trim() || T("apng.035")
		var direction = model.end === "image" || model.start === "transparent" && model.end === "color" ? T("apng.036") : T("apng.037")
		return base + "_" + direction + ".png"
	}
	async function runApngMaker() {
		var model = apngNormalizeUi(ui.apng)
		if (!model || model.busy) return
		model.busy = true; model.error = ""; model.resultSize = 0; model.resultName = ""; model.resultMessage = ""
		scheduleApngModalRender(model)
		await new Promise(function (resolve) { requestAnimationFrame(resolve) })
		try {
			var input = await apngSourceData(model)
			var encoded = APNG.encodeFade({ start: model.start, end: model.end, color: model.color, source: input.source, width: input.width, height: input.height, duration: model.duration, fps: APNG.DEFAULTS.fps, loop: !!model.loop }, window.UPNG)
			var blob = new Blob([encoded.buffer], { type: "image/png" }), fileName = apngFileName(model)
			var added = await addFiles([new File([blob], fileName, { type: "image/png" })])
			if (!added || !added[0]) throw new Error(T("apng.038"))
			var imageName = added[0], assigned = false, context = model.context || { kind: "material" }
			if (context.kind === "scene") {
				var scene = sceneById(context.sceneId), marker = scene && emById(scene, context.effectId)
				if (marker) { marker.imageUrl = imageName; fixAspect(marker, "image"); assigned = true }
			} else if (context.kind === "preset") {
				if (emPresetById(context.presetId)) { await emPresetSetImage(context.presetId, imageName); assigned = true }
			} else if (context.kind === "picker") {
				var pick = pickBack
				pickBack = null
				if (pick) assigned = applyImagePickerResult(pick, imageName)
			}
			model.resultSize = blob.size; model.resultName = fileName
			if (context.kind !== "material" && context.kind !== "edit" && !assigned) model.resultMessage = T("apng.039")
			else if (assigned) model.resultMessage = apngContextLabel(context) + T("apng.040")
			toast(T("apng.041"), "ok")
		} catch (error) {
			model.error = T("apng.042", (error && error.message ? error.message : String(error)))
			toast(model.error, "warn")
		} finally {
			model.busy = false
			if (ui.apng === model && ui.modal === "apng") renderModal()
			else stopApngPreview()
		}
	}

	/* ---------------- 文字・図形入り画像を作る ---------------- */
	var IMAGE_MAKER_DEFAULTS = { width: 800, height: 450, quality: "standard", historyLimit: 50 }
	var IMAGE_MAKER_QUALITIES = { high: 0.92, standard: 0.82, light: 0.68 }
	/* 切語言時要跟著變，所以不在載入時就算好 */
	function imageMakerFontPresets() {
		return [
			{ id: "gothic", label: T("maker.001"), stack: 'system-ui,-apple-system,"Helvetica Neue","Yu Gothic","YuGothic","Meiryo",sans-serif' },
			{ id: "mincho", label: T("maker.002"), stack: '"Hiragino Mincho ProN","Yu Mincho","YuMincho","MS PMincho",serif' },
			{ id: "rounded", label: T("maker.003"), stack: '"Hiragino Maru Gothic ProN","Hiragino Maru Gothic Pro","Yu Gothic","YuGothic","Meiryo",sans-serif' },
			{ id: "handwritten", label: T("maker.004"), stack: '"Hannotate SC","Klee","YuKyokasho","Yu Kyokasho","Hiragino Maru Gothic ProN","Yu Gothic",cursive' },
			{ id: "monospace", label: T("maker.005"), stack: 'ui-monospace,"SFMono-Regular",Consolas,"Liberation Mono",monospace' },
		]
	}
	var imageMakerPreviewFrame = 0, imageMakerPreviewToken = 0, imageMakerEstimateTimer = 0, imageMakerEstimateToken = 0, imageMakerRenderFrame = 0, imageMakerRenderToken = 0
	var imageMakerBitmapCache = Object.create(null)
	function imageMakerLayer(id) { return ui.imageMaker && ui.imageMaker.layers.find(function (layer) { return layer.id === id }) }
	function imageMakerSelectedIds(model) {
		model = model || ui.imageMaker
		if (!model) return []
		var ids = Array.isArray(model.selectedIds) ? model.selectedIds.filter(function (id) { return !!imageMakerLayer(id) }) : []
		if (!ids.length && model.selectedId) ids = [model.selectedId]
		return ids
	}
	function imageMakerSelected() { return imageMakerLayer(ui.imageMaker && ui.imageMaker.selectedId) }
	function imageMakerSetSelection(model, ids) {
		var seen = Object.create(null), next = []
		;(ids || []).forEach(function (id) { if (!seen[id] && imageMakerLayer(id)) { seen[id] = true; next.push(id) } })
		model.selectedIds = next
		model.selectedId = next.length ? next[next.length - 1] : null
	}
	function imageMakerToggleSelection(model, id, additive) {
		var ids = imageMakerSelectedIds(model)
		if (!additive) return imageMakerSetSelection(model, [id])
		var at = ids.indexOf(id)
		if (at >= 0) ids.splice(at, 1); else ids.push(id)
		imageMakerSetSelection(model, ids)
	}
	function imageMakerSelectedLayers(model) { return imageMakerSelectedIds(model).map(function (id) { return imageMakerLayer(id) }).filter(Boolean) }
	function imageMakerQuality(model) { return IMAGE_MAKER_QUALITIES[model && model.quality] || IMAGE_MAKER_QUALITIES.standard }
	function imageMakerImage(name) { return name ? imageByName(name) : null }
	function imageMakerFontPreset(id) { return imageMakerFontPresets().find(function (preset) { return preset.id === id }) || IMAGE_MAKER_FONT_PRESETS[0] }
	function imageMakerFontPresetId(layer) {
		var direct = layer && imageMakerFontPresets().find(function (preset) { return preset.id === layer.fontPreset })
		if (direct) return direct.id
		var byStack = layer && imageMakerFontPresets().find(function (preset) { return preset.stack === layer.font })
		return byStack ? byStack.id : "gothic"
	}
	function imageMakerSnapshot(model) {
		if (!model) return null
		return {
			width: model.width, height: model.height, background: model.background,
			backgroundColor: model.backgroundColor, backgroundImage: model.backgroundImage,
			layers: JSON.parse(JSON.stringify(model.layers || [])), selectedId: model.selectedId || null,
			selectedIds: imageMakerSelectedIds(model).slice(),
		}
	}
	function imageMakerSnapshotKey(snapshot) { return snapshot ? JSON.stringify(snapshot) : "" }
	function imageMakerResetHistory(model) {
		if (!model) return
		model.history = [imageMakerSnapshot(model)]; model.historyIndex = 0; model.historyInput = null
	}
	function imageMakerCommitHistory(model, before) {
		if (!model || !before) return false
		var current = imageMakerSnapshot(model), beforeKey = imageMakerSnapshotKey(before), currentKey = imageMakerSnapshotKey(current)
		if (beforeKey === currentKey) return false
		var history = Array.isArray(model.history) ? model.history.slice(0, (Number(model.historyIndex) || 0) + 1) : []
		var index = Math.max(0, history.length - 1)
		if (!history.length) history.push(before)
		else if (imageMakerSnapshotKey(history[index]) !== beforeKey) history[index] = before
		history.push(current)
		while (history.length > IMAGE_MAKER_DEFAULTS.historyLimit) history.shift()
		model.history = history; model.historyIndex = history.length - 1
		refreshImageMakerHistoryUi()
		return true
	}
	function imageMakerCommitPendingInput(model) {
		model = model || ui.imageMaker
		if (!model || !model.historyInput) return false
		var before = model.historyInput; model.historyInput = null
		return imageMakerCommitHistory(model, before)
	}
	function imageMakerRestoreSnapshot(model, snapshot) {
		if (!model || !snapshot) return
		model.width = snapshot.width; model.height = snapshot.height; model.background = snapshot.background
		model.backgroundColor = snapshot.backgroundColor; model.backgroundImage = snapshot.backgroundImage
		model.layers = JSON.parse(JSON.stringify(snapshot.layers || [])); model.selectedId = snapshot.selectedId || null
		model.selectedIds = Array.isArray(snapshot.selectedIds) ? snapshot.selectedIds.slice() : []
		model.bounds = Object.create(null); model.resultSize = 0; model.resultName = ""; model.error = ""
		// Undo/Redo直後は、再描画を待たずに現在表示中の文字欄をstateへ合わせる。
		// 古いtextareaから遅れてchangeが届いても、正しい表示を維持できる。
		var selectedText = imageMakerLayer(model.selectedId), textField = document.querySelector('[data-imfield="text"]')
		if (selectedText && selectedText.type === "text" && textField && document.documentElement.contains(textField)) textField.value = selectedText.text || ""
	}
	function imageMakerUndo() {
		var model = ui.imageMaker
		if (!model) return
		imageMakerCommitPendingInput(model)
		if (!Array.isArray(model.history) || model.historyIndex <= 0) return refreshImageMakerHistoryUi()
		model.historyIndex--; imageMakerRestoreSnapshot(model, model.history[model.historyIndex]); scheduleImageMakerRender()
	}
	function imageMakerRedo() {
		var model = ui.imageMaker
		if (!model) return
		imageMakerCommitPendingInput(model)
		if (!Array.isArray(model.history) || model.historyIndex >= model.history.length - 1) return refreshImageMakerHistoryUi()
		model.historyIndex++; imageMakerRestoreSnapshot(model, model.history[model.historyIndex]); scheduleImageMakerRender()
	}
	function refreshImageMakerHistoryUi() {
		var model = ui.imageMaker, undoButton = $("#imageMakerUndo"), redoButton = $("#imageMakerRedo")
		if (!model) return
		if (undoButton) undoButton.disabled = !(Array.isArray(model.history) && model.historyIndex > 0)
		if (redoButton) redoButton.disabled = !(Array.isArray(model.history) && model.historyIndex < model.history.length - 1)
	}
	function imageMakerHistoryInputTarget(target) {
		if (!target || ui.modal !== "imageMaker" || !ui.imageMaker) return false
		var data = target.dataset || {}
		return target.id === "imageMakerWidth" || target.id === "imageMakerHeight" || target.id === "imageMakerBackground" || target.id === "imageMakerBgColor" || data.imfield !== undefined
	}
	function cancelScheduledImageMakerRender() { if (!imageMakerRenderFrame) return; cancelAnimationFrame(imageMakerRenderFrame); imageMakerRenderFrame = 0; imageMakerRenderToken++ }
	function imageMakerScrollProbe(stage) { var probe = typeof window !== "undefined" && window.__imageMakerScrollProbe; if (!probe || !probe.events) return; var el = document.querySelector(".image-maker-settings"); if (typeof probe.capture === "function") probe.capture(stage, el); else probe.events.push({ stage: stage, scrollTop: el ? el.scrollTop : 0, exists: !!el, sameElement: !!el && el === probe.element }) }
	function imageMakerDragProbe(stage, detail) { var probe = typeof window !== "undefined" && window.__imageMakerDragProbe; if (!probe || !probe.events) return; if (stage === "pointerdown") probe.dragActive = !detail || detail.dragStarted !== false; if (stage === "renderModal" && probe.dragActive) probe.renderModalDuringDrag = (probe.renderModalDuringDrag || 0) + 1; if (stage === "pointermove") { probe.pointermoveCount = (probe.pointermoveCount || 0) + 1; detail = Object.assign({ count: probe.pointermoveCount }, detail || {}) } if (stage === "pointerup") probe.dragActive = false; if (probe.events.length < 40) probe.events.push(Object.assign({ stage: stage }, detail || {})) }
	function imageMakerSettingsScroll() { imageMakerScrollProbe("scroll取得"); var el = document.querySelector(".image-maker-settings"); return el ? el.scrollTop : 0 }
	function renderImageMakerPreservingScroll(scrollTop) { if (ui.modal !== "imageMaker") return; var keep = Math.max(0, Number(scrollTop) || 0); imageMakerScrollProbe("render前"); renderModal(); imageMakerScrollProbe("render之後"); var el = document.querySelector(".image-maker-settings"); if (el && keep > 0 && el.scrollTop !== keep) el.scrollTop = keep; imageMakerScrollProbe("還原後") }
	function scheduleImageMakerRender() { var model=ui.imageMaker,token=++imageMakerRenderToken;if(imageMakerRenderFrame)cancelAnimationFrame(imageMakerRenderFrame);imageMakerRenderFrame=requestAnimationFrame(function(){imageMakerRenderFrame=0;imageMakerScrollProbe("預約rAF開始");if(token!==imageMakerRenderToken||ui.modal!=="imageMaker"||ui.imageMaker!==model)return;renderImageMakerPreservingScroll(imageMakerSettingsScroll())}) }
	function imageMakerLabel(type) { return { text: T("maker.006"), image: T("apng.006"), rect: T("maker.007"), circle: T("maker.008"), triangle: T("maker.009") }[type] || T("maker.010") }
	function imageMakerNewLayer(type, imageName) {
		var n = ui.imageMaker ? ui.imageMaker.layers.length : 0, base = { id: "im-" + uid(), type: type, name: imageMakerLabel(type) + " " + (n + 1), x: 80 + n * 12, y: 70 + n * 12, opacity: 100, visible: true, locked: false }
		if (type === "text") Object.assign(base, { text: T("maker.011"), fontPreset: "gothic", font: imageMakerFontPreset("gothic").stack, fontSize: 64, weight: 700, color: "#ffffff", stroke: true, strokeColor: "#000000", strokeWidth: 4, align: "left", lineHeight: 1.25, letterSpacing: 0 })
		else if (type === "image") { var im = imageMakerImage(imageName), iw = im && im.w || 240, ih = im && im.h || 180; Object.assign(base, { imageName: imageName || "", width: iw, height: ih, naturalWidth: iw, naturalHeight: ih, lockAspect: true }) }
		else Object.assign(base, { color: type === "circle" ? "#7cc5ff" : type === "triangle" ? "#ffd24a" : "#ffffff", width: 220, height: 140 })
		return base
	}
	function openImageMaker(context, currentName) {
		releaseImageMaker()
		var current = imageMakerImage(currentName)
		ui.imageMaker = { context: context || { kind: "material" }, width: IMAGE_MAKER_DEFAULTS.width, height: IMAGE_MAKER_DEFAULTS.height, background: current ? "image" : "transparent", backgroundColor: "#000000", backgroundImage: current ? current.name : "", layers: [], selectedId: null, selectedIds: [], quality: IMAGE_MAKER_DEFAULTS.quality, fileName: "", estimateSize: 0, busy: false, resultSize: 0, resultName: "", error: "", callbackApplied: false, bounds: Object.create(null), history: [], historyIndex: 0, historyInput: null }
		imageMakerResetHistory(ui.imageMaker)
		ui.modal = "imageMaker"
		render()
	}
	function releaseImageMaker() {
		if (imageMakerPreviewFrame) cancelAnimationFrame(imageMakerPreviewFrame)
		cancelScheduledImageMakerRender()
		clearTimeout(imageMakerEstimateTimer)
		imageMakerPreviewFrame = 0; imageMakerPreviewToken++; imageMakerEstimateToken++
		if (ui.imageMaker) { ui.imageMaker.history = []; ui.imageMaker.historyIndex = 0; ui.imageMaker.historyInput = null }
		Object.keys(imageMakerBitmapCache).forEach(function (name) { Promise.resolve(imageMakerBitmapCache[name]).then(function (bitmap) { if (bitmap && bitmap.close) bitmap.close() }).catch(function () {}) })
		imageMakerBitmapCache = Object.create(null)
	}
	function imageMakerBitmap(name) {
		if (!name) return Promise.resolve(null)
		if (!imageMakerBitmapCache[name]) {
			var blob = packer.blobOf(name)
			imageMakerBitmapCache[name] = blob ? createImageBitmap(blob).catch(function () { return null }) : Promise.resolve(null)
		}
		return imageMakerBitmapCache[name]
	}
	function imageMakerTextWidth(cx, text, spacing) {
		var chars = Array.from(String(text || "")), width = chars.reduce(function (sum, ch) { return sum + cx.measureText(ch).width }, 0)
		return width + Math.max(0, chars.length - 1) * spacing
	}
	function imageMakerDrawText(cx, layer) {
		var size = Math.max(1, Number(layer.fontSize) || 32), spacing = Number(layer.letterSpacing) || 0, lineHeight = size * Math.max(.5, Number(layer.lineHeight) || 1.25), lines = String(layer.text || "").split("\n")
		cx.font = (Number(layer.weight) >= 700 ? "700 " : "400 ") + size + "px " + (layer.font || "sans-serif")
		cx.textBaseline = "top"; cx.lineJoin = "round"; cx.fillStyle = layer.color || "#ffffff"; cx.strokeStyle = layer.strokeColor || "#000000"; cx.lineWidth = Math.max(0, Number(layer.strokeWidth) || 0)
		var minX = Infinity, maxX = -Infinity
		lines.forEach(function (line, row) {
			var width = imageMakerTextWidth(cx, line, spacing), start = Number(layer.x) || 0
			if (layer.align === "center") start -= width / 2
			if (layer.align === "right") start -= width
			minX = Math.min(minX, start); maxX = Math.max(maxX, start + width)
			var x = start, y = (Number(layer.y) || 0) + row * lineHeight
			Array.from(line).forEach(function (ch, i) { if (layer.stroke && cx.lineWidth) cx.strokeText(ch, x, y); cx.fillText(ch, x, y); x += cx.measureText(ch).width + (i < Array.from(line).length - 1 ? spacing : 0) })
		})
		if (!isFinite(minX)) minX = maxX = Number(layer.x) || 0
		return { x: minX - (layer.stroke ? cx.lineWidth : 0), y: Number(layer.y) || 0, width: Math.max(2, maxX - minX + (layer.stroke ? cx.lineWidth * 2 : 0)), height: Math.max(size, lines.length * lineHeight) }
	}
	async function makeImageMakerCanvas(model, withSelection) {
		var cv = document.createElement("canvas"), width = Math.max(16, Math.min(4096, Math.round(Number(model.width) || IMAGE_MAKER_DEFAULTS.width))), height = Math.max(16, Math.min(4096, Math.round(Number(model.height) || IMAGE_MAKER_DEFAULTS.height)))
		cv.width = width; cv.height = height
		var cx = cv.getContext("2d"), bounds = Object.create(null)
		cx.clearRect(0, 0, width, height)
		if (model.background === "color") { cx.fillStyle = model.backgroundColor || "#000000"; cx.fillRect(0, 0, width, height) }
		if (model.background === "image") {
			var bg = await imageMakerBitmap(model.backgroundImage)
			if (bg) { var bs = Math.max(width / bg.width, height / bg.height), bw = bg.width * bs, bh = bg.height * bs; cx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh) }
		}
		for (var i = model.layers.length - 1; i >= 0; i--) {
			var layer = model.layers[i]
			if (layer.visible === false) continue
			cx.save(); cx.globalAlpha = Math.max(0, Math.min(100, Number(layer.opacity) || 0)) / 100
			var box
			if (layer.type === "text") box = imageMakerDrawText(cx, layer)
			else if (layer.type === "image") { var bitmap = await imageMakerBitmap(layer.imageName), iw = Math.max(1, Number(layer.width) || 1), ih = Math.max(1, Number(layer.height) || 1); if (bitmap) cx.drawImage(bitmap, Number(layer.x) || 0, Number(layer.y) || 0, iw, ih); box = { x: Number(layer.x) || 0, y: Number(layer.y) || 0, width: iw, height: ih } }
			else { var x = Number(layer.x) || 0, y = Number(layer.y) || 0, w = Math.max(1, Number(layer.width) || 1), h = Math.max(1, Number(layer.height) || 1); cx.fillStyle = layer.color || "#ffffff"; cx.beginPath(); if (layer.type === "circle") cx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else if (layer.type === "triangle") { cx.moveTo(x + w / 2, y); cx.lineTo(x + w, y + h); cx.lineTo(x, y + h); cx.closePath() } else cx.rect(x, y, w, h); cx.fill(); box = { x: x, y: y, width: w, height: h } }
			cx.restore(); bounds[layer.id] = box
		}
		model.bounds = bounds
		if (withSelection) {
			var selectedIds = imageMakerSelectedIds(model)
			cx.save(); cx.strokeStyle = "#7cc5ff"; cx.lineWidth = Math.max(2, Math.min(width, height) / 250); cx.setLineDash([8, 5])
			selectedIds.forEach(function (id) { var b = bounds[id]; if (b) cx.strokeRect(b.x - 3, b.y - 3, b.width + 6, b.height + 6) })
			var selected = selectedIds.length === 1 && imageMakerLayer(selectedIds[0]), sb = selected && bounds[selected.id]
			if (selected && sb && !selected.locked) {
				cx.setLineDash([]); cx.fillStyle = "#7cc5ff"
				;[[sb.x, sb.y], [sb.x + sb.width, sb.y], [sb.x, sb.y + sb.height], [sb.x + sb.width, sb.y + sb.height]].forEach(function (p) { cx.fillRect(p[0] - 5, p[1] - 5, 10, 10) })
			}
			cx.restore()
		}
		return cv
	}
	function imageMakerCanvasBlob(canvas, quality) { return new Promise(function (resolve, reject) { canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error(T("maker.012"))) }, "image/webp", quality) }) }
	function imageMakerCanvasPoint(canvas, clientX, clientY) {
		var rect = canvas.getBoundingClientRect()
		return { x: (clientX - rect.left) * canvas.width / Math.max(1, rect.width), y: (clientY - rect.top) * canvas.height / Math.max(1, rect.height) }
	}
	function imageMakerHitLayer(model, x, y) {
		if (!model || !Array.isArray(model.layers)) return null
		// makeImageMakerCanvas は配列末尾から描画するため、index 0 が最後に描かれる前面です。
		return model.layers.find(function (layer) {
			var b = model.bounds && model.bounds[layer.id]
			return layer.visible !== false && b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
		}) || null
	}
	function scheduleImageMakerPreview(estimate) {
		var model = ui.imageMaker, token = ++imageMakerPreviewToken
		if (imageMakerPreviewFrame) cancelAnimationFrame(imageMakerPreviewFrame)
		var previewCanvas = $("#imageMakerCanvas")
		if (previewCanvas) {
			var previewWidth = Math.max(16, Math.min(4096, Math.round(Number(model && model.width) || IMAGE_MAKER_DEFAULTS.width))), previewHeight = Math.max(16, Math.min(4096, Math.round(Number(model && model.height) || IMAGE_MAKER_DEFAULTS.height)))
			if (previewCanvas.width !== previewWidth) previewCanvas.width = previewWidth
			if (previewCanvas.height !== previewHeight) previewCanvas.height = previewHeight
		}
		imageMakerPreviewFrame = requestAnimationFrame(async function () {
			imageMakerPreviewFrame = 0
			try { var made = await makeImageMakerCanvas(model, true); if (token !== imageMakerPreviewToken || ui.modal !== "imageMaker" || ui.imageMaker !== model) return; var cv = $("#imageMakerCanvas"); if (!cv) return; cv.width = made.width; cv.height = made.height; cv.getContext("2d").drawImage(made, 0, 0) } catch (error) { if (model) model.error = error.message }
		})
		if (estimate !== false) scheduleImageMakerEstimate()
	}
	function scheduleImageMakerEstimate() {
		clearTimeout(imageMakerEstimateTimer)
		var model = ui.imageMaker, token = ++imageMakerEstimateToken
		imageMakerEstimateTimer = setTimeout(async function () {
			try { var cv = await makeImageMakerCanvas(model, false), blob = await imageMakerCanvasBlob(cv, imageMakerQuality(model)); if (token !== imageMakerEstimateToken || ui.modal !== "imageMaker" || ui.imageMaker !== model) return; model.estimateSize = blob.size; var out = $("#imageMakerEstimate"); if (out) out.textContent = T("maker.013", kb(blob.size)) } catch (error) { if (token === imageMakerEstimateToken && model) { model.error = error.message; var er = $("#imageMakerError"); if (er) er.textContent = model.error } }
		}, 400)
	}
	function imageMakerMoveByBounds(layer, from, to) { if (!layer || layer.locked || !from) return; layer.x = Math.round((Number(layer.x) || 0) + to.x - from.x); layer.y = Math.round((Number(layer.y) || 0) + to.y - from.y) }
	function imageMakerAlign(model, mode) {
		var before = imageMakerSnapshot(model)
		var layers = imageMakerSelectedLayers(model), bounds = model.bounds || {}, items = layers.map(function (layer) { return { layer: layer, b: bounds[layer.id] } }).filter(function (x) { return x.b })
		if (items.length < 2) return
		var left = Math.min.apply(null, items.map(function (x) { return x.b.x })), right = Math.max.apply(null, items.map(function (x) { return x.b.x + x.b.width })), top = Math.min.apply(null, items.map(function (x) { return x.b.y })), bottom = Math.max.apply(null, items.map(function (x) { return x.b.y + x.b.height })), cx = (left + right) / 2, cy = (top + bottom) / 2
		if (mode === "left" || mode === "center" || mode === "right") items.forEach(function (x) { var nx = mode === "left" ? left : mode === "right" ? right - x.b.width : cx - x.b.width / 2; imageMakerMoveByBounds(x.layer, x.b, { x: nx, y: x.b.y }) })
		else if (mode === "top" || mode === "middle" || mode === "bottom") items.forEach(function (x) { var ny = mode === "top" ? top : mode === "bottom" ? bottom - x.b.height : cy - x.b.height / 2; imageMakerMoveByBounds(x.layer, x.b, { x: x.b.x, y: ny }) })
		else if ((mode === "distribute-x" || mode === "distribute-y") && items.length >= 3) {
			var axis = mode === "distribute-x" ? "x" : "y", sizeKey = mode === "distribute-x" ? "width" : "height", end = mode === "distribute-x" ? right : bottom, start = mode === "distribute-x" ? left : top
			items.sort(function (a, b) { return a.b[axis] - b.b[axis] })
			var totalSize = items.reduce(function (sum, item) { return sum + item.b[sizeKey] }, 0), gap = (end - start - totalSize) / (items.length - 1), cursor = start
			items.forEach(function (x, i) {
				var target = i === items.length - 1 ? end - x.b[sizeKey] : cursor, dest = { x: x.b.x, y: x.b.y }
				dest[axis] = target; imageMakerMoveByBounds(x.layer, x.b, dest); cursor = target + x.b[sizeKey] + gap
			})
		}
		imageMakerCommitHistory(model, before)
		scheduleImageMakerPreview(true); scheduleImageMakerRender()
	}
	function imageMakerAlignmentBlock(model) {
		var n = imageMakerSelectedLayers(model).length, disabled = n < 2 ? " disabled" : ""
		return '<div class="image-maker-align"><div class="row"><button class="btn sm" data-imalign="left"'+disabled+'>' + T("maker.014") + '</button><button class="btn sm" data-imalign="center"'+disabled+'>' + T("maker.015") + '</button><button class="btn sm" data-imalign="right"'+disabled+'>' + T("maker.016") + '</button></div><div class="row"><button class="btn sm" data-imalign="top"'+disabled+'>' + T("maker.017") + '</button><button class="btn sm" data-imalign="middle"'+disabled+'>' + T("maker.015") + '</button><button class="btn sm" data-imalign="bottom"'+disabled+'>' + T("maker.018") + '</button></div><div class="row"><button class="btn sm" data-imalign="distribute-x"'+(n<3?" disabled":"")+'>' + T("maker.019") + '</button><button class="btn sm" data-imalign="distribute-y"'+(n<3?" disabled":"")+'>' + T("maker.020") + '</button></div></div>'
	}
	function refreshImageMakerSelectionUi() {
		var model = ui.imageMaker, editor = $("#imageMakerLayerEditor")
		if (!model || ui.modal !== "imageMaker" || !editor) return
		var ids = imageMakerSelectedIds(model), selected = ids.length === 1 ? imageMakerLayer(ids[0]) : null, alignSection = $("#imageMakerAlignmentSection"), count = ids.length
		if (alignSection) { alignSection.hidden = count <= 1; alignSection.innerHTML = count > 1 ? '<h3>' + T("maker.021") + '</h3>' + imageMakerAlignmentBlock(model) : "" }
		var align = alignSection && alignSection.querySelector(".image-maker-align")
		if (align) all("[data-imalign]", align).forEach(function (button) {
			var distribute = button.dataset.imalign === "distribute-x" || button.dataset.imalign === "distribute-y"
			button.disabled = distribute ? count < 3 : count < 2
		})
		editor.dataset.imEditorId = selected ? selected.id : ""
		editor.innerHTML = imageMakerLayerFields(selected)
		all("[data-imlayer-row]").forEach(function (row) { row.classList.toggle("selected", ids.indexOf(row.dataset.imlayerRow) >= 0) })
		refreshImageMakerHistoryUi()
	}
	function imageMakerLayerFields(layer) {
		if (!layer) return '<p class="hint">' + T("maker.022") + '</p>'
		var disabled = layer.locked ? " disabled" : "", common = '<div class="image-maker-field-grid"><label>X<input type="number" data-imfield="x" value="' + layer.x + '"' + disabled + '></label><label>Y<input type="number" data-imfield="y" value="' + layer.y + '"' + disabled + '></label><label>' + T("maker.023") + '<input type="number" min="0" max="100" data-imfield="opacity" value="' + layer.opacity + '"' + disabled + '></label>'
		if (layer.type === "text") {
			var selectedPreset = imageMakerFontPresetId(layer), fonts = imageMakerFontPresets().map(function (preset) { return '<option value="' + esc(preset.id) + '"' + (preset.id === selectedPreset ? " selected" : "") + '>' + esc(preset.label) + '</option>' }).join("")
			return '<div class="image-maker-layer-editor"><label>' + T("maker.024") + '<textarea data-imfield="text"' + disabled + '>' + esc(layer.text) + '</textarea></label><div class="image-maker-field-grid image-maker-text-grid"><label class="image-maker-wide-field">' + T("maker.025") + '<select data-imfield="fontPreset"' + disabled + '>' + fonts + '</select></label><label>' + T("maker.026") + '<input type="number" min="1" data-imfield="fontSize" value="' + layer.fontSize + '"' + disabled + '></label><label class="image-maker-color-field">' + T("solid.002") + '<input class="color-swatch" type="color" data-imfield="color" value="' + esc(layer.color) + '"' + disabled + '></label><label>' + T("maker.027") + '<select data-imfield="weight"' + disabled + '><option value="400"' + (Number(layer.weight) < 700 ? " selected" : "") + '>' + T("maker.028") + '</option><option value="700"' + (Number(layer.weight) >= 700 ? " selected" : "") + '>' + T("maker.029") + '</option></select></label><label>' + T("maker.030") + '<select data-imfield="align"' + disabled + '><option value="left"' + (layer.align === "left" ? " selected" : "") + '>' + T("maker.031") + '</option><option value="center"' + (layer.align === "center" ? " selected" : "") + '>' + T("maker.032") + '</option><option value="right"' + (layer.align === "right" ? " selected" : "") + '>' + T("maker.033") + '</option></select></label><label>' + T("maker.034") + '<input type="number" min="0.5" max="3" step="0.05" data-imfield="lineHeight" value="' + layer.lineHeight + '"' + disabled + '></label><label>' + T("maker.035") + '<input type="number" data-imfield="letterSpacing" value="' + layer.letterSpacing + '"' + disabled + '></label></div><div class="row image-maker-inline-fields"><label><input type="checkbox" data-imfield="stroke"' + (layer.stroke ? " checked" : "") + disabled + '> ' + T("maker.036") + '</label><label class="image-maker-color-field">' + T("maker.037") + ' <input class="color-swatch" type="color" data-imfield="strokeColor" value="' + esc(layer.strokeColor) + '"' + disabled + '></label><label>' + T("maker.027") + ' <input type="number" min="0" max="30" data-imfield="strokeWidth" value="' + layer.strokeWidth + '"' + disabled + '></label></div>' + common + '</div></div>'
		}
		var specific = layer.type === "image" ? '<label class="image-maker-image-pick">' + T("apng.006") + imgSelect(layer.imageName || "", 'data-makerlayerimage="' + esc(layer.id) + '"', T("maker.038")) + '</label><label class="image-maker-compact-check"><input type="checkbox" data-imfield="lockAspect"' + (layer.lockAspect ? " checked" : "") + disabled + '> ' + T("maker.039") + '</label><button type="button" class="btn sm image-maker-ratio-reset" data-imageratioreset="' + esc(layer.id) + '"' + disabled + '>' + T("maker.040") + '</button>' : '<label class="image-maker-color-field">' + T("solid.002") + '<input class="color-swatch" type="color" data-imfield="color" value="' + esc(layer.color) + '"' + disabled + '></label>'
		return '<div class="image-maker-layer-editor"><div class="image-maker-field-grid ' + (layer.type === "image" ? "image-maker-image-grid" : "image-maker-shape-grid") + '">' + specific + '<label>' + T("maker.041") + '<input type="number" min="1" data-imfield="width" value="' + layer.width + '"' + disabled + '></label><label>' + T("maker.042") + '<input type="number" min="1" data-imfield="height" value="' + layer.height + '"' + disabled + '></label></div>' + common + '</div></div>'
	}
	function imageMakerBlock() {
		var model = ui.imageMaker
		if (!model) return '<p class="hint">' + T("maker.043") + '</p>'
		var bgExtra = model.background === "color" ? '<label class="image-maker-color-field">' + T("maker.044") + '<input class="color-swatch" type="color" id="imageMakerBgColor" value="' + esc(model.backgroundColor) + '"></label>' : model.background === "image" ? '<label>' + T("maker.045") + imgSelect(model.backgroundImage || "", 'data-makerbg="1"', T("maker.038")) + '</label>' : ""
		var selectedIds = imageMakerSelectedIds(model), rows = model.layers.map(function (layer, index) { return '<div class="image-maker-layer-row' + (selectedIds.indexOf(layer.id) >= 0 ? " selected" : "") + (layer.visible === false ? " hidden-layer" : "") + '" data-imlayer-row="' + esc(layer.id) + '"><button class="image-maker-layer-name" data-imselect="' + esc(layer.id) + '">' + esc(layer.name) + '</button><button class="x" data-imvisible="' + esc(layer.id) + '" title="' + T("maker.046") + '">' + (layer.visible === false ? "🚫" : "👁") + '</button><button class="x" data-imlock="' + esc(layer.id) + '" title="' + T("maker.047") + '">' + (layer.locked ? "🔒" : "🔓") + '</button><button class="x" data-immove="up" data-imid="' + esc(layer.id) + '" title="' + T("maker.048") + '"' + (index === 0 ? " disabled" : "") + '>↑</button><button class="x" data-immove="down" data-imid="' + esc(layer.id) + '" title="' + T("maker.049") + '"' + (index === model.layers.length - 1 ? " disabled" : "") + '>↓</button><button class="x" data-imduplicate="' + esc(layer.id) + '" title="' + T("maker.050") + '">⧉</button><button class="x kill" data-imdelete="' + esc(layer.id) + '" title="' + T("home.094") + '">' + T("home.094") + '</button></div>' }).join("")
		var selectedLayer = selectedIds.length === 1 ? imageMakerLayer(selectedIds[0]) : null
		var canUndo = Array.isArray(model.history) && model.historyIndex > 0, canRedo = Array.isArray(model.history) && model.historyIndex < model.history.length - 1
		return '<div class="image-maker"><div class="image-maker-preview-pane"><div class="image-maker-preview-stage"><canvas id="imageMakerCanvas"></canvas></div><p class="hint">' + T("maker.051") + '</p></div><div class="image-maker-settings"><section><h3>' + T("maker.052") + '</h3><div class="image-maker-field-grid image-maker-compact-grid"><label>' + T("maker.053") + '<input type="number" id="imageMakerWidth" min="16" max="4096" value="' + model.width + '"></label><label>' + T("maker.054") + '<input type="number" id="imageMakerHeight" min="16" max="4096" value="' + model.height + '"></label><label>' + roleName("背景") + '<select id="imageMakerBackground"><option value="transparent"' + (model.background === "transparent" ? " selected" : "") + '>' + T("apng.005") + '</option><option value="color"' + (model.background === "color" ? " selected" : "") + '>' + T("maker.055") + '</option><option value="image"' + (model.background === "image" ? " selected" : "") + '>' + T("apng.006") + '</option></select></label>' + bgExtra + '</div></section><section class="image-maker-toolbox"><div class="row image-maker-add"><button class="btn" data-imadd="text">' + T("maker.056") + '</button><button class="btn" data-imadd="image">' + T("maker.057") + '</button><button class="btn" data-imadd="rect">' + T("maker.058") + '</button><button class="btn" data-imadd="circle">' + T("maker.059") + '</button><button class="btn" data-imadd="triangle">' + T("maker.060") + '</button></div><div class="row image-maker-history"><button class="btn sm" id="imageMakerUndo"' + (canUndo ? "" : " disabled") + '>' + T("maker.061") + '</button><button class="btn sm" id="imageMakerRedo"' + (canRedo ? "" : " disabled") + '>' + T("maker.062") + '</button></div></section><section><h3>' + T("maker.063") + '</h3><div id="imageMakerLayerEditor" data-im-editor-id="' + esc(selectedLayer ? selectedLayer.id : "") + '">' + imageMakerLayerFields(selectedLayer) + '</div></section><section id="imageMakerAlignmentSection"' + (selectedIds.length > 1 ? "" : " hidden") + '>' + (selectedIds.length > 1 ? '<h3>' + T("maker.021") + '</h3>' + imageMakerAlignmentBlock(model) : "") + '</section><section><h3>' + T("maker.064") + ' <span class="sub">' + T("maker.065") + '</span></h3><div class="image-maker-layers">' + (rows || '<p class="hint">' + T("maker.066") + '</p>') + '</div></section><section><h3>' + T("maker.067") + '</h3><div class="image-maker-field-grid image-maker-compact-grid"><label>' + T("maker.068") + '<input id="imageMakerFileName" value="' + esc(model.fileName) + '" placeholder="' + T("maker.069") + '"></label><label>' + T("maker.070") + '<select id="imageMakerQuality"><option value="high"' + (model.quality === "high" ? " selected" : "") + '>' + T("maker.071") + '</option><option value="standard"' + (model.quality === "standard" ? " selected" : "") + '>' + T("maker.028") + '</option><option value="light"' + (model.quality === "light" ? " selected" : "") + '>' + T("maker.072") + '</option></select></label></div><p id="imageMakerEstimate" class="image-maker-estimate">' + (model.estimateSize ? T("maker.013", kb(model.estimateSize)) : T("maker.073")) + '</p><button class="btn pri" id="imageMakerGo"' + (model.busy ? " disabled" : "") + '>' + (model.busy ? T("maker.074") : T("maker.075")) + '</button><p id="imageMakerError" class="bad" role="alert">' + esc(model.error || "") + '</p></section></div></div>'
	}
	function initImageMakerView() { scheduleImageMakerPreview(true); initImageMakerDrag() }
	function refreshImageMakerAfterStructure() { if (ui.modal === "imageMaker") renderImageMakerPreservingScroll(imageMakerSettingsScroll()) }
	function imageMakerHandleAt(bounds, x, y) {
		if (!bounds) return null
		var size = Math.max(8, Math.min(18, Math.min(bounds.width, bounds.height) * .2)), hs = size + 4
		return [["nw", bounds.x, bounds.y], ["ne", bounds.x + bounds.width, bounds.y], ["sw", bounds.x, bounds.y + bounds.height], ["se", bounds.x + bounds.width, bounds.y + bounds.height]].find(function (h) { return Math.abs(x - h[1]) <= hs && Math.abs(y - h[2]) <= hs })
	}
	function initImageMakerDrag() {
		var canvas = $("#imageMakerCanvas"), model = ui.imageMaker
		if (!canvas || !model) return
		canvas.onpointerdown = function (event) {
			event.preventDefault()
			// pointerdownのpreventDefaultで入力欄がblurしない場合も、
			// 入力編集とCanvas操作を別々のUndo単位として確定する。
			imageMakerCommitPendingInput(model)
			var point = imageMakerCanvasPoint(canvas, event.clientX, event.clientY), px = point.x, py = point.y, ids = imageMakerSelectedIds(model), selected = ids.length === 1 ? imageMakerLayer(ids[0]) : null
			var handle = selected && !selected.locked ? imageMakerHandleAt(model.bounds[selected.id], px, py) : null
			var hit = imageMakerHitLayer(model, px, py)
			imageMakerDragProbe("pointerdown", { pointerId: event.pointerId, x: px, y: py, hitId: hit && hit.id || null, dragStarted: !!hit || !!handle, selectedIds: ids.slice() })
			if (!hit && !handle) {
				if (event.shiftKey) return
				var blankPointerId = event.pointerId, blankStartX = event.clientX, blankStartY = event.clientY, blankMoved = false, blankFinished = false
				function blankMove(ev) { if (ev.pointerId === blankPointerId && (Math.abs(ev.clientX - blankStartX) > 3 || Math.abs(ev.clientY - blankStartY) > 3)) blankMoved = true }
				function blankFinish(ev) {
					if (blankFinished || ev.pointerId !== blankPointerId) return
					blankFinished = true
					canvas.removeEventListener("pointermove", blankMove); canvas.removeEventListener("pointerup", blankFinish); canvas.removeEventListener("pointercancel", blankFinish); window.removeEventListener("pointerup", blankFinish)
					if (!blankMoved) { imageMakerSetSelection(model, []); refreshImageMakerSelectionUi(); scheduleImageMakerPreview(false) }
				}
				canvas.addEventListener("pointermove", blankMove); canvas.addEventListener("pointerup", blankFinish); canvas.addEventListener("pointercancel", blankFinish); window.addEventListener("pointerup", blankFinish)
				try { canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId) } catch (error) { /* pointer capture is optional */ }
				return
			}
			if (handle && selected) {
				var beforeResize = imageMakerSnapshot(model), start = Object.assign({}, model.bounds[selected.id]), corner = handle[0], sx = px, sy = py, sw = Number(selected.width) || start.width, sh = Number(selected.height) || start.height, sf = Number(selected.fontSize) || 1, startX = Number(selected.x) || 0, startY = Number(selected.y) || 0, changed = false, finished = false, ratio = (Number(selected.naturalWidth) || sw) / Math.max(1, Number(selected.naturalHeight) || sh), east = corner.indexOf("e") >= 0, south = corner.indexOf("s") >= 0, minSize = 8
				function resize(ev) {
					var n = imageMakerCanvasPoint(canvas, ev.clientX, ev.clientY), dx = n.x - sx, dy = n.y - sy, widthDelta = east ? dx : -dx, heightDelta = south ? dy : -dy
					if (selected.type === "text") {
						var scaleX = 1 + widthDelta / Math.max(1, start.width), scaleY = 1 + heightDelta / Math.max(1, start.height), scale = Math.max(.1, Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY), nextFontSize = Math.max(1, Math.round(sf * scale)), actualScale = nextFontSize / Math.max(1, sf), nextWidth = start.width * actualScale, nextHeight = start.height * actualScale
						var wantedLeft = east ? start.x : start.x + start.width - nextWidth, wantedTop = south ? start.y : start.y + start.height - nextHeight, predictedLeft = startX + (start.x - startX) * actualScale, predictedTop = startY + (start.y - startY) * actualScale
						selected.fontSize = nextFontSize; selected.x = Math.round(startX + wantedLeft - predictedLeft); selected.y = Math.round(startY + wantedTop - predictedTop)
					} else {
						var nw = Math.max(minSize, sw + widthDelta), nh = Math.max(minSize, sh + heightDelta)
						if (selected.type === "image" && selected.lockAspect) {
							var scaleW = nw / Math.max(1, sw), scaleH = nh / Math.max(1, sh), useWidth = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1)
							if (useWidth) { nw = Math.max(minSize, sw * scaleW); nh = nw / Math.max(.01, ratio) }
							else { nh = Math.max(minSize, sh * scaleH); nw = nh * ratio }
							if (nw < minSize) { nw = minSize; nh = nw / Math.max(.01, ratio) }
							if (nh < minSize) { nh = minSize; nw = nh * ratio }
						}
						selected.width = Math.round(nw); selected.height = Math.round(nh); selected.x = Math.round(east ? startX : startX + sw - selected.width); selected.y = Math.round(south ? startY : startY + sh - selected.height)
					}
					changed = true; scheduleImageMakerPreview(false)
				}
				function resizeUp() { if (finished) return; finished = true; canvas.removeEventListener("pointermove", resize); canvas.removeEventListener("pointerup", resizeUp); canvas.removeEventListener("pointercancel", resizeUp); window.removeEventListener("pointerup", resizeUp); if (changed) { imageMakerCommitHistory(model, beforeResize); scheduleImageMakerEstimate() } refreshImageMakerAfterStructure() }
				canvas.addEventListener("pointermove", resize); canvas.addEventListener("pointerup", resizeUp); canvas.addEventListener("pointercancel", resizeUp); window.addEventListener("pointerup", resizeUp)
				try { canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId) } catch (error) { /* pointer capture is optional */ }
				return
			}
			if (!hit) return
			if (event.shiftKey) imageMakerToggleSelection(model, hit.id, true)
			else if (ids.indexOf(hit.id) < 0) imageMakerSetSelection(model, [hit.id])
			refreshImageMakerSelectionUi()
			var beforeMove = imageMakerSnapshot(model), selectedNow = imageMakerSelectedLayers(model), starts = selectedNow.map(function (layer) { return { layer: layer, x: Number(layer.x) || 0, y: Number(layer.y) || 0 } }), sx2 = px, sy2 = py, moved = false, moveFinished = false
			if (!selectedNow.some(function (layer) { return !layer.locked })) { imageMakerDragProbe("pointerup", { eventType: "no-movable-layer", selectedIds: imageMakerSelectedIds(model).slice() }); scheduleImageMakerPreview(false); refreshImageMakerAfterStructure(); return }
			function move(ev) { var next = imageMakerCanvasPoint(canvas, ev.clientX, ev.clientY), dx = next.x - sx2, dy = next.y - sy2; starts.forEach(function (s) { if (!s.layer.locked) { s.layer.x = Math.round(s.x + dx); s.layer.y = Math.round(s.y + dy) } }); moved = true; imageMakerDragProbe("pointermove", { pointerId: ev.pointerId, dx: dx, dy: dy, positions: starts.map(function (s) { return { id: s.layer.id, x: s.layer.x, y: s.layer.y, locked: !!s.layer.locked } }) }); scheduleImageMakerPreview(false) }
			function up(ev) { if (moveFinished) return; moveFinished = true; canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up); window.removeEventListener("pointerup", up); imageMakerDragProbe("pointerup", { pointerId: ev && ev.pointerId, eventType: ev && ev.type || "pointerup", moved: moved, selectedIds: imageMakerSelectedIds(model).slice(), positions: starts.map(function (s) { return { id: s.layer.id, x: s.layer.x, y: s.layer.y, locked: !!s.layer.locked } }) }); try { if (canvas.hasPointerCapture && canvas.hasPointerCapture(ev && ev.pointerId)) canvas.releasePointerCapture(ev.pointerId) } catch (error) { /* pointer capture is optional */ } if (moved) { imageMakerCommitHistory(model, beforeMove); scheduleImageMakerEstimate() } refreshImageMakerAfterStructure() }
			canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up); window.addEventListener("pointerup", up)
			try { canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId) } catch (error) { /* pointer capture is optional */ }
		}
	}
	function imageMakerFileName(model) {
		var base = String(model.fileName || "").replace(/\.webp$/i, "").replace(/[\\/:*?"<>|]/g, "_").trim()
		if (!base) { var d = new Date(), pad = function (n) { return String(n).padStart(2, "0") }; base = T("maker.076", d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate()), pad(d.getHours()), pad(d.getMinutes())) }
		return base + ".webp"
	}
	async function runImageMaker() {
		var model = ui.imageMaker
		if (!model || model.busy) return
		model.busy = true; model.error = ""; model.resultSize = 0; model.resultName = ""; renderModal()
		var succeeded = false
		try {
			var canvas = await makeImageMakerCanvas(model, false), blob = await imageMakerCanvasBlob(canvas, imageMakerQuality(model)), fileName = imageMakerFileName(model), added = await addFiles([new File([blob], fileName, { type: "image/webp" })], { preserve: true })
			if (!added || !added[0]) throw new Error(T("apng.038"))
			var name = added[0], context = model.context || { kind: "material" }
			if (context.kind === "picker") { var back = pickBack; pickBack = null; model.callbackApplied = applyImagePickerResult(back, name) }
			model.resultSize = blob.size; model.resultName = fileName; succeeded = true; toast(T("maker.077"), "ok")
		} catch (error) { model.error = T("maker.078", (error && error.message ? error.message : String(error))); toast(model.error, "warn") }
		finally { model.busy = false; if (succeeded && ui.imageMaker === model && ui.modal === "imageMaker") { releaseImageMaker(); ui.imageMaker = null; ui.modal = null; render() } else if (ui.imageMaker === model && ui.modal === "imageMaker") renderModal() }
	}

	/* ---------------- 画像を加工する ---------------- */
	function edDefaults() {
		return {
			br: 100,
			ct: 100,
			sa: 100,
			hue: 0,
			gray: 0,
			sepia: 0,
			op: 100,
			bl: 0,
			noise: 0,
			colorFilter: "#3d7cff",
			colorFilterStrength: 0,
			effectScope: "content",
			gradientOn: false,
			gradientStartColor: "#000000",
			gradientStartOpacity: 60,
			gradientStartPosition: 0,
			gradientEndColor: "#000000",
			gradientEndOpacity: 0,
			gradientEndPosition: 100,
			gradientMidpoint: 50,
			gradientDirection: "top-bottom",
			gradientStop: "start",
			rot: 0,
			flip: false,
			cl: 0,
			cr: 0,
			cu: 0,
			cb: 0,
			replace: false,
		}
	}
	function editImage() {
		return state.images.filter(function (x) {
			return x.id === ui.editImg
		})[0]
	}
	function edSlider(label, key, min, max, val, unit) {
		return (
			'<label class="edrow"><span>' +
			label +
			'</span><input type="range" data-ed="' +
			key +
			'" min="' +
			min +
			'" max="' +
			max +
			'" value="' +
			val +
			'"><b id="ed_' +
			key +
			'">' +
			val +
			"</b>" +
			(unit || "") +
			"</label>"
		)
	}
	function edNumber(label, key, max, val) {
		return '<label class="edcrop-field"><span>'+label+'</span><input type="number" inputmode="numeric" data-ed="'+key+'" min="0" max="'+Math.max(0,max)+'" step="1" value="'+(Number(val)||0)+'"><small>px</small></label>'
	}
	function edImageSize() {
		var im=editImage(), src=$("#edsrc")
		return { w:Math.max(1,Math.round(Number(im&&im.w)||Number(src&&src.naturalWidth)||1)), h:Math.max(1,Math.round(Number(im&&im.h)||Number(src&&src.naturalHeight)||1)) }
	}
	function normalizeEditCrop(q,w,h,key) {
		q=q||edDefaults();w=Math.max(1,Math.round(Number(w)||1));h=Math.max(1,Math.round(Number(h)||1))
		;["cl","cr","cu","cb"].forEach(function(k){var n=Number(q[k]);q[k]=Number.isFinite(n)?Math.max(0,Math.round(n)):0})
		var minW=Math.min(8,w),minH=Math.min(8,h),maxCropX=w-minW,maxCropY=h-minH
		var changeLeft=key==="cl"||String(key||"").indexOf("w")>=0,changeTop=key==="cu"||String(key||"").indexOf("n")>=0
		if(q.cl+q.cr>maxCropX){if(changeLeft)q.cl=Math.max(0,maxCropX-q.cr);else q.cr=Math.max(0,maxCropX-q.cl)}
		if(q.cu+q.cb>maxCropY){if(changeTop)q.cu=Math.max(0,maxCropY-q.cb);else q.cb=Math.max(0,maxCropY-q.cu)}
		q.cl=Math.min(q.cl,maxCropX);q.cr=Math.min(q.cr,maxCropX-q.cl);q.cu=Math.min(q.cu,maxCropY);q.cb=Math.min(q.cb,maxCropY-q.cu)
		return q
	}
	function normalizeEditGradient(q) {
		q=q||edDefaults()
		var legacyColor=/^#[0-9a-f]{6}$/i.test(String(q.gradientColor||""))?q.gradientColor:"#000000"
		var legacyOpacity=Number(q.gradientOpacity)
		if(q.gradientStartColor==null)q.gradientStartColor=legacyColor
		if(q.gradientStartOpacity==null)q.gradientStartOpacity=Number.isFinite(legacyOpacity)?legacyOpacity:60
		if(q.gradientEndColor==null)q.gradientEndColor=legacyColor
		if(q.gradientEndOpacity==null)q.gradientEndOpacity=0
		;["gradientStartColor","gradientEndColor"].forEach(function(k){if(!/^#[0-9a-f]{6}$/i.test(String(q[k]||"")))q[k]="#000000"})
		;["gradientStartOpacity","gradientEndOpacity"].forEach(function(k){var n=Number(q[k]);q[k]=Math.max(0,Math.min(100,Number.isFinite(n)?Math.round(n):0))})
		var start=Number(q.gradientStartPosition),end=Number(q.gradientEndPosition),midpoint=Number(q.gradientMidpoint)
		end=Math.max(2,Math.min(100,Number.isFinite(end)?Math.round(end):100))
		start=Math.max(0,Math.min(end-2,Number.isFinite(start)?Math.round(start):0))
		midpoint=Math.max(start+1,Math.min(end-1,Number.isFinite(midpoint)?Math.round(midpoint):Math.round((start+end)/2)))
		q.gradientStartPosition=start;q.gradientEndPosition=end;q.gradientMidpoint=midpoint
		q.effectScope=q.effectScope==="all"?"all":"content"
		q.gradientStop=q.gradientStop==="end"?"end":"start"
		return q
	}
	function editGradientRgba(color,opacity) {var rgb=editColorRgb(color),a=Math.max(0,Math.min(100,Number(opacity)||0))/100;return "rgba("+rgb.join(",")+","+a+")"}
	function editGradientMiddle(q) {var a=editColorRgb(q.gradientStartColor),b=editColorRgb(q.gradientEndColor),oa=q.gradientStartOpacity/100,ob=q.gradientEndOpacity/100;return "rgba("+[Math.round((a[0]+b[0])/2),Math.round((a[1]+b[1])/2),Math.round((a[2]+b[2])/2)].join(",")+","+((oa+ob)/2)+")"}
	function editGradientStyle(q) {normalizeEditGradient(q);var a=editGradientRgba(q.gradientStartColor,q.gradientStartOpacity),b=editGradientRgba(q.gradientEndColor,q.gradientEndOpacity);return "linear-gradient(to right,"+a+" 0%,"+a+" "+q.gradientStartPosition+"%,"+editGradientMiddle(q)+" "+q.gradientMidpoint+"%,"+b+" "+q.gradientEndPosition+"%,"+b+" 100%),linear-gradient(45deg,#bbb 25%,transparent 25%,transparent 75%,#bbb 75%),linear-gradient(45deg,#bbb 25%,#fff 25%,#fff 75%,#bbb 75%)"}
	function imgEditBlock() {
		var im = editImage()
		if (!im) return '<p class="hint">' + T("matlist.083") + '</p>'
		if (!ui.edit) ui.edit = edDefaults()
		var q = ui.edit
		var sz={w:Math.max(1,Number(im.w)||1),h:Math.max(1,Number(im.h)||1)}
		normalizeEditCrop(q,sz.w,sz.h)
		normalizeEditGradient(q)
		var gradEnd=q.gradientStop==="end",gradColor=gradEnd?q.gradientEndColor:q.gradientStartColor,gradOpacity=gradEnd?q.gradientEndOpacity:q.gradientStartOpacity
		return (
			'<div class="imgedit"><div class="imgedit-preview"><p class="hint"><b>' +
			esc(im.label) +
			"</b>" +
			(im.w ? "（" + im.w + "×" + im.h + "px）" : "") +
			T("imgedit.001") + "</p>" +
			'<h3 class="crop-title">' + T("imgedit.002") + '</h3><div class="cropstage" id="cropstage"><div class="cropmedia" id="cropmedia"><img id="edsrc" src="' + im.url + '" alt="" hidden><canvas id="edprev"></canvas><div id="cropbox" class="cropbox"><i data-crophandle="nw"></i><i data-crophandle="n"></i><i data-crophandle="ne"></i><i data-crophandle="e"></i><i data-crophandle="se"></i><i data-crophandle="s"></i><i data-crophandle="sw"></i><i data-crophandle="w"></i></div></div></div><p class="hint tiny">' + T("imgedit.003") + '</p></div><div class="imgedit-settings">' +
			'<section class="edscope-global"><label class="edselect edeffect-scope"><span>' + T("imgedit.004") + '</span><select data-ed="effectScope"><option value="content"'+(q.effectScope==='content'?' selected':'')+'>' + T("imgedit.005") + '</option><option value="all"'+(q.effectScope==='all'?' selected':'')+'>' + T("imgedit.006") + '</option></select></label><small>' + T("imgedit.007") + '</small></section><section class="edsection"><h3>' + T("imgedit.008") + '</h3><div class="edgrid">' +
			edSlider(T("imgedit.009"), "br", 20, 200, q.br, "%") +
			edSlider(T("imgedit.010"), "ct", 20, 200, q.ct, "%") +
			edSlider(T("imgedit.011"), "sa", 0, 200, q.sa, "%") +
			edSlider(T("imgedit.012"), "hue", -180, 180, q.hue, "°") +
			edSlider(T("imgedit.013"), "op", 0, 100, q.op, "%") +
			edSlider(T("imgedit.014"), "bl", 0, 20, q.bl, "px") +
			edSlider(T("imgedit.015"), "noise", 0, 100, q.noise, "%") +
			'</div></section><section class="edsection"><h3>' + T("imgedit.016") + '</h3><div class="edgrid">' +
			edSlider(T("imgedit.017"), "gray", 0, 100, q.gray, "%") +
			edSlider(T("imgedit.018"), "sepia", 0, 100, q.sepia, "%") +
			'</div><div class="edfilter-control"><label class="edcolor"><span>' + T("imgedit.019") + '</span><input type="color" data-ed="colorFilter" value="'+esc(q.colorFilter||"#3d7cff")+'"></label>' +
			edSlider(T("imgedit.020"), "colorFilterStrength", 0, 100, q.colorFilterStrength, "%") +
			'</div></section><section class="edsection edgradient"><div class="edsection-head"><h3>' + T("imgedit.021") + '</h3><label><input type="checkbox" data-ed="gradientOn"'+(q.gradientOn?' checked':'')+'> ON</label><label id="edGradientDirection" class="edselect edgradient-direction"'+(q.gradientOn?'':' hidden')+'><span>' + T("imgedit.022") + '</span><select data-ed="gradientDirection"><option value="top-bottom"'+(q.gradientDirection==='top-bottom'?' selected':'')+'>' + T("imgedit.023") + '</option><option value="bottom-top"'+(q.gradientDirection==='bottom-top'?' selected':'')+'>' + T("imgedit.024") + '</option><option value="left-right"'+(q.gradientDirection==='left-right'?' selected':'')+'>' + T("imgedit.025") + '</option><option value="right-left"'+(q.gradientDirection==='right-left'?' selected':'')+'>' + T("imgedit.026") + '</option></select></label></div><div id="edGradientSettings" class="edgradient-settings"'+(q.gradientOn?'':' hidden')+'><div class="edgradient-bar" aria-label="' + T("imgedit.027") + '"><div id="edGradientPreview" class="edgradient-preview" style="background-image:'+esc(editGradientStyle(q))+'"></div><button type="button" class="edgradient-stop start'+(gradEnd?'':' selected')+'" data-gradient-stop="start" data-gradient-position="start" style="left:'+q.gradientStartPosition+'%" aria-pressed="'+(!gradEnd)+'"><i></i><span>' + T("apng.017") + ' '+q.gradientStartPosition+'%</span></button><button type="button" class="edgradient-mid" data-gradient-position="midpoint" style="left:'+q.gradientMidpoint+'%" aria-label="' + T("imgedit.028") + ' '+q.gradientMidpoint+'%"><i></i><span>' + T("imgedit.029") + ' '+q.gradientMidpoint+'%</span></button><button type="button" class="edgradient-stop end'+(gradEnd?' selected':'')+'" data-gradient-stop="end" data-gradient-position="end" style="left:'+q.gradientEndPosition+'%" aria-pressed="'+gradEnd+'"><i></i><span>' + T("apng.018") + ' '+q.gradientEndPosition+'%</span></button></div><div class="edgradient-editor"><b id="edGradientSelected">' + T("imgedit.030")+(gradEnd?T("apng.018"):T("apng.017"))+'</b><label class="edcolor"><span>' + T("solid.002") + '</span><input type="color" data-ed="'+(gradEnd?'gradientEndColor':'gradientStartColor')+'" value="'+esc(gradColor)+'"></label>'+edSlider(T("imgedit.013"),gradEnd?"gradientEndOpacity":"gradientStartOpacity",0,100,gradOpacity,"%")+'</div></div></section>' +
			'<section class="edsection"><h3>' + T("imgedit.031") + '</h3><div class="edcrop-row">'+edNumber(T("maker.031"),"cl",sz.w-1,q.cl)+edNumber(T("maker.033"),"cr",sz.w-1,q.cr)+edNumber(T("imgedit.032"),"cu",sz.h-1,q.cu)+edNumber(T("imgedit.033"),"cb",sz.h-1,q.cb)+'</div></section>' +
			'<section class="edsection"><h3>' + T("role.other") + '</h3><div class="row"><button class="btn" id="editFlip">' + T("imgedit.034") +
			(q.flip ? T("imgedit.035") : "") +
			'</button><button class="btn" id="editRot">' + T("imgedit.036") + ' ' +
			(q.rot || 0) +
			'°）</button><button class="btn" id="editReset">' + T("imgedit.037") + '</button></div></section>' +
			'<div class="row"><label><input type="checkbox" data-ed="replace"' +
			(q.replace ? " checked" : "") +
			"> " + T("imgedit.038") + "</label></div>" +
			'<div class="row"><button class="btn pri" id="editGo">' + T("imgedit.039") + '</button><button class="btn" id="editApng">' + T("imgedit.040") + '</button></div>' +
			'<p class="hint">' + T("imgedit.041") + '</p></div></div>'
		)
	}
	function edFilter(q) {
		return (
			"brightness(" +
			(q.br == null ? 100 : q.br) +
			"%) contrast(" +
			(q.ct == null ? 100 : q.ct) +
			"%) saturate(" +
			(q.sa == null ? 100 : q.sa) +
			"%) hue-rotate(" + (q.hue || 0) + "deg) grayscale(" + (q.gray || 0) + "%) sepia(" + (q.sepia || 0) + "%) blur(" +
			(q.bl || 0) +
			"px)"
		)
	}
	function editColorRgb(value) {var m=/^#([0-9a-f]{6})$/i.exec(String(value||""));if(!m)return [0,0,0];var n=parseInt(m[1],16);return [(n>>16)&255,(n>>8)&255,n&255]}
	function editNoiseSeed(im) {var s=String(im&&im.name||im&&im.label||"image"),h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
	function applyEditOverlays(cx,cv,q,seed,region) {
		normalizeEditGradient(q)
		var area=region||{x:0,y:0,w:cv.width,h:cv.height},ax=area.x||0,ay=area.y||0,aw=Math.max(1,area.w||cv.width),ah=Math.max(1,area.h||cv.height)
		var effectComposite=q.effectScope==="all"?"source-over":"source-atop"
		var amount=Math.max(0,Math.min(100,Number(q.noise)||0))
		if(amount){var nc=document.createElement("canvas");nc.width=96;nc.height=96;var nx=nc.getContext("2d"),np=nx.createImageData(nc.width,nc.height),nd=np.data;for(var ni=0;ni<nc.width*nc.height;ni++){var x=ni%nc.width,y=Math.floor(ni/nc.width),n=(Math.imul((x+1)^seed,374761393)+Math.imul((y+1)^(seed>>>8),668265263))>>>0;n^=n>>>13;n=Math.imul(n,1274126177);var v=n>>>24,j=ni*4;nd[j]=nd[j+1]=nd[j+2]=v;nd[j+3]=255}nx.putImageData(np,0,0);cx.save();cx.beginPath();cx.rect(ax,ay,aw,ah);cx.clip();cx.translate(ax,ay);cx.globalCompositeOperation="overlay";cx.globalAlpha=amount/220;cx.fillStyle=cx.createPattern(nc,"repeat");cx.fillRect(0,0,aw,ah);cx.restore()}
		var cf=Math.max(0,Math.min(100,Number(q.colorFilterStrength)||0))/100
		if(cf){var rgb=editColorRgb(q.colorFilter);cx.save();cx.globalCompositeOperation=effectComposite;cx.fillStyle="rgba("+rgb.join(",")+","+cf+")";cx.fillRect(ax,ay,aw,ah);cx.restore()}
		if(q.gradientOn){var dir=q.gradientDirection||"top-bottom",x0=ax,y0=ay,x1=ax,y1=ay+ah,a=editGradientRgba(q.gradientStartColor,q.gradientStartOpacity),b=editGradientRgba(q.gradientEndColor,q.gradientEndOpacity);if(dir==="bottom-top"){y0=ay+ah;y1=ay}else if(dir==="left-right"){x1=ax+aw;y1=ay}else if(dir==="right-left"){x0=ax+aw;x1=ax;y1=ay}var g=cx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,a);g.addColorStop(q.gradientStartPosition/100,a);g.addColorStop(q.gradientMidpoint/100,editGradientMiddle(q));g.addColorStop(q.gradientEndPosition/100,b);g.addColorStop(1,b);cx.save();cx.globalCompositeOperation=effectComposite;cx.fillStyle=g;cx.fillRect(ax,ay,aw,ah);cx.restore()}
		var opa=Math.max(0,Math.min(100,q.op==null?100:Number(q.op)))/100
		if(opa<1){cx.save();cx.globalCompositeOperation="destination-out";cx.fillStyle="rgba(0,0,0,"+(1-opa)+")";cx.fillRect(ax,ay,aw,ah);cx.restore()}
	}
	function syncEditGradientUi() {var q=ui.edit;if(!q)return;normalizeEditGradient(q);var pv=$("#edGradientPreview");if(pv)pv.style.backgroundImage=editGradientStyle(q);all("[data-gradient-position]").forEach(function(x){var k=x.dataset.gradientPosition,pos=k==="start"?q.gradientStartPosition:k==="end"?q.gradientEndPosition:q.gradientMidpoint;x.style.left=pos+"%";var label=x.querySelector("span");if(label)label.textContent=(k==="start"?T("imgedit.042"):k==="end"?T("imgedit.043"):T("imgedit.044"))+pos+"%";if(k==="midpoint")x.setAttribute("aria-label",T("imgedit.045", pos))});all("[data-gradient-stop]").forEach(function(x){var on=x.dataset.gradientStop===q.gradientStop;x.classList.toggle("selected",on);x.setAttribute("aria-pressed",String(on))})}
	function syncEditCropUi() {var q=ui.edit,sz=edImageSize(),box=$("#cropbox");if(!q)return;normalizeEditCrop(q,sz.w,sz.h);if(box){box.style.left=(q.cl/sz.w*100)+"%";box.style.top=(q.cu/sz.h*100)+"%";box.style.width=((sz.w-q.cl-q.cr)/sz.w*100)+"%";box.style.height=((sz.h-q.cu-q.cb)/sz.h*100)+"%"};["cl","cr","cu","cb"].forEach(function(k){var x=$("[data-ed='"+k+"']");if(x)x.value=q[k]})}
	function drawEditProcessed(cx,cv,source,q,seed) {cx.clearRect(0,0,cv.width,cv.height);cx.filter=edFilter(q);cx.drawImage(source,0,0,cv.width,cv.height);cx.filter="none";applyEditOverlays(cx,cv,q,seed);if(q.effectScope!=="all"){var mask=document.createElement("canvas");mask.width=cv.width;mask.height=cv.height;var mx=mask.getContext("2d",{willReadFrequently:true});mx.drawImage(source,0,0,cv.width,cv.height);var out=cx.getImageData(0,0,cv.width,cv.height),alpha=mx.getImageData(0,0,cv.width,cv.height).data,opa=Math.max(0,Math.min(100,q.op==null?100:Number(q.op)))/100;for(var i=3;i<out.data.length;i+=4)out.data[i]=Math.round(alpha[i]*opa);cx.putImageData(out,0,0)}}
	var editPreviewFrame=0
	function applyEditPreview() {
		var cv=$("#edprev"),src=$("#edsrc"),media=$("#cropmedia"),stage=$("#cropstage");if(!cv||!src||!media||!stage||!ui.edit)return
		function draw(){if(!src.naturalWidth||!ui.edit)return;var q=ui.edit,sw=src.naturalWidth,sh=src.naturalHeight;normalizeEditCrop(q,sw,sh);var maxW=Math.max(1,stage.clientWidth-16),maxH=Math.max(1,stage.clientHeight-16),scale=Math.min(maxW/sw,maxH/sh),dw=Math.max(1,Math.round(sw*scale)),dh=Math.max(1,Math.round(sh*scale));media.style.width=dw+"px";media.style.height=dh+"px";var cap=Math.min(1,900/sw,600/sh),cw=Math.max(1,Math.round(sw*cap)),ch=Math.max(1,Math.round(sh*cap));cv.width=cw;cv.height=ch;var cx=cv.getContext("2d",{willReadFrequently:true});drawEditProcessed(cx,cv,src,q,editNoiseSeed(editImage()));cv.style.transform="rotate("+(q.rot||0)+"deg)"+(q.flip?" scaleX(-1)":"");syncEditCropUi()}
		if(editPreviewFrame)cancelAnimationFrame(editPreviewFrame);editPreviewFrame=requestAnimationFrame(draw);if(!src.complete)src.onload=draw
	}
	function initCropEditor() {
		var media=$("#cropmedia"), box=$("#cropbox"); if(!media||!box||!ui.edit)return
		box.onpointerdown=function(e){e.preventDefault();e.stopPropagation();var q=ui.edit,sz=edImageSize(),rect=media.getBoundingClientRect(),mode=e.target.dataset.crophandle||"move",sx=e.clientX,sy=e.clientY,l=q.cl||0,r=q.cr||0,t=q.cu||0,b=q.cb||0,keepW=sz.w-l-r,keepH=sz.h-t-b
			function mv(ev){var dx=(ev.clientX-sx)/Math.max(1,rect.width)*sz.w,dy=(ev.clientY-sy)/Math.max(1,rect.height)*sz.h;if(mode==="move"){q.cl=Math.round(Math.max(0,Math.min(sz.w-keepW,l+dx)));q.cu=Math.round(Math.max(0,Math.min(sz.h-keepH,t+dy)));q.cr=sz.w-keepW-q.cl;q.cb=sz.h-keepH-q.cu}else{if(mode.indexOf("w")>=0)q.cl=Math.round(l+dx);if(mode.indexOf("e")>=0)q.cr=Math.round(r-dx);if(mode.indexOf("n")>=0)q.cu=Math.round(t+dy);if(mode.indexOf("s")>=0)q.cb=Math.round(b-dy);normalizeEditCrop(q,sz.w,sz.h,mode)}syncEditCropUi()}
			function up(){window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up)}window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up)
		}
		if(window.ResizeObserver)new ResizeObserver(function(){applyEditPreview()}).observe(media.parentNode)
	}
	function initEditGradientEditor() {
		var bar=$("#edGradientPreview");if(!bar||!ui.edit)return
		all("[data-gradient-position]").forEach(function(handle){handle.onpointerdown=function(e){e.preventDefault();e.stopPropagation();var kind=handle.dataset.gradientPosition,rect=bar.getBoundingClientRect(),q=ui.edit,moved=false
			function mv(ev){var pos=Math.round((ev.clientX-rect.left)/Math.max(1,rect.width)*100);if(kind==="start")q.gradientStartPosition=Math.max(0,Math.min(q.gradientEndPosition-2,pos));else if(kind==="end")q.gradientEndPosition=Math.max(q.gradientStartPosition+2,Math.min(100,pos));else q.gradientMidpoint=Math.max(q.gradientStartPosition+1,Math.min(q.gradientEndPosition-1,pos));normalizeEditGradient(q);syncEditGradientUi();applyEditPreview();moved=true}
			function up(){window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);if(moved&&kind!=="midpoint"){q.gradientStop=kind;syncEditGradientUi()}}window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up)
		}})
	}
	async function makeEditedCanvas(im,q) {
		var src = await fetch(im.url).then(function (r) { return r.blob() }), bmp = await createImageBitmap(src)
		try {
			normalizeEditCrop(q,bmp.width,bmp.height)
			var sx = Number(q.cl) || 0, sy = Number(q.cu) || 0, sw = bmp.width - sx - (Number(q.cr) || 0), sh = bmp.height - sy - (Number(q.cb) || 0)
			if (sw < 1 || sh < 1) return null
			var rot = (((Number(q.rot) || 0) % 360) + 360) % 360, swap = rot === 90 || rot === 270
			var work = document.createElement("canvas"); work.width = bmp.width; work.height = bmp.height
			drawEditProcessed(work.getContext("2d"),work,bmp,q,editNoiseSeed(im))
			var cv = document.createElement("canvas"); cv.width = Math.max(1, Math.round(swap ? sh : sw)); cv.height = Math.max(1, Math.round(swap ? sw : sh))
			var cx = cv.getContext("2d")
			cx.translate(cv.width / 2, cv.height / 2); cx.rotate((rot * Math.PI) / 180)
			if (q.flip) cx.scale(-1, 1)
			cx.drawImage(work, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
			cx.setTransform(1,0,0,1,0,0)
			return cv
		} finally { bmp.close && bmp.close() }
	}

	async function runImgEdit(opt) {
		var im = editImage()
		if (!im) return
		var q = ui.edit || edDefaults()
		var cv = await makeEditedCanvas(im,q)
		if (!cv) return toast(T("imgedit.046"), "warn")
		var cx = cv.getContext("2d")
		// 1pxだけ不可視に近い署名を入れ、加工結果を元画像と確実に区別する
		var sg=cx.getImageData(0,0,1,1);sg.data[0]=(sg.data[0]+17)%256;cx.putImageData(sg,0,0)
		var blob = await new Promise(function (res) {
			cv.toBlob(res, "image/webp", 0.9)
		})
		if (!blob) return toast(T("imgedit.047"), "warn")
		var oldName = im.name
		var oldLabel = im.label
		var oldRoles = (im.roles || [im.role]).slice()
		var nm = oldLabel + T("imgedit.048")
		var added = await addFiles([
			new File([blob], nm + ".webp", { type: "image/webp" }),
		])
		if (!added || !added.length) {
			ui.modal = null
			render()
			return toast(T("imgedit.049"), "warn")
		}
		var ni = imageByName(added[0])
		if (ni) {
			ni.label = nm
			ni.roles = oldRoles
			ni.role = oldRoles[0]
			ni.vague = false
		}
		if (q.replace && ni) {
			replaceImageRefs(oldName, ni.name)
			ni.label = oldLabel
			state.images = state.images.filter(function (x) {
				return x.name !== oldName
			})
		}
		ui.modal = null
		var pbE = pickBack
		pickBack = null
		if (pbE && ni) {
			applyInput({
				id: pbE.id,
				dataset: pbE.dataset,
				value: ni.name,
				checked: false,
			})
		} else if (!(opt && opt.stayRoom)) {
			ui.tab = "images"
		}
		if (opt && opt.stayRoom && opt.targetId && ni && !q.replace) { var target=partById(opt.targetId); if(target) target.imageUrl=ni.name }
		render()
		toast(q.replace ? T("imgedit.050") : T("imgedit.051"), "ok")
		return ni
	}
	async function openApngFromEdit() {
		var im = editImage()
		if (!im) return
		var q = ui.edit || edDefaults()
		try {
			var cv = await makeEditedCanvas(im,q)
			if (!cv) return toast(T("imgedit.046"), "warn")
			var blob = await new Promise(function (res) { cv.toBlob(res, "image/png") })
			if (!blob) return toast(T("imgedit.052"), "warn")
			var label = String(im.label || im.originalName || T("apng.006")) + T("imgedit.053")
			openApngMaker({ kind: "edit", returnModal: "edit" }, "", { name: "", label: label, originalName: label + ".png", animated: false, w: cv.width, h: cv.height, blob: blob, url: URL.createObjectURL(blob) })
		} catch (error) {
			toast(T("imgedit.054", (error && error.message ? error.message : String(error))), "warn")
		}
	}
	// 使っているところ全部を新しい画像に付け替える
	function replaceImageRefs(oldName, newName) {
		function sw(o, k) {
			if (o && o[k] === oldName) o[k] = newName
		}
		sw(state.room, "backgroundUrl")
		sw(state.room, "foregroundUrl")
		state.baseMarkers.forEach(function (b) {
			sw(b, "imageUrl")
		})
		state.tachie.forEach(function (tc) {
			sw(tc, "imageUrl")
		})
		state.effects.forEach(function (ef) {
			sw(ef, "imageUrl")
		})
		state.characters.forEach(function (c) {
			sw(c, "iconUrl")
			sw(c, "imageUrl")
		})
		state.scenes.forEach(function (s) {
			sw(s, "backgroundUrl")
			sw(s, "foregroundUrl")
			;(s.extraMarkers || []).forEach(function (m) {
				sw(m, "imageUrl")
			})
			Object.keys(s.overrides || {}).forEach(function (k) {
				sw(s.overrides[k], "imageUrl")
			})
		})
		;(state.sceneTemplates || []).forEach(function (tp) {
			sw(tp, "backgroundUrl")
			;(tp.extraMarkers || []).forEach(function (m) {
				sw(m, "imageUrl")
			})
			Object.keys(tp.overrides || {}).forEach(function (k) {
				sw(tp.overrides[k], "imageUrl")
			})
		})
	}

	function commonZ() { return settingsBag().defaults.z }
	function roomZ() {
		var own=state.room.defaultZ||{}, common=commonZ()
		return {part:own.part!=null?Number(own.part):Number(common.part),panel:own.panel!=null?Number(own.panel):Number(common.panel),tachie:own.tachie!=null?Number(own.tachie):Number(common.tachie),effect:own.effect!=null?Number(own.effect):Number(common.effect)}
	}
	function setRoomZ(key, value) {
		if (!state.room.defaultZ) state.room.defaultZ = {}
		if (value === "") delete state.room.defaultZ[key]
		else state.room.defaultZ[key] = Number(value) || 0
		if (!Object.keys(state.room.defaultZ).length) delete state.room.defaultZ
	}
	function refreshProjectDefaultStatus(input) {
		var box=input&&input.closest?input.closest(".studio-project-defaults"):null
		if (!box) return
		var small=input.parentNode&&input.parentNode.querySelector("small")
		if (small) small.textContent=input.value===""?T("imgedit.055"):T("imgedit.056")
		var flags=box.querySelectorAll(".project-default-summary b"), hasSize=!!(state.room.creationDefaults&&Object.keys(state.room.creationDefaults).length), hasZ=!!(state.room.defaultZ&&Object.keys(state.room.defaultZ).length)
		;[[flags[0],hasZ],[flags[1],hasSize]].forEach(function(x){if(!x[0])return;x[0].textContent=x[1]?T("imgedit.057"):T("imgedit.058");x[0].className=x[1]?"custom":"shared"})
	}
	function roomCreationValue(key, fallback) {
		var own = state.room.creationDefaults
		return own && own[key] != null && own[key] !== "" ? Number(own[key]) : Number(fallback)
	}
	function roomPartDefault() { return roomCreationValue("part", settingsBag().defaults.part || 4) || 4 }
	function roomPanelDefault() { return roomCreationValue("panelW", settingsBag().defaults.panelW || 0) || 0 }
	function roomTachieDefault() { return roomCreationValue("tachieH", settingsBag().defaults.tachieH || 18) || 18 }
	function roomSelected() {
		if (!Array.isArray(ui.roomSel)) ui.roomSel=[]
		return ui.roomSel.map(partById).filter(function(x){return !!x})
	}
	function roomQuickLeave(){
		if(!ui.roomQuick||!ui.roomQuick.dirty)return true
		if(confirm(T("imgedit.059"))){ui.roomQuick=null;return true}
		return false
	}
	function quickDefaults(id){var b=partById(id),q=edDefaults();q.replace=false;return {id:id,mode:"",q:q,dirty:false}}
	function roomQuickBar(one){
		var r=ui.roomQuick;if(!one||!one.imageUrl)return ''
		if(!r||r.id!==one.id||!r.mode)return '<span class="rd-div"></span><button class="btn" data-roomquick="crop">' + T("imgedit.060") + '</button><button class="btn" data-roomquick="opacity">' + T("imgedit.061") + '</button><button class="btn" data-roomquick="flip">' + T("imgedit.034") + '</button><button class="btn" data-roomquick="full">' + T("imgedit.062") + '</button>'
		var q=r.q,h='<div class="rd-quick"><b>'+(r.mode==='crop'?T("imgedit.060"):r.mode==='opacity'?T("imgedit.013"):T("imgedit.034"))+'</b>'
		if(r.mode==='crop') h+='<span class="rq-help">' + T("imgedit.063") + '</span><label>' + T("maker.031") + ' <input type="range" min="0" max="45" value="'+q.cl+'" data-rq="cl"></label><label>' + T("maker.033") + ' <input type="range" min="0" max="45" value="'+q.cr+'" data-rq="cr"></label><label>' + T("imgedit.032") + ' <input type="range" min="0" max="45" value="'+q.cu+'" data-rq="cu"></label><label>' + T("imgedit.033") + ' <input type="range" min="0" max="45" value="'+q.cb+'" data-rq="cb"></label>'
		if(r.mode==='opacity') h+='<label>' + T("imgedit.013") + ' <input type="range" min="0" max="100" value="'+q.op+'" data-rq="op"><span>'+q.op+'%</span></label>'
		if(r.mode==='flip') h+='<label><input type="checkbox" data-rq="flip"'+(q.flip?' checked':'')+'> ' + T("imgedit.064") + '</label>'
		h+='<label><input type="checkbox" data-rq="replace"'+(q.replace?' checked':'')+'> ' + T("imgedit.065") + '</label><button class="btn pri" data-rqapply="1">' + T("imgedit.066") + '</button><button class="x" data-rqcancel="1">' + T("imgedit.067") + '</button></div>'
		return h
	}
	function roomToolPalette() {
		var a=roomSelected(), one=a.length===1?a[0]:null
		if(!a.length) return '<div class="rd-palette empty"><span>' + T("imgedit.068") + '</span></div>'
		var h='<div class="rd-palette"><b>'+a.length+T("imgedit.069") + '</b>'
		if(one) h+='<button class="btn" data-roomdetail="'+one.id+'">' + T("home.093") + '</button>'+roomQuickBar(one)
		if(a.length>1) h+='<span class="rd-div"></span><button class="x" data-roomalign="left">' + T("maker.031") + '</button><button class="x" data-roomalign="cx">' + T("imgedit.070") + '</button><button class="x" data-roomalign="right">' + T("maker.033") + '</button><button class="x" data-roomalign="top">' + T("imgedit.032") + '</button><button class="x" data-roomalign="cy">' + T("imgedit.071") + '</button><button class="x" data-roomalign="bottom">' + T("imgedit.033") + '</button><button class="x" data-roomalign="distx">' + T("imgedit.072") + '</button><button class="x" data-roomalign="disty">' + T("imgedit.073") + '</button><button class="x" data-roomscale="0.9">' + T("imgedit.074") + '</button><button class="x" data-roomscale="1.1">' + T("imgedit.075") + '</button>'
		return h+'<button class="x" data-roomclear="1" title="' + T("imgedit.076") + '">×</button></div>'
	}
	function roomPlaceholders(){
		if(!Array.isArray(state.room.previewTachie)||!state.room.previewTachie.length) state.room.previewTachie=[{id:"ph"+uid(),x:tachieDefaultX(),y:tachieY({heightM:Number(state.room.tachieHeight)||18,dy:0}),height:Number(state.room.tachieHeight)||18,locked:false}]
		return state.room.previewTachie
	}
	function layoutRoomPlaceholders(){
		var list=roomPlaceholders()
		if(list.length<2)return
		var markers=list.map(function(ph){var h=Number(ph.height)||Number(state.room.tachieHeight)||18;return {kind:"tachie",width:Math.max(5,Math.round(h*.42*2)/2)}})
		layoutTachie({extraMarkers:markers})
		list.forEach(function(ph,i){ph.x=markers[i].x})
	}
	function roomLayerRows() {
		if(ui.roomLayers===false) return ''
		var list=state.baseMarkers.slice().sort(function(a,b){return (Number(b.z)||0)-(Number(a.z)||0)})
		var h='<aside class="rd-layers"><div class="rd-layer-head"><b>' + T("maker.064") + '</b><span>' + T("imgedit.077") + '</span></div><div class="lyrs">'
		list.forEach(function(b){var sel=(ui.roomSel||[]).indexOf(b.id)>=0,locked=!!b.lockMove;h+='<div class="lyr rd-layer'+(sel?' sel':'')+'" data-roomlayer="'+b.id+'"><span class="pname">'+(partsRole(b)==='panel'?'🪟 ':'🧩 ')+esc(b.name||T("import.006"))+'</span><span class="layer-actions"><button class="x lockbig'+(locked?' on':'')+'" data-rl-act="lock" data-rl-id="'+b.id+'" title="'+(locked?T("imgedit.078"):T("imgedit.079"))+'">'+(locked?T("imgedit.080"):T("imgedit.081"))+'</button><button class="x" data-rl-act="visible" data-rl-id="'+b.id+'" title="'+(b.visible===false?T("imgedit.082"):T("imgedit.083"))+'">'+(b.visible===false?'🚫':'👁')+'</button></span><label class="rl-z" title="' + T("imgedit.084") + '"><span>' + T("imgedit.085") + '</span><input type="number" data-rl-z="'+b.id+'" value="'+(Number(b.z)||0)+'"></label></div>'})
		roomPlaceholders().forEach(function(ph,i){h+='<div class="lyr rd-layer phrow'+(ui.roomPhSel===ph.id?' sel':'')+'" data-roomphlayer="'+ph.id+'"><span class="pname">' + T("imgedit.086") + ' '+(i+1)+'</span><span class="layer-actions"><button class="x lockbig'+(ph.locked?' on':'')+'" data-phlock="'+ph.id+'" title="'+(ph.locked?T("imgedit.078"):T("imgedit.087"))+'">'+(ph.locked?T("imgedit.080"):T("imgedit.081"))+'</button><button class="x kill" data-phdel="'+ph.id+'" title="' + T("imgedit.088") + '">×</button></span></div>'})
		h+='<div class="lyr fixed"><span class="pname">' + T("imgedit.089") + '</span><small>' + T("imgedit.090") + '</small></div></div></aside>';return h
	}
	function roomStudioPreview() {
		var set=settingsBag(), z=Math.round((Number(ui.roomZoom)||.82)*100)
		return '<div class="rd-toolbar"><div class="rd-zoom"><button class="x" data-roomzoom="-">−</button><b>'+z+'%</b><button class="x" data-roomzoom="+">＋</button><button class="btn" data-roomzoom="fit">' + T("imgedit.091") + '</button></div><label><input type="checkbox" data-roomguide="1"'+(set.guides!==false?' checked':'')+'> ' + T("imgedit.092") + '</label><input type="color" id="pvGuideColor" value="'+esc(set.guideColor||'#7cc5ff')+'"><label><input type="checkbox" data-roomlayers="1"'+(ui.roomLayers!==false?' checked':'')+'> ' + T("maker.064") + '</label><label><input type="checkbox" data-roomreal="1"'+(ui.roomRealistic?' checked':'')+'> ' + T("imgedit.093") + '</label><span class="rd-panhelp">' + T("imgedit.094") + '</span><details class="room-shortcuts"><summary>' + T("imgedit.095") + '</summary><div><b>' + T("imgedit.096") + '</b><span>' + T("matlist.016") + ' <kbd>' + T("imgedit.097") + '</kbd></span><span>Shift / '+(/Mac|iPhone|iPad/.test(navigator.platform||'')?'⌘':'Ctrl')+T("imgedit.098") + ' <kbd>' + T("imgedit.099") + '</kbd></span><span>' + T("imgedit.100") + ' <kbd>' + T("imgedit.101") + '</kbd></span><span>' + T("imgedit.102") + ' <kbd>' + T("imgedit.103") + '</kbd></span><span>' + T("imgedit.104") + ' <kbd>' + T("imgedit.105") + '</kbd></span><span>' + T("imgedit.106") + ' <kbd>' + T("imgedit.107") + '</kbd></span><b>' + T("imgedit.108") + '</b><span>' + T("imgedit.109") + ' <kbd>'+keyLabel(keyBag().partEdit)+'</kbd></span><span>' + T("imgedit.110") + ' <kbd>'+keyLabel(keyBag().partLock)+'</kbd></span><span>' + T("imgedit.111") + ' <kbd>'+keyLabel(keyBag().partVisible)+'</kbd></span><b>' + T("imgedit.112") + '</b><span>' + T("imgedit.113") + ' <kbd>' + T("imgedit.114") + '</kbd></span></div></details></div><div class="rd-work'+(ui.roomRealistic?' realistic':'')+(ui.roomLayers===false?' no-layers':'')+'"><div class="rd-main">'+panePreview()+'<div id="roomToolPalette">'+roomToolPalette()+'</div></div>'+roomLayerRows()+'</div>'
	}
	function refreshRoomStudioPreview() {
		var preview = $("#roomStudioPreview")
		if (!preview) return
		preview.innerHTML = roomStudioPreview()
		bindPreviewDrag()
	}
	function roomAlign(kind){
		var a=roomSelected(); if(a.length<2)return
		var left=Math.min.apply(null,a.map(function(b){return b.x-b.width/2})),right=Math.max.apply(null,a.map(function(b){return b.x+b.width/2})),top=Math.min.apply(null,a.map(function(b){return b.y-b.height/2})),bottom=Math.max.apply(null,a.map(function(b){return b.y+b.height/2}))
		if(kind==='left')a.forEach(function(b){b.x=left+b.width/2});if(kind==='right')a.forEach(function(b){b.x=right-b.width/2});if(kind==='cx')a.forEach(function(b){b.x=(left+right)/2});if(kind==='top')a.forEach(function(b){b.y=top+b.height/2});if(kind==='bottom')a.forEach(function(b){b.y=bottom-b.height/2});if(kind==='cy')a.forEach(function(b){b.y=(top+bottom)/2})
		if(kind==='distx'){a.sort(function(x,y){return x.x-y.x});var d=(a[a.length-1].x-a[0].x)/(a.length-1);a.forEach(function(b,i){b.x=snapHalf(a[0].x+d*i)})}
		if(kind==='disty'){a.sort(function(x,y){return x.y-y.y});var d2=(a[a.length-1].y-a[0].y)/(a.length-1);a.forEach(function(b,i){b.y=snapHalf(a[0].y+d2*i)})}
		render()
	}
	function roomScale(f){var a=roomSelected();if(!a.length)return;var cx=a.reduce(function(n,b){return n+b.x},0)/a.length,cy=a.reduce(function(n,b){return n+b.y},0)/a.length;a.forEach(function(b){b.x=snapHalf(cx+(b.x-cx)*f);b.y=snapHalf(cy+(b.y-cy)*f);b.width=Math.max(.5,snapHalf(b.width*f));b.height=Math.max(.5,snapHalf(b.height*f))});render()}
	function viewRoom() {
		var markerCount=partsList("part").length,panelCount=partsList("panel").length,mode=tachieAlignMode(),lineName=mode==='top'?T("room.001"):mode==='center'?T("room.002"):T("room.003"),ownSize=state.room.creationDefaults||{},ownZ=state.room.defaultZ||{},common=settingsBag().defaults,hasOwnSize=Object.keys(ownSize).length>0,hasOwnZ=Object.keys(ownZ).length>0
		return '<div class="room-studio"><aside class="room-controls"><div class="studio-head"><span class="eyebrow">ROOM DESIGN</span><h1>' + T("render.019") + '</h1><p>' + T("room.004") + '</p></div>'+
		'<section class="studio-panel"><h2>' + T("room.005") + '</h2><label>' + T("maker.068") + '<button type="button" class="studio-name" id="studioProjectName">'+esc(state.project)+' <span>✎</span></button></label><div class="studio-presets"><button class="chip" data-roomsize="40,30">' + T("room.006") + '</button><button class="chip" data-roomsize="37,17">' + T("room.007") + '</button><button class="chip" data-roomsize="32,18">16:9 32×18</button></div><div class="studio-nums"><label>' + T("maker.041") + '<input type="number" id="fw" value="'+state.room.fieldWidth+'"></label><label>' + T("maker.042") + '<input type="number" id="fh" value="'+state.room.fieldHeight+'"></label></div></section>'+
		'<section class="studio-panel"><h2>' + T("room.008") + '</h2><div class="studio-bgfg-grid"><label>' + roleName("背景") + ' '+imgSelect(state.room.backgroundUrl,'id="roomBg"')+'</label><label>' + roleName("前景") + ' '+imgSelect(state.room.foregroundUrl,'id="roomFg"')+'</label></div></section>'+
		'<section class="studio-panel studio-tachie-settings"><h2>' + roleName("立ち絵") + '</h2><div class="tachie-open"><label>' + T("room.009") + '<select id="tAlignMode"><option value="bottom"'+(mode==='bottom'?' selected':'')+'>' + T("maker.018") + '</option><option value="top"'+(mode==='top'?' selected':'')+'>' + T("maker.017") + '</option><option value="center"'+(mode==='center'?' selected':'')+'>' + T("maker.015") + '</option><option value="position"'+(mode==='position'?' selected':'')+'>' + T("room.010") + '</option></select></label><div class="studio-nums tachie-nums tachie-nums-'+mode+'"><label>'+lineName+'<input type="number" step="0.5" id="tBottom" value="'+tachieBottomLine()+'"></label><label>' + T("room.011") + '<input type="number" step="0.5" id="tHeight" value="'+(state.room.tachieHeight||18)+'"></label>'+(mode==='position'?'<label>' + T("room.012") + '<input type="number" step="0.5" id="tPosition" value="'+tachieDefaultX()+'"></label>':'')+'<label>' + T("room.013") + '<input type="number" step="0.5" id="tcGapRoom" value="'+(settingsBag().tachieGap||0)+'"></label></div><div class="row"><button class="btn" data-addroomph="1">' + T("room.014") + '</button><span class="hint">' + T("room.015") + '</span></div></div></section>'+
		'<section class="studio-panel studio-project-defaults"><h2>' + T("room.016") + '</h2><div class="project-default-summary"><div><span>' + T("imgedit.085") + '</span><b class="'+(hasOwnZ?'custom':'shared')+'">'+(hasOwnZ?T("imgedit.057"):T("imgedit.058"))+'</b></div><div><span>' + T("matlist.084") + '</span><b class="'+(hasOwnSize?'custom':'shared')+'">'+(hasOwnSize?T("imgedit.057"):T("imgedit.058"))+'</b></div></div><details class="project-default-editor"><summary class="btn">' + T("room.017") + '</summary><div class="project-default-body"><fieldset class="project-size-defaults"><legend>' + T("matlist.084") + '</legend><label>' + T("home.096") + '<input type="number" step="0.5" id="roomDefPart" value="'+esc(ownSize.part!=null?ownSize.part:'')+'" placeholder="' + T("room.018") + ' '+(common.part||4)+'"><small>'+(ownSize.part!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><label>' + T("home.070") + '<input type="number" step="0.5" id="roomDefPanelW" value="'+esc(ownSize.panelW!=null?ownSize.panelW:'')+'" placeholder="' + T("room.018") + ' '+(common.panelW||0)+'"><small>'+(ownSize.panelW!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><label>' + roleName("立ち絵") + '<input type="number" step="0.5" id="roomDefTachieH" value="'+esc(ownSize.tachieH!=null?ownSize.tachieH:'')+'" placeholder="' + T("room.018") + ' '+(common.tachieH||18)+'"><small>'+(ownSize.tachieH!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><p>' + T("room.019") + '</p></fieldset><fieldset class="project-z-defaults"><legend>' + T("imgedit.085") + '</legend><label>' + T("home.096") + '<input type="number" id="roomZPart" value="'+esc(ownZ.part!=null?ownZ.part:'')+'" placeholder="' + T("room.018") + ' '+common.z.part+'"><small>'+(ownZ.part!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><label>' + T("home.047") + '<input type="number" id="roomZPanel" value="'+esc(ownZ.panel!=null?ownZ.panel:'')+'" placeholder="' + T("room.018") + ' '+common.z.panel+'"><small>'+(ownZ.panel!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><label>' + roleName("立ち絵") + '<input type="number" id="roomZTachie" value="'+esc(ownZ.tachie!=null?ownZ.tachie:'')+'" placeholder="' + T("room.018") + ' '+common.z.tachie+'"><small>'+(ownZ.tachie!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><label>' + roleName("演出") + '<input type="number" id="roomZEffect" value="'+esc(ownZ.effect!=null?ownZ.effect:'')+'" placeholder="' + T("room.018") + ' '+common.z.effect+'"><small>'+(ownZ.effect!=null?T("imgedit.056"):T("imgedit.055"))+'</small></label><p>' + T("room.020") + '</p></fieldset></div></details></section></aside>'+
		'<main class="room-canvas"><div class="room-canvas-bar"><div><span class="eyebrow">PREVIEW</span><h1>' + T("room.021") + '</h1><span>'+state.room.fieldWidth+' × '+state.room.fieldHeight+T("room.022") + '</span></div></div><div id="roomStudioPreview">'+roomStudioPreview()+'</div></main></div>'+
		'<section class="room-parts-integrated" id="roomPartsIntegrated"><div class="room-parts-title"><span class="eyebrow">PARTS</span><h2>' + T("room.023") + '</h2><p>' + T("room.024") + '</p></div><div class="room-part-kind"><section><div class="kind-head"><h3>' + T("room.025") + '</h3><span>'+markerCount+T("home.025") + '</span></div>'+partsView("part")+'</section><section><div class="kind-head"><h3>' + T("room.026") + '</h3><span>'+panelCount+T("home.025") + '</span></div>'+partsView("panel")+'</section></div></section>'
	}

	function numField(label, id, key, val) {
		return (
			"<label>" +
			label +
			' <input type="number" step="0.5" data-part="' +
			key +
			'" data-id="' +
			id +
			'" value="' +
			val +
			'"></label>'
		)
	}

	function scopeSelect(b) {
		var sc = b.scope === "scene"
		return (
			'<label>' + T("room.027") + ' <select class="w2" data-part="scope" data-id="' +
			b.id +
			'"><option value="room"' +
			(sc ? "" : " selected") +
			'>' + T("room.028") + '</option><option value="scene"' +
			(sc ? " selected" : "") +
			'>' + T("room.029") + '</option></select></label>'
		)
	}

	// このパーツを「このシーンだけ別の位置」にしているシーンの数
	function ovPosCount(id) {
		var n = 0
		state.scenes.forEach(function (s) {
			var ov = s.overrides && s.overrides[id]
			if (ov && (ov.x != null || ov.y != null)) n++
		})
		return n
	}
	function clearOvPos(id) {
		var n = 0
		state.scenes.forEach(function (s) {
			var ov = s.overrides && s.overrides[id]
			if (!ov) return
			if (ov.x != null || ov.y != null) n++
			delete ov.x
			delete ov.y
			if (!Object.keys(ov).length) delete s.overrides[id]
		})
		render()
		toast(
			n ? n + T("room.030") : T("room.031"),
			n ? "ok" : "warn",
		)
	}

	function partsRole(b) {
		return b.role === "panel" ? "panel" : "part"
	}
	function partsList(role) {
		return state.baseMarkers.filter(function (b) {
			return partsRole(b) === role
		})
	}

	function partsView(role) {
		var isPanel = role === "panel"
		var list = partsList(role)
		var h = '<div class="card"><div class="row part-add-tools">' +
			(isPanel
				? '<button class="btn pri" id="addPanel">' + T("room.032") + '</button>'
				: '<button class="btn pri" id="addPart">' + T("room.033") + '</button>' +
					'<button class="btn" id="addTachie">' + T("room.034") + '</button>') +
			'<button class="btn" data-frommat="' +
			role +
			'">' + T("room.035") + '</button><button class="btn" data-parttplopen="1">' + T("room.036") + '</button>' +
			"</div>" +
			mdropZone(role)
		if (!list.length) h += '<p class="hint">' + T("room.037") + '</p>'
		list.forEach(function (b) {
			var vis = b.visible !== false
			var im = b.imageUrl ? imageByName(b.imageUrl) : null
			var imageMeta = im ? (im.label || im.originalName || im.name) + (im.w && im.h ? " ・ " + im.w + "×" + im.h + "px" : "") : T("room.038")
			h +=
				'<div class="block' +
				(vis ? "" : " off") +
				'" data-part-card="' + b.id + '"><div class="row part-main-row">' +
				'<label class="lockchip' +
				(vis ? " on" : "") +
				'" title="' + T("room.039") + '"><input type="checkbox" data-part="visible" data-id="' +
				b.id +
				'"' +
				(vis ? " checked" : "") +
				"> " + T("imgedit.082") + "</label>" +
				'<input class="w2" data-part="name" data-id="' +
				b.id +
				'" value="' +
				esc(b.name) +
				'" placeholder="' +
				(isPanel ? T("room.040") : T("room.041")) +
				'">' +
				'<button class="x" title="' + T("room.042") + '" data-partup="' +
				b.id +
				'">↑</button><button class="x" title="' + T("room.043") + '" data-partdown="' +
				b.id +
				'">↓</button>' +
				'<button class="x" data-partmove="' +
				b.id +
				'" title="' +
				(isPanel ? T("room.044") : T("room.045")) +
				'">' +
				(isPanel ? "→🧩" : "→🪟") +
				"</button>" +
				'<button class="x" data-duppart="' +
				b.id +
				'" title="' + T("room.046") + '">' + T("maker.050") + '</button>' +
				'<button class="x" data-delpart="' +
				b.id +
				'">' + T("home.094") + '</button></div>' +
				'<div class="part-edit-grid"><div class="part-visual">' +
				imgSelect(b.imageUrl, 'data-part="imageUrl" data-id="' + b.id + '"') +
				'<small title="'+esc(imageMeta)+'">'+esc(imageMeta)+'</small><div class="part-visual-state">' +
				lockChip('data-part="lockAspect" data-id="' + b.id + '"', b.lockAspect !== false) +
				'<label class="lockchip' + (b.lockMove ? " on" : "") + '" title="' + T("room.047") + '"><input type="checkbox" data-part="lockMove" data-id="' + b.id + '"' + (b.lockMove ? " checked" : "") + '> ' + T("maker.047") + '</label></div></div><div class="part-placement"><div class="row nums">' +
				numField(T("room.048"), b.id, "x", b.x) +
				numField(T("room.049"), b.id, "y", b.y) +
				numField(T("imgedit.085"), b.id, "z", b.z) +
				numField(T("maker.041"), b.id, "width", b.width) +
				numField(T("maker.042"), b.id, "height", b.height) +
				'</div>' +
				'<details class="part-details"><summary>' + T("room.050") + '</summary><div class="part-detail-body"><button class="btn part-template-save" data-parttplsave="'+b.id+'">' + T("room.051") + '</button><label class="part-board-text">' + T("room.052") + '<textarea rows="3" data-part="text" data-id="' +
				b.id +
				'" placeholder="' + T("room.053") + '">' + esc(b.text || "") + '</textarea></label><p class="part-detail-note">' + sceneUseNote(b) + '</p></div></details></div></div></div>'
		})
		h += '<p class="hint part-footnote">' + T("room.054") + '</p></div>'
		return h
	}
	/* ---------------- 盤面とベース（部屋デザインの先頭） ---------------- */
	/* 切語言時要跟著變，所以不在載入時就算好 */
	function fSizes() {
		return [
			{ w: 37, h: 17, n: T("board.001") },
			{ w: 37, h: 15.5, n: T("board.002") },
			{ w: 30, h: 17, n: T("board.003") },
			{ w: 44, h: 20, n: T("board.004") },
		]
	}
	function fgAspect() {
		var im = state.room.foregroundUrl
			? imageByName(state.room.foregroundUrl)
			: null
		return im && im.w && im.h ? im.w / im.h : null
	}
	function ratioNote() {
		var fa = fgAspect()
		if (!fa) return '<p class="hint">' + T("board.005") + '</p>'
		var ba = state.room.fieldWidth / state.room.fieldHeight
		var dif = Math.abs(ba - fa) / fa
		var txt =
			T("board.006", fa.toFixed(2), ba.toFixed(2))
		if (dif < 0.015)
			return '<p class="good">' + txt + T("board.007") + "</p>"
		var hh = Math.round((state.room.fieldWidth / fa) * 2) / 2
		return (
			'<p class="hint">⚠️ ' +
			txt +
			T("board.008") +
			(ba > fa ? T("board.009") : T("board.010")) +
			T("board.011") + " " +
			hh +
			T("board.012") + "</p>"
		)
	}
	function roomBaseCard() {
		var fa = fgAspect()
		return (
			'<div class="card"><h2>' + T("board.013") + '<span class="sub">' + T("board.014") + '</span></h2>' +
			'<div class="chips"><span class="hint">' + T("board.015") + '</span>' +
			fSizes().map(function (o) {
				var on =
					Number(state.room.fieldWidth) === o.w &&
					Number(state.room.fieldHeight) === o.h
				return (
					'<span class="chip' +
					(on ? " on" : "") +
					'" data-fsize="' +
					o.w +
					"x" +
					o.h +
					'">' +
					o.n +
					"</span>"
				)
			}).join("") +
			(fa
				? '<span class="chip" id="fitFg">' + T("board.016") + '</span>'
				: "") +
			"</div>" +
			'<div class="row"><label>' + T("board.017") + ' <input type="number" class="w1" id="fw" value="' +
			state.room.fieldWidth +
			'" min="5" max="200"> ' + T("room.022") + '</label>' +
			'<label>' + T("maker.042") + ' <input type="number" step="0.5" class="w1" id="fh" value="' +
			state.room.fieldHeight +
			'" min="5" max="200"> ' + T("room.022") + '</label>' +
			'<label class="lockchip' +
			(state.room.displayGrid ? " on" : "") +
			'"><input type="checkbox" id="grid"' +
			(state.room.displayGrid ? " checked" : "") +
			"> " + T("board.018") + "</label></div>" +
			ratioNote() +
			'<div class="row"><label>' + T("board.019") + ' ' +
			imgSelect(state.room.backgroundUrl, 'id="roomBg"') +
			"</label>" +
			"<label>" + T("board.020") + " " +
			imgSelect(state.room.foregroundUrl, 'id="roomFg"') +
			"</label></div>" +
			'<p class="hint">' + T("board.021") + '</p></div>'
		)
	}
	// スクリーンパネルの既定サイズ（前景より3マス小さめ）
	function panelDefW(role) {
		if (role !== "panel") return 0
		var w = roomPanelDefault()
		if (!w) w = Math.max(4, snapHalf(state.room.fieldWidth - 3))
		return w
	}
	function panelDefH(role) {
		if (role !== "panel") return 0
		var a = fgAspect() || state.room.fieldWidth / state.room.fieldHeight
		return Math.max(2, snapHalf(panelDefW(role) / a))
	}

	// 書き出しのときだけ入れる、からっぽの演出置き場（NOIMAGE）
	function noimageMarkers() {
		var st = settingsBag()
		if (!st.noimage) return []
		var n = Math.max(1, Math.min(3, Number(st.noimageCount) || 1))
		var out = []
		for (var i = 0; i < n; i++)
			out.push({
				id: C.newId(),
				name: "NOIMAGE" + (n > 1 ? i + 1 : ""),
				imageUrl: null,
				text: "",
				x: 0,
				y: 0,
				width: state.room.fieldWidth,
				height: state.room.fieldHeight,
				z: (Number(st.noimageZ) || 45) + i,
			})
		return out
	}
	function noimageCard(st) {
		return (
			'<div class="card"><h2>' + T("board.022") + '<span class="sub">' + T("board.023") + '</span></h2>' +
			'<div class="row"><label class="lockchip' +
			(st.noimage ? " on" : "") +
			'"><input type="checkbox" id="setNoimg"' +
			(st.noimage ? " checked" : "") +
			'> ' + T("board.024") + '</label>' +
			'<label>' + T("board.025") + ' <input type="number" min="1" max="3" class="w1" id="setNoimgN" value="' +
			(st.noimageCount || 1) +
			'"></label>' +
			'<label>' + T("imgedit.085") + ' <input type="number" class="w1" id="setNoimgZ" value="' +
			(st.noimageZ || 45) +
			'"></label></div>' +
			'<p class="hint">' + T("board.026") + '</p></div>'
		)
	}

	// 演出プリセット
	function emPresetLayoutEntries(st) {
		st = st || settingsBag()
		var entries = Array.isArray(st.emPresetLayout) ? st.emPresetLayout : []
		return entries.map(function (entry) {
			if (entry && entry.type === "separator") return entry
			return entry && { type: "preset", id: entry.id, preset: emPresetById(entry.id) }
		}).filter(function (entry) { return entry && (entry.type === "separator" || !!entry.preset) })
	}
	function emPresetOptionHtml(st) {
		return emPresetLayoutEntries(st).map(function (entry) {
			if (entry.type === "separator") return '<option value="separator:' + esc(entry.id) + '" disabled>----- ' + esc(entry.label || T("board.027")) + ' -----</option>'
			return '<option value="preset:' + esc(entry.id) + '">☆ ' + esc(entry.preset.name || T("board.028")) + '</option>'
		}).join("")
	}
	function emPresetSetField(id, key, value, checked) {
		var p = emPresetById(id)
		if (!p) return
		if (key === "name") {
			var nextName = String(value == null ? "" : value).trim()
			if ((settingsBag().emPresets || []).some(function (other) { return other !== p && String(other.name || "").trim() === nextName }))
				if (!confirm(T("board.029"))) return
		}
		var before = emPresetStateClone()
		if (key === "fullFit") p.fullFit = value === "cover" || value === "contain" ? value : "stretch"
		else if (key === "kind") p.kind = value === "full" ? "full" : "free"
		else if (["z", "width", "height"].indexOf(key) >= 0) p[key] = Number(value) || 0
		else p[key] = String(value == null ? "" : value)
		normalizeEmPresetSettings()
		persistAppSettings()
		emPresetHistory(before, emPresetStateClone())
		render()
	}
	function emPresetSetImage(id, imageUrl) {
		var p = emPresetById(id)
		if (!p) return
		var before = emPresetStateClone(), im = imageByName(imageUrl)
		p.imageUrl = imageUrl || null
		p.imageName = im ? (im.originalName || im.label || im.name) : (imageUrl || "")
		persistAppSettings()
		var mediaSave = p.imageUrl ? saveEffectPresetImage(p.imageUrl) : Promise.resolve()
		emPresetHistory(before, emPresetStateClone())
		render()
		return mediaSave
	}
	function emPresetSetSeparator(id, label) {
		var st = settingsBag(), item = (st.emPresetLayout || []).find(function (x) { return x.type === "separator" && x.id === id })
		if (!item) return
		var before = emPresetStateClone()
		item.label = String(label == null ? "" : label)
		persistAppSettings()
		emPresetHistory(before, emPresetStateClone())
		render()
	}
	function emPresetAddFromValues(name, imageUrl, kind, z, width, height, fullFit, text) {
		var st = settingsBag(), nm = String(name || roleName("演出")).trim() || roleName("演出")
		if ((st.emPresets || []).some(function (p) { return String(p.name || "").trim() === nm }))
			if (!confirm(T("board.030"))) return null
		var before = emPresetStateClone(), p = { id: C.newId(), name: nm, imageUrl: imageUrl || null, imageName: emPresetImageName({ imageUrl: imageUrl || null }), kind: kind === "full" ? "full" : "free", z: z == null ? 40 : z, width: width == null ? 6 : width, height: height == null ? 6 : height }
		if (fullFit) p.fullFit = fullFit
		p.text = String(text == null ? "" : text)
		st.emPresets.unshift(p)
		st.emPresetLayout.unshift({ type: "preset", id: p.id })
		normalizeEmPresetSettings()
		persistAppSettings()
		if (p.imageUrl) saveEffectPresetImage(p.imageUrl)
		emPresetHistory(before, emPresetStateClone())
		return p
	}
	function emPresetDelete(id) {
		var st = settingsBag(), at = (st.emPresets || []).findIndex(function (p) { return p && p.id === id })
		if (at < 0) return
		if (!confirm(T("board.031"))) return
		var before = emPresetStateClone()
		st.emPresets.splice(at, 1)
		st.emPresetLayout = (st.emPresetLayout || []).filter(function (entry) { return entry.type !== "preset" || entry.id !== id })
		normalizeEmPresetSettings()
		persistAppSettings()
		emPresetHistory(before, emPresetStateClone())
		render()
	}
	function emSeparatorAdd(label) {
		var nm = String(label || "").trim()
		if (!nm) return toast(T("board.032"), "warn")
		var before = emPresetStateClone(), st = settingsBag(), id = C.newId()
		st.emPresetLayout.push({ type: "separator", id: id, label: nm })
		persistAppSettings()
		emPresetHistory(before, emPresetStateClone())
		ui.emPresetHighlightId = id
		render()
		setTimeout(function () {
			var row = document.querySelector('[data-empdrag="' + id + '"]')
			if (row && row.scrollIntoView) row.scrollIntoView({ behavior: "smooth", block: "nearest" })
			if (row) row.classList.add("em-preset-new")
			setTimeout(function () { if (row) row.classList.remove("em-preset-new"); if (ui.emPresetHighlightId === id) ui.emPresetHighlightId = null }, 1800)
		}, 0)
	}
	function emSeparatorDelete(id) {
		var st = settingsBag(), before = emPresetStateClone()
		st.emPresetLayout = (st.emPresetLayout || []).filter(function (entry) { return entry.type !== "separator" || entry.id !== id })
		persistAppSettings()
		emPresetHistory(before, emPresetStateClone())
		render()
	}
	function emPresetMoveBefore(sourceId, targetId) {
		var st = settingsBag(), list = st.emPresetLayout || [], to = list.findIndex(function (x) { return x.id === targetId })
		if (to < 0) return
		return emPresetMoveToIndex(sourceId, to)
	}
	function emPresetMoveToIndex(sourceId, targetIndex) {
		var st = settingsBag(), list = st.emPresetLayout || [], from = list.findIndex(function (x) { return x.id === sourceId })
		if (from < 0) return
		var before = emPresetStateClone(), item = list.splice(from, 1)[0]
		var to = Number(targetIndex) || 0
		if (from < to) to--
		to = Math.max(0, Math.min(list.length, to))
		list.splice(to, 0, item)
		persistAppSettings()
		emPresetHistory(before, emPresetStateClone())
		render()
	}
	function emPresetMatch(marker) {
		if (!marker) return null
		var kind = marker.kind === "full" ? "full" : "free", ps = emPresetLayoutEntries(settingsBag())
		for (var i = 0; i < ps.length; i++) {
			var p = ps[i].preset
			if (!p || String(p.name || "") !== String(marker.name || "") || String(p.imageUrl || "") !== String(marker.imageUrl || "") || String(p.text || "") !== String(marker.text || "") || (p.kind === "full" ? "full" : "free") !== kind) continue
			if (Number(p.z == null ? 40 : p.z) !== Number(marker.z == null ? 40 : marker.z)) continue
			if (kind === "full") {
				var expectedFit = p.fullFit || "cover", actualFit = marker.fullFit || "cover"
				if (expectedFit !== actualFit) continue
			} else if (Number(p.width == null ? 6 : p.width) !== Number(marker.width == null ? 6 : marker.width) || Number(p.height == null ? 6 : p.height) !== Number(marker.height == null ? 6 : marker.height)) continue
			return p
		}
		return null
	}
	// カットインテンプレート（1カットイン＝1テンプレート）
	function cutinTemplateById(id) {
		var list = settingsBag().cutinTemplates || []
		for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i]
		return null
	}
	function cutinTemplateStateClone() {
		var s = settingsBag()
		return { cutinTemplates: templateHistoryClone(s.cutinTemplates || []), cutinTemplateLayout: templateHistoryClone(s.cutinTemplateLayout || []) }
	}
	function cutinTemplateHistory(before, after) {
		templateSettingsHistoryPush("cutinTemplateState", before, after)
	}
	function cutinTemplateLayoutEntries(st) {
		st = st || settingsBag()
		return (Array.isArray(st.cutinTemplateLayout) ? st.cutinTemplateLayout : []).map(function (entry) {
			if (entry && entry.type === "separator") return entry
			return entry && { type: "template", id: entry.id, template: cutinTemplateById(entry.id) }
		}).filter(function (entry) { return entry && (entry.type === "separator" || !!entry.template) })
	}
	function cutinTemplateImageName(tp) {
		return emPresetImageName(tp)
	}
	function cutinTemplateSetField(id, key, value) {
		var tp = cutinTemplateById(id)
		if (!tp || key !== "name") return
		var nextName = String(value == null ? "" : value).trim() || T("settings.001")
		if ((settingsBag().cutinTemplates || []).some(function (other) { return other !== tp && String(other.name || "").trim() === nextName }))
			if (!confirm(T("board.033"))) return
		var before = cutinTemplateStateClone()
		tp.name = nextName
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
	}
	function cutinTemplateSetImage(id, imageUrl) {
		var tp = cutinTemplateById(id)
		if (!tp) return
		var before = cutinTemplateStateClone(), im = imageByName(imageUrl)
		tp.imageUrl = imageUrl || null
		tp.imageName = im ? (im.originalName || im.label || im.name) : (imageUrl || "")
		persistAppSettings()
		var mediaSave = tp.imageUrl ? saveEffectPresetImage(tp.imageUrl) : Promise.resolve()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
		return mediaSave
	}
	function cutinSelectedIds() {
		if (!Array.isArray(ui.cutinSel)) ui.cutinSel = []
		ui.cutinSel = ui.cutinSel.filter(function (id) { return state.effects.some(function (effect) { return effect.id === id }) })
		return ui.cutinSel
	}
	function cutinTemplateRegisterEffects(effects) {
		var list = (effects || []).filter(function (effect) { return effect && effect.id })
		if (!list.length) return []
		var st = settingsBag(), names = list.map(function (effect) { return String(effect.name || T("settings.001")).trim() || T("settings.001") }), seenNames = {}, hasDuplicate = names.some(function (name) {
			if (seenNames[name]) return true
			seenNames[name] = true
			return (st.cutinTemplates || []).some(function (tp) { return String(tp.name || "").trim() === name })
		})
		if (hasDuplicate && !confirm(T("board.034"))) return []
		var before = cutinTemplateStateClone(), made = []
		for (var i = list.length - 1; i >= 0; i--) {
			var effect = list[i], imageUrl = effect.imageUrl || null, tp = { id: C.newId(), name: names[i], imageUrl: imageUrl, imageName: cutinTemplateImageName({ imageUrl: imageUrl }) }
			st.cutinTemplates.unshift(tp)
			st.cutinTemplateLayout.unshift({ type: "template", id: tp.id })
			made.unshift(tp)
		}
		normalizeCutinTemplateSettings()
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		made.forEach(function (tp) { if (tp.imageUrl) saveEffectPresetImage(tp.imageUrl) })
		render()
		toast(made.length + T("board.035"), "ok")
		return made
	}
	function cutinTemplateRegisterOne(id) {
		var effect = state.effects.filter(function (x) { return x.id === id })[0]
		return effect ? cutinTemplateRegisterEffects([effect]) : []
	}
	function cutinTemplateSaveSelected() {
		var selected = cutinSelectedIds().map(function (id) { return state.effects.filter(function (x) { return x.id === id })[0] }).filter(Boolean)
		var made = cutinTemplateRegisterEffects(selected)
		if (made.length) { ui.cutinSel = []; ui.cutinSelectMode = false }
		render()
		return made
	}
	function cutinTemplateApply(id) {
		var tp = cutinTemplateById(id)
		if (!tp) return Promise.resolve(null)
		return restoreEffectPresetImage(tp).then(function (imageName) {
			var effect = { id: C.newId(), name: tp.name || T("settings.001"), imageUrl: imageName || tp.imageUrl || null }
			state.effects.unshift(effect)
			historyWatch()
			ui.tab = "cutins"
			render()
			toast(T("board.036"), "ok")
			return effect.id
		})
	}
	function cutinTemplateDelete(id) {
		var st = settingsBag(), at = (st.cutinTemplates || []).findIndex(function (tp) { return tp && tp.id === id })
		if (at < 0) return
		var before = cutinTemplateStateClone()
		st.cutinTemplates.splice(at, 1)
		st.cutinTemplateLayout = (st.cutinTemplateLayout || []).filter(function (entry) { return entry.type !== "template" || entry.id !== id })
		normalizeCutinTemplateSettings()
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
	}
	function cutinTemplateSetSeparator(id, label) {
		var st = settingsBag(), item = (st.cutinTemplateLayout || []).find(function (entry) { return entry.type === "separator" && entry.id === id })
		if (!item) return
		var before = cutinTemplateStateClone()
		item.label = String(label == null ? "" : label)
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
	}
	function cutinTemplateAddSeparator(label) {
		var nm = String(label || "").trim()
		if (!nm) return toast(T("board.032"), "warn")
		var before = cutinTemplateStateClone(), st = settingsBag()
		st.cutinTemplateLayout.push({ type: "separator", id: C.newId(), label: nm })
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
	}
	function cutinTemplateDeleteSeparator(id) {
		var st = settingsBag(), before = cutinTemplateStateClone()
		st.cutinTemplateLayout = (st.cutinTemplateLayout || []).filter(function (entry) { return entry.type !== "separator" || entry.id !== id })
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
	}
	function cutinTemplateMoveToIndex(sourceId, targetIndex) {
		var st = settingsBag(), list = st.cutinTemplateLayout || [], from = list.findIndex(function (entry) { return entry.id === sourceId })
		if (from < 0) return
		var before = cutinTemplateStateClone(), item = list.splice(from, 1)[0], to = Number(targetIndex) || 0
		if (from < to) to--
		to = Math.max(0, Math.min(list.length, to))
		list.splice(to, 0, item)
		persistAppSettings()
		cutinTemplateHistory(before, cutinTemplateStateClone())
		render()
	}
	function cutinTemplateCard() {
		var st = settingsBag(), entries = cutinTemplateLayoutEntries(st), open = ui.cutinTemplatesOpen !== false, h = '<details class="cutin-template-details card"' + (open ? ' open' : '') + '><summary>' + T("board.037") + ' <span class="sub">' + entries.filter(function (entry) { return entry.type === "template" }).length + T("board.038") + '</span></summary><div class="cutin-template-body"><p class="hint">' + T("board.039") + '</p><div class="row em-separator-add"><input class="w2" id="cutinTemplateSeparatorName" placeholder="' + T("board.040") + '"><button class="btn" data-citplsepadd="1">' + T("board.041") + '</button></div><div class="cutin-template-list"><div class="cutin-template-drop-line" data-citpl-drop-line hidden aria-hidden="true"></div>'
		if (!entries.length) h += '<p class="hint">' + T("board.042") + '</p>'
		entries.forEach(function (entry) {
			if (entry.type === "separator") { h += '<div class="cutin-template-separator" draggable="true" data-citpldrag="' + esc(entry.id) + '"><span class="cutin-template-handle" title="' + T("board.043") + '">⋮⋮</span><input data-citplsepfield="label" data-citplsep-id="' + esc(entry.id) + '" value="' + esc(entry.label || "") + '" placeholder="' + T("board.044") + '"><button class="x kill" data-citplsepdel="' + esc(entry.id) + '" title="' + T("board.045") + '">×</button></div>'; return }
			var tp = entry.template, imageName = cutinTemplateImageName(tp), imageSrc = tp.imageUrl ? thumbOf(tp.imageUrl) : "", thumb = imageSrc ? '<img class="cutin-template-thumb" src="' + imageSrc + '" alt="">' : '<span class="cutin-template-thumb ph">' + T("home.069") + '</span>'
			h += '<div class="cutin-template-row" draggable="true" data-citpldrag="' + esc(tp.id) + '"><span class="cutin-template-handle" title="' + T("board.043") + '">⋮⋮</span><div class="cutin-template-media"><button type="button" class="imgpick cutin-template-thumb-button" data-citplimg="' + esc(tp.id) + '" data-pick-role="演出" data-empty="' + T("home.069") + '" data-current="' + esc(tp.imageUrl || "") + '" title="' + T("board.046") + '">' + thumb + '<span class="cutin-template-thumb-hint">' + T("board.046") + '</span></button><span class="cutin-template-filename" title="' + esc(imageName) + '">' + esc(imageName || T("home.069")) + '</span></div><div class="cutin-template-controls"><label aria-label="' + T("board.047") + '"><input class="w2" data-citplfield="name" data-citpl-id="' + esc(tp.id) + '" value="' + esc(tp.name || "") + '"></label><button class="btn" data-citplapply="' + esc(tp.id) + '">' + T("board.048") + '</button><button class="x kill" data-citpldel="' + esc(tp.id) + '" title="' + T("board.049") + '">' + T("home.094") + '</button></div></div>'
		})
		return h + '</div></div></details>'
	}
	function cutinSelectionTools() {
		var selected = cutinSelectedIds()
		if (!selected.length) return ""
		return '<div class="cutin-select-toolbar active"><b>' + T("board.050") + ' ' + selected.length + T("home.025") + '</b><button class="btn" data-cutinselectall="1">' + T("board.051") + '</button><button class="btn" data-cutinselectclear="1">' + T("imgedit.076") + '</button><button class="btn pri" data-cutinselectsave="1">' + T("board.052") + '</button><button class="btn" data-cutinselectmode="0">' + T("apng.018") + '</button></div>'
	}
	function updateEmMatchLabels() {
		all("[data-em-match]").forEach(function (el) {
			var s = sceneById(el.dataset.sceneId), m = s && emById(s, el.dataset.emId), p = emPresetMatch(m)
			el.textContent = p ? "★ " + (p.name || T("board.028")) : ""
			el.hidden = !p
			var stars = all('[data-em-star][data-scene-id="' + el.dataset.sceneId + '"][data-em-id="' + el.dataset.emId + '"]')
			stars.forEach(function (star) {
				star.textContent = p ? "★" : "☆"
				star.classList.toggle("on", !!p)
			})
		})
	}
	function emPresetPicker(s) {
		var ps = settingsBag().emPresets || []
		if (!ps.length)
			return '<span class="hint">' + T("board.053") + '</span>'
		return '<select id="emPreset" class="w1"><option value="">' + T("board.054") + '</option>' + emPresetOptionHtml(settingsBag()) + '</select><button class="btn" data-emprea="' + s.id + '">' + T("board.055") + '</button>'
	}
	function emPresetCard(st) {
		var ps = st.emPresets || [], entries = emPresetLayoutEntries(st)
		var h = '<div class="card"><h2>' + T("board.028") + '<span class="sub">' + T("board.056") + '</span></h2>' +
			'<p class="hint">' + T("board.057") + '</p>' +
			'<div class="em-preset-register"><div class="em-preset-register-main"><label class="em-preset-register-name">' + T("solid.003") + '<input class="w2" id="epName" value="' + esc(ui.epName || "") + '" placeholder="' + T("board.058") + '"></label>' +
			'<div class="em-preset-register-image">' + imgSelect(ui.epImg || "", 'data-epimg="1" data-pick-role="演出"', T("board.059")) + '</div>' +
			'<label class="em-preset-register-z">' + T("imgedit.085") + '<input type="number" class="w1" id="epZ" value="' + (ui.epZ || 40) + '"></label>' +
			'<button class="btn em-preset-register-submit" id="epAdd">' + T("board.060") + '</button></div>' +
			'<details class="em-preset-register-options"><summary>' + T("board.061") + '</summary><div class="em-preset-option-grid"><div class="em-preset-option-values"><label>' + T("matlist.089") + '<select id="epKind" class="w1"><option value="full">' + T("board.062") + '</option><option value="free"' + (ui.epKind === "free" ? " selected" : "") + '>' + T("board.063") + '</option></select></label><label>' + T("board.064") + '<select id="epFit" class="w1"><option value="stretch">' + T("board.065") + '</option><option value="cover">' + T("board.066") + '</option><option value="contain">' + T("board.067") + '</option></select></label></div><label class="em-preset-text-field">' + T("room.052") + '<input id="epText" value="' + esc(ui.epText || "") + '" placeholder="' + T("home.037") + '"></label></div></details></div>' +
			'<div class="row em-separator-add"><input class="w2" id="epSeparatorName" placeholder="' + T("board.040") + '"><button class="btn" id="epSeparatorAdd">' + T("board.041") + '</button></div>'
		if (!ps.length) h += '<p class="hint">' + T("board.068") + '</p>'
			h += '<div class="em-preset-list"><div class="em-preset-drop-line" data-em-drop-line hidden aria-hidden="true"></div>'
		entries.forEach(function (entry) {
			if (entry.type === "separator") {
				h += '<div class="em-preset-separator' + (ui.emPresetHighlightId === entry.id ? ' em-preset-new' : '') + '" draggable="true" data-empdrag="' + esc(entry.id) + '" data-emp-type="separator"><span class="em-preset-handle" title="' + T("board.043") + '">⋮⋮</span><input data-empsepfield="label" data-empsep-id="' + esc(entry.id) + '" value="' + esc(entry.label || "") + '" placeholder="' + T("board.044") + '"><button class="x kill" data-empsepdel="' + esc(entry.id) + '" title="' + T("board.045") + '">×</button></div>'
				return
			}
				var p = entry.preset, imageName = emPresetImageName(p), imageSrc = p.imageUrl ? thumbOf(p.imageUrl) : ""
				var thumb = imageSrc ? '<img class="em-preset-thumb" src="' + imageSrc + '" alt="">' : '<span class="em-preset-thumb ph">' + T("home.069") + '</span>'
				var mainFields = '<div class="em-preset-main-fields"><label class="em-preset-name-field">' + T("solid.003") + '<input data-empfield="name" data-emp-id="' + esc(p.id) + '" value="' + esc(p.name || "") + '"></label><div class="em-preset-value-fields"><label>' + T("imgedit.085") + '<input type="number" data-empfield="z" data-emp-id="' + esc(p.id) + '" value="' + (p.z == null ? 40 : p.z) + '"></label><label>' + T("maker.041") + '<input type="number" data-empfield="width" data-emp-id="' + esc(p.id) + '" value="' + (p.width == null ? 6 : p.width) + '"></label><label>' + T("maker.042") + '<input type="number" data-empfield="height" data-emp-id="' + esc(p.id) + '" value="' + (p.height == null ? 6 : p.height) + '"></label><div class="em-preset-actions"><button type="button" class="btn sm em-preset-apng-create" data-apngopen="preset" data-apng-preset-id="' + esc(p.id) + '">' + T("images.011") + '</button><button type="button" class="btn em-preset-delete" data-epdel-id="' + esc(p.id) + '">' + T("home.094") + '</button></div></div></div>'
				var optionFields = '<details class="em-preset-options"><summary>' + T("board.061") + '</summary><div class="em-preset-option-grid"><div class="em-preset-option-values"><label>' + T("matlist.089") + '<select data-empfield="kind" data-emp-id="' + esc(p.id) + '"><option value="full"' + (p.kind === "full" ? " selected" : "") + '>' + T("board.062") + '</option><option value="free"' + (p.kind !== "full" ? " selected" : '') + '>' + T("board.063") + '</option></select></label><label>' + T("board.064") + '<select data-empfield="fullFit" data-emp-id="' + esc(p.id) + '"><option value="stretch"' + ((p.fullFit || "cover") === "stretch" ? " selected" : "") + '>' + T("board.065") + '</option><option value="cover"' + ((p.fullFit || "cover") === "cover" ? " selected" : "") + '>' + T("board.066") + '</option><option value="contain"' + (p.fullFit === "contain" ? " selected" : "") + '>' + T("board.067") + '</option></select></label></div><label class="em-preset-text-field">' + T("room.052") + '<input data-empfield="text" data-emp-id="' + esc(p.id) + '" value="' + esc(p.text || '') + '" placeholder="' + T("home.037") + '"></label></div></details>'
			h += '<div class="em-preset-row" draggable="true" data-empdrag="' + esc(p.id) + '" data-emp-type="preset"><div class="em-preset-row-media"><span class="em-preset-handle" title="' + T("board.043") + '">⋮⋮</span><div class="em-preset-media"><button type="button" class="imgpick em-preset-thumb-button" data-empimg="' + esc(p.id) + '" data-pick-role="演出" data-empty="' + T("home.069") + '" data-current="' + esc(p.imageUrl || '') + '" title="' + T("board.046") + '">' + thumb + '<span class="em-preset-thumb-hint">' + T("board.046") + '</span></button><span class="em-preset-filename" title="' + esc(imageName) + '">' + esc(imageName || T("home.069")) + '</span></div></div><div class="em-preset-row-body">' + mainFields + optionFields + '</div></div>'
		})
		h += '</div>'
		return h + "</div>"
	}

	// 部屋デザイン・スクリーンパネル・カットインのテンプレート
	function libTplList(kind) {
		var bag = settingsBag().libTpl
		if (!bag[kind]) bag[kind] = []
		return bag[kind]
	}
	function libTplItems(kind) {
		if (kind === "cutin")
			return state.effects.map(function (e) {
				return { name: e.name, imageUrl: e.imageUrl }
			})
		return partsList(kind).map(function (b) {
			return JSON.parse(JSON.stringify(b))
		})
	}
	function libTplKindName(kind) {
		return kind === "cutin"
			? T("settings.001")
			: kind === "panel"
				? T("home.070")
				: T("render.019")
	}
	function libTplSave(kind) {
		var items = libTplItems(kind)
		if (!items.length) return toast(T("board.069"), "warn")
		var nm = prompt(T("board.070"), libTplKindName(kind) + T("board.071"))
		if (!nm) return
		libTplList(kind).unshift({ id: C.newId(), name: nm, items: items })
		saveLocal()
		render()
		toast(T("board.072"), "ok")
	}
	function libTplApply(kind, id) {
		var tp = libTplList(kind).filter(function (x) {
			return x.id === id
		})[0]
		if (!tp) return
		tp.items.forEach(function (it) {
			if (kind === "cutin") {
				state.effects.unshift({
					id: C.newId(),
					name: it.name || T("settings.001"),
					imageUrl: it.imageUrl || null,
				})
			} else {
				var cp = JSON.parse(JSON.stringify(it))
				cp.id = C.newId()
				cp.role = kind
				state.baseMarkers.unshift(cp)
			}
		})
		render()
		toast(tp.items.length + T("board.073"), "ok")
	}
	function libTplCard(kind) {
		var list = libTplList(kind)
		var h =
			'<div class="card"><h2>' + T("board.074") + '<span class="sub">' + T("board.075") + '</span></h2>' +
			'<div class="row"><button class="btn" data-tplsavelib="' +
			kind +
			'">' + T("board.076") +
			libTplKindName(kind) +
			T("board.077") + '</button></div>'
		if (!list.length)
			h +=
				'<p class="hint">' + T("board.078") + '</p>'
		list.forEach(function (tp) {
			h +=
				'<div class="row"><b>' +
				esc(tp.name) +
				'</b><span class="hint">' +
				tp.items.length +
				' ' + T("home.025") + '</span><button class="btn" data-tplapplylib="' +
				kind +
				'" data-tplid="' +
				tp.id +
				'">' + T("board.079") + '</button><button class="x kill" data-tpldellib="' +
				kind +
				'" data-tplid="' +
				tp.id +
				'" title="' + T("board.080") + '">×</button></div>'
		})
		return h + "</div>"
	}

	// 右パネルのメディアからのドラッグ＆ドロップ受け皿
	function mdropZone(kind) {
		var nm =
			kind === "part"
				? T("render.019")
				: kind === "panel"
					? T("home.070")
					: kind === "tachie"
						? roleName("立ち絵")
						: T("settings.001")
		return (
			'<div class="mdropzone" data-mdrop="' +
			kind +
			'">' + T("board.081") +
			nm +
			T("board.082") + "</div>"
		)
	}
	function mdropMake(kind, nm) {
		var im = imageByName(nm)
		var lbl = im ? im.label : ""
		if (kind === "part" || kind === "panel")
			addPart({
				role: kind,
				name: lbl || (kind === "panel" ? roleName("パネル") : T("home.057")),
				imageUrl: nm,
			})
		else if (kind === "tachie")
			addTachieLib({ group: lbl, name: lbl || roleName("立ち絵"), imageUrl: nm, stayTab: true })
		else if (kind === "cutin") addCut({ name: lbl || T("settings.001"), imageUrl: nm, stayTab: true })
		toast(T("board.083"), "ok")
	}

	// テンプレートの管理（一覧・名前直し・書き出し／読み込み）
	function tplKinds() {
		return [
			{ k: "scene", nm: T("board.084") },
			{ k: "part", nm: T("board.085") },
			{ k: "panel", nm: T("room.026") },
			{ k: "character", nm: T("board.086") },
			{ k: "cutin", nm: T("board.087") },
		]
	}
	function tplRows(k) {
		if ((k === "part" || k === "panel" || k === "character") && !ui.partTemplatesLoaded) { ui.partTemplatesLoaded="loading"; partTemplateLoad() }
		if (k === "scene")
			return (state.sceneTemplates || []).map(function (tp) {
				var cnt = (tp.extraMarkers || []).length
				var image=tp.foregroundUrl||tp.backgroundUrl||((tp.extraMarkers||[]).find(function(x){return x.imageUrl})||{}).imageUrl
				return {
					id: tp.id,
					name: tp.name || T("matlist.067"),
					note: T("board.088", cnt),
					type: T("render.022"), previewUrl:image?thumbOf(image):"",
				}
			})
		if (k === "em")
			return (settingsBag().emPresets || []).map(function (p) {
				return {
					id: p.id,
					name: p.name || roleName("演出"),
					note:
						(p.kind === "full" ? T("board.062") : T("board.089")) +
						T("board.090", (p.z != null ? p.z : "-")),
				}
			})
		if (k === "cutin")
			return cutinTemplateLayoutEntries(settingsBag()).filter(function (entry) { return entry.type === "template" }).map(function (entry) {
				var tp = entry.template
				return { id: tp.id, name: tp.name || T("settings.001"), note: tp.imageName || tp.imageUrl ? T("board.091") : T("home.069"), type: T("settings.001"), previewUrl: tp.imageUrl ? thumbOf(tp.imageUrl) : "" }
			})
		var shared=(k === "part" || k === "panel")?(ui.partTemplates||[]).filter(function(tp){return tp.part&&tp.part.role===k}).map(function(tp){return {id:tp.id,name:tp.part.name||T("matlist.067"),note:tp.part.width+T("board.092", tp.part.height),type:k==="panel"?T("home.070"):T("home.096"),previewUrl:tp.previewUrl||"",shared:true}}):k==="character"?(ui.partTemplates||[]).filter(function(tp){return !!tp.character}).map(function(tp){return {id:tp.id,name:tp.name||T("matlist.067"),note:(tp.character.faces||[]).length+T("board.093"),type:T("render.025"),previewUrl:tp.previewUrl||"",shared:true,character:true}}):[]
		if(k==="character")return shared
		return shared.concat(libTplList(k).map(function (tp) {
			var first=(tp.items||[]).find(function(x){return x.imageUrl})
			return {
				id: tp.id,
				name: tp.name || T("matlist.067"),
				note: (tp.items || []).length + T("board.094"),
				type:k==="cutin"?T("settings.001"):k==="panel"?T("home.070"):T("home.096"),previewUrl:first?thumbOf(first.imageUrl):"",
			}
		}))
	}
	function tplManagerCard() {
		var h =
			'<div class="card"><h2>' + T("board.095") + '<span class="sub">' + T("board.096") + '</span></h2>' +
			'<p class="hint">' + T("board.097") + '</p>' +
			'<div class="row"><button class="btn" id="tplExport">' + T("board.098") + '</button>' +
			'<label class="btn">' + T("board.099") + '<input type="file" id="tplImport" accept=".json,application/json" hidden></label></div>'
		tplKinds().forEach(function (kd) {
			var rows = tplRows(kd.k)
			h +=
				'<details class="sec"' +
				(rows.length ? " open" : "") +
				"><summary>" +
				kd.nm +
				"（" +
				rows.length +
				"）</summary>"
			if (!rows.length) h += '<p class="hint">' + T("room.037") + '</p>'
			rows.forEach(function (r) {
				var mgrKind=r.character?"chartpl":r.shared?"parttpl":kd.k
				h +=
					'<div class="tpl-manager-row">'+(r.previewUrl?'<img class="tpl-manager-thumb" src="'+r.previewUrl+'" alt="">':'')+'<div class="tpl-manager-info"><input class="w2" data-mgrname="' +
					mgrKind +
					'" data-mgrid="' +
					esc(r.id) +
					'" value="' +
					esc(r.name) +
					'"><b class="tpl-manager-kind">'+esc(r.type||kd.nm.replace(/^[^ ]+ /,""))+'</b><span class="hint">' +
					esc(r.note) +
					"</span></div><div class=\"tpl-manager-actions\">" +
					(r.shared && !r.character?'':'<button class="btn" data-mgredit="' + (r.character ? 'chartpl' : kd.k) + '" data-mgrid="' + esc(r.id) + '">' + T("board.100") + '</button>') +
					(kd.k === "em"
						? ""
						: '<button class="btn" data-mgruse="' +
							mgrKind +
							'" data-mgrid="' +
							esc(r.id) +
							'">' +
							(kd.k === "scene" ? T("board.101") : T("board.102")) +
							"</button>") +
					'<button class="x kill ic tip" data-mgrdel="' +
					mgrKind +
					'" data-mgrid="' +
					esc(r.id) +
					'" data-tip="' + T("board.049") + '">🗑</button></div></div>'
			})
			h += "</details>"
		})
		return h + "</div>"
	}
	function tplDetailTarget() {
		var r = ui.tplDetail || {}, kind = r.kind, id = r.id
		if (kind === "scene") return (state.sceneTemplates || []).filter(function (x) { return x.id === id })[0] || null
		if (kind === "em") return emPresetById(id)
		if (kind === "cutin") return cutinTemplateById(id)
		if (kind === "chartpl") return (ui.partTemplates || []).filter(function (x) { return x.id === id && x.character })[0] || null
		return libTplList(kind).filter(function (x) { return x.id === id })[0] || null
	}
	function tplDetailBlock() {
		var r = ui.tplDetail || {}, tp = tplDetailTarget()
		if (!tp) return '<p class="hint">' + T("board.103") + '</p>'
		var h = '<div class="tpldetail"><label>' + T("board.104") + '<input class="w3" data-tpd="name" value="' + esc(tp.name || "") + '"></label>'
		if (r.kind === "scene") {
			var tplBgMode = sceneBackgroundMode(tp)
			h += '<div class="row"><label>' + roleName("前景") + ' ' + imgSelect(tp.foregroundUrl || "", 'data-tpd="foregroundUrl"') + '</label>' +
				'<label>' + T("board.105") + '<select data-tpd="backgroundMode"><option value="room"'+(tplBgMode==="room"?' selected':'')+'>' + T("render.019") + '</option><option value="foreground"'+(tplBgMode==="foreground"?' selected':'')+'>' + T("board.106") + '</option><option value="image"'+(tplBgMode==="image"?' selected':'')+'>' + T("board.107") + '</option><option value="none"'+(tplBgMode==="none"?' selected':'')+'>' + T("board.108") + '</option></select></label>' +
				(tplBgMode === "image" ? '<label>' + roleName("背景") + ' ' + imgSelect(tp.backgroundUrl || "", 'data-tpd="backgroundUrl"', T("imgbtn.001")) + '</label>' : '') + '</div>' +
				'<label>' + T("board.109") + '<textarea rows="5" data-tpd="text">' + esc(tp.text || "") + '</textarea></label>' +
				'<p class="hint">' + T("board.110") + ' ' + ((tp.extraMarkers || []).length) + ' ' + T("board.111") + ' ' + ((tp.cutins || []).length) + ' ' + T("board.112") + '</p>'
		} else if (r.kind === "chartpl") {
			var ctp = tp.character || {}, skills = ctp.skills || [], faces = ctp.faces || []
			if (tp.previewUrl) h += '<img class="tpl-character-main" src="' + tp.previewUrl + '" alt="' + esc(tp.name || T("home.076")) + '">'
			h += '<p class="hint">' + T("board.113") + '</p><dl class="tpl-character-summary"><div><dt>' + T("matlist.089") + '</dt><dd>' + esc(ctp.isKp ? T("home.084") : ctp.kind === "enemy" ? T("home.085") : ctp.kind === "ally" ? T("home.086") : T("home.087")) + '</dd></div><div><dt>HP / MP</dt><dd>' + esc((ctp.hp == null ? "—" : ctp.hp) + " / " + (ctp.mp == null ? "—" : ctp.mp)) + '</dd></div><div><dt>' + T("board.114") + '</dt><dd>' + esc((ctp.armor == null ? "—" : ctp.armor) + " / " + (ctp.noDodge ? T("matlist.088") : ctp.dodge == null ? "—" : ctp.dodge)) + '</dd></div><div><dt>' + T("board.115") + '</dt><dd>' + skills.length + T("home.025") + '</dd></div><div><dt>' + T("board.116") + '</dt><dd>' + faces.length + T("home.025") + '</dd></div></dl>'
			if (skills.length) h += '<div class="tpl-character-list"><b>' + T("board.115") + '</b>' + skills.map(function (sk) { return '<span>' + esc(sk.name || T("matlist.067")) + (sk.value == null ? "" : " " + esc(sk.value)) + (sk.damage ? " / " + esc(sk.damage) : "") + '</span>' }).join('') + '</div>'
			if (ctp.commands) h += '<label>' + T("board.117") + '<textarea rows="4" readonly>' + esc(ctp.commands) + '</textarea></label>'
			if (ctp.memo) h += '<label>' + T("board.118") + '<textarea rows="3" readonly>' + esc(ctp.memo) + '</textarea></label>'
		} else if (r.kind === "em") {
			h += '<div class="row"><label>' + T("apng.006") + ' ' + imgSelect(tp.imageUrl || "", 'data-tpd="imageUrl" data-pick-role="演出"') + '</label>' +
				'<label>' + T("matlist.089") + '<select data-tpd="kind"><option value="full"' + (tp.kind === "full" ? " selected" : "") + '>' + T("board.062") + '</option><option value="other"' + (tp.kind !== "full" ? " selected" : "") + '>' + T("board.063") + '</option></select></label>' +
				'<label>' + T("imgedit.085") + '<input type="number" data-tpd="z" value="' + (tp.z == null ? 40 : tp.z) + '"></label></div>' +
				'<div class="row"><label>' + T("maker.041") + '<input type="number" step="0.5" data-tpd="width" value="' + (tp.width || 6) + '"></label><label>' + T("maker.042") + '<input type="number" step="0.5" data-tpd="height" value="' + (tp.height || 6) + '"></label></div>'
		} else if (r.kind === "cutin") {
			h += '<div class="row"><label>' + T("apng.006") + ' ' + imgSelect(tp.imageUrl || "", 'data-citplimg="' + esc(tp.id) + '" data-pick-role="演出"') + '</label><span class="hint">' + esc(cutinTemplateImageName(tp) || T("home.069")) + '</span></div>'
		} else {
			var items = tp.items || []
			h += '<p class="hint">' + T("board.119") + '</p>'
			items.forEach(function (it, i) {
				h += '<div class="block tplitem"><b>' + (i + 1) + '</b><div class="row">' + imgSelect(it.imageUrl || "", 'data-tpdi="imageUrl" data-tpdx="' + i + '"') +
					'<label>' + T("solid.003") + '<input data-tpdi="name" data-tpdx="' + i + '" value="' + esc(it.name || "") + '"></label></div>'
				if (r.kind !== "cutin") h += '<div class="row"><label>' + T("board.120") + '<input type="number" step="0.5" data-tpdi="x" data-tpdx="' + i + '" value="' + (it.x || 0) + '"></label><label>' + T("board.121") + '<input type="number" step="0.5" data-tpdi="y" data-tpdx="' + i + '" value="' + (it.y || 0) + '"></label><label>' + T("maker.041") + '<input type="number" step="0.5" data-tpdi="width" data-tpdx="' + i + '" value="' + (it.width || 4) + '"></label><label>' + T("maker.042") + '<input type="number" step="0.5" data-tpdi="height" data-tpdx="' + i + '" value="' + (it.height || 4) + '"></label><label>' + T("imgedit.085") + '<input type="number" data-tpdi="z" data-tpdx="' + i + '" value="' + (it.z || 0) + '"></label></div>'
				h += '</div>'
			})
		}
		return h + '<p class="hint">' + T("board.122") + '</p></div>'
	}
	function tplDetailInput(t) {
		var tp = tplDetailTarget(), r = ui.tplDetail || {}, d = t.dataset || {}
		if (!tp) return
		if (r.kind === "cutin") {
			if (d.tpd === "name") cutinTemplateSetField(tp.id, "name", t.value)
			else if (d.tpd === "imageUrl") cutinTemplateSetImage(tp.id, t.value || "")
			return
		}
		if (d.tpd) {
			if (r.kind === "chartpl" && d.tpd === "name") {
				partTemplateRename(tp.id, t.value)
				return
			}
			var numeric = ["z", "width", "height"].indexOf(d.tpd) >= 0
			tp[d.tpd] = numeric ? Number(t.value) : (d.tpd.indexOf("Url") >= 0 ? (t.value || null) : t.value)
			if (r.kind === "scene" && d.tpd === "backgroundUrl" && t.value) tp.backgroundMode = "image"
		}
		if (d.tpdi !== undefined) {
			var it = (tp.items || [])[Number(d.tpdx)]
			if (!it) return
			var num = ["x", "y", "width", "height", "z"].indexOf(d.tpdi) >= 0
			it[d.tpdi] = num ? Number(t.value) : (d.tpdi === "imageUrl" ? (t.value || null) : t.value)
		}
	}

	function tplRename(kind, id, v) {
		if (kind === "parttpl" || kind === "chartpl") partTemplateRename(id,v)
		else if (kind === "scene")
			(state.sceneTemplates || []).forEach(function (tp) {
				if (tp.id === id) tp.name = v
			})
		else if (kind === "em") {
			var p = emPresetById(id)
			if (p) p.name = v
		} else if (kind === "cutin") cutinTemplateSetField(id, "name", v)
		else
			libTplList(kind).forEach(function (tp) {
				if (tp.id === id) tp.name = v
			})
	}
	function tplMgrDel(kind, id) {
		if (kind === "parttpl" || kind === "chartpl") return partTemplateDelete(id)
		if (kind === "scene")
			state.sceneTemplates = (state.sceneTemplates || []).filter(function (tp) {
				return tp.id !== id
			})
		else if (kind === "em") emPresetDelete(id)
		else if (kind === "cutin") cutinTemplateDelete(id)
		else {
			var lst = libTplList(kind)
			var at = -1
			lst.forEach(function (x, i) {
				if (x.id === id) at = i
			})
			if (at >= 0) lst.splice(at, 1)
		}
		render()
	}
	function tplExport() {
		var st = settingsBag()
		var o = {
			kind: "ccfolia-zip-maker-templates",
			version: 1,
			sceneTemplates: state.sceneTemplates || [],
			libTpl: st.libTpl,
			emPresets: st.emPresets,
			emPresetLayout: st.emPresetLayout,
			cutinTemplates: st.cutinTemplates,
			cutinTemplateLayout: st.cutinTemplateLayout,
			kpTemplates: st.kpTemplates,
			sites: st.sites,
			syms: st.syms,
			defaults: st.defaults,
		}
		var blob = new Blob([JSON.stringify(o, null, 2)], {
			type: "application/json",
		})
		var a = document.createElement("a")
		a.href = URL.createObjectURL(blob)
		a.download = (state.project || "room") + "-templates.json"
		a.click()
		setTimeout(function () {
			URL.revokeObjectURL(a.href)
		}, 5000)
		toast(T("board.123"), "ok")
	}
	function tplImportData(txt) {
		var j = null
		try {
			j = JSON.parse(txt)
		} catch (e) {
			j = null
		}
		if (!j) return toast(T("board.124"), "no")
		var st = settingsBag()
		var n = 0
		if (!Array.isArray(state.sceneTemplates)) state.sceneTemplates = []
		if (Array.isArray(j.sceneTemplates))
			j.sceneTemplates.forEach(function (tp) {
				tp.id = C.newId()
				state.sceneTemplates.push(tp)
				n++
			})
		if (j.libTpl)
			["part", "panel", "cutin"].forEach(function (k) {
				if (Array.isArray(j.libTpl[k]))
					j.libTpl[k].forEach(function (tp) {
						tp.id = C.newId()
						libTplList(k).push(tp)
						n++
					})
			})
		if (Array.isArray(j.emPresets)) {
			var importedIds = {}
			j.emPresets.forEach(function (source) {
				var p = JSON.parse(JSON.stringify(source || {})), oldId = p.id
				if (!p.id || emPresetById(p.id) || importedIds[p.id]) p.id = C.newId()
				if (oldId) importedIds[oldId] = p.id
				st.emPresets.push(p)
				st.emPresetLayout.push({ type: "preset", id: p.id })
				n++
			})
			if (Array.isArray(j.emPresetLayout)) {
				var importedLayout = j.emPresetLayout.map(function (entry) {
					if (!entry || entry.type === "separator") return entry && { type: "separator", id: C.newId(), label: entry.label || "" }
					var mapped = importedIds[entry.id]
					return mapped ? { type: "preset", id: mapped } : null
				}).filter(Boolean)
				var importedSet = {}
				Object.keys(importedIds).forEach(function (old) { importedSet[importedIds[old]] = true })
				st.emPresetLayout = st.emPresetLayout.filter(function (entry) { return entry.type !== "preset" || !importedSet[entry.id] })
				st.emPresetLayout = st.emPresetLayout.concat(importedLayout)
			}
		}
		if (Array.isArray(j.cutinTemplates)) {
			var cutinImportedIds = {}
			j.cutinTemplates.forEach(function (source) {
				var tp = JSON.parse(JSON.stringify(source || {})), oldId = tp.id
				tp.id = C.newId()
				tp.name = String(tp.name || T("settings.001"))
				tp.imageUrl = tp.imageUrl || null
				tp.imageName = tp.imageName || tp.imageUrl || ""
				st.cutinTemplates.push(tp)
				if (oldId) cutinImportedIds[oldId] = tp.id
				n++
			})
			if (Array.isArray(j.cutinTemplateLayout)) {
				var cutinLayout = j.cutinTemplateLayout.map(function (entry) {
					if (!entry || entry.type === "separator") return entry && { type: "separator", id: C.newId(), label: entry.label || "" }
					return cutinImportedIds[entry.id] ? { type: "template", id: cutinImportedIds[entry.id] } : null
				}).filter(Boolean)
				st.cutinTemplateLayout = (st.cutinTemplateLayout || []).concat(cutinLayout)
			}
		}
		if (Array.isArray(j.kpTemplates))
			j.kpTemplates.forEach(function (p) {
				p.id = C.newId()
				st.kpTemplates.push(p)
				n++
			})
		normalizeEmPresetSettings()
		normalizeCutinTemplateSettings()
		persistAppSettings()
		render()
		toast(n + T("board.073"), "ok")
	}
	document.addEventListener("change", function (e) {
		var t = e.target
		if (t && t.id === "tplImport" && t.files && t.files[0]) {
			var fr = new FileReader()
			fr.onload = function () {
				tplImportData(String(fr.result))
			}
			fr.readAsText(t.files[0])
			t.value = ""
		}
	})

	// シナリオテキスト一覧へ文章を登録する
	var storyEditDraft = {}
	function storyBlock() {
		var st=ui.storyDraft||{title:'',text:'',delimiter:'---',split:false}; ui.storyDraft=st
		if(st.split===undefined)st.split=false
		if(ui.storyMode!=="bulk")ui.storyMode="single"
		if(ui.storyBulk===undefined)ui.storyBulk=""
		var tpls=settingsBag().storyTemplates||[]
		return '<p class="hint">' + T("board.125") + '</p>'+
		'<div class="story-mode"><button class="btn'+(ui.storyMode==='single'?' on':'')+'" data-storymode="single">' + T("board.126") + '</button><button class="btn'+(ui.storyMode==='bulk'?' on':'')+'" data-storymode="bulk">' + T("board.127") + '</button></div>'+
		(ui.storyMode==='single'?'<div class="story-entry"><div class="row"><input id="storyTitle" class="grow" value="'+esc(st.title||'')+'" placeholder="' + T("board.128") + '"><button class="btn" id="storyTplSave">' + T("board.129") + '</button></div><textarea id="storyText" rows="12" placeholder="' + T("board.130") + '">'+esc(st.text||'')+'</textarea><div class="row"><button class="btn pri" id="storyGo">' + T("board.131") + '</button></div></div>':'<div class="story-entry"><textarea id="storyBulkText" rows="16" placeholder="' + T("board.132") + '">'+esc(ui.storyBulk||'')+'</textarea><div class="row story-insert-tools"><button class="btn" id="storyBulkInsertDelimiter">' + T("board.133") + '</button><button class="btn" id="storyBulkInsertTitle">' + T("board.134") + '</button></div><details class="story-split-settings"><summary>' + T("board.135") + ' <span id="storySplitSummary">'+storySplitSummary(st)+'</span></summary><div class="story-split-body"><label>' + T("board.136") + '<input id="storyDelimiter" value="'+esc(st.delimiter||'')+'" placeholder="' + T("board.137") + '"></label><label class="story-split-check"><input type="checkbox" id="storySplit"'+(st.split?' checked':'')+'> ' + T("board.138") + '</label><span class="hint">' + T("board.139") + '</span></div></details><div class="row story-bulk-action"><b id="storyBulkCount">'+storyBulkCountHtml(storyBulkEntries(ui.storyBulk,st.split,st.delimiter))+'</b><button class="btn pri" id="storyBulkGo">' + T("board.140") + '</button></div><div id="storyBulkPreview" class="story-bulk-preview">'+storyBulkPreviewHtml(storyBulkEntries(ui.storyBulk,st.split,st.delimiter))+'</div></div>')+
		(tpls.length?'<details class="story-templates"'+(ui.storyTemplatesOpen?' open':'')+'><summary>' + T("board.141") + ' <span>'+tpls.length+T("home.025") + '</span></summary><div class="story-templates-body">'+tpls.map(function(tp){return '<div class="row story-template-row"><b class="grow">'+esc(tp.name||T("board.141"))+'</b><button class="x" data-storytplapply="'+tp.id+'">' + T("board.048") + '</button><button class="x" data-storytpldel="'+tp.id+'">' + T("home.094") + '</button></div>'}).join('')+'</div></details>':'')
	}
	function viewStory() {
		var list=state.storyTexts||[],sel=storySelIds(),h='<div class="card"><h2>' + T("story.001") + '<span class="sub">' + T("story.002") + '</span></h2>'+storyBlock()+'</div><div class="card story-list"><h2>' + T("story.003") + ' <span class="sub">'+list.length+T("home.025") + '</span></h2>'
		if(sel.length)h+='<div class="row story-move-tools"><b>'+sel.length+T("story.004") + '</b><button class="x" id="storySelUp">' + T("story.005") + '</button><button class="x" id="storySelDown">' + T("story.006") + '</button><button class="x" id="storySelTop">' + T("story.007") + '</button><button class="x" id="storySelBottom">' + T("story.008") + '</button><button class="x" id="storySelClear">' + T("imgedit.076") + '</button></div>'
		if(!list.length) h+='<p class="hint">' + T("story.009") + '</p>'
		list.forEach(function(x,i){h+='<div class="block story-item'+(sel.indexOf(x.id)>=0?' selected':'')+'" data-storyselect="'+x.id+'"><div class="row"><span class="story-no">'+(i+1)+'</span><input class="grow" data-storyitem="title" data-storyid="'+x.id+'" value="'+esc(x.title||'')+'"><button class="x" data-storydel="'+x.id+'">' + T("home.094") + '</button></div><textarea rows="7" data-storyitem="text" data-storyid="'+x.id+'">'+esc(x.text||'')+'</textarea></div>'})
		return h+(list.length?'<p class="hint">' + T("story.010") + '</p>':'')+'</div>'
	}
	function storySelIds() {
		if(!ui.storySel)ui.storySel=[]
		ui.storySel=ui.storySel.filter(function(id){return (state.storyTexts||[]).some(function(x){return x.id===id})})
		return ui.storySel
	}
	function moveStorySel(dir) {
		var sel=storySelIds(),list=state.storyTexts||[];if(!sel.length)return
		var idx=[];list.forEach(function(x,i){if(sel.indexOf(x.id)>=0)idx.push(i)})
		if(dir<0){if(idx[0]===0)return;historyWatch();idx.forEach(function(i){var x=list[i-1];list[i-1]=list[i];list[i]=x})}
		else{if(idx[idx.length-1]===list.length-1)return;historyWatch();idx.slice().reverse().forEach(function(i){var x=list[i+1];list[i+1]=list[i];list[i]=x})}
		render()
	}
	function moveStorySelTo(end) {
		var sel=storySelIds(),list=state.storyTexts||[];if(!sel.length)return
		var picked=list.filter(function(x){return sel.indexOf(x.id)>=0}),rest=list.filter(function(x){return sel.indexOf(x.id)<0})
		if((!end&&list.slice(0,picked.length).every(function(x,i){return x===picked[i]}))||(end&&list.slice(-picked.length).every(function(x,i){return x===picked[i]})))return
		historyWatch();state.storyTexts=end?rest.concat(picked):picked.concat(rest);render()
	}
	function storyParse(txt, split, delimiter) {
		var out=[], cur=[]; String(txt||'').split('\n').forEach(function(ln){if((delimiter&&ln.trim()===delimiter)||(split&&!ln.trim())){if(cur.length){out.push(cur.join('\n'));cur=[]}}else cur.push(ln)}); if(cur.length)out.push(cur.join('\n')); return out
	}
	function storyAutoTitle(text, fallbackNo) {
		var lines=String(text||'').replace(/\r\n?/g,'\n').split('\n'),first=''
		for(var i=0;i<lines.length;i++){if(lines[i].trim()){first=lines[i].trim();break}}
		if(!first)return T("story.011", fallbackNo)
		var m=first.match(/^#\s*(\S.*)$/)
		return m?m[1].trim():first.slice(0,10)
	}
	function storyBulkEntries(txt, split, delimiter) {
		return storyParse(String(txt||'').replace(/\r\n?/g,'\n'),split,String(delimiter||'').trim()).filter(function(text){return text.trim()}).map(function(text,index){
			var lines=text.split('\n'), first=-1
			for(var i=0;i<lines.length;i++){if(lines[i].trim()){first=i;break}}
			if(first<0)return null
			var m=lines[first].match(/^\s*#\s*(\S.*)$/)
			if(m){lines.splice(first,1);return {title:m[1].trim(),text:lines.join('\n')}}
			return {title:storyAutoTitle(text,index+1),text:text}
		}).filter(function(x){return x&&x.text.trim()})
	}
	function storySplitSummary(st) {
		return T("story.012", esc(st.delimiter||T("imgbtn.001")), (st.split?T("story.013"):''))
	}
	function storyBulkCountHtml(list) {return list.length+T("story.014")}
	function storyBulkPreviewHtml(list) {
		return list.length?'<b>' + T("story.015") + '</b><ol>'+list.map(function(x){return '<li>'+esc(x.title||T("story.016"))+'</li>'}).join('')+'</ol>':'<span class="hint">' + T("story.017") + '</span>'
	}
	function refreshStoryBulkPreview() {
		var box=$('#storyBulkPreview'),count=$('#storyBulkCount'),summary=$('#storySplitSummary'),ta=$('#storyBulkText'),de=$('#storyDelimiter'),sp=$('#storySplit');if(!box||!ta)return
		var list=storyBulkEntries(ta.value,!!(sp&&sp.checked),de?de.value:'');box.innerHTML=storyBulkPreviewHtml(list);if(count)count.textContent=storyBulkCountHtml(list);if(summary)summary.textContent=T("story.012", (de&&de.value||T("imgbtn.001")), (sp&&sp.checked?T("story.013"):''))
	}
	function insertStoryBulkText(value) {
		var ta=$('#storyBulkText');if(!ta||!value)return
		var a=ta.selectionStart,b=ta.selectionEnd;ta.value=ta.value.slice(0,a)+value+ta.value.slice(b);ui.storyBulk=ta.value;ta.focus();ta.selectionStart=ta.selectionEnd=a+value.length;refreshStoryBulkPreview()
	}
	function storyAddItem(title,text) {
		text=String(text==null?'':text)
		var explicit=String(title||'').trim(),item={id:uid(),title:explicit||storyAutoTitle(text,state.storyTexts.length+1),text:text}
		historyWatch();state.storyTexts.push(item)
		return item
	}
	function storyMake() {
		var ta=$('#storyText'), ti=$('#storyTitle'); if(!ta)return
		storyAddItem(ti&&ti.value,ta.value)
		ui.storyDraft.title='';ui.storyDraft.text='';render();toast(T("story.018"),'ok')
	}
	function storyBulkMake() {
		var ta=$('#storyBulkText'),de=$('#storyDelimiter'),sp=$('#storySplit');if(!ta)return
		var list=storyBulkEntries(ta.value,!!(sp&&sp.checked),de?de.value:'');if(!list.length)return toast(T("story.019"),'warn')
		historyWatch();list.forEach(function(x){state.storyTexts.push({id:uid(),title:x.title,text:x.text})})
		ui.storyBulk='';render();toast(list.length+T("story.020"),'ok')
	}

	// 立ち絵をまとめて同じ設定にする
	function tachieBulkCard() {
		if (!state.tachie.length) return ""
		return (
			'<div class="card tachie-bulk-card"><h2>' + T("story.021") + '<span class="sub">' + T("story.022") + '</span></h2>' +
			'<section class="tachie-bulk-group"><h3>' + T("story.023") + '</h3><div class="tachie-bulk-row">' +
			'<div class="tachie-bulk-pair"><label>' + T("story.024") + ' <input type="number" step="0.5" class="w1" id="tbH" placeholder="18"></label>' +
			'<button class="btn" data-tbulk="h">' + T("story.025") + '</button></div>' +
			'<div class="tachie-bulk-pair"><label>' + T("story.026") + ' <input type="number" step="0.5" class="w1" id="tbDy" placeholder="0"></label>' +
			'<button class="btn" data-tbulk="dy">' + T("story.027") + '</button></div></div></section>' +
			'<section class="tachie-bulk-group"><h3>' + T("imgedit.085") + '</h3><div class="tachie-bulk-row"><div class="tachie-bulk-pair"><label>' + T("imgedit.085") + ' <input type="number" step="1" class="w1" id="tbZ" placeholder="21"></label>' +
			'<button class="btn" data-tbulk="z">' + T("story.028") + '</button></div></div></section>' +
			'<p class="hint tiny">' + T("story.029") + '</p></div>'
		)
	}
	function applyTachieBulk(kind) {
		var el = $(kind === "h" ? "#tbH" : kind === "dy" ? "#tbDy" : "#tbZ")
		var raw = el ? String(el.value).trim() : ""
		if (!raw) return toast(T("story.030"), "warn")
		var v = Number(raw)
		if (isNaN(v)) return toast(T("story.031"), "no")
		var n = 0
		state.tachie.forEach(function (tc) {
			if (tc.baseId && !tc.solo) return
			if (kind === "h") tc.heightM = v
			if (kind === "dy") tc.dy = v
			if (kind === "z") tc.z = v
			n++
		})
		syncTachie()
		render()
		toast(n + T("story.032"), "ok")
	}

	// レイヤー一覧から詳細の該当セクションへ
	function goSec(sec, markerId) {
		if (sec === "ov") ui.openOv = true
		if (!ui.sceneFolds) ui.sceneFolds = {}
		if (sec === "tachie") ui.sceneFolds.tachie = true
		if (sec === "em") ui.sceneFolds.effect = true
		if (sec === "cut") ui.sceneFolds.cutin = true
		if (sec === "ov") ui.sceneFolds.parts = true
		ui.tab = "scenes"
		render()
		setTimeout(function () {
			var el = markerId ? $(sec === "tachie" ? "#sceneTachie-" + markerId : sec === "em" ? "#sceneEffect-" + markerId : sec === "ov" ? "#scenePart-" + markerId : "#secCut") : $(
				sec === "ov"
					? "#secOv"
					: sec === "tachie"
						? "#secTachie"
						: sec === "cut"
							? "#secCut"
							: "#secEm",
			)
			if (el && el.scrollIntoView)
				el.scrollIntoView({ behavior: "smooth", block: "center" })
			if (el && el.classList) {
				el.classList.add("flash")
				setTimeout(function () {
					el.classList.remove("flash")
				}, 1200)
			}
		}, 40)
	}

	function viewParts() {
		return roomBaseCard() + partsView("part") + libTplCard("part")
	}
	function viewPanels() {
		return partsView("panel") + libTplCard("panel")
	}

	function emNum(label, sid, mid, key, val) {
		return (
			"<label>" +
			label +
			' <input type="number" step="0.5" class="w1" data-em="' +
			key +
			'" data-scene-id="' +
			sid +
			'" data-em-id="' +
			mid +
			'" value="' +
			(val == null ? 0 : val) +
			'"></label>'
		)
	}

	// ① 立ち絵（ライブラリから登場させる）
	// 立ち絵の名前（差分は「大元／差分名」の形）
	function tcLabel(tc) {
		if (!tc) return roleName("立ち絵")
		var base = tc.baseId ? tachieById(tc.baseId) : null
		var own = tc.group || tc.name || roleName("立ち絵")
		if (base && base.id !== tc.id)
			return (base.group || base.name || roleName("立ち絵")) + "／" + (tc.name || T("panels.001"))
		return own
	}
	function tcMarkLabel(m) {
		var tc = m && m.refId ? tachieById(m.refId) : null
		if (!tc) return m && m.name ? m.name : roleName("立ち絵")
		var base = tachieBase(tc) || tc
		return base.group || base.name || tc.group || tc.name || roleName("立ち絵")
	}
	function tachieFamily(tc) {
		if (!tc) return []
		var root = tc.baseId || tc.id
		return state.tachie.filter(function(x){ return x.id === root || x.baseId === root })
	}
	function sceneTachieBlock(s) {
		var placed = sceneTachieMarkers(s), h = '<section class="scene-section scene-detail-sec" id="secTachie"><div class="scene-section-head"><button class="scene-fold-head" data-scfold="tachie" aria-expanded="'+(sceneFoldOpen('tachie')?'true':'false')+'"><span class="scene-fold-arrow">'+(sceneFoldOpen('tachie')?'▾':'▸')+'</span><h3>' + T("panels.002") + '</h3></button><div><span>'+placed.length+T("home.025") + '</span><button class="scene-help tip" data-tip="' + T("panels.003") + '">?</button></div></div><div class="scene-section-body"'+(sceneFoldOpen('tachie')?'':' hidden')+'>'
		if (!state.tachie.length) h += '<p class="hint">' + T("panels.004") + '</p>'
		else {
			h += '<div class="chips">'
			state.tachie.filter(function(tc){return !tc.baseId}).forEach(function(tc){
				var fam=tachieFamily(tc), on=placed.some(function(m){return fam.some(function(x){return x.id===m.refId})})
				h += '<label class="chip'+(on?' on':'')+'"><input type="checkbox" data-stc="'+tc.id+'" data-id="'+s.id+'"'+(on?' checked':'')+'> '+esc(tc.group||tc.name||'立ち絵')+'</label>'
			}); h += '</div>'
		}
		placed.forEach(function(m){
			var tc=tachieById(m.refId), fam=tachieFamily(tc)
			h += '<div class="row ov tachie-scene-row" id="sceneTachie-'+m.id+'"><button class="pname lnk" data-srcedit="tachie" data-src-id="'+(m.refId||'')+'" title="' + T("panels.005") + '">'+esc(tcMarkLabel(m))+'</button>'
			h += '<label class="facepick'+(fam.length>1?'':' no-faces')+'">' + T("panels.001") + ' <select data-tcface="'+m.id+'" data-scene-id="'+s.id+'"'+(fam.length>1?'':' disabled')+'>'+(fam.length>1?fam.map(function(x){return '<option value="'+x.id+'"'+(x.id===m.refId?' selected':'')+'>'+esc(x.id===(tc&&tc.baseId||tc&&tc.id)?T("room.005"):(x.name||T("panels.001")))+'</option>'}).join(''):'<option>' + T("matlist.088") + '</option>')+'</select></label>'
			h += '<span class="tachie-nudge" aria-label="' + T("panels.006") + '"><button class="x tip" data-tcleft="'+m.id+'" data-scene-id="'+s.id+'" data-tip="' + T("panels.007") + '">←</button><button class="x tip" data-tcright="'+m.id+'" data-scene-id="'+s.id+'" data-tip="' + T("panels.008") + '">→</button></span><span class="tachie-position-fields">'+emNum(T("board.120"),s.id,m.id,'x',m.x)+emNum(T("board.121"),s.id,m.id,'y',m.y)+emNum(T("maker.026"),s.id,m.id,'height',m.height)+'</span></div>'
		})
		if(placed.length>1) h += '<div class="row tachie-layout-tools"><span>' + T("panels.009") + '</span><button class="btn" data-tclayout="'+s.id+'">' + T("panels.010") + '</button><label>' + T("panels.011") + ' <input type="number" step="0.5" class="w1" id="tcGap" value="'+(settingsBag().tachieGap||0)+'"> ' + T("room.022") + '</label></div>'
		return h + '</div></section>'
	}
	function sceneFoldOpen(key) {
		return !ui.sceneFolds || ui.sceneFolds[key] !== false
	}

	// 名前クリックで開く「大元の設定」ポップアップ
	function srcEditBlock() {
		var r = ui.srcRef || {}
		if (r.kind === "tachie") {
			var tc = tachieById(r.id)
			if (!tc) return '<p class="hint">' + T("panels.012") + '</p>'
			var src = tachieSrc(tc)
			fitTachie(src)
			return (
				'<p class="hint">' + T("panels.013") +
				esc(tc.name || roleName("立ち絵")) +
				T("panels.014") + '</p>' +
				'<div class="row">' +
				imgSelect(
					tc.imageUrl || "",
					'data-tc="imageUrl" data-id="' + tc.id + '"',
					T("panels.015"),
				) +
				'<label>' + T("solid.003") + ' <input class="w2" data-tc="name" data-id="' +
				tc.id +
				'" value="' +
				esc(tc.name || "") +
				'"></label></div>' +
				'<div class="row"><label>' + T("maker.042") + ' <input type="number" step="0.5" data-tc="heightM" data-id="' +
				src.id +
				'" value="' +
				(src.heightM || 18) +
				'"></label>' +
				'<label>' + T("story.026") + ' <input type="number" step="0.5" data-tc="dy" data-id="' +
				src.id +
				'" value="' +
				(src.dy || 0) +
				'"></label>' +
				'<label>' + T("imgedit.085") + ' <input type="number" data-tc="z" data-id="' +
				tc.id +
				'" value="' +
				(tc.z != null ? tc.z : state.room.tachieZ) +
				'"></label></div>' +
				'<p class="hint">' + T("panels.016") + ' ' +
				(src.widthM || 0) +
				"×" +
				(src.heightM || 0) +
				" " + T("panels.017") + "</p>"
			)
		}
		if (r.kind === "part") {
			var b = partById(r.id)
			if (!b) return '<p class="hint">' + T("panels.012") + '</p>'
			return (
				'<p class="hint">' +
				(partsRole(b) === "panel" ? T("room.026") : T("room.025")) +
				"「" +
				esc(b.name || "") +
				T("panels.018") + '</p>' +
				'<div class="row">' +
				imgSelect(
					b.imageUrl || "",
					'data-part="imageUrl" data-id="' + b.id + '"',
					T("panels.015"),
				) +
				'<label>' + T("solid.003") + ' <input class="w2" data-part="name" data-id="' +
				b.id +
				'" value="' +
				esc(b.name || "") +
				'"></label></div>' +
				'<div class="row">' +
				numField(T("board.120"), b.id, "x", b.x) +
				numField(T("board.121"), b.id, "y", b.y) +
				numField(T("maker.041"), b.id, "width", b.width) +
				numField(T("maker.042"), b.id, "height", b.height) +
				numField(T("imgedit.085"), b.id, "z", b.z) +
				"</div>" +
				'<div class="row"><label class="grow">' + T("room.052") + ' <input class="w3" data-part="text" data-id="' +
				b.id +
				'" value="' +
				esc(b.text || "") +
				'"></label></div>' +
				'<p class="hint">' +
				sceneUseNote(b) +
				" " + T("panels.019") + "</p>"
			)
		}
		if (r.kind === "em") {
			var sE = sceneById(r.sceneId)
			var m = sE ? emById(sE, r.id) : null
			if (!m) return '<p class="hint">' + T("panels.012") + '</p>'
			return (
				'<p class="hint">' + T("panels.020") +
				esc(sE.name || "") +
				T("panels.021") + '</p>' +
				'<div class="row">' +
				imgSelect(
					m.imageUrl || "",
					'data-em="imageUrl" data-scene-id="' +
						sE.id +
						'" data-em-id="' +
						m.id +
						'" data-pick-role="演出"',
					T("panels.015"),
				) +
				'<label>' + T("solid.003") + ' <input class="w2" data-em="name" data-scene-id="' +
				sE.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.name || "") +
				'"></label></div>' +
				'<div class="row">' +
				emNum(T("board.120"), sE.id, m.id, "x", m.x) +
				emNum(T("board.121"), sE.id, m.id, "y", m.y) +
				emNum(T("maker.041"), sE.id, m.id, "width", m.width) +
				emNum(T("maker.042"), sE.id, m.id, "height", m.height) +
				emNum(T("imgedit.085"), sE.id, m.id, "z", m.z) +
				"</div>" +
				'<div class="row"><label class="grow">' + T("room.052") + ' <input class="w3" data-em="text" data-scene-id="' +
				sE.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.text || "") +
				'"></label></div>'
			)
		}
		if (r.kind === "cut") {
			var ce=state.effects.find(function(x){return x.id===r.id})
			if(!ce)return '<p class="hint">' + T("panels.012") + '</p>'
			return '<p class="hint">' + T("panels.022")+esc(ce.name||T("settings.001"))+T("panels.023") + '</p><div class="row">'+imgSelect(ce.imageUrl||"",'data-cut="imageUrl" data-id="'+ce.id+'"',T("panels.015"))+'<label>' + T("solid.003") + ' <input class="w2" data-cut="name" data-id="'+ce.id+'" value="'+esc(ce.name||"")+'"></label></div>'
		}
		return '<p class="hint">' + T("panels.012") + '</p>'
	}

	// 「全画面」の演出は、いつでも盤面ぴったりに保つ
	function applyEmMode(m,s) {
		var sizeScene=s||currentScene(),fieldW=sizeScene&&sizeScene.fieldWidth!=null?sizeScene.fieldWidth:state.room.fieldWidth,fieldH=sizeScene&&sizeScene.fieldHeight!=null?sizeScene.fieldHeight:state.room.fieldHeight
		if (m.kind === "full" && m.fullFit === "cover") {
			var fw=fieldW,fh=fieldH,im=m.imageUrl?imageByName(m.imageUrl):null,ia=im&&im.w&&im.h?im.w/im.h:fw/fh,w=fw,h=snapHalf(fw/ia)
			if(h<fh){h=fh;w=snapHalf(fh*ia)}
			m.x=0;m.y=0;m.width=w;m.height=h;m.lockAspect=false;return m
		}
		if (m.kind === "full" && m.fullFit === "contain") {
			var cfw = fieldW,
				cfh = fieldH
			var cim = m.imageUrl ? imageByName(m.imageUrl) : null
			var cia = cim && cim.w && cim.h ? cim.w / cim.h : cfw / cfh
			var cw = cfw,
				ch = snapHalf(cfw / cia)
			if (ch > cfh) {
				ch = cfh
				cw = snapHalf(cfh * cia)
			}
			m.x = 0
			m.y = 0
			m.width = cw
			m.height = ch
			m.lockAspect = false
			return m
		}
		if (m.kind === "full") {
			m.x = 0
			m.y = 0
			m.width = fieldW + 1
			m.height = fieldH + 1
			m.lockAspect = false
		}
		return m
	}
	function normalizeFull() {
		state.scenes.forEach(function (s) {
			;(s.extraMarkers || []).forEach(function (m) {
				if (m.kind === "full") applyEmMode(m,s)
			})
		})
	}
	function fullFitNote(m) {
		var im = m.imageUrl ? imageByName(m.imageUrl) : null
		if (!im || !im.w) return ""
		var ia = im.w / im.h
		var ba = state.room.fieldWidth / state.room.fieldHeight
		if (Math.abs(ia - ba) < 0.06)
			return T("panels.024")
		if (m.fullFit === "contain")
			return (
				T("panels.025", snapHalf(state.room.fieldHeight * ia), state.room.fieldHeight)
			)
		if(m.fullFit==="cover")return T("panels.026")
		return (
			T("panels.027", im.w, im.h, snapHalf(state.room.fieldHeight * ia), state.room.fieldHeight)
		)
	}

	// ② 演出（全画面／サイズ調整を選べる）
	function sceneEffectBlock(s) {
		var list = (s.extraMarkers || []).filter(function (m) {
			return m.kind !== "tachie"
		})
		var h =
			'<div class="sec" id="secEm"><h3>' + T("panels.028") +
			list.length +
			"）</h3>" +
			'<div class="row"><button class="btn pri" data-addem="' +
			s.id +
			'" data-preset="full">' + T("panels.029") + '</button>' +
			'<button class="btn" data-addem="' +
			s.id +
			'">' + T("panels.030") + '</button>' +
			emPresetPicker(s) +
			"</div>"
		list.forEach(function (m) {
			var full = m.kind === "full"
			if (full) applyEmMode(m)
			h +=
				'<div class="block emcard scene-effect-card"><div class="row emhead">' +
				imgSelect(
					m.imageUrl,
					'data-em="imageUrl" data-scene-id="' + s.id + '" data-em-id="' + m.id + '" data-pick-role="演出"',
					T("panels.015"),
				) +
				'<input class="w2" data-em="name" data-scene-id="' +
				s.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.name || "") +
				'" placeholder="' + T("panels.031") + '">' +
				'<label>' + T("room.027") + ' <select class="w2" data-em="mode" data-scene-id="' +
				s.id +
				'" data-em-id="' +
				m.id +
				'"><option value="full"' +
				(full ? " selected" : "") +
				'>' + T("panels.032") + '</option><option value="free"' +
				(full ? "" : " selected") +
				">" + T("board.063") + "</option></select></label>" +
				emNum(T("imgedit.085"), s.id, m.id, "z", m.z) +
				'<span class="gap"></span>' +
					'<span class="em-match" data-em-match="1" data-scene-id="' + s.id + '" data-em-id="' + m.id + '" hidden></span><button class="x ic tip" data-em-star="1" data-em-id="' + m.id + '" data-tip="' + T("panels.033") + '" data-emsave="' +
				m.id +
				'" data-scene-id="' +
				s.id +
				'">☆</button>' +
				'<button class="x ic tip" data-tip="' + T("panels.034") + '" data-dupem="' +
				m.id +
				'" data-scene-id="' +
				s.id +
				'">⧉</button>' +
				'<button class="x ic kill tip" data-tip="' + T("panels.035") + '" data-delem="' +
				m.id +
				'" data-scene-id="' +
				s.id +
				'">🗑</button></div>' +
				(full
					? '<div class="row"><label class="lockchip"><input type="checkbox" data-em="fullFit" data-scene-id="' +
						s.id +
						'" data-em-id="' +
						m.id +
						'"' +
						(m.fullFit === "contain" ? " checked" : "") +
						"> " + T("panels.036") + "</label></div>" 
					: '<div class="row nums">' +
						emNum(T("board.120"), s.id, m.id, "x", m.x) +
						emNum(T("board.121"), s.id, m.id, "y", m.y) +
						emNum(T("maker.041"), s.id, m.id, "width", m.width) +
						emNum(T("maker.042"), s.id, m.id, "height", m.height) +
						lockChip(
							'data-em="lockAspect" data-scene-id="' +
								s.id +
								'" data-em-id="' +
								m.id +
								'"',
							m.lockAspect !== false,
						) +
						"</div>") +
				'<details class="mini"><summary>' + T("panels.037") + '</summary>' +
				(full ? '<p class="hint tiny">' + T("panels.038") + state.room.fieldWidth + '×' + state.room.fieldHeight + T("panels.039") + fullFitNote(m) + '</p>' : '') +
				'<div class="row"><label class="grow">' + T("panels.040") + ' <input data-em="text" data-scene-id="' +
				s.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.text || "") +
				'" placeholder="' + T("panels.041") + '"></label></div></details></div>'
		})
		return (
			h +
			'<p class="hint">' + T("panels.042") + '</p></div>'
		)
	}
	function sceneEffectPane(s) {
		var list=(s.extraMarkers||[]).filter(function(m){return m.kind!=="tachie"}),presets=settingsBag().emPresets||[],open=sceneFoldOpen('effect'),h='<section class="scene-section" id="secEm"><div class="scene-section-head"><button class="scene-fold-head" data-scfold="effect" aria-expanded="'+(open?'true':'false')+'"><span class="scene-fold-arrow">'+(open?'▾':'▸')+'</span><h3>' + T("panels.043") + '</h3></button><div><span>'+list.length+T("home.025") + '</span><button class="scene-help tip" data-tip="' + T("panels.044") + '">?</button></div></div><div class="scene-section-body"'+(open?'':' hidden')+'><div class="row compact-add"><select id="sceneEmChoice"><option value="new">' + T("panels.045") + '</option>'+emPresetOptionHtml(settingsBag())+'</select><button class="btn pri" data-sceneemadd="'+s.id+'">' + T("board.055") + '</button></div>'
		list.forEach(function(m){var full=m.kind==="full";if(full)applyEmMode(m,s);h+='<div class="scene-effect" id="sceneEffect-'+m.id+'"><div class="scene-effect-thumb">'+imgSelect(m.imageUrl,'data-em="imageUrl" data-scene-id="'+s.id+'" data-em-id="'+m.id+'" data-pick-role="演出"','NO IMAGE')+'</div><div class="scene-effect-settings"><div class="scene-effect-main"><label>' + T("room.027") + '<select data-em="mode" data-scene-id="'+s.id+'" data-em-id="'+m.id+'"><option value="full"'+(full?' selected':'')+'>' + T("board.062") + '</option><option value="free"'+(!full?' selected':'')+'>' + T("board.063") + '</option></select></label>'+emNum(T("imgedit.085"),s.id,m.id,'z',m.z)
			if(full)h+='<label class="lockchip'+(m.fullFit==='cover'?' on':'')+'"><input type="checkbox" data-em="fullFit" data-scene-id="'+s.id+'" data-em-id="'+m.id+'"'+(m.fullFit==='cover'?' checked':'')+'> ' + T("panels.046") + '</label>'
				h+='<span class="em-match" data-em-match="1" data-scene-id="'+s.id+'" data-em-id="'+m.id+'" hidden></span><span class="scene-effect-actions"><button class="btn sm scene-apng-create" data-apngopen="scene" data-apng-scene-id="'+esc(s.id)+'" data-apng-effect-id="'+esc(m.id)+'">' + T("images.011") + '</button><button class="x ic tip" data-em-star="1" data-em-id="'+m.id+'" data-tip="' + T("panels.033") + '" data-emsave="'+m.id+'" data-scene-id="'+s.id+'">☆</button><button class="x ic tip" data-tip="' + T("panels.034") + '" data-dupem="'+m.id+'" data-scene-id="'+s.id+'">⧉</button><button class="x ic kill tip" data-tip="' + T("panels.035") + '" data-delem="'+m.id+'" data-scene-id="'+s.id+'">🗑</button></span></div>'
			if(full&&m.fullFit==='contain')h+='<p class="scene-row-note">' + T("panels.047") + '</p>'
			if(!full)h+='<div class="scene-effect-fields">'+emNum(T("board.120"),s.id,m.id,'x',m.x)+emNum(T("board.121"),s.id,m.id,'y',m.y)+emNum(T("maker.041"),s.id,m.id,'width',m.width)+emNum(T("maker.042"),s.id,m.id,'height',m.height)+lockChip('data-em="lockAspect" data-scene-id="'+s.id+'" data-em-id="'+m.id+'"',m.lockAspect!==false)+'</div>'
			h+='<details class="scene-options"><summary>' + T("board.061") + '</summary><div class="option-grid"><label>' + T("panels.048") + '<input data-em="name" data-scene-id="'+s.id+'" data-em-id="'+m.id+'" value="'+esc(m.name||'')+'"></label><label>' + T("room.052") + '<input data-em="text" data-scene-id="'+s.id+'" data-em-id="'+m.id+'" value="'+esc(m.text||'')+'"></label></div></details></div></div>'
		})
		return h+'</div></section>'
	}

	// このパーツをシーン側でいじっているかのさっくり情報
	function sceneUseNote(b) {
		if (partsRole(b) === "panel") return ""
		var hid = [],
			swp = [],
			mov = []
		state.scenes.forEach(function (s) {
			var ov = s.overrides ? s.overrides[b.id] : undefined
			if (ov === null) hid.push(s.name || T("matlist.067"))
			else if (ov) {
				if (ov.imageUrl) swp.push(s.name || T("matlist.067"))
				if (ov.x != null || ov.y != null) mov.push(s.name || T("matlist.067"))
			}
		})
		function chip(label, arr) {
			if (!arr.length) return ""
			return (
				'<span class="tag tip" data-tip="' +
				esc(arr.join("\n")) +
				'">' +
				label +
				" " +
				arr.length +
				T("render.022") + "</span> "
			)
		}
		if (!hid.length && !swp.length && !mov.length)
			return '<span class="hint">' + T("panels.049") + '</span>'
		return (
			chip(T("panels.050"), hid) +
			chip(T("panels.051"), swp) +
			chip(T("panels.052"), mov) +
			'<span class="hint">' + T("panels.053") + '</span>'
		)
	}

	// シーン別にズレている位置の数
	function scenePosCount(s) {
		var n = 0
		var ovs = s.overrides || {}
		Object.keys(ovs).forEach(function (k) {
			var ov = ovs[k]
			if (ov && (ov.x != null || ov.y != null)) n++
		})
		return n
	}
	function allPosCount() {
		var n = 0
		state.scenes.forEach(function (s) {
			n += scenePosCount(s)
		})
		return n
	}
	function clearPosIn(s) {
		var n = 0
		var ovs = s.overrides || {}
		Object.keys(ovs).forEach(function (k) {
			var ov = ovs[k]
			if (!ov) return
			if (ov.x != null || ov.y != null) n++
			delete ov.x
			delete ov.y
			if (!Object.keys(ov).length) delete ovs[k]
		})
		return n
	}
	function clearScenePos(s) {
		if (!s) return
		var n = clearPosIn(s)
		render()
		toast(
			n ? n + T("panels.054") : T("panels.055"),
			n ? "ok" : "warn",
		)
	}
	function clearAllPos() {
		var n = 0
		state.scenes.forEach(function (s) {
			n += clearPosIn(s)
		})
		render()
		toast(
			n ? n + T("panels.056") : T("panels.057"),
			n ? "ok" : "warn",
		)
	}

	// ② 演出用の全画面画像（旧・未使用）
	function sceneFullBlock(s) {
		var list = (s.extraMarkers || []).filter(function (m) {
			return m.kind === "full"
		})
		var h =
			"<details" +
			(list.length ? " open" : "") +
			"><summary>" + T("panels.058") +
			list.length +
			"）</summary>"
		list.forEach(function (m) {
			h +=
				'<div class="row ov">' +
				imgSelect(
					m.imageUrl,
					'data-em="imageUrl" data-scene-id="' + s.id + '" data-em-id="' + m.id + '" data-pick-role="演出"',
					T("panels.015"),
				) +
				'<input class="w2" data-em="name" data-scene-id="' +
				s.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.name || "") +
				'" placeholder="' + T("panels.059") + '">' +
				emNum(T("imgedit.085"), s.id, m.id, "z", m.z) +
				'<button class="x" data-delem="' +
				m.id +
				'" data-scene-id="' +
				s.id +
				'">' + T("home.094") + '</button></div>'
		})
		return (
			h +
			'<div class="row"><button class="btn" data-addem="' +
			s.id +
			'" data-preset="full">' + T("panels.029") + '</button></div>' +
			'<p class="hint">' + T("panels.060") + '</p></details>'
		)
	}

	// ③ そのほか出したいもの
	function sceneOtherBlock(s) {
		var list = (s.extraMarkers || []).filter(function (m) {
			return m.kind !== "tachie" && m.kind !== "full"
		})
		var h =
			"<details" +
			(list.length ? " open" : "") +
			"><summary>" + T("panels.061") +
			list.length +
			"）</summary>"
		list.forEach(function (m) {
			h +=
				'<div class="row ov"><input class="w2" data-em="name" data-scene-id="' +
				s.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.name || "") +
				'" placeholder="' + T("panels.048") + '">' +
				imgSelect(
					m.imageUrl,
					'data-em="imageUrl" data-scene-id="' + s.id + '" data-em-id="' + m.id + '" data-pick-role="演出"',
					T("panels.015"),
				) +
				'<label>' + T("maker.006") + ' <input data-em="text" data-scene-id="' +
				s.id +
				'" data-em-id="' +
				m.id +
				'" value="' +
				esc(m.text || "") +
				'" placeholder="' + T("panels.062") + '"></label>' +
				'<button class="x" data-delem="' +
				m.id +
				'" data-scene-id="' +
				s.id +
				'">' + T("home.094") + '</button></div>' +
				'<div class="row nums">' +
				emNum(T("board.120"), s.id, m.id, "x", m.x) +
				emNum(T("board.121"), s.id, m.id, "y", m.y) +
				emNum(T("maker.041"), s.id, m.id, "width", m.width) +
				emNum(T("maker.042"), s.id, m.id, "height", m.height) +
				emNum(T("imgedit.085"), s.id, m.id, "z", m.z) +
				lockChip(
					'data-em="lockAspect" data-scene-id="' + s.id + '" data-em-id="' + m.id + '"',
					m.lockAspect !== false,
				) +
				"</div>"
		})
		return (
			h +
			'<div class="row"><button class="btn" data-addem="' +
			s.id +
			'">' + T("panels.063") + '</button>' +
			"</div>" +
			'<p class="hint">' + T("panels.064") + '</p></details>'
		)
	}

	// シーン切り替え時に流すカットイン（切り替え時テキストに @カットイン名 を入れる）
	function cutinLines(s) {
		var ids = s.cutins || []
		var out = []
		ids.forEach(function (id) {
			state.effects.forEach(function (e) {
				if (e.id === id && e.name) out.push("@" + e.name)
			})
		})
		return out
	}
	// 書き出しに使う「切り替え時テキスト」完成形
	function sceneText(s) {
		var lines = cutinLines(s)
		var body = s.text || ""
		if (!lines.length) return body
		return lines.join("\n") + (body ? "\n" + body : "")
	}
	function sceneCutinBlock(s) {
		var cid=(s.cutins||[])[0]||'', ef=state.effects.find(function(x){return x.id===cid})
		var open=sceneFoldOpen('cutin'),h='<section class="scene-section" id="secCut"><div class="scene-section-head"><button class="scene-fold-head" data-scfold="cutin" aria-expanded="'+(open?'true':'false')+'"><span class="scene-fold-arrow">'+(open?'▾':'▸')+'</span><h3>' + T("board.087") + '</h3></button><div><span>'+(ef?T("panels.065"):T("panels.066"))+'</span><button class="scene-help tip" data-tip="' + T("panels.067") + '">?</button></div></div><div class="scene-section-body"'+(open?'':' hidden')+'>'
		h+='<div class="row compact-add"><select id="sceneCutChoice" class="grow"><option value="new">' + T("panels.045") + '</option>'+state.effects.map(function(x){return '<option value="'+x.id+'"'+(x.id===cid?' selected':'')+'>'+esc(x.name||T("import.006"))+'</option>'}).join('')+'</select><button class="btn pri" data-scenecutadd="'+s.id+'">' + T("board.055") + '</button></div>'
		if(ef) h+='<div class="cutin-current"><div class="row">'+imgSelect(ef.imageUrl,'data-cut="imageUrl" data-id="'+ef.id+'" data-pick-role="演出"','NO IMAGE')+'<input class="grow" data-cut="name" data-id="'+ef.id+'" value="'+esc(ef.name||'')+'" placeholder="' + T("board.047") + '"><button class="x" data-cutintplsave="'+ef.id+'">' + T("panels.068") + '</button><button class="x" data-scutoff="'+ef.id+'" data-id="'+s.id+'">' + T("panels.069") + '</button></div></div>'
		return h+'</div></section>'
	}

	function scenePartStatus(ov) {
		if (ov === null) return T("panels.050")
		if (!ov) return T("panels.070")
		var a=[]
		if (Object.prototype.hasOwnProperty.call(ov,"imageUrl")) a.push(T("apng.006"))
		if (ov.x!=null||ov.y!=null) a.push(T("panels.071"))
		if (ov.width!=null||ov.height!=null) a.push(T("maker.026"))
		if (ov.z!=null) a.push(T("imgedit.085"))
		if (ov.show) a.push(T("panels.072"))
		return a.length?a.join("・")+T("panels.073"):T("panels.070")
	}
	function sceneOvNum(label,sid,pid,key,val,base){
		return '<label>'+label+' <input type="number" step="0.5" class="w1" data-ov="'+key+'" data-scene-id="'+sid+'" data-part-id="'+pid+'" value="'+(val==null?'':val)+'" placeholder="'+base+'"></label>'
	}
	function sceneCommonPartsPane(s) {
		var bases=state.baseMarkers.filter(function(b){return partsRole(b)!=="panel"}), ovs=s.overrides||{}
		var showAll=ui.scenePartsOpen||ui.openOv, changed=bases.filter(function(b){return Object.prototype.hasOwnProperty.call(ovs,b.id)}), list=showAll?bases:changed
		var openSec=sceneFoldOpen('parts'),h='<section class="scene-section" id="secOv"><div class="scene-section-head"><button class="scene-fold-head" data-scfold="parts" aria-expanded="'+(openSec?'true':'false')+'"><span class="scene-fold-arrow">'+(openSec?'▾':'▸')+'</span><h3>' + T("panels.074") + '</h3></button><div><span>'+changed.length+T("panels.075") + '</span><button class="scene-help tip" data-tip="' + T("panels.076") + '">?</button><button class="x scene-show-all" data-scpartsopen="1">'+(showAll?T("panels.077"):T("panels.078", bases.length))+'</button></div></div><div class="scene-section-body"'+(openSec?'':' hidden')+'>'
		if(!list.length)h+='<p class="hint">'+(bases.length?T("panels.079"):T("panels.080"))+'</p>'
		list.forEach(function(b){var ov=ovs[b.id], open=ui.scenePartEdit===b.id, effective=ov&&Object.prototype.hasOwnProperty.call(ov,"imageUrl")?ov.imageUrl:b.imageUrl
			h+='<div class="scene-part-row'+(open?' open':'')+'" id="scenePart-'+b.id+'"><div class="scene-part-summary">'+imgSelect(effective,'data-ov="imageUrl" data-scene-id="'+s.id+'" data-part-id="'+b.id+'"','NO IMAGE')+'<button class="pname lnk" data-srcedit="part" data-src-id="'+b.id+'">'+esc(b.name||T("import.006"))+'</button><span class="tag">'+scenePartStatus(ov)+'</span><button class="x" data-scpartedit="'+b.id+'">' + T("panels.073") + '</button>'+(open||Object.prototype.hasOwnProperty.call(ovs,b.id)?'<button class="x scene-part-default" data-scpartreset="'+b.id+'" data-scene-id="'+s.id+'">' + T("panels.081") + '</button>':'')+'</div>'
			if(open)h+='<div class="scene-part-fields">'+sceneOvNum(T("board.120"),s.id,b.id,'x',ov&&ov.x,b.x)+sceneOvNum(T("board.121"),s.id,b.id,'y',ov&&ov.y,b.y)+sceneOvNum(T("maker.041"),s.id,b.id,'width',ov&&ov.width,b.width)+sceneOvNum(T("maker.042"),s.id,b.id,'height',ov&&ov.height,b.height)+sceneOvNum(T("imgedit.085"),s.id,b.id,'z',ov&&ov.z,b.z)+'<label><input type="checkbox" data-ov="hide" data-scene-id="'+s.id+'" data-part-id="'+b.id+'"'+(ov===null?' checked':'')+'> ' + T("panels.082") + '</label></div>'
			h+='</div>'
		})
		return h+'</div></section>'
	}

	function viewCutins() {
		var h =
			'<div class="card"><h2>' + T("settings.001") + '</h2>' +
			'<p class="hint">' + T("cutins.001") + ' <code>' + T("cutins.002") + '</code> ' + T("cutins.003") + '</p>' +
			'<p class="hint">' + T("cutins.004") + '</p>' +
			'<div class="row"><button class="btn pri" id="addCut">' + T("cutins.005") + '</button>' +
			'<button class="btn" id="cutsFromImages">' + T("render.005") + '</button></div>' +
			mdropZone("cutin") +
			cutinTemplateCard() +
			cutinSelectionTools()
		if (!state.effects.length) h += '<p class="hint">' + T("room.037") + '</p>'
			state.effects.forEach(function (e) {
				h +=
					'<div class="cut' + (cutinSelectedIds().indexOf(e.id) >= 0 ? ' cutin-selected' : '') + '" data-cutin-card="' + e.id + '" data-cutin-select-card="1">' +
					imgSelect(e.imageUrl, 'data-cut="imageUrl" data-id="' + e.id + '" data-pick-role="演出"', T("panels.015")) +
				'<div class="cutmain"><div class="row"><input class="w2" data-cut="name" data-id="' +
				e.id +
				'" value="' +
				esc(e.name || "") +
				'" placeholder="' + T("board.047") + '">' +
					'<button class="x" data-cutintplsave="' + e.id + '">' + T("panels.068") + '</button>' +
				'<button class="x" data-dupcut="' +
				e.id +
				'" title="' + T("cutins.006") + '">' + T("maker.050") + '</button>' +
				'<button class="x" data-delcut="' +
				e.id +
				'">' + T("home.094") + '</button></div>' +
				'<p class="hint">' + T("cutins.007") + ' <code>@' +
				esc(e.name || T("board.047")) +
				"</code> " + T("cutins.008") + "</p></div></div>"
		})
		return (
			h +
			'<p class="hint">' + T("cutins.009") + '</p></div>'
		)
	}

	function viewTachie() {
		var h =
			'<div class="card"><h2>' + T("render.023") + '<span class="sub">' + T("tachie2.001") + '</span></h2>' +
			'<p class="hint">' + T("tachie2.002") + '</p>' +
			'<div class="row"><button class="btn pri" id="addTachieLib">' + T("tachie2.003") + '</button>' +
			'<button class="btn" id="tachieFromImages">' + T("tachie2.004") + '</button></div>' +
			mdropZone("tachie") +
			tachieBulkCard()
		var groups = tachieGroups()
		if (groups.length) {
			h +=
				'<div class="chips"><span class="chip' +
				(ui.tachieGroup ? "" : " on") +
				'" data-tgroup="">' + T("home.099") + '</span>' +
				groups
					.map(function (g) {
						return (
							'<span class="chip' +
							(ui.tachieGroup === g ? " on" : "") +
							'" data-tgroup="' +
							esc(g) +
							'">' +
							esc(g) +
							"</span>"
						)
					})
					.join("") +
				"</div>"
		}
		h += "</div>"
		var list = tachieInGroup()
		if (!list.length)
			return (
				h +
				'<div class="card"><p class="hint">' + T("tachie2.005") + '</p></div>'
			)
		list.forEach(function (tc) {
			fitTachie(tc)
			var im = tc.imageUrl ? imageByName(tc.imageUrl) : null
			var imageName = im ? im.originalName || im.label || im.name || T("home.069") : T("home.069")
			var base = tachieBase(tc)
			var inherit = !!base && !tc.solo
			h +=
				'<div class="card tachie-card"><div class="tachie-card-media">' +
				imgSelect(tc.imageUrl, 'data-tc="imageUrl" data-id="' + tc.id + '"', T("panels.015")) +
				'<span class="tachie-card-filename" title="' + esc(imageName) + '">' +
				esc(imageName) +
				'</span></div><div class="tachie-card-settings"><div class="tachie-card-head"><div class="tachie-card-fields"><div class="tachie-card-field-labels"><span>' + T("tachie2.006") + '</span><span>' + T("tachie2.007") + '</span></div><div class="tachie-card-inputs"><input class="w2" aria-label="' + T("tachie2.006") + '" data-tc="group" data-id="' +
				tc.id +
				'" value="' +
				esc(tc.group || "") +
				'" placeholder="' + T("tachie2.008") + '">' +
				'<input class="w2" aria-label="' + T("tachie2.007") + '" data-tc="name" data-id="' +
				tc.id +
				'" value="' +
				esc(tc.name || "") +
				'" placeholder="' + T("tachie2.009") + '"><div class="tachie-card-actions">' +
				'<button class="x" data-dupt2="' +
				tc.id +
				'" title="' + T("tachie2.010") + '">' + T("maker.050") + '</button>' +
				'<button class="x" data-duptc="' +
				tc.id +
				'">' + T("tachie2.011") + '</button>' +
				'<button class="x" data-deltc="' +
				tc.id +
				'">' + T("home.094") + '</button></div></div></div></div>'
			if (base)
				h +=
					'<div class="row lockrow"><span class="tag">' + T("tachie2.012") + '</span>' +
					'<span class="hint">' + T("tachie2.013") + '<b>' +
					esc(base.name || roleName("立ち絵")) +
					"</b></span>" +
					'<label class="lockchip' +
					(tc.solo ? " on" : "") +
					'" title="' + T("tachie2.014") + '"><input type="checkbox" data-tc="solo" data-id="' +
					tc.id +
					'"' +
					(tc.solo ? " checked" : "") +
					"> " + T("tachie2.015") + "</label></div>"
			if (inherit)
				h +=
					'<p class="hint">' + T("tachie2.016") +
					esc(base.name || roleName("立ち絵")) +
					T("tachie2.017") + ' ' +
					tc.heightM +
					" " + T("tachie2.018") + " " +
					(base.dy || 0) +
					" " + T("tachie2.019") + "</p>"
			else
				h +=
					'<div class="tachie-card-size"><label class="tachie-size-control"><span>' + T("matlist.084") + '</span><input type="range" min="2" max="30" step="0.5" data-tc="heightM" data-id="' +
					tc.id +
					'" value="' +
					tc.heightM +
					'"></label>' +
					'<label class="tachie-size-value"><input type="number" step="0.5" class="w1" data-tc="heightM" data-id="' +
					tc.id +
					'" value="' +
					tc.heightM +
					'"> ' + T("room.022") + '</label>' +
					'<label class="tachie-lift">' + T("tachie2.020") + ' <input type="number" step="0.5" class="w1" data-tc="dy" data-id="' +
					tc.id +
					'" value="' +
					(tc.dy || 0) +
					'"> ' + T("room.022") + '</label></div>'
			h +=
				'<p class="hint" id="tcw-' +
				tc.id +
				'">' + T("tachie2.021") + ' <b>' +
				tc.widthM +
				"×" +
				tc.heightM +
				"</b> " + T("room.022") +
				(im && im.w ? T("tachie2.022", im.w, im.h) : "") +
				T("tachie2.023") + " " +
				tachieY(tc) +
				"</p></div></div>"
		})
		return h
	}

	function viewScenes() {
		if (ui.newHide) return viewScenesFolded()
		var h =
			'<div class="card scene-create-card"><h2>' + T("home.014") + '<span class="sub">' + T("scenes.001") + '</span>' +
			'<button class="btn" id="newHide">' + T("matlist.021") + '</button></h2>' +
			'<div class="row"><input id="quickScene" placeholder="' + T("scenes.002") + '" class="w3">' +
			"<label>" + roleName("前景") + " " +
			imgSelect(ui.newFg || "", 'data-newfg="1"', T("scenes.003")) +
			"</label>" +
			'<button class="btn pri" id="addSceneBtn">' + T("scenes.004") + '</button></div>' +
			'<div class="row">' +
			settingsBag().syms.map(function (sy) {
				return '<button class="x" data-sym="' + esc(sy) + '">' + esc(sy) + "</button>"
			}).join("") +
			'<span class="hint">' + T("scenes.005") + '</span></div>' +
			'<div class="row"><button class="btn" id="scenesFromImages">' + T("room.035") + '</button>' +
			'<button class="btn" id="openBulk">' + T("scenes.006") + '</button>' +
			'<button class="btn" id="openTpl">' + T("scenes.007") +
			state.sceneTemplates.length +
			"）</button></div>" +
			'<p class="hint">' + T("scenes.008") + '<b>' + T("scenes.009") + '</b>' + T("scenes.010") + '</p></div>'
		if (!state.scenes.length)
			return h + '<div class="card"><p class="hint">' + T("scenes.011") + '</p></div>'

		if (!sceneById(ui.sceneId)) ui.sceneId = state.scenes[0].id
		h +=
			'<div class="spane scene-workspace">' +
			sceneListPane() +
			'<div class="sdetail">' + sceneTools() +
			sceneDetail(sceneById(ui.sceneId)) +
			"</div>" +
			"</div>"
		return h
	}

	// 「シーンを作る」を一時的に閉じているとき
	function viewScenesFolded() {
		var h =
			'<div class="card mini scene-create-card"><div class="row"><b>' + T("home.014") + '</b>' +
			'<button class="btn" id="newOpen">' + T("matlist.019") + '</button>' +
			'<button class="btn" id="scenesFromImages">' + T("room.035") + '</button>' +
			'<button class="btn" id="openBulk">' + T("scenes2.001") + '</button>' +
			'<button class="btn" id="openTpl">' + T("scenes.007") +
			state.sceneTemplates.length +
			"）</button></div></div>"
		if (!state.scenes.length)
			return (
				h +
				'<div class="card"><p class="hint">' + T("scenes2.002") + '</p></div>'
			)
		if (!sceneById(ui.sceneId)) ui.sceneId = state.scenes[0].id
		h +=
			'<div class="spane scene-workspace">' +
			sceneListPane() +
			'<div class="sdetail">' + sceneTools() +
			sceneDetail(sceneById(ui.sceneId)) +
			"</div>" +
			"</div>"
		return h
	}

	// まとめて作る（ボタンを押したときのポップアップ）
	function bulkBlock() {
		return (
			'<p class="hint">' + T("scenes2.003") + '</p>' +
			'<textarea id="bulkText" rows="9" style="width:100%" placeholder="' + T("scenes2.004") + '"></textarea>' +
			'<div class="row"><button class="btn pri" id="bulkAdd">' + T("scenes2.005") + '</button>' +
			'<label class="btn">' + T("scenes2.006") + '<input type="file" id="bulkFile" accept=".csv,.tsv,.txt,text/csv" hidden></label></div>' +
			'<p class="hint">' + T("scenes2.007") + '<b>' + T("scenes2.008") + '</b>' + T("scenes2.009") + '</p>' +
			'<p class="hint">' + T("scenes2.010") + '</p>'
		)
	}

	// 選んでいるシーン（チェック分）
	function selIds() {
		if (!ui.sceneSel) ui.sceneSel = []
		ui.sceneSel = ui.sceneSel.filter(function (id) {
			return !!sceneById(id)
		})
		return ui.sceneSel
	}
	var SCENE_BACKGROUND_MODES = ["room", "foreground", "image", "none"]
	function sceneBackgroundMode(s) {
		if (!s || SCENE_BACKGROUND_MODES.indexOf(s.backgroundMode) < 0) return "room"
		return s.backgroundMode
	}
	function sceneForegroundUrl(s) {
		return (s && s.foregroundUrl) || state.room.foregroundUrl || null
	}
	function sceneBackgroundUrl(s) {
		var mode = sceneBackgroundMode(s)
		if (mode === "none") return null
		if (mode === "foreground") return sceneForegroundUrl(s)
		if (mode === "image") return (s && s.backgroundUrl) || null
		return state.room.backgroundUrl || null
	}
	function applyRoomDesignToScenes(ids, ask) {
		var targets = state.scenes.filter(function (s) { return ids.indexOf(s.id) >= 0 })
		if (!targets.length) return false
		if (ask && !window.confirm(T("scenes2.011", targets.length))) return false
		historyWatch()
		targets.forEach(function (s) {
			s.fieldWidth = state.room.fieldWidth
			s.fieldHeight = state.room.fieldHeight
			s.fieldObjectFit = "cover"
			s.displayGrid = state.room.displayGrid === true
			s.overrides = {}
		})
		render()
		toast(targets.length + T("scenes2.012"), "ok")
		return true
	}
	// 左の一覧（シーン名と前景だけ）
	function sceneListPane() {
		var sel = selIds()
		var h =
			'<div class="slistwrap scene-list-pane"><div class="scene-pane"><h2>' + T("scenes2.013") + '<span class="sub">' +
			state.scenes.length +
			T("scenes2.014") + "</span></h2>" +
			'<div class="row srow scene-select-tools"><button class="x' +
			(ui.multiPick ? " on" : "") +
			'" id="pickMode">' +
			(ui.multiPick ? T("scenes2.015") : T("scenes2.016")) +
			'</button><button class="x" id="selAll">' + T("home.099") + '</button>' +
			(sel.length
				? '<button class="x" id="selClear">' + T("scenes2.017") + sel.length + "）</button>"
				: "") +
			"</div>" +
			'<div class="row srow scene-selected-tools"><button class="x" id="openRen">' + T("matlist.009") + '</button>' +
			(sel.length
				? '<button class="x" id="selUp">' + T("scenes2.018") + '</button>' +
					'<button class="x" id="selDown">' + T("scenes2.019") + '</button>' +
					'<button class="x" id="selTop">' + T("story.007") + '</button>' +
					'<button class="x" id="selBottom">' + T("story.008") + '</button></div>'
				: "</div>") +
			'<div class="slist">'
		state.scenes.forEach(function (s, i) {
			var th = s.foregroundUrl ? thumbOf(s.foregroundUrl) : ""
			h +=
				'<div class="sitem' +
				(ui.sceneId === s.id ? " sel" : "") +
				(sel.indexOf(s.id) >= 0 ? " chk" : "") +
				'" draggable="true" data-sdrag="' +
				s.id +
				'" data-sceneclick="' +
				s.id +
				'"><span class="no">' +
				(i + 1) +
				"</span>" +
				(th ? '<img src="' + th + '" alt="">' : '<span class="ph">—</span>') +
				'<span class="nm">' +
				esc(s.name || T("matlist.067")) +
				"</span>" +
				'<span class="marks">' +
				(sceneTachieMarkers(s).length ? "🧍" : "") +
				((s.cutins || []).length ? "🔔" : "") +
				((s.extraMarkers || []).filter(function (m) {
					return m.kind !== "tachie"
				}).length
					? "✨"
					: "") +
				"</span></div>"
		})
		h +=
			'</div><p class="hint">' + T("scenes2.020") + '<b>' + T("scenes2.021") + '</b>' + T("scenes2.022") + '<b>' + T("scenes2.023") + '</b>' + T("scenes2.024") + '</p>' +
			'<p class="hint">' + T("scenes2.025") + '</p></div></div>'
		return h
	}
	// 一覧のスクロール位置を保つため、選んだ印と右の詳細だけを描き直す
	function selectSceneSoft() {
		var sel = selIds()
		var box = $(".sdetail")
		if (!box) return render()
		rememberSceneAdvancedUiState()
		all("[data-sdrag]").forEach(function (el) {
			el.classList.toggle("sel", el.dataset.sdrag === ui.sceneId)
			el.classList.toggle("chk", sel.indexOf(el.dataset.sdrag) >= 0)
		})
		box.innerHTML = sceneTools() + sceneDetail(currentScene())
		positionSceneClipDock()
		renderRight()
	}
	function moveSel(dir) {
		var sel = selIds()
		if (!sel.length) return toast(T("scenes2.026"), "warn")
		var idx = []
		state.scenes.forEach(function (s, i) {
			if (sel.indexOf(s.id) >= 0) idx.push(i)
		})
		if (dir < 0) {
			if (idx[0] === 0) return
			idx.forEach(function (i) {
				var tmp = state.scenes[i - 1]
				state.scenes[i - 1] = state.scenes[i]
				state.scenes[i] = tmp
			})
		} else {
			if (idx[idx.length - 1] === state.scenes.length - 1) return
			idx
				.slice()
				.reverse()
				.forEach(function (i) {
					var tmp = state.scenes[i + 1]
					state.scenes[i + 1] = state.scenes[i]
					state.scenes[i] = tmp
				})
		}
		render()
	}
	function moveSelTo(pos) {
		var sel = selIds()
		if (!sel.length) return toast(T("scenes2.026"), "warn")
		var picked = state.scenes.filter(function (s) {
			return sel.indexOf(s.id) >= 0
		})
		var rest = state.scenes.filter(function (s) {
			return sel.indexOf(s.id) < 0
		})
		var at = Math.max(0, Math.min(pos, rest.length))
		state.scenes = rest.slice(0, at).concat(picked, rest.slice(at))
		render()
	}
	function moveSelBefore(targetId) {
		var sel = selIds()
		if (!sel.length || sel.indexOf(targetId) >= 0) return
		var rest = state.scenes.filter(function (s) {
			return sel.indexOf(s.id) < 0
		})
		var at = -1
		rest.forEach(function (s, i) {
			if (s.id === targetId && at < 0) at = i
		})
		if (at < 0) return
		moveSelTo(at)
	}

	// 設定のコビー＆貼り付け
	function sceneClipGrab(id) {
		var s = sceneById(id)
		if (!s) return
		ui.clip = JSON.parse(
			JSON.stringify({
				id: s.id,
				name: s.name || "",
				foregroundUrl: s.foregroundUrl || null,
				backgroundUrl: s.backgroundUrl || null,
				backgroundMode: sceneBackgroundMode(s),
				fieldWidth: s.fieldWidth,
				fieldHeight: s.fieldHeight,
				fieldObjectFit: s.fieldObjectFit,
				displayGrid: s.displayGrid,
				text: s.text || "",
				note: s.note || "",
				overrides: s.overrides || {},
				extraMarkers: s.extraMarkers || [],
				cutins: s.cutins || [],
			}),
		)
		render()
		toast(T("scenes2.027", (s.name || T("scenes2.028"))), "ok")
	}
	function pasteTargets() {
		var ids = selIds()
		var list = ids.length
			? state.scenes.filter(function (s) {
					return ids.indexOf(s.id) >= 0
				})
			: [sceneById(ui.sceneId)]
		return list.filter(function (s) {
			return !!s
		})
	}
	function sceneClipPaste(kind) {
		var c = ui.clip
		if (!c) return toast(T("scenes2.029"), "warn")
		var list = pasteTargets()
		if (!list.length) return toast(T("scenes2.030"), "warn")
		list.forEach(function (s) {
			if (kind === "all" || kind === "text") {
				s.text = c.text || ""
				s.note = c.note || ""
			}
			if (kind === "all" || kind === "img") {
				s.foregroundUrl = c.foregroundUrl || null
				s.backgroundUrl = c.backgroundUrl || null
				s.backgroundMode = c.backgroundMode || "room"
				if(c.fieldWidth!==undefined)s.fieldWidth=c.fieldWidth
				if(c.fieldHeight!==undefined)s.fieldHeight=c.fieldHeight
				if(c.fieldObjectFit!==undefined)s.fieldObjectFit=c.fieldObjectFit
				if(c.displayGrid!==undefined)s.displayGrid=c.displayGrid
			}
			if (kind === "all" || kind === "ov")
				s.overrides = JSON.parse(JSON.stringify(c.overrides || {}))
			if (kind === "all" || kind === "cut") s.cutins = (c.cutins || []).slice()
			if (kind === "all" || kind === "tachie" || kind === "em") {
				var keep = (s.extraMarkers || []).filter(function (m) {
					if (kind === "tachie") return m.kind !== "tachie"
					if (kind === "em") return m.kind === "tachie"
					return false
				})
				var add = JSON.parse(JSON.stringify(c.extraMarkers || [])).filter(function (m) {
					if (kind === "tachie") return m.kind === "tachie"
					if (kind === "em") return m.kind !== "tachie"
					return true
				})
				add.forEach(function (m) {
					m.id = C.newId()
				})
				s.extraMarkers = keep.concat(add)
			}
			layoutTachie(s)
		})
		syncTachie()
		render()
		toast(list.length + T("scenes2.031"), "ok")
	}
	// コビー中のときだけ出る貼り付けバー
	function clipMiniPv(c) {
		var tcs = (c.extraMarkers || []).filter(function (m) {
			return m.kind === "tachie"
		})
		var ems = (c.extraMarkers || []).length - tcs.length
		return (
			'<div class="clippv">' +
			(c.foregroundUrl
				? '<img src="' + thumbOf(c.foregroundUrl) + '" alt="">'
				: '<span class="ph">' + T("scenes2.032") + '</span>') +
			'<div class="cplist">' +
			(tcs.length
				? tcs
						.map(function (m) {
							return '<span class="tag">🧍 ' + esc(tcMarkLabel(m)) + "</span>"
						})
						.join("")
				: '<span class="hint">' + T("scenes2.033") + '</span>') +
			'<span class="tag">' + T("scenes2.034") + ' ' +
			ems +
			'</span><span class="tag">' + T("board.087") + ' ' +
			((c.cutins || []).length) +
			"</span></div></div>"
		)
	}
	function sceneTools() {
		if (!ui.clip) return ""
		return '<div class="dockbar clipdock sceneclipdock">' + clipPanel() + '</div>'
	}

	function clipPanel() {
		var c = ui.clip
		var n = selIds().length
		if (!c) return ""
		var tcs=(c.extraMarkers||[]).filter(function(m){return m.kind==="tachie"}).length
		var ems=(c.extraMarkers||[]).length-tcs
		var btn = function (k, label, strong) {
			return '<button class="btn clip-paste-btn'+(strong?' pri clip-paste-all':'')+'" data-spaste="' + k + '">' + label + "</button>"
		}
		return (
			'<div class="clipdock-inner"><div class="clipdock-head"><h2>' + T("scenes2.035") + '</h2><button class="x clip-close tip" data-tip="' + T("scenes2.036") + '" data-spaste="clear" title="' + T("scenes2.037") + '" aria-label="' + T("scenes2.036") + '">×</button></div>'+
			'<div class="clipdock-layout"><section class="clip-source"><div class="clip-source-title"><span>' + T("scenes2.038") + '</span><strong>'+esc(c.name||T("matlist.067"))+'</strong></div>'+clipMiniPv(c)+
			'<p class="clip-target"><span>' + T("scenes2.039") + '</span><b>'+(n?T("scenes2.040", n):T("scenes2.041"))+'</b></p>'+
			'<div class="clip-notes"><p>' + T("scenes2.042") + '</p><p>' + T("scenes2.043") + '</p></div></section>'+
			'<section class="clip-actions"><h3>' + T("scenes2.044") + '</h3>'+btn("all",T("scenes2.045"),true)+'<div class="clip-action-grid">'+
			btn("tachie",T("scenes2.046", tcs))+
			btn("em",T("scenes2.047", ems))+
			btn("cut",T("scenes2.048", ((c.cutins||[]).length)))+
			btn("ov",T("scenes2.049"))+
			btn("text",T("scenes2.050"))+
			btn("img",T("scenes2.051"))+
			'</div></section></div></div>'
		)
	}
	function renPanel() {
		return (
			'<div class="card"><h2>' + T("matlist.009") +
			'<button class="btn kill" data-stool="">' + T("scenes2.052") + '</button></h2>' +
			renameBlock() +
			"</div>"
		)
	}
	function sceneNameBlock() {
		var sc = sceneById(ui.nameEditId)
		if (!sc) return '<p class="hint">' + T("scenes2.053") + '</p>'
		return '<p class="hint">' + T("scenes2.054") + '</p><input id="snameText" class="w3" value="' + esc(sc.name || "") + '" placeholder="' + T("scenes2.055") + '"><div class="row"><button class="btn pri" id="snameGo">' + T("matlist.068") + '</button></div>'
	}
	function applySceneName() {
		var sc = sceneById(ui.nameEditId)
		var el = $("#snameText")
		if (!sc || !el) return
		var v = el.value.trim()
		if (!v) return toast(T("scenes2.056"), "warn")
		sc.name = v
		ui.modal = null
		render()
	}

	// 名前をまとめて直す
	function renameList() {
		var ids = selIds()
		return ids.length
			? state.scenes.filter(function (s) {
					return ids.indexOf(s.id) >= 0
				})
			: state.scenes
	}
	function renameBlock() {
		var list = renameList()
		if (!list.length) return '<p class="hint">' + T("scenes2.057") + '</p>'
		ui.renIds = list.map(function (s) {
			return s.id
		})
		var h =
			'<p class="hint">' + T("scenes2.058") +
			(selIds().length ? T("scenes2.059") + "<b>" + T("scenes2.060") + "</b>" + T("scenes2.061") : T("scenes2.059") + "<b>" + T("scenes2.062") + "</b>" + T("scenes2.061")) +
			"</p>" +
			'<div class="renwrap"><div class="reneditor"><div class="ren-gutter" id="srenGutter" aria-hidden="true">' +
			list.map(function (_, i) { return '<span>' + (i + 1) + '</span>' }).join("") +
			'</div><textarea id="srenText" wrap="off" rows="' +
			Math.min(20, Math.max(6, list.length)) +
			'" spellcheck="false">' +
			esc(
				list
					.map(function (s) {
						return s.name || ""
					})
					.join("\n"),
			) +
			'</textarea></div><div class="renlist">'
		list.forEach(function (s, i) {
			var th = s.foregroundUrl ? thumbOf(s.foregroundUrl) : ""
			h +=
				'<div class="r"><span class="no">' +
				(i + 1) +
				"</span>" +
				(th ? '<img src="' + th + '" alt="">' : '<span class="ph">—</span>') +
				'<span class="nm">' +
				esc(s.name || T("matlist.067")) +
				"</span></div>"
		})
		return (
			h +
			'</div></div><div class="row"><button class="btn pri" id="srenGo">' + T("matlist.068") + '</button>' +
			'<span class="hint">' + T("scenes2.063") + '</span></div>'
		)
	}
	function initSceneRenameGutter() {
		var ta = $("#srenText"), gutter = $("#srenGutter")
		if (!ta || !gutter) return
		var sync = function () { gutter.scrollTop = ta.scrollTop }
		ta.addEventListener("scroll", sync)
		sync()
	}
	function applyRename() {
		var ta = $("#srenText")
		if (!ta) return
		var lines = ta.value.split("\n")
		var ids = ui.renIds || []
		var n = 0
		ids.forEach(function (id, i) {
			var s = sceneById(id)
			if (!s) return
			var v = (lines[i] || "").trim()
			if (!v || v === s.name) return
			s.name = v
			n++
		})
		ui.modal = null
		render()
		toast(n + T("scenes2.064"), "ok")
	}

	// 右の詳細
	function sceneDetailLegacy(s) {
		if (!s) return '<p class="hint">' + T("scenes2.065") + '</p>'
		var h = ""
		var i = state.scenes.indexOf(s)
		;(function () {
			h +=
				'<div class="card scene' +
				(ui.sceneId === s.id ? " sel" : "") +
				'" data-sceneclick="' +
				s.id +
				'"><div class="row">' +
				'<span class="no">' +
				(i + 1) +
				"</span>" +
				'<input class="w2" data-scene="name" data-id="' + s.id + '" value="' + esc(s.name || "") + '" placeholder="' + T("scenes2.055") + '">' +
				'<button class="x" data-dupscene="' +
				s.id +
				'">' + T("maker.050") + '</button>' +
				'<button class="x" data-up="' +
				s.id +
				'">↑</button><button class="x" data-down="' +
				s.id +
				'">↓</button>' +
				'<button class="x" data-delscene="' +
				s.id +
				'">' + T("home.094") + '</button></div>' +
				'<button class="scene-bookmark tip" data-tip="' + T("scenes2.066") + '" data-scopy="'+s.id+'" title="' + T("scenes2.066") + '">🔖</button>' +
				'<div class="scene-mainline"><label class="scene-foreground">' + roleName("前景") + ''+imgSelect(s.foregroundUrl,'data-scene="foregroundUrl" data-id="'+s.id+'"')+'</label><label class="fld grow">' + T("board.118") + '<textarea data-scene="note" data-id="'+s.id+'" rows="2" placeholder="' + T("scenes2.067") + '">'+esc(s.note||'')+'</textarea></label></div>'+
				'<details class="scene-switchtext"><summary>' + T("scenes2.068")+(s.text?T("scenes2.069"):'')+'</summary><textarea data-scene="text" data-id="'+s.id+'" rows="3" placeholder="' + T("scenes2.070") + '">'+esc(s.text||'')+'</textarea></details>'+
				sceneTachieBlock(s) +
				sceneEffectBlock(s) +
				sceneCutinBlock(s)

			if (state.baseMarkers.length) {
				h +=
					'<details class="sec" id="secOv"' +
					(ui.openOv ? " open" : "") +
					'><summary>' + T("scenes2.071") + '</summary>' +
					'<div class="row"><button class="x" data-resetscene="' +
					s.id +
					'" title="' + T("scenes2.072") + '">' + T("scenes2.073") +
					scenePosCount(s) +
					'）</button><button class="x" data-resetall="1" title="' + T("scenes2.074") + '">' + T("scenes2.075") +
					allPosCount() +
					"）</button></div>"
				state.baseMarkers.forEach(function (b) {
					if (partsRole(b) === "panel") return
					var ov = s.overrides[b.id]
					var hidden = ov === null
					h +=
						'<div class="row ov"><button class="pname lnk" data-srcedit="part" data-src-id="' +
						b.id +
						'" title="' + T("panels.005") + '">' +
						(partsRole(b) === "panel" ? "🪟 " : "🧩 ") +
						esc(b.name) +
						"</button>" +
						"<label>" + T("scenes2.076") + " " +
						imgSelect(
							ov && ov.imageUrl ? ov.imageUrl : "",
							'data-ov="imageUrl" data-scene-id="' + s.id + '" data-part-id="' + b.id + '"',
							T("scenes2.077"),
						) +
						"</label>" +
						'<label>' + T("board.120") + ' <input type="number" step="0.5" class="w1" data-ov="x" data-scene-id="' +
						s.id +
						'" data-part-id="' +
						b.id +
						'" value="' +
						(ov && ov.x != null ? ov.x : "") +
						'" placeholder="' +
						b.x +
						'"></label>' +
						'<label>' + T("board.121") + ' <input type="number" step="0.5" class="w1" data-ov="y" data-scene-id="' +
						s.id +
						'" data-part-id="' +
						b.id +
						'" value="' +
						(ov && ov.y != null ? ov.y : "") +
						'" placeholder="' +
						b.y +
						'"></label>' +
						'<label><input type="checkbox" data-ov="hide" data-scene-id="' +
						s.id +
						'" data-part-id="' +
						b.id +
						'"' +
						(hidden ? " checked" : "") +
						"> " + T("scenes2.078") + "</label>" +
						(b.scope === "scene"
							? '<label class="lockchip' +
								(ov && ov.show ? " on" : "") +
								'"><input type="checkbox" data-ov="show" data-scene-id="' +
								s.id +
								'" data-part-id="' +
								b.id +
								'"' +
								(ov && ov.show ? " checked" : "") +
								"> " + T("scenes2.079") + "</label>"
							: "") +
						"</div>"
				})
				h += "</details>"
			}
			h += "</div>"
		})()
		return h
	}

	function sceneDetail(s) {
		if (!s) return '<p class="hint">' + T("scenes2.065") + '</p>'
		var i=state.scenes.indexOf(s), fw=s.fieldWidth!=null?s.fieldWidth:state.room.fieldWidth, fh=s.fieldHeight!=null?s.fieldHeight:state.room.fieldHeight
		var autoCrop=s.fieldObjectFit!=="fill", grid=s.displayGrid!==undefined?s.displayGrid===true:state.room.displayGrid===true
		var bgMode=sceneBackgroundMode(s), selectedCount=selIds().length
		var bgOptions='<option value="room"'+(bgMode==="room"?' selected':'')+'>' + T("scenes2.080") + '</option><option value="foreground"'+(bgMode==="foreground"?' selected':'')+'>' + T("scenes2.081") + '</option><option value="image"'+(bgMode==="image"?' selected':'')+'>' + T("scenes2.082") + '</option><option value="none"'+(bgMode==="none"?' selected':'')+'>' + T("board.108") + '</option>'
		return '<div class="scene-editor scene'+(ui.sceneId===s.id?' sel':'')+'" data-sceneclick="'+s.id+'"><div class="scene-editor-content">'+
			'<div class="scene-editor-head"><span class="no">'+(i+1)+'</span><input class="w2 grow" data-scene="name" data-id="'+s.id+'" value="'+esc(s.name||'')+'" placeholder="' + T("scenes2.055") + '"><div class="scene-editor-actions"><button class="x" data-dupscene="'+s.id+'">' + T("maker.050") + '</button><button class="x" data-up="'+s.id+'">↑</button><button class="x" data-down="'+s.id+'">↓</button><button class="x" data-delscene="'+s.id+'">' + T("home.094") + '</button><button class="x tip" data-tip="' + T("scenes2.066") + '" data-scopy="'+s.id+'">🔖</button></div></div>'+
			'<div class="scene-mainline"><label class="scene-foreground"><span class="scene-field-label">' + roleName("前景") + '</span>'+imgSelect(s.foregroundUrl,'data-scene="foregroundUrl" data-id="'+s.id+'"')+'</label><label class="fld grow scene-memo"><span class="scene-field-label">' + T("board.118") + '</span><textarea data-scene="note" data-id="'+s.id+'" rows="2" placeholder="' + T("scenes2.067") + '">'+esc(s.note||'')+'</textarea></label></div>'+
			'<details class="scene-advanced" data-scene-advanced="'+s.id+'"'+(ui.sceneAdvancedOpenId===s.id?' open':'')+'><summary>' + T("room.050") + '</summary><div class="scene-advanced-body"><div class="scene-text-pair"><label class="fld">' + T("board.109") + '<textarea data-scene="text" data-id="'+s.id+'" rows="3" placeholder="' + T("scenes2.070") + '">'+esc(s.text||'')+'</textarea></label><div class="scene-text-preview"><b>' + T("scenes2.083") + '</b><pre id="sceneTextPreview">'+esc(sceneText(s)||T("imgbtn.001"))+'</pre></div></div><div class="scene-advanced-grid"><fieldset><legend>' + T("scenes2.084") + '</legend><label>' + T("maker.041") + ' <input class="w1" type="number" min="1" data-scene="fieldWidth" data-id="'+s.id+'" value="'+fw+'"> ' + T("room.022") + '</label><label>' + T("maker.042") + ' <input class="w1" type="number" min="1" data-scene="fieldHeight" data-id="'+s.id+'" value="'+fh+'"> ' + T("room.022") + '</label></fieldset><label><input type="checkbox" data-scene="autoCrop" data-id="'+s.id+'"'+(autoCrop?' checked':'')+'> ' + T("scenes2.085") + '</label><label><input type="checkbox" data-scene="displayGrid" data-id="'+s.id+'"'+(grid?' checked':'')+'> ' + T("scenes2.086") + '</label></div><div class="scene-background-settings"><label>' + T("scenes2.087") + '<select data-scene="backgroundMode" data-id="'+s.id+'">'+bgOptions+'</select></label>'+(bgMode==='image'?imgSelect(s.backgroundUrl,'data-scene="backgroundUrl" data-id="'+s.id+'" data-pick-role="背景"',T("maker.038")):'')+'</div><div class="scene-room-apply"><b>' + T("scenes2.088") + '</b><div class="row"><button class="btn sm" data-roomapply="current" data-id="'+s.id+'">' + T("scenes2.028") + '</button><button class="btn sm" data-roomapply="selected"'+(selectedCount?'':' disabled')+'>' + T("scenes2.089")+selectedCount+'）</button><button class="btn sm" data-roomapply="all">' + T("scenes2.062") + '</button></div><span class="hint">' + T("scenes2.090") + '</span></div></div></details>'+
			sceneTachieBlock(s)+sceneEffectPane(s)+sceneCutinBlock(s)+sceneCommonPartsPane(s)+'</div></div>'
	}

	function kpSkillRow(c, sk, si, skillLabel) {
		var head = si === 0
		return '<div class="npc-skill-row' + (head ? ' first' : '') + '">' +
			'<label class="npc-skill-name">' + (head ? '<span>' + T("scenes2.091") + '</span>' : '') + '<input data-skill="name" data-cid="' + c.id + '" data-si="' + si + '" value="' + esc(sk.name || "") + '" placeholder="' + T("scenes2.092") + '"></label>' +
			'<label class="npc-skill-value">' + (head ? '<span>' + skillLabel + '</span>' : '') + '<input type="number" data-skill="value" data-cid="' + c.id + '" data-si="' + si + '" value="' + (sk.value == null ? "" : sk.value) + '" placeholder="50"></label>' +
			'<label class="npc-skill-damage">' + (head ? '<span>' + T("scenes2.093") + '</span>' : '') + '<input data-skill="damage" data-cid="' + c.id + '" data-si="' + si + '" value="' + esc(sk.damage || "") + '" placeholder="' + T("scenes2.094") + '"></label>' +
			'<button class="x npc-skill-del" data-delskill="' + c.id + '" data-si="' + si + '" title="' + T("scenes2.095") + '">×</button></div>'
	}

	function viewChars() {
		var kp = kpBag()
		var sys = kp.system
		var isCoc = sys.indexOf("coc") === 0
		var def = KPDEF[sys]
		var tpl = kp.tpl[sys] || def
		if (!Array.isArray(kp.skills)) kp.skills = []
		var h = '<div class="card char-system-settings"><h2>' + T("chars.001") + '<span class="sub">' + T("chars.002") + '</span></h2><div class="char-system-row"><label>' + T("chars.003") + '<select data-kpsys>'
		;[
			["coc6", T("chars.004")],
			["coc7", T("chars.005")],
			["emoklore", T("chars.006")],
		].forEach(function (o) {
			h += '<option value="' + o[0] + '"' + (sys === o[0] ? " selected" : "") + ">" + o[1] + "</option>"
		})
		h += "</select></label>"
		if (isCoc) {
			h += '<label>' + T("chars.007") + '<select data-kpcheck>'
			;["CCB<=", "CC<="].forEach(function (o) {
				h += '<option value="' + o + '"' + ((kp.checkType || "CCB<=") === o ? " selected" : "") + ">" + o + "</option>"
			})
			h += "</select></label>"
		}
		h += "</div></div>"
		h += '<div class="card kp-generator"><h2>' + T("chars.008") + '</h2>'
		h += '<p class="hint">' + T("chars.009") + '</p>'
		h += '<div class="npc-skills kp-own-skills"><h3>' + T("chars.010") + '</h3>' + (kp.skills||[]).map(function(sk,si){return '<div class="npc-skill-row kp-skill-row"><input class="grow" data-kpskill="name" data-ksi="'+si+'" value="'+esc(sk.name||'')+'" placeholder="' + T("scenes2.091") + '"><input type="number" data-kpskill="value" data-ksi="'+si+'" value="'+(sk.value==null?'':sk.value)+'" placeholder="' + T("chars.011") + '"><button class="x kp-skill-del" data-kpskilldel="'+si+'" title="' + T("scenes2.095") + '">×</button></div>'}).join('') + '<button class="btn" id="kpSkillAdd">' + T("chars.012") + '</button></div>'
		h += '<details data-kpfold="pcs"'+(ui.kpFolds.pcs?' open':'')+'><summary>' + T("chars.013") + '</summary>'
		;(kp.pcs || []).forEach(function (nm, i) {
			h +=
				'<div class="row"><input class="grow" data-kppc="' +
				i +
				'" value="' +
				esc(nm) +
				'" placeholder="' + T("chars.014") + '">' +
				'<button class="x" data-kppcdel="' +
				i +
				'">×</button></div>'
		})
		h += '<button class="btn sm" id="kpPcAdd">' + T("chars.015") + '</button></details>'
		h += '<details class="kp-template" data-kpfold="template"'+(ui.kpFolds.template?' open':'')+'><summary>' + T("chars.016") + '</summary><div class="kp-shared-tools"><span class="hint">' + T("chars.017") + '</span><select data-kptplshared><option value="">' + T("chars.018") + '</option>'+(settingsBag().kpTemplates||[]).map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+'（'+esc(x.system)+'）</option>'}).join('')+'</select><button class="btn sm" id="kpTplSharedLoad">' + T("chars.019") + '</button><button class="btn sm" id="kpTplSharedSave">' + T("chars.020") + '</button><button class="x" id="kpTplSharedDelete">' + T("home.094") + '</button></div><div class="kp-template-list">'
		;[
			["main", T("chars.021")],
			["scene", T("chars.022")],
			["memo", T("board.118")],
		].forEach(function (t) {
			h +=
				'<label class="kp-template-field"><b>' + t[1] + '</b>' +
				'<textarea data-kptpl="' + t[0] + '" rows="6">' +
				esc((tpl && tpl[t[0]]) || "") + '</textarea></label>'
		})
		h += "</div></details>"
		h += '<button class="btn pri kp-generate" id="kpGen">' + T("chars.023") + '</button>'
		h += "</div>"
		h += '<div class="card"><h2>' + T("chars.024") + '</h2>' + '<p class="hint">' + T("chars.025") + '</p>' + '<div class="row char-add-tools"><button class="btn pri" data-addnpc="enemy">' + T("chars.026") + '</button><button class="btn" data-addnpc="ally">' + T("chars.027") + '</button><button class="btn" id="addChar">' + T("chars.028") + '</button></div>'
		state.characters.forEach(function (c) {
			var tag = c.isKp ? T("home.084") : c.kind === "enemy" ? T("home.085") : c.kind === "ally" ? T("home.086") : T("home.087")
			h +=
				'<div class="block npc-card" data-char-card="'+c.id+'"><div class="row npc-head"><span class="tag">' +
				tag +
				'</span><input class="w2" data-char="name" data-id="' +
				c.id +
				'" value="' +
				esc(c.name) +
				'" placeholder="' + T("solid.003") + '">' +
				"<label>" + T("chars.029") + " " +
				imgSelect(c.iconUrl, 'data-char="iconUrl" data-id="' + c.id + '"') +
				'</label>' +
				(c.isKp ? '' : '<label>HP <input type="number" class="w1" data-char="hp" data-id="' + c.id + '" value="' + (c.hp == null ? "" : c.hp) + '"></label><label>MP <input type="number" class="w1" data-char="mp" data-id="' + c.id + '" value="' + (c.mp == null ? "" : c.mp) + '"></label><button class="btn sm" data-chartplsave="'+c.id+'">' + T("panels.068") + '</button>') +
				'<button class="x" data-delchar="' +
				c.id +
				'">' + T("home.094") + '</button></div>'
			if (!Array.isArray(c.faces)) c.faces=[]
			h += '<details class="char-faces" data-charfaces="'+c.id+'"'+(ui.charFaceOpen[c.id]?' open':'')+'><summary>' + T("board.116") + ' <span>'+c.faces.length+T("home.025") + '</span></summary><div class="char-faces-body">' + c.faces.map(function(f,fi){return '<div class="row char-face-row">'+imgSelect(f.imageUrl,'data-charface="imageUrl" data-cid="'+c.id+'" data-fi="'+fi+'"',T("panels.015"))+'<input class="grow" data-charface="name" data-cid="'+c.id+'" data-fi="'+fi+'" value="'+esc(f.name||'')+'" placeholder="' + T("chars.030") + '"><button class="x" data-delface="'+c.id+'" data-fi="'+fi+'">×</button></div>'}).join('') + '<button class="btn" data-addface="'+c.id+'">' + T("chars.031") + '</button></div></details>'
			if (c.kind) {
				var sk2 = T(KPDEF[sys].skillLabel)
				var dl = T(KPDEF[sys].dodgeLabel)
				h +=
					'<div class="row npc-stats"><label>' + T("chars.032") + '<input type="number" class="w1" data-char="armor" data-id="' +
					c.id +
					'" value="' +
					(c.armor == null ? "" : c.armor) +
					'"></label><label>' +
					dl +
					'<input type="number" class="w1" data-char="dodge" data-id="' +
					c.id +
					'" value="' +
					(c.dodge == null ? "" : c.dodge) +
					'" ' +
					(c.noDodge ? "disabled" : "") +
					'></label><label><input type="checkbox" data-char="noDodge" data-id="' +
					c.id +
					'" ' +
					(c.noDodge ? "checked" : "") +
					">" + T("home.089") + "</label></div>"
				h += '<div class="npc-skills"><h3>' + T("board.115") + '</h3>'
				;(c.skills || []).forEach(function (sk, si) {
					h += kpSkillRow(c, sk, si, sk2)
				})
				h += '<button class="btn npc-addskill" data-addskill="' + c.id + '">' + T("chars.033") + '</button></div>'
			}
			h +=
				'<div class="row npc-textareas">' + '<label class="grow">' + T("board.117") + '<textarea data-char="commands" data-id="' +
				c.id +
				'" rows="4" placeholder="CCB<' + T("chars.034") + '">' +
				esc(c.commands || "") +
				"</textarea></label>" +
				'<label class="grow">' + T("board.118") + '<textarea data-char="memo" data-id="' +
				c.id +
				'" rows="4">' +
				esc(c.memo || "") +
				"</textarea></label></div></div>"
		})
		h += characterTemplateBlock()
		return h + "</div>"
	}

	var KEY_PREFS = {
		undo:"mod+z", redo:"mod+shift+z", save:"mod+s", saveAs:"mod+shift+s", export:"mod+e",
		panel:"mod+b", bottom:"mod+j", theme:"mod+shift+l", close:"escape",
		prevScene:"alt+arrowup", nextScene:"alt+arrowdown", newScene:"mod+shift+n",
		images:"alt+1", scenes:"alt+2", parts:"alt+3", tachie:"alt+4", panels:"alt+5",
		cutins:"alt+6", chars:"alt+7", story:"alt+8", room:"alt+9", settings:"alt+0", saveTab:"",
		partEdit:"mod+1", partLock:"mod+2", partVisible:"mod+3"
	}
	/* 切語言時要跟著變，所以不在載入時就算好 */
	function keyGroups() {
		return [
			[T("imgedit.096"),[["undo",T("chars.035")],["redo",T("chars.036")],["save",T("chars.037")],["saveAs",T("chars.038")],["export",T("chars.039")],["close",T("chars.040")]]],
			[T("chars.041"),[["panel",T("chars.042")],["bottom",T("chars.043")],["theme",T("chars.044")],["prevScene",T("chars.045")],["nextScene",T("chars.046")],["newScene",T("chars.047")]]],
			[T("chars.048"),[["images",T("render.020")],["scenes",T("render.022")],["parts",T("render.019")],["tachie",roleName("立ち絵")],["panels",T("home.070")],["cutins",T("settings.001")],["chars",T("render.025")],["story",T("render.024")],["room",T("chars.049")],["settings",T("render.031")],["saveTab",T("render.027")]]],
			[T("imgedit.108"),[["partEdit",T("chars.050")],["partLock",T("chars.051")],["partVisible",T("chars.052")]]]
		]
	}
	var keyRecording = null
	function keyBag(){try{return Object.assign({},KEY_PREFS,JSON.parse(localStorage.getItem(scopedStorageKey("ccfolia-zip-maker-keys-v2"))||localStorage.getItem(scopedStorageKey("ccfolia-zip-maker-keys-v1"))||"{}"))}catch(e){return Object.assign({},KEY_PREFS)}}
	function saveKeyBag(k){localStorage.setItem(scopedStorageKey("ccfolia-zip-maker-keys-v2"),JSON.stringify(k))}
	function keyNorm(code){return String(code||"").toLowerCase().replace(/command|cmd|control|ctrl/g,"mod").replace(/option/g,"alt").replace(/\s+/g,"").split("+").filter(Boolean).join("+")}
	function keyFromEvent(e){var k=String(e.key||"").toLowerCase();if(["control","meta","shift","alt"].indexOf(k)>=0)return null;if(k===" ")k="space";var p=[];if(e.metaKey||e.ctrlKey)p.push("mod");if(e.shiftKey)p.push("shift");if(e.altKey)p.push("alt");p.push(k);return p.join("+")}
	function keyLabel(code){if(!code)return T("chars.053");var mac=/Mac|iPhone|iPad/.test(navigator.platform||"");return code.split("+").map(function(x){return x==="mod"?(mac?"⌘":"Ctrl"):x==="shift"?"Shift":x==="alt"?(mac?"Option":"Alt"):x==="arrowup"?"↑":x==="arrowdown"?"↓":x==="arrowleft"?"←":x==="arrowright"?"→":x==="escape"?"Esc":x==="space"?"Space":x.toUpperCase()}).join(" + ")}
	function shortcutHit(e,code){code=keyNorm(code);if(!code)return false;return keyFromEvent(e)===code}
	function keyConflict(keys,act,code){if(!code)return null;return Object.keys(keys).filter(function(k){return k!==act&&keys[k]===code})[0]||null}
	function keyActionName(act){var gs=keyGroups();for(var g=0;g<gs.length;g++)for(var i=0;i<gs[g][1].length;i++)if(gs[g][1][i][0]===act)return gs[g][1][i][1];return act}
	function keyCard(){var k=keyBag(),h='<div class="card"><h2>' + T("chars.054") + '<span class="sub">' + T("chars.055") + '</span></h2><p class="hint">' + T("chars.056") + '</p>';keyGroups().forEach(function(g){h+='<h3 class="keygroup">'+g[0]+'</h3><div class="keygrid">';g[1].forEach(function(r){var rec=keyRecording===r[0];h+='<div class="keyrow"><span>'+r[1]+'</span><kbd class="keycap'+(!k[r[0]]?' empty':'')+'">'+keyLabel(k[r[0]])+'</kbd><button class="btn'+(rec?' pri':'')+'" data-keyrecord="'+r[0]+'">'+(rec?T("chars.057"):T("chars.058"))+'</button><button class="x" data-keyclear="'+r[0]+'">' + T("home.107") + '</button></div>'});h+='</div>'});return h+'<div class="row"><button class="btn" id="keyReset">' + T("chars.059") + '</button><span class="hint">' + T("chars.060") + '</span></div></div>'}
	var THEME_KEY=scopedStorageKey("ccfolia-zip-maker-theme-v1")
	function themeBag(){var v=localStorage.getItem(THEME_KEY)||"auto";return /^(auto|light|dark)$/.test(v)?v:"auto"}
	function resolvedTheme(v){return v==="auto"?(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):v}
	function applyTheme(v){v=v||themeBag();document.documentElement.dataset.theme=resolvedTheme(v);document.documentElement.dataset.themeSetting=v;var b=$("#themeQuick");if(b){b.textContent=document.documentElement.dataset.theme==="light"?"☀️":"🌙";b.title=T("chars.061", (v==="auto"?T("chars.062"):v==="light"?T("chars.063"):T("chars.064")))}}
	function setTheme(v){localStorage.setItem(THEME_KEY,v);applyTheme(v)}
	function cycleTheme(){var v=themeBag();setTheme(v==="auto"?"light":v==="light"?"dark":"auto");if(ui.tab==="settings")render()}
	function themeCard(){var v=themeBag();return '<div class="card"><h2>' + T("chars.065") + '<span class="sub">' + T("chars.066") + '</span></h2><div class="themeseg"><button class="btn'+(v==="auto"?' on':'')+'" data-themechoice="auto">' + T("chars.062") + '</button><button class="btn'+(v==="light"?' on':'')+'" data-themechoice="light">' + T("chars.067") + '</button><button class="btn'+(v==="dark"?' on':'')+'" data-themechoice="dark">' + T("chars.068") + '</button></div><p class="hint">' + T("chars.069") + '</p></div>'}
	function changeSceneBy(delta){if(!state.scenes.length)return;var i=state.scenes.findIndex(function(x){return x.id===ui.sceneId});i=i<0?0:Math.max(0,Math.min(state.scenes.length-1,i+delta));ui.sceneId=state.scenes[i].id;ui.tab="scenes";render()}
	function runPartShortcut(act){
		if(["partEdit","partLock","partVisible"].indexOf(act)<0)return false
		if(ui.tab!=="room")return false
		var selected=roomSelected();if(!selected.length){toast(T("chars.070"),"warn");return true}
		if(act==="partEdit"){
			if(selected.length!==1){toast(T("chars.071"),"warn");return true}
			ui.srcRef={kind:"part",id:selected[0].id,sceneId:null};ui.modal="src";render();return true
		}
		historyWatch()
		if(act==="partLock"){var lockTo=!selected.every(function(part){return !!part.lockMove});selected.forEach(function(part){part.lockMove=lockTo})}
		else if(act==="partVisible"){var showTo=!selected.every(function(part){return part.visible!==false});selected.forEach(function(part){part.visible=showTo})}
		else return false
		saveLocal();render();return true
	}
	function runShortcut(act){var tabs={images:"images",scenes:"scenes",parts:"parts",tachie:"tachie",panels:"panels",cutins:"cutins",chars:"chars",story:"story",room:"room",settings:"settings",saveTab:"save"};if(tabs[act]){ui.tab=tabs[act];render();return}if(runPartShortcut(act))return;if(act==="undo")undo();else if(act==="redo")redo();else if(act==="save")saveProjectSmart(false);else if(act==="saveAs")saveProjectSmart(true);else if(act==="export")doExport();else if(act==="panel"){ui.rightOpen=!ui.rightOpen;render()}else if(act==="bottom"){$("#btoggle")&&$("#btoggle").click()}else if(act==="theme")cycleTheme();else if(act==="prevScene")changeSceneBy(-1);else if(act==="nextScene")changeSceneBy(1);else if(act==="newScene"){ui.tab="scenes";render();setTimeout(function(){var q=$("#quickScene");if(q)q.focus()},0)}else if(act==="close"){if(pickTarget)closePicker();else if(ui.modal){if(ui.modal==="imageMaker"){releaseImageMaker();ui.imageMaker=null;pickBack=null}ui.modal=null;render()}else if(ui.rightOpen&&!ui.rightPinned){ui.rightOpen=false;render()}}}


	function viewSettings() {
		var st = settingsBag()
		var au = autoList()
		var canFs = typeof window.showSaveFilePicker === "function"
		var cat = ui.settingsCat || "display"
		var cats = [{v:"display",n:T("tset.001")},{v:"create",n:T("tset.002")},{v:"template",n:T("tset.003")},{v:"save",n:T("tset.004")}]
		var h = '<div class="settings-intro"><p>' + T("tset.005") + '</p><div class="settings-cats">'+cats.map(function(c){return '<button class="btn'+(cat===c.v?' on':'')+'" data-settingscat="'+c.v+'">'+c.n+'</button>'}).join('')+'</div></div><div class="settings-category">'
		if (cat === "display") h += themeCard() + keyCard()
		if (cat === "create") {
			h += '<div class="card"><h2>' + T("tset.006") + '<span class="sub">' + T("tset.007") + '</span></h2><div class="settings-zgrid"><label>' + T("home.096") + '<input type="number" id="setZPart" value="'+st.defaults.z.part+'"></label><label>' + T("home.047") + '<input type="number" id="setZPanel" value="'+st.defaults.z.panel+'"></label><label>' + roleName("立ち絵") + '<input type="number" id="setZTachie" value="'+st.defaults.z.tachie+'"></label><label>' + roleName("演出") + '<input type="number" id="setZEffect" value="'+st.defaults.z.effect+'"></label></div><p class="hint">' + T("tset.008") + '</p></div>' +
			'<div class="card"><h2>' + T("tset.009") + '<span class="sub">' + T("tset.007") + '</span></h2><div class="settings-default-grid settings-sizegrid"><label>' + T("home.096") + '<input type="number" step="0.5" id="setPart" value="'+(st.defaults.part||4)+'"></label><label>' + T("home.070") + '<input type="number" step="0.5" id="setPanelW" value="'+(st.defaults.panelW||0)+'"></label><label>' + roleName("立ち絵") + '<input type="number" step="0.5" id="setTachieH" value="'+(st.defaults.tachieH||18)+'"></label></div><p class="hint">' + T("tset.010") + '</p></div>' +
			'<div class="card"><h2>' + T("tset.011") + '<span class="sub">' + T("tset.012") + '</span></h2><div class="row"><input class="w3" id="setSyms" value="'+esc(st.syms.join(" "))+'" placeholder="└ ▶ 🔴 ◇ —"></div><p class="hint">' + T("tset.013") + '</p></div>' +
			'<div class="card"><h2>' + T("tset.014") + '<span class="sub">' + T("tset.015") + '</span></h2>' +
			'<p class="hint">' + T("tset.016") + ' <code>{' + T("tset.017") + '}</code> ' + T("tset.018") + '{' + T("tset.017") + '}' + T("tset.019") + '</p>'
			st.sites.forEach(function (x, i) {
				h +=
				'<div class="row"><input class="w2" data-site="n" data-si="' +
				i +
				'" value="' +
				esc(x.n) +
				'" placeholder="' + T("tset.020") + '"><input class="w3" data-site="u" data-si="' +
				i +
				'" value="' +
				esc(x.u) +
				'" placeholder="https://example.com/search?q={' + T("tset.017") + '}">' +
				'<button class="x" data-siteup="' +
				i +
				'" title="' + T("tset.021") + '">↑</button><button class="x" data-sitedown="' +
				i +
				'" title="' + T("tset.022") + '">↓</button><button class="x" data-delsite="' +
				i +
				'" title="' + T("board.049") + '">×</button></div>'
			})
			h += '<div class="row"><button class="btn pri" id="siteAdd">' + T("tset.023") + '</button><button class="btn" id="siteReset">' + T("tset.024") + '</button></div></div>'
		}
		if (cat === "template") h += emPresetCard(st) + tplManagerCard()
		if (cat === "save") {
			h += '<section class="settings-subsection"><div class="settings-subhead"><span class="eyebrow">SAVE</span><h2>' + T("tset.025") + '</h2></div><div class="card"><h2>' + T("tset.026") + '<span class="sub">' + T("tset.027") + '</span></h2>'
		if (!au.length) h += '<p class="hint">' + T("tset.028") + '</p>'
		else {
			h += '<div class="exlinks">'
			au.forEach(function (a) {
				h += '<button class="btn" data-auto="' + a.at + '">' + esc(timeLabel(a.at)) + " " + T("tset.029") + "</button>"
			})
			h += "</div>"
		}
			h += '<p class="hint">' + T("tset.030") + '</p></div>' +
			'<div class="card"><h2>' + T("tset.031") + '</h2>' +
			(canFs
				? '<div class="row"><button class="btn" id="pickSaveTarget">' + T("tset.032") + '</button></div>' +
					'<p class="hint">' + T("tset.033") + '</p>'
				: '<p class="hint">' + T("tset.034") + '</p>') +
			'</div></section><section class="settings-subsection settings-export"><div class="settings-subhead"><span class="eyebrow">EXPORT</span><h2>' + T("tset.035") + '</h2></div>' +
			'<div class="card room-output-settings"><h2>' + T("tset.036") + '</h2><div class="row"><label><input type="checkbox" id="roomBgmCrossfade"'+(state.room.bgmCrossfade!==false?' checked':'')+'> ' + T("tset.037") + '</label><label><input type="checkbox" id="roomLegacyDice"'+(state.room.useLegacyDice===true?' checked':'')+'> ' + T("tset.038") + '</label></div><p class="hint">' + T("tset.039") + '</p></div>' + noimageCard(st) + '</section>'
		}
		return h + "</div>"
	}

	function startNewRoom() {
		if (!window.confirm(T("tset.040"))) return
		packer = new C.Packer()
		projHandle = null
		state.project = T("project.new")
		state.room = { fieldWidth: 40, fieldHeight: 30, backgroundUrl: null, foregroundUrl: null, displayGrid: false, bgmCrossfade: true, useLegacyDice: false, tachieAlignBottom: true, tachieBottom: 15, tachieHeight: 18, tachieZ: 30, variables: [] }
		state.images = []
		state.baseMarkers = []
		state.tachie = []
		state.scenes = []
		state.characters = []
		state.effects = []
		state.sceneTemplates = []
		state.storyTexts = []
		state.kp = null
		state.memo = ""
		state.tasks = []
		ui.tab = "home"
		ui.lastWorkTab = "room"
		ui.sceneId = null
		ui.sceneSel = []
		ui.cutinSel = []
		ui.cutinSelectMode = false
		ui.clip = null
		ui.modal = null
		render()
		renderBottom()
		saveLocal()
		resetHistory()
		markProjectSaved()
		toast(T("tset.041"), "ok")
	}

	function viewSave() {
		return (
			'<div class="card"><h2>' + T("save.001") + '</h2>' +
			'<p class="hint">' + T("save.002") + '</p>' +
			'<div class="row"><button class="btn pri" id="saveProj">' + T("save.003") + '</button>' +
			'<label class="btn">' + T("chars.019") + '<input type="file" id="loadProj" accept=".ccproj,.json" hidden></label>' +
			'<span class="gap"></span><button class="btn kill" id="newRoom">' + T("save.004") + '</button></div></div>' +
			'<div class="card"><h2>' + T("save.005") + '</h2><ol class="how">' +
			"<li>" + T("save.006") + "</li>" +
			"<li>" + T("save.007") + "</li>" +
			"<li>" + T("save.008") + "</li>" +
			"<li>" + T("save.009") + "</li>" +
			"<li>" + T("save.010") + "</li>" +
			'</ol><p class="hint">' + T("save.011") + '</p></div>' +
			'<div class="card"><h2>' + T("save.012") + '</h2><ol class="how">' +
			"<li>" + T("save.013") + "<b>" + T("save.014") + "</b>" + T("save.015") + "</li>" +
			"<li>" + T("save.016") + "<b>" + T("save.017") + "</b>" + T("save.018") + "</li>" +
			"<li>" + T("save.019") + "</li>" +
			"</ol></div>" +
			'<div class="card"><h2>' + T("save.020") + '</h2><ol class="how">' +
			"<li><b>" + T("render.020") + "</b>" + T("save.021") + "</li>" +
			"<li><b>" + T("save.022") + "</b>" + T("save.023") + "</li>" +
			"<li><b>" + T("render.022") + "</b>" + T("save.024") + "</li>" +
			"<li>" + T("save.025") + "<b>" + T("render.019") + "</b>" + T("save.026") + "<b>" + T("save.027") + "</b>" + T("save.028") + "</li>" +
			"<li>" + T("save.029") + "<b>" + T("chars.039") + "</b>" + T("save.030") + "</li>" +
			"<li>" + T("save.031") + "</li>" +
			'</ol><p class="hint">' + T("save.032") + ' <code>' + T("cutins.002") + '</code> ' + T("save.033") + '</p></div>'
		)
	}

	/* ---------------- 右パネル ---------------- */
	function renderRight() {
		if (ui.tab === "room" || ui.tab === "parts" || ui.tab === "panels") { var emptyRight=$("#rbody"); if(emptyRight) emptyRight.innerHTML=""; return }
		all(".rtab").forEach(function (b) {
			b.classList.toggle("active", b.dataset.rtab === ui.rightTab)
		})
		if (!ui.rightOpen) return
		$("#rbody").innerHTML = ui.rightTab === "media" ? paneMedia() : panePreview()
		if (ui.rightTab === "preview") bindPreviewDrag()
	}

	function paneMedia() {
		if (!state.images.length)
			return '<p class="hint">' + T("rpanel.001") + '</p>'
		var sc = currentScene()
		var h =
			'<input id="mfilter" placeholder="' + T("matlist.006") + '" value="' +
			esc(ui.mediaFilter) +
			'" style="width:100%">' +
			'<div class="chips"><span class="chip' +
			(ui.mediaRoles.length ? "" : " on") +
			'" data-mrole="">' + T("home.099") + '</span>' +
			ROLES.map(function (r) {
				return (
					'<span class="chip' +
					(ui.mediaRoles.indexOf(r) >= 0 ? " on" : "") +
					'" data-mrole="' +
					r +
					'">' +
					roleName(r) +
					"</span>"
				)
			}).join("") +
			"</div>" +
			'<p class="hint">' +
			(sc ? T("rpanel.002") + "<b>" + esc(sc.name) + "</b>" : T("rpanel.003")) +
			"</p>" +
			'<div class="mgrid">'
		var q = ui.mediaFilter.toLowerCase()
		var n = 0
		state.images.forEach(function (im) {
			if (ui.mediaRoles.length) {
				var hit = false
				ui.mediaRoles.forEach(function (r) {
					if (hasRole(im, r)) hit = true
				})
				if (!hit) return
			}
			if (q && im.label.toLowerCase().indexOf(q) === -1) return
			n++
			h +=
				'<div class="mtile" draggable="true" data-mdrag="' +
				im.name +
				'"><img src="' +
				im.url +
				'" alt=""><div class="nm">' +
				esc(im.label) +
				'</div><div class="tags">' +
				rolesOf(im)
					.map(function (r) {
						return '<span class="tag r' + esc(r) + '">' + esc(roleName(r)) + "</span>"
					})
					.join("") +
				'</div><div class="acts">' +
				(sc
					? '<button data-setfg="' +
						im.name +
						'" title="' + T("rpanel.004") + '">' + T("rpanel.005") + '</button>'
					: "") +
				'<button data-tcfrom="' +
				im.name +
				'" title="' + T("rpanel.006") + '">' + T("rpanel.007") + '</button></div></div>'
		})
		if (!n) h += '<p class="hint">' + T("picker.009") + '</p>'
		return h + "</div>"
	}

	// マス座標 → プレビュー内の％
	function pct(v, span) {
		return ((v + span / 2) / span) * 100
	}
	function effective(b, sc) {
		var ov = sc ? sc.overrides[b.id] : undefined
		if (ov === null) return null // このシーンでは非表示
		var e = Object.assign({}, b, ov || {})
		var off = b.visible === false
		if (!off) return e
		// スクリーンパネルの画面では、出していないものもうすく見せて置き場所を決められるように
		if (ui.tab === "parts" || ui.tab === "panels") {
			e._ghost = true
			return e
		}
		return null
	}

	function panePreview() {
		var fw = state.room.fieldWidth,
			fh = state.room.fieldHeight
		// 部屋デザイン・スクリーンパネルの画面では、シーンに左右されない「部屋そのもの」を見せる
		normalizeFull()
		var roomOnly =
			ui.tab === "room" || ui.tab === "parts" || ui.tab === "panels" || ui.tab === "tachie"
		var sc = roomOnly ? null : currentScene()
		if(sc){fw=sc.fieldWidth!=null?sc.fieldWidth:fw;fh=sc.fieldHeight!=null?sc.fieldHeight:fh}
		var pvSet = settingsBag()
		var guideOn = ui.tab !== "tachie" && pvSet.guides !== false
		var gcol = pvSet.guideColor || "#7cc5ff"
		var bg = sc ? sceneBackgroundUrl(sc) : state.room.backgroundUrl
		var fg = sc ? sceneForegroundUrl(sc) : state.room.foregroundUrl
		var fgVisible = fg && (ui.pvHide || []).indexOf("__foreground__") < 0
		var pad = ui.tab === "room" ? 0 : (Number(ui.previewPad) || 0)
		var sceneToolbar = !roomOnly && ui.tab !== "tachie"
			? '<div class="scene-pv-toolbar"><span class="scene-pv-label">' + T("rpanel.008") + '</span>' +
				[{v:0,n:T("rpanel.009")},{v:12,n:T("rpanel.010")},{v:26,n:T("rpanel.011")}].map(function(o){return '<button class="chip'+(pad===o.v?' on':'')+'" data-pz="'+o.v+'">'+o.n+'</button>'}).join('') +
				'<i aria-hidden="true"></i><button class="x" data-scenezoom="-">−</button><b>'+Math.round((Number(ui.sceneZoom)||1)*100)+'%</b><button class="x" data-scenezoom="+">＋</button><span class="scene-pv-label">' + T("maker.042") + '</span>'+[{v:170,n:T("rpanel.012")},{v:220,n:T("maker.028")},{v:360,n:T("rpanel.013")}].map(function(o){return '<button class="chip'+(Number(ui.scenePvHeight)===o.v?' on':'')+'" data-sceneheight="'+o.v+'">'+o.n+'</button>'}).join('')+'<button class="chip'+(guideOn?' on':'')+'" data-guide="1">' + T("imgedit.092") + ' '+(guideOn?'ON':'OFF')+'</button><input class="scene-guide-color" type="color" id="pvGuideColor" value="'+esc(gcol)+'" title="' + T("rpanel.014") + '"><span class="scene-pv-panhelp">' + T("rpanel.015") + '</span></div>'
			: ""
		var h =
			(roomOnly
				? '<p class="hint">🎨 <b>' + T("rpanel.016") + '</b>' + T("rpanel.017") + '</p>'
				: "") +
			(roomOnly
				? ""
				: '<div class="row"><select id="psel" class="w3"><option value=""' +
			(sc ? "" : " selected") +
			">" + T("rpanel.018") + "</option>" +
			state.scenes
				.map(function (s, i) {
					return (
						'<option value="' +
						s.id +
						'"' +
						(sc && sc.id === s.id ? " selected" : "") +
						">" +
						(i + 1) +
						". " +
						esc(s.name) +
						"</option>"
					)
				})
				.join("") +
					"</select></div>") +
			(ui.tab === "room" || sceneToolbar ? "" : ('<div class="chips"><span class="hint">' + T("rpanel.008") + '</span>' +
			[
				{ v: 0, n: T("rpanel.009") },
				{ v: 12, n: T("rpanel.010") },
				{ v: 26, n: T("rpanel.011") },
			]
				.map(function (o) {
					return '<span class="chip' + (pad === o.v ? " on" : "") + '" data-pz="' + o.v + '">' + o.n + "</span>"
				}).join("") + "</div>")) +
			sceneToolbar +
			(ui.tab !== "tachie" && ui.tab !== "room" && !sceneToolbar
				? '<div class="chips"><span class="hint">' + T("rpanel.019") + '</span><span class="chip' +
					(guideOn ? " on" : "") +
					'" data-guide="1">' +
					(guideOn ? T("rpanel.020") : T("rpanel.021")) +
					'</span><label class="hint">' + T("solid.002") + ' <input type="color" id="pvGuideColor" value="' +
					esc(gcol) +
					'"></label></div>'
				: "") +
			'<div class="bwrap' +
			(pad && !sceneToolbar ? " zoom" : "") +
			'"' +
			(pad && !sceneToolbar
				? ' style="padding:' +
					(pad * (1 - (pad * 2) / 100) * (fh / fw)).toFixed(2) +
					"% " +
					pad +
					'%"'
				: "") +
			">" +
			'<div id="board"' + (sc ? ' data-role="scene-preview-board"' : '') + ' style="padding-top:' +
			((fh / fw) * 100).toFixed(2) +
			'%">' +
			(bg ? '<img class="bgimg"' + (sc ? ' data-role="scene-preview-background"' : '') + ' src="' + thumbOf(bg) + '" alt="">' : "") +
			(fgVisible ? '<img class="fgimg"' + (sc ? ' data-role="scene-preview-foreground"' : '') + ' src="' + thumbOf(fg) + '" alt="" style="object-fit:'+(sc&&sc.fieldObjectFit==="fill"?"fill":"cover")+'">' : "") +
			(guideOn
				? '<svg class="foreground-guide-outline" viewBox="0 0 100 100" preserveAspectRatio="none" style="--gc:' + esc(gcol) + '"><rect x="0.5" y="0.5" width="99" height="99"></rect><line x1="0" y1="0" x2="100" y2="100"></line><line x1="100" y1="0" x2="0" y2="100"></line><line x1="50" y1="0" x2="50" y2="100"></line><line x1="0" y1="50" x2="100" y2="50"></line></svg>'
				: "")

		if (ui.tab === "room") {
			roomPlaceholders().forEach(function(ph,i){var phH=Number(ph.height)||Number(state.room.tachieHeight)||18,phW=Math.max(5,Math.round(phH*.42*2)/2);h+='<div class="tachie-placeholder'+(ui.roomPhSel===ph.id?' sel':'')+'" data-roomph="'+ph.id+'" style="z-index:'+(roomZ().tachie||21)+';left:'+pct(Number(ph.x)||0,fw).toFixed(3)+'%;top:'+pct(Number(ph.y)||0,fh).toFixed(3)+'%;width:'+((phW/fw)*100).toFixed(3)+'%;height:'+((phH/fh)*100).toFixed(3)+'%"><i></i><b></b><u class="ph" title="' + T("rpanel.022") + '"></u><span>' + T("rpanel.023") + ' '+(i+1)+'</span></div>'})
		}
		var parts = state.baseMarkers
			.map(function (b) {
				return { base: b, eff: effective(b, sc) }
			})
			.filter(function (p) {
				return p.eff && (ui.pvHide || []).indexOf(p.base.id) < 0
			})
			.sort(function (a, b) {
				return (a.eff.z || 0) - (b.eff.z || 0)
			})
		parts.forEach(function (p) {
			var e = p.eff
			var frz = ui.tab === "panels" && partsRole(p.base) !== "panel"
			var lk = !!e.lockMove || frz
			var pt = frz
			var aspectLocked = keepAspect(e) && !!aspectOf(e)
			var aspectUnlocked = !keepAspect(e) && !!e.imageUrl
			h +=
				'<div class="pmark' +
				(ui.tab === "scenes" && ui.scenePvSel === p.base.id ? " sel" : "") +
				(lk ? " lk" : "") +
				(e._ghost ? " ghost" : "") +
				(pt ? " pth" : "") +
				(aspectLocked ? " aspect-locked" : "") +
				(aspectUnlocked ? " aspect-unlocked" : "") +
				'" data-mid="' +
				p.base.id +
				'"' +
				(lk ? ' data-nodrag="1"' : "") +
				' style="z-index:' +
				(Number(e.z) || 0) +
				';left:' +
				pct(e.x, fw).toFixed(3) +
				"%;top:" +
				pct(e.y, fh).toFixed(3) +
				"%;width:" +
				((e.width / fw) * 100).toFixed(3) +
				"%;height:" +
				((e.height / fh) * 100).toFixed(3) +
				'%">' +
				(e.imageUrl ? '<img src="' + thumbOf(e.imageUrl) + '" alt="">' : "") +
				(ui.tab==='room'&&ui.roomQuick&&ui.roomQuick.id===p.base.id&&ui.roomQuick.mode==='crop'?'<div class="rq-cropbox" style="left:'+(ui.roomQuick.q.cl||0)+'%;top:'+(ui.roomQuick.q.cu||0)+'%;width:'+(100-(ui.roomQuick.q.cl||0)-(ui.roomQuick.q.cr||0))+'%;height:'+(100-(ui.roomQuick.q.cu||0)-(ui.roomQuick.q.cb||0))+'%"><i data-rqhandle></i></div>':'') +
				(lk || e._ghost ? "" : '<i class="ph"></i>') +
				'<span class="plab">' +
				(lk ? "🔒 " : "") +
				(pt ? "🫧 " : "") +
				esc(p.base.name) +
				"</span></div>"
		})
		// そのシーンだけの演出マーカー
		if (sc && sc.extraMarkers && sc.extraMarkers.length) {
			sc.extraMarkers
				.slice()
				.filter(function (m) {
					return (ui.pvHide || []).indexOf(m.id) < 0
				})
				.sort(function (a, b) {
					return (a.z || 0) - (b.z || 0)
				})
				.forEach(function (m) {
					h +=
						'<div class="pmark em' +
						(ui.tab === "scenes" && ui.scenePvSel === m.id ? " sel" : "") +
						(m.kind === "full" && m.fullFit !== "contain" ? " fill" : "") +
						(m.kind !== "full" && m.lockAspect === false ? " stretch" : "") +
						(m.lockMove ? " lk" : "") +
						'" data-emid="' +
						m.id +
						'"' +
						(m.lockMove ? ' data-nodrag="1"' : "") +
						' style="z-index:' +
						(Number(m.z) || 0) +
						';left:' +
						pct(m.x, fw).toFixed(3) +
						"%;top:" +
						pct(m.y, fh).toFixed(3) +
						"%;width:" +
						((m.width / fw) * 100).toFixed(3) +
						"%;height:" +
						((m.height / fh) * 100).toFixed(3) +
						'%">' +
						(m.imageUrl ? '<img src="' + thumbOf(m.imageUrl) + '" alt="">' : "") +
						(m.lockMove ? "" : '<i class="ph"></i>') +
						'<span class="plab">' +
						esc(m.name || roleName("演出")) +
						"</span></div>"
				})
		}
		// カットインは前景中央に画像だけを表示する
		if(sc && (sc.cutins||[])[0]){
			var cef=state.effects.find(function(x){return x.id===(sc.cutins||[])[0]})
			if(cef&&cef.imageUrl&&(ui.pvHide||[]).indexOf("cutin:"+cef.id)<0) h+='<img class="pv-cutin-center scene-pv-object'+(ui.scenePvSel==="cutin:"+cef.id?' sel':'')+'" data-layer-object="cutin:'+cef.id+'" data-nodrag="1" src="'+thumbOf(cef.imageUrl)+'" alt="">'
		}

		// 立ち絵タブのときはライブラリ全員を仮に並べて見せる
		if (ui.tab === "tachie" && state.tachie.length) {
			var hidT = ui.tachieHide || []
			var libs = tachieInGroup().filter(function (tc) {
				return hidT.indexOf(tc.id) < 0
			})
			libs.forEach(function (tc, i) {
				fitTachie(tc)
				var lx = snapHalf(C.autoLayoutX(fw, libs.length, i))
				h +=
					'<div class="pmark tv" data-tcid="' +
					tc.id +
					'" style="z-index:' +
					(Number(tachieZ(tc)) || 0) +
					';left:' +
					pct(lx, fw).toFixed(3) +
					"%;top:" +
					pct(tachieY(tc), fh).toFixed(3) +
					"%;width:" +
					((tc.widthM / fw) * 100).toFixed(3) +
					"%;height:" +
					((tc.heightM / fh) * 100).toFixed(3) +
					'%">' +
					(tc.imageUrl ? '<img src="' + thumbOf(tc.imageUrl) + '" alt="">' : "") +
					'<i class="ph"></i>' +
					'<span class="plab">' +
					esc(tc.name || roleName("立ち絵")) +
					"</span></div>"
			})
		}
		if (ui.tab === "room" && !ui.roomRealistic) {
			var resizeParts = roomSelected()
			if (resizeParts.length === 1 && !resizeParts[0].lockMove && resizeParts[0].visible !== false) {
				var resizePart = resizeParts[0]
				h += '<i class="room-part-resize" data-room-resize="' + resizePart.id + '" title="' + T("rpanel.024") + '" style="left:' + pct(resizePart.x + resizePart.width / 2, fw).toFixed(3) + '%;top:' + pct(resizePart.y + resizePart.height / 2, fh).toFixed(3) + '%"></i>'
			}
		}
		h += "</div></div>"
		if (ui.tab === "tachie" && state.tachie.length) {
			var allT = tachieInGroup()
			var hid2 = ui.tachieHide || []
			h +=
				'<div class="chips"><span class="hint">' + T("rpanel.025") + '</span>' +
				allT
					.map(function (tc) {
						return (
							'<span class="chip' +
							(hid2.indexOf(tc.id) < 0 ? " on" : "") +
							'" data-tchide="' +
							tc.id +
							'">' +
							esc(tc.name || roleName("立ち絵")) +
							"</span>"
						)
					})
					.join("") +
				'<span class="chip" data-tchide="*">' + T("rpanel.026") + '</span></div>' +
				'<p class="hint">' + T("rpanel.027") + '</p>'
		}
		if (ui.tab === "parts" || ui.tab === "panels")
			h += layerRows(ui.tab === "panels" ? "panel" : "part")
		else if (sc) h += sceneLayerRows(sc)
		h +=
			ui.tab === "tachie"
				? '<p id="pcoord" class="hint">' + T("rpanel.028") + '</p>'
				: ''
		if (pad)
			h +=
				'<p class="hint">' + T("rpanel.029") + '</p>'
		if (sc)
			h +=
				'<label><input type="checkbox" id="pscope"' +
				(ui.scopeScene ? " checked" : "") +
				"> " + T("rpanel.030") + "</label>"
		if (!state.baseMarkers.length)
			h += '<p class="hint">' + T("rpanel.031") + '</p>'
		return h
	}

	/* ---------------- レイヤー一覧（プレビューの下） ---------------- */
	function zSwap(id, dir) {
		var b = partById(id)
		if (!b) return
		var list = partsList(partsRole(b)).slice().sort(function (x, y) {
			return (x.z || 0) - (y.z || 0)
		})
		var i = list.indexOf(b)
		var j = i + dir
		if (i < 0 || j < 0 || j >= list.length) return
		var o = list[j]
		var bz = Number(b.z) || 0
		var oz = Number(o.z) || 0
		if (bz === oz) {
			b.z = bz + dir
		} else {
			b.z = oz
			o.z = bz
		}
		render()
	}
	function layerRows(role) {
		var list = partsList(role).slice().sort(function (x, y) {
			return (Number(y.z) || 0) - (Number(x.z) || 0)
		})
		if (!list.length) return ""
		var h =
			'<p class="hint">' + T("layer.001") + '</p><div class="lyrs">'
		list.forEach(function (b, i) {
			var vis = b.visible !== false
			h +=
				'<div class="lyr">' +
				'<button class="pname lnk nm" data-srcedit="part" data-src-id="' + b.id + '">' +
				(b.imageUrl ? "🖼 " : "□ ") + esc(b.name || "") +
				'</button><button class="zz zedit" data-zedit="base" data-zid="' + b.id + '">' + T("imgedit.085") + ' ' +
				(Number(b.z) || 0) +
				"</button>" +
				'<label class="lockchip' +
				(vis ? " on" : "") +
				'" title="' + T("layer.002") + '"><input type="checkbox" data-part="visible" data-id="' +
				b.id +
				'"' +
				(vis ? " checked" : "") +
				"> 👁</label>" +
				'<label class="lockchip' +
				(b.lockMove ? " on" : "") +
				'" title="' + T("layer.003") + '"><input type="checkbox" data-part="lockMove" data-id="' +
				b.id +
				'"' +
				(b.lockMove ? " checked" : "") +
				"> 🔒</label>" +
				'<button class="x" data-zup="' +
				b.id +
				'" title="' + T("layer.004") + '"' +
				(i === 0 ? " disabled" : "") +
				">↑</button>" +
				'<button class="x" data-zdown="' +
				b.id +
				'" title="' + T("layer.005") + '"' +
				(i === list.length - 1 ? " disabled" : "") +
				">↓</button>" +
				"</div>"
		})
		return h + "</div>"
	}

	// シーンのプレビュー用のレイヤー一覧（このシーンで出ているもの）
	function sceneLayerRows(sc) {
		var rows = []
		if (sc.foregroundUrl || state.room.foregroundUrl) rows.push({ z: 0, ic: "🖼 ", nm: roleName("前景"), id: "__foreground__", fixed: true, base: false, hid: false, panel: false, lk: false, sec: "top" })
		state.baseMarkers.forEach(function (b) {
			if (b.visible === false) return
			var ov = sc.overrides ? sc.overrides[b.id] : undefined
			var hid = ov === null
			rows.push({
				z: Number(ov && ov.z != null ? ov.z : b.z) || 0,
				ic: partsRole(b) === "panel" ? "🪟 " : "🧩 ",
				nm: b.name || "",
				id: b.id,
				base: true,
				hid: hid,
				panel: partsRole(b) === "panel",
				lk: !!(ov && Object.prototype.hasOwnProperty.call(ov, "lockMove") ? ov.lockMove : b.lockMove),
				sec: "ov",
				srcKind: "part",
				srcId: b.id,
			})
		})
		;(sc.extraMarkers || []).forEach(function (m) {
			rows.push({
				z: Number(m.z) || 0,
				ic: m.kind === "tachie" ? "🧍 " : "✨ ",
				nm: m.kind === "tachie" ? tcMarkLabel(m) : m.name || roleName("演出"),
				id: m.id,
				base: false,
				hid: false,
				panel: false,
				lk: !!m.lockMove,
				sec: m.kind === "tachie" ? "tachie" : "em",
				srcKind: m.kind === "tachie" ? "tachie" : "em",
				srcId: m.kind === "tachie" ? m.refId : m.id,
			})
		})
		;(sc.cutins || []).forEach(function(cid){
			var ef=state.effects.filter(function(x){return x.id===cid})[0]
			if(ef) rows.push({z:-999,ic:"🔔 ",nm:ef.name||T("settings.001"),id:"cutin:"+cid,fixed:true,base:false,hid:false,panel:false,lk:false,sec:"cut",srcKind:"cut",srcId:cid})
		})
		if (!rows.length) return ""
		rows.sort(function (a, b) {
			return b.z - a.z
		})
		var hid0 = ui.pvHide || []
		var h =
			'<p class="hint">' + T("layer.006") + '</p><div class="lyrs scene-layer-list">'
		rows.forEach(function (r) {
			var pv = hid0.indexOf(r.id) < 0
			h +=
				'<div class="lyr' +
				(ui.scenePvSel === r.id ? " sel" : "") +
				(pv ? "" : " pvoff") +
				'" data-layerid="' + r.id + '"' + (r.panel || r.id === "__foreground__" ? '' : ' data-rowsec="' + r.sec + '"') + (!r.panel && r.id !== "__foreground__" ? ' data-rowmarker="' + r.id + '"' : '') + '>' +
				(r.srcKind && r.srcId
						? '<button class="pname lnk nm tip" data-tip="' + T("layer.007") + '" data-srcedit="' + r.srcKind + '" data-src-id="' + r.srcId + '">' + r.ic + esc(r.nm) + '</button>'
						: '<span class="pname nm">' + r.ic + esc(r.nm) + '</span>') +
				'<button class="x tip layer-op layer-vis' +
				(pv ? "" : " on") +
				'" data-tip="' + T("layer.008") + '" data-pvhide="' +
				r.id +
				'">' +
				(pv ? "👁" : "🙈") +
				"</button>" +
				(!r.fixed
					? '<label class="lockchip layer-op' +
						(r.lk ? " on" : "") +
						'" title="' + T("layer.009") + '"><input type="checkbox" ' + (r.base ? 'data-ov="lockMove" data-scene-id="' + sc.id + '" data-part-id="' : 'data-em="lockMove" data-scene-id="' + sc.id + '" data-em-id="') +
						r.id +
						'"' +
						(r.lk ? " checked" : "") +
						'><span aria-hidden="true">🔒</span></label>'
					: '<span class="layer-op layer-op-empty" aria-hidden="true"></span>') +
				(r.base && r.panel
					? '<button class="x tip layer-op' + (r.hid ? ' on' : '') + '" data-tip="' + T("layer.010") + '" data-truehide="' + r.id + '">🚫</button>'
					: r.base
						? '<button class="x tip layer-op' +
							(r.hid ? " on" : "") +
							'" data-tip="' + T("layer.011") + '" data-truehide="' +
							r.id +
							'">🚫</button>'
						: '<span class="layer-op layer-op-empty" aria-hidden="true"></span>') +
				(r.fixed
					? '<span class="zz">' + T("imgedit.090") + '</span>'
					: '<button class="zz zedit" data-zedit="' + (r.base ? "base" : "em") + '" data-zid="' + r.id + '">' + T("imgedit.085") + ' ' + r.z + '</button>') +
				"</div>"
		})
		return h + "</div>"
	}

	// プレビューで動かしたとき、入力欄の数字もその場で合わせる
	function pvField(sel, val) {
		var f = $(sel)
		if (f && document.activeElement !== f) f.value = val
	}

	// 部屋デザイン・スクリーン・立ち絵の画面は「シーンに左右されない」プレビューなので、
	// プレビューで動かした結果も必ず大元（全シーン共通）に書きこむ
	function previewScene() {
		if (ui.tab === "room" || ui.tab === "parts" || ui.tab === "panels" || ui.tab === "tachie")
			return null
		return currentScene()
	}

	function setPos(id, x, y) {
		var sc = previewScene()
		if (sc && ui.scopeScene) {
			if (sc.overrides[id] == null) sc.overrides[id] = {}
			sc.overrides[id].x = x
			sc.overrides[id].y = y
		} else {
			var b = partById(id)
			if (b) {
				b.x = x
				b.y = y
			}
		}
	}

	function prepareRoomViewport(){
		var root=$("#roomStudioPreview"),bw=root?root.querySelector(".bwrap"):null;if(!root||!bw||bw.parentNode.classList.contains("rd-stage"))return
		var vp=document.createElement("div"),st=document.createElement("div");vp.className="rd-viewport";vp.id="rdViewport";st.className="rd-stage";st.id="rdStage";st.style.setProperty("--room-board-width",(74*(Number(state.room.fieldWidth)||40)/40)+"%");var roomBg=state.room.backgroundUrl?thumbOf(state.room.backgroundUrl):"";if(roomBg){vp.classList.add("has-room-bg");vp.style.backgroundImage='linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url("'+roomBg.replace(/"/g,'%22')+'")'}bw.parentNode.insertBefore(vp,bw);vp.appendChild(st);st.appendChild(bw);var pal=root.querySelector('#roomToolPalette');if(pal)vp.parentNode.insertBefore(pal,vp)
		function xf(){st.style.transform='translate('+Number(ui.roomPanX||0)+'px,'+Number(ui.roomPanY||0)+'px) scale('+(Number(ui.roomZoom)||.82)+')'}xf()
		vp.addEventListener('wheel',function(e){e.preventDefault();ui.roomZoom=Math.max(.25,Math.min(2.5,(Number(ui.roomZoom)||.82)+(e.deltaY<0?.08:-.08)));xf();var z=root.querySelector('.rd-zoom b');if(z)z.textContent=Math.round(ui.roomZoom*100)+'%'},{passive:false})
		vp.addEventListener('pointerdown',function(e){if(!(ui.roomSpace||e.button===1))return;e.preventDefault();var sx=e.clientX,sy=e.clientY,px=Number(ui.roomPanX||0),py=Number(ui.roomPanY||0);vp.setPointerCapture(e.pointerId);function mv(x){ui.roomPanX=px+x.clientX-sx;ui.roomPanY=py+x.clientY-sy;xf()}function up(){vp.removeEventListener('pointermove',mv);vp.removeEventListener('pointerup',up);saveLocal()}vp.addEventListener('pointermove',mv);vp.addEventListener('pointerup',up)})
		vp.addEventListener('click',function(e){if(e.target===vp||e.target===st||e.target===bw){if(!roomQuickLeave())return;ui.roomSel=[];ui.roomPhSel=null;render()}})
	}
	function markScenePreviewSelection(id){
		ui.scenePvSel=id||null
		all('.scene-layer-list .lyr').forEach(function(row){row.classList.toggle('sel',row.dataset.layerid===ui.scenePvSel)})
		all('#board .pmark').forEach(function(el){el.classList.toggle('sel',(el.dataset.emid||el.dataset.mid)===ui.scenePvSel)})
		all('#board [data-layer-object]').forEach(function(el){el.classList.toggle('sel',el.dataset.layerObject===ui.scenePvSel)})
	}
	function scenePresetZoom(pad){return pad===26?.64:pad===12?.82:1}
	function prepareSceneViewport(){
		if(ui.tab==="tachie"||ui.tab==="room"||ui.tab==="parts"||ui.tab==="panels")return
		var root=$("#rbody"),bw=root?root.querySelector(".bwrap"):null
		if(!root||!bw||bw.parentNode.classList.contains("scene-pv-stage"))return
		var vp=document.createElement("div"),st=document.createElement("div")
		vp.className="scene-pv-viewport";st.className="scene-pv-stage"
		vp.style.height=Math.max(170,Math.min(520,Number(ui.scenePvHeight)||220))+"px"
		var psc=currentScene(),pfw=psc&&psc.fieldWidth!=null?psc.fieldWidth:state.room.fieldWidth,pfh=psc&&psc.fieldHeight!=null?psc.fieldHeight:state.room.fieldHeight
		st.style.setProperty("--scene-board-aspect",String((Number(pfw)||40)/(Number(pfh)||30)))
		var sceneBg=psc?sceneBackgroundUrl(psc):state.room.backgroundUrl,sceneBgThumb=sceneBg?thumbOf(sceneBg):""
		vp.dataset.role="scene-preview-background-surface"
		if(sceneBgThumb){vp.classList.add("has-scene-bg");vp.style.backgroundImage='linear-gradient(rgba(0,0,0,.18),rgba(0,0,0,.18)),url("'+sceneBgThumb.replace(/"/g,'%22')+'")'}
		bw.parentNode.insertBefore(vp,bw);vp.appendChild(st);st.appendChild(bw)
		var rh=document.createElement("div");rh.className="scene-pv-resize";rh.title=T("layer.012");vp.appendChild(rh)
		function fitBoard(){bw.style.width=Math.max(120,Math.min(vp.clientWidth*.92,(vp.clientHeight-22)*((Number(pfw)||40)/(Number(pfh)||30))))+'px'}fitBoard()
		function xf(){st.style.transform='translate('+Number(ui.scenePanX||0)+'px,'+Number(ui.scenePanY||0)+'px) scale('+(Number(ui.sceneZoom)||1)+')'}
		xf()
		vp.addEventListener('wheel',function(e){e.preventDefault();ui.sceneZoom=Math.max(.35,Math.min(3,(Number(ui.sceneZoom)||1)+(e.deltaY<0?.1:-.1)));xf();var z=root.querySelector('.scene-pv-toolbar b');if(z)z.textContent=Math.round(ui.sceneZoom*100)+'%'},{passive:false})
		vp.addEventListener('pointerdown',function(e){if(!(ui.sceneSpace||e.button===1))return;e.preventDefault();e.stopPropagation();var sx=e.clientX,sy=e.clientY,px=Number(ui.scenePanX||0),py=Number(ui.scenePanY||0);vp.setPointerCapture(e.pointerId);function mv(x){ui.scenePanX=px+x.clientX-sx;ui.scenePanY=py+x.clientY-sy;xf()}function up(){vp.removeEventListener('pointermove',mv);vp.removeEventListener('pointerup',up);vp.removeEventListener('pointercancel',up)}vp.addEventListener('pointermove',mv);vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up)})
		rh.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();var sy=e.clientY,oh=vp.getBoundingClientRect().height;function mv(x){ui.scenePvHeight=Math.max(170,Math.min(520,Math.round(oh+x.clientY-sy)));vp.style.height=ui.scenePvHeight+'px';fitBoard()}function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)}window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up)})
	}
	function bindRoomDesigner(){
		prepareRoomViewport();var board=$("#board"),root=$("#roomStudioPreview");if(!board)return;var fw=state.room.fieldWidth,fh=state.room.fieldHeight
		all('[data-roomlayer]',root).forEach(function(row){row.addEventListener('click',function(e){if(e.target.closest('[data-rl-act],[data-rl-z]'))return;var id=row.dataset.roomlayer,b=partById(id);if(!b||!roomQuickLeave())return;e.preventDefault();e.stopPropagation();var at=ui.roomSel.indexOf(id),add=e.shiftKey||e.metaKey||e.ctrlKey;ui.roomPhSel=null;if(add){if(at>=0)ui.roomSel.splice(at,1);else ui.roomSel.push(id)}else ui.roomSel=[id];render()})})
		all('[data-rl-act]',root).forEach(function(x){x.onclick=function(e){e.stopPropagation();var b=partById(x.dataset.rlId);if(!b)return;if(x.dataset.rlAct==='lock')b.lockMove=!b.lockMove;if(x.dataset.rlAct==='visible')b.visible=b.visible===false;render()}})
		all('[data-rl-z]',root).forEach(function(x){x.onclick=function(e){e.stopPropagation()};x.onchange=function(e){e.stopPropagation();var b=partById(x.dataset.rlZ),v=Number(x.value);if(b&&isFinite(v)){b.z=v;saveLocal();render()}}})
		all('[data-roomphlayer]',root).forEach(function(x){x.onclick=function(e){if(e.target.closest('button'))return;ui.roomPhSel=x.dataset.roomphlayer;ui.roomSel=[];render()}})
		all('[data-phlock]',root).forEach(function(x){x.onclick=function(e){e.stopPropagation();var ph=roomPlaceholders().find(function(q){return q.id===x.dataset.phlock});if(ph)ph.locked=!ph.locked;render()}})
		all('[data-phdel]',root).forEach(function(x){x.onclick=function(e){e.stopPropagation();state.room.previewTachie=roomPlaceholders().filter(function(q){return q.id!==x.dataset.phdel});ui.roomPhSel=null;render()}})
		all('.tachie-placeholder[data-roomph]',board).forEach(function(el){el.addEventListener('pointerdown',function(e){var ph=roomPlaceholders().find(function(q){return q.id===el.dataset.roomph});if(!ph||ph.locked||ui.roomSpace)return;e.preventDefault();e.stopPropagation();ui.roomPhSel=ph.id;ui.roomSel=[];var r=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=Number(ph.x)||0,oy=Number(ph.y)||0,oh=Number(ph.height)||Number(state.room.tachieHeight)||18,resize=e.target.classList&&e.target.classList.contains('ph');function fields(){var a=$('#tBottom'),b=$('#tHeight'),c=$('#tPosition');if(a)a.value=tachieBottomLine();if(b)b.value=state.room.tachieHeight;if(c)c.value=tachieDefaultX()}function mv(v){if(resize){var nh=Math.max(1,snapHalf(oh+(v.clientY-sy)/(r.height/fh)*2));state.room.tachieHeight=nh;roomPlaceholders().forEach(function(q){q.height=nh;q.y=tachieY({heightM:nh,dy:0})});el.style.height=(nh/fh*100)+'%'}else{ph.x=snapHalf(ox+(v.clientX-sx)/(r.width/fw));ph.y=snapHalf(oy+(v.clientY-sy)/(r.height/fh));var mode=tachieAlignMode(),h=Number(ph.height)||18;state.room.tachieBottom=mode==='top'?snapHalf(ph.y-h/2):mode==='center'?snapHalf(ph.y):snapHalf(ph.y+h/2);if(mode==='position')state.room.tachiePosition=ph.x;roomPlaceholders().forEach(function(q){if(q!==ph)q.y=tachieY({heightM:q.height||state.room.tachieHeight||18,dy:0})});el.style.left=pct(ph.x,fw)+'%';el.style.top=pct(ph.y,fh)+'%'}fields()}function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(resize)applyRoomTachieHeight();else syncTachie();saveLocal();render()}window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)})})
		all('[data-room-resize]',board).forEach(function(handle){handle.addEventListener('pointerdown',function(e){var b=partById(handle.dataset.roomResize);if(!b||b.lockMove||ui.roomSpace)return;e.preventDefault();e.stopPropagation();ui.roomSel=[b.id];ui.roomPhSel=null;var rect=board.getBoundingClientRect(),perX=rect.width/fw,perY=rect.height/fh,sx=e.clientX,sy=e.clientY,ow=b.width,oh=b.height;handle.setPointerCapture(e.pointerId);function mv(ev){b.width=Math.max(1,snapHalf(ow+(ev.clientX-sx)/perX*2));b.height=Math.max(1,snapHalf(oh+(ev.clientY-sy)/perY*2));if(keepAspect(b))fixAspect(b,'width');var n=board.querySelector('[data-mid="'+b.id+'"]');if(n){n.style.width=(b.width/fw*100)+'%';n.style.height=(b.height/fh*100)+'%'}handle.style.left=pct(b.x+b.width/2,fw)+'%';handle.style.top=pct(b.y+b.height/2,fh)+'%'}function up(){handle.removeEventListener('pointermove',mv);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);saveLocal();render()}handle.addEventListener('pointermove',mv);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up)})})
		all('.pmark[data-mid]',board).forEach(function(el){el.classList.toggle('sel',(ui.roomSel||[]).indexOf(el.dataset.mid)>=0);if(el.dataset.nodrag)return;el.addEventListener('pointerdown',function(e){if(ui.roomSpace||e.button===1)return;if(ui.roomQuick&&ui.roomQuick.id!==el.dataset.mid&&!roomQuickLeave())return;e.preventDefault();e.stopPropagation();var id=el.dataset.mid,add=e.shiftKey||e.metaKey||e.ctrlKey,at=(ui.roomSel||[]).indexOf(id);ui.roomPhSel=null;if(add){if(at>=0)ui.roomSel.splice(at,1);else ui.roomSel.push(id)}else if(at<0||ui.roomSel.length<2)ui.roomSel=[id];var rect=board.getBoundingClientRect(),perX=rect.width/fw,perY=rect.height/fh,sx=e.clientX,sy=e.clientY,resize=e.target.classList&&e.target.classList.contains('ph'),arr=roomSelected().filter(function(b){return !b.lockMove}),snap=arr.map(function(b){return {b:b,x:b.x,y:b.y,w:b.width,h:b.height}}),moved=false;function mv(ev){if(Math.abs(ev.clientX-sx)>=3||Math.abs(ev.clientY-sy)>=3)moved=true;var dx=(ev.clientX-sx)/perX,dy=(ev.clientY-sy)/perY;if(ev.shiftKey){var ax=Math.abs(dx),ay=Math.abs(dy);if(ax>ay*2)dy=0;else if(ay>ax*2)dx=0;else{var d=Math.max(ax,ay);dx=(dx<0?-d:d);dy=(dy<0?-d:d)}}if(resize&&arr.length===1){var q=snap[0],b=q.b;b.width=Math.max(1,snapHalf(q.w+dx*2));b.height=Math.max(1,snapHalf(q.h+dy*2));if(keepAspect(b))fixAspect(b,'width')}else snap.forEach(function(q){q.b.x=snapHalf(q.x+dx);q.b.y=snapHalf(q.y+dy)});snap.forEach(function(q){var n=board.querySelector('[data-mid="'+q.b.id+'"]');if(n){n.style.left=pct(q.b.x,fw)+'%';n.style.top=pct(q.b.y,fh)+'%';n.style.width=(q.b.width/fw*100)+'%';n.style.height=(q.b.height/fh*100)+'%'}})}function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(!moved&&!add)ui.roomSel=[id];saveLocal();render()}window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)})})
		if(ui.roomQuick){var qi=ui.roomQuick.q,qe=board.querySelector('[data-mid="'+ui.roomQuick.id+'"] img');if(qe){qe.style.filter=edFilter(qi);qe.style.transform=qi.flip?'scaleX(-1)':'';qe.style.clipPath='inset('+(qi.cu||0)+'% '+(qi.cr||0)+'% '+(qi.cb||0)+'% '+(qi.cl||0)+'%)'}}
		all('.rq-cropbox',board).forEach(function(box){box.onpointerdown=function(e){e.preventDefault();e.stopPropagation();if(!ui.roomQuick)return;var q=ui.roomQuick.q,host=box.parentNode,rect=host.getBoundingClientRect(),resize=!!e.target.dataset.rqhandle,sx=e.clientX,sy=e.clientY,l=Number(q.cl)||0,t=Number(q.cu)||0,w=100-l-(Number(q.cr)||0),h=100-t-(Number(q.cb)||0);function syncBox(){box.style.left=q.cl+'%';box.style.top=q.cu+'%';box.style.width=(100-q.cl-q.cr)+'%';box.style.height=(100-q.cu-q.cb)+'%';['cl','cr','cu','cb'].forEach(function(k){var x=root.querySelector('[data-rq="'+k+'"]');if(x)x.value=q[k]});var im=host.querySelector('img');if(im)im.style.clipPath='inset('+q.cu+'% '+q.cr+'% '+q.cb+'% '+q.cl+'%)'}function mv(ev){var dx=(ev.clientX-sx)/rect.width*100,dy=(ev.clientY-sy)/rect.height*100;if(resize){var nw=Math.max(5,Math.min(100-l,w+dx)),nh=Math.max(5,Math.min(100-t,h+dy));q.cr=100-l-nw;q.cb=100-t-nh}else{q.cl=Math.max(0,Math.min(100-w,l+dx));q.cu=Math.max(0,Math.min(100-h,t+dy));q.cr=100-q.cl-w;q.cb=100-q.cu-h}['cl','cr','cu','cb'].forEach(function(k){q[k]=Math.round(q[k]*10)/10});ui.roomQuick.dirty=true;syncBox()}function up(){window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up)}window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}})
		all('[data-roomquick]',root).forEach(function(x){x.onclick=function(){var one=roomSelected()[0];if(!one)return;if(x.dataset.roomquick==='full'){ui.editImg=(imageByName(one.imageUrl)||{}).id;ui.edit=edDefaults();ui.modal='edit';render();return}ui.roomQuick=quickDefaults(one.id);ui.roomQuick.mode=x.dataset.roomquick;if(x.dataset.roomquick==='flip'){ui.roomQuick.q.flip=true;ui.roomQuick.dirty=true}render()}})
		all('[data-rq]',root).forEach(function(x){x.oninput=x.onchange=function(){if(!ui.roomQuick)return;ui.roomQuick.q[x.dataset.rq]=x.type==='checkbox'?x.checked:Number(x.value);ui.roomQuick.dirty=true;var el=board.querySelector('[data-mid="'+ui.roomQuick.id+'"] img');if(el){el.style.filter=edFilter(ui.roomQuick.q);el.style.transform=ui.roomQuick.q.flip?'scaleX(-1)':'';el.style.clipPath='inset('+(ui.roomQuick.q.cu||0)+'% '+(ui.roomQuick.q.cr||0)+'% '+(ui.roomQuick.q.cb||0)+'% '+(ui.roomQuick.q.cl||0)+'%)'}}})
		var ca=root.querySelector('[data-rqcancel]');if(ca)ca.onclick=function(){ui.roomQuick=null;render()}
		var ap=root.querySelector('[data-rqapply]');if(ap)ap.onclick=async function(e){e.preventDefault();e.stopPropagation();var r=ui.roomQuick,b=partById(r&&r.id);if(!b)return;ui.editImg=(imageByName(b.imageUrl)||{}).id;ui.edit=r.q;ui.roomQuick=null;await runImgEdit({stayRoom:true,targetId:b.id})}
		var real=root.querySelector('[data-roomreal]');if(real)real.onchange=function(){ui.roomRealistic=real.checked;render()}
	}
	function bindPreviewDrag() {
		if(ui.tab==='room'){bindRoomDesigner();return}
		prepareSceneViewport()
		var board = $("#board")
		if (!board) return
		var fw = state.room.fieldWidth,
			fh = state.room.fieldHeight
		var sc = previewScene()
		all('[data-layer-object]',board).forEach(function(el){el.addEventListener('pointerdown',function(e){if(ui.sceneSpace||e.button===1)return;e.preventDefault();e.stopPropagation();markScenePreviewSelection(el.dataset.layerObject)})})
		all(".pmark", board).forEach(function (el) {
			el.addEventListener("pointerdown", function (e) {
				if(ui.sceneSpace||e.button===1)return
				var sceneSel=el.dataset.emid||el.dataset.mid
				if(ui.tab==="scenes"&&sceneSel)markScenePreviewSelection(sceneSel)
				if(el.dataset.nodrag){e.preventDefault();e.stopPropagation();return}
				e.preventDefault()
				e.stopPropagation()
				var resize = !!(
					e.target &&
					e.target.classList &&
					e.target.classList.contains("ph")
				)
				var isTc = !!el.dataset.tcid
				var isEm = !!el.dataset.emid
				var b = isTc
					? tachieById(el.dataset.tcid)
					: isEm
						? emById(sc, el.dataset.emid)
						: partById(el.dataset.mid)
				if (!b) return
				var eff = isTc
					? { x: 0, y: tachieY(b) }
					: isEm
						? b
						: effective(b, sc)
				var rect = board.getBoundingClientRect()
				var perX = rect.width / fw,
					perY = rect.height / fh
				var sx = e.clientX,
					sy = e.clientY,
					ox = eff.x,
					oy = eff.y
				var ow0 = isTc ? b.heightM || 18 : eff.width,
					oh0 = isTc ? b.heightM || 18 : eff.height
				el.setPointerCapture(e.pointerId)
				function move(ev) {
					if (resize) {
						var rw = Math.max(
							0.5,
							snapHalf(ow0 + ((ev.clientX - sx) / perX) * 2),
						)
						var rh = Math.max(
							0.5,
							snapHalf(oh0 + ((ev.clientY - sy) / perY) * 2),
						)
						var shown = rw + "×" + rh
						if (isTc) {
							var srcR = tachieSrc(b)
							srcR.heightM = rh
							fitTachie(srcR)
							syncTachie()
							el.style.width = ((srcR.widthM / fw) * 100).toFixed(3) + "%"
							el.style.height = ((srcR.heightM / fh) * 100).toFixed(3) + "%"
							shown = srcR.widthM + "×" + srcR.heightM
							pvField(
								'[data-tc="heightM"][data-id="' + srcR.id + '"]',
								srcR.heightM,
							)
						} else {
							var tg = isEm ? b : partById(el.dataset.mid)
							if (tg) {
								tg.width = rw
								if (keepAspect(tg)) fixAspect(tg, "width")
								else tg.height = rh
								el.style.width = ((tg.width / fw) * 100).toFixed(3) + "%"
								el.style.height = ((tg.height / fh) * 100).toFixed(3) + "%"
								shown = tg.width + "×" + tg.height
								if (isEm) {
									pvField(
										'[data-em="width"][data-em-id="' + tg.id + '"]',
										tg.width,
									)
									pvField(
										'[data-em="height"][data-em-id="' + tg.id + '"]',
										tg.height,
									)
								} else {
									pvField(
										'[data-part="width"][data-id="' + tg.id + '"]',
										tg.width,
									)
									pvField(
										'[data-part="height"][data-id="' + tg.id + '"]',
										tg.height,
									)
								}
							}
						}
						var cz = $("#pcoord")
						if (cz)
							cz.textContent =
								(b.name || T("home.057")) +
								T("layer.013", shown)
						return
					}
					var ddx = (ev.clientX - sx) / perX,
						ddy = (ev.clientY - sy) / perY
					if (ev.shiftKey) {
						var adx = Math.abs(ddx),
							ady = Math.abs(ddy)
						if (adx > ady * 2.414) ddy = 0
						else if (ady > adx * 2.414) ddx = 0
						else {
							var av = (adx + ady) / 2
							ddx = (ddx < 0 ? -1 : 1) * av
							ddy = (ddy < 0 ? -1 : 1) * av
						}
					}
					var nx = Math.round((ox + ddx) * 2) / 2
					var ny = Math.round((oy + ddy) * 2) / 2
					if (!isTc) el.style.left = pct(nx, fw).toFixed(3) + "%"
					el.style.top = pct(ny, fh).toFixed(3) + "%"
					if (isTc) {
						var srcT = tachieSrc(b)
						var am=tachieAlignMode(), ah=(b.heightM||18)/2, al=tachieBottomLine()
						srcT.dy = am === "top" ? snapHalf(ny-al-ah) : am === "center" ? snapHalf(ny-al) : snapHalf(al-ah-ny)

						syncTachie()
						// 同じ大元をつかう表情差分も一緒に動かす
						all("[data-tcid]", board).forEach(function (o2) {
							var t2 = tachieById(o2.dataset.tcid)
							if (t2 && tachieSrc(t2) === srcT)
								o2.style.top = pct(tachieY(t2), fh).toFixed(3) + "%"
						})
					} else if (isEm) {
						b.x = nx
						b.y = ny
						pvField('[data-em="x"][data-em-id="' + b.id + '"]', nx)
						pvField('[data-em="y"][data-em-id="' + b.id + '"]', ny)
					} else {
						setPos(b.id, nx, ny)
						if (sc && ui.scopeScene) {
							pvField('[data-ov="x"][data-part-id="' + b.id + '"]', nx)
							pvField('[data-ov="y"][data-part-id="' + b.id + '"]', ny)
						} else {
							pvField('[data-part="x"][data-id="' + b.id + '"]', nx)
							pvField('[data-part="y"][data-id="' + b.id + '"]', ny)
						}
					}
					var c = $("#pcoord")
					if (c && isTc)
						c.textContent =
							(b.name || roleName("立ち絵")) +
							T("layer.014", tachieSrc(b).dy)
					else if (c)
						c.textContent =
							(b.name || roleName("演出")) +
							T("layer.015", nx, ny, (isEm || (sc && ui.scopeScene) ? T("layer.016") : T("layer.017")))
				}
				function up() {
					el.removeEventListener("pointermove", move)
					el.removeEventListener("pointerup", up)
					renderMain()
					renderRight()
					saveLocal()
				}
				el.addEventListener("pointermove", move)
				el.addEventListener("pointerup", up)
			})
		})
	}

	/* ---------------- 下段（メモとタスク） ---------------- */
	function renderBottom() {
		var m = $("#gmemo")
		if (m && m.value !== state.memo) m.value = state.memo
		var left = state.tasks.filter(function (t) {
			return !t.done
		}).length
		$("#bsum").textContent =
			(left ? T("memo.001", left) : state.tasks.length ? T("memo.002") : "") +
			(state.memo ? T("memo.003") : "")
		$("#tasklist").innerHTML = state.tasks.length
			? state.tasks
					.map(function (t) {
						return (
							'<li class="' +
							(t.done ? "done" : "") +
							(t.sub ? " sub" : "") +
							'"><input type="checkbox" data-tdone="' +
							t.id +
							'"' +
							(t.done ? " checked" : "") +
							'><span>' +
							esc(t.text) +
							'</span><button class="x" data-tup="' +
							t.id +
							'" title="' + T("tset.021") + '">↑</button>' +
							'<button class="x" data-tdown="' +
							t.id +
							'" title="' + T("tset.022") + '">↓</button>' +
							'<button class="x" data-tsub="' +
							t.id +
							'" title="' + T("memo.004") + '">⇥</button>' +
							'<button class="x" data-tdel="' +
							t.id +
							'">×</button></li>'
						)
					})
					.join("")
			: '<li><span class="hint">' + T("home.034") + '</span></li>'
	}

	/* ---------------- 入力反映 ---------------- */
	function applyInput(t) {
		if (ui.imageMaker && ui.modal === "imageMaker") {
			var md = t.dataset || {}, maker = ui.imageMaker
			if (md.makerbg !== undefined) { var beforeBackgroundImage=imageMakerSnapshot(maker);maker.backgroundImage=t.value||"";maker.background=maker.backgroundImage?"image":"transparent";imageMakerCommitHistory(maker,beforeBackgroundImage);scheduleImageMakerRender();return }
			if (md.makerlayerimage) { var beforeLayerImage=imageMakerSnapshot(maker),imageLayer=imageMakerLayer(md.makerlayerimage),image=imageMakerImage(t.value);if(imageLayer){imageLayer.imageName=t.value||"";if(image){imageLayer.width=image.w||imageLayer.width;imageLayer.height=image.h||imageLayer.height;imageLayer.naturalWidth=image.w||imageLayer.naturalWidth;imageLayer.naturalHeight=image.h||imageLayer.naturalHeight}imageMakerCommitHistory(maker,beforeLayerImage);scheduleImageMakerRender()}return }
			if (md.makeraddimage !== undefined) { if(t.value){var beforeAddedImage=imageMakerSnapshot(maker),addedLayer=imageMakerNewLayer("image",t.value);maker.layers.unshift(addedLayer);imageMakerSetSelection(maker,[addedLayer.id]);imageMakerCommitHistory(maker,beforeAddedImage);scheduleImageMakerRender()}return }
			if (t.id === "imageMakerWidth") maker.width = Math.max(16, Math.min(4096, Number(t.value) || IMAGE_MAKER_DEFAULTS.width))
			else if (t.id === "imageMakerHeight") maker.height = Math.max(16, Math.min(4096, Number(t.value) || IMAGE_MAKER_DEFAULTS.height))
			else if (t.id === "imageMakerBackground") { maker.background = t.value; scheduleImageMakerRender(); return }
			else if (t.id === "imageMakerBgColor") maker.backgroundColor = t.value
			else if (t.id === "imageMakerFileName") { maker.fileName = t.value; return }
			else if (t.id === "imageMakerQuality") maker.quality = t.value
			else if (md.imfield !== undefined) {
				var selected = imageMakerSelected(), key = md.imfield
				if (!selected || selected.locked) return
				if (key === "stroke" || key === "lockAspect") selected[key] = !!t.checked
				else if (key === "fontPreset") { var fontPreset=imageMakerFontPreset(t.value);selected.fontPreset=fontPreset.id;selected.font=fontPreset.stack }
				else if (["text","font","color","strokeColor","align"].indexOf(key) >= 0) selected[key] = t.value
				else {
					var oldW=Number(selected.width)||1,oldH=Number(selected.height)||1,value=Number(t.value);selected[key]=isFinite(value)?value:0
					if(selected.type==="image"&&selected.lockAspect&&key==="width")selected.height=Math.max(1,Math.round(selected.width*oldH/oldW))
					if(selected.type==="image"&&selected.lockAspect&&key==="height")selected.width=Math.max(1,Math.round(selected.height*oldW/oldH))
				}
			}
			else return
			// 色入力はUndoボタンを押す前にフォーカスが外れないブラウザがあるため、
			// この入力イベントを1回の編集操作として確定する。
			// 文字・数値入力は従来どおりblur/changeでまとめる。
			if (t.type === "color") imageMakerCommitPendingInput(maker)
			maker.resultSize=0;maker.resultName="";maker.error="";scheduleImageMakerPreview(true)
			return
		}
		if (ui.apng && (t.id === "apngSource" || t.id === "apngStart" || t.id === "apngEnd" || t.id === "apngColor" || t.id === "apngDuration" || t.id === "apngLoop")) {
			if (t.id === "apngSource") {
				var oldSourceName = ui.apng.sourceName, nextSourceName = t.value || ""
				if (nextSourceName !== "__apng_temp__") {
					if (ui.apng.sourceTemp) releaseApngSource(ui.apng)
					ui.apng.sourceName = nextSourceName
					if (nextSourceName !== oldSourceName && apngStaticImage(nextSourceName)) { ui.apng.start = "image"; ui.apng.end = "transparent" }
				}
				ui.apng.sourceRejected = false
			}
			if (t.id === "apngStart") apngSetEndpoint(ui.apng, "start", t.value)
			if (t.id === "apngEnd") apngSetEndpoint(ui.apng, "end", t.value)
			if (t.id === "apngColor") ui.apng.color = t.value
			if (t.id === "apngDuration") ui.apng.duration = APNG.normalizeDuration(Number(t.value) * 1000)
			if (t.id === "apngLoop") ui.apng.loop = t.value === "on"
			ui.apng.resultSize = 0; ui.apng.resultName = ""; ui.apng.resultMessage = ""; ui.apng.error = ""
			if (t.id !== "apngStart" && t.id !== "apngEnd") apngNormalizeUi(ui.apng)
			if (t.id === "apngSource" || t.id === "apngStart" || t.id === "apngEnd") scheduleApngModalRender(ui.apng)
			else {
				refreshApngSummary(ui.apng)
				if (t.id === "apngDuration") startApngPreview()
			}
			return
		}
		if (t.dataset && t.dataset.empimg) {
			emPresetSetImage(t.dataset.empimg, t.value || "")
			return
		}
		if (t.dataset && t.dataset.citplimg) {
			cutinTemplateSetImage(t.dataset.citplimg, t.value || "")
			return
		}
		if (t.dataset && t.dataset.citplfield) {
			cutinTemplateSetField(t.dataset.citplId, t.dataset.citplfield, t.value)
			return
		}
		if (t.dataset && t.dataset.cutinselect) {
			if (!Array.isArray(ui.cutinSel)) ui.cutinSel = []
			var selectedAt = ui.cutinSel.indexOf(t.dataset.cutinselect)
			if (t.checked && selectedAt < 0) ui.cutinSel.push(t.dataset.cutinselect)
			if (!t.checked && selectedAt >= 0) ui.cutinSel.splice(selectedAt, 1)
			render()
			return
		}
		if (t.dataset && (t.dataset.tpd !== undefined || t.dataset.tpdi !== undefined)) {
			tplDetailInput(t)
			if (t.dataset.tpd === "backgroundMode") render()
			return
		}
		if (t.dataset && t.dataset.mgrname) {
			tplRename(t.dataset.mgrname, t.dataset.mgrid, t.value)
			return
		}
		if (t.dataset && t.dataset.newfg) {
			ui.newFg = t.value || ""
			return render()
		}
		// 一括作成ポップアップ
		if (t.id === "mpq") {
			ui.pickQ = t.value
			return mpRefresh()
		}
		if (t.id === "mpEvery") {
			ui.pickAll = !!t.checked
			return mpRefresh()
		}
		// 1色の画像
		if (t.id === "solidColor" || t.id === "solidName" || t.id === "solidSize") {
			if (!ui.solid) ui.solid = { color: "#000000", w: 8, name: "" }
			if (t.id === "solidColor") ui.solid.color = t.value
			if (t.id === "solidName") ui.solid.name = t.value
			if (t.id === "solidSize") ui.solid.w = Number(t.value) || 8
			var spv = $("#solidPrev")
			if (spv) spv.style.background = ui.solid.color
			return
		}
		// 画像の加工
		if (t.dataset && t.dataset.ed) {
			if (!ui.edit) ui.edit = edDefaults()
			var edKey=t.dataset.ed
			if (edKey === "replace" || edKey === "gradientOn") ui.edit[edKey] = !!t.checked
			else if (edKey === "colorFilter" || edKey === "effectScope" || edKey === "gradientStartColor" || edKey === "gradientEndColor" || edKey === "gradientDirection") ui.edit[edKey] = t.value
			else {
				ui.edit[edKey] = Number(t.value)
				if (["cl","cr","cu","cb"].indexOf(edKey)>=0) { var es=edImageSize(); normalizeEditCrop(ui.edit,es.w,es.h,edKey); syncEditCropUi() }
				var edl = $("#ed_" + edKey)
				if (edl) edl.textContent = t.value
			}
			if(edKey==="gradientOn"){var gs=$("#edGradientSettings"),gd=$("#edGradientDirection");if(gs)gs.hidden=!ui.edit.gradientOn;if(gd)gd.hidden=!ui.edit.gradientOn}
			if(edKey.indexOf("gradient")===0)syncEditGradientUi()
			applyEditPreview()
			return
		}
		var d = t.dataset || {}
		if (d.ssel) {
			var arr = selIds()
			var k = arr.indexOf(d.ssel)
			if (t.checked && k < 0) arr.push(d.ssel)
			if (!t.checked && k >= 0) arr.splice(k, 1)
			render()
			return
		}
		if (t.id === "projName") state.project = t.value || "room"
		if (t.id === "maxEdge") state.settings.maxEdge = Number(t.value) || 1200
		if (t.id === "convert") state.settings.convert = t.checked
		if (t.id === "setSyms")
			settingsBag().syms = t.value.split(/[\s,、]+/).filter(function (x) {
				return x
			})
		if (t.id === "setPart") settingsBag().defaults.part = Number(t.value) || 4
		if (t.id === "setPanelW")
			settingsBag().defaults.panelW = Number(t.value) || 0
		if (/^setZ(Part|Panel|Tachie|Effect)$/.test(t.id)) {
			var commonZKey = t.id === "setZPart" ? "part" : t.id === "setZPanel" ? "panel" : t.id === "setZTachie" ? "tachie" : "effect"
			settingsBag().defaults.z[commonZKey] = Number(t.value) || 0
		}
		if (t.id === "tcGap") {
			settingsBag().tachieGap = Number(t.value) || 0
			return
		}
		if (t.id === "setNoimg") {
			settingsBag().noimage = !!t.checked
			return render()
		}
		if (t.id === "setNoimgN") {
			settingsBag().noimageCount = Math.max(
				1,
				Math.min(3, Number(t.value) || 1),
			)
			return
		}
		if (t.id === "setNoimgZ") {
			settingsBag().noimageZ = Number(t.value) || 45
			return
		}
		if (t.id === "epName") {
			ui.epName = t.value
			return
		}
		if (t.id === "epKind") {
			ui.epKind = t.value
			return
		}
		if (t.id === "epZ") {
			ui.epZ = Number(t.value) || 40
			return
		}
		if (t.dataset && t.dataset.epimg) {
			ui.epImg = t.value || ""
			return render()
		}
		if (t.id === "setTachieH")
			settingsBag().defaults.tachieH = Number(t.value) || 18
		if (d.site && d.si != null) {
			var stArr = settingsBag().sites
			var stI = Number(d.si)
			if (stArr[stI]) stArr[stI][d.site] = t.value
			return
		}
		if (t.id === "pvGuideColor" || t.id === "setGuideColor") {
			settingsBag().guideColor = t.value
			var bdG = $("#board")
			var gEl = bdG ? bdG.querySelector(".foreground-guide-outline") : null
			if (gEl) gEl.style.setProperty("--gc", t.value)
			return
		}
		if (t.id === "setGuideOn") {
			settingsBag().guides = !!t.checked
			render()
			return
		}
		if (t.id === "fw") state.room.fieldWidth = Number(t.value) || 37
		if (t.id === "fh") state.room.fieldHeight = Number(t.value) || 17
		if (t.id === "grid") state.room.displayGrid = t.checked
		if (t.id === "roomBgmCrossfade") state.room.bgmCrossfade = t.checked
		if (t.id === "roomLegacyDice") state.room.useLegacyDice = t.checked
		if (t.id === "roomZPart") setRoomZ("part", t.value)
		if (t.id === "roomZPanel") setRoomZ("panel", t.value)
		if (t.id === "roomZTachie") { setRoomZ("tachie", t.value); state.room.tachieZ = roomZ().tachie; syncTachie() }
		if (t.id === "roomZEffect") setRoomZ("effect", t.value)
		if (/^roomDef(Part|PanelW|TachieH)$/.test(t.id)) {
			if (!state.room.creationDefaults) state.room.creationDefaults = {}
			var defKey = t.id === "roomDefPart" ? "part" : t.id === "roomDefPanelW" ? "panelW" : "tachieH"
			if (t.value === "") delete state.room.creationDefaults[defKey]
			else state.room.creationDefaults[defKey] = Number(t.value) || 0
			if (!Object.keys(state.room.creationDefaults).length) delete state.room.creationDefaults
		}
		if (/^room(Def(Part|PanelW|TachieH)|Z(Part|Panel|Tachie|Effect))$/.test(t.id)) refreshProjectDefaultStatus(t)
		if (t.id === "roomBg") state.room.backgroundUrl = t.value || null
		if (t.id === "roomFg") state.room.foregroundUrl = t.value || null
		if (t.id === "tAlignMode") { state.room.tachieAlign=t.value; state.room.tachieAlignBottom=t.value==="bottom"; roomPlaceholders().forEach(function(ph){ph.y=tachieY({heightM:ph.height||state.room.tachieHeight||18,dy:0});if(t.value==="position")ph.x=tachieDefaultX()}); syncTachie(); render(); return }
		if (t.id === "tPosition") { state.room.tachiePosition=Number(t.value)||0; roomPlaceholders().forEach(function(ph){ph.x=tachieDefaultX()}); syncTachie(); render(); return }
		if (t.id === "tcGapRoom") { settingsBag().tachieGap=Number(t.value)||0; layoutRoomPlaceholders(); refreshRoomStudioPreview(); return }
		if (t.id === "tBottom") {
			state.room.tachieBottom = Number(t.value)
			roomPlaceholders().forEach(function(ph){ph.y=tachieY({heightM:ph.height||state.room.tachieHeight||18,dy:0})})
			syncTachie(); render(); return
		}
		if (t.id === "tHeight") { state.room.tachieHeight=Number(t.value)||18;roomPlaceholders().forEach(function(ph){ph.height=state.room.tachieHeight;ph.y=tachieY({heightM:ph.height,dy:0})});applyRoomTachieHeight();render();return }
		if (t.id === "tZ") {
			state.room.tachieZ = Number(t.value) || 21
			syncTachie()
		}
		if (t.id === "gmemo") {
			state.memo = t.value
			saveLocal()
		}
		if (t.id === "pscope") ui.scopeScene = t.checked
		if (t.id === "mfilter") ui.mediaFilter = t.value
		if (d.imglabel) {
			state.images.forEach(function (im) {
				if (im.id === d.imglabel) im.label = t.value
			})
		}
		if (d.imgrole) {
			state.images.forEach(function (im) {
				if (im.id === d.imgrole) toggleRole(im, d.role, t.checked)
			})
		}
		if (t.id === "imgq2") {
			ui.imgQ = t.value
			return imgGridRefresh()
		}
		if (t.id === "renPre" || t.id === "renStart" || t.id === "renDigits") {
			if (!ui.ren) ui.ren = { pre: "", start: 1, digits: 2 }
			if (t.id === "renPre") ui.ren.pre = t.value
			else if (t.id === "renStart") ui.ren.start = Number(t.value)
			else ui.ren.digits = Number(t.value) || 2
			return
		}
		if (t.id === "repFrom" || t.id === "repTo") {
			if (!ui.rep) ui.rep = { from: "", to: "" }
			if (t.id === "repFrom") ui.rep.from = t.value
			else ui.rep.to = t.value
			return
		}
		// 立ち絵ライブラリ
		if (d.tc) {
			var tc0 = tachieById(d.id)
			if (tc0) {
				if (d.tc === "imageUrl") tc0.imageUrl = t.value || null
				else if (d.tc === "solo") {
					tc0.solo = t.checked
					var pb = tachieBase(tc0)
					if (t.checked && pb) {
						tc0.heightM = pb.heightM
						tc0.dy = pb.dy || 0
						if (pb.z != null) tc0.z = pb.z
					}
				} else if (d.tc === "heightM" || d.tc === "dy")
					tc0[d.tc] = snapHalf(t.value)
				else if (d.tc === "z") tc0[d.tc] = Number(t.value) || 0
				else tc0[d.tc] = t.value
				syncTachie()
				if (ui.rightTab === "preview") renderRight()
			}
		}
		// シーンへの登場・退場
		if (d.stc) {
			var sTc = sceneById(d.id)
			var tcRef = tachieById(d.stc)
			if (sTc && tcRef) {
				if (!sTc.extraMarkers) sTc.extraMarkers = []
				var at2 = -1
				sTc.extraMarkers.forEach(function (m, i2) {
					if (m.refId === tcRef.id) at2 = i2
				})
				if (t.checked && at2 < 0) {
					fitTachie(tcRef)
					sTc.extraMarkers.push({
						id: C.newId(),
						refId: tcRef.id,
						kind: "tachie",
						name: tcRef.name,
						imageUrl: tcRef.imageUrl,
						text: "",
						x: tachieAlignMode()==="position" ? tachieDefaultX() : 0,
						y: tachieY(tcRef),
						width: tcRef.widthM,
						height: tcRef.heightM,
						z: tachieZ(tcRef),
					})
					layoutTachie(sTc)
				}
				if (!t.checked && at2 >= 0) {
					sTc.extraMarkers.splice(at2, 1)
					layoutTachie(sTc)
				}
				ui.sceneId = sTc.id
				render()
			}
		}
		if (d.var) state.room.variables[Number(d.i)][d.var] = t.value
		if (d.part) {
			state.baseMarkers.forEach(function (b) {
				if (b.id !== d.id) return
				if (d.part === "name") b.name = t.value
				else if (d.part === "imageUrl") {
					b.imageUrl = t.value || null
					fixAspect(b, "image")
				} else if (d.part === "lockAspect") {
					b.lockAspect = t.checked
					if (t.checked) fixAspect(b, "width")
				} else if (d.part === "lockMove") b.lockMove = t.checked
				else if (d.part === "visible") b.visible = t.checked
				else if (d.part === "text" || d.part === "memo") b[d.part] = t.value
				else if (d.part === "scope")
					b.scope = t.value === "scene" ? "scene" : "room"
				else {
					b[d.part] = ["x","y","width","height"].indexOf(d.part)>=0 ? snapHalf(t.value) : Number(t.value) || 0
					if (d.part === "width" || d.part === "height") fixAspect(b, d.part)
				}
			})
		}
		if (d.scene) {
			state.scenes.forEach(function (s) {
				if (s.id !== d.id) return
				if (d.scene === "backgroundUrl" || d.scene === "foregroundUrl")
					s[d.scene] = t.value || null
				else if(d.scene==="backgroundMode")s.backgroundMode=SCENE_BACKGROUND_MODES.indexOf(t.value)>=0?t.value:"room"
				else if(d.scene==="fieldWidth"||d.scene==="fieldHeight")s[d.scene]=Math.max(1,Number(t.value)||1)
				else if(d.scene==="autoCrop")s.fieldObjectFit=t.checked?"cover":"fill"
				else if(d.scene==="displayGrid")s.displayGrid=t.checked
				else s[d.scene] = t.value
			})
		}
		if (d.scut) {
			var sCut = sceneById(d.id)
			if (sCut) {
				if (!sCut.cutins) sCut.cutins = []
				var at = sCut.cutins.indexOf(d.scut)
				if (t.checked && at < 0) sCut.cutins.push(d.scut)
				if (!t.checked && at >= 0) sCut.cutins.splice(at, 1)
				render()
			}
		}
		if (d.em) {
			var sEm = sceneById(d.sceneId)
			var ems = sEm && sEm.extraMarkers ? sEm.extraMarkers : []
			ems.forEach(function (m) {
				if (m.id !== d.emId) return
				if (d.em === "name" || d.em === "text") m[d.em] = t.value
				else if (d.em === "fullFit") {
					m.fullFit = t.checked ? "cover" : "stretch"
					applyEmMode(m)
				}
				else if (d.em === "imageUrl") {
					m.imageUrl = t.value || null
					fixAspect(m, "image")
				} else if (d.em === "lockAspect") {
					m.lockAspect = t.checked
					if (t.checked) fixAspect(m, "width")
				} else if (d.em === "lockMove") m.lockMove = t.checked
				else {
					m[d.em] = ["x","y","width","height"].indexOf(d.em)>=0 ? snapHalf(t.value) : Number(t.value) || 0
					if (d.em === "width" || d.em === "height") fixAspect(m, d.em)
				}
			})
		}
		if (d.cut) {
			state.effects.forEach(function (ef) {
				if (ef.id !== d.id) return
				if (d.cut === "imageUrl") ef.imageUrl = t.value || null
				else ef[d.cut] = t.value
			})
		}
		if (d.ov) {
			var s2 = sceneById(d.sceneId)
			if (!s2) return
			var pid = d.partId
			if (d.ov === "show") {
				if (t.checked) {
					if (s2.overrides[pid] == null) s2.overrides[pid] = {}
					s2.overrides[pid].show = true
				} else if (s2.overrides[pid]) {
					delete s2.overrides[pid].show
					if (!Object.keys(s2.overrides[pid]).length) delete s2.overrides[pid]
				}
			} else if (d.ov === "hide") {
				if (t.checked) s2.overrides[pid] = null
				else delete s2.overrides[pid]
			} else if (d.ov === "lockMove") {
				if (s2.overrides[pid] == null) s2.overrides[pid] = {}
				s2.overrides[pid].lockMove = !!t.checked
			} else {
				if (s2.overrides[pid] == null) s2.overrides[pid] = {}
				if (t.value === "") delete s2.overrides[pid][d.ov]
				else s2.overrides[pid][d.ov] = ["x","y","width","height"].indexOf(d.ov)>=0 ? snapHalf(t.value) : d.ov==="z" ? Number(t.value) : t.value
				if (!Object.keys(s2.overrides[pid]).length) delete s2.overrides[pid]
			}
		}
		if (d.char) {
			state.characters.forEach(function (c) {
				if (c.id !== d.id) return
				if (d.char === "iconUrl") c.iconUrl = t.value || null
				else if (d.char === "hp" || d.char === "mp" || d.char === "maxHp" || d.char === "maxMp" || d.char === "armor" || d.char === "dodge")
					c[d.char] = t.value === "" ? null : Number(t.value)
				else if (d.char === "noDodge") c.noDodge = !!t.checked
				else c[d.char] = t.value
			})
			if (d.char === "noDodge") render()
		}
		if (d.skill) {
			var cSkill = state.characters.filter(function (c) { return c.id === d.cid })[0]
			var sk = cSkill && cSkill.skills ? cSkill.skills[Number(d.si)] : null
			if (sk) sk[d.skill] = d.skill === "value" ? (t.value === "" ? null : Number(t.value)) : t.value
		}
		if (d.kppc !== undefined) kpBag().pcs[Number(d.kppc)] = t.value
		if (d.kptpl) {
			var kb = kpBag()
			if (!kb.tpl[kb.system]) kb.tpl[kb.system] = { main: "", scene: "", memo: "" }
			kb.tpl[kb.system][d.kptpl] = t.value
		}
		if (d.kpsys !== undefined) {
			kpBag().system = t.value
			render()
		}
		if (d.kpcheck !== undefined) kpBag().checkType = t.value
	}

	document.addEventListener("keydown",function(e){if(e.code!=="Space"||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||""))return;if(ui.tab==="room"){ui.roomSpace=true;document.body.classList.add("room-pan");e.preventDefault()}else if(ui.tab!=="tachie"&&ui.tab!=="parts"&&ui.tab!=="panels"){ui.sceneSpace=true;document.body.classList.add("scene-pan");e.preventDefault()}})
	document.addEventListener("keyup",function(e){if(e.code==="Space"){ui.roomSpace=false;ui.sceneSpace=false;document.body.classList.remove("room-pan");document.body.classList.remove("scene-pan")}})
	/* ---------------- クリック ---------------- */
	document.addEventListener("click", function (e) {
		var t = e.target
		var cl = function (sel) {
			return t.closest ? t.closest(sel) : null
		}
		var d = t.dataset || {}
		var gradientStop=cl("[data-gradient-stop]")
		if(gradientStop){if(!ui.edit)ui.edit=edDefaults();ui.edit.gradientStop=gradientStop.dataset.gradientStop==="end"?"end":"start";renderModal();return}
		var imageMakerOpen = cl("[data-imakeropen]")
		if (imageMakerOpen) { var makerContext={kind:imageMakerOpen.dataset.imakeropen||"material"},makerSource="";if(makerContext.kind==="material"){var makerSelectedImages=selImages().filter(function(im){return !im.animated});if(makerSelectedImages.length===1)makerSource=makerSelectedImages[0].name}openImageMaker(makerContext,makerSource);return }
		if (t.id === "imageMakerUndo") { imageMakerUndo(); return }
		if (t.id === "imageMakerRedo") { imageMakerRedo(); return }
		var imageMakerAlignButton = cl("[data-imalign]")
		if (imageMakerAlignButton && ui.imageMaker) { imageMakerAlign(ui.imageMaker, imageMakerAlignButton.dataset.imalign); return }
		var imageMakerRatioReset = cl("[data-imageratioreset]")
		if (imageMakerRatioReset && ui.imageMaker) { var beforeRatioReset=imageMakerSnapshot(ui.imageMaker),ratioLayer=imageMakerLayer(imageMakerRatioReset.dataset.imageratioreset),rw=Number(ratioLayer&&ratioLayer.naturalWidth)||0,rh=Number(ratioLayer&&ratioLayer.naturalHeight)||0;if(ratioLayer&&rw>0&&rh>0&&!ratioLayer.locked){ratioLayer.height=Math.max(1,Math.round((Number(ratioLayer.width)||rw)*rh/rw));imageMakerCommitHistory(ui.imageMaker,beforeRatioReset);scheduleImageMakerPreview(true);scheduleImageMakerRender()}return }
		var imageMakerAction = cl("[data-imadd],[data-imselect],[data-imvisible],[data-imlock],[data-immove],[data-imduplicate],[data-imdelete]")
		if (imageMakerAction && ui.imageMaker) {
			var makerData=imageMakerAction.dataset,makerModel=ui.imageMaker,makerLayer,beforeMakerAction=imageMakerSnapshot(makerModel),makerChanged=false
			if(makerData.imadd){if(makerData.imadd==="image"){var proxy=document.createElement("button");proxy.dataset.makeraddimage="1";proxy.dataset.empty=T("maker.038");proxy.dataset.current="";openPicker(proxy);return}makerLayer=imageMakerNewLayer(makerData.imadd);makerModel.layers.unshift(makerLayer);imageMakerSetSelection(makerModel,[makerLayer.id]);makerChanged=true}
			else if(makerData.imselect){imageMakerToggleSelection(makerModel,makerData.imselect,e.shiftKey);makerModel.resultSize=0;makerModel.resultName="";makerModel.error="";refreshImageMakerSelectionUi();scheduleImageMakerPreview(false);return}
			else if(makerData.imvisible){makerLayer=imageMakerLayer(makerData.imvisible);if(makerLayer){makerLayer.visible=makerLayer.visible===false;makerChanged=true}}
			else if(makerData.imlock){makerLayer=imageMakerLayer(makerData.imlock);if(makerLayer){makerLayer.locked=!makerLayer.locked;makerChanged=true}}
			else if(makerData.immove){var moveAt=makerModel.layers.findIndex(function(layer){return layer.id===makerData.imid}),nextAt=moveAt+(makerData.immove==="up"?-1:1);if(moveAt>=0&&nextAt>=0&&nextAt<makerModel.layers.length){var moved=makerModel.layers.splice(moveAt,1)[0];makerModel.layers.splice(nextAt,0,moved);makerChanged=true}}
			else if(makerData.imduplicate){makerLayer=imageMakerLayer(makerData.imduplicate);if(makerLayer){var copy=JSON.parse(JSON.stringify(makerLayer));copy.id="im-"+uid();copy.name=makerLayer.name+T("click.001");copy.x=(Number(copy.x)||0)+16;copy.y=(Number(copy.y)||0)+16;var copyAt=makerModel.layers.indexOf(makerLayer);makerModel.layers.splice(copyAt,0,copy);imageMakerSetSelection(makerModel,[copy.id]);makerChanged=true}}
			else if(makerData.imdelete){makerLayer=imageMakerLayer(makerData.imdelete);if(makerLayer&&confirm(T("click.002"))){makerModel.layers=makerModel.layers.filter(function(layer){return layer.id!==makerLayer.id});imageMakerSetSelection(makerModel,makerModel.layers[0]?[makerModel.layers[0].id]:[]);makerChanged=true}}
			if(makerChanged)imageMakerCommitHistory(makerModel,beforeMakerAction)
			makerModel.resultSize=0;makerModel.resultName="";makerModel.error="";scheduleImageMakerRender();return
		}
		if (t.id === "imageMakerGo") { runImageMaker(); return }
		var apngOpen = cl("[data-apngopen]")
		if (apngOpen) {
			var ad = apngOpen.dataset || {}, context = { kind: ad.apngopen || "material" }, sourceName = ""
			if (context.kind === "scene") {
				context.sceneId = ad.apngSceneId; context.effectId = ad.apngEffectId
				var apngScene = sceneById(context.sceneId), apngMarker = apngScene && emById(apngScene, context.effectId)
				sourceName = apngMarker && apngMarker.imageUrl || ""
			} else if (context.kind === "preset") {
				context.presetId = ad.apngPresetId
				var apngPreset = emPresetById(context.presetId)
				sourceName = apngPreset && apngPreset.imageUrl || ""
			} else {
				context.kind = "material"
				var selectedSource = selImages().filter(function (im) { return !im.animated })
				if (selectedSource.length === 1) sourceName = selectedSource[0].name
			}
			openApngMaker(context, sourceName)
			return
		}
		if (t.id === "apngGo") { runApngMaker(); return }

		// 画像選択パネル
		var pk = cl(".imgpick")
		if (pk) return openPicker(pk)
		var upTile = cl("[data-pupload]")
		if (upTile) {
			var inp = $("#pupload")
			if (inp) inp.click()
			return
		}
		var prole = cl("[data-prole]")
		if (prole) {
			pickRole = prole.dataset.prole || ""
			renderPickerGrid($("#pfilter") ? $("#pfilter").value : "")
			return
		}
		// 一括作成の複数選択タイル
		var mpt = cl("[data-mp]")
		if (mpt) {
			var mpn = mpt.dataset.mp
			if (!ui.pickSel) ui.pickSel = []
			if (e.shiftKey) {
				var mpAllN = all("[data-mp]").map(function (x) {
					return x.dataset.mp
				})
				var mpLast = ui.pickSel.length
					? ui.pickSel[ui.pickSel.length - 1]
					: null
				var mpA = mpLast ? mpAllN.indexOf(mpLast) : 0
				var mpB = mpAllN.indexOf(mpn)
				var mpLo = Math.min(mpA, mpB),
					mpHi = Math.max(mpA, mpB)
				for (var mpI = mpLo; mpI <= mpHi; mpI++)
					if (ui.pickSel.indexOf(mpAllN[mpI]) < 0)
						ui.pickSel.push(mpAllN[mpI])
			} else {
				var mpAt = ui.pickSel.indexOf(mpn)
				if (mpAt >= 0) ui.pickSel.splice(mpAt, 1)
				else ui.pickSel.push(mpn)
			}
			mpRefresh()
			return
		}
		if (t.id === "mpAll") {
			ui.pickSel = all("[data-mp]").map(function (x) {
				return x.dataset.mp
			})
			mpRefresh()
			return
		}
		if (t.id === "mpNone") {
			ui.pickSel = []
			mpRefresh()
			return
		}
		if (t.id === "mpGo") return runMultiPick()
		var mkT = cl("[data-pmake]")
		if (mkT) {
			var mkKind = mkT.dataset.pmake
			var curNm = pickTarget ? pickTarget.dataset.current : ""
			pickBack = pickTarget
			if (mkKind === "solid") {
				closePicker()
				ui.modal = "solid"
				render()
				return
			}
			if (mkKind === "apng") {
				closePicker()
				openApngMaker({ kind: "picker" }, curNm)
				return
			}
			if (mkKind === "maker") {
				closePicker()
				openImageMaker({ kind: "picker" }, curNm)
				return
			}
			var imM = imageByName(curNm)
			closePicker()
			if (!imM) {
				pickBack = null
				return toast(T("click.003"), "warn")
			}
			ui.editImg = imM.id
			ui.edit = edDefaults()
			ui.modal = "edit"
			render()
			return
		}
		var tile = cl(".ptile")
		if (tile) return choosePick(tile.dataset.name)
		if (t.id === "pclose" || t.id === "picker") return closePicker()

		// ホームと左メニュー
		var go = cl("[data-goto]")
		if (go) {
			ui.tab = go.dataset.goto
			if (ui.tab === "parts" || ui.tab === "panels") ui.tab = "room"
			if (ui.tab !== "home") ui.lastWorkTab = ui.tab
			render()
			return
		}
		if (t.dataset && t.dataset.addroomph) { var h=Number(state.room.tachieHeight)||18;roomPlaceholders().push({id:"ph"+uid(),x:tachieDefaultX()+roomPlaceholders().length*2,y:tachieY({heightM:h,dy:0}),height:h,locked:false});layoutRoomPlaceholders();render();return }
		if (t.dataset && t.dataset.roompartsJump) { var rp=$("#roomPartsIntegrated"); if(rp) rp.scrollIntoView({behavior:"smooth",block:"start"}); return }
		if (t.id === "homeLoad") { var hf=$("#hLoad"); if(hf) hf.click(); return }
		if (t.id === "homeSample") { loadSampleProject(); return }
		if (t.id === "homeProjectName" || t.id === "projTitle" || t.id === "studioProjectName") { editProjectName(); return }
		if (t.dataset && t.dataset.roomsize) { var rs=t.dataset.roomsize.split(","); state.room.fieldWidth=Number(rs[0]); state.room.fieldHeight=Number(rs[1]); render(); return }
		if(d.roomzoom){if(d.roomzoom==='fit'){ui.roomZoom=Math.max(.25,Math.min(1.4,.82*Math.min(40/(Number(state.room.fieldWidth)||40),30/(Number(state.room.fieldHeight)||30))));ui.roomPanX=0;ui.roomPanY=0}else ui.roomZoom=Math.max(.25,Math.min(2.5,(Number(ui.roomZoom)||.82)+(d.roomzoom==='+'?.1:-.1)));render();return}
		if(d.scenezoom){ui.sceneZoom=Math.max(.35,Math.min(3,(Number(ui.sceneZoom)||1)+(d.scenezoom==='+'?.1:-.1)));renderRight();return}
		if(d.roomguide){settingsBag().guides=!!t.checked;render();return}
		if(d.roomlayers){ui.roomLayers=!!t.checked;render();return}
		if(d.roomclear){ui.roomSel=[];render();return}
		if(d.roomalign){roomAlign(d.roomalign);return}
		if(d.roomscale){roomScale(Number(d.roomscale));return}
		if(d.roomdetail){ui.modal='src';ui.srcRef={kind:'part',id:d.roomdetail};render();return}
		if(d.roomedit){var rb=partById(d.roomid),im=rb&&rb.imageUrl?imageByName(rb.imageUrl):null;if(!im)return toast(T("click.004"),'warn');ui.editImg=im.id;ui.edit=edDefaults();if(d.roomedit==='flip')ui.edit.flip=true;if(d.roomedit==='opacity')ui.edit.opacity=75;ui.modal='edit';render();return}
		if (t.id === "homeExport") return doExport()
		if (t.id === "homeBroken") { ui.modal = "broken"; render(); return }
		if (cl("#sideToggle")) { ui.sideCollapsed=!ui.sideCollapsed;saveLocal();render();return }
		var nav = cl(".nav")
		if (nav) {
			ui.tab = nav.dataset.tab
			if (ui.tab !== "home") ui.lastWorkTab = ui.tab
			render()
			return
		}
		// 右パネル
		var rt = cl(".rtab")
		if (rt) {
			ui.rightTab = rt.dataset.rtab
			ui.rightOpen = true
			render()
			return
		}
		if (t.id === "rpin") {
			ui.rightPinned = !ui.rightPinned
			render()
			toast(ui.rightPinned ? T("click.005") : T("click.006"))
			return
		}
		if (t.id === "rclose") {
			ui.rightOpen = false
			render()
			return
		}
		if (t.id === "ropen") {
			ui.rightOpen = true
			render()
			return
		}
		// ピン留めしていないときは外側クリックで閉じる
		if (ui.rightOpen && !ui.rightPinned && !cl("#right") && !cl(".modal")) {
			ui.rightOpen = false
			render()
			return
		}
		// 下段
		if (t.id === "btoggle") {
			ui.bottomOpen = !ui.bottomOpen
			render()
			return
		}
		if (d.tup || d.tdown) {
			var tid = d.tup || d.tdown
			var ti = -1
			state.tasks.forEach(function (x, i) {
				if (x.id === tid) ti = i
			})
			var tj = d.tup ? ti - 1 : ti + 1
			if (ti >= 0 && tj >= 0 && tj < state.tasks.length) {
				var tmpT = state.tasks[ti]
				state.tasks[ti] = state.tasks[tj]
				state.tasks[tj] = tmpT
			}
			renderBottom()
			saveLocal()
			return
		}
		if (d.tsub) {
			state.tasks.forEach(function (x) {
				if (x.id === d.tsub) x.sub = !x.sub
			})
			renderBottom()
			saveLocal()
			return
		}
		if (d.tdel) {
			state.tasks = state.tasks.filter(function (x) {
				return x.id !== d.tdel
			})
			renderBottom()
			saveLocal()
			return
		}
		// メディア欄からの割り当て
		if (d.setfg || d.setscenebg) {
			var sc = currentScene()
			if (!sc) return toast(T("click.007"), "warn")
			if (d.setfg) sc.foregroundUrl = d.setfg
			else { sc.backgroundUrl = d.setscenebg; sc.backgroundMode = "image" }
			render()
			toast(T("click.008", sc.name), "ok")
			return
		}
		if (d.setbasebg) {
			state.room.backgroundUrl = d.setbasebg
			render()
			toast(T("click.009"), "ok")
			return
		}
		if (d.mrole != null && t.classList.contains("chip")) {
			if (!d.mrole) ui.mediaRoles = []
			else {
				var atR = ui.mediaRoles.indexOf(d.mrole)
				if (atR >= 0) ui.mediaRoles.splice(atR, 1)
				else ui.mediaRoles.push(d.mrole)
			}
			renderRight()
			return
		}
		if (d.tgroup != null && t.classList.contains("chip")) {
			ui.tachieGroup = d.tgroup
			render()
			return
		}
		if (d.tcfrom) {
			var imT = imageByName(d.tcfrom)
			if (imT) {
				addTachieLib({ name: imT.label, imageUrl: imT.name })
				toast(T("click.010", imT.label), "ok")
			}
			return
		}

		if (t.id === "undoBtn") return undo()
		if (t.id === "redoBtn") return redo()
		if (t.id === "hSave") return saveProjectSmart(false)
		if (t.id === "hSaveAs" || t.id === "pickSaveTarget")
			return saveProjectSmart(true)
		if (d.settingscat) { ui.settingsCat = d.settingscat; render(); return }
		if (t.id === "siteAdd") {
			settingsBag().sites.push({ n: T("click.011"), u: "https://" })
			render()
			return
		}
		if (t.id === "siteReset") {
			if (!confirm(T("click.012"))) return
			settingsBag().sites = exSites().map(function (x) {
				return { n: x.n, u: x.u }
			})
			render()
			return
		}
		if (d.siteup != null || d.sitedown != null) {
			var sArr = settingsBag().sites
			var sI = Number(d.siteup != null ? d.siteup : d.sitedown)
			var sJ = d.siteup != null ? sI - 1 : sI + 1
			if (sJ >= 0 && sJ < sArr.length) {
				var sTmp = sArr[sI]
				sArr[sI] = sArr[sJ]
				sArr[sJ] = sTmp
				render()
			}
			return
		}
		if (d.delsite != null) {
			settingsBag().sites.splice(Number(d.delsite), 1)
			render()
			return
		}
		if (d.guide) {
			var sg = settingsBag()
			sg.guides = sg.guides === false
			renderRight()
			return
		}
		if (d.tchide) {
			if (!ui.tachieHide) ui.tachieHide = []
			if (d.tchide === "*") ui.tachieHide = []
			else {
				var kH = ui.tachieHide.indexOf(d.tchide)
				if (kH >= 0) ui.tachieHide.splice(kH, 1)
				else ui.tachieHide.push(d.tchide)
			}
			renderRight()
			return
		}
		if (d.auto) return autoRestore(d.auto)
		if (t.id === "export") return doExport()
		if (t.id === "autoRename") return autoRename()
		if (d.fsize) {
			var fsp = String(d.fsize).split("x")
			state.room.fieldWidth = Number(fsp[0]) || 37
			state.room.fieldHeight = Number(fsp[1]) || 17
			syncTachie()
			render()
			return
		}
		if (t.id === "fitFg") {
			var fa2 = fgAspect()
			if (!fa2) return toast(T("click.013"), "warn")
			state.room.fieldHeight =
				Math.round((state.room.fieldWidth / fa2) * 2) / 2
			syncTachie()
			render()
			toast(
				T("click.014", state.room.fieldHeight),
				"ok",
			)
			return
		}
		if (d.zup) return zSwap(d.zup, 1)
		if (d.zdown) return zSwap(d.zdown, -1)
		if (d.zedit) {
			var targetZ = null
			if (d.zedit === "base") targetZ = partById(d.zid)
			else {
				var zsc = currentScene()
				targetZ = zsc ? emById(zsc, d.zid) : null
			}
			if (!targetZ) return
			var zv = window.prompt(T("click.015"), String(Number(targetZ.z) || 0))
			if (zv == null || String(zv).trim() === "") return
			var zn = Number(zv)
			if (!isFinite(zn)) return toast(T("click.016"), "warn")
			targetZ.z = zn
			render()
			return
		}
		// 素材タイルをクリックしてえらぶ（シーン一覧と同じ感じ）
		if (t.id === "imgSelNone2") {
			ui.imgSel = []
			return imgSelRefresh()
		}
		var imTile = cl("[data-imgsel]")
		if (
			imTile &&
			t.tagName !== "INPUT" &&
			t.tagName !== "BUTTON" &&
			t.tagName !== "LABEL" &&
			!cl(".rchips") &&
			!cl(".chip")
		) {
			var imId = imTile.dataset.imgsel
			if (!Array.isArray(ui.imgSel)) ui.imgSel = []
			var imOrder = imgFiltered().map(function (im) {
				return im.id
			})
			if (e.shiftKey && ui.imgLast) {
				var iA = imOrder.indexOf(ui.imgLast)
				var iB = imOrder.indexOf(imId)
				if (iA >= 0 && iB >= 0) {
					var iLo = Math.min(iA, iB)
					var iHi = Math.max(iA, iB)
					for (var iX = iLo; iX <= iHi; iX++)
						if (ui.imgSel.indexOf(imOrder[iX]) < 0) ui.imgSel.push(imOrder[iX])
				}
			} else {
				var iAt = ui.imgSel.indexOf(imId)
				if (iAt >= 0) ui.imgSel.splice(iAt, 1)
				else ui.imgSel.push(imId)
			}
			ui.imgLast = imId
			imgSelRefresh()
			return
		}
		if (d.imggoto) {
			ui.modal = null
			ui.tab = d.imggoto
			if (d.imgscene) ui.sceneId = d.imgscene
			render()
			return
		}
		if (d.imguse) {
			var uIm = state.images.filter(function (x) {
				return x.id === ui.infoImg
			})[0]
			if (!uIm) return
			if (d.imguse === "fg" || d.imguse === "basefg") {
				if (d.imguse === "basefg") state.room.foregroundUrl = uIm.name
				else {
					var uSc = currentScene()
					if (uSc) uSc.foregroundUrl = uIm.name
				}
				ui.modal = null
				render()
				return toast(d.imguse === "basefg" ? T("click.017") : T("click.018"), "ok")
			}
			ui.imgSel = [uIm.id]
			ui.imgQ = ""
			ui.imgRoles = []
			ui.modal = null
			return makeFromSel(d.imguse)
		}
		if (d.imginfo) {
			ui.infoImg = d.imginfo
			ui.modal = "info"
			render()
			return
		}
		if (d.imgrolef) {
			if (!Array.isArray(ui.imgRoles)) ui.imgRoles = []
			if (d.imgrolef === "*") ui.imgRoles = []
			else {
				var atRf = ui.imgRoles.indexOf(d.imgrolef)
				if (atRf >= 0) ui.imgRoles.splice(atRf, 1)
				else ui.imgRoles.push(d.imgrolef)
			}
			render()
			return
		}
		if (t.id === "imgRenameMode") { ui.modal = "imgren"; render(); return }
		if (t.id === "imgrenGo") return applyImgRename()
		if (t.id === "imgSelAll") {
			ui.imgSel = imgFiltered().map(function (im) {
				return im.id
			})
			render()
			return
		}
		if (t.id === "imgSelNone") {
			ui.imgSel = []
			render()
			return
		}
		if (d.imgtag) return tagSel(d.imgtag, d.tagon === "1")
		if (t.id === "imgDel") return delSel()
		if (t.id === "imgRen") return seqRename()
		if (t.id === "imgRep") return findReplace()
		if (d.imgmake) return makeFromSel(d.imgmake)
		if (d.favadd) { favAdd(d.favadd); return }
		if (d.favuse) { favUse(d.favuse); return }
		if (d.favdel) { favDel(d.favdel); return }
		if (d.parttplimage) { partTemplateImageUse(d.parttplimage,d.tplresource).then(function(name){if(name){render();saveLocal();toast(T("click.019"),"ok")}});return }
		if (d.tplmediafilter) { ui.tplMediaFilter=d.tplmediafilter;render();return }
		if (d.delimg) {
			state.images = state.images.filter(function (im) {
				return im.id !== d.delimg
			})
			render()
			return
		}
		if (t.id === "addPart") return addPart({ role: "part" })
		if (t.id === "addPanel")
			return addPart({ role: "panel", name: roleName("パネル"), x: 0, y: 0 })
		if (t.id === "addPanelPreset")
			return addPart({
				role: "panel",
				name: roleName("パネル"),
				width: 5,
				height: 10,
				x: -14,
				y: 3,
			})
		if (t.id === "addTachie")
			return addPart({
				role: "part",
				name: roleName("立ち絵"),
				width: 13,
				height: 18,
				x: 0,
				y: 0,
				z: roomZ().tachie,
			})
		if (d.partup || d.partdown) {
			var pmId = d.partup || d.partdown
			var pmI = -1
			state.baseMarkers.forEach(function (b, k) {
				if (b.id === pmId) pmI = k
			})
			if (pmI < 0) return
			var pmRole = partsRole(state.baseMarkers[pmI])
			var pmJ = -1
			var pmStep = d.partup ? -1 : 1
			for (var pk = pmI + pmStep; pk >= 0 && pk < state.baseMarkers.length; pk += pmStep) {
				if (partsRole(state.baseMarkers[pk]) === pmRole) {
					pmJ = pk
					break
				}
			}
			if (pmJ >= 0) {
				var pmT = state.baseMarkers[pmI]
				state.baseMarkers[pmI] = state.baseMarkers[pmJ]
				state.baseMarkers[pmJ] = pmT
				render()
			}
			return
		}
		if (d.partmove) {
			state.baseMarkers.forEach(function (b) {
				if (b.id !== d.partmove) return
				if (partsRole(b) === "panel") {
					b.role = "part"
					toast(T("click.020"))
				} else {
					b.role = "panel"
					b.scope = "room"
					toast(T("click.021"))
				}
			})
			render()
			return
		}
		if (d.delpart) {
			state.baseMarkers = state.baseMarkers.filter(function (b) {
				return b.id !== d.delpart
			})
			state.scenes.forEach(function (s) {
				delete s.overrides[d.delpart]
			})
			render()
			return
		}
		if (t.id === "scenesFromImages") return scenesFromImages()
		// 素材をさがす（外部サイト）
		var exb = cl("[data-ex]")
		if (exb) {
			var exq = $("#imgq") ? $("#imgq").value.trim() : ""
			window.open(exUrl(exb.dataset.ex, exq), "_blank", "noopener")
			return
		}
		// 1色の画像
		if (t.id === "openSolid") {
			if (!ui.solid) ui.solid = { color: "#000000", w: 8, name: "" }
			ui.modal = "solid"
			render()
			return
		}
		if (d.solidc) {
			if (!ui.solid) ui.solid = { color: "#000000", w: 8, name: "" }
			ui.solid.color = d.solidc
			renderModal()
			return
		}
		if (t.id === "solidGo") {
			makeSolid()
			return
		}
		// 画像の加工
		if (d.editimg) {
			ui.editImg = d.editimg
			ui.edit = edDefaults()
			ui.modal = "edit"
			render()
			return
		}
		if (t.id === "editReset") {
			var keepRep = !!(ui.edit && ui.edit.replace)
			ui.edit = edDefaults()
			ui.edit.replace = keepRep
			renderModal()
			return
		}
		if (t.id === "editFlip") {
			if (!ui.edit) ui.edit = edDefaults()
			ui.edit.flip = !ui.edit.flip
			renderModal()
			return
		}
		if (t.id === "editRot") {
			if (!ui.edit) ui.edit = edDefaults()
			ui.edit.rot = ((Number(ui.edit.rot) || 0) + 90) % 360
			renderModal()
			return
		}
		if (t.id === "editGo") {
			runImgEdit()
			return
		}
		if (t.id === "editApng") {
			openApngFromEdit()
			return
		}
		if (t.id === "openBulk") {
			ui.modal = "bulk"
			render()
			var bt = $("#bulkText")
			if (bt) bt.focus()
			return
		}
		if (t.id === "openTpl") {
			ui.modal = "tpl"
			render()
			return
		}
		if (t.id === "m2close" || t.id === "modal2") {
			if (ui.modal === "apng" && ui.apng && ui.apng.busy) return toast(T("click.022"), "warn")
			if (ui.modal === "imageMaker" && ui.imageMaker && ui.imageMaker.busy) return toast(T("click.023"), "warn")
			if (ui.modal === "apng") {
				var apngReturn = ui.apng && ui.apng.context && ui.apng.context.returnModal
				stopApngPreview(); releaseApngSource(ui.apng); ui.apng = null; pickBack = null
				ui.modal = apngReturn || null
			} else if (ui.modal === "imageMaker") { releaseImageMaker(); ui.imageMaker=null; pickBack=null; ui.modal=null }
			else ui.modal = null
			render()
			return
		}
		if (t.id === "pickMode") {
			ui.multiPick = !ui.multiPick
			render()
			toast(
				ui.multiPick
					? T("click.024")
					: T("click.025"),
			)
			return
		}
		if (t.id === "selAll") {
			ui.sceneSel = state.scenes.map(function (s) {
				return s.id
			})
			render()
			return
		}
		if (d.roomapply) {
			var roomApplyIds = d.roomapply === "current" ? [d.id || ui.sceneId] : d.roomapply === "selected" ? selIds().slice() : state.scenes.map(function (s) { return s.id })
			return applyRoomDesignToScenes(roomApplyIds, d.roomapply !== "current")
		}
		if (d.pz != null && t.classList.contains("chip")) {
			ui.previewPad = Number(d.pz) || 0
			if(ui.tab!=="tachie"&&ui.tab!=="room"){ui.sceneZoom=scenePresetZoom(ui.previewPad);ui.scenePanX=0;ui.scenePanY=0}
			ui.rightTab = "preview"
			renderRight()
			return
		}
		if (d.sceneheight != null) {
			ui.scenePvHeight = Math.max(170, Math.min(520, Number(d.sceneheight) || 220))
			renderRight()
			return
		}
		if (t.id === "bulkAdd") {
			ui.modal = null
			return bulkScenes()
		}
		if (t.id === "tplSave") return tplFromScene()
		if (d.tpladd) {
			ui.modal = null
			return tplAddScene(d.tpladd)
		}
		if (d.tplapply) {
			ui.modal = null
			return tplApply(d.tplapply, d.tplmode)
		}
		if (d.tpldel) {
			state.sceneTemplates = state.sceneTemplates.filter(function (tp) {
				return tp.id !== d.tpldel
			})
			render()
			return
		}
		if (d.sym) {
			var qi = $("#quickScene")
			if (qi) {
				qi.value = (qi.value || "") + d.sym
				qi.focus()
			}
			return
		}
		if (t.id === "newHide" || t.id === "newOpen") {
			ui.newHide = t.id === "newHide"
			render()
			return
		}
		if (t.id === "clipMin" || t.id === "clipOpen") {
			ui.clipMin = t.id === "clipMin"
			render()
			return
		}
		if (t.id === "imgDockMin" || t.id === "imgDockOpen") {
			ui.dockMin = t.id === "imgDockMin"
			imgDockRefresh()
			return
		}
		var lyrRow = cl(".scene-layer-list .lyr[data-layerid]")
		if (lyrRow && !cl("button") && !cl("label") && !cl("input")) { e.preventDefault(); e.stopPropagation(); markScenePreviewSelection(lyrRow.dataset.layerid); if(lyrRow.dataset.rowsec)return goSec(lyrRow.dataset.rowsec,lyrRow.dataset.rowmarker); return }
		if (d.gosec) return goSec(d.gosec)
		if (d.pvhide) {
			if (!ui.pvHide) ui.pvHide = []
			var atH = ui.pvHide.indexOf(d.pvhide)
			if (atH >= 0) ui.pvHide.splice(atH, 1)
			else ui.pvHide.push(d.pvhide)
			renderRight()
			return
		}
		if (d.truehide) {
			var hs = currentScene()
			if (!hs) return
			if (!hs.overrides) hs.overrides = {}
			if (hs.overrides[d.truehide] === null) delete hs.overrides[d.truehide]
			else hs.overrides[d.truehide] = null
			render()
			toast(hs.overrides[d.truehide] === null ? T("click.026") : T("click.027"), "ok")
			return
		}
		if (d.cutadd) {
			var sCa = sceneById(d.cutadd)
			var pk = $("#cutPick")
			var cid2 = pk ? pk.value : ""
			if (!sCa || !cid2) return toast(T("click.028"), "warn")
			if (!sCa.cutins) sCa.cutins = []
			sCa.cutins = cid2 ? [cid2] : []
			render()
			return
		}
		if (d.scutoff) {
			var sCo = sceneById(d.id)
			if (sCo && sCo.cutins)
				sCo.cutins = sCo.cutins.filter(function (x) {
					return x !== d.scutoff
				})
			render()
			return
		}
		if (d.cutintplsave) return cutinTemplateRegisterOne(d.cutintplsave)
		if (d.cutinselectall) { ui.cutinSel = state.effects.map(function (effect) { return effect.id }); ui.cutinSelectMode = ui.cutinSel.length > 0; render(); return }
		if (d.cutinselectclear) { ui.cutinSel = []; ui.cutinSelectMode = false; render(); return }
		if (d.cutinselectsave) return cutinTemplateSaveSelected()
		if (d.citplapply) return cutinTemplateApply(d.citplapply)
		if (d.citpldel) return cutinTemplateDelete(d.citpldel)
		if (d.citplsepadd) return cutinTemplateAddSeparator((($("#cutinTemplateSeparatorName") || {}).value) || "")
		if (d.citplsepdel) return cutinTemplateDeleteSeparator(d.citplsepdel)
		if (d.frommat) return openMultiPick(d.frommat)
		if (d.tplsavelib) return libTplSave(d.tplsavelib)
		if (d.tplapplylib) return libTplApply(d.tplapplylib, d.tplid)
		if (d.tpldellib) {
			var lst = libTplList(d.tpldellib)
			var atT = -1
			lst.forEach(function (x, i2) {
				if (x.id === d.tplid) atT = i2
			})
			if (atT >= 0) lst.splice(atT, 1)
			render()
			return
		}
		if (d.pmake) {
			var curName = pickTarget ? pickTarget.dataset.current : ""
			if (d.pmake === "solid") {
				closePicker()
				ui.modal = "solid"
				render()
				return
			}
			var imE = imageByName(curName)
			closePicker()
			if (!imE) return toast(T("click.003"), "warn")
			ui.editImg = imE.id
			ui.edit = edDefaults()
			ui.modal = "edit"
			render()
			return
		}
		if (t.id === "epAdd") {
			var epN = $("#epName")
			var nmE = epN && epN.value.trim() ? epN.value.trim() : roleName("演出")
			var kE = $("#epKind") ? $("#epKind").value : "full"
			var zE = $("#epZ") ? Number($("#epZ").value) || 40 : 40
			var epTextEl = $("#epText"), epFitEl = $("#epFit")
			var epPreset = emPresetAddFromValues(nmE, ui.epImg || null, kE, zE, 6, 6, epFitEl ? epFitEl.value : null, epTextEl ? epTextEl.value : "")
			if (!epPreset) return
			ui.epName = ""
			ui.epImg = ""
			render()
			toast(T("click.029"), "ok")
			return
		}
		if (t.id === "epSeparatorAdd") { emSeparatorAdd((($("#epSeparatorName") || {}).value) || ""); return }
		if (d.epdel != null && d.epdel !== "") { emPresetDelete(d.epdel); return }
		if (d.epdelId) { emPresetDelete(d.epdelId); return }
		if (d.epSeparatorAdd) { emSeparatorAdd(($("#epSeparatorName") || {}).value); return }
		if (d.empsepdel) { emSeparatorDelete(d.empsepdel); return }
		var emS = cl("[data-emsave]")
		if (emS) {
			var sSv = sceneById(emS.dataset.sceneId)
			var mSv = emById(sSv, emS.dataset.emsave)
			if (!mSv) return
			var saveName=String(mSv.name || roleName("演出")).trim() || roleName("演出")
			var emPreset = emPresetAddFromValues(saveName, mSv.imageUrl || null, mSv.kind === "full" ? "full" : "free", mSv.z != null ? mSv.z : roomZ().effect, mSv.width || 6, mSv.height || 6, mSv.fullFit || "stretch", mSv.text || "")
			if (!emPreset) return
			render()
			toast(T("click.029"), "ok")
			return
		}
		if (d.sceneemadd) {
			var sAdd=sceneById(d.sceneemadd), pickEm=$("#sceneEmChoice"), valEm=pickEm?pickEm.value:"new", ppEm=null
			if(!sAdd)return
			if(valEm.indexOf("preset:")===0)ppEm=emPresetById(valEm.split(":")[1])
			return addSceneEffectFromPreset(sAdd,ppEm,"cover")
		}
		if (d.scenecutadd) {
			var sCa=sceneById(d.scenecutadd), cutSel=$("#sceneCutChoice"), cutVal=cutSel?cutSel.value:"new", efCa
			if(!sCa)return
			if(cutVal==="new"){
				efCa={id:C.newId(),name:T("click.030"),imageUrl:null};state.effects.push(efCa)
			}else efCa=state.effects.find(function(x){return x.id===cutVal})
			if(!efCa)return
			sCa.cutins=[efCa.id];render();toast(T("click.031"),"ok");return
		}
		if (d.scpartsopen) { var wasAll=ui.scenePartsOpen||ui.openOv;ui.scenePartsOpen=!wasAll;ui.openOv=false;render();return }
		var foldBtn=cl("[data-scfold]")
		if (foldBtn) { var foldKey=foldBtn.dataset.scfold;if(!ui.sceneFolds)ui.sceneFolds={};ui.sceneFolds[foldKey]=!sceneFoldOpen(foldKey);render();return }
		if (d.scpartedit) { ui.scenePartEdit=ui.scenePartEdit===d.scpartedit?null:d.scpartedit;render();return }
		if (d.scpartreset) {
			var sRs=sceneById(d.sceneId);if(sRs&&sRs.overrides)delete sRs.overrides[d.scpartreset]
			render();toast(T("click.032"),"ok");return
		}
		if (d.emprea) {
			var sPr = sceneById(d.emprea)
			var selPr = $("#emPreset")
			var pp = selPr && selPr.value.indexOf("preset:") === 0 ? emPresetById(selPr.value.slice(7)) : null
			if (!sPr || !pp) return toast(T("click.033"), "warn")
			return addSceneEffectFromPreset(sPr,pp,"stretch")
		}
		var stB = cl("[data-stool]")
		if (stB) {
			var stK = stB.dataset.stool || ""
			ui.toolOpen = stK && ui.toolOpen !== stK ? stK : null
			ui.tab = "scenes"
			render()
			return
		}
		if (d.scopy) {
			if (ui.clip && ui.clip.id === d.scopy) {
				ui.clip = null
				ui.clipMin = false
				ui.toolOpen = null
				render()
				toast(T("click.034"))
				return
			}
			ui.toolOpen = null
			return sceneClipGrab(d.scopy)
		}
		if (d.spaste) {
			if (d.spaste === "clear") {
				ui.clip = null
				ui.toolOpen = null
				render()
				return
			}
			return sceneClipPaste(d.spaste)
		}
		if (t.id === "addSceneBtn") {
			var qi2 = $("#quickScene")
			var nv = qi2 && qi2.value.trim() ? qi2.value.trim() : T("click.035")
			var ns = newScene(nv, ui.newFg || null)
			state.scenes.push(ns)
			ui.sceneId = ns.id
			render()
			var qi3 = $("#quickScene")
			if (qi3) {
				qi3.value = ""
				qi3.focus()
			}
			return
		}
		if (t.id === "openRen" || t.id === "openRen2") {
			ui.modal = "sren"
			ui.tab = "scenes"
			render()
			return
		}
		if (d.snameedit) {
			ui.nameEditId = d.snameedit
			ui.modal = "sname"
			render()
			setTimeout(function () { var x = $("#snameText"); if (x) { x.focus(); x.select() } }, 0)
			return
		}
		if (t.id === "snameGo") return applySceneName()
		if (t.id === "renClose") {
			ui.toolOpen = null
			render()
			return
		}
		if (t.id === "openStory") {
			ui.tab = "story"
			render()
			return
		}
		if (t.id === "storyGo") return storyMake()
		if (t.id === "storyBulkGo") return storyBulkMake()
		if (t.id === "tplExport") return tplExport()
		if (d.mgredit) {
			ui.tplDetail = { kind: d.mgredit, id: d.mgrid }
			ui.modal = "tpldetail"
			render()
			return
		}
		if (d.mgrdel) return tplMgrDel(d.mgrdel, d.mgrid)
		if (d.mgruse) {
			if (d.mgruse === "scene") tplAddScene(d.mgrid)
			else if (d.mgruse === "parttpl") partTemplateUse(d.mgrid)
			else if (d.mgruse === "chartpl") characterTemplateUse(d.mgrid)
			else if (d.mgruse === "cutin") cutinTemplateApply(d.mgrid)
			else libTplApply(d.mgruse, d.mgrid)
			return
		}
		if (d.tbulk) return applyTachieBulk(d.tbulk)
		if (t.id === "srenGo") return applyRename()
		if (d.delscene) {
			state.scenes = state.scenes.filter(function (s) {
				return s.id !== d.delscene
			})
			if (ui.sceneId === d.delscene) ui.sceneId = null
			render()
			return
		}
		if (d.dupscene) {
			var i0 = state.scenes.findIndex(function (s) {
				return s.id === d.dupscene
			})
			if (i0 >= 0) {
				var src = state.scenes[i0]
				var copy = JSON.parse(JSON.stringify(src))
				copy.id = C.newId()
				copy.name = src.name + T("click.036")
				state.scenes.splice(i0 + 1, 0, copy)
				ui.sceneId = copy.id
				render()
			}
			return
		}
		if (d.up || d.down) {
			var id = d.up || d.down
			var i = state.scenes.findIndex(function (s) {
				return s.id === id
			})
			var j = d.up ? i - 1 : i + 1
			if (j >= 0 && j < state.scenes.length) {
				var tmp = state.scenes[i]
				state.scenes[i] = state.scenes[j]
				state.scenes[j] = tmp
				render()
			}
			return
		}
		var rov = cl("[data-resetov]")
		if (rov) return clearOvPos(rov.dataset.resetov)
		var sed = cl("[data-srcedit]")
		if (sed) {
			var csc = currentScene()
			ui.srcRef = {
				kind: sed.dataset.srcedit,
				id: sed.dataset.srcId,
				sceneId: sed.dataset.sceneId || (csc ? csc.id : null),
			}
			ui.modal = "src"
			render()
			return
		}
		var rsc = cl("[data-resetscene]")
		if (rsc) return clearScenePos(sceneById(rsc.dataset.resetscene))
		var rall = cl("[data-resetall]")
		if (rall) return clearAllPos()
		var dpp = cl("[data-duppart]")
		if (dpp) {
			var bSrc = partById(dpp.dataset.duppart)
			if (bSrc) {
				var cp = JSON.parse(JSON.stringify(bSrc))
				cp.id = C.newId()
				cp.name = (bSrc.name || T("home.057")) + T("click.036")
				cp.x = (cp.x || 0) + 1
				cp.y = (cp.y || 0) + 1
				state.baseMarkers.unshift(cp)
				render()
				toast(T("click.037"), "ok")
			}
			return
		}
		var dpc = cl("[data-dupcut]")
		if (dpc) {
			var source = state.effects.find(function (e2) { return e2.id === dpc.dataset.dupcut })
			if (source) {
				state.effects.unshift({
					id: C.newId(),
					name: (source.name || T("settings.001")) + T("click.036"),
					imageUrl: source.imageUrl || null,
				})
			}
			render()
			toast(T("click.037"), "ok")
			return
		}
		var dpt = cl("[data-dupt2]")
		if (dpt) {
			var tSrc = tachieById(dpt.dataset.dupt2)
			if (tSrc) {
				var tcp = JSON.parse(JSON.stringify(tSrc))
				tcp.id = C.newId()
				tcp.name = (tSrc.name || roleName("立ち絵")) + T("click.036")
				tcp.solo = true
				state.tachie.unshift(fitTachie(tcp))
				syncTachie()
				render()
				toast(T("click.037"), "ok")
			}
			return
		}
		var dpe = cl("[data-dupem]")
		if (dpe) {
			var sEm2 = sceneById(dpe.dataset.sceneId)
			var mEm2 = emById(sEm2, dpe.dataset.dupem)
			if (sEm2 && mEm2) {
				var ecp = JSON.parse(JSON.stringify(mEm2))
				ecp.id = C.newId()
				ecp.name = (mEm2.name || roleName("演出")) + T("click.036")
				if (!sEm2.extraMarkers) sEm2.extraMarkers = []
				sEm2.extraMarkers.unshift(ecp)
				render()
				toast(T("click.037"), "ok")
			}
			return
		}
		// シーンのクリックで選択（一覧は Shift / Ctrl（⌘）/ まとめ選択モードで複数選択）
		var card = cl("[data-sceneclick]")
		if (card) {
			var sid = card.dataset.sceneclick
			var inList = !!card.dataset.sdrag
			if (inList) {
				var arr = selIds()
				if (e.shiftKey) {
					var a = state.scenes.findIndex(function (s) {
						return s.id === (ui.sceneId || sid)
					})
					var b2 = state.scenes.findIndex(function (s) {
						return s.id === sid
					})
					var lo = Math.min(a, b2),
						hi = Math.max(a, b2)
					ui.sceneSel = state.scenes.slice(lo, hi + 1).map(function (s) {
						return s.id
					})
					ui.sceneId = sid
					render()
					return
				}
				if (e.metaKey || e.ctrlKey || ui.multiPick) {
					var at3 = arr.indexOf(sid)
					if (at3 >= 0) arr.splice(at3, 1)
					else arr.push(sid)
					ui.sceneId = sid
					render()
					return
				}
				ui.sceneSel = []
			}
			if (ui.sceneId !== sid) {
				ui.sceneId = sid
				if (inList && ui.tab === "scenes") selectSceneSoft()
				else render()
				return
			}
			if (inList) {
				if (ui.tab === "scenes") selectSceneSoft()
				else render()
				return
			}
		}
		if (d.addem) {
			var sAdd = sceneById(d.addem)
			if (sAdd) {
				if (!sAdd.extraMarkers) sAdd.extraMarkers = []
				var m2 = {
					id: C.newId(),
					kind: "other",
					name: roleName("演出"),
					imageUrl: null,
					text: "",
					x: 0,
					y: 0,
					width: 6,
					height: 6,
					z: roomZ().effect,
				}
				if (d.preset === "full") {
					m2.name = T("board.062")
					m2.kind = "full"
					m2.x = 0
					m2.y = 0
					m2.width = state.room.fieldWidth + 1
					m2.height = state.room.fieldHeight + 1
					m2.z = roomZ().effect
				}
				sAdd.extraMarkers.push(m2)
				ui.sceneId = sAdd.id
				render()
			}
			return
		}
		if (d.delem) {
			var sDel = sceneById(d.sceneId)
			if (sDel && sDel.extraMarkers) {
				sDel.extraMarkers = sDel.extraMarkers.filter(function (m) {
					return m.id !== d.delem
				})
				render()
			}
			return
		}
		// 立ち絵ライブラリ
		if (t.id === "addTachieLib") return addTachieLib({})
		if (t.id === "tachieFromImages") return tachieFromImages()
		if (d.duptc) {
			var tcS = tachieById(d.duptc)
			if (tcS) {
				var cp = JSON.parse(JSON.stringify(tcS))
				cp.id = C.newId()
				cp.name = (tcS.name || roleName("立ち絵")) + T("click.038")
				cp.baseId = tcS.baseId || tcS.id
				cp.solo = false
				state.tachie.push(fitTachie(cp))
				render()
				toast(T("click.039"), "ok")
			}
			return
		}
		if (d.deltc) {
			state.tachie = state.tachie.filter(function (tc) {
				return tc.id !== d.deltc
			})
			state.scenes.forEach(function (s) {
				s.extraMarkers = (s.extraMarkers || []).filter(function (m) {
					return m.refId !== d.deltc
				})
			})
			render()
			return
		}
		if (d.tclayout) {
			var sL = sceneById(d.tclayout)
			if (sL) {
				layoutTachie(sL)
				render()
			}
			return
		}
		if (d.tcleft || d.tcright) {
			var sM = sceneById(d.sceneId)
			var mM = sM ? emById(sM, d.tcleft || d.tcright) : null
			if (mM) {
				var tachies=sceneTachieMarkers(sM).slice().sort(function(a,b){return (Number(a.x)||0)-(Number(b.x)||0)}),at=tachies.indexOf(mM),other=tachies[at+(d.tcleft?-1:1)]
				if(other){var mx=mM.x;mM.x=other.x;other.x=mx}
				render()
			}
			return
		}
		// シーンからカットインを作ってそのまま入れる
		if (d.addcutscene) {
			var sCut2 = sceneById(d.addcutscene)
			if (sCut2) {
				var ef2 = {
					id: C.newId(),
					name: T("click.040", (state.effects.length + 1)),
					imageUrl: null,
				}
				state.effects.push(ef2)
				if (!sCut2.cutins) sCut2.cutins = []
				sCut2.cutins = [ef2.id]
				ui.sceneId = sCut2.id
				ui.tab = "scenes"
				render()
				var fi = document.querySelector(
					'[data-cut="name"][data-id="' + ef2.id + '"]',
				)
				if (fi) {
					fi.focus()
					fi.select()
				}
				toast(T("click.041"), "ok")
			}
			return
		}
		if (t.id === "selUp") return moveSel(-1)
		if (t.id === "selDown") return moveSel(1)
		if (t.id === "selTop") return moveSelTo(0)
		if (t.id === "selBottom") return moveSelTo(state.scenes.length)
		if (t.id === "selClear") {
			ui.sceneSel = []
			render()
			return
		}
		if (t.id === "addCut") return addCut({})
		if (t.id === "cutsFromImages") return cutsFromImages()
		if (d.delcut) {
			state.effects = state.effects.filter(function (ef) {
				return ef.id !== d.delcut
			})
			ui.cutinSel = (ui.cutinSel || []).filter(function (id) { return id !== d.delcut })
			render()
			return
		}
		if (t.id === "addChar") {
			state.characters.push({ id: uid(), name: "NPC", commands: "", memo: "", mp: null, maxMp: null })
			render()
			return
		}
		if (d.addnpc) {
			state.characters.push({
				id: uid(),
				name: d.addnpc === "enemy" ? T("home.085") : T("home.086"),
				commands: "",
				memo: "",
				kind: d.addnpc,
				armor: null,
				dodge: null,
				mp: null,
				maxMp: null,
				noDodge: false,
				skills: [{ name: "", value: null, damage: "" }],
			})
			render()
			return
		}
		if (d.addskill) {
			var cSk = state.characters.filter(function (c) {
				return c.id === d.addskill
			})[0]
			if (cSk) {
				if (!cSk.skills) cSk.skills = []
				cSk.skills.push({ name: "", value: null, damage: "" })
				render()
			}
			return
		}
		if (d.delskill) {
			var cDs = state.characters.filter(function (c) {
				return c.id === d.delskill
			})[0]
			if (cDs && cDs.skills) {
				cDs.skills = cDs.skills.filter(function (sk, si) {
					return String(si) !== String(d.si)
				})
				render()
			}
			return
		}
		if (t.id === "kpPcAdd") {
			kpBag().pcs.push("")
			render()
			return
		}
		if (d.kppcdel !== undefined) {
			kpBag().pcs.splice(Number(d.kppcdel), 1)
			render()
			return
		}
		if (t.id === "kpGen") {
			kpBuild()
			return
		}
		if (d.delchar) {
			state.characters = state.characters.filter(function (c) {
				return c.id !== d.delchar
			})
			render()
			return
		}
		if (t.id === "addVar") {
			state.room.variables.push({ label: "", value: "" })
			render()
			return
		}
		if (d.delvar) {
			state.room.variables.splice(Number(d.delvar), 1)
			render()
			return
		}
		if (t.id === "saveProj") return saveProject()
		if (t.id === "newRoom") return startNewRoom()
	})

	/* ---------------- 入力・変更 ---------------- */
		document.addEventListener("input", function (e) {
		var t = e.target
		if (t.dataset && t.dataset.rq) return
		if (["tBottom","tHeight","tPosition"].indexOf(t.id)>=0) return
		if (t.id === "pfilter") return renderPickerGrid(t.value)
		if (t.id === "mfilter") {
			ui.mediaFilter = t.value
			var box = $("#rbody")
			var pos = t.selectionStart
			renderRight()
			var nf = $("#mfilter")
			if (nf) {
				nf.focus()
				nf.setSelectionRange(pos, pos)
			}
			return
		}
		// focusin を取りこぼしても、値を書き換える最初のinputでだけ
		// 編集前snapshotを確保する。focusout後のchangeでは作り直さない。
		if (ui.imageMaker && ui.modal === "imageMaker" && imageMakerHistoryInputTarget(t) && !ui.imageMaker.historyInput) ui.imageMaker.historyInput = imageMakerSnapshot(ui.imageMaker)
		applyInput(t)
		if(t.dataset&&(t.dataset.scene==="text"||t.dataset.cut==="name")){var textPv=$("#sceneTextPreview"),textSc=currentScene();if(textPv&&textSc)textPv.textContent=sceneText(textSc)||T("imgbtn.001")}
		if (t.id === "projName") $("#projTitle").textContent = state.project
		if ((t.dataset && (t.dataset.scene === "name" || t.dataset.part === "name")) || t.dataset.imglabel)
			renderRight()
		if (t.dataset && (t.dataset.part || t.dataset.em || t.dataset.ov)) renderRight()
		if (t.dataset && t.dataset.em) updateEmMatchLabels()
		if (t.dataset && t.dataset.cut) renderRight()
		// 立ち絵の大きさはスライダーを動かしながら見せる
		if (t.dataset && t.dataset.tc) {
			var tcL = tachieById(t.dataset.id)
			var lab = $("#tcw-" + t.dataset.id)
			if (tcL && lab)
				lab.innerHTML =
					T("tachie2.021") + " <b>" +
					tcL.widthM +
					"×" +
					tcL.heightM +
					"</b> " + T("inputB.001") + " " +
					tachieY(tcL)
			renderRight()
		}
		if (t.id === "tBottom" || t.id === "tHeight" || t.id === "tZ") renderRight()
		if (ui.tab === "room" && (["fw","fh","grid","roomBg","roomFg","tBottom","tHeight","tZ","tAlign","roomDefPart","roomDefPanelW","roomDefTachieH","roomZPart","roomZPanel","roomZTachie","roomZEffect"].indexOf(t.id) >= 0 || (t.dataset && (t.dataset.part || t.dataset.em || t.dataset.ov)))) {
			refreshRoomStudioPreview()
			var rb = document.querySelector(".room-canvas-bar span")
			if (rb) rb.textContent = state.room.fieldWidth + T("inputB.002", state.room.fieldHeight)
		}
	})
	// 一覧をドラッグして並べ替え
	var dragSceneId = null
	document.addEventListener("dragstart", function (e) {
		var it = e.target.closest ? e.target.closest("[data-sdrag]") : null
		if (!it) return
		dragSceneId = it.dataset.sdrag
		if (selIds().indexOf(dragSceneId) < 0) ui.sceneSel = [dragSceneId]
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move"
			try {
				e.dataTransfer.setData("text/plain", dragSceneId)
			} catch (err) {}
		}
	})
	document.addEventListener("dragover", function (e) {
		if (!dragSceneId) return
		var it = e.target.closest ? e.target.closest("[data-sdrag]") : null
		if (!it) return
		e.preventDefault()
		it.classList.add("dragover")
	})
	document.addEventListener("dragleave", function (e) {
		var it = e.target.closest ? e.target.closest("[data-sdrag]") : null
		if (it) it.classList.remove("dragover")
	})
	document.addEventListener("drop", function (e) {
		if (!dragSceneId) return
		var it = e.target.closest ? e.target.closest("[data-sdrag]") : null
		if (!it) return
		e.preventDefault()
		var targetId = it.dataset.sdrag
		dragSceneId = null
		moveSelBefore(targetId)
	})
	document.addEventListener("dragend", function () {
		dragSceneId = null
		dragImgName = null
		mdropClear()
	})
	// 演出プリセットと区切りを同じ一覧で並べ替えます
	var dragEmLayoutId = null
	var dragEmInsertIndex = null
	function clearEmDropGuide() {
		dragEmInsertIndex = null
		all("[data-empdrag].dragover").forEach(function (x) { x.classList.remove("dragover") })
		all("[data-em-drop-line]").forEach(function (x) { x.hidden = true })
	}
	function showEmDropGuide(row, after) {
		var list = row && row.parentNode
		if (!list || !list.classList.contains("em-preset-list")) return
		var sourceIndex = (settingsBag().emPresetLayout || []).findIndex(function (x) { return x.id === dragEmLayoutId })
		var targetIndex = (settingsBag().emPresetLayout || []).findIndex(function (x) { return x.id === row.dataset.empdrag })
		if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
			clearEmDropGuide()
			return
		}
		dragEmInsertIndex = targetIndex + (after ? 1 : 0)
		var line = list.querySelector("[data-em-drop-line]")
		if (!line) return
		line.hidden = false
		if (after) {
			if (row.nextSibling) list.insertBefore(line, row.nextSibling)
			else list.appendChild(line)
		} else list.insertBefore(line, row)
	}
	document.addEventListener("dragstart", function (e) {
		var it = e.target && e.target.closest ? e.target.closest("[data-empdrag]") : null
		if (!it) return
		dragEmLayoutId = it.dataset.empdrag
		clearEmDropGuide()
		it.classList.add("dragging")
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move"
			try { e.dataTransfer.setData("text/plain", dragEmLayoutId) } catch (err) {}
		}
	})
	document.addEventListener("dragover", function (e) {
		if (!dragEmLayoutId) return
		var it = e.target && e.target.closest ? e.target.closest("[data-empdrag]") : null
		if (!it) return
		e.preventDefault()
		var box = it.getBoundingClientRect()
		showEmDropGuide(it, e.clientY >= box.top + box.height / 2)
	})
	document.addEventListener("dragleave", function (e) {
		var it = e.target && e.target.closest ? e.target.closest("[data-empdrag]") : null
		if (it && !it.contains(e.relatedTarget)) it.classList.remove("dragover")
	})
	document.addEventListener("drop", function (e) {
		if (!dragEmLayoutId) return
		var targetIndex = dragEmInsertIndex
		if (targetIndex == null) {
			var it = e.target && e.target.closest ? e.target.closest("[data-empdrag]") : null
			if (it) {
				var box = it.getBoundingClientRect()
				var layout = settingsBag().emPresetLayout || [], at = layout.findIndex(function (x) { return x.id === it.dataset.empdrag })
				targetIndex = at + (e.clientY >= box.top + box.height / 2 ? 1 : 0)
			}
		}
		if (targetIndex == null) return
		e.preventDefault()
		var sourceId = dragEmLayoutId
		dragEmLayoutId = null
		clearEmDropGuide()
		all("[data-empdrag].dragging").forEach(function (x) { x.classList.remove("dragging") })
		emPresetMoveToIndex(sourceId, targetIndex)
	})
	document.addEventListener("dragend", function () {
		dragEmLayoutId = null
		clearEmDropGuide()
		all("[data-empdrag].dragging").forEach(function (x) { x.classList.remove("dragging") })
	})
	// カットインテンプレートと区切りを専用レイアウトで並べ替えます
	var dragCutinLayoutId = null
	var dragCutinInsertIndex = null
	function clearCutinDropGuide() {
		dragCutinInsertIndex = null
		all("[data-citpldrag].dragover").forEach(function (x) { x.classList.remove("dragover") })
		all("[data-citpl-drop-line]").forEach(function (x) { x.hidden = true })
	}
	function showCutinDropGuide(row, after) {
		var list = row && row.parentNode
		if (!list || !list.classList.contains("cutin-template-list")) return
		var layout = settingsBag().cutinTemplateLayout || [], sourceIndex = layout.findIndex(function (entry) { return entry.id === dragCutinLayoutId }), targetIndex = layout.findIndex(function (entry) { return entry.id === row.dataset.citpldrag })
		if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) { clearCutinDropGuide(); return }
		dragCutinInsertIndex = targetIndex + (after ? 1 : 0)
		var line = list.querySelector("[data-citpl-drop-line]")
		if (!line) return
		line.hidden = false
		if (after) { if (row.nextSibling) list.insertBefore(line, row.nextSibling); else list.appendChild(line) } else list.insertBefore(line, row)
	}
	document.addEventListener("dragstart", function (e) {
		var it = e.target && e.target.closest ? e.target.closest("[data-citpldrag]") : null
		if (!it) return
		dragCutinLayoutId = it.dataset.citpldrag
		clearCutinDropGuide()
		it.classList.add("dragging")
		if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragCutinLayoutId) } catch (err) {} }
	})
	document.addEventListener("dragover", function (e) {
		if (!dragCutinLayoutId) return
		var it = e.target && e.target.closest ? e.target.closest("[data-citpldrag]") : null
		if (!it) return
		e.preventDefault()
		var box = it.getBoundingClientRect()
		showCutinDropGuide(it, e.clientY >= box.top + box.height / 2)
	})
	document.addEventListener("dragleave", function (e) {
		var it = e.target && e.target.closest ? e.target.closest("[data-citpldrag]") : null
		if (it && !it.contains(e.relatedTarget)) it.classList.remove("dragover")
	})
	document.addEventListener("drop", function (e) {
		if (!dragCutinLayoutId) return
		var targetIndex = dragCutinInsertIndex
		if (targetIndex == null) {
			var it = e.target && e.target.closest ? e.target.closest("[data-citpldrag]") : null
			if (it) { var box = it.getBoundingClientRect(), layout = settingsBag().cutinTemplateLayout || [], at = layout.findIndex(function (entry) { return entry.id === it.dataset.citpldrag }); targetIndex = at + (e.clientY >= box.top + box.height / 2 ? 1 : 0) }
		}
		if (targetIndex == null) return
		e.preventDefault()
		var sourceId = dragCutinLayoutId
		dragCutinLayoutId = null
		clearCutinDropGuide()
		all("[data-citpldrag].dragging").forEach(function (x) { x.classList.remove("dragging") })
		cutinTemplateMoveToIndex(sourceId, targetIndex)
	})
	document.addEventListener("dragend", function () {
		dragCutinLayoutId = null
		clearCutinDropGuide()
		all("[data-citpldrag].dragging").forEach(function (x) { x.classList.remove("dragging") })
	})
	// 右パネルのメディアから、画像の選ぶ欄や各ページへドラッグ＆ドロップ
	var dragImgName = null
	function mdropTarget(e) {
		if (!e.target || !e.target.closest) return null
		return e.target.closest(".imgpick") || e.target.closest("[data-mdrop]")
	}
	function mdropClear() {
		all(".mdragging").forEach(function (x) {
			x.classList.remove("mdragging")
		})
		all(".dropok").forEach(function (x) {
			x.classList.remove("dropok")
		})
		all(".mdropzone.over").forEach(function (x) {
			x.classList.remove("over")
		})
	}
	document.addEventListener("dragstart", function (e) {
		var t = e.target && e.target.closest ? e.target.closest("[data-mdrag]") : null
		if (!t) return
		dragImgName = t.dataset.mdrag
		t.classList.add("mdragging")
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "copy"
			try {
				e.dataTransfer.setData("text/plain", dragImgName)
			} catch (err) {}
		}
	})
	document.addEventListener("dragover", function (e) {
		if (!dragImgName) return
		var t = mdropTarget(e)
		if (!t) return
		e.preventDefault()
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"
		t.classList.add(t.classList.contains("imgpick") ? "dropok" : "over")
	})
	document.addEventListener("dragleave", function (e) {
		var t = mdropTarget(e)
		if (!t) return
		t.classList.remove("dropok")
		t.classList.remove("over")
	})
	document.addEventListener("drop", function (e) {
		if (!dragImgName) return
		var t = mdropTarget(e)
		if (!t) return
		e.preventDefault()
		e.stopPropagation()
		var nm = dragImgName
		dragImgName = null
		mdropClear()
		if (t.classList.contains("imgpick")) {
			applyInput({ id: t.id, dataset: t.dataset, value: nm, checked: false })
			render()
			toast(T("inputB.003"), "ok")
			return
		}
		mdropMake(t.dataset.mdrop, nm)
	})

	document.addEventListener("change", function (e) {
		var t = e.target
		var d = t.dataset || {}
		if (d.empfield) { emPresetSetField(d.empId, d.empfield, t.value, t.checked); return }
		if (d.empsepfield) { emPresetSetSeparator(d.empsepId, t.value); return }
		if (d.citplfield) { cutinTemplateSetField(d.citplId, d.citplfield, t.value); return }
		if (d.citplsepfield) { cutinTemplateSetSeparator(d.citplsepId, t.value); return }
		if (d.rq) return
		if (d.ssel) return applyInput(t)
		if (d.em === "fullFit") {
			applyInput(t)
			render()
			return
		}
		if (d.em === "mode") {
			var mMode = emById(sceneById(d.sceneId), d.emId)
			if (mMode) {
				mMode.kind = t.value === "full" ? "full" : "other"
				if (mMode.kind === "full") applyEmMode(mMode)
				else if (mMode.width == null) {
					mMode.width = 12
					mMode.height = 12
				}
				render()
			}
			return
		}
		if (d.scene === "backgroundMode") {
			applyInput(t)
			render()
			return
		}
		if (t.id === "psel") {
			ui.sceneId = t.value || null
			render()
			return
		}
		if (d.tdone) {
			state.tasks.forEach(function (x) {
				if (x.id === d.tdone) x.done = t.checked
			})
			renderBottom()
			saveLocal()
			return
		}
		// 画像メーカーの文字欄は input イベントで逐次反映し、
		// focusout で保留中の編集を確定する。Undo後にDOMから遅れて届く
		// change は古い値を持つことがあるため、再適用せず、接続中の欄だけ
		// stateの文字列へ戻す。detachedな古い要素は触らない。
		if (ui.modal === "imageMaker" && ui.imageMaker && d.imfield === "text") {
			var currentTextLayer = imageMakerSelected()
			if (currentTextLayer && currentTextLayer.type === "text" && document.documentElement.contains(t)) t.value = currentTextLayer.text || ""
			return
		}
		applyInput(t)
		if (t.id === "pick") {
			addFiles(t.files)
			t.value = ""
			return
		}
		if (t.id === "pupload") {
			uploadInto(t.files)
			t.value = ""
			return
		}
		if (t.id === "bulkFile" && t.files[0]) {
			readBulkFile(t.files[0])
			t.value = ""
			return
		}
		if (t.id === "loadProj" && t.files[0]) {
			loadProject(t.files[0])
			t.value = ""
			return
		}
		if (
			d.part === "imageUrl" ||
			d.part === "width" ||
			d.part === "height" ||
			d.part === "lockAspect" ||
			d.part === "lockMove" ||
			d.part === "visible" ||
			d.part === "scope" ||
			d.em === "imageUrl" ||
			d.em === "width" ||
			d.em === "height" ||
			d.em === "lockAspect" ||
			d.imgrole ||
			d.tc ||
			t.id === "tAlign" ||
			t.id === "fw" ||
			t.id === "fh"
		)
			render()
	})
	document.addEventListener("focusin", function (e) {
		if (!imageMakerHistoryInputTarget(e.target)) return
		var model = ui.imageMaker
		if (model && !model.historyInput) model.historyInput = imageMakerSnapshot(model)
	})
	document.addEventListener("focusout", function (e) {
		if (imageMakerHistoryInputTarget(e.target)) imageMakerCommitPendingInput(ui.imageMaker)
	})
	document.addEventListener("change", function (e) {
		if (e.target && e.target.id === "imageMakerBackground") imageMakerCommitPendingInput(ui.imageMaker)
	})

	/* ---------------- キー操作 ---------------- */
	document.addEventListener("keydown", function (e) {
		var mod = e.metaKey || e.ctrlKey
		if (ui.modal === "imageMaker" && ui.imageMaker && mod && !e.isComposing) {
			var imageMakerKey = String(e.key || "").toLowerCase()
			if (imageMakerKey === "z" || imageMakerKey === "y") {
				e.preventDefault(); e.stopPropagation()
				if (imageMakerKey === "y" || e.shiftKey) imageMakerRedo(); else imageMakerUndo()
				return
			}
		}
		var tg = e.target || {}
		var typing = !!(tg.closest && tg.closest('input,textarea,select,[contenteditable="true"]'))
		if(!typing&&ui.tab==="room"&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].indexOf(e.key)>=0){
			var moving=roomSelected().filter(function(part){return !part.lockMove});if(moving.length){e.preventDefault();historyWatch();var dx=e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:0,dy=e.key==="ArrowUp"?-1:e.key==="ArrowDown"?1:0;moving.forEach(function(part){part.x=snapHalf(part.x+dx);part.y=snapHalf(part.y+dy)});saveLocal();render()}return
		}
		if(keyRecording){e.preventDefault();e.stopPropagation();var code=keyFromEvent(e);if(!code)return;var keys=keyBag(),other=keyConflict(keys,keyRecording,code);if(other){toast(T("key.001", keyActionName(other)),"warn");return}keys[keyRecording]=code;saveKeyBag(keys);keyRecording=null;render();toast(T("key.002"),"ok");return}
		var keys=keyBag(),acts=Object.keys(keys)
		for(var ai=0;ai<acts.length;ai++){var act=acts[ai];if(shortcutHit(e,keys[act])&&(!typing||act==="save"||act==="saveAs")){e.preventDefault();runShortcut(act);return}}
		if (e.key !== "Enter" || e.isComposing !== false) return
		if (e.target.id === "quickScene") {
			var v = e.target.value.trim()
			if (!v) return
			var s = newScene(v, ui.newFg || null)
			state.scenes.push(s)
			ui.sceneId = s.id
			render()
			var q = $("#quickScene")
			if (q) {
				q.value = ""
				q.focus()
			}
			return
		}
		if (e.target.id === "newtask") {
			var tv = e.target.value.trim()
			if (!tv) return
			state.tasks.push({ id: uid(), text: tv, done: false })
			e.target.value = ""
			renderBottom()
			saveLocal()
		}
	})

	/* ---------------- ドロップ ---------------- */
	;["dragover", "drop"].forEach(function (ev) {
		document.addEventListener(ev, function (e) {
			e.preventDefault()
			var dz = $("#drop")
			if (dz) dz.classList.toggle("over", ev === "dragover")
			if (ev === "drop" && e.dataTransfer && e.dataTransfer.files.length) {
				var direct=e.target&&e.target.closest?e.target.closest("[data-mdrop]"):null
				if(direct){var keepTab=ui.tab,kind=direct.dataset.mdrop;addFiles(e.dataTransfer.files).then(function(names){ui.tab=keepTab;(names||[]).forEach(function(nm){mdropMake(kind,nm)});render()});return}
				if (pickTarget) {
					// 画像選択パネルを開いている途中のドロップは、そのまま選択に使う
					uploadInto(e.dataTransfer.files)
				} else {
					ui.tab = "images"
					addFiles(e.dataTransfer.files)
				}
			}
		})
	})

	// v4.11 追加操作
	document.addEventListener("toggle", function(e){var t=e.target;if(!t||!t.matches)return;if(t.matches("details.story-templates"))ui.storyTemplatesOpen=t.open;if(t.matches("details.cutin-template-details"))ui.cutinTemplatesOpen=t.open}, true)
	document.addEventListener("input", function(e){
		var t=e.target,d=t.dataset||{}
		if(t.id==="storyTitle"||t.id==="storyText"||t.id==="storyDelimiter"){if(!ui.storyDraft)ui.storyDraft={};ui.storyDraft[t.id==="storyTitle"?"title":t.id==="storyText"?"text":"delimiter"]=t.value;if(t.id==="storyDelimiter")refreshStoryBulkPreview()}
		if(t.id==="storyBulkText"){ui.storyBulk=t.value;refreshStoryBulkPreview()}
		if(d.storyitem){var pending=storyEditDraft[d.storyid]||{};pending[d.storyitem]=t.value;storyEditDraft[d.storyid]=pending}
		if(d.kpskill){var sk=kpBag().skills[Number(d.ksi)];if(sk)sk[d.kpskill]=d.kpskill==="value"?Number(t.value):t.value}
		if(d.charface){var c=state.characters.find(function(q){return q.id===d.cid}),f=c&&c.faces&&c.faces[Number(d.fi)];if(f)f[d.charface]=t.value}
	})
	document.addEventListener("change", function(e){
		var t=e.target,d=t.dataset||{}
		if(t.id==="storySplit"){if(!ui.storyDraft)ui.storyDraft={};ui.storyDraft.split=t.checked;refreshStoryBulkPreview()}
		if(d.storyitem){var x=(state.storyTexts||[]).find(function(q){return q.id===d.storyid}),old=x&&x[d.storyitem];if(x&&old!==t.value){x[d.storyitem]=t.value;historyWatch()}if(storyEditDraft[d.storyid]){delete storyEditDraft[d.storyid][d.storyitem];if(!Object.keys(storyEditDraft[d.storyid]).length)delete storyEditDraft[d.storyid]}}
		if(d.tcface){var sc=sceneById(d.sceneId),m=sc&&emById(sc,d.tcface),tc=tachieById(t.value);if(m&&tc){var x=m.x;m.refId=tc.id;m.name=tcMarkLabel(m);m.imageUrl=tc.imageUrl;fitTachie(tc);m.width=tc.widthM;m.height=tc.heightM;m.y=tachieY(tc);m.z=tc.z!=null?tc.z:state.room.tachieZ;m.text="";m.x=x;render()}}
		if(d.charface){var c=state.characters.find(function(q){return q.id===d.cid}),f=c&&c.faces&&c.faces[Number(d.fi)];if(f)f[d.charface]=t.value}
	})
	document.addEventListener("click", function(e){
		var t=e.target,d=t.dataset||{}
		if(t.id==="cutinSelectMode"||d.cutinselectmode!==undefined){ui.cutinSelectMode=d.cutinselectmode!=="0";if(!ui.cutinSelectMode)ui.cutinSel=[];render();return}
		var cutinCard=t.closest?t.closest("[data-cutin-select-card]"):null
		if(cutinCard&&!t.closest("input,textarea,select,button,label,.imgpick")){var cid=cutinCard.getAttribute("data-cutin-card"),at=(ui.cutinSel||[]).indexOf(cid);if(at>=0)ui.cutinSel.splice(at,1);else ui.cutinSel.push(cid);ui.cutinSelectMode=ui.cutinSel.length>0;render();return}
		if(d.storymode){ui.storyMode=d.storymode;render();return}
		if(t.id==="storySelUp"){moveStorySel(-1);return}
		if(t.id==="storySelDown"){moveStorySel(1);return}
		if(t.id==="storySelTop"){moveStorySelTo(false);return}
		if(t.id==="storySelBottom"){moveStorySelTo(true);return}
		if(t.id==="storySelClear"){ui.storySel=[];ui.storyFocusId=null;render();return}
		if(t.id==="storyInsertDelimiter"){var ta=$("#storyText"),de=$("#storyDelimiter"),v=de?de.value:"---";if(!ta||!v)return;var a=ta.selectionStart,b=ta.selectionEnd,ins=(a&&ta.value[a-1]!=="\\n"?"\\n":"")+v+"\\n";ta.value=ta.value.slice(0,a)+ins+ta.value.slice(b);ui.storyDraft.text=ta.value;ta.focus();ta.selectionStart=ta.selectionEnd=a+ins.length}
		if(t.id==="storyBulkInsertDelimiter"){var ta=$("#storyBulkText"),de=$("#storyDelimiter"),v=de?de.value:"---";if(ta&&v){var a=ta.selectionStart,ins=(a&&ta.value[a-1]!=="\n"?"\n":"")+v+(ta.value[a]!=="\n"?"\n":"");insertStoryBulkText(ins)}}
		if(t.id==="storyBulkInsertTitle")insertStoryBulkText("# ")
		if(t.id==="storyTplSave"){var st=ui.storyDraft||{},nm=(st.title||"").trim()||T("drop.001");settingsBag().storyTemplates.push({id:uid(),name:nm,title:st.title||"",text:st.text||"",delimiter:st.delimiter||"---",split:st.split!==false});render()}
		if(d.storytplapply){var tp=settingsBag().storyTemplates.find(function(x){return x.id===d.storytplapply});if(tp){storyAddItem(tp.title,tp.text);render();toast(T("drop.002"),'ok');return}}
		if(d.storytpldel){settingsBag().storyTemplates=settingsBag().storyTemplates.filter(function(x){return x.id!==d.storytpldel});render()}
		if(d.storydel){state.storyTexts=state.storyTexts.filter(function(x){return x.id!==d.storydel});ui.storySel=(ui.storySel||[]).filter(function(id){return id!==d.storydel});historyWatch();render();return}
		var storyRow=t.closest?t.closest('[data-storyselect]'):null
		if(storyRow&&!t.closest('input,textarea,button')){var sid=storyRow.dataset.storyselect,sel=storySelIds();if(e.shiftKey){var anchor=ui.storyFocusId||sid,aidx=state.storyTexts.findIndex(function(x){return x.id===anchor}),bidx=state.storyTexts.findIndex(function(x){return x.id===sid}),lo=Math.min(aidx,bidx),hi=Math.max(aidx,bidx);ui.storySel=state.storyTexts.slice(lo,hi+1).map(function(x){return x.id})}else if(e.metaKey||e.ctrlKey){var at=sel.indexOf(sid);if(at>=0)sel.splice(at,1);else sel.push(sid);ui.storyFocusId=sid}else{ui.storySel=[sid];ui.storyFocusId=sid}render();return}
		if(t.id==="kpTplSharedSave") return kpSharedTemplateSave()
		if(t.id==="kpTplSharedLoad"){var sharedSelect=$("[data-kptplshared]");return sharedSelect&&sharedSelect.value?kpSharedTemplateApply(sharedSelect.value):toast(T("drop.003"),"warn")}
		if(t.id==="kpTplSharedDelete"){var sharedDelete=$("[data-kptplshared]");return sharedDelete&&sharedDelete.value?kpSharedTemplateDelete(sharedDelete.value):toast(T("drop.004"),"warn")}
		if(t.id==="kpSkillAdd"){kpBag().skills.push({name:"",value:null});render()}
		if(d.kpskilldel!==undefined){kpBag().skills.splice(Number(d.kpskilldel),1);render()}
		if(d.addface){var c=state.characters.find(function(x){return x.id===d.addface});if(c){if(!c.faces)c.faces=[];c.faces.push({name:T("drop.005", (c.faces.length+1)),imageUrl:null});render()}}
		if(d.delface){var c=state.characters.find(function(x){return x.id===d.delface});if(c&&c.faces){c.faces.splice(Number(d.fi),1);render()}}
		if(d.chartplapply){var tp=settingsBag().charTemplates.find(function(x){return x.id===d.chartplapply});if(tp){var c=JSON.parse(JSON.stringify(tp.data));c.id=uid();c.name=(c.name||T("render.025"))+T("click.036");state.characters.push(c);render()}}
		if(d.chartpldel){settingsBag().charTemplates=settingsBag().charTemplates.filter(function(x){return x.id!==d.chartpldel});render()}
	})

	/* ---------------- 右パネルの幅つまみ ---------------- */
	$("#rgrip").addEventListener("pointerdown", function (e) {
		e.preventDefault()
		var grip = e.currentTarget
		grip.setPointerCapture(e.pointerId)
		var sx = e.clientX,
			w0 = ui.rightWidth
		function move(ev) {
			ui.rightWidth = Math.max(260, Math.min(Math.min(1100, window.innerWidth - 300), w0 + (sx - ev.clientX)))
			document.documentElement.style.setProperty("--right", ui.rightWidth + "px")
		}
		function up() {
			grip.removeEventListener("pointermove", move)
			grip.removeEventListener("pointerup", up)
			saveLocal()
			if (ui.rightTab === "preview") renderRight()
		}
		grip.addEventListener("pointermove", move)
		grip.addEventListener("pointerup", up)
	})

	/* ---------------- 追加ヘルパ ---------------- */
	function addPart(opt) {
		var pRole = opt.role === "panel" ? "panel" : "part"
		state.baseMarkers.unshift({
			id: C.newId(),
			role: pRole,
			name: opt.name || (pRole === "panel" ? roleName("パネル") : T("home.057")),
			imageUrl: opt.imageUrl || null,
			x: opt.x != null ? opt.x : 0,
			y: opt.y != null ? opt.y : 0,
			width: opt.width || panelDefW(pRole) || roomPartDefault(),
			height: opt.height || panelDefH(pRole) || roomPartDefault(),
			z: opt.z != null ? opt.z : (pRole === "panel" ? roomZ().panel : roomZ().part),
			locked: true,
			lockAspect: true,
			visible: true,
			scope: "room",
		})
		if (opt.imageUrl) fixAspect(state.baseMarkers[0], "width")
		render()
	}
	function newScene(name, foregroundUrl) {
		return {
			id: C.newId(),
			name: name,
			backgroundUrl: null, // 演出で変えたいときだけ
			backgroundMode: "room",
			foregroundUrl: foregroundUrl || null, // シーン画像はこちら
			fieldWidth: state.room.fieldWidth,
			fieldHeight: state.room.fieldHeight,
			fieldObjectFit: "cover", // 新規シーンは前景を自動トリミング
			displayGrid: false,
			text: "",
			overrides: {},
			extraMarkers: [], // このシーンだけの演出
			cutins: [], // 切り替え時に流すカットインのID
		}
	}
	function addTachieLib(opt) {
		var tc = {
			id: C.newId(),
			group: (opt && opt.group) || "",
			name: (opt && opt.name) || roleName("立ち絵"),
			imageUrl: (opt && opt.imageUrl) || null,
			heightM:
				(opt && opt.heightM) ||
				roomTachieDefault() ||
				state.room.tachieHeight ||
				18,
			dy: 0,
		}
		state.tachie.unshift(fitTachie(tc))
		if (!(opt && opt.stayTab)) ui.tab = "tachie"
		render()
		return tc
	}
	function tachieFromImages() {
		openMultiPick("tachie")
	}
	function addCut(opt) {
		state.effects.unshift({
			id: C.newId(),
			name: (opt && opt.name) || T("settings.001"),
			imageUrl: (opt && opt.imageUrl) || null,
		})
		if (!(opt && opt.stayTab)) ui.tab = "cutins"
		render()
	}
	function cutsFromImages() {
		openMultiPick("cutins")
	}
	var SYMS = ["└", "▶", "🔴", "◇", "—"]
	var KPDEF = {
		coc6: {
			main: ":ラウンド+1\n:ラウンド=0\n____________汎用ダイス系___________\n1d100\n1d3\nchoice 表 裏\nRESB(13-12)\nCBRB(50,60)\n____________その他________________\nsCCB<= 【探索者の心理学】",
			scene: "__________シーン・カットイン______\n/scene ◇最初\n/scene ◇幕間\n/scene ◇暗転\n/scene ◇明転\n@カットイン（効果音・武器系とか）",
			memo: "____________メモ___________\n▷ファンブル処理に困ったら\nchoice[技能値-15,自動失敗,探索不可,HP-1,SAN-1]\n▷クリティカル処理に困ったら\nchoice[技能値+15,自動成功,クリチケ]",
			skillLabel: "chars.011",
			dodgeLabel: "helper.001",
		},
		coc7: {
			main: ":ラウンド+1\n:ラウンド=0\n____________汎用ダイス系___________\n1d100\n1d3\nchoice 表 裏\nRESB(13-12)\nCBRB(50,60)\n____________その他________________\nsCCB<= 【探索者の心理学】",
			scene: "__________シーン・カットイン______\n/scene ◇最初\n/scene ◇幕間\n/scene ◇暗転\n/scene ◇明転\n@カットイン（効果音・武器系とか）",
			memo: "____________メモ___________\n▷ファンブル処理に困ったら\nchoice[自動失敗,状況悪化]\n▷クリティカル処理に困ったら\nchoice[自動成功,技能値上昇]",
			skillLabel: "chars.011",
			dodgeLabel: "helper.001",
		},
		emoklore: {
			main: ":ラウンド+1\n:ラウンド=0\n____________汎用ダイス____________\n2DL\n3DL\n5DL\n____________進行管理____________",
			scene: "__________シーン・カットイン______\n/scene ◇導入\n/scene ◇調査\n/scene ◇戦闘\n/scene ◇クライマックス\n/scene ◇結末",
			memo: "____________共鳴感情____________\n（ここに共鳴判定用の情報を記載）",
			skillLabel: "helper.002",
			dodgeLabel: "helper.003",
		},
	}
	function newKpSettings() {
		return {
			system: "coc6",
			checkType: "CCB<=",
			pcs: [T("helper.004"), T("helper.005")],
			skills: [],
			tpl: {
				coc6: { main: KPDEF.coc6.main, scene: KPDEF.coc6.scene, memo: KPDEF.coc6.memo },
				coc7: { main: KPDEF.coc7.main, scene: KPDEF.coc7.scene, memo: KPDEF.coc7.memo },
				emoklore: { main: KPDEF.emoklore.main, scene: KPDEF.emoklore.scene, memo: KPDEF.emoklore.memo },
			},
		}
	}
	function kpBag() {
		if (!state.kp) state.kp = newKpSettings()
		if (!state.kp.tpl) state.kp.tpl = newKpSettings().tpl
		if (!state.kp.pcs) state.kp.pcs = [T("helper.004"), T("helper.005")]
		return state.kp
	}
	function kpTemplateValues(kp, system) {
		var t = (kp && kp.tpl && kp.tpl[system]) || KPDEF[system] || {}
		return { main: t.main || "", scene: t.scene || "", memo: t.memo || "" }
	}
	function kpSharedTemplateSave() {
		var kp = kpBag(), values = kpTemplateValues(kp, kp.system), name = window.prompt(T("helper.006"), kp.system + T("helper.007"))
		if (name == null || !String(name).trim()) return null
		name = String(name).trim()
		var list = settingsBag().kpTemplates, beforeList = templateHistoryClone(list), same = list.filter(function (x) { return x.system === kp.system && x.name === name })[0], id = same ? same.id : uid()
		if (same && !window.confirm(T("helper.008", name))) {
			var renamed = window.prompt(T("home.059"), name + T("home.060"))
			if (renamed == null || !String(renamed).trim()) return null
			name = String(renamed).trim()
			if (list.some(function (x) { return x.system === kp.system && x.name === name })) return toast(T("helper.009", name), "warn")
			id = uid(); same = null
		}
		var rec = { id: id, name: name, system: kp.system, values: values, createdAt: same ? same.createdAt : Date.now(), updatedAt: Date.now() }
		if (same) { same.name = rec.name; same.system = rec.system; same.values = rec.values; same.updatedAt = rec.updatedAt }
		else list.push(rec)
		templateSettingsHistoryPush("kpTemplates", beforeList, list); persistAppSettings(); render(); toast(same ? T("helper.010") : T("helper.011"), "ok")
		return id
	}
	function kpSharedTemplateApply(id) {
		var rec = settingsBag().kpTemplates.filter(function (x) { return x.id === id })[0]
		if (!rec) return null
		var values = rec.values || {}
		historyWatch()
		var kp = kpBag()
		if (rec.system && KPDEF[rec.system]) kp.system = rec.system
		if (!kp.tpl) kp.tpl = newKpSettings().tpl
		kp.tpl[rec.system] = { main: values.main || "", scene: values.scene || "", memo: values.memo || "" }
		render(); saveLocal(); toast(T("helper.012"), "ok")
		return rec.id
	}
	function kpSharedTemplateDelete(id) {
		var list = settingsBag().kpTemplates, beforeList = templateHistoryClone(list), at = list.findIndex(function (x) { return x.id === id })
		if (at < 0) return false
		list.splice(at, 1); templateSettingsHistoryPush("kpTemplates", beforeList, list); persistAppSettings(); render(); toast(T("helper.013"), "ok"); return true
	}
	function kpBuild() {
		var kp = kpBag()
		var sys = kp.system
		var isCoc = sys.indexOf("coc") === 0
		var checkType = kp.checkType || "CCB<="
		var tpl = kp.tpl[sys] || KPDEF[sys]
		var enemyCmd = T("helper.014")
		var allyCmd = T("helper.015")
		state.characters.forEach(function (c) {
			if (!c.kind) return
			var name = c.name || T("helper.016")
			var block = "\n" + (c.kind === "enemy" ? T("helper.017") : T("helper.018")) + "：" + name + "\n"
			;(c.skills || []).forEach(function (sk) {
				if (!sk.name && !sk.value) return
				if (isCoc) block += checkType + (sk.value || 0) + " 【" + (sk.name || T("helper.019")) + "】 @" + name + "\n"
				else block += (sk.value || 0) + "DL 【" + (sk.name || T("helper.019")) + "】 @" + name + "\n"
				if (sk.damage) block += sk.damage + T("helper.020", name)
			})
			if (!c.noDodge) {
				var dg = c.dodge || 0
				block += (isCoc ? checkType + dg : dg + "DL") + T("helper.021", name)
			}
			block += ":" + name.replace(/\s+/g, "_") + "_HP-1\n"
			if (c.armor) block += T("helper.022", c.armor)
			if (c.memo) block += "★" + c.memo + "\n"
			if (c.kind === "enemy") enemyCmd += block
			else allyCmd += block
		})
		var pcCmd = T("helper.023")
		;(kp.pcs || []).forEach(function (nm, i) {
			if (!nm) return
			pcCmd += "//HO" + (i + 1) + "=" + nm + "\n/var HO" + (i + 1) + " " + nm + "\n"
		})
		var main = tpl.main || ""
		if (isCoc) main = main.replace(/s(CCB|CC)<=/g, "s" + checkType)
		var full = [main.trim(), (tpl.scene || "").trim(), pcCmd.trim(), enemyCmd, allyCmd, (tpl.memo || "").trim()]
			.filter(Boolean)
			.join("\n\n")
		var kc = state.characters.filter(function (c) {
			return c.isKp
		})[0]
		if (!kc) {
			kc = { id: uid(), name: T("home.084"), isKp: true, memo: "" }
			state.characters.unshift(kc)
		}
		kc.commands = full
		var own=(kp.skills||[]).filter(function(x){return x.name&&x.value!==null&&x.value!==""}).map(function(x){return (kp.checkType||"CCB<=")+x.value+" 【"+x.name+"】"}).join("\n")
		if(own) kc.commands=(kc.commands?kc.commands+"\n":"")+own
		toast(T("helper.024"))
		render()
	}

	// 素材の名前（ラベルまたはファイル名）から画像を探す
	function findImageUrl(key) {
		var k = String(key || "")
			.toLowerCase()
			.replace(/\.[a-z0-9]+$/, "")
			.trim()
		if (!k) return null
		var hit = state.images.filter(function (im) {
			var l = String(im.label || "").toLowerCase()
			var nm = String(im.name || "")
				.toLowerCase()
				.replace(/\.[a-z0-9]+$/, "")
			return l === k || nm === k || (l && l.indexOf(k) >= 0)
		})[0]
		return hit ? hit.name : null
	}
	// CSV（カンマ・引用符つき）と TSV の1行を分ける
	function splitCells(ln) {
		if (ln.indexOf("	") >= 0) return ln.split("	")
		var out = [],
			cur = "",
			q = false
		for (var i = 0; i < ln.length; i++) {
			var ch = ln.charAt(i)
			if (q) {
				if (ch === '"') {
					if (ln.charAt(i + 1) === '"') {
						cur += '"'
						i++
					} else q = false
				} else cur += ch
			} else if (ch === '"') q = true
			else if (ch === ",") {
				out.push(cur)
				cur = ""
			} else cur += ch
		}
		out.push(cur)
		return out
	}
	// CSV・TSV・テキストファイルからまとめて作る
	async function readBulkFile(file) {
		try {
			var txt = await file.text()
			ui.tab = "scenes"
			render()
			var ta = $("#bulkText")
			if (!ta) return
			ta.value = txt.replace(/^\uFEFF/, "")
			bulkScenes()
		} catch (err) {
			toast(T("helper.025", err.message), "warn")
		}
	}
	// テキストや表（タブ・カンマ区切り）を貼ってシーンをまとめて作る
	function bulkScenes() {
		var ta = $("#bulkText")
		if (!ta) return
		var n = 0
		var last = null
		String(ta.value || "")
			.replace(/^\uFEFF/, "")
			.split(/\r?\n/)
			.forEach(function (ln, li) {
				if (!ln.trim()) return
				var cols = splitCells(ln)
				var name = (cols[0] || "").trim()
				if (!name) return
				// 1行目が見出し行のときは飛ばす
				if (li === 0 && /^(シーン名|名前|場景名稱|場景名|名稱|씬 이름|이름|name|scene|scenename)$/i.test(name)) return
				var s = newScene(name, findImageUrl(cols[2] || ""))
				s.text = (cols[1] || "").trim()
				state.scenes.push(s)
				last = s
				n++
			})
		if (!n) return toast(T("helper.026"), "warn")
		ta.value = ""
		ui.tab = "scenes"
		if (last) ui.sceneId = last.id
		render()
		toast(n + T("helper.027"), "ok")
		return n
	}
	/* --- シーンのテンプレート --- */
	function tplById(id) {
		return state.sceneTemplates.filter(function (tp) {
			return tp.id === id
		})[0]
	}
	function sceneTplBlock() {
		var h =
			'<p class="hint">' + T("misc.001") + '</p>' +
			'<div class="row"><button class="btn pri" id="tplSave">' + T("misc.002") + '</button></div>'
		if (!state.sceneTemplates.length)
			h += '<p class="hint">' + T("story.009") + '</p>'
		state.sceneTemplates.forEach(function (tp) {
			h +=
				'<div class="row"><span class="pname">' +
				esc(tp.name || T("board.141")) +
				"</span>" +
				'<button class="x" data-tpladd="' +
				tp.id +
				'">' + T("misc.003") + '</button>' +
				'<button class="x" data-tplapply="' +
				tp.id +
				'">' + T("misc.004") + '</button>' +
				'<button class="x" data-tplapply="' +
				tp.id +
				'" data-tplmode="keep">' + T("misc.005") + '</button>' +
				'<button class="x" data-tpldel="' +
				tp.id +
				'">' + T("home.094") + '</button></div>'
		})
		return (
			h +
			'<p class="hint">' + T("misc.006") + '</p>'
		)
	}
	function tplFromScene() {
		var s = sceneById(ui.sceneId)
		if (!s) return toast(T("click.007"), "warn")
		var nm = window.prompt(T("board.070"), s.name || T("board.141"))
		if (nm === null) return
		state.sceneTemplates.push({
			id: C.newId(),
			name: nm || s.name || T("board.141"),
			foregroundUrl: s.foregroundUrl || null,
			backgroundUrl: s.backgroundUrl || null,
			backgroundMode: sceneBackgroundMode(s),
			fieldWidth: s.fieldWidth,
			fieldHeight: s.fieldHeight,
			fieldObjectFit: s.fieldObjectFit,
			displayGrid: s.displayGrid,
			text: s.text || "",
			overrides: JSON.parse(JSON.stringify(s.overrides || {})),
			extraMarkers: JSON.parse(JSON.stringify(s.extraMarkers || [])),
			cutins: (s.cutins || []).slice(),
		})
		render()
		toast(T("misc.007"), "ok")
	}
	function tplInto(tp, s, opt) {
		var o = opt || {}
		if (!o.keepFg && tp.foregroundUrl) s.foregroundUrl = tp.foregroundUrl
		s.backgroundUrl = tp.backgroundUrl || null
		s.backgroundMode = tp.backgroundMode || "room"
		if(tp.fieldWidth!==undefined)s.fieldWidth=tp.fieldWidth
		if(tp.fieldHeight!==undefined)s.fieldHeight=tp.fieldHeight
		if(tp.fieldObjectFit!==undefined)s.fieldObjectFit=tp.fieldObjectFit
		if(tp.displayGrid!==undefined)s.displayGrid=tp.displayGrid
		s.text = tp.text || ""
		s.overrides = JSON.parse(JSON.stringify(tp.overrides || {}))
		s.extraMarkers = JSON.parse(JSON.stringify(tp.extraMarkers || [])).map(function (m) {
			m.id = C.newId()
			return m
		})
		s.cutins = (tp.cutins || []).slice()
		layoutTachie(s)
		return s
	}
	function tplApply(id, mode) {
		var tp = tplById(id)
		if (!tp) return
		var s = sceneById(ui.sceneId)
		if (!s) return toast(T("click.007"), "warn")
		tplInto(tp, s, { keepFg: mode === "keep" })
		render()
		toast(T("misc.008"), "ok")
	}
	function tplAddScene(id) {
		var tp = tplById(id)
		if (!tp) return
		var s = tplInto(tp, newScene(tp.name || T("render.022"), null))
		state.scenes.push(s)
		ui.sceneId = s.id
		ui.tab = "scenes"
		render()
		toast(T("misc.009"), "ok")
		return s
	}
	function scenesFromImages() {
		openMultiPick("scenes")
	}

	/* ---------------- 書き出し ---------------- */
	function isPackedImage(v){return typeof v === "string" && /^[0-9a-f]{64}\.(webp|png|jpeg|jpg|gif)$/.test(v)}
	function brokenImageUses(){
		var map={}; function add(name,where){if(!isPackedImage(name)||packer.files[name])return;(map[name]||(map[name]={name:name,uses:[]})).uses.push(where)}
		add(state.room.backgroundUrl,T("matlist.075"));add(state.room.foregroundUrl,T("matlist.076"))
		;(state.baseMarkers||[]).forEach(function(b){add(b.imageUrl,(b.role==="panel"?T("matlist.077"):T("matlist.078"))+(b.name||T("import.006")))})
		;(state.tachie||[]).forEach(function(x){add(x.imageUrl,T("matlist.079", (x.name||x.group||T("import.006"))))})
		;(state.effects||[]).forEach(function(x){add(x.imageUrl,T("matlist.080", (x.name||T("import.006"))))})
		;(state.characters||[]).forEach(function(x){add(x.iconUrl,T("matlist.081", (x.name||T("import.006"))))})
		;(state.scenes||[]).forEach(function(sc){var sn=sc.name||T("import.006");add(sc.foregroundUrl,T("export.001", sn));if(sceneBackgroundMode(sc)==="image")add(sc.backgroundUrl,T("export.002", sn));(sc.extraMarkers||[]).forEach(function(m){add(m.imageUrl,T("export.003", sn, (m.name||T("import.006"))))});Object.keys(sc.overrides||{}).forEach(function(k){var o=sc.overrides[k];if(o)add(o.imageUrl,T("export.004", sn))})})
		return Object.keys(map).map(function(k){var x=map[k];x.uses=x.uses.filter(function(v,i,a){return a.indexOf(v)===i});return x})
	}
	function replaceImageRef(oldName,newName){
		function walk(o){if(!o||typeof o!=="object")return;Object.keys(o).forEach(function(k){if(o[k]===oldName)o[k]=newName||null;else if(typeof o[k]==="object")walk(o[k])})} walk(state)
	}
	async function repairMissingFromMaterials(){
		var list=brokenImageUses(),fixed=0
		for(var i=0;i<list.length;i++){var old=list[i].name,im=(state.images||[]).filter(function(x){return x.name===old})[0];if(!im||!im.url)continue;try{var blob=await fetch(im.url).then(function(r){if(!r.ok)throw Error("fetch");return r.blob()}),nn=await packer.add(blob,im.originalName||im.label||old);if(nn!==old)replaceImageRef(old,nn);im.name=nn;fixed++}catch(e){}}
		return fixed
	}
	function brokenBlock(){
		var list=brokenImageUses();ui.broken=list;if(!list.length)return '<p class="good">' + T("export.005") + '</p><button class="btn pri" id="brokenRetry">' + T("export.006") + '</button>'
		var opts='<option value="">' + T("export.007") + '</option>'+(state.images||[]).map(function(im){return '<option value="'+esc(im.name)+'">'+esc(im.label||im.originalName||im.name)+'</option>'}).join('')
		var h='<p class="bad"><b>'+list.length+T("export.008") + '</b></p><p class="hint">' + T("export.009") + '</p>'
		list.forEach(function(x){h+='<div class="brokenrow"><code>'+esc(x.name)+'</code><ul>'+x.uses.map(function(u){return '<li>'+esc(u)+'</li>'}).join('')+'</ul><label>' + T("export.010") + ' <select data-broken-choice="'+esc(x.name)+'">'+opts+'</select></label></div>'})
		h+='<div class="row"><button class="btn pri" id="brokenAuto">' + T("export.011") + '</button><button class="btn" id="brokenApply">' + T("export.012") + '</button></div>'
		h+='<div class="row"><label class="btn">' + T("export.013") + '<input type="file" id="brokenUpload" accept="image/*" hidden></label><select id="brokenUploadRef">'+list.map(function(x){return '<option value="'+esc(x.name)+'">'+esc(x.uses[0]||x.name)+'</option>'}).join('')+'</select></div>'
		h+='<hr><button class="btn kill" id="brokenRemove">' + T("export.014") + '</button><p class="hint tiny">' + T("export.015") + '</p>'
		return h
	}
	function brokenBanner(){var list=brokenImageUses();if(!list.length)return '';return '<div class="card badbox"><h2>' + T("export.016") + '</h2><p>'+list.map(function(x){return esc(x.uses.join('、'))}).join('<br>')+'</p><button class="btn" id="openBroken">' + T("export.017") + '</button></div>'}
	async function restoreBrokenFile(file,old){busyStart(T("export.018"),1);try{var names=await addFiles([file]),nn=names&&names[0];if(nn){replaceImageRef(old,nn);ui.modal="broken";render();toast(T("export.019"),"ok")}}finally{busyEnd()}}

	function buildSpec() {
		normalizeGridData()
		return {
			fieldWidth: state.room.fieldWidth,
			fieldHeight: state.room.fieldHeight,
			displayGrid: state.room.displayGrid,
			bgmCrossfade: state.room.bgmCrossfade !== false,
			useLegacyDice: state.room.useLegacyDice === true,
			backgroundUrl: state.room.backgroundUrl,
			foregroundUrl: state.room.foregroundUrl,
			variables: state.room.variables.filter(function (v) {
				return v.label
			}),
			baseMarkers: state.baseMarkers.filter(function (b) {
				return b.imageUrl
			}),
			scenes: state.scenes.map(function (s, i) {
				return {
					id: s.id,
					name: s.name,
					order: i + 1,
					backgroundUrl: sceneBackgroundUrl(s),
					foregroundUrl: s.foregroundUrl,
					fieldWidth: s.fieldWidth != null ? s.fieldWidth : state.room.fieldWidth,
					fieldHeight: s.fieldHeight != null ? s.fieldHeight : state.room.fieldHeight,
					fieldObjectFit: s.fieldObjectFit || "cover",
					// 選んだカットインは @カットイン名 として先頭に入れる
					text: sceneText(s),
					overrides: s.overrides,
					extraMarkers: (s.extraMarkers || [])
						.filter(function (m) {
							return m.imageUrl || m.text
						})
						.concat(noimageMarkers())
						.map(function (m) {
							return {
								id: m.id,
								name: m.name,
								imageUrl: m.imageUrl,
								text: m.text,
								x: m.x,
								y: m.y,
								width: m.width,
								height: m.height,
								z: m.z,
							}
						}),
					displayGrid: s.displayGrid !== undefined ? s.displayGrid === true : state.room.displayGrid,
				}
			}),
			characters: state.characters,
			effects: state.effects
				.filter(function (e) {
					return e.name || e.imageUrl
				})
				.map(function (e, i) {
					return {
						id: e.id,
						name: e.name || T("click.040", (i + 1)),
						order: i + 1,
						imageUrl: e.imageUrl || null,
					}
				}),
		}
	}

	async function doExport() {
		var btn = $("#export")
		if (!state.scenes.length && !state.images.length)
			return toast(T("export.020"), "warn")
		btn.disabled = true
		btn.textContent = T("maker.074")
		busyStart(T("export.021"))
		try {
			await repairMissingFromMaterials()
			var broken = brokenImageUses()
			if (broken.length) { ui.modal="broken"; render(); toast(T("export.022"),"warn"); return }
			busyProgress(1,3,T("export.023"))
			var blob = await C.buildRoomZip(buildSpec(), packer)
			busyProgress(2,3,T("export.024"))
			var v = await C.validateRoomZip(blob)
			if (!v.ok) {
				toast(T("export.025", v.problems.join(" / ")), "warn")
				return
			}
			var a = document.createElement("a")
			a.href = URL.createObjectURL(blob)
			a.download = (state.project || "room") + ".zip"
			a.click()
			setTimeout(function () {
				URL.revokeObjectURL(a.href)
			}, 5000)
			toast(
				T("export.026", v.sceneCount, v.imageCount, v.characterCount, kb(blob.size)),
				"ok",
			)
		} catch (err) {
			toast(T("export.027", err.message), "warn")
		} finally {
			busyEnd()
			btn.disabled = false
			btn.textContent = T("chars.039")
		}
	}

	/* ---------------- プロジェクト保存・読み込み ---------------- */
	function blobToDataUrl(blob) {
		return new Promise(function (res) {
			var r = new FileReader()
			r.onload = function () {
				res(r.result)
			}
			r.readAsDataURL(blob)
		})
	}
	function dataUrlToBlob(u) {
		var p = u.split(",")
		var mime = /:(.*?);/.exec(p[0])[1]
		var bin = atob(p[1])
		var arr = new Uint8Array(bin.length)
		for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
		return new Blob([arr], { type: mime })
	}

	var projHandle = null
	async function buildProjectBlob() {
		normalizeGridData()
		var projectSettings = Object.assign({}, state.settings || {})
		delete projectSettings.kpTemplates
		var imgs = []
		for (var i = 0; i < state.images.length; i++) {
			var im = state.images[i]
			imgs.push({
				id: im.id,
				label: im.label,
				role: im.role,
				roles: rolesOf(im),
				name: im.name,
				before: im.before,
				after: im.after,
				w: im.w,
				h: im.h,
				animated: !!im.animated,
				data: await blobToDataUrl(packer.blobOf(im.name)),
			})
		}
		var out = {
			format: "ccfolia-room-zip-maker",
			version: PROJ_VERSION,
			project: state.project,
			settings: projectSettings,
			room: state.room,
			baseMarkers: state.baseMarkers,
			tachie: state.tachie,
			scenes: state.scenes,
			characters: state.characters,
			effects: state.effects,
			sceneTemplates: state.sceneTemplates,
			storyTexts: state.storyTexts,
			kp: state.kp,
			memo: state.memo,
			tasks: state.tasks,
			images: imgs,
		}
		return new Blob([JSON.stringify(out)], { type: "application/json" })
	}

	function downloadBlob(blob) {
		var a = document.createElement("a")
		a.href = URL.createObjectURL(blob)
		a.download = (state.project || "room") + ".ccproj"
		a.click()
		setTimeout(function () {
			URL.revokeObjectURL(a.href)
		}, 5000)
	}

	async function saveProject() {
		toast(T("proj.001"))
		var blob = await buildProjectBlob(), saved = projectSnapshot()
		downloadBlob(blob)
		markProjectSaved(saved)
		toast(T("proj.002", kb(blob.size)), "ok")
	}

	// ⌘S ＝ 同じファイルに上書き。最初の1回だけ保存先をききます
	async function saveProjectSmart(asNew) {
		var canFs = typeof window.showSaveFilePicker === "function"
		if (canFs && (asNew || !projHandle)) {
			try {
				projHandle = await window.showSaveFilePicker({
					suggestedName: (state.project || "room") + ".ccproj",
					types: [
						{
							description: T("proj.003"),
							accept: { "application/json": [".ccproj"] },
						},
					],
				})
			} catch (e) {
				return
			}
		}
		toast(T("proj.004"))
		var blob = await buildProjectBlob(), saved = projectSnapshot()
		if (canFs && projHandle) {
			try {
				var w = await projHandle.createWritable()
				await w.write(blob)
				await w.close()
				markProjectSaved(saved)
				toast(T("proj.005", kb(blob.size)), "ok")
				return
			} catch (e) {}
		}
		downloadBlob(blob)
		markProjectSaved(saved)
		toast(T("proj.002", kb(blob.size)), "ok")
	}

	// v6以前の保存データは坐標が「左上」基準だったので「中心」基準に直す
	function migrateCenterCoords() {
		state.baseMarkers.forEach(function (b) {
			b.x = snapHalf((Number(b.x) || 0) + (Number(b.width) || 0) / 2)
			b.y = snapHalf((Number(b.y) || 0) + (Number(b.height) || 0) / 2)
		})
		state.scenes.forEach(function (s) {
			var ovs = s.overrides || {}
			Object.keys(ovs).forEach(function (k) {
				var ov = ovs[k]
				if (!ov) return
				var base = partById(k) || {}
				var w = Number(ov.width != null ? ov.width : base.width) || 0
				var hh = Number(ov.height != null ? ov.height : base.height) || 0
				if (ov.x != null) ov.x = snapHalf(Number(ov.x) + w / 2)
				if (ov.y != null) ov.y = snapHalf(Number(ov.y) + hh / 2)
			})
			var ems = s.extraMarkers || []
			ems.forEach(function (m) {
				m.x = snapHalf((Number(m.x) || 0) + (Number(m.width) || 0) / 2)
				m.y = snapHalf((Number(m.y) || 0) + (Number(m.height) || 0) / 2)
			})
		})
	}

	/* TRPG Toolkit 合輯：上游 Web DEMO 版是每次開頁就自動蓋掉現有專案，
	 * 這裡改成按了才載入，而且做到一半的東西會先問過。 */
	async function loadSampleProject() {
		if (!isUntouchedProjectName(state.project) || state.images.length || state.scenes.length) {
			if (!confirm(T("sample.confirm"))) return
		}
		try {
			var res = await fetch(new URL("sample.ccproj", location.href).href, { cache: "no-store" })
			if (!res.ok) throw new Error("HTTP " + res.status)
			await loadProject(new File([await res.text()], "sample.ccproj", { type: "application/json" }))
			/* 範例檔照抄上游，裡面的專案名是「ココフォリアZIPメーカー DEMO」。
			 * 這裡已經不是 DEMO 版了，名字改成中性的，免得誤導。 */
			state.project = T("sample.project")
			render()
		} catch (e) {
			toast(T("sample.failed", e.message), "warn")
		}
	}

	async function loadProject(file) {
		try {
			var j = JSON.parse(await file.text())
			if (j.format !== "ccfolia-room-zip-maker") throw new Error(T("proj.006"))
			// プロジェクトを切り替える前に、共通プリセットが参照する画像を共有保管へ退避する
			await saveEffectPresetImages()
			packer = new C.Packer()
			state.project = j.project || defaultProjectName()
			var globalSettings = storedAppSettings()
			state.settings = Object.assign(
				{ maxEdge: 1200, quality: 0.8, convert: true },
				globalSettings || j.settings || {},
			)
			appSettingsLoaded = true
			if (!globalSettings && j.settings) persistAppSettings()
			state.room = Object.assign(
				{
					fieldWidth: 37,
					fieldHeight: 17,
					backgroundUrl: null,
					foregroundUrl: null,
					displayGrid: false,
					bgmCrossfade: true,
					useLegacyDice: false,
					tachieAlignBottom: true,
					tachieBottom: 15,
					tachieHeight: 18,
					tachieZ: 30,
					variables: [],
				},
				j.room || {},
			)
			state.baseMarkers = j.baseMarkers || []
			state.baseMarkers.forEach(function (b) {
				if (b.role !== "panel" && b.role !== "part")
					b.role = /パネル|panel/i.test(b.name || "") ? "panel" : "part"
			})
			state.tachie = (j.tachie || []).map(function (tc) {
				return Object.assign({ dy: 0 }, tc)
			})
			state.scenes = (j.scenes || []).map(function (s) {
				var o = Object.assign({ overrides: {}, extraMarkers: [], cutins: [] }, s)
				delete o.mediaName
				// 旧版の「一緒くたのマーカー」を 立ち絵／全画面／その他 に振り分け
				o.extraMarkers = (o.extraMarkers || []).map(function (m) {
					if (!m.kind)
						m.kind = m.refId
							? "tachie"
							: m.width >= (j.room && j.room.fieldWidth ? j.room.fieldWidth : 37)
								? "full"
								: "other"
					return m
				})
				// 旧版はシーン画像が背景に入っていたので前景へ移す
				if ((j.version || 1) < 3 && o.backgroundUrl && !o.foregroundUrl) {
					o.foregroundUrl = o.backgroundUrl
					o.backgroundUrl = null
				}
				if (SCENE_BACKGROUND_MODES.indexOf(o.backgroundMode) < 0) o.backgroundMode = "room"
				return o
			})
			state.characters = j.characters || []
			state.storyTexts = Array.isArray(j.storyTexts) ? j.storyTexts : []
			state.kp = j.kp && typeof j.kp === "object" && !Array.isArray(j.kp) ? j.kp : null
			state.effects = j.effects || []
			ui.cutinSel = []
			ui.cutinSelectMode = false
			state.sceneTemplates = (j.sceneTemplates || []).map(function (tp) {
				if (SCENE_BACKGROUND_MODES.indexOf(tp.backgroundMode) < 0) tp.backgroundMode = "room"
				return tp
			})
			state.memo = typeof j.memo === "string" ? j.memo : ""
			state.tasks = Array.isArray(j.tasks) ? j.tasks : []
			normalizeGridData()
			state.images = []
			for (var i = 0; i < (j.images || []).length; i++) {
				var im = j.images[i]
				var blob = dataUrlToBlob(im.data)
				var name = await packer.add(blob, im.name)
				state.images.push({
					id: im.id || uid(),
					label: im.label,
					role: im.role === "背景" ? "前景" : im.role || guessRole(im.w, im.h),
					roles: Array.isArray(im.roles) && im.roles.length
						? im.roles.map(function (r) {
								return r === "背景" ? "前景" : r
							})
						: [im.role === "背景" ? "前景" : im.role || guessRole(im.w, im.h)],
					name: name,
					before: im.before || blob.size,
					after: blob.size,
					animated: !!im.animated,
					w: im.w,
					h: im.h,
					url: URL.createObjectURL(blob),
				})
			}
			ui.sceneId = state.scenes.length ? state.scenes[0].id : null
			if (!(Number(j.version) >= 7)) migrateCenterCoords()
			state.tachie.forEach(fitTachie)
			syncTachie()
			render()
			resetHistory()
			markProjectSaved()
			toast(T("proj.007"), "ok")
		} catch (e) {
			toast(T("helper.025", e.message), "warn")
		}
	}

	document.addEventListener("click",function(e){var t=e.target;if(t.id==="openBroken"){ui.modal="broken";render();return}if(t.id==="brokenRetry"){ui.modal=null;render();doExport();return}if(t.id==="brokenAuto"){repairMissingFromMaterials().then(function(n){ui.modal="broken";render();toast(n? n+T("proj.008"):T("proj.009"),n?"ok":"warn")});return}if(t.id==="brokenApply"){all("[data-broken-choice]").forEach(function(x){if(x.value)replaceImageRef(x.dataset.brokenChoice,x.value)});ui.modal="broken";render();return}if(t.id==="brokenRemove"){if(confirm(T("proj.010"))){brokenImageUses().forEach(function(x){replaceImageRef(x.name,null)});ui.modal=null;render();doExport()}return}if(t.dataset&&t.dataset.keyrecord){keyRecording=t.dataset.keyrecord;render();return}if(t.dataset&&t.dataset.keyclear){var k=keyBag();k[t.dataset.keyclear]="";saveKeyBag(k);if(keyRecording===t.dataset.keyclear)keyRecording=null;render();return}if(t.id==="keyReset"){saveKeyBag(KEY_PREFS);keyRecording=null;render();toast(T("proj.011"),"ok");return}if(t.dataset&&t.dataset.themechoice){setTheme(t.dataset.themechoice);render();return}if(t.id==="themeQuick"){cycleTheme();return}},true)
	document.addEventListener("change",function(e){var t=e.target;if(t.id==="brokenUpload"&&t.files&&t.files[0]){var ref=$("#brokenUploadRef");restoreBrokenFile(t.files[0],ref&&ref.value);t.value=""}},true)
	document.addEventListener("click",function(e){var t=e.target.closest&&e.target.closest("[data-parttplopen],[data-parttplsave],[data-parttpluse],[data-parttpldel],[data-chartplsave],[data-chartpluse],[data-chartpldetail]");if(!t)return;if(t.dataset.parttplopen){ui.modal="parttpl";ui.partTemplatesLoaded=false;render();return}if(t.dataset.parttplsave){partTemplateSave(t.dataset.parttplsave);return}if(t.dataset.parttpluse){partTemplateUse(t.dataset.parttpluse);return}if(t.dataset.parttpldel){partTemplateDelete(t.dataset.parttpldel);return}if(t.dataset.chartplsave){characterTemplateSaveTracked(t.dataset.chartplsave);return}if(t.dataset.chartpluse){characterTemplateUse(t.dataset.chartpluse);return}if(t.dataset.chartpldetail){ui.tplDetail={kind:"chartpl",id:t.dataset.chartpldetail};ui.modal="tpldetail";render();return}},true)
	function appSettingsTarget(t) {
		if (!t) return false
		if (t.closest && t.closest(".settings-category")) return true
		if (["pvGuideColor","tcGap","tcGapRoom","storyTplSave","charTplSave"].indexOf(t.id) >= 0) return true
		var d=t.dataset||{}
		return d.guide || d.roomguide || d.emsave || d.storytplapply || d.storytpldel || d.chartplapply || d.chartpldel
	}
	function saveAppSettingsAfterEvent(e) { if (appSettingsTarget(e.target)) setTimeout(persistAppSettings, 0) }
	document.addEventListener("click", saveAppSettingsAfterEvent)
	document.addEventListener("input", saveAppSettingsAfterEvent)
	document.addEventListener("change", saveAppSettingsAfterEvent)

	/* ---------------- テスト用フック ---------------- */
	window.__testHooks = {
		state: state,
		ui: ui,
		addFiles: addFiles,
		buildSpec: buildSpec,
		sceneBackgroundMode: sceneBackgroundMode,
		sceneBackgroundUrl: sceneBackgroundUrl,
		applyRoomDesignToScenes: applyRoomDesignToScenes,
		brokenImageUses: brokenImageUses,
		replaceImageRef: replaceImageRef,
		repairMissingFromMaterials: repairMissingFromMaterials,
		doExport: doExport,
		buildZip: function () {
			return C.buildRoomZip(buildSpec(), packer)
		},
		validate: C.validateRoomZip,
		scenesFromImages: scenesFromImages,
		addPart: addPart,
		guessRole: guessRole,
		isVagueName: isVagueName,
		autoRename: autoRename,
		addCut: addCut,
		cutsFromImages: cutsFromImages,
		addTachieLib: addTachieLib,
		tachieFromImages: tachieFromImages,
		fitTachie: fitTachie,
		tachieY: tachieY,
		layoutTachie: layoutTachie,
		syncTachie: syncTachie,
		sceneTachieMarkers: sceneTachieMarkers,
		bulkScenes: bulkScenes,
		buildProjectBlob: buildProjectBlob,
		saveProject: saveProject,
		loadProject: loadProject,
		normalizeGridData: normalizeGridData,
		partTemplateSave: partTemplateSave,
		partTemplateLoad: partTemplateLoad,
		partTemplateUse: partTemplateUse,
		partTemplateImageUse: partTemplateImageUse,
		partTemplateDelete: partTemplateDelete,
		characterTemplateSave: characterTemplateSaveTracked,
		characterTemplateUse: characterTemplateUse,
		kpSharedTemplateSave: kpSharedTemplateSave,
		kpSharedTemplateApply: kpSharedTemplateApply,
		kpSharedTemplateDelete: kpSharedTemplateDelete,
		persistAppSettings: persistAppSettings,
		snapNow: snapNow,
		projectSnapshot: projectSnapshot,
		markProjectSaved: markProjectSaved,
		isProjectDirty: isProjectDirty,
		autoSaveTick: autoSaveTick,
		autoRestore: autoRestore,
		historyWatch: historyWatch,
		resetHistory: resetHistory,
		undo: undo,
		redo: redo,
		startNewRoom: startNewRoom,
		findImageUrl: findImageUrl,
		tplFromScene: tplFromScene,
		tplApply: tplApply,
		tplAddScene: tplAddScene,
		applyInput: applyInput,
		storyBulkEntries: storyBulkEntries,
		storyBulkMake: storyBulkMake,
		moveStorySel: moveStorySel,
		moveStorySelTo: moveStorySelTo,
		edDefaults: edDefaults,
		normalizeEditCrop: normalizeEditCrop,
		normalizeEditGradient: normalizeEditGradient,
		applyEditOverlays: applyEditOverlays,
		drawEditProcessed: drawEditProcessed,
		applyEditPreview: applyEditPreview,
		openApngMaker: openApngMaker,
		apngNormalizeUi: apngNormalizeUi,
		drawApngPreviewFrame: drawApngPreviewFrame,
		stopApngPreview: stopApngPreview,
		apngPreviewActive: function () { return !!apngPreviewFrame },
		runApngMaker: runApngMaker,
		openImageMaker: openImageMaker,
		imageMakerNewLayer: imageMakerNewLayer,
		makeImageMakerCanvas: makeImageMakerCanvas,
		imageMakerCanvasPoint: imageMakerCanvasPoint,
		imageMakerHitLayer: imageMakerHitLayer,
		imageMakerSnapshot: imageMakerSnapshot,
		imageMakerUndo: imageMakerUndo,
		imageMakerRedo: imageMakerRedo,
		runImageMaker: runImageMaker,
		imageMakerQuality: imageMakerQuality,
		releaseImageMaker: releaseImageMaker,
		imageBlob: function (name) { return packer.blobOf(name) },
		isAnimated: isAnimated,
		saveEffectPresetImage: saveEffectPresetImage,
		restoreEffectPresetImage: restoreEffectPresetImage,
		addSceneEffectFromPreset: addSceneEffectFromPreset,
		normalizeEmPresetSettings: normalizeEmPresetSettings,
		emPresetById: emPresetById,
		emPresetMatch: emPresetMatch,
		emPresetLayoutEntries: emPresetLayoutEntries,
		emPresetAddFromValues: emPresetAddFromValues,
		emPresetDelete: emPresetDelete,
		emPresetMoveBefore: emPresetMoveBefore,
		emPresetMoveToIndex: emPresetMoveToIndex,
		emPresetSetField: emPresetSetField,
		emPresetSetImage: emPresetSetImage,
		normalizeCutinTemplateSettings: normalizeCutinTemplateSettings,
		cutinTemplateById: cutinTemplateById,
		cutinTemplateLayoutEntries: cutinTemplateLayoutEntries,
		cutinTemplateRegisterEffects: cutinTemplateRegisterEffects,
		cutinTemplateRegisterOne: cutinTemplateRegisterOne,
		cutinTemplateSaveSelected: cutinTemplateSaveSelected,
		cutinTemplateApply: cutinTemplateApply,
		cutinTemplateDelete: cutinTemplateDelete,
		cutinTemplateSetField: cutinTemplateSetField,
		cutinTemplateSetImage: cutinTemplateSetImage,
		cutinTemplateAddSeparator: cutinTemplateAddSeparator,
		cutinTemplateSetSeparator: cutinTemplateSetSeparator,
		cutinTemplateDeleteSeparator: cutinTemplateDeleteSeparator,
		cutinTemplateMoveToIndex: cutinTemplateMoveToIndex,
		tplImportData: tplImportData,
		restartPickerAnimation: restartPickerAnimation,
		runImgEdit: runImgEdit,
		render: render,
		setTab: function (t) {
			ui.tab = t
			render()
		},
	}

	applyTheme()
	try{matchMedia("(prefers-color-scheme: light)").addEventListener("change",function(){if(themeBag()==="auto")applyTheme("auto")})}catch(e){}
	loadLocal()
	ui.tab = "home"
	render()
	markProjectSaved()

	/* TRPG Toolkit 合輯：畫面幾乎都是 render() 重畫出來的，所以切換語言時
	 * 整個重畫一次就夠。applyTheme() 另外寫了主題鈕的文字與 title，要一起更新。
	 *
	 * enableFastTooltips() 會把 title 搬進 data-fast-tip 再拿掉 title；而
	 * i18n 引擎是在 DOMContentLoaded 才套用 data-i18n-title。本檔在 body 結尾
	 * 執行，第一次 render() 早於那個時間點，靜態標記上的 title 會在之後被重新
	 * 寫回來，所以這裡補一次搬移，否則 header 會同時冒出原生與自製兩種提示。 */
	I18N.mountSwitcher(document.getElementById("localeSelect"))
	I18N.onChange(function () { applyTheme(); render() })
	document.addEventListener("DOMContentLoaded", function () { applyTheme(); enableFastTooltips() })
})()
