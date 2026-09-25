const resultEl = document.getElementById("result");
const commandOutputEl = document.getElementById("commandOutput");
const copyMessageEl = document.getElementById("copyMessage");

/* 收錄版：這頁沒有共用頁首，語言選單在頁面頂端的導覽列裡，由這裡掛上。 */
I18N.mountSwitcher(document.getElementById("localeSelect"));

/* 結果欄的文字由函式產生並記下來，切換語言時重新呼叫它重畫。 */
let renderResult = null;

function showResult(render) {
	renderResult = render;
	resultEl.innerText = render ? render() : "";
}

I18N.onChange(() => {
	if (renderResult) resultEl.innerText = renderResult();
});

document.getElementById("calculateBtn").addEventListener("click", function () {
	const armorValue = parseInt(document.getElementById("armorValue").value);
	const damageRollsInput = document.getElementById("damageRolls").value;

	showResult(null);
	commandOutputEl.innerText = "";
	commandOutputEl.style.display = "none";
	copyMessageEl.style.display = "none";

	if (isNaN(armorValue)) {
		showResult(() => T("error.armor"));
		return;
	}

	/* BCDice 的輸出固定用全形「＞」，這裡照原樣比對，與介面語言無關。 */
	const damageRolls = [];
	const matches = damageRollsInput.match(/＞\s*(\d+)\s*$/gm);
	if (matches) {
		matches.forEach((match) => {
			const number = parseInt(match.match(/\d+/)[0]);
			damageRolls.push(number);
		});
	} else {
		showResult(() => T("error.noRolls"));
		return;
	}

	const adjustedDamage = damageRolls.map((roll) => Math.max(0, roll - armorValue));
	const totalDamage = adjustedDamage.reduce((sum, value) => sum + value, 0);

	showResult(() => T("result.total", totalDamage));

	const command = `:HP-${totalDamage}`;
	commandOutputEl.innerText = command;
	commandOutputEl.style.display = "block";
});

commandOutputEl.addEventListener("click", function () {
	const commandToCopy = commandOutputEl.innerText;
	navigator.clipboard
		.writeText(commandToCopy)
		.then(function () {
			copyMessageEl.style.display = "block";
			setTimeout(() => {
				copyMessageEl.style.display = "none";
			}, 2000);
		})
		.catch(function (err) {
			console.error("Copy failed: ", err);
		});
});
