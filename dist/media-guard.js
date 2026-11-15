function suppressImageAction(event) {
  const target = event.target;
  if (target.matches?.("img") || target.closest?.("a")?.querySelector("img")) {
    event.preventDefault();
  }
}

document.addEventListener("dragstart", suppressImageAction);
document.addEventListener("contextmenu", suppressImageAction);
