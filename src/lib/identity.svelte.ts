import { browser } from '$app/env';

const NAME_KEY = 'pickban:name';
const TOKEN_KEY = 'pickban:token';

function read(key: string): string {
	try {
		return localStorage.getItem(key) ?? '';
	} catch {
		return '';
	}
}

function write(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// storage unavailable: identity lasts for this page only
	}
}

class Identity {
	name = $state('');
	token = '';

	constructor() {
		if (!browser) return;
		this.name = read(NAME_KEY);
		this.token = read(TOKEN_KEY);
		if (!this.token) {
			this.token = crypto.randomUUID();
			write(TOKEN_KEY, this.token);
		}
	}

	setName(name: string) {
		this.name = name.trim().replace(/\s+/g, ' ').slice(0, 20);
		write(NAME_KEY, this.name);
	}
}

export const identity = new Identity();
