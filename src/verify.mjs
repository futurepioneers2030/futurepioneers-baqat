/**
 * فحوصات ما قبل النشر (الإصدار 3 — مرشد الباقات):
 *
 *   node src/verify.mjs
 *
 * 1) البيانات: كل رابط في data/packages.json يظهر مرة واحدة، لا روابط يتيمة،
 *    وكل سعر مقترن برابطه داخل نفس البطاقة.
 * 2) بيانات المحادثة: JSON المضمَّن (#rw-data) مطابق تمامًا لـpackages.json —
 *    لأن صحة ما يعرضه المرشد تعتمد عليه وحده.
 * 3) مطابقة التسليم: معرّفات packages.json = معرّفات نموذج v3 المعتمد
 *    (design_handoff_mursheed/mursheed.dc.html) — مصدر مستقل.
 * 4) العمل بدون JavaScript: #rw-fallback يحوي الـ44 رابطًا في HTML ثابت.
 * 5) مواصفة التصميم v3: المقاسات والنصوص ونقاط التحول وما حُذف.
 *
 * ملاحظة: لا توجد مقارنة بايت-ببايت بملف مرجعي — v3 مبني من مواصفة مكتوبة لا من ملف يُنسخ،
 * فحلّت محلها التأكيدات الصريحة أدناه، ورسائل فشلها أوضح.
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

// كل رابط يظهر مرة في HTML الثابت + مرة في JSON المحادثة (رابطا القسم في HTML فقط)
let linkFailures = 0;
for (const item of expected) {
  const n = count(page, `"${item.url}"`);
  const want = item.category ? 1 : 2;
  if (n !== want) {
    linkFailures++;
    fail(`الرابط يجب أن يظهر ${want} مرة (ظهر ${n}): ${item.what}`);
  }
}
if (!linkFailures) pass(`كل الروابط (${expected.length}) موجودة بالعدد الصحيح`);

const productLinks = expected.filter((e) => !e.category).length;
check(productLinks === 42, `عدد روابط المنتجات = 42 (21 صباحي + 21 مسائي)${productLinks === 42 ? '' : ` — وُجد ${productLinks}`}`);

const inPage = new Set((page.match(/https:\/\/futurepioneers\.net[^"\\]*/g) || []));
const known = new Set([...expected.map((e) => e.url), data.store]); // + رابط المتجر في canonical
const orphans = [...inPage].filter((url) => !known.has(url));
if (orphans.length) orphans.forEach((url) => fail(`رابط في الصفحة غير موجود في packages.json: ${url}`));
else pass('لا توجد روابط زائدة أو يتيمة في الصفحة');

/* ---------- 2) العمل بدون JavaScript: الأساس الثابت ---------- */

const fbStart = page.indexOf('id="rw-fallback"');
const fbEnd = page.indexOf('<div class="rw-foot">');
const fallback = fbStart !== -1 && fbEnd > fbStart ? page.slice(fbStart, fbEnd) : '';
check(fallback.length > 0, 'الأساس الثابت #rw-fallback موجود');

let fbMissing = 0;
for (const item of expected) if (!fallback.includes(`href="${item.url}"`)) fbMissing++;
check(fbMissing === 0, `الأساس الثابت يحوي الـ${expected.length} رابطًا في HTML بلا JavaScript${fbMissing ? ` — ينقص ${fbMissing}` : ''}`);

let priceFailures = 0;
for (const item of expected) {
  if (item.category) continue;
  const idx = fallback.indexOf(`href="${item.url}"`);
  const card = fallback.slice(Math.max(0, idx - 400), idx);
  if (!card.includes(`<div class="rw-price">${item.price} <span>`)) {
    priceFailures++;
    fail(`السعر ${item.price} غير مقترن بالرابط الصحيح: ${item.what}`);
  }
}
if (!priceFailures) pass('كل سعر مقترن برابط المنتج الصحيح في نفس البطاقة');

/* ---------- 3) بيانات المحادثة المضمَّنة ---------- */

const jsonMatch = page.match(/<script type="application\/json" id="rw-data">([\s\S]*?)<\/script>/);
if (!jsonMatch) fail('كتلة بيانات المحادثة #rw-data غير موجودة');
else {
  let cd = null;
  try {
    cd = JSON.parse(jsonMatch[1]);
  } catch (e) {
    fail(`بيانات المحادثة ليست JSON صالحًا: ${e.message}`);
  }
  if (cd) {
    const problems = [];
    for (const [tag, src] of [['m', data.periods.morning], ['e', data.periods.evening]]) {
      const p = cd.periods?.[tag];
      if (!p) { problems.push(`الفترة ${tag} مفقودة`); continue; }
      if (p.label !== src.label) problems.push(`اسم الفترة ${tag}`);
      if (p.hour?.price !== src.hour.price || p.hour?.url !== src.hour.url) problems.push(`باقة الساعة (${tag})`);
      src.packages.forEach((pkg, i) => {
        const k = p.packs?.[i];
        if (!k || k.label !== pkg.label) return problems.push(`باقة ${pkg.label} (${tag})`);
        for (const d of ['day', 'week', 'month', 'term']) {
          if (k.prices?.[d]?.price !== pkg.prices[d].price) problems.push(`سعر ${pkg.label}/${d} (${tag})`);
          if (k.prices?.[d]?.url !== pkg.prices[d].url) problems.push(`رابط ${pkg.label}/${d} (${tag})`);
        }
      });
    }
    if (cd.wa !== data.contact.whatsapp) problems.push('رابط واتساب');
    if (cd.currency !== data.currency) problems.push('العملة');
    check(problems.length === 0, `بيانات المحادثة مطابقة لـpackages.json${problems.length ? ` — خلل في: ${problems.slice(0, 5).join('، ')}` : ' (42 سعرًا ورابطًا)'}`);
  }
}

/* ---------- 4) مطابقة بيانات التسليم المعتمد ---------- */

const protoPath = join(root, 'design_handoff_mursheed', 'mursheed.dc.html');
if (!existsSync(protoPath)) {
  console.log('— تخطّي مقارنة نموذج v3 (design_handoff_mursheed/mursheed.dc.html غير موجود)');
} else {
  const proto = readFileSync(protoPath, 'utf8');
  const jsonIds = new Set(expected.map((e) => e.url.match(/[pc]\d{4,}/)?.[0]).filter(Boolean));
  const protoIds = new Set(proto.match(/[pc]\d{6,}/g) || []);
  const missing = [...jsonIds].filter((i) => !protoIds.has(i));
  const extra = [...protoIds].filter((i) => !jsonIds.has(i));
  if (missing.length) fail(`معرّفات في packages.json وليست في نموذج v3: ${missing.join(', ')}`);
  if (extra.length) fail(`معرّفات في نموذج v3 وليست في packages.json: ${extra.join(', ')}`);
  if (!missing.length && !extra.length) pass(`بيانات packages.json مطابقة لنموذج v3 المعتمد (${jsonIds.size} معرّفًا)`);
}

/* ---------- 5) مواصفة التصميم v3 ---------- */

// التعليقات ليست تصميمًا — تُحذف كي لا يطابقها فحص نصي بالخطأ
const src = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

const required = [
  ['dir="rtl"', 'الصفحة RTL'],
  ['family=Baloo+Bhaijaan+2', 'خط Baloo Bhaijaan 2 محمّل'],
  ['family=Almarai', 'خط Almarai محمّل'],
  ['target="_blank" rel="noopener"', 'الروابط تفتح في تبويب جديد (مواصفة v3)'],
  // الترويسة
  ['height:60px', 'الشعار 60px'],
  ['clamp(23px,5vw,32px)', 'مقاس العنوان الرئيسي'],
  ['clamp(16px,3vw,19px)', 'مقاس السطر التعريفي'],
  ['باقات مرنة تكبر مع احتياج طفلك', 'السطر التعريفي المعتمد'],
  // المحادثة
  ['مرشد الباقات', 'اسم المرشد'],
  ['يساعدك في اختيار الباقة', 'سطر حالة المرشد'],
  ['مرحباً بك في مركز رواد المستقبل للأطفال. أنا هنا لأدلّك على الباقة المناسبة لطفلك في أقل من دقيقة.', 'رسالة الترحيب'],
  ['متى تحتاج حضور طفلك — الفترة الصباحية أم المسائية؟', 'سؤال الفترة'],
  ['اختيار موفق. وكم ساعة يبقى طفلك في المركز؟', 'سؤال الساعات'],
  ['تمام. وكم مدة الاشتراك التي تريدها؟', 'سؤال المدة'],
  ['وجدت الباقة المناسبة لطفلك. هذا هو الرابط لإتمام الطلب:', 'رسالة النتيجة'],
  ['اشتراك الساعة الواحدة متاح مباشرة. هذا هو الرابط لإتمام الطلب:', 'رسالة مسار الساعة'],
  ['لا مشكلة، نبدأ من جديد. متى تحتاج حضور طفلك — الفترة الصباحية أم المسائية؟', 'رسالة إعادة البدء'],
  ['هل تحتاج شيئاً آخر؟', 'تسمية ما بعد النتيجة'],
  ['يفتح صفحة الباقة في المتجر لإتمام الطلب', 'سطر تحت زر الاشتراك'],
  ['أعرف ما أريد — أعرض كل الأسعار', 'مخرج جدول الأسعار'],
  ['رجوع ↩', 'زر العودة إلى الخطوة السابقة'],
  ['@keyframes rwIn', 'حركة دخول الفقاعات'],
  ['@keyframes rwDot', 'حركة مؤشر الكتابة'],
  ['min-height:62px', 'أزرار الرد وزر النتيجة 62px'],
  ['font-size:46px', 'سعر النتيجة 46px'],
  ['font-size:21px', 'زر «اشترك الآن» في النتيجة 21px'],
  ['max-height:520px', 'ارتفاع مجرى المحادثة'],
  // جدول الأسعار
  ['grid-template-columns:repeat(3,1fr)', 'شبكة 3 أعمدة'],
  ['@media (max-width:900px)', 'نقطة التحول 900px'],
  ['@media (max-width:600px)', 'نقطة التحول 600px'],
  ['font-size:26px', 'عنوان بطاقة الجدول 26px'],
  ['font-size:44px', 'سعر بطاقة الجدول 44px'],
  ['min-height:58px', 'زر بطاقة الجدول 58px'],
  ['min-height:54px', 'أزرار المدة 54px'],
  ['min-height:56px', 'مخرج الأسعار وأزرار التواصل 56px'],
  ['id="rw-p-m" checked', 'الافتراضي: الفترة الصباحية'],
  ['id="rw-d-day" checked', 'الافتراضي: مدة اليوم'],
];
for (const [needle, label] of required) check(src.includes(needle), label);

const forbidden = [
  ['من 6:45 صباحاً', 'لا سطر وقت تحت زر الفترة الصباحية (قرار العميل)'],
  ['حتى 9 مساءً', 'لا سطر وقت تحت زر الفترة المسائية (قرار العميل)'],
  ['rw-badge', 'شارة «الساعه 25 ريال» محذوفة'],
  ['الساعه', 'نص الشارة القديم محذوف'],
  ['تغيير الفترة', 'زر «تغيير الفترة» محذوف'],
  ['rw-landing', 'شاشة اختيار الفترة الوسيطة محذوفة'],
  ['grid-template-columns:repeat(6,1fr)', 'لا شبكة 6 أعمدة (بنية v1)'],
  ['max-width:1019px', 'لا نقطة تحول 1019px (بنية v1)'],
  ['max-width:560px', 'لا نقطة تحول 560px (بنية v2)'],
  ['position:sticky', 'لا لوحة sticky (أُلغيت في v3)'],
  ['<script src', 'لا سكربتات خارجية (قيد سلة)'],
  ['scrollIntoView', 'التمرير بـscrollTop لا scrollIntoView (مواصفة v3)'],
];
for (const [needle, label] of forbidden) check(!src.includes(needle), label);

// السكربت مضمَّن داخل الودجت (الفحص على النص بلا تعليقات)
const widgetStart = src.indexOf('<div id="rw-baqat">');
const scriptIdx = src.indexOf('<script>');
check(scriptIdx > widgetStart && widgetStart !== -1, 'سكربت المحادثة مضمَّن داخل #rw-baqat');
check(count(src, '<script') === 2, `كتلتا سكربت فقط (بيانات + محادثة) — وُجد ${count(src, '<script')}`);

// الأعداد في الأساس الثابت
const counts = [
  ['class="rw-card"', 12, 'عدد بطاقات الجدول = 12 (6 لكل فترة)'],
  ['class="rw-v rw-v-day"', 12, 'نسخ «اليوم» = 12 (بطاقتا الساعة + 10 باقات)'],
  ['class="rw-v rw-v-week"', 10, 'نسخ «الأسبوع» = 10'],
  ['class="rw-v rw-v-month"', 10, 'نسخ «الشهر» = 10'],
  ['class="rw-v rw-v-term"', 10, 'نسخ «الترم» = 10'],
];
for (const [needle, want, label] of counts) {
  const got = count(page, needle);
  check(got === want, `${label}${got === want ? '' : ` — وُجد ${got}`}`);
}

// بطاقة «ساعة واحدة» تظهر مع «اليوم» فقط
let hourOk = true;
for (const period of Object.values(data.periods)) {
  const idx = fallback.indexOf(`href="${period.hour.url}"`);
  const before = fallback.slice(Math.max(0, idx - 600), idx);
  const last = before.lastIndexOf('class="rw-v ');
  if (last === -1 || !before.slice(last, last + 40).includes('rw-v-day')) hourOk = false;
}
check(hourOk, 'بطاقة «ساعة واحدة» محصورة في مدة «اليوم» فقط');

// أهداف اللمس
const small = [...css.matchAll(/min-height:(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n < 44);
check(small.length === 0, `كل أهداف اللمس ≥ 44px${small.length ? ` — وُجد ${small.join(', ')}` : ''}`);

// اللوحة اللونية المعتمدة (قائمة v3 + تدرجات الذهبي المنصوص عليها في المواصفة)
const PALETTE = [
  '#D60859', '#941249', '#5E0B30', '#E8BD4B', '#2A1B22', '#4A323E',
  '#FBF2E7', '#F0DECC', '#EAD9C6', '#F3D9E4', '#fff',
  '#FFF7E8', '#FFEBC7', '#FFE9C4',
];
const allowed = new Set(PALETTE.map((c) => c.toLowerCase()));
const stray = [...new Set((css.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).map((c) => c.toLowerCase()))].filter((c) => !allowed.has(c));
check(stray.length === 0, `الألوان داخل اللوحة المعتمدة${stray.length ? ` — خارجها: ${stray.join(', ')}` : ''}`);

console.log(failures ? `\n✗ فشل ${failures} فحص` : '\n✓ كل الفحوصات ناجحة');
process.exit(failures ? 1 : 0);
