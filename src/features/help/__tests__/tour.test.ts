import { describe, expect, it } from 'vitest';
import { placeCard, TOUR } from '../tour';

const vp = { width: 1000, height: 800 };
const card = { width: 300, height: 160 };

describe('tour placement', () => {
  it('goes below the target when it fits', () => {
    const p = placeCard({ top: 100, left: 400, width: 200, height: 40 }, card, vp);
    expect(p.side).toBe('below');
    expect(p.top).toBe(154);
    expect(p.left).toBe(350);
  });
  it('goes above near the bottom', () => {
    const p = placeCard({ top: 700, left: 400, width: 200, height: 40 }, card, vp);
    expect(p.side).toBe('above');
    expect(p.top).toBe(700 - 14 - 160);
  });
  it('stays inside the viewport horizontally', () => {
    expect(placeCard({ top: 100, left: 0, width: 20, height: 20 }, card, vp).left).toBe(12);
    expect(placeCard({ top: 100, left: 990, width: 10, height: 20 }, card, vp).left).toBe(1000 - 300 - 12);
  });
  it('centers when there is no target or no room', () => {
    expect(placeCard(null, card, vp)).toEqual({ top: 320, left: 350, side: 'center' });
    expect(placeCard({ top: 0, left: 0, width: 1000, height: 800 }, card, vp).side).toBe('center');
  });
  it('every step has both languages', () => {
    TOUR.forEach((s) => { expect(s.ar[0] && s.ar[1] && s.en[0] && s.en[1]).toBeTruthy(); });
  });
});
