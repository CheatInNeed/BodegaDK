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
    'home.hero.kicker': 'Forsiden v1',
    'home.hero.noteTitle': 'Status',
    'home.hero.note': 'Kun spiloversigten er live lige nu. Resten er tydelige pladsholdere, indtil backend og data er klar.',
    'home.hero.themesTitle': 'Temaer',
    'home.hero.themesBody': 'Den nye UI-ramme gør det muligt at sammenligne flere udtryk uden at ændre flow eller routing.',
    'home.hero.themeReady': '3 temaer klar',
    'home.card.continue.title': 'Fortsæt spil',
    'home.card.continue.desc': 'Genoptag sidste room kommer, når vi har gemte sessioner og sikker rejoin.',
    'home.card.quick.title': 'Rooms / Opret / Join',
    'home.card.quick.desc': 'Hop direkte ind i et room, opret dit eget bord, eller gå videre til lobby-browseren for at se åbne borde.',
    'home.card.quick.item.quick': 'Quick Play',
    'home.card.quick.item.create': 'Opret room',
    'home.card.quick.item.join': 'Join room',
    'home.card.quick.join.label': 'Join via kode',
    'home.card.quick.join.placeholder': 'ABC123',
    'home.card.quick.join.action': 'Join',
    'home.card.quick.create.action': 'Opret room',
    'home.card.quick.browse.action': 'Åbn lobby-browser',
    'home.section.games.kicker': 'Live nu',
    'home.section.games.title': 'Spilbibliotek',
    'home.section.games.desc': 'Spilbiblioteket viser kun de egentlige spil. Matchmaking og lobby-adgang ligger nu samlet i hurtigpanelet ovenfor.',
    'home.section.leaderboard.title': 'Leaderboard',
    'home.section.leaderboard.desc': 'Rankings og sæsoner vises her, når vi har en rigtig model for score og historik.',
    'home.section.profile.title': 'Profil',
    'home.section.profile.desc': 'Din brugerflade for navn, avatar, land og fremtidige præstationer lander her senere.',
    'home.section.friends.title': 'Invite / Venner',
    'home.section.friends.desc': 'Deling, vennekredse og invitationsflow kommer først, når room-links og sociale relationer er på plads.',
    'home.section.stats.title': 'Stats',
    'home.section.stats.desc': 'Samlet statistik som spil, sejre og streaks bliver først vist, når vi tracker dem stabilt.',
    'home.status.real': 'Real',
    'home.status.placeholder': 'Placeholder',
    'home.action.comingSoon': 'Kommer snart',
    'settings.theme.kicker': 'Udseende',
    'settings.theme.title': 'Aktivt tema',
    'settings.theme.badge': 'Lokal indstilling',
    'settings.theme.desc': 'Skift udtryk uden at ændre appens adfærd. Temaet gemmes lokalt i din browser.',
    'settings.theme.selectLabel': 'Vælg tema',
    'settings.theme.ariaLabel': 'Vælg tema',
    'settings.preview.kicker': 'Sammenligning',
    'settings.preview.title': 'Temaoversigt',
    'theme.bodega.label': 'Amber & Oak',
    'theme.bodega.tone': 'Varm bodega med rav, mørkt træ og creme.',
    'theme.harbor.label': 'Harbor Slate',
    'theme.harbor.tone': 'Køligere havnetoner med blågrå overflader og mint accent.',
    'theme.parlor.label': 'Rose Parlor',
    'theme.parlor.tone': 'Mørk lounge med kobber, rosé og blød elfenbenstekst.',
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
    'home.hero.kicker': 'Homepage v1',
    'home.hero.noteTitle': 'Status',
    'home.hero.note': 'Only game discovery is live right now. Everything else stays intentionally placeholder until backend and data support are verified.',
    'home.hero.themesTitle': 'Themes',
    'home.hero.themesBody': 'The new UI foundation lets us compare multiple looks without changing flow or routing.',
    'home.hero.themeReady': '3 themes ready',
    'home.card.continue.title': 'Continue Game',
    'home.card.continue.desc': 'Resume last room will arrive when we have stored sessions and a safe rejoin flow.',
    'home.card.quick.title': 'Rooms / Create / Join',
    'home.card.quick.desc': 'Jump straight into a room, host your own table, or head to the lobby browser to browse open tables.',
    'home.card.quick.item.quick': 'Quick Play',
    'home.card.quick.item.create': 'Create Room',
    'home.card.quick.item.join': 'Join Room',
    'home.card.quick.join.label': 'Join via code',
    'home.card.quick.join.placeholder': 'ABC123',
    'home.card.quick.join.action': 'Join',
    'home.card.quick.create.action': 'Create Room',
    'home.card.quick.browse.action': 'Open Lobby Browser',
    'home.section.games.kicker': 'Live now',
    'home.section.games.title': 'Game Library',
    'home.section.games.desc': 'The game library now shows only actual games. Matchmaking and lobby entry live together in the action hub above.',
    'home.section.leaderboard.title': 'Leaderboard',
    'home.section.leaderboard.desc': 'Rankings and seasons will appear here once we have a real model for score and history.',
    'home.section.profile.title': 'Profile',
    'home.section.profile.desc': 'Your home for name, avatar, country, and future achievements lands here later.',
    'home.section.friends.title': 'Invite / Friends',
    'home.section.friends.desc': 'Sharing, friend lists, and invite flows wait until room links and social relations are properly supported.',
    'home.section.stats.title': 'Stats',
    'home.section.stats.desc': 'Global player stats like games, wins, and streaks appear only when we track them reliably.',
    'home.status.real': 'Real',
    'home.status.placeholder': 'Placeholder',
    'home.action.comingSoon': 'Coming Soon',
    'settings.theme.kicker': 'Appearance',
    'settings.theme.title': 'Active Theme',
    'settings.theme.badge': 'Stored locally',
    'settings.theme.desc': 'Switch the look without changing app behavior. The selected theme is persisted in your browser.',
    'settings.theme.selectLabel': 'Choose theme',
    'settings.theme.ariaLabel': 'Choose theme',
    'settings.preview.kicker': 'Comparison',
    'settings.preview.title': 'Theme Gallery',
    'theme.bodega.label': 'Amber & Oak',
    'theme.bodega.tone': 'Warm bodega tones with amber, dark wood, and cream.',
    'theme.harbor.label': 'Harbor Slate',
    'theme.harbor.tone': 'Cooler harbor slate with blue-gray surfaces and mint accents.',
    'theme.parlor.label': 'Rose Parlor',
    'theme.parlor.tone': 'Dark lounge palette with copper, rose, and soft ivory text.',
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
