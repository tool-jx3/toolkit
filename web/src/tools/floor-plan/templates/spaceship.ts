import { FloorBuilder, type TplFloor } from './builder';

export function spaceship(): TplFloor[] {
  const b = new FloorBuilder('1F');
  b.room('TODO', 'hall', 0, 0, 4, 4);
  return [b.f];
}
