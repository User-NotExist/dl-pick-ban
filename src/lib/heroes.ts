import { HERO_IDS, heroName } from './hero-ids';

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

export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
