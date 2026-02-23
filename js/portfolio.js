/* ============================================
   TREEZ AFRICA SYSTEMS — Partners Page JS
   Dancing Code Character (Canvas Animation)
   ============================================ */

(function () {
  const canvas = document.getElementById('codeCharCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  // Physical size
  const W = 90, H = 120;
  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  ctx.scale(DPR, DPR);

  // ---- Character definition ----
  // Body parts as relative coords (cx=45, cy=60 is body center)
  const CX = 45, CY = 60;

  let t = 0; // animation time

  // Colour palette — company brand
  const BLUE  = '#0052CC';
  const GREEN = '#00A651';
  const WHITE = '#ffffff';
  const DIM   = 'rgba(0,82,204,0.18)';

  // Floating code snippets cycling near the character
  const snippets = ['</>', '{ }', '=>', '01', '#!', '()'];
  let snippetIdx = 0;
  let snippetTimer = 0;

  function drawCharacter(time) {
    ctx.clearRect(0, 0, W, H);

    // ---- Shadow ----
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(CX, 115, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- Bob & bounce ----
    const bob   = Math.sin(time * 2.8) * 4;   // body bounce
    const lean  = Math.sin(time * 1.4) * 0.12; // body lean
    const bY    = CY + bob;                     // body Y with bounce

    ctx.save();
    ctx.translate(CX, bY);
    ctx.rotate(lean);

    // ---- Legs ----
    const legSwing = Math.sin(time * 3) * 14;
    // Left leg
    ctx.save();
    ctx.strokeStyle = BLUE;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 18);
    ctx.lineTo(-6 - legSwing * 0.4, 38);
    ctx.stroke();
    // Left foot
    ctx.beginPath();
    ctx.moveTo(-6 - legSwing * 0.4, 38);
    ctx.lineTo(-6 - legSwing * 0.4 - 7, 38);
    ctx.stroke();
    ctx.restore();

    // Right leg
    ctx.save();
    ctx.strokeStyle = BLUE;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 18);
    ctx.lineTo(6 + legSwing * 0.4, 38);
    ctx.stroke();
    // Right foot
    ctx.beginPath();
    ctx.moveTo(6 + legSwing * 0.4, 38);
    ctx.lineTo(6 + legSwing * 0.4 + 7, 38);
    ctx.stroke();
    ctx.restore();

    // ---- Arms ----
    const armSwing = Math.sin(time * 2.8) * 20;
    // Left arm
    ctx.save();
    ctx.strokeStyle = GREEN;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(-9 - armSwing * 0.5, 10 + armSwing * 0.2);
    ctx.stroke();
    ctx.restore();

    // Right arm — holds a laptop/code symbol
    ctx.save();
    ctx.strokeStyle = GREEN;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(9, -4);
    ctx.lineTo(9 + armSwing * 0.5, 10 - armSwing * 0.2);
    ctx.stroke();
    // Tiny laptop icon at hand
    const lx = 9 + armSwing * 0.5;
    const ly = 10 - armSwing * 0.2;
    ctx.fillStyle   = BLUE;
    ctx.strokeStyle = BLUE;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.roundRect(lx + 3, ly - 6, 14, 9, 2);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 5px monospace';
    ctx.fillText('/>', lx + 5, ly - 0.5);
    ctx.restore();

    // ---- Body ----
    const bodyGrad = ctx.createLinearGradient(-10, -18, 10, 18);
    bodyGrad.addColorStop(0, BLUE);
    bodyGrad.addColorStop(1, GREEN);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(-10, -18, 20, 36, 8);
    ctx.fill();

    // Code symbol on chest
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font      = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('<>', 0, -4);

    // ---- Head ----
    const headBob = Math.sin(time * 2.8) * 1.5;
    ctx.save();
    ctx.translate(0, -30 + headBob);

    // Head circle
    const headGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
    headGrad.addColorStop(0, '#e8d5c0');
    headGrad.addColorStop(1, '#c9a882');
    ctx.fillStyle   = headGrad;
    ctx.strokeStyle = BLUE;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eyes — blink every few seconds
    const blink = (Math.floor(time * 2) % 6 === 0) ? 0.5 : 4;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(-4.5, -1, 2, blink, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 4.5, -1, 2, blink, 0, 0, Math.PI * 2); ctx.fill();

    // Smile
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.arc(0, 2, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Tiny graduation cap / headset
    ctx.fillStyle   = BLUE;
    ctx.strokeStyle = BLUE;
    ctx.lineWidth   = 1.5;
    // Cap brim
    ctx.beginPath();
    ctx.ellipse(0, -12, 11, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Cap top
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.rect(-6, -20, 12, 8);
    ctx.fill();
    // Tassel
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, -16);
    ctx.lineTo(10, -10);
    ctx.stroke();
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(10, -9, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // end head

    ctx.restore(); // end body translate+rotate

    // ---- Floating code snippet bubble ----
    snippetTimer += 0.016;
    if (snippetTimer > 2.2) { snippetTimer = 0; snippetIdx = (snippetIdx + 1) % snippets.length; }
    const bubbleAlpha = Math.min(1, Math.min(snippetTimer, 2.2 - snippetTimer) * 3);
    const bubbleY     = bY - 42 - snippetTimer * 8;

    ctx.save();
    ctx.globalAlpha = bubbleAlpha;
    ctx.fillStyle   = 'rgba(0,82,204,0.9)';
    ctx.beginPath();
    ctx.roundRect(CX - 16, bubbleY - 11, 32, 18, 6);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.font      = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(snippets[snippetIdx], CX, bubbleY + 2);
    ctx.restore();
  }

  function loop() {
    t += 0.016;
    drawCharacter(t);
    requestAnimationFrame(loop);
  }

  loop();
})();
