let collectionData = {};

// 이전 영구 저장 기록 제거
try {
  localStorage.removeItem("yumeste_doll_collection_v1");
} catch (error) {
  console.warn(error);
}

function recordCollection(id) {
  id = String(id);

  if (!DOLL_DATA.some(d => String(d.id) === id)) return;

  collectionData[id] = (collectionData[id] || 0) + 1;
}

function resetCollection() {
  collectionData = {};
}

function renderCollection() {
  const grid = document.getElementById("collection-grid");
  grid.replaceChildren();

  let unlocked = 0;

  for (const doll of DOLL_DATA) {
    const id = String(doll.id);
    const count = collectionData[id] || 0;
    const reward = REWARD_DATA[id];

    if (count > 0) unlocked++;

    const item = document.createElement("div");
    item.className =
      "collection-item" + (count ? "" : " locked");

    const img = document.createElement("img");
    img.className = "collection-doll";
    img.src = doll.image;
    img.alt = count ? (reward?.name || "") : "???";
    img.draggable = false;
    item.appendChild(img);

    if (count && reward?.nameImage) {
      const name = document.createElement("img");
      name.className = "collection-name";
      name.src = reward.nameImage;
      name.alt = reward.name;
      item.appendChild(name);
    } else {
      const unknown = document.createElement("div");
      unknown.className = "collection-unknown";
      unknown.textContent = "???";
      item.appendChild(unknown);
    }

    const label = document.createElement("div");
    label.className = "collection-count";
    label.textContent = count ? "× " + count : "未獲得";

    item.appendChild(label);
    grid.appendChild(item);
  }

  document.getElementById(
    "collection-progress-text"
  ).textContent = unlocked + " / " + DOLL_DATA.length;

  document.getElementById(
    "collection-progress-bar"
  ).style.width =
    (unlocked / DOLL_DATA.length * 100) + "%";


}

const collectionOverlay =
  document.getElementById("collection-overlay");

function openCollection() {
  if (document.getElementById("coin-overlay")) return;
  if (rewardShowing) return;

  direction = 0;
  renderCollection();
  collectionOverlay.hidden = false;
  syncGamePerformance();
}

function closeCollection() {
  collectionOverlay.hidden = true;
  direction = 0;
  syncGamePerformance();
}

document.getElementById("collection-open")
  .addEventListener("click", openCollection);

document.getElementById("collection-close")
  .addEventListener("click", closeCollection);

collectionOverlay.addEventListener("click", e => {
  if (e.target === collectionOverlay) closeCollection();
});

window.addEventListener("keydown", e => {
  if (collectionOverlay.hidden) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  if (e.key === "Escape") closeCollection();
}, true);

window.addEventListener("keyup", e => {
  if (collectionOverlay.hidden) return;

  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
