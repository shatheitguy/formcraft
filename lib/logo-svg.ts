/**
 * The FormCraft mark ("Colour bars"): a near-black tile with three form-field bars in green, sky and
 * amber and a white "cursor" dot — bold and readable from a 16px favicon up to the phone app icon.
 * It keeps fixed colours so it reads the same with every accent; the `LogoColors` argument is kept
 * for compatibility with older callers and is ignored. The master artwork is public/brand/formcraft-icon.svg.
 */
export interface LogoColors {
  light: string;
  mid: string;
  dark: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function logoSvgBody(_c?: LogoColors, _id?: string) {
  return `
<rect width="32" height="32" rx="7.7" fill="#0F172A"/>
<rect x=".5" y=".5" width="31" height="31" rx="7.2" fill="none" stroke="#fff" stroke-opacity=".1"/>
<rect x="6.4" y="7.7" width="19.2" height="3.84" rx="1.92" fill="#22C55E"/>
<rect x="6.4" y="14.08" width="13.44" height="3.84" rx="1.92" fill="#38BDF8"/>
<rect x="6.4" y="20.48" width="7.68" height="3.84" rx="1.92" fill="#F59E0B"/>
<circle cx="23.68" cy="22.4" r="2.24" fill="#fff"/>`;
}

export function logoSvg(c: LogoColors) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${logoSvgBody(c, 'sha')}</svg>`;
}
