const fs = require('fs');

const path = 'assets/js/review-fisheye.js';
let code = fs.readFileSync(path, 'utf8');

// 1. Add this.isHovered and autoScrollSpeed in constructor
const targetConstructor = `    this.autoScrollSpeed = 0.22;
    this.lastInteractionTime = 0;`;

const replConstructor = `    this.autoScrollSpeed = 0.32;
    this.isHovered = false;
    this.lastInteractionTime = 0;`;

if (!code.includes(targetConstructor)) {
  console.error('Target constructor not found!');
  process.exit(1);
}
code = code.replace(targetConstructor, replConstructor);

// 2. Add hover listeners to this.container in bindEvents
const targetMousedown = `    this.container.addEventListener("mousedown", handleMouseDown, { passive: true });`;
const replMousedown = `    this.container.addEventListener("mouseenter", () => {
      this.isHovered = true;
    });
    this.container.addEventListener("mouseleave", () => {
      this.isHovered = false;
      this.lastInteractionTime = performance.now();
    });

    this.container.addEventListener("mousedown", handleMouseDown, { passive: true });`;

if (!code.includes(targetMousedown)) {
  console.error('Target mousedown not found!');
  process.exit(1);
}
code = code.replace(targetMousedown, replMousedown);

// 3. Update setupObserver to include window scroll listener fallback
const targetObserver = `  setupObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.isInViewport = entry.isIntersecting;
        if (this.isInViewport && !this.rafId) {
          this.lastFrameTime = performance.now();
          this.rafId = requestAnimationFrame(this.animate);
        } else if (!this.isInViewport && this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      });
    }, { threshold: 0 });
    this.observer.observe(this.container);
  }`;

const replObserver = `  setupObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.isInViewport = entry.isIntersecting;
        if (this.isInViewport && !this.rafId) {
          this.lastFrameTime = performance.now();
          this.rafId = requestAnimationFrame(this.animate);
        } else if (!this.isInViewport && this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      });
    }, { threshold: 0.05, rootMargin: "150px 0px" });
    this.observer.observe(this.container);

    window.addEventListener("scroll", () => {
      if (this.isInViewport && !this.rafId) {
        this.lastFrameTime = performance.now();
        this.rafId = requestAnimationFrame(this.animate);
      }
    }, { passive: true });
  }`;

if (!code.includes(targetObserver)) {
  console.error('Target observer not found!');
  process.exit(1);
}
code = code.replace(targetObserver, replObserver);

// 4. Update animate()
const targetAnimate = `  animate() {
    const isSettled = Math.abs(this.targetPos - this.pos) < 0.0006;
    if (!this.isInViewport || (window.__isPageScrolling && isSettled && !this.isDragging)) {
      this.rafId = null;
      return;
    }
    this.rafId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0.016;
    this.lastFrameTime = now;

    // Gentle auto-scroll after 6 seconds of inactivity
    if (!this.isDragging && !window.__isPageScrolling && now - this.lastInteractionTime > 6000) {
      this.targetPos += this.autoScrollSpeed * dt;
    }

    const prevPos = this.pos;
    const lerpRate = this.isDragging ? 0.28 : 0.088;
    this.pos += (this.targetPos - this.pos) * lerpRate;

    if (isSettled && !this.isDragging) {
      this.pos = this.targetPos;
    }

    const cardsMoved = Math.abs(this.pos - prevPos) > 0.0001 || this.isDragging || !this._hasRenderedCube;
    const currentCard = Math.round(this.pos);
    if (currentCard !== this.lastIntPos) {
      this.lastIntPos = currentCard;
      this.audio.playTick(0.88);
    }

    const currentDetent = Math.floor(this.pos * 3.5);
    if (currentDetent !== this.lastDetent && Math.abs(this.targetPos - this.pos) > 0.015) {
      this.lastDetent = currentDetent;
      this.audio.playTick(0.55);
    }`;

const replAnimate = `  animate() {
    if (!this.isInViewport) {
      this.rafId = null;
      return;
    }
    this.rafId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = this.lastFrameTime ? Math.min((now - this.lastFrameTime) / 1000, 0.1) : 0.016;
    this.lastFrameTime = now;

    // Automatic continuous smooth auto-scrolling on Phone & PC view
    // Pauses when user is actively dragging or hovering on desktop, resumes after 1.2s grace period
    const canAutoScroll = !this.isDragging && !this.isHovered && (now - this.lastInteractionTime > 1200);
    if (canAutoScroll) {
      this.targetPos += this.autoScrollSpeed * dt;
    }

    const prevPos = this.pos;
    const lerpRate = this.isDragging ? 0.28 : (canAutoScroll ? 0.068 : 0.088);
    this.pos += (this.targetPos - this.pos) * lerpRate;

    const isSettled = Math.abs(this.targetPos - this.pos) < 0.0006;
    if (isSettled && !this.isDragging && !canAutoScroll) {
      this.pos = this.targetPos;
    }

    const cardsMoved = Math.abs(this.pos - prevPos) > 0.0001 || this.isDragging || !this._hasRenderedCube;
    const currentCard = Math.round(this.pos);
    if (this.isDragging && currentCard !== this.lastIntPos) {
      this.lastIntPos = currentCard;
      this.audio.playTick(0.88);
    }

    const currentDetent = Math.floor(this.pos * 3.5);
    if (this.isDragging && currentDetent !== this.lastDetent && Math.abs(this.targetPos - this.pos) > 0.015) {
      this.lastDetent = currentDetent;
      this.audio.playTick(0.55);
    }`;

if (!code.includes(targetAnimate)) {
  console.error('Target animate not found!');
  process.exit(1);
}
code = code.replace(targetAnimate, replAnimate);

fs.writeFileSync(path, code, 'utf8');
console.log('Successfully updated assets/js/review-fisheye.js with auto-scroll!');
