/**
 * فحوصات ما قبل النشر (الإصدار 2):
 *
 *   node src/verify.mjs
 *
 * 1) البيانات: كل رابط في data/packages.json يظهر في الصفحة مرة واحدة، ولا روابط يتيمة،
 *    وكل سعر مقترن برابطه داخل نفس البطاقة.
 * 2) مطابقة التسليم: معرّفات المنتجات في packages.json = المعرّفات في نموذج v2 المعتمد
 *    (design_handoff_baqat_v2/main-baqat.dc.html) — مصدر مستقل يكشف أي انحراف في البيانات.
 * 3) مواصفة التصميم v2: المقاسات ونقاط التحول والبنية والنصوص المعتمدة، وما حُذف في v2.
 *
 * ملاحظة: v1 كان يُقارن بايت-ببايت بملف مرجعي لأنه كان إعادة إنتاج حرفية له.
 * v2 مبني من مواصفة مكتوبة لا من ملف يُنسخ، فالمقارنة الحرفية غير ممكنة —
 * حلّ محلّها تأكيدات صريحة على أرقام المواصفة نفسها، وهي أوضح في رسائل الفشل.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'data', 'packages.json'), 'utf8'));

const pagePath = join(root, 'site', 'index.html');
if (!existsSync(pagePath)) {
  console.error('✗ site/index.html غير موجود — شغّل «npm run build» أولًا (أو «npm run check»).');
  process.exit(1);
}
const page = readFileSync(pagePath, 'utf8');
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8');

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`✗ ${msg}`);
};
const pass = (msg) => console.log(`✓ ${msg}`);
const check = (ok, msg) => (ok ? pass(msg) : fail(msg));
const count = (hay, needle) => hay.split(needle).length - 1;

/* ---------- 1) الروابط والأسعار ---------- */

const expected = [];
for (const period of Object.values(data.periods)) {
  expected.push({ what: `${period.label} — ${period.hour.label}`, url: period.hour.url, price: period.hour.price });
  for (const pkg of period.packages)
    for (const p of Object.values(pkg.prices))
      expected.push({ what: `${period.label} — ${pkg.label} — ${p.label}`, url: p.url, price: p.price });
  expected.push({ what: `${period.label} — رابط القسم`, url: period.categoryUrl, category: true });
}

let linkFailures = 0;
for (const item of expected) {
  const n = count(page, `href="${item.url}"`);
  if (n !== 1) {
    linkFailures++;
    fail(`الرابط يجب أن يظهر مرة واحدة (ظهر ${n}): ${item.what}`);
  }
}
if (!linkFailures) pass(`كل الروابط (${expected.length}) موجودة مرة واحدة كل منها`);

const productLinks = expected.filter((e) => !e.category).length;
check(productLinks === 42, `عدد روابط المنتجات = 42 (21 صباحي + 21 مسائي)${productLinks === 42 ? '' : ` — وُجد ${productLinks}`}`);

const inPage = new Set((page.match(/href="(https:\/\/futurepioneers\.net[^"]*)"/g) || []).map((m) => m.slice(6, -1)));
const known = new Set([...expected.map((e) => e.url), data.store]); // + رابط المتجر في canonical
const orphans = [...inPage].filter((url) => !known.has(url));
if (orphans.length) orphans.forEach((url) => fail(`رابط في الصفحة غير موجود في packages.json: ${url}`));
else pass('لا توجد روابط زائدة أو يتيمة في الصفحة');

let priceFailures = 0;
for (const item of expected) {
  if (item.category) continue;
  const idx = page.indexOf(`href="${item.url}"`);
  const card = page.slice(Math.max(0, idx - 400), idx);
  if (!card.includes(`<div class="rw-price">${item.price} <span>`)) {
    priceFailures++;
    fail(`السعر ${item.price} غير مقترن بالرابط الصحيح: ${item.what}`);
  }
}
if (!priceFailures) pass('كل سعر مقترن برابط المنتج الصحيح في نفس البطاقة');

/* ---------- 2) مطابقة بيانات التسليم المعتمد ---------- */

const protoPath = join(root, 'design_handoff_baqat_v2', 'main-baqat.dc.html');
if (!existsSync(protoPath)) {
  console.log('— تخطّي مقارنة نموذج v2 (design_handoff_baqat_v2/main-baqat.dc.html غير موجود)');
} else {
  const proto = readFileSync(protoPath, 'utf8');
  const jsonIds = new Set([...expected.map((e) => e.url.match(/[pc]\d{4,}/)?.[0])].filter(Boolean));
  const protoIds = new Set(proto.match(/[pc]\d{6,}/g) || []);
  const missing = [...jsonIds].filter((i) => !protoIds.has(i));
  const extra = [...protoIds].filter((i) => !jsonIds.has(i));
  if (missing.length) fail(`معرّفات في packages.json وليست في نموذج v2 المعتمد: ${missing.join(', ')}`);
  if (extra.length) fail(`معرّفات في نموذج v2 وليست في packages.json: ${extra.join(', ')}`);
  if (!missing.length && !extra.length) pass(`بيانات packages.json مطابقة لنموذج v2 المعتمد (${jsonIds.size} معرّفًا)`);
}

/* ---------- 3) مواصفة التصميم v2 ---------- */

// التعليقات (CSS وHTML) ليست تصميمًا — تُحذف كي لا يطابقها فحص نصي بالخطأ
const src = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

// يجب أن يوجد
const required = [
  ['dir="rtl"', 'الصفحة RTL'],
  ['family=Baloo+Bhaijaan+2', 'خط Baloo Bhaijaan 2 محمّل'],
  ['family=Almarai', 'خط Almarai محمّل'],
  ['position:sticky;top:0;z-index:20', 'لوحة التحكم ثابتة (sticky)'],
  ['grid-template-columns:repeat(3,1fr)', 'شبكة 3 أعمدة (سطح المكتب)'],
  ['@media (max-width:900px)', 'نقطة التحول 900px (عمودان)'],
  ['@media (max-width:560px)', 'نقطة التحول 560px (عمود واحد + تكديس اللوحة)'],
  ['height:72px', 'الشعار 72px'],
  ['clamp(26px,5vw,36px)', 'مقاس العنوان الرئيسي'],
  ['clamp(21px,4vw,26px)', 'مقاس عنوان الفترة'],
  ['clamp(15px,4.2vw,19px)', 'مقاس أزرار الاختيار'],
  ['font-size:27px', 'عنوان البطاقة 27px'],
  ['font-size:46px', 'السعر 46px'],
  ['min-height:58px', 'زر «اشترك الآن» 58px'],
  ['min-height:56px', 'أزرار الاختيار والتواصل 56px'],
  ['باقات مرنة تكبر مع احتياج طفلك', 'السطر التعريفي المعتمد في v2'],
  ['باقات الفترة الصباحية', 'عنوان الفترة الصباحية'],
  ['باقات الفترة المسائية', 'عنوان الفترة المسائية'],
  ['id="rw-p-m" checked', 'الافتراضي: الفترة الصباحية'],
  ['id="rw-d-day" checked', 'الافتراضي: مدة اليوم'],
];
for (const [needle, label] of required) check(src.includes(needle), label);

// يجب ألّا يوجد (محذوف في v2 أو مخالف للمواصفة)
const forbidden = [
  ['rw-badge', 'شارة «الساعه 25 ريال» محذوفة'],
  ['الساعه', 'نص الشارة القديم محذوف'],
  ['تغيير الفترة', 'زر «تغيير الفترة» محذوف'],
  ['rw-landing', 'شاشة اختيار الفترة الوسيطة محذوفة'],
  ['grid-template-columns:repeat(6,1fr)', 'لا شبكة 6 أعمدة (بنية v1)'],
  ['max-width:1019px', 'لا نقطة تحول 1019px (بنية v1)'],
  ['overflow:hidden', 'لا overflow:hidden (يعطّل لوحة sticky)'],
  ['target="_blank"', 'الروابط تفتح في نفس التبويب (حسب مواصفة v2)'],
  ['<script', 'الصفحة تعمل بدون أي JavaScript'],
];
for (const [needle, label] of forbidden) check(!src.includes(needle), label);

// الأعداد
const counts = [
  ['class="rw-card"', 12, 'عدد البطاقات = 12 (6 لكل فترة)'],
  ['class="rw-v rw-v-day"', 12, 'نسخ «اليوم» = 12 (بطاقتا الساعة + 10 باقات)'],
  ['class="rw-v rw-v-week"', 10, 'نسخ «الأسبوع» = 10'],
  ['class="rw-v rw-v-month"', 10, 'نسخ «الشهر» = 10'],
  ['class="rw-v rw-v-term"', 10, 'نسخ «الترم» = 10'],
];
for (const [needle, want, label] of counts) {
  const got = count(page, needle);
  check(got === want, `${label}${got === want ? '' : ` — وُجد ${got}`}`);
}

// بطاقة «ساعة واحدة» تظهر مع «اليوم» فقط: أقرب غلاف قبلها يجب أن يكون rw-v-day
let hourOk = true;
for (const period of Object.values(data.periods)) {
  const idx = page.indexOf(`href="${period.hour.url}"`);
  const before = page.slice(Math.max(0, idx - 600), idx);
  const lastWrapper = before.lastIndexOf('class="rw-v ');
  if (lastWrapper === -1 || !before.slice(lastWrapper, lastWrapper + 40).includes('rw-v-day')) hourOk = false;
}
check(hourOk, 'بطاقة «ساعة واحدة» محصورة في مدة «اليوم» فقط');

// أهداف اللمس: لا قيمة min-height أقل من 44px
const smallTargets = [...css.matchAll(/min-height:(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n < 44);
check(smallTargets.length === 0, `كل أهداف اللمس ≥ 44px${smallTargets.length ? ` — وُجد ${smallTargets.join(', ')}` : ''}`);

// اللوحة اللونية المعتمدة — لا لون خارجها
const PALETTE = ['#D60859', '#941249', '#5E0B30', '#E8BD4B', '#2A1B22', '#4A323E', '#FBF2E7', '#F0DECC', '#EAD9C6', '#fff'];
const allowed = new Set(PALETTE.map((c) => c.toLowerCase()));
const strayColors = [...new Set((css.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).map((c) => c.toLowerCase()))].filter(
  (c) => !allowed.has(c)
);
check(strayColors.length === 0, `الألوان داخل اللوحة المعتمدة${strayColors.length ? ` — خارجها: ${strayColors.join(', ')}` : ''}`);

console.log(failures ? `\n✗ فشل ${failures} فحص` : '\n✓ كل الفحوصات ناجحة');
process.exit(failures ? 1 : 0);
