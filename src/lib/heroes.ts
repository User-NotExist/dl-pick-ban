import { HERO_IDS, heroName } from './hero-ids';
import { RANDOM_HERO } from './types';

const cards = import.meta.glob<string>('./assets/hero-card/*_card.png', {
	eager: true,
	query: '?url',
	import: 'default'
});
const banned = import.meta.glob<string>('./assets/ban-hero-card/*_Critical.png', {
	eager: true,
	query: '?url',
	import: 'default'
});

export interface Hero {
	id: string;
	name: string;
	card: string;
	banned: string;
}

export const HEROES: Hero[] = HERO_IDS.map((id) => ({
	id,
	name: heroName(id),
	card: cards[`./assets/hero-card/${id}_card.png`],
	banned: banned[`./assets/ban-hero-card/${id}_Critical.png`]
}));

/** The "surprise me" card in the pick pool: a question mark instead of a portrait. */
const RANDOM_CARD =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 190'%3E%3Crect width='140' height='190' fill='%231c1917'/%3E%3Crect x='7' y='7' width='126' height='176' fill='none' stroke='%23efe6d5' stroke-opacity='.25' stroke-width='2' stroke-dasharray='8 6'/%3E%3Ctext x='70' y='122' text-anchor='middle' font-family='Arial Narrow%2CArial%2Csans-serif' font-style='italic' font-weight='800' font-size='120' fill='%23efe6d5'%3E%3F%3C/text%3E%3C/svg%3E";
export const RANDOM: Hero = { id: RANDOM_HERO, name: 'Random', card: RANDOM_CARD, banned: RANDOM_CARD };

/** every hero, plus the random card so a selection of it resolves like any other */
export const HERO_BY_ID = new Map([...HEROES, RANDOM].map((h) => [h.id, h]));
