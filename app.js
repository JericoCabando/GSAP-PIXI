(() => {
  const fallback = document.querySelector('#fallback');

  if (!window.PIXI || !window.gsap) {
    fallback.textContent = 'Unable to load PixiJS or GSAP. Check your connection and refresh.';
    return;
  }

  const app = new PIXI.Application();
  const objects = [];
  const mouse = { x: -1000, y: -1000 };
  let W = innerWidth;
  let H = innerHeight;
  let drag = null;
  let lastTime = performance.now();

  const palette = {
    ink: 0x071019,
    cream: 0xf3efe2,
    blue: 0x8bd8ee,
    coral: 0xff795f,
    lime: 0xc8f46d,
    steel: 0x3d5668,
  };

  const stage = new PIXI.Container();
  const background = new PIXI.Graphics();
  const world = new PIXI.Container();
  const trails = new PIXI.Graphics();
  const objectLayer = new PIXI.Container();
  const ui = new PIXI.Container();
  const cursor = new PIXI.Graphics();
  let ballRadius = 28;

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
    world.addChild(trails, objectLayer);

    buildObjects();
    buildUI();
    resize();
    intro();

    app.canvas.addEventListener('pointermove', onPointerMove);
    app.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', resize);
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
    c.eventMode = 'static';
    c.cursor = 'grab';
    c.hitArea = new PIXI.Circle(0, 0, config.radius + 12);
    c.x = config.x;
    c.y = config.y;
    c.alpha = 0;
    c.scale.set(.35);
    c.data = { ...config, vx: 0, vy: 0, history: [], baseScale: 1, g, avatar, avatarMask };
    redrawOrb(c);
    objectLayer.addChild(c);
    objects.push(c);
    return c;
  }

  function buildObjects() {
    const colors = [palette.cream, 0xf4d03f, 0x3498db, 0xe74c3c, 0x8e44ad, 0xf39c12, 0x27ae60, 0x922b21, 0x111820, 0xf1c40f, 0x2980b9, 0xc0392b, 0x7d3c98, 0xd35400, 0x229954, 0x641e16];
    colors.forEach((color, index) => makeOrb({
      name: index === 0 ? 'Admin ball' : `Ball ${index}`,
      color, radius: ballRadius, x: W * .7, y: H * .5,
    }));
    buildOrbEditor();
  }

  function redrawOrb(o) {
    const { g, avatar, avatarMask } = o.data;
    const r = o.data.radius;
    g.clear().circle(0, 0, r + 6).fill({ color: palette.ink })
      .stroke({ color: o.data.color, width: 1, alpha: .35 })
      .circle(0, 0, r).fill(o.data.color);
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
      sizeOutput.textContent = `${ballRadius * 2}px`;
      objects.forEach(o => { o.data.radius = ballRadius; redrawOrb(o); });
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
    const brand = new PIXI.Text({ text: 'ORBIT / LAB', style: mono(13) });
    brand.name = 'brand';
    ui.addChild(brand);

    const title = new PIXI.Text({ text: 'GSAP + PIXI\nTEST PROJECT', style: sans(74, '800') });
    title.name = 'title';
    title.style.leading = -5;
    ui.addChild(title);

    const copy = new PIXI.Text({
      text: 'ONE ADMIN. FIFTEEN BALLS.\nGRAB, DRAG, AND THROW.',
      style: mono(12, 0xaec0cb),
    });
    copy.name = 'copy';
    copy.style.lineHeight = 21;
    ui.addChild(copy);

    const hint = new PIXI.Container();
    hint.name = 'hint';
    const capsule = new PIXI.Graphics().roundRect(0, 0, 380, 43, 22)
      .fill({ color: palette.cream, alpha: .06 })
      .stroke({ color: palette.cream, width: 1, alpha: .22 });
    const hintText = new PIXI.Text({ text: '↗  THROW AN OBJECT (GSAP ANIMATION HERE)', style: mono(11) });
    hintText.x = 20;
    hintText.y = 14;
    hint.addChild(capsule, hintText);
    ui.addChild(hint);

    const number = new PIXI.Text({ text: '16', style: sans(22, '800', palette.lime) });
    number.name = 'number';
    ui.addChild(number);

    for (const child of ui.children) {
      child.alpha = 0;
      child.y += 18;
    }
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

    background.circle(W * .69, H * .52, Math.min(W, H) * .29)
      .stroke({ color: palette.blue, width: 1, alpha: .11 });
    background.circle(W * .69, H * .52, Math.min(W, H) * .205)
      .stroke({ color: palette.cream, width: 1, alpha: .08 });
    background.circle(W * .69, H * .52, 4).fill({ color: palette.cream, alpha: .45 });
  }

  function resize() {
    W = innerWidth;
    H = innerHeight;
    drawBackground();
    const compact = W < 720;
    const title = ui.getChildByName('title');
    const brand = ui.getChildByName('brand');
    const copy = ui.getChildByName('copy');
    const hint = ui.getChildByName('hint');
    const number = ui.getChildByName('number');
    brand.position.set(compact ? 24 : 54, 32);
    title.style.fontSize = compact ? Math.min(50, W * .12) : Math.min(82, W * .065);
    title.position.set(compact ? 24 : 54, compact ? 90 : H * .24);
    copy.position.set(compact ? 26 : 58, compact ? 215 : H * .52);
    hint.position.set(compact ? 24 : 54, H - 76);
    number.position.set(W - (compact ? 55 : 82), 30);

    if (!drag) arrangeBalls();
  }

  function arrangeBalls() {
    if (!objects.length) return;
    const compact = W < 720;
    const gap = Math.max(2, ballRadius * .1);
    const diameter = ballRadius * 2 + gap;
    const rowStep = diameter * .87;
    const rackCenterX = compact ? W * .55 : W * .75;
    const rackCenterY = compact ? H * .64 : H * .54;
    const adminX = compact ? W * .22 : W * .51;

    objects[0].position.set(adminX, rackCenterY);
    let index = 1;
    for (let row = 0; row < 5; row++) {
      const x = rackCenterX - rowStep * 2 + row * rowStep;
      for (let slot = 0; slot <= row; slot++) {
        const y = rackCenterY + (slot - row / 2) * diameter;
        objects[index].position.set(x, y);
        objects[index].data.vx = objects[index].data.vy = 0;
        index++;
      }
    }

    objects.forEach(o => {
      const r = o.data.radius;
      o.x = Math.max(r + 4, Math.min(W - r - 4, o.x));
      o.y = Math.max(r + 4, Math.min(H - r - 4, o.y));
      o.data.history.length = 0;
    });
  }

  function intro() {
    gsap.timeline({ defaults: { ease: 'power3.out' } })
      .to(ui.children, { alpha: 1, y: '-=18', duration: .8, stagger: .08 })
      .to(objects, { alpha: 1, duration: .5, stagger: .1 }, '-=.45')
      .to(objects.map(o => o.scale), { x: 1, y: 1, duration: .75, stagger: .1, ease: 'back.out(1.7)' }, '<');
    gsap.to(ui.getChildByName('hint'), { y: '-=6', duration: 1.4, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 });
    objects.forEach((o, i) => gsap.to(o, {
      rotation: i % 2 ? -.08 : .08,
      duration: 2.4 + i * .3,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    }));
  }

  function getPoint(e) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * W / rect.width, y: (e.clientY - rect.top) * H / rect.height };
  }

  function findObject(point) {
    for (let i = objects.length - 1; i >= 0; i--) {
      const o = objects[i];
      if (Math.hypot(point.x - o.x, point.y - o.y) <= o.data.radius + 16) return o;
    }
    return null;
  }

  function onPointerDown(e) {
    const p = getPoint(e);
    const target = findObject(p);
    if (!target) return;
    objectLayer.addChild(target);
    drag = {
      target, offsetX: p.x - target.x, offsetY: p.y - target.y,
      samples: [{ x: p.x, y: p.y, t: performance.now() }],
    };
    target.data.vx = target.data.vy = 0;
    target.cursor = 'grabbing';
    gsap.to(target.scale, { x: 1.12, y: 1.12, duration: .2, ease: 'power2.out' });
  }

  function onPointerMove(e) {
    const p = getPoint(e);
    mouse.x = p.x;
    mouse.y = p.y;
    if (!drag) return;
    const previousX = drag.target.x;
    const previousY = drag.target.y;
    drag.target.x = p.x - drag.offsetX;
    drag.target.y = p.y - drag.offsetY;
    // Keep a dragged object's velocity current so it can push other balls.
    drag.target.data.vx = drag.target.x - previousX;
    drag.target.data.vy = drag.target.y - previousY;
    const now = performance.now();
    drag.samples.push({ x: p.x, y: p.y, t: now });
    drag.samples = drag.samples.filter(s => now - s.t < 110);
  }

  function onPointerUp() {
    if (!drag) return;
    const o = drag.target;
    const samples = drag.samples;
    if (samples.length > 1) {
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(16, b.t - a.t);
      o.data.vx = Math.max(-34, Math.min(34, (b.x - a.x) / dt * 16));
      o.data.vy = Math.max(-34, Math.min(34, (b.y - a.y) / dt * 16));
    }
    o.cursor = 'grab';
    gsap.to(o.scale, { x: 1, y: 1, duration: .35, ease: 'elastic.out(1, .55)' });
    drag = null;
  }

  function tick() {
    const now = performance.now();
    const delta = Math.min(2, (now - lastTime) / 16.667);
    lastTime = now;
    const steps = Math.max(1, Math.ceil(delta * 2));
    const stepDelta = delta / steps;

    for (let step = 0; step < steps; step++) {
      objects.forEach(o => {
        if (!drag || drag.target !== o) {
          o.x += o.data.vx * stepDelta;
          o.y += o.data.vy * stepDelta;
          o.data.vx *= Math.pow(.988, stepDelta);
          o.data.vy *= Math.pow(.988, stepDelta);

          const r = o.data.radius;
          if (o.x < r) { o.x = r; o.data.vx = Math.abs(o.data.vx) * .82; squash(o, 'x'); }
          if (o.x > W - r) { o.x = W - r; o.data.vx = -Math.abs(o.data.vx) * .82; squash(o, 'x'); }
          if (o.y < r) { o.y = r; o.data.vy = Math.abs(o.data.vy) * .82; squash(o, 'y'); }
          if (o.y > H - r) { o.y = H - r; o.data.vy = -Math.abs(o.data.vy) * .82; squash(o, 'y'); }
        }
      });

      resolveObjectCollisions();
    }

    objects.forEach(o => {
      o.data.history.push({ x: o.x, y: o.y });
      if (o.data.history.length > 14) o.data.history.shift();
    });

    drawTrails();
    drawCursor();
  }

  function resolveObjectCollisions() {
    const restitution = .86;

    for (let i = 0; i < objects.length - 1; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const a = objects[i];
        const b = objects[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDistance = a.data.radius + b.data.radius;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared >= minDistance * minDistance) continue;

        const distance = Math.sqrt(distanceSquared);
        const nx = distance > .001 ? dx / distance : 1;
        const ny = distance > .001 ? dy / distance : 0;
        const aDragged = drag?.target === a;
        const bDragged = drag?.target === b;
        const inverseMassA = aDragged ? 0 : 1 / (a.data.radius ** 2);
        const inverseMassB = bDragged ? 0 : 1 / (b.data.radius ** 2);
        const inverseMassTotal = inverseMassA + inverseMassB;

        // Separate intersecting circles, moving a grabbed ball only via the pointer.
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

        // They are already moving apart, so separation alone is sufficient.
        if (velocityAlongNormal >= 0 || inverseMassTotal === 0) continue;

        const impulse = -(1 + restitution) * velocityAlongNormal / inverseMassTotal;
        if (!aDragged) {
          a.data.vx -= impulse * inverseMassA * nx;
          a.data.vy -= impulse * inverseMassA * ny;
        }
        if (!bDragged) {
          b.data.vx += impulse * inverseMassB * nx;
          b.data.vy += impulse * inverseMassB * ny;
        }
      }
    }
  }

  function squash(o, axis) {
    const props = axis === 'x' ? { x: .82, y: 1.16 } : { x: 1.16, y: .82 };
    gsap.fromTo(o.scale, props, { x: 1, y: 1, duration: .4, ease: 'elastic.out(1, .45)', overwrite: true });
  }

  function drawTrails() {
    trails.clear();
    objects.forEach(o => {
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
    const hovered = findObject(mouse);
    cursor.circle(mouse.x, mouse.y, hovered ? 18 : 5)
      .stroke({ color: hovered ? hovered.data.color : palette.cream, width: 1, alpha: .7 });
    cursor.circle(mouse.x, mouse.y, 1.5).fill({ color: palette.cream, alpha: .9 });
  }

  init().catch(error => {
    console.error(error);
    fallback.hidden = false;
    fallback.textContent = 'Something went off orbit. Refresh to try again.';
  });
})();
