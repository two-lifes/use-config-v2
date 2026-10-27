// No downloads permission (D-13): an <a download> link saves a Blob instead
export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking right after the click can cancel the download before it starts
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
