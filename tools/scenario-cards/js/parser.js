function parseSourceText(rawText) {
  let text = rawText || "";
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function splitSelectionIntoTitleAndBody(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstLineIndex = lines.findIndex(line => line.trim());

  if (firstLineIndex === -1) {
    return { title: "", body: "" };
  }

  return {
    title: lines[firstLineIndex].trim().slice(0, 80),
    body: lines.slice(firstLineIndex + 1).join("\n").trim()
  };
}
