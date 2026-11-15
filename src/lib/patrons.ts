import hiddenKing from './assets/patron/Hidden_king_art.png';
import archmother from './assets/patron/Archmother_art.png';
import hiddenKingIcon from './assets/patron/icon/Hidden_King.png';
import archmotherIcon from './assets/patron/icon/Archmother.png';
import type { Team } from './types.ts';

/** Patron art per team. Each image already has the patron's name painted into it. */
export const PATRON_ART: Record<Team, string> = { A: hiddenKing, B: archmother };

/** Square patron emblems with transparent backgrounds. */
export const PATRON_ICON: Record<Team, string> = { A: hiddenKingIcon, B: archmotherIcon };
