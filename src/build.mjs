/**
 * يولّد صفحة الباقات الثابتة (الإصدار 3 — مرشد الباقات) من data/packages.json
 *
 *   node src/build.mjs
 *
 * المخرجات:
 *   site/index.html  صفحة كاملة مستقلة (هي التي تُنشر على Cloudflare Pages)
 *   site/embed.html  مقتطف الودجت فقط (للصق في محرر HTML داخل سلة)
 *
 * البنية على طبقتين:
 *   1) أساس ثابت بلا JavaScript — جدول الأسعار الكامل داخل #rw-fallback
 *      (radio inputs مخفية + `:checked`). هذا ما يراه من عطّل JS أو ما يظهر إن فشل السكربت.
 *   2) تحسين تدريجي — src/chat.js يبني تجربة المحادثة في #rw-chat ويخفي الأساس،
 *      ويقرأ الأسعار من <script type="application/json" id="rw-data"> المضمَّن وقت البناء.
 *
 * كل الأسعار والروابط والنصوص تأتي من data/packages.json — لا تُحرَّر يدويًا في site/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'packages.json'), 'utf8'));
const styles = readFileSync(join(root, 'src', 'styles.css'), 'utf8').trimEnd();
const chatJs = readFileSync(join(root, 'src', 'chat.js'), 'utf8').trimEnd();

// السكربت يُضمَّن حرفيًا داخل وسم سكربت: تسلسل الإغلاق يقطع الصفحة،
// و«<!--» يُدخل المحلّل في حالة script-data-escaped فيبتلع الإغلاق التالي.
if (/<\/script/i.test(chatJs)) throw new Error('src/chat.js يحتوي تسلسل إغلاق سكربت — لا يمكن تضمينه inline');
if (chatJs.includes('<!--')) throw new Error('src/chat.js يحتوي <!-- — يكسر تحليل الوسم');

/* ---------- أدوات ---------- */

// تهريب النصوص والروابط قبل وضعها في HTML (الروابط تحتوي & في بارامترات الخرائط)
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const DURATIONS = ['day', 'week', 'month', 'term'];
const HOUR_CAP = 'للساعة الواحدة';

// وصف المدة داخل البطاقة: «في اليوم» / «في الأسبوع» / …
const caption = (key) => `في ${data.durations[key]}`;

/* ---------- أيقونات SVG (منقولة حرفيًا من التصميم المرجعي) ---------- */

const sun = (size) =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}">` +
  `<circle cx="24" cy="24" r="10" fill="#E8BD4B"></circle>` +
  `<g stroke="#E8BD4B" stroke-width="3" stroke-linecap="round">` +
  `<line x1="24" y1="4" x2="24" y2="10"></line><line x1="24" y1="38" x2="24" y2="44"></line>` +
  `<line x1="4" y1="24" x2="10" y2="24"></line><line x1="38" y1="24" x2="44" y2="24"></line>` +
  `<line x1="9.9" y1="9.9" x2="14.1" y2="14.1"></line><line x1="33.9" y1="33.9" x2="38.1" y2="38.1"></line>` +
  `<line x1="9.9" y1="38.1" x2="14.1" y2="33.9"></line><line x1="33.9" y1="14.1" x2="38.1" y2="9.9"></line>` +
  `</g></svg>`;

const moon = (size) =>
  `<svg viewBox="0 0 48 48" width="${size}" height="${size}">` +
  `<path d="M38 30 A16 16 0 1 1 20 7 A13.5 13.5 0 0 0 38 30 Z" fill="#E8BD4B"></path></svg>`;

const ICON_WA =
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5 13.6c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6s.6-1.8.9-2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6c-.1.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l1-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.6-.1 1.2Z"></path></svg>`;

const ICON_TEL =
  `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#941249" stroke-width="2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"></path></svg>`;

const ICON_MAP =
  `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#941249" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

/* ---------- بيانات المحادثة (تُقرأ بالـJS وقت التشغيل) ---------- */

const chatData = {
  logo: data.logo,
  currency: data.currency,
  wa: data.contact.whatsapp,
  hourLabel: data.periods.morning.hour.label,
  hourCap: HOUR_CAP,
  hourHint: data.hoursHints['1'],
  durations: DURATIONS.map((d) => [d, data.durations[d], caption(d), data.durationHints[d]]),
  compare: data.durationCompare,
  guide: data.guide,
  periods: Object.fromEntries(
    [
      ['m', 'morning'],
      ['e', 'evening'],
    ].map(([tag, key]) => {
      const p = data.periods[key];
      return [
        tag,
        {
          label: p.label,
          hint: data.periodHints[key],
          hour: { price: p.hour.price, url: p.hour.url },
          packs: p.packages.map((pkg) => ({
            hours: pkg.hours,
            label: pkg.label,
            hint: data.hoursHints[String(pkg.hours)],
            prices: Object.fromEntries(
              DURATIONS.map((d) => [d, { price: pkg.prices[d].price, url: pkg.prices[d].url }])
            ),
          })),
        },
      ];
    })
  ),
};

// كل خيار في المحادثة يجب أن يحمل وصفًا بشريًا — بيانات ناقصة تعني زرًا أعرج
for (const [tag, p] of Object.entries(chatData.periods)) {
  if (!p.hint) throw new Error(`ينقص periodHints للفترة ${tag} في packages.json`);
  for (const pkg of p.packs)
    if (!pkg.hint) throw new Error(`ينقص hoursHints["${pkg.hours}"] في packages.json`);
}
for (const d of chatData.durations) if (!d[3]) throw new Error(`ينقص durationHints["${d[0]}"] في packages.json`);
if (!chatData.hourHint) throw new Error('ينقص hoursHints["1"] في packages.json');

// داخل <script type="application/json"> يكفي منع تسلسل </script — وتهريب < يغطيه
const chatJson = JSON.stringify(chatData).replace(/</g, '\\u003c');

/* ---------- بطاقات جدول الأسعار الثابت ---------- */

// «ساعة واحدة»: البطاقة كاملة ملفوفة بـ rw-v-day فتظهر مع «اليوم» فقط.
// display:contents على الغلاف يجعل البطاقة نفسها هي عنصر الشبكة.
const hourCard = (period, periodName) => `
        <div class="rw-v rw-v-day">
          <div class="rw-card">
            <div class="rw-h">${esc(period.hour.label)}</div>
            <div class="rw-bar"></div>
            <div class="rw-price">${period.hour.price} <span>${esc(data.currency)}</span></div>
            <div class="rw-cap">${esc(HOUR_CAP)}</div>
            <!-- ${periodName}: ${esc(period.hour.label)} -->
            <a class="rw-btn" href="${esc(period.hour.url)}" target="_blank" rel="noopener">اشترك الآن</a>
          </div>
        </div>`;

const packageCard = (pkg, periodName) => {
  const variants = DURATIONS.map((key) => {
    const p = pkg.prices[key];
    return (
      `<div class="rw-v rw-v-${key}">` +
      `<div class="rw-price">${p.price} <span>${esc(data.currency)}</span></div>` +
      `<div class="rw-cap">${esc(caption(key))}</div>` +
      `<!-- ${periodName} ${esc(pkg.label)} - ${esc(p.label)} -->` +
      `<a class="rw-btn" href="${esc(p.url)}" target="_blank" rel="noopener">اشترك الآن</a>` +
      `</div>`
    );
  }).join('\n          ');

  return `
        <div class="rw-card">
          <div class="rw-h">${esc(pkg.label)}</div>
          <div class="rw-bar"></div>
          ${variants}
        </div>`;
};

const grid = ({ period, periodName, tag }) => `
      <div class="rw-grid rw-grid-${tag}">${hourCard(period, periodName)}${period.packages
  .map((pkg) => packageCard(pkg, periodName))
  .join('')}
      </div>`;

/* ---------- الودجت الكامل ---------- */

const widget = `<div id="rw-baqat">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@600;700;800&amp;family=Almarai:wght@400;700;800&amp;display=swap" rel="stylesheet">
<style>
${styles}
</style>

<input class="rw-hide" type="radio" name="rw-period" id="rw-p-m" checked>
<input class="rw-hide" type="radio" name="rw-period" id="rw-p-e">
<input class="rw-hide" type="radio" name="rw-dur" id="rw-d-day" checked>
<input class="rw-hide" type="radio" name="rw-dur" id="rw-d-week">
<input class="rw-hide" type="radio" name="rw-dur" id="rw-d-month">
<input class="rw-hide" type="radio" name="rw-dur" id="rw-d-term">

<div class="rw-wrap">
  <div class="rw-ribbon"></div>

  <div class="rw-hero">
    <img src="${esc(data.logo)}" alt="${esc(data.brand)}">
    <h2>دليل أسعار الاشتراكات</h2>
    <div class="rw-sub">باقات مرنة تكبر مع احتياج طفلك</div>
  </div>

  <!-- تجربة المحادثة تُبنى هنا بالـJS؛ بدونه تبقى فارغة ويظهر جدول الأسعار أدناه -->
  <div class="rw-chatwrap" id="rw-chat"></div>

  <div class="rw-fb" id="rw-fallback">
    <div class="rw-periodrow">
      <div class="rw-seg">
        <label class="rw-s-m" for="rw-p-m">${sun(24)}${esc(data.periods.morning.label)}</label>
        <label class="rw-s-e" for="rw-p-e">${moon(24)}${esc(data.periods.evening.label)}</label>
      </div>
    </div>
    <div class="rw-alltitle rw-alltitle-m">كل باقات ${esc(data.periods.morning.label)}</div>
    <div class="rw-alltitle rw-alltitle-e">كل باقات ${esc(data.periods.evening.label)}</div>
    <div class="rw-seg">
${DURATIONS.map(
  (d) => `      <label class="rw-s-${d}" for="rw-d-${d}">${esc(data.durations[d])}</label>`
).join('\n')}
    </div>
${grid({ period: data.periods.morning, periodName: 'صباحي', tag: 'm' })}
${grid({ period: data.periods.evening, periodName: 'مسائي', tag: 'e' })}
    <div class="rw-catlink rw-catlink-m"><a href="${esc(
      data.periods.morning.categoryUrl
    )}" target="_blank" rel="noopener">تصفح كل باقات ${esc(data.periods.morning.label)} ↗</a></div>
    <div class="rw-catlink rw-catlink-e"><a href="${esc(
      data.periods.evening.categoryUrl
    )}" target="_blank" rel="noopener">تصفح كل باقات ${esc(data.periods.evening.label)} ↗</a></div>
  </div>

  <div class="rw-foot">
    <div class="rw-ft">تواصل معنا</div>
    <div class="rw-cbtns">
      <a class="rw-cbtn rw-cbtn-wa" href="${esc(data.contact.whatsapp)}" target="_blank" rel="noopener">
        ${ICON_WA}
        واتساب
      </a>
      <a class="rw-cbtn rw-cbtn-tel" href="tel:${esc(data.contact.phone)}">
        ${ICON_TEL}
        اتصال ${esc(data.contact.phone)}
      </a>
      <a class="rw-cbtn rw-cbtn-map" href="${esc(data.contact.mapsUrl)}" target="_blank" rel="noopener">
        ${ICON_MAP}
        موقعنا على الخريطة
      </a>
    </div>
    <div class="rw-addr">${esc(data.contact.address)}<br>${esc(data.contact.hours)}</div>
    <div class="rw-brand">${esc(data.brand)}</div>
  </div>
  <div class="rw-ribbon2"></div>
</div>

<script type="application/json" id="rw-data">${chatJson}</script>
<script>
${chatJs}
</script>
</div>`;

/* ---------- المخرجات ---------- */

const title = `باقات ${data.brand} — دليل أسعار الاشتراكات`;
const description = `مرشد الباقات يدلّك على اشتراك طفلك المناسب في ${data.brand} بثلاثة أسئلة — باقات مرنة تكبر مع احتياج طفلك.`;

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
const cards = (page.match(/class="rw-card"/g) || []).length;
console.log(`✓ site/index.html  (${page.length} حرف، ${links} رابط سلة، ${cards} بطاقة ثابتة)`);
console.log(`✓ site/embed.html  (${embed.length} حرف)`);
console.log(`✓ سكربت المحادثة   (${(Buffer.byteLength(chatJs) / 1024).toFixed(1)}KB، بيانات ${(Buffer.byteLength(chatJson) / 1024).toFixed(1)}KB)`);
