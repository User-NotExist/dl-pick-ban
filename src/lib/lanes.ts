import { LANES } from './types.ts';

type LaneId = (typeof LANES)[number]['id'];

/** Static class names per lane so Tailwind can see them. */
export const LANE_STYLE: Record<LaneId, { text: string; border: string; bg: string }> = {
	yellow: { text: 'text-lane-yellow', border: 'border-lane-yellow', bg: 'bg-lane-yellow' },
	blue: { text: 'text-lane-blue', border: 'border-lane-blue', bg: 'bg-lane-blue' },
	green: { text: 'text-lane-green', border: 'border-lane-green', bg: 'bg-lane-green' }
};
