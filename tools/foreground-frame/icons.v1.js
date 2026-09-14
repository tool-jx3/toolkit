/*!
 * icons.v1.js - extra icons for variant labels (weather, scene, sanity...)
 *
 * Each draws centered at (x, y) within radius r. The caller sets fillStyle,
 * strokeStyle, lineWidth (r * 0.14) and round caps beforehand.
 */
(function () {
  "use strict";

  const TAU = Math.PI * 2;

  function cloud(c, x, y, r) {
    for (const [dx, dy, rr] of [[-0.42, 0.12, 0.36], [0.02, -0.12, 0.5], [0.46, 0.16, 0.32]]) {
      c.beginPath();
      c.arc(x + dx * r, y + dy * r, rr * r, 0, TAU);
      c.fill();
    }
    c.beginPath();
    c.roundRect(x - r * 0.78, y + r * 0.1, r * 1.56, r * 0.38, r * 0.19);
    c.fill();
  }

  window.FrameIcons = {
    rain(c, x, y, r) {
      cloud(c, x, y - r * 0.28, r * 0.8);
      c.beginPath();
      for (const dx of [-0.42, 0, 0.42]) {
        c.moveTo(x + dx * r, y + r * 0.38);
        c.lineTo(x + dx * r - r * 0.14, y + r * 0.88);
      }
      c.stroke();
    },
    snow(c, x, y, r) {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3, ux = Math.cos(a), uy = Math.sin(a);
        c.moveTo(x, y);
        c.lineTo(x + ux * r * 0.92, y + uy * r * 0.92);
        const bx = x + ux * r * 0.55, by = y + uy * r * 0.55;
        for (const t of [0.75, -0.75]) {
          c.moveTo(bx, by);
          c.lineTo(bx + Math.cos(a + t) * r * 0.3, by + Math.sin(a + t) * r * 0.3);
        }
      }
      c.stroke();
    },
    fog(c, x, y, r) {
      c.beginPath();
      for (const [dy, w] of [[-0.45, 0.8], [0, 0.95], [0.45, 0.7]]) {
        const yy = y + dy * r;
        c.moveTo(x - w * r, yy);
        c.bezierCurveTo(x - w * r * 0.4, yy - r * 0.18, x + w * r * 0.1, yy + r * 0.18, x + w * r, yy);
      }
      c.stroke();
    },
    bolt(c, x, y, r) {
      c.beginPath();
      c.moveTo(x + r * 0.2, y - r);
      c.lineTo(x - r * 0.55, y + r * 0.12);
      c.lineTo(x - r * 0.02, y + r * 0.12);
      c.lineTo(x - r * 0.25, y + r);
      c.lineTo(x + r * 0.58, y - r * 0.2);
      c.lineTo(x + r * 0.05, y - r * 0.2);
      c.closePath();
      c.fill();
    },
    flower(c, x, y, r) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5;
        c.beginPath();
        c.arc(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.3, 0, TAU);
        c.fill();
      }
      c.beginPath();
      c.arc(x, y, r * 0.14, 0, TAU);
      c.fill();
    },
    leaf(c, x, y, r) {
      c.save();
      c.translate(x, y);
      c.rotate(-Math.PI / 4);
      c.beginPath();
      c.moveTo(0, r);
      c.bezierCurveTo(-r * 0.85, r * 0.3, -r * 0.7, -r * 0.6, 0, -r);
      c.bezierCurveTo(r * 0.7, -r * 0.6, r * 0.85, r * 0.3, 0, r);
      c.moveTo(0, r * 1.05);
      c.lineTo(0, -r * 0.55);
      c.stroke();
      c.restore();
    },
    heart(c, x, y, r) {
      c.beginPath();
      c.moveTo(x, y + r * 0.85);
      c.bezierCurveTo(x - r * 1.25, y - r * 0.05, x - r * 0.55, y - r * 1.05, x, y - r * 0.4);
      c.bezierCurveTo(x + r * 0.55, y - r * 1.05, x + r * 1.25, y - r * 0.05, x, y + r * 0.85);
      c.fill();
    },
    search(c, x, y, r) {
      c.beginPath();
      c.arc(x - r * 0.15, y - r * 0.15, r * 0.55, 0, TAU);
      c.moveTo(x + r * 0.25, y + r * 0.25);
      c.lineTo(x + r * 0.85, y + r * 0.85);
      c.stroke();
    },
    swords(c, x, y, r) {
      c.beginPath();
      for (const s of [1, -1]) {
        const sx = x - s * r * 0.8, sy = y + r * 0.8;
        c.moveTo(sx, sy);
        c.lineTo(x + s * r * 0.78, y - r * 0.78);
        const gx = sx + s * r * 0.32, gy = sy - r * 0.32, px = r * 0.24, py = s * r * 0.24;
        c.moveTo(gx - px, gy - py);
        c.lineTo(gx + px, gy + py);
      }
      c.stroke();
    },
    alert(c, x, y, r) {
      c.beginPath();
      c.moveTo(x, y - r * 0.9);
      c.lineTo(x + r * 0.95, y + r * 0.75);
      c.lineTo(x - r * 0.95, y + r * 0.75);
      c.closePath();
      c.moveTo(x, y - r * 0.3);
      c.lineTo(x, y + r * 0.2);
      c.stroke();
      c.beginPath();
      c.arc(x, y + r * 0.48, r * 0.09, 0, TAU);
      c.fill();
    },
    eye(c, x, y, r) {
      c.beginPath();
      c.moveTo(x - r * 0.95, y);
      c.quadraticCurveTo(x, y - r * 0.95, x + r * 0.95, y);
      c.quadraticCurveTo(x, y + r * 0.95, x - r * 0.95, y);
      c.stroke();
      c.beginPath();
      c.arc(x, y, r * 0.3, 0, TAU);
      c.fill();
    },
    skull(c, x, y, r) {
      c.beginPath();
      c.arc(x, y - r * 0.15, r * 0.72, Math.PI * 0.78, Math.PI * 2.22);
      c.lineTo(x + r * 0.42, y + r * 0.85);
      c.lineTo(x - r * 0.42, y + r * 0.85);
      c.closePath();
      c.stroke();
      for (const dx of [-0.3, 0.3]) {
        c.beginPath();
        c.arc(x + dx * r, y - r * 0.1, r * 0.17, 0, TAU);
        c.fill();
      }
      c.beginPath();
      c.moveTo(x, y + r * 0.2);
      c.lineTo(x - r * 0.1, y + r * 0.42);
      c.lineTo(x + r * 0.1, y + r * 0.42);
      c.fill();
    },
    clock(c, x, y, r) {
      c.beginPath();
      c.arc(x, y, r * 0.85, 0, TAU);
      c.moveTo(x, y);
      c.lineTo(x, y - r * 0.5);
      c.moveTo(x, y);
      c.lineTo(x + r * 0.38, y + r * 0.1);
      c.stroke();
    },
    book(c, x, y, r) {
      c.beginPath();
      c.moveTo(x, y - r * 0.55);
      c.quadraticCurveTo(x - r * 0.45, y - r * 0.8, x - r * 0.95, y - r * 0.6);
      c.lineTo(x - r * 0.95, y + r * 0.65);
      c.quadraticCurveTo(x - r * 0.45, y + r * 0.45, x, y + r * 0.7);
      c.quadraticCurveTo(x + r * 0.45, y + r * 0.45, x + r * 0.95, y + r * 0.65);
      c.lineTo(x + r * 0.95, y - r * 0.6);
      c.quadraticCurveTo(x + r * 0.45, y - r * 0.8, x, y - r * 0.55);
      c.lineTo(x, y + r * 0.7);
      c.stroke();
    },
  };
})();
