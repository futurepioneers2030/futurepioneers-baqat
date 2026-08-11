/**
 * مرشد الباقات — تحسين تدريجي فوق شبكة أسعار ثابتة (v3)
 *
 * يُضمَّن حرفيًا داخل وسم سكربت في site/index.html وقت البناء (لا modules ولا imports — قيد سلة).
 * يقرأ البيانات من كتلة JSON بالمعرّف rw-data المولَّدة من packages.json.
 *
 * قاعدة الفشل الآمن: لا يُضاف الصنف rw-js إلا بعد نجاح البناء كاملًا،
 * فأي خطأ أو تعطيل لـJS يترك جدول الأسعار الثابت ظاهرًا كما هو.
 */
(function () {
  'use strict';

  var root = document.getElementById('rw-baqat');
  var host = document.getElementById('rw-chat');
  var fb = document.getElementById('rw-fallback');
  var dataEl = document.getElementById('rw-data');
  if (!root || !host || !fb || !dataEl) return;

  var D;
  try {
    D = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }
  if (!D || !D.periods || !D.periods.m || !D.periods.e) return;

  var DUR = D.durations; // [[key, label, cap], …]

  /* ---------- أدوات DOM (نص فقط — لا innerHTML) ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function avatar(small, alt) {
    var d = el('div', small ? 'rw-av rw-av-sm' : 'rw-av');
    var img = el('img');
    img.src = D.logo;
    img.alt = alt || '';
    d.appendChild(img);
    return d;
  }

  /* ---------- بناء هيكل المحادثة ---------- */

  var head = el('div', 'rw-chathead');
  head.appendChild(avatar(false, 'مرشد الباقات'));
  var ident = el('div', 'rw-chatid');
  ident.appendChild(el('div', 'rw-chatname', 'مرشد الباقات'));
  var status = el('div', 'rw-chatstatus');
  status.appendChild(el('span', 'rw-dot9'));
  status.appendChild(el('span', null, 'يساعدك في اختيار الباقة'));
  ident.appendChild(status);
  head.appendChild(ident);

  var thread = el('div', 'rw-thread');
  thread.setAttribute('role', 'log');
  thread.setAttribute('aria-live', 'polite');

  var qlabel = el('div', 'rw-qlabel');
  var qgrid = el('div', 'rw-qr rw-qr-2');
  var qbar = el('div', 'rw-qbar');
  qbar.appendChild(qlabel);
  qbar.appendChild(qgrid);

  var box = el('div', 'rw-chatbox');
  box.appendChild(head);
  box.appendChild(thread);
  box.appendChild(qbar);

  var allBtn = el('button', 'rw-allbtn');
  allBtn.type = 'button';
  allBtn.setAttribute('aria-expanded', 'false');

  host.appendChild(box);
  host.appendChild(allBtn);

  /* ---------- الحالة ---------- */

  var stage = 'period'; // period → hours → dur → done
  var period = null;
  var hours = null;
  var timers = [];
  var typingRow = null;

  function wait(ms, fn) {
    timers.push(setTimeout(fn, ms));
  }
  function clearTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }
  function toBottom() {
    thread.scrollTop = thread.scrollHeight;
  }

  /* ---------- الرسائل ---------- */

  function resultCard(r) {
    var c = el('div', 'rw-res');
    c.appendChild(el('div', 'rw-res-t', r.title));
    var p = el('div', 'rw-res-p');
    p.appendChild(document.createTextNode(r.price + ' '));
    p.appendChild(el('span', null, D.currency));
    c.appendChild(p);
    c.appendChild(el('div', 'rw-res-c', r.cap));
    var a = el('a', 'rw-res-b', 'اشترك الآن');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener';
    c.appendChild(a);
    c.appendChild(el('div', 'rw-res-n', 'يفتح صفحة الباقة في المتجر لإتمام الطلب'));
    return c;
  }

  function addMsg(who, text, res) {
    var row = el('div', 'rw-row rw-row-' + who);
    if (who === 'g') row.appendChild(avatar(true, ''));
    var bub = el('div', 'rw-bub rw-bub-' + who);
    bub.appendChild(el('div', 'rw-txt-' + who, text));
    if (res) bub.appendChild(resultCard(res));
    row.appendChild(bub);
    thread.appendChild(row);
    toBottom();
  }

  function showTyping() {
    if (typingRow) return;
    typingRow = el('div', 'rw-row rw-row-g');
    typingRow.appendChild(avatar(true, ''));
    var b = el('div', 'rw-bub rw-bub-g rw-typing');
    for (var i = 0; i < 3; i++) b.appendChild(el('span', 'rw-tdot'));
    typingRow.appendChild(b);
    thread.appendChild(typingRow);
    toBottom();
  }

  function hideTyping() {
    if (typingRow && typingRow.parentNode) typingRow.parentNode.removeChild(typingRow);
    typingRow = null;
  }

  function say(text, delay, res) {
    showTyping();
    wait(delay, function () {
      hideTyping();
      addMsg('g', text, res);
    });
  }

  /* ---------- الردود السريعة ---------- */

  function qbtn(label, sub, kind, fn) {
    var b = el('button', kind ? 'rw-q rw-q-' + kind : 'rw-q');
    b.type = 'button';
    b.appendChild(el('span', null, label));
    if (sub) b.appendChild(el('span', 'rw-q-sub', sub));
    b.addEventListener('click', fn);
    return b;
  }

  function renderQuick() {
    var items = [];
    var cols = 2;

    if (stage === 'period') {
      qlabel.textContent = 'اختر ردك:';
      items = [
        // بلا سطر وقت تحت الاسم (قرار العميل) — الدوام يبقى في التذييل
        qbtn(D.periods.m.label, null, 'gold', function () { pickPeriod('m'); }),
        qbtn(D.periods.e.label, null, 'dark', function () { pickPeriod('e'); })
      ];
    } else if (stage === 'hours') {
      cols = 3;
      qlabel.textContent = 'اختر ردك:';
      items = [qbtn(D.hourLabel, null, null, function () { pickHours('hour'); })];
      D.periods[period].packs.forEach(function (k, i) {
        items.push(qbtn(k.label, null, null, function () { pickHours(i); }));
      });
    } else if (stage === 'dur') {
      qlabel.textContent = 'اختر ردك:';
      items = DUR.map(function (d) {
        var price = D.periods[period].packs[hours].prices[d[0]].price;
        return qbtn(d[1], price + ' ' + D.currency, null, function () { pickDur(d[0]); });
      });
    } else {
      qlabel.textContent = 'هل تحتاج شيئاً آخر؟';
      items = [
        qbtn('ابدأ من جديد', null, 'primary', restart),
        qbtn('أرسل لي سؤالاً على واتساب', null, null, function () {
          window.open(D.wa, '_blank', 'noopener');
        })
      ];
    }

    qgrid.textContent = '';
    qgrid.className = 'rw-qr rw-qr-' + cols;
    for (var i = 0; i < items.length; i++) qgrid.appendChild(items[i]);
  }

  /* ---------- مسار المحادثة ---------- */

  function syncPeriod() {
    var r = document.getElementById('rw-p-' + (period || 'm'));
    if (r) r.checked = true;
  }

  function pickPeriod(key) {
    period = key;
    stage = 'hours';
    syncPeriod();
    addMsg('u', D.periods[key].label);
    renderQuick();
    say('اختيار موفق. وكم ساعة يبقى طفلك في المركز؟', 750);
  }

  function pickHours(val) {
    var p = D.periods[period];
    if (val === 'hour') {
      hours = 'hour';
      stage = 'done';
      addMsg('u', D.hourLabel);
      renderQuick();
      say('اشتراك الساعة الواحدة متاح مباشرة. هذا هو الرابط لإتمام الطلب:', 800, {
        title: p.label + ' · ' + D.hourLabel,
        price: p.hour.price,
        cap: D.hourCap,
        url: p.hour.url
      });
      return;
    }
    hours = val;
    stage = 'dur';
    addMsg('u', p.packs[val].label);
    renderQuick();
    say('تمام. وكم مدة الاشتراك التي تريدها؟', 750);
  }

  function pickDur(key) {
    var p = D.periods[period];
    var pack = p.packs[hours];
    var d = null;
    for (var i = 0; i < DUR.length; i++) if (DUR[i][0] === key) d = DUR[i];
    stage = 'done';
    addMsg('u', d[1]);
    renderQuick();
    say('وجدت الباقة المناسبة لطفلك. هذا هو الرابط لإتمام الطلب:', 850, {
      title: p.label + ' · ' + pack.label + ' · ' + d[1],
      price: pack.prices[key].price,
      cap: d[2],
      url: pack.prices[key].url
    });
  }

  function restart() {
    clearTimers();
    hideTyping();
    thread.textContent = '';
    stage = 'period';
    period = null;
    hours = null;
    addMsg('g', 'لا مشكلة، نبدأ من جديد. متى تحتاج حضور طفلك — الفترة الصباحية أم المسائية؟');
    renderQuick();
  }

  /* ---------- مخرج «أعرف ما أريد» ---------- */

  var open = false;
  var LBL_OPEN = 'أعرف ما أريد — أعرض كل الأسعار';
  var LBL_CLOSE = 'إخفاء كل الأسعار';
  allBtn.textContent = LBL_OPEN;
  allBtn.addEventListener('click', function () {
    open = !open;
    if (open) fb.className = 'rw-fb rw-open';
    else fb.className = 'rw-fb';
    allBtn.textContent = open ? LBL_CLOSE : LBL_OPEN;
    allBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---------- الإقلاع ---------- */

  root.className = root.className ? root.className + ' rw-js' : 'rw-js';
  syncPeriod();
  addMsg('g', 'مرحباً بك في مركز رواد المستقبل للأطفال. أنا هنا لأدلّك على الباقة المناسبة لطفلك في أقل من دقيقة.');
  renderQuick();
  say('متى تحتاج حضور طفلك — الفترة الصباحية أم المسائية؟', 700);
})();
