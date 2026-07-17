(() => {
  const fallback = document.querySelector('#fallback');
  const scoreValue = document.querySelector('#score-value');
  const aiScoreValue = document.querySelector('#ai-score-value');
  const pocketedValue = document.querySelector('#pocketed-value');
  const turnValue = document.querySelector('#turn-value');
  const gameModal = document.querySelector('#game-modal');
  const modalEyebrow = document.querySelector('#modal-eyebrow');
  const modalTitle = document.querySelector('#modal-title');
  const modalMessage = document.querySelector('#modal-message');
  const modalScore = document.querySelector('#modal-score');
  const modalRetry = document.querySelector('#modal-retry');
  const modalConfetti = document.querySelector('#modal-confetti');

  if (!window.PIXI || !window.gsap) {
    fallback.textContent = 'Unable to load PixiJS or GSAP. Check your connection and refresh.';
    return;
  }

  const app = new PIXI.Application();
  const objects = [];
  const holes = [];
  const floatTexts = [];
  const particles = [];
  const collisionFx = [];
  let lastHardHitShake = 0;
  const mouse = { x: -1000, y: -1000 };
  let W = innerWidth;
  let H = innerHeight;
  let aim = null;
  let lastTime = performance.now();
  let ballRadius = 28;
  let playerScore = 0;
  let aiScore = 0;
  let pocketedCount = 0;
  let gameState = 'playing';
  let turn = 'player';
  let ballsMoving = false;
  let shotOwner = 'player';
  const SCRATCH_PENALTY = 75;
  const MAX_SHOT_POWER = 34;
  const AIM_POWER_SCALE = .16;
  const TOTAL_TARGETS = 15;
  const BLACK_BALL_INDEX = 8;
  const PLAYER_CUE_INDEX = 0;
  let AI_CUE_INDEX = 16;

  const ai = {
    thinking: false,
    aimLine: null,
  };

  const playerAim = new PIXI.Graphics();
  let aimPulse = 0;

  const palette = {
    ink: 0x071019,
    cream: 0xf3efe2,
    blue: 0x8bd8ee,
    coral: 0xff795f,
    lime: 0xc8f46d,
    steel: 0x3d5668,
    gold: 0xf4d03f,
  };

  const stage = new PIXI.Container();
  const background = new PIXI.Graphics();
  const world = new PIXI.Container();
  const holeLayer = new PIXI.Container();
  const trails = new PIXI.Graphics();
  const objectLayer = new PIXI.Container();
  const fxLayer = new PIXI.Container();
  const ui = new PIXI.Container();
  const cursor = new PIXI.Graphics();
  let holeRadius = 34;

  const mono = (size, fill = palette.cream) => ({
    fontFamily: 'DM Mono, monospace', fontSize: size, fontWeight: '500', fill,
    letterSpacing: 1.6,
  });
  const sans = (size, weight = '700', fill = palette.cream) => ({
    fontFamily: 'Manrope, sans-serif', fontSize: size, fontWeight: weight, fill,
  });

  async function init() {
    await app.init({
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(devicePixelRatio, 2),
      background: palette.ink,
    });
    document.querySelector('#app').appendChild(app.canvas);
    fallback.hidden = true;
    app.stage.addChild(stage);
    stage.addChild(background, world, ui, cursor);
    world.addChild(holeLayer, trails, objectLayer, fxLayer);
    fxLayer.addChild(playerAim);

    buildObjects();
    buildHoles();
    buildUI();
    resize();
    intro();

    app.canvas.addEventListener('pointermove', onPointerMove);
    app.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', resize);
    modalRetry.addEventListener('click', resetGame);
    app.ticker.add(tick);
  }

  function makeOrb(config) {
    const c = new PIXI.Container();
    const g = new PIXI.Graphics();
    const avatar = new PIXI.Sprite();
    const avatarMask = new PIXI.Graphics();
    avatar.anchor.set(.5);
    avatar.visible = false;
    avatar.mask = avatarMask;

    c.addChild(g, avatar, avatarMask);
    c.eventMode = 'none';
    c.cursor = 'default';
    c.hitArea = new PIXI.Circle(0, 0, config.radius + 12);
    c.x = config.x;
    c.y = config.y;
    c.alpha = 0;
    c.scale.set(.35);
    c.data = {
      ...config,
      vx: 0,
      vy: 0,
      history: [],
      baseScale: 1,
      g,
      avatar,
      avatarMask,
      active: true,
      pocketing: false,
      lastHitBy: null,
    };
    redrawOrb(c);
    objectLayer.addChild(c);
    objects.push(c);
    return c;
  }

  function buildObjects() {
    const targetColors = [
      0xf4d03f, 0x3498db, 0xe74c3c, 0x8e44ad, 0xf39c12, 0x27ae60, 0x922b21,
      0x111820, 0xf1c40f, 0x2980b9, 0xc0392b, 0x7d3c98, 0xd35400, 0x229954, 0x641e16,
    ];

    makeOrb({
      name: 'Your cue',
      color: palette.cream,
      radius: ballRadius,
      x: W * .25,
      y: H * .5,
      isCue: true,
      isPlayerCue: true,
      owner: 'player',
      index: PLAYER_CUE_INDEX,
    });

    targetColors.forEach((color, i) => {
      const index = i + 1;
      makeOrb({
        name: index === BLACK_BALL_INDEX ? 'Black ball' : `Ball ${index}`,
        color,
        radius: ballRadius,
        x: W * .7,
        y: H * .5,
        isCue: false,
        isBlack: index === BLACK_BALL_INDEX,
        index,
      });
    });

    makeOrb({
      name: 'AI cue',
      color: palette.coral,
      radius: ballRadius,
      x: W * .75,
      y: H * .5,
      isCue: true,
      isAiCue: true,
      owner: 'ai',
      index: AI_CUE_INDEX,
    });

    buildOrbEditor();
  }

  function redrawOrb(o) {
    const { g, avatar, avatarMask } = o.data;
    const r = o.data.radius;
    g.clear()
      .circle(0, 0, r + 6).fill({ color: palette.ink })
      .stroke({ color: o.data.color, width: 1, alpha: .35 })
      .circle(0, 0, r).fill(o.data.color);

    if (o.data.isBlack) {
      g.circle(0, 0, r * .22).fill({ color: palette.cream, alpha: .85 });
    }

    if (o.data.isAiCue) {
      g.circle(0, 0, r * .28).fill({ color: palette.blue, alpha: .9 });
    }

    if (o.data.isPlayerCue) {
      g.circle(0, 0, r * .2).fill({ color: palette.lime, alpha: .75 });
    }

    avatarMask.clear().circle(0, 0, Math.max(1, r - 4)).fill(0xffffff);
    if (avatar.visible) {
      const sourceWidth = avatar.texture.width || 1;
      const sourceHeight = avatar.texture.height || 1;
      avatar.scale.set((r * 2) / Math.min(sourceWidth, sourceHeight));
    }
    o.hitArea = new PIXI.Circle(0, 0, r + 12);
    o.x = Math.max(r, Math.min(W - r, o.x));
    o.y = Math.max(r, Math.min(H - r, o.y));
  }

  function buildHoles() {
    holeLayer.removeChildren();
    holes.length = 0;
    const margin = ballRadius * 2.4;
    const positions = [
      { key: 'left-top', x: margin, y: margin },
      { key: 'top-center', x: W * .5, y: margin },
      { key: 'right-top', x: W - margin, y: margin },
      { key: 'left-bottom', x: margin, y: H - margin },
      { key: 'bottom-center', x: W * .5, y: H - margin },
      { key: 'right-bottom', x: W - margin, y: H - margin },
    ];

    positions.forEach((pos) => {
      const hole = new PIXI.Container();
      hole.x = pos.x;
      hole.y = pos.y;
      const rim = new PIXI.Graphics();
      const glow = new PIXI.Graphics();
      hole.addChild(glow, rim);
      hole.data = { ...pos, rim, glow, pulse: Math.random() * Math.PI * 2 };
      drawHoleGraphic(hole);
      holeLayer.addChild(hole);
      holes.push(hole);
    });
  }

  function drawHoleGraphic(hole) {
    const { rim, glow } = hole.data;
    const r = holeRadius;
    glow.clear()
      .circle(0, 0, r + 16)
      .fill({ color: palette.blue, alpha: .06 });
    rim.clear()
      .circle(0, 0, r + 5)
      .stroke({ color: palette.steel, width: 2, alpha: .55 })
      .circle(0, 0, r)
      .fill({ color: 0x02060a, alpha: .95 })
      .circle(0, 0, r - 3)
      .stroke({ color: palette.cream, width: 1, alpha: .12 });
  }

  function buildOrbEditor() {
    const settings = document.querySelector('#orb-settings');
    const editor = document.querySelector('.orb-editor');
    const toggle = document.querySelector('.orb-editor__toggle');
    toggle.addEventListener('click', () => {
      const collapsed = editor.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.querySelector('b').textContent = collapsed ? '+' : '−';
    });

    const sizeControl = document.createElement('section');
    sizeControl.className = 'orb-row orb-size';
    sizeControl.innerHTML = `<div class="orb-size__heading"><span>All ball sizes</span><output>${ballRadius * 2}px</output></div>
      <input type="range" min="16" max="52" value="${ballRadius}" aria-label="Size of all balls">`;
    const sizeInput = sizeControl.querySelector('input');
    const sizeOutput = sizeControl.querySelector('output');
    sizeInput.addEventListener('input', () => {
      ballRadius = Number(sizeInput.value);
      holeRadius = ballRadius + 6;
      sizeOutput.textContent = `${ballRadius * 2}px`;
      objects.forEach(o => { o.data.radius = ballRadius; redrawOrb(o); });
      buildHoles();
      arrangeBalls();
    });
    settings.appendChild(sizeControl);

    objects.forEach((o, index) => {
      const row = document.createElement('section');
      row.className = 'orb-row';
      row.innerHTML = `<div class="orb-row__heading"><span class="orb-row__swatch"></span>${o.data.name}</div>
        <div class="orb-row__fields">
          <div class="orb-row__avatar"><input id="avatar-${index}" type="file" accept="image/*"><label for="avatar-${index}">+ Add custom background</label></div>
        </div>`;
      row.querySelector('.orb-row__swatch').style.background = `#${o.data.color.toString(16).padStart(6, '0')}`;
      const fileInput = row.querySelector('input[type="file"]');
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
          o.data.avatar.texture = PIXI.Texture.from(image);
          o.data.avatar.visible = true;
          redrawOrb(o);
          row.querySelector('.orb-row__avatar label').textContent = `Change background: ${file.name}`;
          URL.revokeObjectURL(url);
        };
        image.onerror = () => URL.revokeObjectURL(url);
        image.src = url;
      });
      settings.appendChild(row);
    });
  }

  function buildUI() {
    const brand = new PIXI.Text({ text: 'ORBIT / DUEL', style: mono(13) });
    brand.name = 'brand';
    ui.addChild(brand);

    const title = new PIXI.Text({ text: 'RIVAL\nPOCKET', style: sans(74, '800') });
    title.name = 'title';
    title.style.leading = -5;
    ui.addChild(title);

    const copy = new PIXI.Text({
      text: 'TURN-BASED DUEL VS AI.\nDRAW AIM & POWER. BLACK BALL LAST.',
      style: mono(12, 0xaec0cb),
    });
    copy.name = 'copy';
    copy.style.lineHeight = 21;
    ui.addChild(copy);

    for (const child of ui.children) {
      child.alpha = 0;
      child.y += 18;
    }
  }

  function updateHud() {
    scoreValue.textContent = String(playerScore);
    aiScoreValue.textContent = String(aiScore);
    const left = remainingTargets();
    pocketedValue.textContent = `${left} / ${TOTAL_TARGETS}`;
    if (turnValue) {
      if (gameState !== 'playing') turnValue.textContent = '—';
      else if (ballsMoving) turnValue.textContent = 'Rolling…';
      else if (turn === 'player') turnValue.textContent = 'Your turn';
      else turnValue.textContent = 'AI turn';
    }
  }

  function getPlayerCue() {
    return objects[PLAYER_CUE_INDEX];
  }

  function getAiCue() {
    return objects[AI_CUE_INDEX];
  }

  function drawBackground() {
    background.clear();
    background.rect(0, 0, W, H).fill(palette.ink);

    const grid = Math.max(54, Math.min(78, W / 18));
    for (let x = 0; x <= W; x += grid) {
      background.moveTo(x, 0).lineTo(x, H).stroke({ color: palette.steel, width: 1, alpha: .18 });
    }
    for (let y = 0; y <= H; y += grid) {
      background.moveTo(0, y).lineTo(W, y).stroke({ color: palette.steel, width: 1, alpha: .18 });
    }

    const playX = W * .62;
    const playY = H * .5;
    background.circle(playX, playY, Math.min(W, H) * .24)
      .stroke({ color: palette.blue, width: 1, alpha: .11 });
    background.circle(playX, playY, Math.min(W, H) * .17)
      .stroke({ color: palette.cream, width: 1, alpha: .08 });
    background.circle(playX, playY, 4).fill({ color: palette.cream, alpha: .45 });
  }

  function resize() {
    W = innerWidth;
    H = innerHeight;
    drawBackground();
    buildHoles();
    const compact = W < 720;
    const title = ui.getChildByName('title');
    const brand = ui.getChildByName('brand');
    const copy = ui.getChildByName('copy');
    brand.position.set(compact ? 24 : 54, 32);
    title.style.fontSize = compact ? Math.min(50, W * .12) : Math.min(82, W * .065);
    title.position.set(compact ? 24 : 54, compact ? 90 : H * .24);
    copy.position.set(compact ? 26 : 58, compact ? 215 : H * .52);

    if (gameState === 'playing' && !ballsMoving) arrangeBalls();
  }

  function arrangeBalls() {
    const compact = W < 720;
    const gap = Math.max(2, ballRadius * .1);
    const diameter = ballRadius * 2 + gap;
    const rowStep = diameter * .87;
    const rackCenterX = W * .5;
    const rackCenterY = compact ? H * .58 : H * .5;

    const playerCue = getPlayerCue();
    if (playerCue?.data.active) {
      playerCue.position.set(compact ? W * .18 : W * .28, rackCenterY);
      playerCue.data.vx = playerCue.data.vy = 0;
    }

    const aiCue = getAiCue();
    if (aiCue?.data.active) {
      aiCue.position.set(compact ? W * .82 : W * .72, rackCenterY);
      aiCue.data.vx = aiCue.data.vy = 0;
    }

    const rackBalls = objects.filter(o => !o.data.isCue && o.data.active);
    let index = 0;
    for (let row = 0; row < 5 && index < rackBalls.length; row++) {
      const x = rackCenterX - rowStep * 2 + row * rowStep;
      for (let slot = 0; slot <= row && index < rackBalls.length; slot++) {
        const y = rackCenterY + (slot - row / 2) * diameter;
        rackBalls[index].position.set(x, y);
        rackBalls[index].data.vx = rackBalls[index].data.vy = 0;
        rackBalls[index].data.lastHitBy = null;
        index++;
      }
    }

    objects.forEach(o => {
      if (!o.data.active) return;
      const r = o.data.radius;
      o.x = Math.max(r + 4, Math.min(W - r - 4, o.x));
      o.y = Math.max(r + 4, Math.min(H - r - 4, o.y));
      o.data.history.length = 0;
    });
  }

  function intro() {
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .to(ui.children, { alpha: 1, y: '-=18', duration: .8, stagger: .08 })
      .to(objects.filter(o => o.data.active), { alpha: 1, duration: .5, stagger: .1 }, '-=.45')
      .to(objects.filter(o => o.data.active).map(o => o.scale), {
        x: 1, y: 1, duration: .75, stagger: .1, ease: 'back.out(1.7)',
      }, '<');
    turn = 'player';
    ballsMoving = false;
    shotOwner = 'player';
    updateHud();
  }

  function getPoint(e) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
  }

  function canPlayerAim() {
    const cue = getPlayerCue();
    return gameState === 'playing'
      && turn === 'player'
      && !ballsMoving
      && !aim
      && cue?.data.active
      && !cue.data.pocketing;
  }

  function onPointerDown(e) {
    if (!canPlayerAim()) return;
    const p = getPoint(e);
    aim = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    drawPlayerAim();
  }

  function onPointerMove(e) {
    const p = getPoint(e);
    mouse.x = p.x;
    mouse.y = p.y;
    if (!aim) return;
    aim.x1 = p.x;
    aim.y1 = p.y;
    drawPlayerAim();
  }

  function onPointerUp() {
    if (!aim) return;
    const cue = getPlayerCue();
    const dx = aim.x1 - aim.x0;
    const dy = aim.y1 - aim.y0;
    const dist = Math.hypot(dx, dy);
    aim = null;
    playerAim.clear();

    if (dist < 14) return;

    const power = Math.min(MAX_SHOT_POWER, dist * AIM_POWER_SCALE);
    const angle = Math.atan2(-dy, -dx);
    cue.data.vx = Math.cos(angle) * power;
    cue.data.vy = Math.sin(angle) * power;
    shotOwner = 'player';
    ballsMoving = true;
    updateHud();

    burstParticles(cue.x, cue.y, palette.lime);
    gsap.fromTo(cue.scale, { x: 1.1, y: 1.1 }, { x: 1, y: 1, duration: .28, ease: 'power2.out' });
  }

  function strokeLine(x1, y1, x2, y2, style) {
    playerAim.moveTo(x1, y1).lineTo(x2, y2).stroke(style);
  }

  function strokeCircle(x, y, r, style) {
    playerAim.moveTo(x, y);
    playerAim.circle(x, y, r).stroke(style);
  }

  function fillCircle(x, y, r, style) {
    playerAim.moveTo(x, y);
    playerAim.circle(x, y, r).fill(style);
  }

  function drawPlayerAim() {
    playerAim.clear();
    if (!aim) return;

    const cue = getPlayerCue();
    if (!cue?.data.active) return;

    const dragX = aim.x1 - aim.x0;
    const dragY = aim.y1 - aim.y0;
    const dragDist = Math.hypot(dragX, dragY);
    if (dragDist < 4) return;

    const dragNx = dragX / dragDist;
    const dragNy = dragY / dragDist;
    const shotNx = -dragNx;
    const shotNy = -dragNy;
    const power = Math.min(MAX_SHOT_POWER, dragDist * AIM_POWER_SCALE);
    const powerRatio = power / MAX_SHOT_POWER;
    const pulse = .5 + Math.sin(aimPulse) * .5;
    const shotLen = 48 + power * 6.8;
    const shotEndX = cue.x + shotNx * shotLen;
    const shotEndY = cue.y + shotNy * shotLen;

    strokeCircle(cue.x, cue.y, cue.data.radius + 10 + powerRatio * 18, {
      color: palette.blue, width: 1, alpha: .08 + powerRatio * .12,
    });
    strokeCircle(cue.x, cue.y, cue.data.radius + 6 + powerRatio * 10, {
      color: palette.lime, width: 2, alpha: .15 + pulse * .2,
    });

    const dragSegments = 10;
    for (let i = 0; i < dragSegments; i++) {
      const t0 = i / dragSegments;
      const t1 = (i + .55) / dragSegments;
      strokeLine(
        aim.x0 + dragX * t0, aim.y0 + dragY * t0,
        aim.x0 + dragX * t1, aim.y0 + dragY * t1,
        { color: palette.coral, width: 2, alpha: .22 + (1 - t0) * .35 },
      );
    }
    fillCircle(aim.x0, aim.y0, 5, { color: palette.cream, alpha: .5 });
    fillCircle(aim.x1, aim.y1, 6 + pulse * 1.5, { color: palette.coral, alpha: .4 });

    [
      { width: 12, alpha: .07 + powerRatio * .05, color: palette.blue },
      { width: 6, alpha: .18 + powerRatio * .1, color: palette.lime },
      { width: 2, alpha: .55 + powerRatio * .2, color: palette.cream },
    ].forEach(layer => {
      strokeLine(cue.x, cue.y, shotEndX, shotEndY, {
        color: layer.color, width: layer.width, alpha: layer.alpha,
      });
    });

    const tickCount = 5 + Math.floor(powerRatio * 6);
    for (let i = 1; i <= tickCount; i++) {
      const t = i / (tickCount + 1);
      const tx = cue.x + shotNx * shotLen * t;
      const ty = cue.y + shotNy * shotLen * t;
      const size = 3 + powerRatio * 3;
      strokeLine(
        tx - shotNy * size, ty + shotNx * size,
        tx + shotNy * size, ty - shotNx * size,
        { color: palette.lime, width: 1.5, alpha: .25 + t * .45 },
      );
    }

    const head = 14 + powerRatio * 8;
    const wing = 7 + powerRatio * 4;
    const hx = shotEndX - shotNx * head;
    const hy = shotEndY - shotNy * head;
    playerAim.moveTo(shotEndX, shotEndY);
    playerAim.lineTo(hx - shotNy * wing, hy + shotNx * wing);
    playerAim.lineTo(hx + shotNy * wing, hy - shotNx * wing);
    playerAim.closePath();
    playerAim.stroke({ color: palette.lime, width: 2, alpha: .8 });

    fillCircle(shotEndX, shotEndY, 4 + pulse * 1.2, { color: palette.lime, alpha: .75 });
  }

  function isTableSettled() {
    if (objects.some(o => o.data.isCue && o.data.pocketing)) return false;
    const moving = activeObjects();
    if (!moving.length) return false;
    return moving.every(o => Math.hypot(o.data.vx, o.data.vy) < .32);
  }

  function handleTurnTransition() {
    if (!ballsMoving || !isTableSettled()) return;
    ballsMoving = false;

    if (gameState !== 'playing') return;

    if (turn === 'player') {
      turn = 'ai';
      updateHud();
      beginAiTurn();
    } else {
      turn = 'player';
      updateHud();
      showScorePopup(getPlayerCue().x, getPlayerCue().y - 42, 'YOUR TURN', palette.lime);
    }
  }

  function activeObjects() {
    return objects.filter(o => o.data.active && !o.data.pocketing);
  }

  function targetBalls() {
    return activeObjects().filter(o => !o.data.isCue);
  }

  function remainingTargets() {
    return objects.filter(o => o.data.active && !o.data.isCue).length;
  }

  function remainingNonBlack() {
    return objects.filter(o => o.data.active && !o.data.isCue && !o.data.isBlack).length;
  }

  function canPocketBlack() {
    return remainingNonBlack() === 0;
  }

  function isNearHole(ball) {
    return holes.some(h => Math.hypot(ball.x - h.x, ball.y - h.y) < holeRadius + ball.data.radius * .6);
  }

  function distPointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < .001) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function lineBlocked(x1, y1, x2, y2, ignore = []) {
    const pad = ballRadius * .85;
    return activeObjects().some((o) => {
      if (ignore.includes(o)) return false;
      return distPointToSegment(o.x, o.y, x1, y1, x2, y2) < o.data.radius + pad;
    });
  }

  function scoreShot(cue, target, hole) {
    const r = ballRadius;
    const dx = target.x - cue.x;
    const dy = target.y - cue.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const gx = target.x - nx * (r * 2.05);
    const gy = target.y - ny * (r * 2.05);

    if (lineBlocked(cue.x, cue.y, gx, gy, [cue, target])) return -1;

    const hdx = hole.x - target.x;
    const hdy = hole.y - target.y;
    const hdist = Math.hypot(hdx, hdy) || 1;
    const tnx = hdx / hdist;
    const tny = hdy / hdist;
    const cutDot = nx * tnx + ny * tny;

    if (cutDot < .12) return -1;
    if (lineBlocked(target.x, target.y, hole.x, hole.y, [cue, target])) return -1;

    let score = 95 * cutDot + 70 / (1 + dist * .008) + 55 / (1 + hdist * .01);
    score += (holeRadius / Math.max(hdist, 1)) * 10;

    if (target.data.isBlack) {
      if (!canPocketBlack()) return -9999;
      score += 220;
    } else if (remainingNonBlack() <= 3) {
      score += 35;
    }

    if (target.data.lastHitBy === 'ai' && cue.data.isAiCue) score += 8;
    if (target.data.lastHitBy === 'player' && cue.data.isPlayerCue) score += 8;

    return score;
  }

  function pickAiShot() {
    const aiCue = getAiCue();
    if (!aiCue?.data.active) return null;

    let best = null;
    let bestScore = -1;

    for (const target of targetBalls()) {
      if (target.data.isBlack && !canPocketBlack()) continue;
      for (const hole of holes) {
        const shotScore = scoreShot(aiCue, target, hole);
        if (shotScore > bestScore) {
          bestScore = shotScore;
          best = { target, hole, score: shotScore };
        }
      }
    }

    if (best && bestScore > 25) return best;

    const fallbackTarget = targetBalls()
      .filter(t => !t.data.isBlack || canPocketBlack())
      .sort((a, b) => {
        const da = Math.hypot(a.x - aiCue.x, a.y - aiCue.y);
        const db = Math.hypot(b.x - aiCue.x, b.y - aiCue.y);
        return da - db;
      })[0];

    if (!fallbackTarget) return null;
    const nearestHole = holes.reduce((a, b) => (
      Math.hypot(fallbackTarget.x - a.x, fallbackTarget.y - a.y)
      < Math.hypot(fallbackTarget.x - b.x, fallbackTarget.y - b.y) ? a : b
    ));
    return { target: fallbackTarget, hole: nearestHole, score: 20 };
  }

  function showAiAimLine(cue, target) {
    if (ai.aimLine) {
      fxLayer.removeChild(ai.aimLine);
      ai.aimLine.destroy();
    }
    const line = new PIXI.Graphics();
    line.moveTo(cue.x, cue.y)
      .lineTo(target.x, target.y)
      .stroke({ color: palette.coral, width: 2, alpha: .55 });
    line.circle(target.x, target.y, 6)
      .stroke({ color: palette.blue, width: 1, alpha: .8 });
    fxLayer.addChild(line);
    ai.aimLine = line;
    gsap.to(line, {
      alpha: 0,
      duration: .45,
      delay: .3,
      onComplete: () => {
        if (ai.aimLine === line) {
          fxLayer.removeChild(line);
          line.destroy();
          ai.aimLine = null;
        }
      },
    });
  }

  function executeAiShot(shot) {
    const aiCue = getAiCue();
    const { target } = shot;
    const dx = target.x - aiCue.x;
    const dy = target.y - aiCue.y;
    const dist = Math.hypot(dx, dy) || 1;
    const power = Math.min(32, 14 + dist * .045 + shot.score * .04);
    const angle = Math.atan2(dy, dx) + (Math.random() - .5) * .035;

    aiCue.data.vx = Math.cos(angle) * power;
    aiCue.data.vy = Math.sin(angle) * power;
    shotOwner = 'ai';
    gsap.fromTo(aiCue.scale, { x: 1.14, y: 1.14 }, { x: 1, y: 1, duration: .3, ease: 'power2.out' });
  }

  function beginAiTurn() {
    if (gameState !== 'playing' || ai.thinking || turn !== 'ai' || ballsMoving) return;

    const aiCue = getAiCue();
    if (!aiCue?.data.active || aiCue.data.pocketing) {
      turn = 'player';
      updateHud();
      return;
    }

    const shot = pickAiShot();
    if (!shot) {
      turn = 'player';
      updateHud();
      return;
    }

    ai.thinking = true;
    showAiAimLine(aiCue, shot.target);

    gsap.delayedCall(.55 + Math.random() * .35, () => {
      if (gameState !== 'playing' || turn !== 'ai') {
        ai.thinking = false;
        return;
      }
      executeAiShot(shot);
      ballsMoving = true;
      ai.thinking = false;
      updateHud();
    });
  }

  function checkHoles() {
    if (gameState !== 'playing') return;

    activeObjects().forEach((ball) => {
      holes.forEach((hole) => {
        const d = Math.hypot(ball.x - hole.x, ball.y - hole.y);
        const captureRadius = holeRadius - ball.data.radius * .2;
        if (d <= captureRadius) pocketBall(ball, hole);
      });
    });
  }

  function pocketBall(ball, hole) {
    if (ball.data.pocketing || gameState !== 'playing') return;
    ball.data.pocketing = true;
    ball.data.vx = ball.data.vy = 0;
    if (aim) {
      aim = null;
      playerAim.clear();
    }

    const isCue = ball.data.isCue;
    const isBlack = ball.data.isBlack;
    const remainingBefore = remainingTargets();
    const owner = ball.data.isPlayerCue ? 'player' : ball.data.isAiCue ? 'ai' : shotOwner;

    gsap.timeline()
      .to(ball, { x: hole.x, y: hole.y, duration: .42, ease: 'power2.in' })
      .to(ball.scale, { x: 0.15, y: 0.15, duration: .42, ease: 'power2.in' }, '<')
      .to(ball, { alpha: 0, duration: .12 });

    pulseHole(hole, isBlack ? palette.coral : owner === 'ai' ? palette.coral : palette.lime);
    burstParticles(hole.x, hole.y, ball.data.color);

    if (isCue) {
      const scratchOwner = ball.data.isPlayerCue ? 'player' : 'ai';
      if (scratchOwner === 'player') {
        playerScore = Math.max(0, playerScore - SCRATCH_PENALTY);
        showScorePopup(hole.x, hole.y - 28, `YOU -${SCRATCH_PENALTY}`, palette.coral);
      } else {
        aiScore = Math.max(0, aiScore - SCRATCH_PENALTY);
        showScorePopup(hole.x, hole.y - 28, `AI -${SCRATCH_PENALTY}`, palette.blue);
      }
      updateHud();
      gsap.delayedCall(.5, () => respawnCueBall(ball));
      return;
    }

    const points = isBlack ? 500 : 100 + Math.floor(Math.random() * 40);
    if (owner === 'player') playerScore += points;
    else aiScore += points;
    pocketedCount += 1;
    updateHud();

    const popupColor = owner === 'player' ? palette.lime : palette.coral;
    const label = owner === 'player' ? `YOU +${points}` : `AI +${points}`;
    showScorePopup(hole.x, hole.y - 28, label, popupColor);

    gsap.delayedCall(.48, () => {
      ball.data.active = false;
      ball.visible = false;

      if (isBlack && remainingBefore > 1) {
        endGame('foul', owner);
        return;
      }

      if (remainingTargets() === 0) {
        endGame('complete');
      }
    });
  }

  function respawnCueBall(cue) {
    const compact = W < 720;
    const rackCenterY = compact ? H * .58 : H * .5;
    cue.data.active = true;
    cue.data.pocketing = false;
    cue.visible = true;
    cue.alpha = 0;
    cue.scale.set(.4);
    if (cue.data.isPlayerCue) {
      cue.position.set(compact ? W * .18 : W * .28, rackCenterY);
    } else {
      cue.position.set(compact ? W * .82 : W * .72, rackCenterY);
    }
    cue.data.vx = cue.data.vy = 0;
    cue.data.history.length = 0;
    gsap.to(cue, { alpha: 1, duration: .35 });
    gsap.to(cue.scale, { x: 1, y: 1, duration: .55, ease: 'back.out(2)' });
  }

  function pulseHole(hole, color) {
    gsap.fromTo(hole.data.glow, { alpha: .2 }, {
      alpha: 1,
      duration: .18,
      yoyo: true,
      repeat: 1,
      onStart: () => {
        hole.data.glow.clear()
          .circle(0, 0, holeRadius + 22)
          .fill({ color, alpha: .28 });
      },
      onComplete: () => drawHoleGraphic(hole),
    });
    gsap.fromTo(hole.scale, { x: 1, y: 1 }, { x: 1.14, y: 1.14, duration: .16, yoyo: true, repeat: 1, ease: 'power2.out' });
  }

  function burstParticles(x, y, color, count = 18, spread = 56) {
    for (let i = 0; i < count; i++) {
      const p = new PIXI.Graphics();
      const size = 2 + Math.random() * 4;
      p.circle(0, 0, size).fill(color);
      p.x = x;
      p.y = y;
      fxLayer.addChild(p);
      const angle = Math.random() * Math.PI * 2;
      const dist = 24 + Math.random() * spread;
      particles.push(p);
      gsap.to(p, {
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: .45 + Math.random() * .35,
        ease: 'power2.out',
        onComplete: () => {
          fxLayer.removeChild(p);
          p.destroy();
          const idx = particles.indexOf(p);
          if (idx >= 0) particles.splice(idx, 1);
        },
      });
    }
  }

  function trackFx(node, ttl = .6) {
    collisionFx.push(node);
    gsap.delayedCall(ttl, () => {
      const idx = collisionFx.indexOf(node);
      if (idx >= 0) collisionFx.splice(idx, 1);
      if (node.parent) node.parent.removeChild(node);
      node.destroy();
    });
  }

  function blendColor(c1, c2, t = .5) {
    const r1 = (c1 >> 16) & 255;
    const g1 = (c1 >> 8) & 255;
    const b1 = c1 & 255;
    const r2 = (c2 >> 16) & 255;
    const g2 = (c2 >> 8) & 255;
    const b2 = c2 & 255;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) + (g << 8) + b;
  }

  function makeContactFx(x, y, ttl = .6) {
    const wrap = new PIXI.Container();
    wrap.x = x;
    wrap.y = y;
    fxLayer.addChild(wrap);
    trackFx(wrap, ttl);
    return wrap;
  }

  function spawnCollisionFX(a, b, nx, ny, hitSpeed) {
    const intensity = Math.min(1, hitSpeed / 14);
    if (intensity < .12) return;

    const contactX = a.x + nx * a.data.radius;
    const contactY = a.y + ny * a.data.radius;
    const mix = blendColor(a.data.color, b.data.color, .5);
    const tangentX = -ny;
    const tangentY = nx;

    const flashWrap = makeContactFx(contactX, contactY, .22);
    const flash = new PIXI.Graphics();
    flash.moveTo(0, 0);
    flash.circle(0, 0, ballRadius * (.35 + intensity * .45))
      .fill({ color: palette.cream, alpha: .55 + intensity * .25 });
    flashWrap.addChild(flash);
    gsap.to(flashWrap, { alpha: 0, duration: .2, ease: 'power2.out' });

    const rippleWrap = makeContactFx(contactX, contactY, .55);
    const ripple = new PIXI.Graphics();
    ripple.moveTo(0, 0);
    ripple.circle(0, 0, ballRadius * .4)
      .stroke({ color: mix, width: 2 + intensity * 2, alpha: .75 });
    rippleWrap.addChild(ripple);
    gsap.to(rippleWrap.scale, { x: 2.2 + intensity * 2.8, y: 2.2 + intensity * 2.8, duration: .42, ease: 'power2.out' });
    gsap.to(rippleWrap, { alpha: 0, duration: .42, ease: 'power2.out' });

    const outerWrap = makeContactFx(contactX, contactY, .65);
    const outerRipple = new PIXI.Graphics();
    outerRipple.moveTo(0, 0);
    outerRipple.circle(0, 0, ballRadius * .55)
      .stroke({ color: palette.blue, width: 1, alpha: .35 + intensity * .25 });
    outerWrap.addChild(outerRipple);
    gsap.to(outerWrap.scale, { x: 3 + intensity * 3.5, y: 3 + intensity * 3.5, duration: .55, ease: 'sine.out', delay: .04 });
    gsap.to(outerWrap, { alpha: 0, duration: .55, ease: 'sine.out', delay: .04 });

    const sparkCount = 4 + Math.floor(intensity * 10);
    for (let i = 0; i < sparkCount; i++) {
      const dir = i % 2 ? 1 : -1;
      const len = 10 + intensity * 28 + Math.random() * 12;
      const spread = (Math.random() - .5) * .8;
      const sx = tangentX * dir + nx * spread;
      const sy = tangentY * dir + ny * spread;
      const slen = Math.hypot(sx, sy) || 1;
      const sparkWrap = makeContactFx(contactX, contactY, .3);
      const spark = new PIXI.Graphics();
      spark.moveTo(0, 0)
        .lineTo((sx / slen) * len, (sy / slen) * len)
        .stroke({ color: i % 3 ? mix : palette.cream, width: 1.5 + intensity, alpha: .85 });
      sparkWrap.addChild(spark);
      gsap.to(sparkWrap, { alpha: 0, duration: .22 + Math.random() * .12, ease: 'power1.in' });
    }

    burstParticles(
      contactX, contactY, mix,
      6 + Math.floor(intensity * 14),
      22 + intensity * 48,
    );
    if (intensity > .35) {
      burstParticles(contactX, contactY, palette.cream, 3 + Math.floor(intensity * 5), 18 + intensity * 20);
    }

    impactSquash(a, nx, ny, intensity);
    impactSquash(b, -nx, -ny, intensity);

    if (intensity > .62 && performance.now() - lastHardHitShake > 120) {
      lastHardHitShake = performance.now();
      gsap.fromTo(world, { x: -3 - intensity * 3 }, {
        x: 3 + intensity * 3,
        duration: .04,
        repeat: 3,
        yoyo: true,
        ease: 'power1.inOut',
        onComplete: () => { world.x = 0; },
      });
    }
  }

  function impactSquash(ball, nx, ny, intensity) {
    const lean = .9 - intensity * .12;
    const stretch = 1 + intensity * .22;
    const sx = Math.abs(nx) >= Math.abs(ny) ? lean : stretch;
    const sy = Math.abs(ny) > Math.abs(nx) ? lean : stretch;
    gsap.fromTo(ball.scale, { x: sx, y: sy }, {
      x: 1, y: 1, duration: .28 + intensity * .18, ease: 'elastic.out(1, .5)', overwrite: true,
    });
    gsap.fromTo(ball, { alpha: 1 }, {
      alpha: .82 + intensity * .18,
      duration: .05,
      yoyo: true,
      repeat: 1,
      overwrite: true,
    });
  }

  function showScorePopup(x, y, text, color) {
    const label = new PIXI.Text({ text, style: sans(20, '800', color) });
    label.anchor.set(.5);
    label.x = x;
    label.y = y;
    label.alpha = 0;
    label.scale.set(.6);
    fxLayer.addChild(label);
    floatTexts.push(label);

    gsap.timeline()
      .to(label, { alpha: 1, duration: .12 })
      .to(label.scale, { x: 1, y: 1, duration: .35, ease: 'back.out(2.4)' }, '<')
      .to(label, { y: y - 42, duration: .75, ease: 'power2.out' }, '<')
      .to(label, {
        alpha: 0,
        duration: .35,
        delay: .2,
        onComplete: () => {
          fxLayer.removeChild(label);
          label.destroy();
          const idx = floatTexts.indexOf(label);
          if (idx >= 0) floatTexts.splice(idx, 1);
        },
      });
  }

  function endGame(reason, foulOwner) {
    if (gameState !== 'playing') return;
    gameState = 'ended';

    if (aim) {
      aim = null;
      playerAim.clear();
    }

    let type;
    let title;
    let message;

    if (reason === 'foul') {
      if (foulOwner === 'player') {
        playerScore = Math.max(0, playerScore - 400);
        updateHud();
        type = 'fail';
        title = 'You Lose!';
        message = 'You sank the black ball too early. The AI takes the duel.';
      } else {
        aiScore = Math.max(0, aiScore - 400);
        updateHud();
        type = 'win';
        title = 'You Win!';
        message = 'The AI fouled on the black ball. Victory is yours.';
      }
    } else {
      if (playerScore > aiScore) {
        type = 'win';
        title = 'You Win!';
        message = `You outscored the AI rival with superior pocket play.`;
      } else if (playerScore < aiScore) {
        type = 'fail';
        title = 'You Lose!';
        message = 'The AI rival pocketed more points and claimed the table.';
      } else {
        type = 'draw';
        title = 'Draw!';
        message = 'A perfectly balanced duel — neither side could break the tie.';
      }
    }

    if (type === 'win') {
      playerScore += 250;
      updateHud();
      celebrateWin();
    } else if (type === 'fail') {
      shakeWorld();
    }

    const delay = type === 'win' ? .8 : .5;
    gsap.delayedCall(delay, () => showModal(type, title, message));
  }

  function shakeWorld() {
    gsap.fromTo(world, { x: -8 }, {
      x: 8,
      duration: .05,
      repeat: 7,
      yoyo: true,
      ease: 'power1.inOut',
      onComplete: () => { world.x = 0; },
    });
  }

  function celebrateWin() {
    for (let i = 0; i < 40; i++) {
      const p = new PIXI.Graphics();
      const w = 4 + Math.random() * 6;
      const h = 8 + Math.random() * 10;
      p.rect(-w / 2, -h / 2, w, h).fill([palette.lime, palette.blue, palette.gold, palette.coral][i % 4]);
      p.x = Math.random() * W;
      p.y = -20 - Math.random() * 80;
      p.rotation = Math.random() * Math.PI;
      fxLayer.addChild(p);
      gsap.to(p, {
        y: H + 40,
        rotation: p.rotation + (Math.random() > .5 ? 4 : -4),
        duration: 2.2 + Math.random() * 1.4,
        ease: 'none',
        delay: Math.random() * .6,
        onComplete: () => { fxLayer.removeChild(p); p.destroy(); },
      });
    }
  }

  function buildConfetti() {
    modalConfetti.innerHTML = '';
    const colors = ['#c8f46d', '#8bd8ee', '#f4d03f', '#ff795f', '#f3efe2'];
    for (let i = 0; i < 42; i++) {
      const piece = document.createElement('span');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      modalConfetti.appendChild(piece);
      gsap.to(piece, {
        y: 360 + Math.random() * 120,
        x: (Math.random() - .5) * 120,
        rotation: Math.random() * 720,
        duration: 1.8 + Math.random(),
        delay: Math.random() * .4,
        ease: 'power1.in',
      });
    }
  }

  function showModal(type, title, message) {
    gameModal.hidden = false;
    gameModal.setAttribute('aria-hidden', 'false');
    gameModal.classList.remove('is-win', 'is-fail', 'is-draw');
    gameModal.classList.add(type === 'win' ? 'is-win' : type === 'draw' ? 'is-draw' : 'is-fail');

    modalEyebrow.textContent = type === 'win' ? 'Victory' : type === 'draw' ? 'Stalemate' : 'Defeat';
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalScore.textContent = `You ${playerScore}  —  AI ${aiScore}`;

    const card = gameModal.querySelector('.game-modal__card');
    gsap.fromTo(card, { y: 24, scale: .94, opacity: 0 }, {
      y: 0, scale: 1, opacity: 1, duration: .7, ease: 'back.out(1.4)',
    });

    if (type === 'win') {
      buildConfetti();
      gsap.fromTo(modalTitle, { letterSpacing: '0.2em' }, {
        letterSpacing: '-0.03em', duration: .8, ease: 'power3.out',
      });
    }
  }

  function hideModal() {
    gameModal.hidden = true;
    gameModal.setAttribute('aria-hidden', 'true');
    modalConfetti.innerHTML = '';
  }

  function resetGame() {
    hideModal();
    gameState = 'playing';
    playerScore = 0;
    aiScore = 0;
    pocketedCount = 0;
    turn = 'player';
    ballsMoving = false;
    shotOwner = 'player';
    aim = null;
    ai.thinking = false;
    playerAim.clear();
    updateHud();

    objects.forEach((o) => {
      o.data.active = true;
      o.data.pocketing = false;
      o.data.lastHitBy = null;
      o.visible = true;
      o.alpha = 1;
      o.scale.set(1);
      o.data.vx = o.data.vy = 0;
      o.data.history.length = 0;
      o.eventMode = 'none';
      o.cursor = 'default';
    });

    floatTexts.forEach(t => t.destroy());
    floatTexts.length = 0;
    particles.forEach(p => p.destroy());
    particles.length = 0;
    collisionFx.forEach(f => f.destroy());
    collisionFx.length = 0;
    if (ai.aimLine) {
      ai.aimLine.destroy();
      ai.aimLine = null;
    }
    fxLayer.removeChildren();
    fxLayer.addChild(playerAim);

    arrangeBalls();
    gsap.fromTo(objects, { alpha: .4 }, { alpha: 1, duration: .45, stagger: .03 });
  }

  function tick() {
    const now = performance.now();
    const delta = Math.min(2, (now - lastTime) / 16.667);
    lastTime = now;
    const steps = Math.max(1, Math.ceil(delta * 2));
    const stepDelta = delta / steps;

    holes.forEach((hole) => {
      hole.data.pulse += .04 * delta;
      hole.data.glow.alpha = .45 + Math.sin(hole.data.pulse) * .08;
    });

    if (gameState === 'playing') {
      for (let step = 0; step < steps; step++) {
        activeObjects().forEach(o => {
          o.x += o.data.vx * stepDelta;
          o.y += o.data.vy * stepDelta;
          o.data.vx *= Math.pow(.988, stepDelta);
          o.data.vy *= Math.pow(.988, stepDelta);

          const r = o.data.radius;
          const nearHole = isNearHole(o);
          if (o.x < r && !nearHole) { o.x = r; o.data.vx = Math.abs(o.data.vx) * .82; squash(o, 'x'); }
          if (o.x > W - r && !nearHole) { o.x = W - r; o.data.vx = -Math.abs(o.data.vx) * .82; squash(o, 'x'); }
          if (o.y < r && !nearHole) { o.y = r; o.data.vy = Math.abs(o.data.vy) * .82; squash(o, 'y'); }
          if (o.y > H - r && !nearHole) { o.y = H - r; o.data.vy = -Math.abs(o.data.vy) * .82; squash(o, 'y'); }
        });
        resolveObjectCollisions();
      }
      checkHoles();
      handleTurnTransition();
    }

    activeObjects().forEach(o => {
      o.data.history.push({ x: o.x, y: o.y });
      if (o.data.history.length > 14) o.data.history.shift();
    });

    drawTrails();
    if (aim) {
      aimPulse += .12 * delta;
      drawPlayerAim();
    }
    drawCursor();
  }

  function resolveObjectCollisions() {
    const restitution = .86;
    const list = activeObjects();

    for (let i = 0; i < list.length - 1; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDistance = a.data.radius + b.data.radius;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared >= minDistance * minDistance) continue;

        const distance = Math.sqrt(distanceSquared);
        const nx = distance > .001 ? dx / distance : 1;
        const ny = distance > .001 ? dy / distance : 0;
        const aDragged = false;
        const bDragged = false;
        const inverseMassA = aDragged ? 0 : 1 / (a.data.radius ** 2);
        const inverseMassB = bDragged ? 0 : 1 / (b.data.radius ** 2);
        const inverseMassTotal = inverseMassA + inverseMassB;

        const overlap = minDistance - distance;
        if (inverseMassTotal > 0) {
          a.x -= nx * overlap * inverseMassA / inverseMassTotal;
          a.y -= ny * overlap * inverseMassA / inverseMassTotal;
          b.x += nx * overlap * inverseMassB / inverseMassTotal;
          b.y += ny * overlap * inverseMassB / inverseMassTotal;
        }

        const relativeVelocityX = b.data.vx - a.data.vx;
        const relativeVelocityY = b.data.vy - a.data.vy;
        const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;

        if (velocityAlongNormal >= 0 || inverseMassTotal === 0) continue;

        const hitSpeed = Math.abs(velocityAlongNormal);
        const impulse = -(1 + restitution) * velocityAlongNormal / inverseMassTotal;
        if (!aDragged) {
          a.data.vx -= impulse * inverseMassA * nx;
          a.data.vy -= impulse * inverseMassA * ny;
        }
        if (!bDragged) {
          b.data.vx += impulse * inverseMassB * nx;
          b.data.vy += impulse * inverseMassB * ny;
        }

        if (hitSpeed > 1.4) spawnCollisionFX(a, b, nx, ny, hitSpeed);

        const hitter = shotOwner;
        if (a.data.isPlayerCue && !b.data.isCue && hitter === 'player') b.data.lastHitBy = 'player';
        if (b.data.isPlayerCue && !a.data.isCue && hitter === 'player') a.data.lastHitBy = 'player';
        if (a.data.isAiCue && !b.data.isCue && hitter === 'ai') b.data.lastHitBy = 'ai';
        if (b.data.isAiCue && !a.data.isCue && hitter === 'ai') a.data.lastHitBy = 'ai';
      }
    }
  }

  function squash(o, axis) {
    const props = axis === 'x' ? { x: .82, y: 1.16 } : { x: 1.16, y: .82 };
    gsap.fromTo(o.scale, props, { x: 1, y: 1, duration: .4, ease: 'elastic.out(1, .45)', overwrite: true });
  }

  function drawTrails() {
    trails.clear();
    activeObjects().forEach(o => {
      const h = o.data.history;
      for (let i = 1; i < h.length; i++) {
        const alpha = (i / h.length) * .18;
        trails.moveTo(h[i - 1].x, h[i - 1].y)
          .lineTo(h[i].x, h[i].y)
          .stroke({ color: o.data.color, width: 2, alpha });
      }
    });
  }

  function drawCursor() {
    cursor.clear();
    if (mouse.x < 0 || matchMedia('(pointer: coarse)').matches) return;
    const canAim = canPlayerAim();
    const aiming = Boolean(aim);
    cursor.circle(mouse.x, mouse.y, canAim || aiming ? 16 : 5)
      .stroke({ color: canAim || aiming ? palette.lime : palette.blue, width: 1, alpha: .7 });
    cursor.circle(mouse.x, mouse.y, 1.5).fill({ color: palette.cream, alpha: .9 });
  }

  init().catch(error => {
    console.error(error);
    fallback.hidden = false;
    fallback.textContent = 'Something went off orbit. Refresh to try again.';
  });
})();
