/**
 * يولّد صفحة الباقات الثابتة من data/packages.json + src/styles.css
 *
 *   node src/build.mjs
 *
 * المخرجات:
 *   site/index.html  صفحة كاملة مستقلة (هي التي تُنشر على Cloudflare Pages)
 *   site/embed.html  مقتطف الودجت فقط (للصق في محرر HTML داخل سلة)
 *
 * كل الأسعار والروابط والنصوص تأتي من data/packages.json — لا تُحرَّر يدويًا في site/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'packages.json'), 'utf8'));
const styles = readFileSync(join(root, 'src', 'styles.css'), 'utf8').trimEnd();

/* ---------- أدوات ---------- */

// تهريب النصوص والروابط قبل وضعها في HTML (الروابط تحتوي & في بارامترات الخرائط)
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DURATIONS = ['day', 'week', 'month', 'term'];

// وصف المدة داخل البطاقة: «في اليوم» / «في الأسبوع» / …
const caption = (key) => `في ${data.durations[key]}`;

/* ---------- أيقونات SVG (منقولة حرفيًا من التصميم المرجعي) ---------- */

const STAR_PATH = 'M12 0 L15 9 L24 12 L15 15 L12 24 L9 15 L0 12 L9 9 Z';

const star = (size, fill, style = '') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}"${style ? ` style="${style}"` : ''}>` +
  `<path d="${STAR_PATH}" fill="${fill}"></path></svg>`;

const sun = (size) =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}">` +
  `<circle cx="24" cy="24" r="10" fill="#E8BD4B"></circle>` +
  `<g stroke="#E8BD4B" stroke-width="3" stroke-linecap="round">` +
  `<line x1="24" y1="4" x2="24" y2="10"></line><line x1="24" y1="38" x2="24" y2="44"></line>` +
  `<line x1="4" y1="24" x2="10" y2="24"></line><line x1="38" y1="24" x2="44" y2="24"></line>` +
  `<line x1="9.9" y1="9.9" x2="14.1" y2="14.1"></line><line x1="33.9" y1="33.9" x2="38.1" y2="38.1"></line>` +
  `<line x1="9.9" y1="38.1" x2="14.1" y2="33.9"></line><line x1="33.9" y1="14.1" x2="38.1" y2="9.9"></line>` +
  `</g></svg>`;

// الهلال: نسخة البطاقة الكبيرة فيها بريق إضافي، ونسخة البانر بدونه
const moon = (size, sparkle) =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}">` +
  `<path d="M38 30 A16 16 0 1 1 20 7 A13.5 13.5 0 0 0 38 30 Z" fill="#E8BD4B"></path>` +
  (sparkle
    ? `<path d="M34 10 L35.4 14 L39.4 15.4 L35.4 16.8 L34 20.8 L32.6 16.8 L28.6 15.4 L32.6 14 Z" fill="#FBF2E7"></path>`
    : '') +
  `</svg>`;

const ICON_WA =
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5 13.6c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z"></path></svg>`;

const ICON_TEL =
  `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#941249" stroke-width="2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"></path></svg>`;

const ICON_MAP =
  `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#941249" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

/* ---------- بطاقات الباقات ---------- */

// بطاقة «ساعة واحدة» — سعر واحد ظاهر في كل التبويبات
const hourCard = (period, periodName) => `
      <div class="rw-card">
        <div class="rw-h">${esc(period.hour.label)}</div>
        <div class="rw-bar"></div>
        <div class="rw-va">
          <div class="rw-price">${period.hour.price} <span>${esc(data.currency)}</span></div>
          <div class="rw-cap">للساعة الواحدة</div>
          <!-- ${periodName}: ${esc(period.hour.label)} -->
          <a class="rw-btn" href="${esc(period.hour.url)}">اشترك الآن</a>
        </div>
      </div>`;

// بطاقة باقة ساعات — 4 نسخ سعر، تظهر منها واحدة حسب التبويب المختار
const packageCard = (pkg, periodName) => {
  const variants = DURATIONS.map((key) => {
    const p = pkg.prices[key];
    return (
      `<div class="rw-v rw-v-${key}">` +
      `<div class="rw-price">${p.price} <span>${esc(data.currency)}</span></div>` +
      `<div class="rw-cap">${esc(caption(key))}</div>` +
      `<!-- ${periodName} ${esc(pkg.label)} - ${esc(p.label)} -->` +
      `<a class="rw-btn" href="${esc(p.url)}">اشترك الآن</a>` +
      `</div>`
    );
  }).join('\n        ');

  return `
      <div class="rw-card">
        <div class="rw-h">${esc(pkg.label)}</div>
        <div class="rw-bar"></div>
        ${variants}
      </div>`;
};

/* ---------- قسم الفترة ---------- */

const periodSection = ({ key, period, periodName, icon, banClass, secClass, radioPrefix }) => `
  <!-- ===================== ${esc(period.label)} ===================== -->
  <section class="rw-sec ${secClass}">
    <div class="rw-ban ${banClass}">
      <div class="rw-bt">
        ${icon}
        ${esc(period.label)}
      </div>
      <label class="rw-back" for="rw-p0">تغيير الفترة</label>
    </div>
${DURATIONS.map(
  (d, i) =>
    `    <input class="rw-hide" type="radio" name="rw-${radioPrefix === 'm' ? 'dm' : 'de'}" id="rw-${radioPrefix}-${d}"${i === 0 ? ' checked' : ''}>`
).join('\n')}
    <div class="rw-tabs">
${DURATIONS.map(
  (d) => `      <label class="rw-t-${d}" for="rw-${radioPrefix}-${d}">${esc(data.durations[d])}</label>`
).join('\n')}
    </div>
    <div class="rw-grid">${hourCard(period, periodName)}${period.packages
  .map((pkg) => packageCard(pkg, periodName))
  .join('')}
    </div>
    <div class="rw-all"><a href="${esc(period.categoryUrl)}">تصفح كل باقات ${esc(
  period.label
)} في المتجر ↗</a></div>
  </section>`;

/* ---------- الودجت الكامل ---------- */

const widget = `<div id="rw-baqat">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@600;700;800&amp;family=Almarai:wght@400;700;800&amp;display=swap" rel="stylesheet">
<style>
${styles}
</style>

<input class="rw-hide" type="radio" name="rw-period" id="rw-p0" checked>
<input class="rw-hide" type="radio" name="rw-period" id="rw-pm">
<input class="rw-hide" type="radio" name="rw-period" id="rw-pe">

<div class="rw-wrap">
  <div class="rw-ribbon"></div>
  <div class="rw-hero">
    ${star(22, '#E8BD4B', 'position:absolute;top:44px;right:8%;opacity:.9')}
    ${star(26, '#D60859', 'position:absolute;top:60px;left:9%;opacity:.9')}
    <img src="${esc(data.logo)}" alt="${esc(data.brand)}">
    <h2>دليل أسعار الاشتراكات</h2>
    <div class="rw-sub">باقات مرنة تناسب احتياج طفلك وأسرتك</div>
    <div class="rw-badge-row">
      ${star(16, '#E8BD4B')}
      <div class="rw-badge">الساعه ${data.hourlyRate} ${esc(data.currency)}</div>
      ${star(16, '#E8BD4B')}
    </div>
  </div>

  <div class="rw-landing">
    <h3>اختر الفترة المناسبة</h3>
    <div class="rw-note">نفس الباقات متوفرة في الفترتين — اضغط على الفترة لعرضها مرتبة</div>
    <div class="rw-pergrid">
      <label class="rw-per rw-per-m" for="rw-pm">
        ${sun(52)}
        <span class="rw-pt">${esc(data.periods.morning.label)}</span>
        <span class="rw-ps">باقات اليوم والأسبوع والشهر والترم</span>
        <span class="rw-pa">عرض الباقات ←</span>
      </label>
      <label class="rw-per rw-per-e" for="rw-pe">
        ${moon(52, true)}
        <span class="rw-pt">${esc(data.periods.evening.label)}</span>
        <span class="rw-ps">باقات اليوم والأسبوع والشهر والترم</span>
        <span class="rw-pa">عرض الباقات ←</span>
      </label>
    </div>
    <div class="rw-chips">
${data.notes.map((n) => `      <div class="rw-chip">${esc(n)}</div>`).join('\n')}
    </div>
  </div>
${periodSection({
  key: 'morning',
  period: data.periods.morning,
  periodName: 'صباحي',
  icon: sun(34),
  banClass: 'rw-ban-m',
  secClass: 'rw-sec-m',
  radioPrefix: 'm',
})}
${periodSection({
  key: 'evening',
  period: data.periods.evening,
  periodName: 'مسائي',
  icon: moon(34, false),
  banClass: 'rw-ban-e',
  secClass: 'rw-sec-e',
  radioPrefix: 'e',
})}

  <div class="rw-foot">
    <div class="rw-ft">تواصل معنا</div>
    <div class="rw-cbtns">
      <a class="rw-cbtn rw-cbtn-wa" href="${esc(data.contact.whatsapp)}">
        ${ICON_WA}
        واتساب
      </a>
      <a class="rw-cbtn rw-cbtn-tel" href="tel:${esc(data.contact.phone)}">
        ${ICON_TEL}
        اتصال ${esc(data.contact.phone)}
      </a>
      <a class="rw-cbtn rw-cbtn-map" href="${esc(data.contact.mapsUrl)}">
        ${ICON_MAP}
        موقعنا على الخريطة
      </a>
    </div>
    <div class="rw-addr">${esc(data.contact.address)}<br>${esc(data.contact.hours)}</div>
    <div class="rw-brand">${esc(data.brand)}</div>
  </div>
  <div class="rw-ribbon2"></div>
</div>
</div>`;

/* ---------- المخرجات ---------- */

const title = `باقات ${data.brand} — دليل أسعار الاشتراكات`;
const description = `باقات اشتراكات ${data.brand}: الفترة الصباحية والمسائية، باليوم والأسبوع والشهر والترم — الساعه ${data.hourlyRate} ${data.currency}.`;

const page = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#D60859">
<link rel="icon" href="${esc(data.logo)}">
<link rel="canonical" href="${esc(data.store)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(data.logo)}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body style="margin:0;background:#fff">

${widget}

</body>
</html>
`;

const embed = `<!-- مقتطف جاهز للصق في محرر HTML لصفحة سلة — مولَّد من data/packages.json، لا تحرره يدويًا -->
${widget}
`;

mkdirSync(join(root, 'site'), { recursive: true });
writeFileSync(join(root, 'site', 'index.html'), page, 'utf8');
writeFileSync(join(root, 'site', 'embed.html'), embed, 'utf8');

const links = (page.match(/href="https:\/\/futurepioneers\.net[^"]*"/g) || []).length;
console.log(`✓ site/index.html  (${page.length} حرف، ${links} رابط منتج/قسم من سلة)`);
console.log(`✓ site/embed.html  (${embed.length} حرف)`);
