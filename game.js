const {
  Engine, Render, Runner, Bodies,
  Body, Composite, Constraint, Events
} = Matter;

const W = 600;
const H = 440;

const engine = Engine.create({
  enableSleeping: true,
  positionIterations: 5,
  velocityIterations: 3,
  constraintIterations: 2
});
engine.gravity.y = 1;

const world = engine.world;

const render = Render.create({
  element: document.getElementById('machine'),
  engine,
  options: {
    width: W,
    height: H,
    wireframes: false,
    background: '#ffffff',
    pixelRatio: window.matchMedia('(pointer: coarse)').matches
      ? Math.min(window.devicePixelRatio || 1, 2)
      : (window.devicePixelRatio || 1),
    showSleeping: false
  }
});

const runner = Runner.create();

let gameReady = false;
let gameRunning = false;

function syncGamePerformance() {
  const coinOverlay =
    document.getElementById('coin-overlay');

  const rewardOverlay =
    document.getElementById('reward-overlay');

  const paused =
    !!coinOverlay ||
    !document.getElementById('collection-overlay').hidden ||
    rewardOverlay.classList.contains('active') ||
    document.hidden;

  if (!gameReady) return;

  if (paused && gameRunning) {
    Runner.stop(runner);
    Render.stop(render);
    gameRunning = false;
  } else if (!paused && !gameRunning) {
    runner.timeLastTick = null;
    runner.timeBuffer = 0;
    Runner.run(runner, engine);
    Render.run(render);
    gameRunning = true;
  }
}

document.addEventListener(
  'visibilitychange', syncGamePerformance
);

const wallOptions = {
  isStatic: true,
  render: { fillStyle: '#d5aa56' }
};

Composite.add(world, [
  Bodies.rectangle(300, 450, 620, 30, wallOptions),
  Bodies.rectangle(-10, 220, 20, 460, wallOptions),
  Bodies.rectangle(610, 220, 20, 460, wallOptions),
  Bodies.rectangle(110, 345, 12, 190, {
    ...wallOptions,
    render: { visible: false }
  })
]);

const colors = [
  '#efa9c3', '#b8a6e6', '#a5d4e9',
  '#f3d18b', '#a9d9bc', '#eeb49b'
];

let dolls = [];

const dollImages = new Map();

async function loadDollImages() {
  await Promise.all(
    DOLL_DATA.map(data => new Promise(resolve => {
      const img = new Image();

      img.onload = () => {
        dollImages.set(data.id, img);
        render.textures[data.image] = img;
        resolve();
      };

      img.onerror = () => {
        console.warn('이미지 로딩 실패:', data.image);
        resolve();
      };

      img.src = data.image;
    }))
  );
}
let attempts = 0;
let wins = 0;

let clawX = 300;
let clawY = 65;
let opening = 1;
let direction = 0;
let phase = 'idle';
let held = null;
let joint = null;
let dropAt = null;
let targetY = 350;
let selectedTarget = null;
let phaseTime = 0;

const status = document.getElementById('status');
const dropButton = document.getElementById('drop');

function say(message) {
  // 일반 안내 문구는 표시하지 않음
}

let getTimer = null;


const rewardImageCache = [];

for (const data of Object.values(REWARD_DATA)) {
  for (const src of [data.nametag, data.nameImage]) {
    if (!src) continue;
    const img = new Image();
    img.src = src;
    rewardImageCache.push(img);
  }
}

const rewardQueue = [];
let rewardShowing = false;
let rewardVoiceTimer = null;

function showGetEffect(doll) {
  const id = String(doll?.plugin?.dollId || '');
  const data = REWARD_DATA[id];

  if (!data) {
    console.warn('획득 데이터 없음:', id);
    return;
  }

  rewardQueue.push(data);

  if (!rewardShowing) {
    showNextReward();
  }
}

function showNextReward() {
  const data = rewardQueue.shift();

  if (!data) {
    rewardShowing = false;
    return;
  }

  rewardShowing = true;

  const overlay = document.getElementById('reward-overlay');
  const card = document.getElementById('reward-card');

  document.getElementById('reward-nametag').src =
    data.nametag;

  document.getElementById('reward-name').src =
    data.nameImage;

  overlay.classList.remove('active');
  void card.offsetWidth;
  overlay.classList.add('active');
  syncGamePerformance();

  clearTimeout(rewardVoiceTimer);

  GameVoice.stop();

  if (data.voice) {
    rewardVoiceTimer = setTimeout(() => {
      GameVoice.play(data.voice);
    }, 700);
  }
}

function closeReward() {
  if (!rewardShowing) return;

  clearTimeout(rewardVoiceTimer);

  GameVoice.stop();

  document.getElementById('reward-overlay')
    .classList.remove('active');

  rewardShowing = false;

  if (rewardQueue.length) {
    showNextReward();
  } else {
    syncGamePerformance();
  }
}

document.getElementById('reward-overlay')
  .addEventListener('click', closeReward);

window.addEventListener('keydown', event => {
  if (!rewardShowing) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  if (event.key === 'Escape') {
    closeReward();
  }
}, true);



function updateStats() {
  document.getElementById('attempts').textContent = attempts;
  document.getElementById('wins').textContent = wins;
}

let spawnGuard = null;
let spawnUntil = 0;

function createDolls() {
  if (spawnGuard) Composite.remove(world, spawnGuard);

  spawnGuard = Bodies.rectangle(110, 0, 12, 500, {
    isStatic: true,
    render: { visible: false }
  });

  Composite.add(world, spawnGuard);
  spawnUntil = engine.timing.timestamp + 5000;
  dropButton.disabled = true;
  const available = DOLL_DATA.filter(
    data => dollImages.has(data.id)
  );

  if (!available.length) {
    console.error('사용 가능한 인형 이미지가 없습니다.');
    return;
  }

  // 캐릭터 등장 순서 무작위 설정
  const shuffled = [...available];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] =
      [shuffled[j], shuffled[i]];
  }

  for (let i = 0; i < 28; i++) {
    const data = shuffled[i % shuffled.length];
    const img = dollImages.get(data.id);

    const x = 180 + Math.random() * 370;
    const y = 80 - Math.floor(i / 5) * 85;

    // 이미지 비율 유지
    const size = 68 + Math.random() * 12;
    const ratio = img.naturalWidth / img.naturalHeight;

    const width = ratio >= 1 ? size : size * ratio;
    const height = ratio >= 1 ? size / ratio : size;

    const doll = Bodies.rectangle(
      x, y, width * 0.9, height * 0.9,
      {
        chamfer: {
          radius: Math.min(width, height) * 0.22
        },
        restitution: 0.15,
        friction: 0.65,
        frictionAir: 0.015,
        density: 0.0015,
        angle: Math.random() * Math.PI * 2,
        label: 'doll',
        plugin: {
          dollId: data.id,
          dollImage: data.image
        },
        render: {
          sprite: {
            texture: data.image,
            xScale: width / img.naturalWidth,
            yScale: height / img.naturalHeight
          }
        }
      }
    );

    dolls.push(doll);
    Composite.add(world, doll);
  }
}


// 초기 인형은 이미지 로딩 완료 후 생성

function releaseDoll() {
  if (joint) Composite.remove(world, joint);
  joint = null;
  held = null;
}

function findTarget() {
  return dolls
    .filter(d =>
      d !== held &&
      d.position.x > 116 &&
      d.position.y >= 0 &&
      Math.abs(d.position.x - clawX) <= 55 &&
      d.bounds.min.x < clawX + 46 &&
      d.bounds.max.x > clawX - 46
    )
    .sort((a, b) => {
      const scoreA =
        a.bounds.min.y +
        Math.abs(a.position.x - clawX) * 0.45;

      const scoreB =
        b.bounds.min.y +
        Math.abs(b.position.x - clawX) * 0.45;

      return scoreA - scoreB;
    })[0];
}

function startDrop() {
  if (phase !== 'idle' || spawnGuard) return;

  direction = 0;
  attempts++;
  updateStats();

  selectedTarget = findTarget();

  targetY = selectedTarget
    ? Math.max(
        65,
        Math.min(357, selectedTarget.position.y - 48)
      )
    : 357;

  opening = 1;
  dropAt = null;
  phase = 'descending';
  dropButton.disabled = true;

  say('집게가 내려가는 중...');
}

function grabDoll() {
  const canGrab = d =>
    d &&
    dolls.includes(d) &&
    Math.abs(d.position.x - clawX) <= 55 &&
    Math.abs(d.position.y - (clawY + 48)) <= 55;

  const candidate = canGrab(selectedTarget)
    ? selectedTarget
    : dolls
        .filter(d => d.position.x > 116 && canGrab(d))
        .sort((a, b) =>
          Math.hypot(
            a.position.x - clawX,
            a.position.y - (clawY + 48)
          ) -
          Math.hypot(
            b.position.x - clawX,
            b.position.y - (clawY + 48)
          )
        )[0];

  selectedTarget = null;

  if (!candidate) {
    say('헛잡았다!');
    return;
  }

  const distance = Math.abs(
    candidate.position.x - clawX
  );

  if (
    distance > 55 ||
    Math.abs(candidate.position.y - (clawY + 48)) > 55
  ) {
    say('집게 범위에 인형이 없다!');
    return;
  }

  const accuracy = Math.max(0, 1 - distance / 55);

  held = candidate;
  Matter.Sleeping.set(held, false);

  // 인형 중심을 집게 내부에 연결
  joint = Constraint.create({
    pointA: {
      x: clawX,
      y: clawY + 48
    },
    bodyB: held,
    pointB: { x: 0, y: 0 },
    length: 0,
    stiffness: 0.25,
    damping: 0.2,
    render: { visible: false }
  });

  Composite.add(world, joint);

  // 잡는 것은 기본 성공.
  // 들어 올린 이후에 난이도 판정.
  const successChance = 0.10 + accuracy * 0.25;

  if (Math.random() < successChance) {
    dropAt = null;
  } else {
    const roll = Math.random();

    if (roll < 0.20) {
      dropAt = 'early';
    } else if (roll < 0.53) {
      dropAt = 'late';
    } else {
      dropAt = 'returning';
    }
  }

  say('인형을 잡았다!');
}

Events.on(engine, 'beforeUpdate', () => {
  const dt = Math.min(
    engine.timing.lastDelta / 16.667 || 1, 2
  );

  phaseTime += dt;

  if (spawnGuard &&
      engine.timing.timestamp >= spawnUntil) {
    Composite.remove(world, spawnGuard);
    spawnGuard = null;

    if (phase === 'idle') {
      dropButton.disabled = false;
      say('집게를 움직여 주세요.');
    }
  }

  if (phase === 'idle') {
    clawX += direction * 3.8 * dt;
    clawX = Math.max(45, Math.min(555, clawX));
  }

  else if (phase === 'descending') {
    if (selectedTarget && dolls.includes(selectedTarget)) {
      targetY = Math.max(
        65,
        Math.min(357, selectedTarget.position.y - 48)
      );
    }

    clawY += 3.5 * dt;

    if (clawY >= targetY) {
      clawY = targetY;
      phase = 'closing';
      phaseTime = 0;
    }
  }

  else if (phase === 'closing') {
    opening = Math.max(0, opening - 0.055 * dt);

    if (phaseTime > 24) {
      grabDoll();
      phase = 'ascending';
      phaseTime = 0;
    }
  }

  else if (phase === 'ascending') {
    clawY -= 2.5 * dt;

    if (
      held &&
      (
        (dropAt === 'early' && phaseTime > 20) ||
        (dropAt === 'late' && clawY < 105)
      )
    ) {
      releaseDoll();
      opening = 0.65;
      say('올라가다가 인형을 놓쳤다!');
    }

    if (clawY <= 65) {
      clawY = 65;
      phase = 'returning';
      phaseTime = 0;
    }
  }

  else if (phase === 'returning') {
    clawX = Math.max(55, clawX - 3 * dt);

    if (
      held &&
      dropAt === 'returning' &&
      phaseTime > 15 &&
      clawX > 150
    ) {
      releaseDoll();
      opening = 0.65;
      say('이동 중 인형이 떨어졌다!');
    }

    if (clawX <= 55) {
      releaseDoll();
      opening = 1;
      phase = 'waiting';
      phaseTime = 0;
    }
  }

  else if (phase === 'waiting') {
    if (phaseTime > 65) {
      phase = 'idle';
      dropButton.disabled = false;
      say('다시 도전해 주세요!');
    }
  }

  if (joint) {
    joint.pointA.x = clawX;
    joint.pointA.y = clawY + 48;
  }

  // 실제로 배출구 안에 떨어진 인형만 획득 처리
  for (let i = dolls.length - 1; i >= 0; i--) {
    const d = dolls[i];

    if (
      d !== held &&
      d.bounds.min.x >= -2 &&
      d.bounds.max.x <= 104 &&
      d.bounds.min.y >= 250 &&
      d.bounds.max.y >= 420
    ) {
      Composite.remove(world, d);
      dolls.splice(i, 1);
      wins++;
      recordCollection(d.plugin.dollId);
      updateStats();
      showGetEffect(d);
    }
  }
});

Events.on(render, 'afterRender', () => {
  const ctx = render.context;

  ctx.save();

  const scale = render.options.pixelRatio || 1;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // 금색 상단 레일
  const rail = ctx.createLinearGradient(0, 20, 0, 28);
  rail.addColorStop(0, '#fff1b7');
  rail.addColorStop(0.5, '#eab54d');
  rail.addColorStop(1, '#b67b25');

  ctx.fillStyle = rail;
  ctx.fillRect(20, 20, 560, 8);

  // 투명 아크릴 배출구
  ctx.save();

  // 반투명 아크릴 표면
  const acrylic = ctx.createLinearGradient(
    0, 250, 104, 250
  );

  acrylic.addColorStop(0, 'rgba(180, 215, 230, 0.30)');
  acrylic.addColorStop(0.25, 'rgba(255, 255, 255, 0.08)');
  acrylic.addColorStop(0.75, 'rgba(220, 238, 247, 0.12)');
  acrylic.addColorStop(1, 'rgba(160, 195, 215, 0.30)');

  ctx.fillStyle = acrylic;
  ctx.fillRect(0, 250, 104, 185);

  // 아크릴 외곽선
  ctx.strokeStyle = 'rgba(165, 190, 205, 0.65)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 251, 102, 183);

  // 금색 테두리
  const gold = ctx.createLinearGradient(0, 0, 104, 0);

  gold.addColorStop(0, '#d19a3c');
  gold.addColorStop(0.5, '#ffe7a8');
  gold.addColorStop(1, '#d19a3c');

  ctx.fillStyle = gold;
  ctx.fillRect(0, 250, 104, 5);

  // 얇은 황금색 세로 분리벽
  ctx.fillRect(107.5, 250, 5, 185);
  ctx.fillRect(0, 430, 104, 5);

  // 아크릴 빛 반사
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(8, 262);
  ctx.lineTo(8, 420);
  ctx.stroke();

  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(15, 262);
  ctx.lineTo(15, 345);
  ctx.stroke();

  ctx.restore();

  // 집게 와이어
  ctx.strokeStyle = '#626770';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(clawX, 28);
  ctx.lineTo(clawX, clawY);
  ctx.stroke();

  ctx.strokeStyle = '#e3e6ec';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(clawX - 1, 28);
  ctx.lineTo(clawX - 1, clawY);
  ctx.stroke();

  // 집게 본체 금속 광택
  const metal = ctx.createLinearGradient(
    clawX - 16, 0, clawX + 16, 0
  );

  metal.addColorStop(0, '#777e88');
  metal.addColorStop(0.25, '#dce1e8');
  metal.addColorStop(0.5, '#ffffff');
  metal.addColorStop(0.75, '#b9c0ca');
  metal.addColorStop(1, '#727984');

  ctx.fillStyle = metal;
  ctx.strokeStyle = '#777d86';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.roundRect(clawX - 13, clawY, 26, 16, 4);
  ctx.fill();
  ctx.stroke();

  // 기존 집게 팔의 위치와 움직임 유지
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(clawX + side * 9, clawY + 14);

    ctx.lineTo(
      clawX + side * (34 + opening * 12),
      clawY + 38
    );

    ctx.lineTo(
      clawX + side * (34 + opening * 12),
      clawY + 65
    );

    ctx.lineTo(
      clawX + side * (19 + opening * 22),
      clawY + 78
    );

    ctx.strokeStyle = '#777d86';
    ctx.lineWidth = 9;
    ctx.stroke();

    ctx.strokeStyle = '#cbd1da';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.strokeStyle = '#f3f5f8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 집게 관절
    ctx.beginPath();
    ctx.arc(
      clawX + side * 9,
      clawY + 14,
      3.5, 0, Math.PI * 2
    );
    ctx.fillStyle = '#edc56d';
    ctx.fill();
    ctx.strokeStyle = '#a5823e';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
});

function bindDirection(id, value) {
  const button = document.getElementById(id);

  button.addEventListener('pointerdown', e => {
    button.setPointerCapture(e.pointerId);
    if (phase === 'idle') direction = value;
  });

  ['pointerup', 'pointercancel', 'lostpointercapture']
    .forEach(event => {
      button.addEventListener(event, () => {
        direction = 0;
      });
    });
}

bindDirection('left', -1);
bindDirection('right', 1);

dropButton.addEventListener('click', startDrop);

window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }

  if (phase === 'idle') {
    if (e.code === 'ArrowLeft') direction = -1;
    if (e.code === 'ArrowRight') direction = 1;
    if (e.code === 'Space' && !e.repeat) startDrop();
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' && direction === -1) {
    direction = 0;
  }
  if (e.code === 'ArrowRight' && direction === 1) {
    direction = 0;
  }
});

window.addEventListener('blur', () => {
  direction = 0;
});

document.getElementById('reset').onclick = () => {
  resetCollection();
  clearTimeout(getTimer);
  document.getElementById('get-effect').classList.remove('show');
  releaseDoll();

  dolls.forEach(d => Composite.remove(world, d));
  dolls = [];

  attempts = 0;
  wins = 0;
  clawX = 300;
  clawY = 65;
  opening = 1;
  direction = 0;
  phase = 'idle';
  phaseTime = 0;
  dropAt = null;

  dropButton.disabled = false;

  createDolls();
  updateStats();
  say('인형을 재배치했습니다.');
};

dropButton.disabled = true;

loadDollImages().then(() => {
  createDolls();
  gameReady = true;
  Render.world(render);
  syncGamePerformance();
});


/* 모바일 터치 및 화면 전환 대응 */

document.addEventListener('visibilitychange', () => {
  if (document.hidden) direction = 0;
});

window.addEventListener('pagehide', () => {
  direction = 0;
});

document.addEventListener('contextmenu', e => {
  if (
    e.target.closest(
      '.machine-wrap, .controls, .game-menu, ' +
      '#coin-overlay, #reward-overlay, #collection-overlay'
    )
  ) {
    e.preventDefault();
  }
});
