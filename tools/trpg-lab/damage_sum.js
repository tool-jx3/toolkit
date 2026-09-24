const resultEl = document.getElementById("result");
const commandOutputEl = document.getElementById("commandOutput");
const copyMessageEl = document.getElementById("copyMessage");

document.getElementById("calculateBtn").addEventListener("click", function () {
	const armorValue = parseInt(document.getElementById("armorValue").value);
	const damageRollsInput = document.getElementById("damageRolls").value;

	resultEl.innerText = "";
	commandOutputEl.innerText = "";
	commandOutputEl.style.display = "none";
	copyMessageEl.style.display = "none";

	if (isNaN(armorValue)) {
		resultEl.innerText = "装甲値を正しく入力してください";
		return;
	}

	const damageRolls = [];
	const matches = damageRollsInput.match(/＞\s*(\d+)\s*$/gm);
	if (matches) {
		matches.forEach((match) => {
			const number = parseInt(match.match(/\d+/)[0]);
			damageRolls.push(number);
		});
	} else {
		resultEl.innerText = "ダメージロール結果が見つかりませんでした";
		return;
	}

	const adjustedDamage = damageRolls.map((roll) => Math.max(0, roll - armorValue));
	const totalDamage = adjustedDamage.reduce((sum, value) => sum + value, 0);

	resultEl.innerText = `ダメージ合計: ${totalDamage}`;

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
			console.error("コピーに失敗しました: ", err);
		});
});

