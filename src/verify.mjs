/**
 * يتحقق من صحة المخرجات قبل النشر:
 *
 *   node src/verify.mjs
 *
 * 1) كل رابط في data/packages.json موجود في site/index.html (والعكس: لا روابط زائدة).
 * 2) عدد الروابط = 42 رابط منتج + رابطا قسم.
 * 3) الودجت المولَّد مطابق بنيويًا للتصميم المرجعي design_handoff_baqat/reference-design.html
 *    (بعد تجاهل المسافات والتعليقات، وتقنيع الأسعار والروابط لأنها بيانات متغيرة بطبيعتها).
 *    أي فرق بعد ذلك = انحراف عن التصميم المعتمد من العميل.
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

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`✗ ${msg}`);
};
const pass = (msg) => console.log(`✓ ${msg}`);

/* ---------- 1) الروابط ---------- */

const expected = [];
for (const [key, period] of Object.entries(data.periods)) {
  expected.push({ what: `${period.label} — ${period.hour.label}`, url: period.hour.url });
  for (const pkg of period.packages) {
    for (const [d, p] of Object.entries(pkg.prices)) {
      expected.push({ what: `${period.label} — ${pkg.label} — ${p.label}`, url: p.url, price: p.price });
    }
  }
  expected.push({ what: `${period.label} — رابط القسم`, url: period.categoryUrl, category: true });
}

for (const item of expected) {
  const count = page.split(`href="${item.url}"`).length - 1;
  if (count !== 1) fail(`الرابط يجب أن يظهر مرة واحدة (ظهر ${count}): ${item.what}`);
}
if (!failures) pass(`كل الروابط (${expected.length}) موجودة مرة واحدة كل منها`);

const productLinks = expected.filter((e) => !e.category).length;
if (productLinks !== 42) fail(`عدد روابط المنتجات = ${productLinks}، والمتوقع 42`);
else pass('عدد روابط المنتجات = 42 (21 صباحي + 21 مسائي)');

// لا روابط سلة في الصفحة خارج ما هو في JSON
const inPage = new Set((page.match(/href="(https:\/\/futurepioneers\.net[^"]*)"/g) || []).map((m) => m.slice(6, -1)));
const known = new Set([...expected.map((e) => e.url), data.store]); // + رابط المتجر في canonical
const orphans = [...inPage].filter((url) => !known.has(url));
if (orphans.length) orphans.forEach((url) => fail(`رابط في الصفحة غير موجود في packages.json: ${url}`));
else pass('لا توجد روابط زائدة أو يتيمة في الصفحة');

// الأسعار: كل سعر يظهر بجانب رابطه في نفس البطاقة
for (const item of expected) {
  if (item.category || item.price === undefined) continue;
  const idx = page.indexOf(`href="${item.url}"`);
  const card = page.slice(Math.max(0, idx - 400), idx);
  if (!card.includes(`<div class="rw-price">${item.price} <span>`)) {
    fail(`السعر ${item.price} غير مقترن بالرابط الصحيح: ${item.what}`);
  }
}
pass('كل سعر مقترن برابط المنتج الصحيح في نفس البطاقة');

/* ---------- 2) مطابقة التصميم المرجعي ---------- */

const refPath = join(root, 'design_handoff_baqat', 'reference-design.html');
if (!existsSync(refPath)) {
  console.log('— تخطّي مقارنة المرجع (design_handoff_baqat/reference-design.html غير موجود)');
} else {
  const ref = readFileSync(refPath, 'utf8');

  // الأسعار والروابط بيانات، لا تصميم: تعديلها في packages.json مشروع ولا يعني انحرافًا
  // عن التصميم المعتمد، فتُقنَّع قبل المقارنة. كل ما عداها (البنية، الـCSS، الأيقونات،
  // النصوص العربية المعتمدة) يبقى تحت مقارنة صارمة.
  const maskData = (html) =>
    html
      .replace(/(href|src)="[^"]*"/g, '$1="#"')
      .replace(/(<div class="rw-price">)\d+/g, '$1N')
      .replace(/(<div class="rw-badge">[^<]*?)\d+/g, '$1N')
      .replace(/(اتصال )\d+/g, '$1N');

  // تُحذف التعليقات أولًا لأن المرجع يبدأ بتعليق يذكر <div id="rw-baqat"> نصًّا
  const normalize = (html) =>
    maskData(html)
      .replace(/<!--[\s\S]*?-->/g, '') // تجاهل التعليقات
      .replace(/>\s+</g, '><') // تجاهل المسافات بين الوسوم
      .replace(/\s+/g, ' ') // توحيد المسافات داخل النص
      .trim();

  const widgetOf = (html) => {
    const n = normalize(html);
    const start = n.indexOf('<div id="rw-baqat">');
    const end = n.lastIndexOf('</div>') + '</div>'.length;
    return n.slice(start, end);
  };

  const a = widgetOf(page);
  const b = widgetOf(ref);

  if (a === b) {
    pass('الودجت المولَّد مطابق للتصميم المرجعي (بتقنيع الأسعار والروابط فقط)');
  } else {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    fail('الودجت المولَّد يختلف عن التصميم المرجعي عند الحرف ' + i);
    console.error('  المولَّد : …' + a.slice(Math.max(0, i - 90), i + 90));
    console.error('  المرجع  : …' + b.slice(Math.max(0, i - 90), i + 90));
  }
}

/* ---------- 3) فحوصات بنيوية سريعة ---------- */

const checks = [
  [/dir="rtl"/, 'الصفحة RTL'],
  [/family=Baloo\+Bhaijaan\+2/, 'خط Baloo Bhaijaan 2 محمّل'],
  [/family=Almarai/, 'خط Almarai محمّل'],
  [/grid-template-columns:repeat\(6,1fr\)/, 'شبكة 6 أعمدة (سطح المكتب)'],
  [/@media \(max-width:1019px\)/, 'نقطة التحول 1019px'],
  [/@media \(max-width:600px\)/, 'نقطة التحول 600px'],
  [/min-height:44px/, 'أهداف اللمس 44px'],
];
for (const [re, label] of checks) (re.test(page) ? pass : fail)(label);

if (/<script/i.test(page)) fail('الصفحة تحتوي JavaScript — المفترض أن تعمل بـ CSS فقط');
else pass('الصفحة تعمل بدون أي JavaScript');

console.log(failures ? `\n✗ فشل ${failures} فحص` : '\n✓ كل الفحوصات ناجحة');
process.exit(failures ? 1 : 0);
