// Redes sociais disponíveis para o cartão de destaque (site e admin): nome, texto do botão e ícone.
(function () {
  const stroke = (d) => `<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
  const NETWORKS = {
    youtube: {
      name: "YouTube", action: "Assistir no YouTube",
      icon: '<path fill="currentColor" fill-rule="evenodd" d="M3 8.2C3 6.4 4.4 5 6.2 4.9 8 4.8 10 4.7 12 4.7s4 .1 5.8.2C19.6 5 21 6.4 21 8.2v7.6c0 1.8-1.4 3.2-3.2 3.3-1.8.1-3.8.2-5.8.2s-4-.1-5.8-.2C4.4 19 3 17.6 3 15.8ZM10 9v6l5.2-3Z"/>',
    },
    instagram: {
      name: "Instagram", action: "Ver no Instagram",
      icon: stroke('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>'),
    },
    tiktok: {
      name: "TikTok", action: "Ver no TikTok",
      icon: stroke('<path d="M14 3.5v11a3.75 3.75 0 1 1-3.75-3.75"/><path d="M14 3.5c.5 2.7 2.3 4.4 5 4.6"/>'),
    },
    spotify: {
      name: "Spotify", action: "Ouvir no Spotify",
      icon: stroke('<circle cx="12" cy="12" r="9"/><path d="M7.3 9.6c3.1-1 6.7-.8 9.4.7M7.9 12.7c2.6-.7 5.3-.5 7.5.8M8.6 15.6c1.9-.5 3.9-.3 5.5.6"/>'),
    },
    facebook: {
      name: "Facebook", action: "Ver no Facebook",
      icon: stroke('<circle cx="12" cy="12" r="9"/><path d="M15 7.6h-1.6c-1.2 0-1.9.8-1.9 2V21M9.2 12.8h5.3"/>'),
    },
    threads: {
      name: "Threads", action: "Ver no Threads",
      icon: stroke('<circle cx="12" cy="12" r="3.3"/><path d="M15.3 9v4.1c0 1.3.9 2.2 2 2.2 1.5 0 2.2-1.5 2.2-3.3A7.5 7.5 0 1 0 16 18.6"/>'),
    },
    soundcloud: {
      name: "SoundCloud", action: "Ouvir no SoundCloud",
      icon: stroke('<path d="M3 16.5v-2.5M5.5 16.5v-4.5M8 16.5V10M10.5 16.5V8.4c1-.6 2.1-.9 3.3-.9 3 0 5.4 2.1 5.9 4.9 1.4.2 2.3 1.2 2.3 2.4 0 1.4-1.1 2.2-2.4 2.2H10.5"/>'),
    },
    deezer: {
      name: "Deezer", action: "Ouvir no Deezer",
      icon: '<g fill="currentColor"><rect x="2.5" y="16.2" width="4" height="2.4" rx=".6"/><rect x="7.6" y="16.2" width="4" height="2.4" rx=".6"/><rect x="7.6" y="12.9" width="4" height="2.4" rx=".6"/><rect x="12.7" y="16.2" width="4" height="2.4" rx=".6"/><rect x="12.7" y="12.9" width="4" height="2.4" rx=".6"/><rect x="12.7" y="9.6" width="4" height="2.4" rx=".6"/><rect x="17.8" y="16.2" width="4" height="2.4" rx=".6"/><rect x="17.8" y="12.9" width="4" height="2.4" rx=".6"/><rect x="17.8" y="9.6" width="4" height="2.4" rx=".6"/><rect x="17.8" y="6.3" width="4" height="2.4" rx=".6"/></g>',
    },
    applemusic: {
      name: "Apple Music", action: "Ouvir no Apple Music",
      icon: stroke('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M15.5 7v7.6a1.9 1.9 0 1 1-1.9-1.9h1.9M15.5 7 10 8.3v7.8a1.9 1.9 0 1 1-1.9-1.9H10"/>'),
    },
    whatsapp: {
      name: "WhatsApp", action: "Falar no WhatsApp",
      icon: '<path fill="currentColor" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.57.93.95-3.48-.22-.36a9.43 9.43 0 0 1-1.45-5.03c0-5.2 4.24-9.44 9.45-9.44a9.4 9.4 0 0 1 6.68 2.77 9.38 9.38 0 0 1 2.76 6.68c0 5.21-4.24 9.44-9.45 9.44zm8.04-17.48A11.3 11.3 0 0 0 12.05.68C5.78.68.68 5.78.68 12.05c0 2 .52 3.96 1.52 5.69L.58 23.62l6.02-1.58a11.33 11.33 0 0 0 5.44 1.39h.01c6.27 0 11.37-5.1 11.37-11.37 0-3.04-1.18-5.9-3.33-8.04z"/>',
    },
    link: {
      name: "Outro link", action: "Abrir link",
      icon: stroke('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.3 1.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.3-1.3"/>'),
    },
  };

  const svg = (key) => {
    const n = NETWORKS[key] || NETWORKS.link;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${n.icon}</svg>`;
  };

  window.SocialNetworks = { NETWORKS, svg };
})();
