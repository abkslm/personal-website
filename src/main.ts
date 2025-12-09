import './style.css'

// --- Icon Map (Dynamic) ---
let ICON_MAP: Record<string, string> = {};

// --- Parsed Card Interface ---
interface CardData {
  title: string;
  body: string;
}

// --- Configuration Parsing Logic ---
interface ConfigData {
  remainingMarkdown: string;
  iconDefinitions: Record<string, string>;
}

function parseConfiguration(text: string): ConfigData {
  const configRegex = /^%%%\n([\s\S]*?)\n%%%$/m;
  const match = text.match(configRegex);

  if (match) {
    const configBlock = match[1];
    const definitions: Record<string, string> = {};
    const lines = configBlock.split('\n');
    let inDefine = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'define:') {
        inDefine = true;
        continue;
      }

      if (inDefine && trimmed.length > 0) {
        // Parse "key: value"
        const [key, ...valueParts] = trimmed.split(':');
        if (key && valueParts.length > 0) {
          definitions[key.trim()] = valueParts.join(':').trim();
        }
      }
    }

    return {
      remainingMarkdown: text.replace(configRegex, '').trim(),
      iconDefinitions: definitions
    };
  }

  return {
    remainingMarkdown: text,
    iconDefinitions: {}
  };
}

async function loadIcons(definitions: Record<string, string>) {
  const promises = Object.entries(definitions).map(async ([key, path]) => {
    try {
      const res = await fetch(path);
      if (res.ok) {
        const svg = await res.text();
        // Verify it's somewhat SVG-like safely? 
        // For now assume user provides valid file
        ICON_MAP[key] = svg;
      } else {
        console.warn(`Failed to load icon for ${key} at ${path}`);
      }
    } catch (e) {
      console.warn(`Error fetching icon ${key}:`, e);
    }
  });

  await Promise.all(promises);
}

// --- State Management ---
const SYSTEM = {
  scrollY: 0,
  spreadThreshold: 250, // Pixels to deal one card
  cardHeights: [] as number[],
  scrollBreakpoints: [] as number[],
  stackOffsets: [] as number[],
  cards: [] as HTMLElement[],
  cardStates: [] as {
    tiltX: number,
    tiltY: number,
    mouseX: number,
    mouseY: number,
    isHovering: boolean
  }[]
};

async function fetchAndRenderCards() {
  try {
    const response = await fetch('/cards.md');
    if (!response.ok) throw new Error('Failed to load cards.md');
    const fullText = await response.text();
    const { remainingMarkdown, iconDefinitions } = parseConfiguration(fullText);
    await loadIcons(iconDefinitions);
    const cards = parseMarkdown(remainingMarkdown);

    renderCards(cards);
    initScrollSystem();

    // Start the single animation loop
    requestAnimationFrame(renderLoop);
  } catch (error) {
    console.error(error);
  }
}

function parseMarkdown(markdown: string): CardData[] {
  // Split by H1 headers. distinct sections.
  const parts = markdown.split(/^# /m).filter(p => p.trim().length > 0);

  return parts.map(part => {
    const lines = part.split('\n');
    let title = lines.shift()?.trim() || '';

    // Process title - keep the explicit <\n> or <br> support if needed, 
    // but usually Markdown titles are one line. 
    // The user's example had <\n> which we replace with <br>.
    title = parseCustomSyntax(title);

    // Process body lines individually to create structure
    const bodyBlocks = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Parse content
        let content = parseCustomSyntax(line)
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
            if (ICON_MAP[label]) {
              return `<a href="${url}" target="_blank" aria-label="${label}" class="social-link">${ICON_MAP[label]}</a>`;
            }
            return `<a href="${url}" target="_blank">${label}</a>`;
          });

        // Detect if this line is primarily social links
        // Heuristic: Check if it contains our class="social-link"
        if (content.includes('class="social-link"')) {
          return `<div class="divider-sm"></div><div class="links">${content}</div>`;
        } else {
          return `<p>${content}</p>`;
        }
      });

    const body = bodyBlocks.join('');
    return { title, body };
  });
}

function parseCustomSyntax(text: string): string {
  return text.replace(/<\\n>/g, '<br>');
}

function renderCards(cards: CardData[]) {
  const container = document.getElementById('cards-container');
  if (!container) return;

  container.innerHTML = cards.map((card, index) => `
    <div class="card-wrapper" data-index="${index}">
      <article class="glass-card">
        <div class="content">
          <header>
            <h1>${card.title}</h1>
            <div class="divider"></div>
          </header>
          <section class="bio">
            ${card.body}
          </section>
        </div>
      </article>
    </div>
  `).join('');
}

function initScrollSystem() {
  SYSTEM.cards = Array.from(document.querySelectorAll('.card-wrapper'));

  // 1. Measure Heights & Calculate Breakpoints
  SYSTEM.cardHeights = SYSTEM.cards.map(card => card.offsetHeight);

  SYSTEM.scrollBreakpoints = [0];
  const CARD_MARGIN = 20; // Fixed physical gap
  let currentBp = 0;

  for (let i = 1; i < SYSTEM.cards.length; i++) {
    const prevH = SYSTEM.cardHeights[i - 1];
    const currH = SYSTEM.cardHeights[i];

    // To ensure gap is exactly CARD_MARGIN between Bottom(i-1) and Top(i):
    // Delta = (PrevH + CurrH) / 2 + Margin.
    const step = (prevH + currH) / 2 + CARD_MARGIN;

    currentBp += step;
    SYSTEM.scrollBreakpoints.push(currentBp);
  }
  // Add a final breakpoint for the last card to scroll slightly up?
  // Current logic puts last card at Center when scrollY = LastBp.
  // Code expects Breakpoints length = Cards length? 
  // Wait, previous code had `cumulativeHeight += h`. pushed N times.
  // Bp length was `Cards.length + 1` (Init [0]).
  // Actually previous map pushed for *every* card.
  // So `Breakpoints` had N+1 items.
  // [0, H0, H0+H1...]
  // My new loop goes i=1..N-1. Pushes N-1 times. Total N items.
  // Breakpoints[i] corresponds to Card i.
  // Card 0 -> Bp[0]=0.
  // Card N-1 -> Bp[N-1].
  // Render loop uses `SYSTEM.scrollBreakpoints.length - 1`.
  // If `Breakpoints` has N items. Last index is N-1.
  // Loop `i < N-1`. i goes 0..N-2.
  // Intervals: [0,1], [1,2]... [N-2, N-1].
  // Logic works for N items.

  // Need to verify if we need an EXTRA breakpoint for the end scrolling?
  // Previous `cumulativeHeight` pushed for *every* card.
  // So `Breakpoints` had N+1 items. `B[N]` was `Sum(All)`.
  // My loop above stops at `B[N-1]`.
  // `maxScrollY` uses `Breakpoints[cards.length - 1]`.
  // So having N items is sufficient for the logic `maxScrollY`.
  // BUT the `globalProgress` loop iterates `length - 1`.
  // If N items, length-1 = N-1 loops.
  // Intervals [0..1], [1..2].. [N-2..N-1].
  // If `scrollY` > `B[N-1]`, it goes to `else if`. `globalProgress = i+1 = (N-2)+1 = N-1`.
  // Correct.

  // SO logic holds with N items matching N cards.

  // 2. Calculate Stack Offsets (Peeking)
  // Goal: Bottom[i] = Bottom[i-1] + PEEK
  // Center[i] + Height[i]/2 = Center[i-1] + Height[i-1]/2 + PEEK
  // Center[i] = Center[i-1] + Height[i-1]/2 - Height[i]/2 + PEEK
  // Since StackOffset is relative to Card 0 Center...
  // Offset[i] = Offset[i-1] + (H[i-1]/2) - (H[i]/2) + PEEK
  // 2. Calculate Stack Offsets (Peeking)
  // Goal: Bottom[i] = Bottom[i-1] + PEEK
  // Center[i] + Height[i]/2 = Center[i-1] + Height[i-1]/2 + PEEK
  // Center[i] = Center[i-1] + Height[i-1]/2 - Height[i]/2 + PEEK
  // Since StackOffset is relative to Card 0 Center...
  // Offset[i] = Offset[i-1] + (H[i-1]/2) - (H[i]/2) + PEEK
  const PEEK = 40; // Reverted to tighter peek for initial state
  SYSTEM.stackOffsets = [0];
  for (let i = 1; i < SYSTEM.cards.length; i++) {
    const prevOffset = SYSTEM.stackOffsets[i - 1];
    const prevHalfH = SYSTEM.cardHeights[i - 1] / 2;
    const currHalfH = SYSTEM.cardHeights[i] / 2;

    // Center[i] = Center[i-1] + (H[i-1]/2) - (H[i]/2) + PEEK
    const newOffset = prevOffset + prevHalfH - currHalfH + PEEK;
    SYSTEM.stackOffsets.push(newOffset);
  }

  // 3. Init States
  SYSTEM.cardStates = SYSTEM.cards.map(() => ({
    tiltX: 0, tiltY: 0, mouseX: 0, mouseY: 0, isHovering: false
  }));
  SYSTEM.cards.forEach((card, i) => {
    (card as HTMLElement).style.zIndex = `${SYSTEM.cards.length - i}`;
  });

  // 4. Create Spacer
  const spacer = document.createElement('div');
  spacer.id = 'scroll-spacer';
  // Use absolute positioning to ensure it dictates exact scroll height
  // without stacking on top of other content in the wrapper (like footer)
  spacer.style.position = 'absolute';
  spacer.style.top = '0';
  spacer.style.left = '0';
  spacer.style.width = '100%';
  spacer.style.opacity = '0';
  spacer.style.pointerEvents = 'none';

  // Calculate strict scroll limit
  const maxScrollY = SYSTEM.scrollBreakpoints[SYSTEM.cards.length - 1];
  // We need the scrollable distance to be equal to maxScrollY.
  // scrollHeight = maxScrollY + window.innerHeight
  const totalHeight = maxScrollY + window.innerHeight;

  spacer.style.height = `${totalHeight}px`;

  // APPEND TO SCROLL WRAPPER INSTEAD OF BODY
  const scrollWrapper = document.getElementById('scroll-wrapper');
  if (scrollWrapper) {
    scrollWrapper.appendChild(spacer);

    // SCROLL HIJACK: Forward wheel events from window to wrapper
    // This allows scrolling even when hovering over fixed cards
    window.addEventListener('wheel', (e) => {
      // If target is NOT the wrapper (e.g. it's a card), forward the scroll
      if (e.target !== scrollWrapper) {
        scrollWrapper.scrollTop += e.deltaY;
      }
    }, { passive: true });

  } else {
    // Fallback if wrapper missing logic
    document.body.appendChild(spacer);
  }

  // 5. Interaction Listeners
  SYSTEM.cards.forEach((card, index) => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const ratioY = y / rect.height;
      const state = SYSTEM.cardStates[index];
      state.isHovering = true;
      state.mouseX = x; state.mouseY = y;
      state.tiltX = Math.sqrt(ratioY) * 0.5;
      state.tiltY = ((x - centerX) / centerX) * -1.0;
    });
    card.addEventListener('mouseleave', () => {
      const state = SYSTEM.cardStates[index];
      state.isHovering = false;
      state.tiltX = 0; state.tiltY = 0;
    });
  });
}

function renderLoop() {
  const PEEK = 40;
  // Read Scroll from Container
  const scrollWrapper = document.getElementById('scroll-wrapper');
  if (scrollWrapper) {
    SYSTEM.scrollY = scrollWrapper.scrollTop;
  } else {
    SYSTEM.scrollY = window.scrollY;
  }

  if (SYSTEM.cards.length === 0) {
    requestAnimationFrame(renderLoop);
    return;
  }

  const maxScrollY = SYSTEM.scrollBreakpoints[SYSTEM.cards.length - 1];
  // CLAMP PHYSICS: Prevent animation from going past the end state
  // This ensures the last card stays pinned to its neighbor even during overscroll bounce
  const effectiveScrollY = Math.min(SYSTEM.scrollY, maxScrollY);

  // Calculate Global Progress Index based on Breakpoints
  let globalProgress = 0;
  for (let i = 0; i < SYSTEM.scrollBreakpoints.length - 1; i++) {
    const start = SYSTEM.scrollBreakpoints[i];
    const end = SYSTEM.scrollBreakpoints[i + 1];
    if (effectiveScrollY >= start && effectiveScrollY < end) {
      const fraction = (effectiveScrollY - start) / (end - start);
      globalProgress = i + fraction;
      break;
    } else if (effectiveScrollY >= end) {
      globalProgress = i + 1;
    }
  }

  // Camera Logic (Stack Feed)
  // Active Index Truncated
  const activeIndex = Math.min(Math.floor(globalProgress), SYSTEM.cards.length - 1);
  const percent = globalProgress - activeIndex;

  // We want the Stack to "Feed" upwards.
  // The "Camera" moves from Offset[i] to Offset[i+1].
  const offsetA = SYSTEM.stackOffsets[activeIndex] || 0;
  const offsetB = SYSTEM.stackOffsets[activeIndex + 1] || offsetA;
  const currentStackCameraY = offsetA + (offsetB - offsetA) * percent;

  // ANCHOR POINT: Dynamic Expansion
  // Start at Center (Progress 0).
  // As we progress, move the anchor down to fill the bottom space.
  const EXPANSION_RATE = 35; // Pixels per card index of progress
  const dynamicShift = globalProgress * EXPANSION_RATE;

  let prevVisualTop = -99999; // Initialize safely

  SYSTEM.cards.forEach((card, i) => {
    const state = SYSTEM.cardStates[i];
    const height = SYSTEM.cardHeights[i];
    const screenCenterY = (window.innerHeight - height) / 2;

    // Base Y is dynamic
    const baseY = screenCenterY + dynamicShift;

    // Relative Index
    const relIndex = i - globalProgress;

    let targetY = 0;
    let targetZ = 0;
    let targetScale = 1;
    let targetOpacity = 1;

    if (relIndex >= 0) {
      // IN STACK (Waiting)
      const stackDiff = SYSTEM.stackOffsets[i] - currentStackCameraY;
      targetY = baseY + stackDiff;

      // Depth
      targetZ = -relIndex * 50;
      targetScale = 1 - (relIndex * 0.04);

      // VISIBILITY LIMIT
      if (relIndex > 2) {
        const depthFade = 1 - (relIndex - 2);
        targetOpacity = Math.max(0, depthFade);
      }

    } else {
      // DEALT (Moving Up)
      const scrollDiff = SYSTEM.scrollBreakpoints[i] - effectiveScrollY;
      targetY = baseY + scrollDiff;

      targetZ = 0;
      targetOpacity = 1;
    }

    if (state.isHovering) {
      card.style.setProperty('--mouse-x', `${state.mouseX}px`);
      card.style.setProperty('--mouse-y', `${state.mouseY}px`);
      card.style.transition = 'none';
    } else {
      card.style.transition = 'none';
    }

    // Add slight random rotation to stack
    let rotateX = 0;
    if (relIndex > 0) rotateX = relIndex * 2;
    const finalRotateX = state.tiltX + rotateX;

    // --- DYNAMIC CLIPPING LOGIC ---
    let clipInset = 0;
    const physicalTop = targetY - height / 2;

    if (i > 0) {
      // Ensure this card starts at least PEEK pixels below the VISIBLE top of the previous card.
      // This works for both stacked and active cards.
      // If previous card moves up high, 'limit' moves up, releasing the clip.
      const limit = prevVisualTop - PEEK;
      const amountAboveLimit = limit - physicalTop; // If physicalTop < limit, this is positive

      if (amountAboveLimit > 0) {
        clipInset = amountAboveLimit;
      }
    }

    // Update visual top for the next card to reference
    // The visual top is the physical top plus any clipping (which pushes the start down)
    const currentVisualTop = physicalTop + clipInset;
    prevVisualTop = currentVisualTop;

    // Apply Clip to INNER CARD
    // Transform Origin on WRAPPER

    // Select inner (cache this?)
    // For now query (fast enough for 4 elements)
    const innerCard = card.querySelector('.glass-card') as HTMLElement;

    if (clipInset > 0.5) {
      // Clip the INNER card
      // Using inset on inner card effectively hides the top part.
      // The wrapper's drop-shadow (outside) will wrap this clipped shape.
      if (innerCard) innerCard.style.clipPath = `inset(${clipInset}px 0 0 0 round 24px)`;
    } else {
      if (innerCard) innerCard.style.clipPath = 'none';
      // Ensure we don't leave residual clip paths
    }

    // Anchor the transform (scale/rotate) to the VISIBLE top edge (the clip line).
    // This prevents the visible top from drifting when scaled, maintaining the PEEK gap.
    card.style.transformOrigin = `center ${clipInset}px`;

    card.style.transform = `
      translate3d(-50%, ${targetY}px, ${targetZ}px)
      perspective(1000px)
      rotateX(${finalRotateX}deg)
      rotateY(${state.tiltY}deg)
      scale(${targetScale})
    `;
    card.style.opacity = `${targetOpacity}`;
    card.style.zIndex = `${100 - i}`;
  });

  requestAnimationFrame(renderLoop);
}



// --- Canvas Background Renderer ---
class BackgroundRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number = 0;
  height: number = 0;
  blobs: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    radius: number;
  }[] = [];
  noisePattern: CanvasPattern | null = null;

  constructor() {
    this.canvas = document.getElementById('bg-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Initialize Blobs
    this.blobs = [
      {
        x: this.width * 0.3, y: this.height * 0.3,
        vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5,
        color: 'rgba(85, 107, 47, 0.65)', // Olive Drab - Balanced opacity
        radius: 120
      },
      {
        x: this.width * 0.7, y: this.height * 0.7,
        vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5,
        color: 'rgba(154, 205, 50, 0.55)', // Yellow Green - Lowered slightly to match brightness visually
        radius: 90 // Equalized radius
      }
    ];

    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  update() {
    // Update Physics
    for (let i = 0; i < this.blobs.length; i++) {
      const blob = this.blobs[i];

      // Movement
      blob.x += blob.vx;
      blob.y += blob.vy;

      // Wall Bounce
      const margin = -100;
      if (blob.x < margin && blob.vx < 0) blob.vx *= -1;
      if (blob.x > this.width - margin && blob.vx > 0) blob.vx *= -1;
      if (blob.y < margin && blob.vy < 0) blob.vy *= -1;
      if (blob.y > this.height - margin && blob.vy > 0) blob.vy *= -1;

      // Repulsion
      for (let j = 0; j < this.blobs.length; j++) {
        if (i === j) continue;
        const other = this.blobs[j];
        const dx = blob.x - other.x;
        const dy = blob.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = blob.radius + other.radius - 100; // Allow slight overlap

        if (dist < minDist) {
          const force = (minDist - dist) / minDist;
          const angle = Math.atan2(dy, dx);
          const repelStrength = 0.05;

          blob.vx += Math.cos(angle) * force * repelStrength;
          blob.vy += Math.sin(angle) * force * repelStrength;
        }
      }

      // Speed Cap
      const speed = Math.sqrt(blob.vx * blob.vx + blob.vy * blob.vy);
      const maxSpeed = 2;
      if (speed > maxSpeed) {
        blob.vx = (blob.vx / speed) * maxSpeed;
        blob.vy = (blob.vy / speed) * maxSpeed;
      }
    }
  }

  draw() {
    // Clear
    const { width, height, ctx } = this;
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Background: REMOVED to allow CSS Pulse on body to show through
    // The canvas should be transparent so we only see the blobs/noise on top
    // of the existing CSS animation.
    // ctx.fillStyle = bgGradient;
    // ctx.fillRect(0, 0, width, height);

    // 2. Draw Blobs with Blending
    ctx.globalCompositeOperation = 'screen'; // This makes them glow when overlapping

    for (const blob of this.blobs) {
      const gradient = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.radius);
      gradient.addColorStop(0, blob.color);
      gradient.addColorStop(0.25, blob.color); // Solid core for sharper look
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over'; // Reset

    // 3. Apply Noise (Dithering)
    this.applyNoise();
  }

  applyNoise() {
    const { width, height, ctx } = this;

    // This is a simplified noise pass.
    // For performance, usually one would pre-generate a noise canvas and tile it.
    // But generating random pixels every frame creates static TV effect.
    // To fix banding we just need static noise.
    // Let's create a static noise pattern once if it doesn't exist.

    if (!this.noisePattern) {
      const noiseCanvas = document.createElement('canvas');
      noiseCanvas.width = 200;
      noiseCanvas.height = 200;
      const nCtx = noiseCanvas.getContext('2d')!;
      const imgData = nCtx.createImageData(200, 200);
      const buffer = new Uint32Array(imgData.data.buffer);

      for (let i = 0; i < buffer.length; i++) {
        if (Math.random() < 0.20) { // 20% density for even finer grain
          // White pixel with extremely low alpha (0x02 ~= 0.8% opacity)
          buffer[i] = 0x02FFFFFF;
        }
      } nCtx.putImageData(imgData, 0, 0);
      this.noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
    }

    if (this.noisePattern) {
      ctx.fillStyle = this.noisePattern as CanvasPattern;
      ctx.fillRect(0, 0, width, height);
    }
  }

  animate() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

// Start Renderer
fetchAndRenderCards();
new BackgroundRenderer();
