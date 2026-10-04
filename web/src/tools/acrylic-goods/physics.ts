/**
 * 搖搖樂的物理（cannon-es，cannon.js 的維護分支）：沿著外框立一圈很厚的牆，零件是球形的碰撞體，
 * 只在外框與前蓋之間的平面上移動（每一步把 z 拉回去、只留繞 z 軸的轉動）。規格 3.3。
 */
import {
  Body,
  Box,
  ContactMaterial,
  Material,
  Quaternion,
  SAPBroadphase,
  Sphere,
  Vec3,
  World,
} from 'cannon-es';
import type { Pt } from './contour';
import type { ShakerDims, Wall } from './plan';

/** 零件與牆的摩擦、彈性（舊版的值） */
export const FRICTION = 0.1;
export const RESTITUTION = 0.6;
/** 物理一步的時間（秒） */
export const STEP = 1 / 60;

export interface PhysicsPart {
  body: Body;
  /** 零件固定的深度 */
  z: number;
}

export interface ShakerPhysics {
  world: World;
  parts: PhysicsPart[];
  /** 前進一步（h 秒），重力 g（周邊自己的座標） */
  step(g: Pt, h?: number): void;
  /** 存下／還原所有零件的狀態（匯出前後） */
  snapshot(): () => void;
}

export function createShakerPhysics(
  walls: readonly Wall[],
  parts: readonly { x: number; y: number; radius: number; mass: number }[],
  dims: ShakerDims,
): ShakerPhysics {
  const world = new World();
  world.broadphase = new SAPBroadphase(world);
  const mat = new Material();
  world.addContactMaterial(
    new ContactMaterial(mat, mat, { friction: FRICTION, restitution: RESTITUTION }),
  );
  const zAxis = new Vec3(0, 0, 1);
  for (const w of walls) {
    const body = new Body({ mass: 0, material: mat });
    body.addShape(new Box(new Vec3(w.halfLength, w.halfWidth, w.halfDepth)));
    body.position.set(w.x, w.y, w.z);
    const q = new Quaternion();
    q.setFromAxisAngle(zAxis, w.angle);
    body.quaternion.copy(q);
    world.addBody(body);
  }
  const list: PhysicsPart[] = parts.map((p) => {
    const body = new Body({ mass: p.mass, material: mat });
    body.addShape(new Sphere(p.radius));
    body.position.set(p.x, p.y, dims.partZ);
    world.addBody(body);
    return { body, z: dims.partZ };
  });

  return {
    world,
    parts: list,
    step(g, h = STEP) {
      world.gravity.set(g.x, g.y, 0);
      world.step(h);
      for (const p of list) {
        p.body.position.z = p.z;
        p.body.velocity.z = 0;
        p.body.angularVelocity.x = 0;
        p.body.angularVelocity.y = 0;
        p.body.wakeUp();
      }
    },
    snapshot() {
      const saved = list.map((p) => ({
        pos: p.body.position.clone(),
        vel: p.body.velocity.clone(),
        q: p.body.quaternion.clone(),
        av: p.body.angularVelocity.clone(),
      }));
      return () => {
        list.forEach((p, i) => {
          const s = saved[i];
          p.body.position.copy(s.pos);
          p.body.velocity.copy(s.vel);
          p.body.quaternion.copy(s.q);
          p.body.angularVelocity.copy(s.av);
        });
      };
    },
  };
}
