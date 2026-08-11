/**
 * مرشد الباقات — تحسين تدريجي فوق شبكة أسعار ثابتة (v4)
 *
 * يُضمَّن حرفيًا داخل وسم سكربت في site/index.html وقت البناء (لا modules ولا imports — قيد سلة).
 * يقرأ البيانات من كتلة JSON بالمعرّف rw-data المولَّدة من packages.json.
 *
 * قاعدة الفشل الآمن: لا يُضاف الصنف rw-js إلا بعد نجاح البناء كاملًا،
 * فأي خطأ أو تعطيل لـJS يترك جدول الأسعار الثابت ظاهرًا كما هو.
 *
 * v4: الأسئلة موصوفة بلغة الأسرة (لكل خيار وصف بشري)، وزر رجوع حقيقي،
 *     واقتراح عند «لست متأكد»، وحساب التوفير من الأسعار نفسها، وبديل قريب بعد النتيجة.
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

  var DUR = D.durations; // [[key, label, cap, hint], …]

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

  function durOf(key) {
    for (var i = 0; i < DUR.length; i++) if (DUR[i][0] === key) return DUR[i];
    return null;
  }

  /**
   * التوفير مقابل المدة الأقصر: الأسبوع مقابل خمسة أيام، والشهر مقابل أربعة أسابيع،
   * والترم مقابل أربعة أشهر. تُحسب من الأسعار نفسها، فلا رقم مكتوب يدويًا.
   * تُعاد null إن لم يكن هناك توفير موجب (سعر ترويجي مثلًا) فلا يُعرض ادعاء خاطئ.
   */
  function saving(periodKey, hoursIdx, durKey) {
    var cmp = D.compare[durKey];
    if (!cmp || hoursIdx === 'hour' || hoursIdx == null) return null;
    var prices = D.periods[periodKey].packs[hoursIdx].prices;
    var base = prices[cmp.per];
    if (!base) return null;
    var diff = cmp.count * base.price - prices[durKey].price;
    return diff > 0 ? { amount: diff, label: cmp.label } : null;
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

  var step = el('span', 'rw-step');
  var backBtn = el('button', 'rw-qlink', 'رجوع ↩');
  backBtn.type = 'button';
  var unsureBtn = el('button', 'rw-qlink', 'لست متأكد؟');
  unsureBtn.type = 'button';
  var tools = el('span', 'rw-qtools');
  tools.appendChild(backBtn);
  tools.appendChild(unsureBtn);
  var top = el('div', 'rw-qtop');
  top.appendChild(step);
  top.appendChild(tools);

  var qlabel = el('div', 'rw-qlabel');
  var qgrid = el('div', 'rw-qr rw-qr-2');
  var qbar = el('div', 'rw-qbar');
  qbar.appendChild(top);
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

  var stage = 'period'; // period → hours (hoursSugg) → dur (durSugg) → done
  var period = null;
  var hours = null;
  var dur = null;
  var timers = [];
  var typingRow = null;
  var history = [];

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

  // لقطة قبل كل انتقال، ليعيدها زر «رجوع» بلا آثار جانبية
  function snapshot() {
    history.push({ stage: stage, period: period, hours: hours, dur: dur, msgs: thread.children.length });
  }

  function goBack() {
    if (!history.length) return;
    clearTimers();
    hideTyping();
    var s = history.pop();
    while (thread.children.length > s.msgs) thread.removeChild(thread.lastChild);
    stage = s.stage;
    period = s.period;
    hours = s.hours;
    dur = s.dur;
    syncPeriod();
    renderQuick();
    toBottom();
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
    // حبّة قصيرة + سطر تفسيري: النص كاملًا داخل حبّة واحدة كان يلتفّ سطرين على الجوال
    if (r.save) {
      var sv = el('div', 'rw-res-s');
      sv.appendChild(el('span', 'rw-res-s-pill', 'أوفر بـ' + r.save.amount + ' ' + D.currency));
      sv.appendChild(el('div', 'rw-res-s-sub', 'مقابل ' + r.save.label));
      c.appendChild(sv);
    }
    var a = el('a', 'rw-res-b', 'اشترك الآن');
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener';
    c.appendChild(a);
    c.appendChild(el('div', 'rw-res-n', 'يفتح صفحة الباقة في المتجر لإتمام الطلب'));
    return c;
  }

  function addMsg(who, text, res) {
    // فقاعة تحمل بطاقة سعر تُوسَّم لتأخذ عرضًا أكبر — 84% تخنق البطاقة على الجوال
    var row = el('div', 'rw-row rw-row-' + who + (res ? ' rw-row-res' : ''));
    if (who === 'g') row.appendChild(avatar(true, ''));
    var bub = el('div', 'rw-bub rw-bub-' + who + (res ? ' rw-bub-res' : ''));
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

  function qbtn(label, sub, kind, fn, save) {
    var b = el('button', kind ? 'rw-q rw-q-' + kind : 'rw-q');
    b.type = 'button';
    b.appendChild(el('span', null, label));
    if (sub) b.appendChild(el('span', 'rw-q-sub', sub));
    if (save) b.appendChild(el('span', 'rw-q-save', 'أوفر بـ' + save.amount));
    b.addEventListener('click', fn);
    return b;
  }

  var STEP_OF = { period: 1, hours: 2, hoursSugg: 2, dur: 3, durSugg: 3 };

  function renderQuick() {
    var items = [];
    var cols = 2;

    if (stage === 'period') {
      qlabel.textContent = 'اختر ردك:';
      items = [
        qbtn(D.periods.m.label, D.periods.m.hint, 'gold', function () { pickPeriod('m'); }),
        qbtn(D.periods.e.label, D.periods.e.hint, 'dark', function () { pickPeriod('e'); })
      ];
    } else if (stage === 'hours') {
      cols = 3;
      qlabel.textContent = 'اختر ردك:';
      items = [qbtn(D.hourLabel, D.hourHint, null, function () { pickHours('hour'); })];
      D.periods[period].packs.forEach(function (k, i) {
        items.push(qbtn(k.label, k.hint, null, function () { pickHours(i); }));
      });
    } else if (stage === 'hoursSugg') {
      qlabel.textContent = 'اختر ردك:';
      var rec = recIndex();
      items = [
        qbtn('نعم، ' + D.periods[period].packs[rec].label, null, 'primary', function () { pickHours(rec); }),
        qbtn('أرني بقية الخيارات', null, null, function () { stage = 'hours'; renderQuick(); })
      ];
    } else if (stage === 'dur') {
      qlabel.textContent = 'اختر ردك:';
      items = DUR.map(function (d) {
        var price = D.periods[period].packs[hours].prices[d[0]].price;
        return qbtn(d[1], price + ' ' + D.currency + ' · ' + d[3], null, function () { pickDur(d[0]); }, saving(period, hours, d[0]));
      });
    } else if (stage === 'durSugg') {
      qlabel.textContent = 'اختر ردك:';
      var rd = D.guide.recommendedDuration;
      items = [
        qbtn('نعم، ' + durOf(rd)[1], null, 'primary', function () { pickDur(rd); }),
        qbtn('أرني بقية المدد', null, null, function () { stage = 'dur'; renderQuick(); })
      ];
    } else {
      qlabel.textContent = 'هل تحتاج شيئاً آخر؟';
      items = [qbtn('ابدأ من جديد', null, 'primary', restart)];
      var alt = altHours();
      if (alt) items.push(qbtn(alt.label, alt.sub, null, function () { showAlt(alt); }));
      items.push(qbtn('أرسل لي سؤالاً على واتساب', null, null, function () {
        window.open(D.wa, '_blank', 'noopener');
      }));
    }

    step.textContent = STEP_OF[stage] ? 'الخطوة ' + STEP_OF[stage] + ' من 3' : '';
    backBtn.style.display = history.length ? '' : 'none';
    unsureBtn.style.display = stage === 'hours' || stage === 'dur' ? '' : 'none';

    qgrid.textContent = '';
    qgrid.className = 'rw-qr rw-qr-' + cols;
    for (var i = 0; i < items.length; i++) qgrid.appendChild(items[i]);
  }

  /* ---------- مسار المحادثة ---------- */

  function syncPeriod() {
    var r = document.getElementById('rw-p-' + (period || 'm'));
    if (r) r.checked = true;
  }

  function recIndex() {
    var packs = D.periods[period].packs;
    for (var i = 0; i < packs.length; i++) if (packs[i].hours === D.guide.recommendedHours) return i;
    return Math.floor(packs.length / 2);
  }

  function pickPeriod(key) {
    snapshot();
    period = key;
    stage = 'hours';
    syncPeriod();
    addMsg('u', D.periods[key].label);
    renderQuick();
    say('كم يبقى طفلك عندنا في اليوم عادةً؟', 750);
  }

  function pickHours(val) {
    snapshot();
    var p = D.periods[period];
    if (val === 'hour') {
      hours = 'hour';
      dur = null;
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
    say('تمام. ولأي مدة تريد الاشتراك؟', 750);
  }

  function pickDur(key) {
    snapshot();
    var p = D.periods[period];
    var pack = p.packs[hours];
    var d = durOf(key);
    dur = key;
    stage = 'done';
    addMsg('u', d[1]);
    renderQuick();
    say('هذه أنسب باقة لما اخترته. اضغط «اشترك الآن» لإتمام الطلب:', 850, {
      title: p.label + ' · ' + pack.label + ' · ' + d[1],
      price: pack.prices[key].price,
      cap: d[2],
      url: pack.prices[key].url,
      save: saving(period, hours, key)
    });
  }

  /* اقتراح عند «لست متأكد» — بلا ادعاءات لا تسندها البيانات */
  function suggest() {
    snapshot();
    if (stage === 'hours') {
      var rec = D.periods[period].packs[recIndex()];
      stage = 'hoursSugg';
      renderQuick();
      // بناء الجملة بشرطة لا بفعل متعدٍّ: الوصف مصوغ كتسمية للأزرار، فنصبه بعد «تغطي» خطأ
      say(rec.label + ' — ' + rec.hint + '، وهي الخيار الأوسط بين باقاتنا. أبدأ بها؟', 700);
    } else if (stage === 'dur') {
      var rd = D.guide.recommendedDuration;
      var d = durOf(rd);
      var price = D.periods[period].packs[hours].prices[rd].price;
      var s = saving(period, hours, rd);
      stage = 'durSugg';
      renderQuick();
      say(
        d[1] + ' بـ' + price + ' ' + D.currency +
        (s ? ' — أوفر بـ' + s.amount + ' ' + D.currency + ' مقابل ' + s.label : '') +
        '. أختاره لك؟',
        700
      );
    }
  }

  /* بديل قريب بعد النتيجة: الشريحة التالية من الساعات بنفس المدة */
  function altHours() {
    if (stage !== 'done' || period == null) return null;
    var packs = D.periods[period].packs;
    var idx, key;
    if (hours === 'hour') {
      idx = 0;
      key = 'day';
    } else {
      idx = hours < packs.length - 1 ? hours + 1 : hours - 1;
      key = dur;
    }
    if (idx < 0 || idx >= packs.length || !key) return null;
    var here = hours === 'hour' ? D.periods[period].hour.price : packs[hours].prices[dur].price;
    var there = packs[idx].prices[key].price;
    var diff = there - here;
    return {
      idx: idx,
      key: key,
      label: 'جرّب ' + packs[idx].label,
      sub: there + ' ' + D.currency + ' (' + (diff >= 0 ? '+' : '−') + Math.abs(diff) + ')'
    };
  }

  function showAlt(alt) {
    snapshot();
    var p = D.periods[period];
    var pack = p.packs[alt.idx];
    var d = durOf(alt.key);
    hours = alt.idx;
    dur = alt.key;
    addMsg('u', 'أرني ' + pack.label);
    renderQuick();
    say('هذه أنسب باقة لما اخترته. اضغط «اشترك الآن» لإتمام الطلب:', 700, {
      title: p.label + ' · ' + pack.label + ' · ' + d[1],
      price: pack.prices[alt.key].price,
      cap: d[2],
      url: pack.prices[alt.key].url,
      save: saving(period, alt.idx, alt.key)
    });
  }

  function restart() {
    clearTimers();
    hideTyping();
    thread.textContent = '';
    history = [];
    stage = 'period';
    period = null;
    hours = null;
    dur = null;
    addMsg('g', 'لا مشكلة، نبدأ من جديد. متى تحتاج حضور طفلك — الفترة الصباحية أم المسائية؟');
    renderQuick();
  }

  backBtn.addEventListener('click', goBack);
  unsureBtn.addEventListener('click', suggest);

  /* ---------- مخرج «أعرف ما أريد» ---------- */

  var open = false;
  var LBL_OPEN = 'أعرف ما أريد — أعرض كل الأسعار';
  var LBL_CLOSE = 'إخفاء كل الأسعار';
  allBtn.textContent = LBL_OPEN;
  allBtn.addEventListener('click', function () {
    open = !open;
    fb.className = open ? 'rw-fb rw-open' : 'rw-fb';
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
