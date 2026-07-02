// The dashboard hero: a blueprint-style side-profile car drawing with live
// stats attached as leader-line annotations and a dimension line underneath.
// Hand-authored inline SVG — no external assets.

import { esc, fmtNum, fmtMoney } from '../../domain/format.js'

export function renderCarSchematic({ car, avgL100, eur100, totalKm, isEstimate = false }) {
  const avgText = avgL100 != null ? `${isEstimate ? '~' : ''}${fmtNum(avgL100)} L/100KM` : 'NO DATA YET'
  const eurText = eur100 != null ? `${fmtMoney(eur100)} /100KM` : '—'
  const kmText = totalKm != null ? `${Math.round(totalKm).toLocaleString('en-US')} KM TRACKED` : 'ADD FILL-UPS TO START TRACKING'
  const title = `${esc(String(car.make ?? '').toUpperCase())} ${esc(String(car.model ?? '').toUpperCase())}`

  return `
  <svg viewBox="0 0 360 204" style="width:100%;height:auto;display:block" role="img" aria-label="Blueprint drawing of the car with consumption and cost annotations">
    <!-- leader lines -->
    <g stroke="var(--amber)" stroke-width="1" fill="none">
      <line x1="185" y1="78" x2="185" y2="50"/>
      <circle cx="185" cy="80" r="2.4" fill="var(--amber)" stroke="none"/>
      <line x1="96" y1="110" x2="54" y2="68"/>
      <circle cx="98" cy="112" r="2.4" fill="var(--amber)" stroke="none"/>
    </g>
    <text x="185" y="32" text-anchor="middle" font-family="var(--font-mono)" font-size="15" font-weight="600" fill="var(--amber)">${avgText}</text>
    <text x="185" y="45" text-anchor="middle" font-size="8.5" letter-spacing="1.2" fill="var(--ink-mute)">AVG CONSUMPTION${isEstimate ? ' (EST)' : ''}</text>
    <text x="6" y="52" font-family="var(--font-mono)" font-size="13.5" font-weight="600" fill="var(--amber)">${eurText}</text>
    <text x="6" y="64" font-size="8.5" letter-spacing="1.2" fill="var(--ink-mute)">FUEL COST</text>

    <!-- car body -->
    <g stroke="var(--ink-mute)" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M68,140 C62,138 61,131 64,125 C66,119 72,116 79,115 L98,113 C104,104 116,97 132,94 L150,84 C159,78 173,75 192,75 L215,75 C231,75 243,81 252,90 L263,101 C281,104 292,110 294,121 C296,128 292,133 286,134"/>
      <path d="M128,140 L222,140"/>
      <path d="M258,140 L268,139"/>
      <!-- windows -->
      <path d="M138,95 L156,86 L156,108 L130,110 Z"/>
      <path d="M164,85 L206,84 L206,108 L164,108 Z"/>
      <!-- door line + handle -->
      <path d="M162,108 L162,136"/>
      <path d="M168,114 L178,114"/>
    </g>
    <!-- wheels -->
    <g stroke="var(--ink-mute)" stroke-width="1.4" fill="var(--bg)">
      <circle cx="110" cy="140" r="16"/>
      <circle cx="240" cy="140" r="16"/>
    </g>
    <g stroke="var(--amber)" stroke-width="1.2" fill="none">
      <circle cx="110" cy="140" r="6"/>
      <circle cx="240" cy="140" r="6"/>
    </g>

    <!-- dimension line: total tracked km -->
    <g stroke="var(--line-strong)" stroke-width="1">
      <line x1="68" y1="172" x2="292" y2="172"/>
      <line x1="68" y1="166" x2="68" y2="178"/>
      <line x1="292" y1="166" x2="292" y2="178"/>
    </g>
    <text x="180" y="190" text-anchor="middle" font-family="var(--font-mono)" font-size="10" letter-spacing="1.5" fill="var(--ink-mute)">${kmText}</text>

    <!-- title block -->
    <g>
      <rect x="252" y="8" width="100" height="26" fill="none" stroke="var(--line-strong)" stroke-width="1"/>
      <text x="302" y="19" text-anchor="middle" font-size="8" letter-spacing="1" fill="var(--ink)">${title}</text>
      <text x="302" y="29" text-anchor="middle" font-family="var(--font-mono)" font-size="7.5" letter-spacing="1" fill="var(--ink-mute)">${esc(String(car.year ?? ''))}${car.operating_country ? ' · ' + esc(String(car.operating_country).toUpperCase()) : ''}</text>
    </g>
  </svg>`
}
