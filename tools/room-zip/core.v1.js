/*! ココフォリア部屋ZIPメーカー — 生成コア（ブラウザ / Node 共用） */
(function (root, factory) {
	if (typeof module === "object" && module.exports) {
		module.exports = factory(require("jszip"))
	} else {
		root.CcfoliaCore = factory(root.JSZip)
	}
})(typeof self !== "undefined" ? self : globalThis, function (JSZip) {
	"use strict"

	/* TRPG Toolkit 合輯：這個檔案上游同時給瀏覽器與 Node 用。Node 那邊沒有
	 * i18n 引擎，取不到就回傳 key，至少不會炸掉。 */
	function T(key) {
		var t = typeof globalThis !== "undefined" && globalThis.T
		return typeof t === "function" ? t.apply(null, arguments) : key
	}

	/* ---------------- 定数（実データ検証済み） ---------------- */
	var GRID_PX = 24 // 1マス = 24px
	var DATA_FILE = "__data.json"
	var EXT2MIME = {
		webp: "image/webp",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
	}

	/* ---------------- ID / トークン ---------------- */
	var lastId = 0
	function newId() {
		var now = Math.max(Date.now(), lastId + 1)
		lastId = now
		return now.toString(36)
	}

	// .token は同梱必須。値は検証されない（実測済み）ので乱数でよい
	function newToken() {
		var b = crypto.getRandomValues(new Uint8Array(32))
		return (
			"0." +
			Array.prototype.map
				.call(b, function (x) {
					return x.toString(16).padStart(2, "0")
				})
				.join("")
		)
	}

	function hex(buf) {
		return Array.prototype.map
			.call(new Uint8Array(buf), function (x) {
				return x.toString(16).padStart(2, "0")
			})
			.join("")
	}

	async function sha256Hex(blob) {
		var buf = await blob.arrayBuffer()
		return hex(await crypto.subtle.digest("SHA-256", buf))
	}

	function extOf(mime, fileName) {
		if (mime === "image/webp") return "webp"
		if (mime === "image/png") return "png"
		if (mime === "image/jpeg") return "jpeg"
		if (mime === "image/gif") return "gif"
		var m = /\.([A-Za-z0-9]+)$/.exec(fileName || "")
		var e = m ? m[1].toLowerCase() : "png"
		return EXT2MIME[e] ? e : "png"
	}

	/* ---------------- 画像パッカー ----------------
	 * ファイル名 = sha256(中身) + 拡張子。
	 * 同じ中身なら同じ名前になるので重複排除が自動で効く。
	 */
	function Packer() {
		this.files = {} // name -> Blob
		this.mimes = {} // name -> mime
	}
	Packer.prototype.add = async function (blob, fileName) {
		var mime = blob.type || ""
		var ext = extOf(mime, fileName)
		var name = (await sha256Hex(blob)) + "." + ext
		if (!this.files[name]) {
			this.files[name] = blob
			this.mimes[name] = EXT2MIME[ext]
		}
		return name
	}
	// ZIPに実際に入れる画像だけを resources に載せる（過不足があるとインポート失敗）
	Packer.prototype.resourcesFor = function (usedNames) {
		var out = {}
		var self = this
		usedNames.forEach(function (n) {
			if (n && self.files[n]) out[n] = { type: self.mimes[n] }
		})
		return out
	}
	Packer.prototype.blobOf = function (name) {
		return this.files[name]
	}

	/* ---------------- マーカー ---------------- */
	// 盤面の位置・サイズは1マス単位。負の .5 も絶対値の大きい側へ丸める。
	function roundGrid(v) {
		var n = typeof v === "number" ? v : parseFloat(v)
		if (!isFinite(n)) n = 0
		return n < 0 ? Math.ceil(n - 0.5) : Math.floor(n + 0.5)
	}

	// このツールの x / y は「画像の中心」の坐標。
	// ココフォリアの marker は「左上」を持つので、書き出し時に半分ずらす。
	function marker(m) {
		var w = Math.max(1, roundGrid(num(m.width, 4)))
		var hh = Math.max(1, roundGrid(num(m.height, 4)))
		return {
			x: roundGrid(roundGrid(m.x) - w / 2),
			y: roundGrid(roundGrid(m.y) - hh / 2),
			z: num(m.z, 2),
			width: w,
			height: hh,
			angle: num(m.angle, 0),
			locked: m.locked !== false,
			freezed: m.freezed === true,
			text: m.text || "",
			imageUrl: m.imageUrl || null,
			clickAction: m.clickAction || null,
		}
	}

	function num(v, d) {
		var n = typeof v === "number" ? v : parseFloat(v)
		return isFinite(n) ? n : d
	}

	// ベース設計 + シーンごとの上書き（overrides）をマージ
	// overrides[baseId] === null なら、そのシーンでは非表示
	function mergeMarkers(baseMarkers, overrides, forRoom) {
		var ov = overrides || {}
		var out = {}
		baseMarkers.forEach(function (b) {
			if (b.visible === false || b.role === "panel") return
			var o = Object.prototype.hasOwnProperty.call(ov, b.id) ? ov[b.id] : undefined
			if (o === null) return
			// scope:"scene" は部屋には出さず、選んだシーンだけに出す
			if (b.scope === "scene") {
				if (forRoom) return
				if (!(o && o.show)) return
			}
			out[b.id] = marker(Object.assign({}, b, o || {}))
		})
		return out
	}

	function screenItems(baseMarkers) {
		var out = {}, order = 1
		;(baseMarkers || []).forEach(function (b) {
			if (b.role !== "panel" || b.visible === false || (!b.imageUrl && !b.text)) return
			var w = Math.max(1, roundGrid(num(b.width, 4))), h = Math.max(1, roundGrid(num(b.height, 4)))
			out[b.id || newId()] = {
				x: roundGrid(roundGrid(b.x) - w / 2), y: roundGrid(roundGrid(b.y) - h / 2), z: num(b.z, 2), angle: num(b.angle, 0),
				width: w, height: h, deckId: null, locked: b.lockMove === true || b.locked === true,
				visible: true, closed: false, withoutOwner: false, freezed: b.freezed === true,
				type: "object", active: true, memo: b.text || "", imageUrl: b.imageUrl || null,
				coverImageUrl: null, clickAction: b.clickAction || null, order: order++
			}
		})
		return out
	}

	// n体を横方向に均等配置（マス単位・中央原点）
	function autoLayoutX(baseWidth, n, i) {
		return -baseWidth / 2 + (baseWidth / (n + 1)) * (i + 1)
	}

	/* ---------------- __data.json 組み立て ---------------- */
	function buildData(spec, resources) {
		var fw = Math.max(1, roundGrid(num(spec.fieldWidth, 37)))
		var fh = Math.max(1, roundGrid(num(spec.fieldHeight, 17)))
		var base = spec.baseMarkers || []

		var scenes = {}
		var firstSceneId = null
		;(spec.scenes || []).forEach(function (s, i) {
			var id = s.id || newId()
			if (!firstSceneId) firstSceneId = id
			// ベース継承マーカー + そのシーンだけの演出マーカー
			var mk = mergeMarkers(base, s.overrides)
			;(s.extraMarkers || []).forEach(function (e) {
				mk[e.id || newId()] = marker(e)
			})
			scenes[id] = {
				name: s.name || T("misc.010", (i + 1)),
				order: num(s.order, i + 1), // 小数OK（間に差し込める）
				backgroundUrl: s.backgroundUrl || null,
				foregroundUrl: s.foregroundUrl || null,
				fieldObjectFit: s.fieldObjectFit || "cover",
				fieldWidth: Math.max(1, roundGrid(num(s.fieldWidth, fw))),
				fieldHeight: Math.max(1, roundGrid(num(s.fieldHeight, fh))),
				displayGrid: s.displayGrid === true,
				gridSize: num(s.gridSize, 1),
				markers: mk,
				text: s.text || "",
				locked: false,
				// BGM/効果音はココフォリアの音源ライブラリのID（数字）。IDが分かる場合はそのまま鍵として使える
				mediaName: s.mediaName || "",
				mediaRef: s.mediaRef ? String(s.mediaRef) : null,
				mediaType: "file",
				mediaRepeat: s.mediaRepeat !== false,
				mediaVolume: num(s.mediaVolume, 1),
				soundName: s.soundName || "",
				soundRef: s.soundRef ? String(s.soundRef) : null,
				soundRepeat: s.soundRepeat === true,
				soundVolume: num(s.soundVolume, 1),
			}
		})

		var characters = {}
		;(spec.characters || []).forEach(function (c, i) {
			var status = []
			if (c.hp != null && c.hp !== "") {
				status.push({
					label: "HP",
					value: num(c.hp, 0),
					max: num(c.maxHp != null && c.maxHp !== "" ? c.maxHp : c.hp, 0),
				})
			}
			if (c.mp != null && c.mp !== "") {
				status.push({
					label: "MP",
					value: num(c.mp, 0),
					max: num(c.maxMp != null && c.maxMp !== "" ? c.maxMp : c.mp, 0),
				})
			}
			;(c.status || []).forEach(function (s) {
				status.push({
					label: s.label,
					value: num(s.value, 0),
					max: num(s.max, num(s.value, 0)),
				})
			})
			characters[c.id || newId()] = {
				name: c.name || "NPC" + (i + 1),
				playerName: c.playerName || "",
				memo: c.memo || "",
				initiative: num(c.initiative, 0),
				externalUrl: "",
				status: status,
				params: c.params || [],
				iconUrl: c.iconUrl || null,
				faces: c.faces || [],
				// 実データ同様、駒は盤外に待機させる
				x: roundGrid(num(c.x, 490)),
				y: roundGrid(num(c.y, 791)),
				z: num(c.z, 1),
				angle: 0,
				width: Math.max(1, roundGrid(num(c.width, 4))),
				height: Math.max(1, roundGrid(num(c.height, 4))),
				active: false,
				secret: false,
				invisible: false,
				hideStatus: false,
				color: c.color || "#888888",
				roomId: null,
				commands: c.commands || "",
				speaking: false,
				diceSkin: null,
				order: num(c.order, i + 1),
			}
		})

		// カットイン（effects）
		var effects = {}
		;(spec.effects || []).forEach(function (e, i) {
			effects[e.id || newId()] = {
				name: e.name || T("click.040", (i + 1)),
				order: num(e.order, i + 1),
				active: false,
				imageUrl: e.imageUrl || null,
				playTime: num(e.playTime, Date.now()),
				soundRef: e.soundRef ? String(e.soundRef) : null,
				soundName: e.soundName || "",
				soundVolume: num(e.soundVolume, 1),
			}
		})

		var notes = {}
		;(spec.notes || []).forEach(function (n, i) {
			notes[n.id || newId()] = {
				name: n.name || T("misc.011", (i + 1)),
				text: n.text || "",
				order: num(n.order, i + 1),
				iconUrl: null,
			}
		})

		return {
			meta: { version: "1.1.0" },
			entities: {
				room: {
					defaultAnonymousRole: "player",
					backgroundUrl: spec.backgroundUrl || null,
					foregroundUrl: spec.foregroundUrl || null,
					embedUrl: null,
					thumbnailUrl: null,
					mapType: "image",
					fieldWidth: fw,
					fieldHeight: fh,
					fieldObjectFit: "cover",
					alignWithGrid: true,
					messageChannels: spec.messageChannels || ["メイン", "情報", "雑談"],
					messageGroups: [],
					markers: mergeMarkers(base, null, true),
					mediaName: "",
					mediaRef: null,
					mediaType: "file",
					mediaRepeat: true,
					mediaVolume: 1,
					monitored: false,
					soundRef: null,
					sceneId: firstSceneId,
					archived: false,
					backgroundColor: spec.backgroundColor || "#000000",
					variables: spec.variables || [],
					underConstruction: false,
					hidden3dDice: spec.useLegacyDice === true,
					initialSavedata: null,
					displayGrid: spec.displayGrid === true,
					gridSize: num(spec.gridSize, 1),
					// ココフォリア実ZIPでは、UIの「BGMクロスフェード」と内部値が逆になる
					enableCrossfade: spec.bgmCrossfade === false,
					crossfadeDuration: 1,
				},
				items: screenItems(base),
				decks: {},
				notes: notes,
				characters: characters,
				effects: effects,
				scenes: scenes,
				savedatas: {},
				snapshots: {},
			},
			resources: resources,
		}
	}

	// __data.json 内で実際に参照されている画像名を全部集める
	function collectUsedImages(data) {
		var used = {}
		function walk(o) {
			if (!o || typeof o !== "object") return
			Object.keys(o).forEach(function (k) {
				var v = o[k]
				if (typeof v === "string") {
					if (/^[0-9a-f]{64}\.(webp|png|jpeg|jpg|gif)$/.test(v)) used[v] = true
				} else walk(v)
			})
		}
		walk(data.entities)
		return Object.keys(used)
	}

	/* ---------------- ZIP生成 ---------------- */
	async function buildRoomZip(spec, packer) {
		// 1回組んで参照画像を洗い出し、resources を1対1で作り直す
		var draft = buildData(spec, {})
		var used = collectUsedImages(draft)
		var resources = packer.resourcesFor(used)
		draft.resources = resources

		var zip = new JSZip() // フォルダは作らない（完全フラット必須）
		zip.file(DATA_FILE, JSON.stringify(draft))
		zip.file(".token", spec.token || newToken()) // 同梱必須
		var imgNames = Object.keys(resources)
		for (var i = 0; i < imgNames.length; i++) {
			// ArrayBuffer にしてから入れる（ブラウザ・Nodeどちらでも動く）
			zip.file(imgNames[i], await packer.blobOf(imgNames[i]).arrayBuffer())
		}
		return zip.generateAsync({ type: "blob", compression: "DEFLATE" })
	}

	/* ---------------- 自己検証 ---------------- */
	async function validateRoomZip(blob) {
		var input = blob && blob.arrayBuffer ? await blob.arrayBuffer() : blob
		var zip = await JSZip.loadAsync(input)
		var names = Object.keys(zip.files).filter(function (n) {
			return !zip.files[n].dir
		})

		var flat = names.every(function (n) {
			return n.indexOf("/") === -1
		})
		var hasToken = names.indexOf(".token") !== -1
		var hasData = names.indexOf(DATA_FILE) !== -1

		var problems = []
		if (!flat) problems.push(T("misc.012"))
		if (!hasToken) problems.push(T("misc.013"))
		if (!hasData) problems.push(T("misc.014"))
		if (!hasData) {
			return { ok: false, problems: problems, imageCount: 0 }
		}

		var data = JSON.parse(await zip.file(DATA_FILE).async("string"))
		var declared = Object.keys(data.resources || {})
		var images = names.filter(function (n) {
			return /\.(webp|png|jpeg|jpg|gif)$/i.test(n)
		})

		var missing = declared.filter(function (n) {
			return images.indexOf(n) === -1
		})
		var orphan = images.filter(function (n) {
			return declared.indexOf(n) === -1
		})
		if (missing.length) problems.push(T("misc.015", missing.join(", ")))
		if (orphan.length) problems.push(T("misc.016", orphan.join(", ")))

		// ファイル名がsha256と一致しているか
		var bad = []
		for (var i = 0; i < images.length; i++) {
			var n = images[i]
			var buf = await zip.file(n).async("arraybuffer")
			var want = hex(await crypto.subtle.digest("SHA-256", buf))
			if (n.split(".")[0] !== want) bad.push(n)
		}
		if (bad.length) problems.push(T("misc.017", bad.join(", ")))

		// 参照切れ（JSONが指しているのにZIPに無い）
		var used = collectUsedImages(data)
		var dangling = used.filter(function (n) {
			return images.indexOf(n) === -1
		})
		if (dangling.length) problems.push(T("misc.018", dangling.join(", ")))

		return {
			ok: problems.length === 0,
			problems: problems,
			imageCount: images.length,
			sceneCount: Object.keys(data.entities.scenes || {}).length,
			characterCount: Object.keys(data.entities.characters || {}).length,
		}
	}

	return {
		GRID_PX: GRID_PX,
		DATA_FILE: DATA_FILE,
		newId: newId,
		newToken: newToken,
		sha256Hex: sha256Hex,
		Packer: Packer,
		marker: marker,
		roundGrid: roundGrid,
		mergeMarkers: mergeMarkers,
		screenItems: screenItems,
		autoLayoutX: autoLayoutX,
		buildData: buildData,
		collectUsedImages: collectUsedImages,
		buildRoomZip: buildRoomZip,
		validateRoomZip: validateRoomZip,
		pxToMasu: function (px) {
			return px / GRID_PX
		},
		masuToPx: function (m) {
			return m * GRID_PX
		},
	}
})
