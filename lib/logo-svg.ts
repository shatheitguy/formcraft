/**
 * The brand mark: a glossy accent-gradient tile with a stylised form — a ticked checkbox,
 * a selected radio and a submit button. Colours are passed in so the same artwork serves both the
 * React <Logo> (CSS variables) and the favicon route (hex values).
 */
export interface LogoColors {
  light: string;
  mid: string;
  dark: string;
}

export function logoSvgBody(c: LogoColors, id: string) {
  return `
<defs>
  <linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c.light}"/>
    <stop offset=".55" stop-color="${c.mid}"/>
    <stop offset="1" stop-color="${c.dark}"/>
  </linearGradient>
  <linearGradient id="${id}-gloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".35"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect width="32" height="32" rx="9" fill="url(#${id}-bg)"/>
<circle cx="27" cy="5" r="9" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>
<path d="M9 0h14a9 9 0 0 1 9 9v2.5C24 15 12 15.5 0 12.5V9a9 9 0 0 1 9-9z" fill="url(#${id}-gloss)"/>
<rect x="7.5" y="7.5" width="5.2" height="5.2" rx="1.4" fill="none" stroke="#fff" stroke-width="1.6"/>
<path d="M8.9 10.2l1.2 1.2 2.3-2.6" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="15" y="8.9" width="9.5" height="2.3" rx="1.15" fill="#fff" fill-opacity=".9"/>
<circle cx="10.1" cy="16.6" r="2.5" fill="none" stroke="#fff" stroke-width="1.6"/>
<circle cx="10.1" cy="16.6" r="1.05" fill="#fff"/>
<rect x="15" y="15.45" width="6.5" height="2.3" rx="1.15" fill="#fff" fill-opacity=".7"/>
<rect x="7.5" y="21.4" width="11" height="3.6" rx="1.8" fill="#fff"/>
<circle cx="23.2" cy="23.2" r="1.5" fill="#fff" fill-opacity=".85"/>
<rect x=".5" y=".5" width="31" height="31" rx="8.5" fill="none" stroke="#fff" stroke-opacity=".18"/>`;
}

export function logoSvg(c: LogoColors) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${logoSvgBody(c, 'sha')}</svg>`;
}
