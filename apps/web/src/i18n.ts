export type Lang = 'da' | 'en';

type Dict = Record<string, string>;

const da: Dict = {
    'app.name': 'BodegaDK',
    'nav.play': 'Spil',
    'nav.settings': 'Indstillinger',
    'nav.help': 'Hjælp',
    'top.login': 'Log ind',
    'top.signup': 'Opret konto',
    'top.profile': 'Profil',
    'home.title': 'Velkommen i BodegaDK',
    'home.subtitle': 'Vælg et spil til venstre — og husk: taber betaler næste omgang.',
    'play.title': 'Vælg et spil',
    'play.subtitle': 'Vælg en klassiker. Flere spil kommer løbende.',
    'game.cheat': 'Snyd',
    'single.card.highest.wins': 'Single Card Highest Wins',
    'game.500': '500',
    'game.dice': 'Terningespil',
    'game.more': 'Flere spil (kommer snart)',
    'action.play': 'Spil',
    'action.open': 'Åbn',
};

const en: Dict = {
    'app.name': 'BodegaDK',
    'nav.play': 'Play',
    'nav.settings': 'Settings',
    'nav.help': 'Help',
    'top.login': 'Log in',
    'top.signup': 'Create account',
    'top.profile': 'Profile',
    'home.title': 'Play with friends',
    'home.subtitle': 'Choose a game from the left menu. More games and online multiplayer coming later.',
    'play.title': 'Choose a game',
    'play.subtitle': 'Placeholders until game logic is connected.',
    'game.cheat': 'Cheat',
    'single.card.highest.wins': 'Single Card Highest Wins',
    'game.500': '500',
    'game.dice': 'Dice game',
    'game.more': 'More games (soon)',
    'action.play': 'Play',
    'action.open': 'Open',
};

const dictionaries: Record<Lang, Dict> = { da, en };

export function getInitialLang(): Lang {
    const stored = localStorage.getItem('lang');
    if (stored === 'da' || stored === 'en') return stored;

    // Default dansk
    return 'da';
}

export function setLang(lang: Lang) {
    localStorage.setItem('lang', lang);
}

export function t(lang: Lang, key: string): string {
    return dictionaries[lang][key] ?? key;
}

export function applyI18n(root: ParentNode, lang: Lang) {
    const nodes = root.querySelectorAll<HTMLElement>('[data-i18n]');
    nodes.forEach((el) => {
        const key = el.dataset.i18n;
        if (!key) return;
        el.textContent = t(lang, key);
    });
}
