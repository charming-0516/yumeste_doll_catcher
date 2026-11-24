(() => {
  const overlay = document.getElementById("coin-overlay");
  const panel = document.getElementById("coin-panel");
  const coin = document.getElementById("insert-coin");

  let coinInserted = false;

  function blockGameKeys(e) {
    if (!coinInserted) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }

  window.addEventListener("keydown", blockGameKeys, true);
  window.addEventListener("keyup", blockGameKeys, true);

  coin.addEventListener("click", () => {
    if (panel.classList.contains("inserting")) return;

    panel.classList.add("inserting");
    coin.disabled = true;

    setTimeout(() => {
      panel.classList.add("inserted");
    }, 850);

    setTimeout(() => {
      overlay.classList.add("finished");
    }, 1350);

    setTimeout(() => {
      overlay.remove();
      syncGamePerformance();
      coinInserted = true;

      window.removeEventListener(
        "keydown", blockGameKeys, true
      );
      window.removeEventListener(
        "keyup", blockGameKeys, true
      );
    }, 1850);
  });
})();
