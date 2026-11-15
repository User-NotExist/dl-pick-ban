/** Hero ids match the asset filenames: hero-card/<id>_card.png and ban-hero-card/<id>_Critical.png */
export const HERO_IDS = [
	'Abrams', 'Apollo', 'Baba', 'Bebop', 'Billy', 'Calico', 'Celeste', 'Deadman_Danny', 'Drifter',
	'Dynamo', 'Graves', 'Grey_Talon', 'Haze', 'Holliday', 'Infernus', 'Ivy', 'Kelvin', 'Lady_Geist',
	'Lash', 'McGinnis', 'Mina', 'Mirage', 'Mo_&_Krill', 'Nurse_Harrow', 'Paige', 'Paradox', 'Pocket',
	'Rat_King', 'Rem', 'Seven', 'Shiv', 'Silver', 'Sinclair', 'Solomon', 'The_Doorman', 'Venator',
	'Victor', 'Vindicta', 'Violet', 'Viscous', 'Vyper', 'Warden', 'Wraith', 'Yamato'
] as const;

export const heroName = (id: string) => id.replaceAll('_', ' ');
