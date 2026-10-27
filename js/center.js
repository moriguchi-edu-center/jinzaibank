(function () {
  "use strict";
  var J = window.Jinzai;
  var KEY = "jinzai-center-v1";
  var opening = J.workMonth();
  var saved = J.loadStore(KEY, null);
  var storedSettings = saved && saved.settings;
  var state = saved || {
    tab: "check",
    peopleTab: "instructors",
    instructors: [],
    accounts: [],
    schools: J.defaultSchools(),
    documents: [],
    payments: {},
    settings: J.defaultSettings()
  };
  state.settings = privateSettings(storedSettings);
  if (!state.payments) state.payments = {};
  if (!state.schools || !state.schools.length) state.schools = J.defaultSchools();
  state.schools = J.alignSchools(state.schools);
  state.check = state.check || { year: opening.year, month: opening.month, mode: "school", selected: "__all__", showPlan: true, query: "" };
  if (state.check.docType !== "plan" && state.check.docType !== "report") state.check.docType = state.check.showPlan === false ? "report" : "all";
  if (state.check.view !== "calendar" && state.check.view !== "source") state.check.view = "calendar";
  state.pay = state.pay || { year: opening.year, month: opening.month };
  state.importLog = [];
  var editor = null;

  function privateSettings(saved) {
    var next = J.defaultSettings();
    if (!saved) return next;
    if (saved.organization) next.organization = saved.organization;
    if (saved.payer) next.payer = saved.payer;
    if (saved.payColumns) next.payColumns = saved.payColumns;
    if (!saved.configured) return next;
    next.configured = true;
    next.rates = {
      subject: saved.rates ? saved.rates.subject : null,
      club: saved.rates ? saved.rates.club : null,
      kodomo: saved.rates ? saved.rates.kodomo : null,
      university: saved.rates ? saved.rates.university : null
    };
    next.taxRate = saved.taxRate == null || saved.taxRate === "" ? null : saved.taxRate;
    next.taxRateOver = saved.taxRateOver == null || saved.taxRateOver === "" ? null : saved.taxRateOver;
    next.taxThreshold = saved.taxThreshold == null || saved.taxThreshold === "" ? null : saved.taxThreshold;
    next.withholding = !!saved.withholding;
    return next;
  }

  function storedMoney(settings) {
    if (!settings || settings.configured) return false;
    var rates = settings.rates || {};
    return ["subject", "club", "kodomo", "university"].some(function (id) {
      return rates[id] != null && rates[id] !== "";
    }) || (settings.taxRate != null && settings.taxRate !== "")
      || (settings.taxRateOver != null && settings.taxRateOver !== "")
      || (settings.taxThreshold != null && settings.taxThreshold !== "");
  }

  if (storedMoney(storedSettings)) save();

  function save() {
    var ok = J.saveStore(KEY, {
      tab: state.tab,
      peopleTab: state.peopleTab,
      instructors: state.instructors,
      accounts: state.accounts,
      schools: state.schools,
      documents: state.documents,
      payments: state.payments,
      settings: state.settings,
      check: { year: state.check.year, month: state.check.month, mode: state.check.mode, selected: state.check.selected, showPlan: state.check.docType !== "report", docType: state.check.docType, view: state.check.view === "source" ? "source" : "calendar" },
      pay: state.pay
    });
    if (!ok) alert("このブラウザに保存できませんでした。設定の「バックアップを書き出す」でファイルに残してください。");
  }

  function render() {
    var tabs = [
      ["check", "実績チェック"],
      ["pay", "支払い"],
      ["import", "取込"],
      ["people", "指導者・口座"],
      ["schools", "学校園"],
      ["settings", "設定"]
    ];
    document.getElementById("tabs").innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (state.tab === t[0] ? " active" : "") + '" data-action="tab" data-tab="' + t[0] + '">' + t[1] + "</button>";
    }).join("");
    var view = {
      check: viewCheck,
      pay: viewPay,
      import: viewImport,
      people: viewPeople,
      schools: viewSchools,
      settings: viewSettings
    }[state.tab];
    document.getElementById("app").innerHTML = view();
    var zone = document.getElementById("dropzone");
    if (zone) bindDrop(zone);
  }

  function monthDocs(year, month) {
    return state.documents.filter(function (d) {
      return Number(d.year) === Number(year) && Number(d.month) === Number(month);
    });
  }

  function viewCheck() {
    var c = state.check;
    var allMonth = monthDocs(c.year, c.month);
    var docs = allMonth.filter(function (d) {
      if (c.docType === "plan") return d.type === "plan";
      if (c.docType === "report") return d.type === "report";
      return d.type === "plan" || d.type === "report";
    });
    var groups = c.mode === "school" ? schoolGroups(docs) : personGroups(docs);
    if (!groups.some(function (g) { return g.id === c.selected; })) c.selected = "__all__";
    var q = (c.query || "").trim();
    var visible = groups.filter(function (g) {
      if (g.id === "__all__") return true;
      return !q || (g.label + " " + g.sub).indexOf(q) >= 0;
    });
    var selectedDocs = docs.filter(function (d) { return matchesSelection(d, c); });
    var reconcileDocs = allMonth.filter(function (d) { return matchesSelection(d, c); });
    var list = visible.map(function (g) {
      return '<button class="list-btn' + (c.selected === g.id ? " active" : "") + '" data-action="select-check" data-id="' + J.esc(g.id) + '" data-text="' + J.esc(g.label + " " + g.sub) + '">' +
        "<strong>" + J.esc(g.label) + (g.badge ? ' <span class="badge warn">' + J.esc(g.badge) + "</span>" : "") + "</strong>" +
        "<span>" + J.esc(g.sub) + "</span></button>";
    }).join("");
    return '<section class="panel no-print"><div class="toolbar">' +
      '<label class="field">年<input name="checkYear" type="number" min="2019" max="2100" value="' + c.year + '"></label>' +
      '<label class="field">月<input name="checkMonth" type="number" min="1" max="12" value="' + c.month + '"></label>' +
      '<div class="seg" role="group" aria-label="見方">' +
      '<button type="button" class="' + (c.mode === "school" ? "active" : "") + '" data-action="mode" data-mode="school">学校ごと</button>' +
      '<button type="button" class="' + (c.mode === "person" ? "active" : "") + '" data-action="mode" data-mode="person">人ごと</button></div>' +
      '<div class="seg" role="group" aria-label="種類">' +
      '<button type="button" class="' + (c.docType !== "plan" && c.docType !== "report" ? "active" : "") + '" data-action="doc-type" data-type="all">すべて</button>' +
      '<button type="button" class="' + (c.docType === "plan" ? "active" : "") + '" data-action="doc-type" data-type="plan">活用計画</button>' +
      '<button type="button" class="' + (c.docType === "report" ? "active" : "") + '" data-action="doc-type" data-type="report">実績報告</button></div>' +
      '<label class="field">絞り込み<input name="checkQuery" value="' + J.esc(c.query || "") + '" placeholder="学校名・氏名"></label></div>' +
      statusStrip(c.year, c.month) + "</section>" +
      '<div class="grid-2"><section class="panel no-print" style="max-height:78vh;overflow:auto"><h2>' +
      (c.mode === "school" ? "学校" : "指導者") + "</h2>" + list + "</section>" +
      '<section class="panel"><h2>' + J.esc(J.wareki(c.year, c.month)) + "　" + J.esc(selectionLabel(c, groups)) + "</h2>" +
      '<div class="toolbar"><div class="seg" role="group" aria-label="表示">' +
      '<button type="button" class="' + (c.view !== "source" ? "active" : "") + '" data-action="check-view" data-view="calendar">カレンダー</button>' +
      '<button type="button" class="' + (c.view === "source" ? "active" : "") + '" data-action="check-view" data-view="source">もとのデータ</button></div></div>' +
      '<p class="small">' + (c.view === "source"
        ? "提出された明細です。開始や終了が空の行も出します。内容を直すときは、学校で同じ書類を修正して提出ファイルを出し直してください。"
        : "指導者ごとのカレンダーです。開始と終了がある行だけを出します。予定を押すと、その書類のもとのデータを開きます。") + "</p>" +
      (c.view === "source" ? "" : '<div class="legend"><span><i class="swatch" style="background:#ead0c6"></i>実績報告</span><span><i class="swatch" style="background:white;border:1px dashed #6aa4c8"></i>活用計画</span><span>赤枠は、同じ指導者の開始から終了が重なっています。</span></div>') +
      instructorBlocks(selectedDocs) + "</section></div>" +
      '<section class="panel"><div class="split"><h2>計画と実績の突合</h2>' +
      '<button type="button" class="btn" data-action="notice-image">学校への連絡画像を書き出す</button></div>' +
      '<p class="small">同じ学校・同じ指導者・同じ活動で、計画と報告の時間を比べています。表示中の' +
      (c.mode === "school" ? "学校" : "指導者") + "が対象です。連絡画像には、時間の重なり、計画と実績の違い、曜日の違い、日付や時刻が揃っていない行を入れます。</p>" +
      (function () {
        var weekdayLines = weekdayIssues(reconcileDocs);
        if (!weekdayLines.length) return "";
        return '<h3>曜日の確認</h3><ul>' + weekdayLines.map(function (line) { return "<li>" + J.esc(line) + "</li>"; }).join("") + "</ul>";
      })() +
      reconcileTable(reconcileDocs) + "</section>";
  }

  function statusStrip(year, month) {
    var docs = monthDocs(year, month);
    var reports = docs.filter(function (d) { return d.type === "report"; });
    var plans = docs.filter(function (d) { return d.type === "plan"; });
    var people = {};
    reports.forEach(function (d) {
      if (!people[d.instructorId]) people[d.instructorId] = {};
      people[d.instructorId][d.schoolName] = true;
    });
    var multi = Object.keys(people).filter(function (id) { return Object.keys(people[id]).length > 1; }).length;
    var missing = reconcileRows(docs).filter(function (r) { return r.status === "報告がない"; }).length;
    var pay = state.payments[J.monthKey(year, month)];
    var clashes = overlapDayCount(year, month);
    return '<p class="note">実績 ' + reports.length + "件　計画 " + plans.length + "件　複数の学校で活動した指導者 " + multi +
      "人　報告がない計画 " + missing + "件　活動時間が重なっている日 " + clashes + "日" +
      (pay ? "　この月の支払いは" + J.esc(J.warekiFromISO(pay.confirmedAt.slice(0, 10))) + "に確定済み" : "") +
      "。報告の提出めどは " + J.esc(J.warekiFromISO(J.reportDueISO(year, month))) + " です。</p>";
  }

  function codeForSchoolName(name) {
    var listed = J.findSchool(state.schools, name);
    if (J.schoolCodeOf(listed)) return J.schoolCodeOf(listed);
    return J.schoolCodeOf(J.knownSchool(name)) || 0;
  }

  function nextSchoolCode() {
    var max = 0;
    state.schools.forEach(function (school) {
      var code = J.schoolCodeOf(school);
      if (code > max) max = code;
    });
    return max + 1;
  }

  function schoolGroups(docs) {
    var map = {};
    docs.forEach(function (d) {
      var key = d.schoolName || "（学校名なし）";
      if (!map[key]) map[key] = { reports: 0, minutes: 0 };
      if (d.type === "report") {
        map[key].reports += 1;
        map[key].minutes += J.documentMinutes(d);
      }
    });
    var list = [{ id: "__all__", label: "すべての学校", sub: "届いている活動をまとめて表示", badge: "" }];
    Object.keys(map).sort(function (a, b) {
      var ac = codeForSchoolName(a) || 9999;
      var bc = codeForSchoolName(b) || 9999;
      if (ac !== bc) return ac - bc;
      return a.localeCompare(b, "ja");
    }).forEach(function (name) {
      var code = codeForSchoolName(name);
      list.push({
        id: name,
        label: (code ? code + "　" : "") + name,
        sub: "実績 " + map[name].reports + "件 / " + J.formatMinutes(map[name].minutes),
        badge: ""
      });
    });
    return list;
  }

  function personGroups(docs) {
    var map = {};
    docs.forEach(function (d) {
      var key = String(d.instructorId || "");
      if (!map[key]) map[key] = { name: d.instructorName, schools: {}, minutes: 0, reports: 0 };
      if (d.type === "report") {
        map[key].schools[d.schoolName] = true;
        map[key].minutes += J.documentMinutes(d);
        map[key].reports += 1;
      } else {
        map[key].schools[d.schoolName] = true;
      }
    });
    var list = [{ id: "__all__", label: "すべての指導者", sub: "他校での活動も同じ画面に出します", badge: "" }];
    Object.keys(map).sort(function (a, b) {
      return String(map[a].name || "").localeCompare(String(map[b].name || ""), "ja");
    }).forEach(function (id) {
      var item = map[id];
      var schools = Object.keys(item.schools).filter(Boolean);
      list.push({
        id: id,
        label: item.name + "（" + id + "）",
        sub: schools.join("、") + " / 実績 " + J.formatMinutes(item.minutes),
        badge: schools.length > 1 ? schools.length + "校" : ""
      });
    });
    return list;
  }

  function matchesSelection(doc, check) {
    if (check.selected === "__all__") return true;
    if (check.mode === "school") return doc.schoolName === check.selected;
    return String(doc.instructorId) === String(check.selected);
  }

  function selectionLabel(check, groups) {
    var found = groups.find(function (g) { return g.id === check.selected; });
    if (found) return found.label;
    return check.mode === "school" ? "すべての学校" : "すべての指導者";
  }

  function clockMinutes(value) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  function reportSlots(year, month) {
    var slots = [];
    monthDocs(year, month).forEach(function (doc) {
      if (doc.type !== "report") return;
      J.usableSessions(doc).forEach(function (session, index) {
        var start = clockMinutes(session.start);
        var end = clockMinutes(session.end);
        if (start == null || end == null || end <= start) return;
        slots.push({ doc: doc, session: session, index: index, start: start, end: end });
      });
    });
    return slots;
  }

  function conflictsOf(slot, slots) {
    return slots.filter(function (other) {
      if (other.doc === slot.doc && other.index === slot.index) return false;
      if (String(other.doc.instructorId) !== String(slot.doc.instructorId)) return false;
      if (other.session.date !== slot.session.date) return false;
      return slot.start < other.end && other.start < slot.end;
    });
  }

  function overlapDayCount(year, month) {
    var slots = reportSlots(year, month);
    var days = {};
    slots.forEach(function (slot) {
      if (conflictsOf(slot, slots).length) days[slot.session.date] = true;
    });
    return Object.keys(days).length;
  }

  function calendarHtml(year, month, docs, mode, personScope) {
    var first = new Date(year, month - 1, 1).getDay();
    var days = new Date(year, month, 0).getDate();
    var slots = reportSlots(year, month);
    var byDate = {};
    docs.forEach(function (d) {
      J.usableSessions(d).forEach(function (s) {
        if (!byDate[s.date]) byDate[s.date] = [];
        byDate[s.date].push({ doc: d, session: s });
      });
    });
    var cells = "";
    for (var i = 0; i < first; i++) cells += '<div class="day out"></div>';
    for (var day = 1; day <= days; day++) {
      var iso = year + "-" + J.pad2(month) + "-" + J.pad2(day);
      var dow = new Date(year, month - 1, day).getDay();
      var items = (byDate[iso] || []).slice().sort(function (a, b) {
        return String(a.session.start || "").localeCompare(String(b.session.start || ""));
      });
      var dayClash = false;
      var chips = items.map(function (item) {
        var plan = item.doc.type === "plan";
        var range = (item.session.start || "") + "–" + (item.session.end || "");
        var colorKey = personScope ? (item.doc.schoolName || item.doc.title) : (mode === "person" ? item.doc.schoolName : item.doc.instructorId);
        var who = personScope
          ? ((item.doc.schoolName || "") + " " + (item.doc.title || "")).trim()
          : (mode === "school" ? item.doc.instructorName : item.doc.schoolName);
        if (!personScope && state.check.selected === "__all__") {
          who = mode === "school"
            ? item.doc.schoolName + " " + item.doc.instructorName
            : item.doc.instructorName + " " + item.doc.schoolName;
        }
        var slot = slots.find(function (x) { return x.doc === item.doc && x.session === item.session; });
        var conflicts = slot ? conflictsOf(slot, slots) : [];
        if (conflicts.length) dayClash = true;
        var clash = conflicts.map(function (other) {
          var where = other.doc.schoolName !== item.doc.schoolName ? other.doc.schoolName + " " : "";
          var what = other.doc.title && other.doc.title !== item.doc.title ? other.doc.title + " " : "";
          return where + what + other.session.start + "–" + other.session.end;
        }).join("、");
        return '<button type="button" class="chip' + (plan ? " plan" : "") + (conflicts.length ? " overlap" : "") + '" style="background:' + J.colorWash(colorKey) + ";color:" + J.colorFor(colorKey) + '" data-action="show-detail" data-id="' + J.esc(item.doc.id) + '" data-date="' + iso + '" title="' + J.esc(range + " " + who + (clash ? " / " + clash + "と重なり" : "")) + '">' +
          "<b>" + J.esc(range) + "</b><span>" + J.esc(who) + "</span>" +
          (clash ? '<span class="clash">' + J.esc(clash) + "と重なり</span>" : "") + "</button>";
      }).join("");
      cells += '<div class="day' + (dow === 0 ? " sun" : "") + (dow === 6 ? " sat" : "") + (iso === J.todayISO() ? " today" : "") + (dayClash ? " has-overlap" : "") + '"><div class="num">' + day + "</div>" + chips + "</div>";
    }
    while ((first + days) % 7) { cells += '<div class="day out"></div>'; days++; }
    return '<div class="cal"><div class="cal-dow sun">日</div><div class="cal-dow">月</div><div class="cal-dow">火</div><div class="cal-dow">水</div><div class="cal-dow">木</div><div class="cal-dow">金</div><div class="cal-dow sat">土</div>' + cells + "</div>";
  }

  function sourceTable(docs) {
    var focus = state.detail && state.detail.id;
    var ordered = docs.slice().sort(function (a, b) {
      if (a.type !== b.type) return a.type === "plan" ? -1 : 1;
      return String(a.schoolName || "").localeCompare(String(b.schoolName || ""), "ja") || String(a.title || "").localeCompare(String(b.title || ""), "ja");
    });
    var rows = ordered.map(function (doc) {
      var plan = doc.type === "plan";
      var kind = plan ? "is-plan" : "is-report";
      var focusClass = focus === doc.id ? " is-focus" : "";
      var sessions = (doc.sessions || []).filter(function (s) {
        return s && (s.date || s.start || s.end || s.content);
      });
      if (!sessions.length) sessions = [{}];
      return sessions.map(function (s, index) {
        var mins = J.sessionMinutes(s);
        var lead = index === 0
          ? "<td>" + (plan ? "活用計画" : "実績報告") + ' <button type="button" class="btn btn-danger" data-action="delete-doc" data-id="' + J.esc(doc.id) + '">削除</button></td><td>' + J.esc(doc.schoolName || "") + "</td><td>" + J.esc(doc.title || "") + "</td>"
          : "<td></td><td></td><td></td>";
        return '<tr class="' + kind + focusClass + '"' + (index === 0 ? ' data-src="' + J.esc(doc.id) + '"' : "") + ">" + lead +
          "<td>" + J.esc(s.date || "") + (s.date ? "（" + J.weekday(s.date) + "）" : "") + "</td><td>" +
          J.esc((s.start || "") + ((s.start || s.end) ? "–" : "") + (s.end || "")) + "</td><td>" +
          (mins == null || mins < 0 ? "" : J.formatMinutes(mins)) + "</td><td>" +
          (s.breakMinutes == null || s.breakMinutes === "" ? "" : J.esc(s.breakMinutes) + "分") + "</td><td>" + J.esc(s.content || "") + "</td></tr>";
      }).join("");
    }).join("");
    return '<div class="table-wrap"><table class="data"><thead><tr><th>種類</th><th>学校</th><th>活動</th><th>日</th><th>時刻</th><th>時間</th><th>休憩</th><th>その回の内容</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>";
  }

  function instructorBlocks(docs) {
    var map = {};
    docs.forEach(function (doc) {
      var id = String(doc.instructorId || "");
      if (!map[id]) map[id] = { id: id, name: doc.instructorName || "（氏名未入力）", schools: {}, docs: [] };
      map[id].docs.push(doc);
      if (doc.schoolName) map[id].schools[doc.schoolName] = true;
    });
    var order = Object.keys(map).sort(function (a, b) {
      return String(map[a].name).localeCompare(String(map[b].name), "ja");
    });
    if (!order.length) return '<p class="muted">この範囲の計画・報告はありません。</p>';
    return order.map(function (id) {
      var person = map[id];
      var schools = Object.keys(person.schools).sort(function (a, b) { return a.localeCompare(b, "ja"); });
      return '<section class="check-person"><h3>' + J.esc(person.name) + "（" + J.esc(person.id || "番号なし") + "）" +
        (schools.length ? "<span>" + J.esc(schools.join("、")) + "</span>" : "") + "</h3>" +
        (state.check.view === "source"
          ? '<div class="check-source">' + sourceTable(person.docs) + "</div>"
          : '<div class="check-cal">' + calendarHtml(state.check.year, state.check.month, person.docs, "person", true) + "</div>") +
        "</section>";
    }).join("");
  }

  function reconcileRows(docs) {
    return J.reconcileRows(docs);
  }

  function reconcileTable(docs) {
    var rows = reconcileRows(docs);
    if (!rows.length) return '<p class="muted">この条件の計画・報告はありません。</p>';
    return '<div class="table-wrap"><table class="data"><thead><tr><th>学校</th><th>指導者</th><th>活動</th><th>計画</th><th>実績</th><th>状態</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var cls = r.status === "一致" ? "ok" : (r.status === "報告がない" ? "bad" : "warn");
        return "<tr><td>" + J.esc(r.school) + "</td><td>" + J.esc(r.name) + "<div class=\"small\">" + J.esc(r.id) + "</div></td><td>" +
          J.esc(r.title) + "<div class=\"small\">" + J.esc(r.category) + "</div></td><td>" +
          (r.planMin == null ? "—" : J.formatMinutes(r.planMin)) + "</td><td>" +
          (r.reportMin == null ? "—" : J.formatMinutes(r.reportMin)) + '</td><td><span class="badge ' + cls + '">' + J.esc(r.status) + "</span></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function noticeFilePart(value) {
    return String(value || "").trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "") || "学校";
  }

  function noticeScopeDocs() {
    var c = state.check;
    return monthDocs(c.year, c.month).filter(function (doc) { return matchesSelection(doc, c); });
  }

  function noticeLines(year, month, mine) {
    var lines = [];
    reconcileRows(mine).forEach(function (row) {
      if (row.status === "一致") return;
      var who = (row.name || "氏名未入力") + "（" + (row.id || "番号なし") + "）「" + (row.title || "活動名なし") + "」";
      if (row.status === "時間差") {
        lines.push(who + "は、計画が" + (row.planMin == null ? "なし" : J.formatMinutes(row.planMin)) + "、実績が" + (row.reportMin == null ? "なし" : J.formatMinutes(row.reportMin)) + "で、時間が違います。");
      } else if (row.status === "日にちが違う") {
        lines.push(who + "は、活動日が計画と実績で違います。");
      } else if (row.status === "報告がない") {
        lines.push(who + "は、活用計画に対する実績報告がありません。");
      } else if (row.status === "計画がない") {
        lines.push(who + "は、実績報告に対する活用計画がありません。");
      }
    });
    var slots = reportSlots(year, month);
    var seen = {};
    slots.forEach(function (slot) {
      if (!mine.some(function (doc) { return doc.id === slot.doc.id; })) return;
      conflictsOf(slot, slots).forEach(function (other) {
        var pair = [slot.doc.id, slot.session.date, slot.start, other.doc.id, other.session.date, other.start].sort().join("|");
        if (seen[pair]) return;
        seen[pair] = true;
        var here = (slot.doc.instructorName || "氏名未入力") + "（" + (slot.doc.instructorId || "番号なし") + "）「" + (slot.doc.title || "活動名なし") + "」";
        var thereSchool = other.doc.schoolName && other.doc.schoolName !== slot.doc.schoolName ? other.doc.schoolName + "の" : "";
        var there = thereSchool + "「" + (other.doc.title || "活動名なし") + "」" + (other.session.date ? J.warekiFromISO(other.session.date) : "") + " " + (other.session.start || "") + "–" + (other.session.end || "");
        var hereWhen = (slot.session.date ? J.warekiFromISO(slot.session.date) + "（" + J.weekday(slot.session.date) + "）" : "日付未入力") + " " + (slot.session.start || "") + "–" + (slot.session.end || "");
        lines.push(here + "の" + hereWhen + "が、" + there + "と重なっています。");
      });
    });
    mine.forEach(function (doc) {
      var kind = doc.type === "plan" ? "活用計画" : "実績報告";
      var who = kind + " " + (doc.instructorName || "氏名未入力") + "（" + (doc.instructorId || "番号なし") + "）「" + (doc.title || "活動名なし") + "」";
      J.validateDocument(doc).forEach(function (message) {
        if (/^\d+行目/.test(message)) lines.push(who + "の" + message.replace("を入力してください。", "が揃っていません。"));
        else lines.push(who + "は、" + message);
      });
    });
    weekdayIssues(mine).forEach(function (line) { lines.push(line); });
    return lines;
  }

  function weekdayIssues(docs) {
    var lines = [];
    docs.forEach(function (doc) {
      var kind = doc.type === "plan" ? "活用計画" : "実績報告";
      (doc.sessions || []).forEach(function (session) {
        if (!session.date || !session.enteredWeekday) return;
        var actual = J.weekday(session.date);
        if (!actual || actual === session.enteredWeekday) return;
        var who = (doc.instructorName || "氏名未入力") + "（" + (doc.instructorId || "番号なし") + "）「" + (doc.title || "活動名なし") + "」";
        lines.push(kind + " " + who + "の" + J.warekiFromISO(session.date) + "は" + actual + "曜日ですが、" + session.enteredWeekday + "曜日と書かれています。");
      });
    });
    return lines;
  }

  function noticeGroups() {
    var c = state.check;
    var docs = noticeScopeDocs();
    var names = [];
    docs.forEach(function (doc) {
      var name = doc.schoolName || "学校名なし";
      if (names.indexOf(name) < 0) names.push(name);
    });
    names.sort(function (a, b) { return a.localeCompare(b, "ja"); });
    return names.map(function (school) {
      var mine = docs.filter(function (doc) { return (doc.schoolName || "学校名なし") === school; });
      return { school: school, lines: noticeLines(c.year, c.month, mine) };
    }).filter(function (group) { return group.lines.length; });
  }

  function wrapNotice(ctx, text, maxWidth) {
    var lines = [];
    String(text || "").split("\n").forEach(function (part) {
      var line = "";
      for (var i = 0; i < part.length; i++) {
        var next = line + part.charAt(i);
        if (line && ctx.measureText(next).width > maxWidth) {
          lines.push(line);
          line = part.charAt(i);
        } else line = next;
      }
      lines.push(line);
    });
    return lines.length ? lines : [""];
  }

  function noticeCanvases(group) {
    var c = state.check;
    var scale = 2;
    var width = 794;
    var height = 1123;
    var margin = 48;
    var maxWidth = width - margin * 2 - 36;
    var pages = [];
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#1c2430";
    ctx.font = "16px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
    var y = margin;
    function newPage(continued) {
      if (canvas) pages.push(canvas);
      canvas = document.createElement("canvas");
      ctx = canvas.getContext("2d");
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#1c2430";
      y = margin;
      if (continued) {
        ctx.font = "14px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
        ctx.fillText("守口市立" + group.school + "　" + J.wareki(c.year, c.month) + "（続き）", margin, y);
        y += 28;
      }
    }
    function ensure(block) {
      if (y + block > height - 64) newPage(true);
    }
    ctx.font = "13px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
    ctx.fillStyle = "#a33b12";
    ctx.fillText("守口市教育委員会", margin, y);
    y += 28;
    ctx.font = "22px \"Yu Mincho\", \"Yu Gothic\", \"Meiryo\", serif";
    ctx.fillStyle = "#1c2430";
    ctx.fillText("確認のお願い", margin, y);
    y += 28;
    ctx.font = "15px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
    ctx.fillText("守口市立" + group.school + "　" + J.wareki(c.year, c.month), margin, y);
    y += 28;
    wrapNotice(ctx, "社会人等人材バンクの計画・報告について、次の点を確認し、修正した提出ファイルを教育センターへ出してください。", maxWidth + 36).forEach(function (line) {
      ctx.fillText(line, margin, y);
      y += 22;
    });
    y += 8;
    group.lines.forEach(function (text, index) {
      ctx.font = "15px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
      var body = wrapNotice(ctx, text, maxWidth);
      ensure(body.length * 22 + 16);
      ctx.fillStyle = "#a33b12";
      ctx.font = "700 15px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
      ctx.fillText(String(index + 1), margin, y);
      ctx.fillStyle = "#1c2430";
      ctx.font = "15px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
      body.forEach(function (line, lineIndex) {
        ctx.fillText(line, margin + 28, y + lineIndex * 22);
      });
      y += body.length * 22 + 12;
    });
    pages.push(canvas);
    pages.forEach(function (page, index) {
      var pageCtx = page.getContext("2d");
      pageCtx.font = "12px \"Yu Gothic UI\", \"Yu Gothic\", \"Meiryo\", sans-serif";
      pageCtx.fillStyle = "#5e6b63";
      pageCtx.fillText((index + 1) + " / " + pages.length, width - margin - 36, height - 28);
    });
    return pages;
  }

  function downloadNotice(canvas, filename) {
    var link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function exportNoticeImages() {
    var groups = noticeGroups();
    if (!groups.length) {
      alert("表示中の範囲で、学校へ伝える点はありません。");
      return;
    }
    var c = state.check;
    var stamp = 0;
    groups.forEach(function (group) {
      noticeCanvases(group).forEach(function (canvas, index) {
        var name = "確認のお願い_" + noticeFilePart(group.school) + "_" + J.monthKey(c.year, c.month) + (index ? "_" + (index + 1) : "") + ".png";
        var wait = stamp * 400;
        stamp += 1;
        setTimeout(function () { downloadNotice(canvas, name); }, wait);
      });
    });
  }

  function payRows(year, month) {
    var reports = monthDocs(year, month).filter(function (d) { return d.type === "report"; });
    var groups = {};
    reports.forEach(function (d) {
      var id = String(d.instructorId || "");
      if (!groups[id]) groups[id] = [];
      groups[id].push(d);
    });
    return Object.keys(groups).sort(function (a, b) {
      return a.localeCompare(b, "ja", { numeric: true });
    }).map(function (id) {
      var docs = groups[id];
      var person = state.instructors.find(function (p) { return String(p.id) === id; });
      var account = state.accounts.find(function (a) { return String(a.instructorId) === id; });
      var settings = Object.assign({}, state.settings, {
        withholding: !!state.settings.withholding && !(person && person.taxExempt)
      });
      var pay = J.calcPersonPay(docs, settings);
      var schools = [];
      docs.forEach(function (d) { if (schools.indexOf(d.schoolName) < 0) schools.push(d.schoolName); });
      return {
        instructorId: id,
        name: person ? person.name : docs[0].instructorName,
        kana: person ? person.kana : docs[0].instructorKana,
        known: !!person,
        inactive: person ? person.active === false : false,
        taxExempt: !!(person && person.taxExempt),
        account: account || null,
        schools: schools,
        pay: pay
      };
    });
  }

  function viewPay() {
    var year = state.pay.year;
    var month = state.pay.month;
    var key = J.monthKey(year, month);
    var confirmed = state.payments[key];
    var rows = confirmed ? confirmed.rows : payRows(year, month);
    var totals = sumRows(rows);
    var stale = confirmed ? isStale(confirmed) : false;
    return '<section class="panel no-print"><div class="split"><h2>' + J.esc(J.wareki(year, month)) + "分の支払い</h2>" +
      (confirmed ? '<span class="badge ok">確定済み</span>' : '<span class="badge warn">未確定</span>') + "</div>" +
      '<div class="toolbar"><label class="field">年<input name="payYear" type="number" value="' + year + '"></label>' +
      '<label class="field">月<input name="payMonth" type="number" min="1" max="12" value="' + month + '"></label>' +
      (confirmed
        ? '<button class="btn" data-action="unconfirm-pay">確定を取り消す</button>'
        : '<button class="btn btn-primary" data-action="confirm-pay">この内容で確定</button>') +
      '<button class="btn" data-action="print-pay">伝票を印刷</button>' +
      '<button class="btn" data-action="csv-pay">振込CSV</button>' +
      '<button class="btn" data-action="csv-tax">源泉CSV</button>' +
      '<label class="field">伝票番号の開始<input name="slipStart" type="number" min="1" step="1" value="' + J.esc(state.pay.slipStart || "") + '"></label>' +
      '<button class="btn" data-action="excel-pay">支払データを書き出す</button></div>' +
      '<p class="lead">支払期限は ' + J.esc(J.warekiFromISO(J.payDueISO(year, month))) + "（活動月の翌月末）です。同じ指導者の学校をまたいだ活動は合算し、源泉徴収もその合計に対して計算します。</p>" +
      '<p class="small">画面と伝票と書き出しは、同じ列・同じ行です。列の選択と並びは設定で変えられます。同じ学校の同じ区分は1行にまとめ、行の金額を足すとこの画面の支払額になります。大学連携の活用時間数は回数です。</p>' +
      (stale ? '<p class="alert warn">確定したあとで実績報告が追加・修正・削除されています。確定を取り消して計算し直してください。</p>' : "") +
      payMoneyNotes(rows) +
      warningsHtml(rows) +
      '<p class="small">報償金 ' + J.yen(totals.gross) + "　所得税 " + J.yen(totals.tax) + "　振込額 " + J.yen(totals.net) + "</p>" +
      payDataTable(paymentLineRecords(rows, year, month, state.pay.slipStart)) + "</section>" +
      voucherHtml(rows, totals, year, month, confirmed);
  }

  function sumRows(rows) {
    return rows.reduce(function (t, r) {
      t.gross += r.pay.gross;
      t.tax += r.pay.tax;
      t.net += r.pay.net;
      return t;
    }, { gross: 0, tax: 0, net: 0, count: rows.length });
  }

  function isStale(snapshot) {
    var ids = {};
    snapshot.rows.forEach(function (row) {
      row.pay.lines.forEach(function (line) { ids[line.documentId] = line.updatedAt || ""; });
    });
    var month = snapshot.month;
    var year = snapshot.year;
    var current = state.documents.filter(function (d) {
      return d.type === "report" && Number(d.year) === Number(year) && Number(d.month) === Number(month);
    });
    if (current.length !== Object.keys(ids).length) return true;
    return current.some(function (d) { return ids[d.id] !== (d.updatedAt || ""); });
  }

  function warningsHtml(rows) {
    var msgs = [];
    var merged = [];
    rows.forEach(function (r) {
      if (!r.account) msgs.push(r.name + "（" + r.instructorId + "）の口座が未登録です。");
      if (!r.known) msgs.push(r.name + "（" + r.instructorId + "）は指導者台帳にありません。");
      if (r.inactive) msgs.push(r.name + "は登録抹消または期間外として台帳にあります。");
      if (r.schools.length > 1) merged.push(r.name + "は " + r.schools.join("、") + " を合算");
    });
    var html = "";
    if (merged.length) html += '<p class="note">複数校の合算：' + merged.map(J.esc).join("。") + "。</p>";
    if (msgs.length) html += '<div class="alert warn">' + msgs.map(J.esc).join("<br>") + "</div>";
    else if (rows.length) html += '<p class="alert ok">口座の不足はありません。</p>';
    return html;
  }

  function payColumnDefs() {
    return [
      { id: "slip", label: "伝票番号", width: 14, numeric: true },
      { id: "schoolCode", label: "学校ID", width: 10, numeric: true },
      { id: "schoolName", label: "学校園名", width: 22 },
      { id: "year", label: "活用年", width: 10, numeric: true },
      { id: "month", label: "活用月", width: 10, numeric: true },
      { id: "instructorId", label: "指導者登録ID", width: 16 },
      { id: "name", label: "指導者名", width: 14 },
      { id: "kana", label: "フリガナ", width: 16 },
      { id: "hours", label: "活用時間数", width: 12, numeric: true },
      { id: "kind", label: "教科かクラブか", width: 14 },
      { id: "summary", label: "活用の概要", width: 28 },
      { id: "transferMonth", label: "振込月", width: 10, numeric: true },
      { id: "gross", label: "単価支払金額", width: 14, numeric: true },
      { id: "tax", label: "所得税", width: 10, numeric: true },
      { id: "net", label: "支払い金額", width: 12, numeric: true },
      { id: "taxYear", label: "源泉徴収年度", width: 14, numeric: true },
      { id: "dueDate", label: "振込予定日", width: 14 }
    ];
  }

  function activePayColumns() {
    var defs = payColumnDefs();
    var byId = {};
    defs.forEach(function (col) { byId[col.id] = col; });
    var saved = state.settings.payColumns;
    var order = saved && Array.isArray(saved.order) ? saved.order.slice() : defs.map(function (col) { return col.id; });
    var enabled = saved && saved.enabled ? saved.enabled : null;
    defs.forEach(function (col, index) {
      if (order.indexOf(col.id) >= 0) return;
      var after = -1;
      var i;
      for (i = index - 1; i >= 0; i--) {
        after = order.indexOf(defs[i].id);
        if (after >= 0) break;
      }
      order.splice(after + 1, 0, col.id);
    });
    order = order.filter(function (id) { return byId[id]; });
    return order.map(function (id) {
      return Object.assign({}, byId[id], { on: enabled ? enabled[id] !== false : true });
    });
  }

  function outputPayColumns() {
    return activePayColumns().filter(function (col) { return col.on; });
  }

  function storePayColumns(order, enabled) {
    state.settings.payColumns = { order: order, enabled: enabled };
  }

  function payDataTable(records) {
    var cols = outputPayColumns();
    if (!cols.length) return '<p class="muted">設定で支払データの列を1つ以上選んでください。</p>';
    if (!records.length) return '<p class="muted">この月の実績報告はありません。</p>';
    var head = cols.map(function (col) { return "<th>" + J.esc(col.label) + "</th>"; }).join("");
    var body = records.map(function (line) {
      return "<tr>" + cols.map(function (col) {
        var value = line[col.id];
        var text = value == null || value === "" ? "" : String(value);
        return "<td" + (col.numeric ? ' class="num"' : "") + ">" + J.esc(text) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<div class="table-wrap"><table class="data pay-data"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function voucherHtml(rows, totals, year, month, confirmed) {
    var title = J.wareki(year, month) + "分";
    var due = J.warekiFromISO(J.payDueISO(year, month));
    var org = state.settings.organization || "守口市教育委員会";
    var made = confirmed ? J.warekiFromISO(confirmed.confirmedAt.slice(0, 10)) : J.warekiFromISO(J.todayISO());
    var records = paymentLineRecords(rows, year, month, state.pay.slipStart);
    var detail = [];
    rows.forEach(function (r) {
      r.pay.lines.forEach(function (line) {
        var cat = J.categoryOf(line.category);
        line.sessions.forEach(function (s) {
          detail.push("<tr><td>" + J.esc(r.instructorId) + "</td><td>" + J.esc(r.name) + "</td><td>" + J.esc(line.schoolName) + "</td><td>" +
            J.esc(cat.label) + "<br>" + J.esc(line.title) + "</td><td>" + J.esc(s.date) + "（" + J.weekday(s.date) + "）<br>" + J.esc(s.start) + "–" + J.esc(s.end) +
            "</td><td>" + J.formatMinutes(J.sessionMinutes(s)) + "</td><td>" + J.esc(s.content || "") + "</td></tr>");
        });
      });
    });
    var transfers = rows.map(function (r) {
      var a = r.account || {};
      return "<tr><td>" + J.esc(r.instructorId) + "</td><td>" + J.esc(r.name) + "</td><td>" + J.esc(a.bank || "") + "</td><td>" + J.esc(a.branch || "") +
        "</td><td>" + J.esc(a.accountType || "") + "</td><td>" + J.esc(a.number || "") + "</td><td>" + J.esc(a.holder || "") + '</td><td class="num">' + J.yen(r.pay.net) + "</td></tr>";
    }).join("");
    var taxRows = rows.filter(function (r) { return r.pay.tax > 0; }).map(function (r) {
      return "<tr><td>" + J.esc(r.instructorId) + "</td><td>" + J.esc(r.name) + '</td><td class="num">' + J.yen(r.pay.gross) + '</td><td class="num">' + J.yen(r.pay.tax) + "</td></tr>";
    }).join("");
    return '<div class="voucher" id="voucher"><article class="sheet"><h2>支払データ</h2><div class="meta"><span>' + J.esc(org) + "</span><span>作成 " + J.esc(made) + "</span></div>" +
      "<p>件名　社会人等指導者人材バンク報償金（" + J.esc(title) + "）　支払期限 " + J.esc(due) + "</p>" +
      payDataTable(records) +
      '<p class="footnote">' + J.esc(taxFootnote()) + "</p></article>" +
      '<article class="sheet"><h2>活動内訳書</h2><div class="meta"><span>' + J.esc(title) + "</span><span>" + J.esc(org) + "</span></div>" +
      "<table><thead><tr><th>登録番号</th><th>指導者</th><th>学校園</th><th>区分</th><th>日時</th><th>活動時間</th><th>内容</th></tr></thead><tbody>" +
      (detail.join("") || "<tr><td colspan=\"7\">明細がありません。</td></tr>") + "</tbody></table></article>" +
      '<article class="sheet"><h2>口座振込一覧</h2><div class="meta"><span>支払期限 ' + J.esc(due) + "</span><span>" + J.esc(state.settings.payer || "") + " 殿へ提出する控</span></div>" +
      "<table><thead><tr><th>登録番号</th><th>債権者</th><th>銀行</th><th>支店</th><th>種目</th><th>口座番号</th><th>口座名義</th><th>振込額</th></tr></thead><tbody>" +
      (transfers || "<tr><td colspan=\"8\">対象者がいません。</td></tr>") +
      '</tbody><tfoot><tr><td colspan="7">合計</td><td class="num">' + J.yen(totals.net) + "</td></tr></tfoot></table>" +
      '<p class="footnote">口座名義は口座振替依頼書の預金口座名です。債権者と口座名義は同一人であることを台帳で確認してください。</p></article>' +
      '<article class="sheet"><h2>所得税・復興特別所得税 納付控</h2><div class="meta"><span>' + J.esc(title) + "の報償金</span><span>" + J.esc(org) + "</span></div>" +
      "<table><thead><tr><th>登録番号</th><th>氏名</th><th>支払金額</th><th>源泉徴収税額</th></tr></thead><tbody>" +
      (taxRows || "<tr><td colspan=\"4\">源泉徴収する金額はありません。</td></tr>") +
      '</tbody><tfoot><tr><td colspan="2">税務署へ納付する額</td><td class="num">' + J.yen(totals.gross) + '</td><td class="num">' + J.yen(totals.tax) + "</td></tr></tfoot></table></article></div>";
  }

  function viewImport() {
    var log = importLogHtml();
    return '<section class="panel"><h2>学校からの提出ファイルを取り込む</h2>' +
      '<div class="dropzone" id="dropzone"><strong>受付フォルダを開く</strong>' +
      '<p class="small">開くフォルダの中は、毎月の処理フォルダ、その中に学校ごとのフォルダ、その中に担当が提出したファイル、という並びです。たとえば「2026-10」の中の「さくら小学校」に、その学校の担当のファイルが入ります。同じ活動を出し直したときは上書きされます。ファイルはExcelです。担当が提出するファイルと、ここで読むファイルは同じです。</p>' +
      '<label class="field">受付フォルダ<input id="import-folder" type="file" webkitdirectory directory multiple></label>' +
      '<p class="small">いま学校が使っているエクセルの計画・報告書は、<a href="legacy.html">現行のエクセルから読み込む</a>で提出ファイルにします。そのページは、この受付画面とは別に開きます。</p>' +
      '<input id="import-file" type="file" accept=".xlsx,.xls,application/json,.json" multiple></div>' +
      log +
      '<div class="toolbar"><button class="btn" data-action="load-sample">操作確認用の例を入れる</button></div>' +
      '<p class="small">例は架空の指導者です。山田花子はさくら小学校と八雲小学校の両方、佐藤太郎は部活動、鈴木美咲は大学連携で口座未登録です。</p></section>' +
      '<section class="panel"><h2>取り込んだ書類</h2>' + intakeTable(state.documents) +
      "<p class=\"small\">全 " + state.documents.length + "件</p></section>";
  }

  function importLogHtml() {
    var items = state.importLog || [];
    if (!items.length) return "";
    if (typeof items[0] === "string") {
      return "<h3>結果</h3><ul>" + items.map(function (line) { return "<li>" + J.esc(line) + "</li>"; }).join("") + "</ul>";
    }
    var map = {};
    items.forEach(function (item) {
      var month = item.monthFolder || "月のフォルダなし";
      var school = item.schoolFolder || "学校フォルダなし";
      var key = month + "\0" + school;
      if (!map[key]) map[key] = { month: month, school: school, lines: [] };
      map[key].lines.push(item.text);
    });
    var groups = Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
      return String(b.month).localeCompare(String(a.month), "ja") || String(a.school).localeCompare(String(b.school), "ja");
    });
    return "<h3>結果</h3>" + groups.map(function (group) {
      return "<h3>" + J.esc(group.month) + "　" + J.esc(group.school) + "</h3><ul>" +
        group.lines.map(function (line) { return "<li>" + J.esc(line) + "</li>"; }).join("") + "</ul>";
    }).join("");
  }

  function intakeGroups(docs) {
    var map = {};
    docs.forEach(function (doc) {
      var month = doc.monthFolder || (doc.year && doc.month ? J.monthKey(doc.year, doc.month) : "月のフォルダなし");
      var school = doc.schoolFolder || doc.schoolName || "学校フォルダなし";
      var key = month + "\0" + school;
      if (!map[key]) map[key] = { month: month, school: school, docs: [] };
      map[key].docs.push(doc);
    });
    return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
      return String(b.month).localeCompare(String(a.month), "ja") || String(a.school).localeCompare(String(b.school), "ja");
    });
  }

  function intakeTable(docs) {
    if (!docs.length) return '<p class="muted">まだありません。</p>';
    var body = intakeGroups(docs).map(function (group) {
      var head = '<tr class="group"><td colspan="6">' + J.esc(group.month) + "　" + J.esc(group.school) + "　" + group.docs.length + "件</td></tr>";
      var rows = group.docs.slice().sort(function (a, b) {
        return String(a.instructorName || "").localeCompare(String(b.instructorName || ""), "ja") || (a.type === b.type ? 0 : a.type === "plan" ? -1 : 1);
      }).map(function (d) {
        return "<tr><td>" + J.esc(J.monthKey(d.year, d.month)) + "</td><td>" + (d.type === "plan" ? "計画" : "報告") + "</td><td>" +
          J.esc(d.schoolName) + "</td><td>" + J.esc(d.instructorName) + "</td><td>" + J.esc(d.title) + "</td><td>" +
          '<button class="btn btn-ghost" data-action="delete-doc" data-id="' + J.esc(d.id) + '">削除</button></td></tr>';
      }).join("");
      return head + rows;
    }).join("");
    return '<div class="table-wrap"><table class="data"><thead><tr><th>年月</th><th>種類</th><th>学校</th><th>指導者</th><th>活動</th><th></th></tr></thead><tbody>' +
      body + "</tbody></table></div>";
  }

  function viewPeople() {
    var sub = state.peopleTab === "accounts" ? viewAccounts() : viewInstructors();
    return '<div class="toolbar no-print"><div class="seg"><button class="' + (state.peopleTab === "instructors" ? "active" : "") + '" data-action="people-tab" data-tab="instructors">指導者台帳</button>' +
      '<button class="' + (state.peopleTab === "accounts" ? "active" : "") + '" data-action="people-tab" data-tab="accounts">口座別表</button></div>' +
      '<button class="btn" data-action="export-roster">学校へ渡す指導者リストを書き出す</button></div>' +
      '<p class="small no-print">教頭先生が人材を探すためのファイルです。入るのは登録番号、指導者名、カテゴリーだけです。ファイルの形式はJSONです。</p>' + sub;
  }

  function viewInstructors() {
    var rows = state.instructors.slice().sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id), "ja", { numeric: true });
    }).map(function (p) {
      var account = state.accounts.some(function (a) { return String(a.instructorId) === String(p.id); });
      var end = J.registrationEnd(p.registeredOn);
      return '<tr><td>' + J.esc(p.id) + "</td><td>" + J.esc(p.name) + '<div class="small">' + J.esc(p.kana) + "</div></td><td>" +
        (p.kind === "university" ? "大学連携" : "一般") + "</td><td>" + J.esc((p.fields || []).join("、")) + "</td><td>" + J.esc(end) + "</td><td>" +
        (p.active === false ? '<span class="badge bad">抹消等</span>' : '<span class="badge ok">登録中</span>') + "</td><td>" +
        (account ? "登録済" : '<span class="badge warn">未登録</span>') + '</td><td><button class="btn btn-ghost" data-action="edit-person" data-id="' + J.esc(p.id) + '">開く</button></td></tr>';
    }).join("");
    return '<section class="panel"><div class="split"><h2>指導者台帳</h2><button class="btn btn-primary" data-action="new-person">登録番号を付けて追加</button></div>' +
      (rows ? '<div class="table-wrap"><table class="data"><thead><tr><th>登録番号</th><th>氏名</th><th>区分</th><th>分野</th><th>登録期限</th><th>状態</th><th>口座</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="muted">まだ登録がありません。</p>') +
      editorHtml() + "</section>";
  }

  function editorHtml() {
    if (!editor || editor.kind !== "person") return "";
    var p = editor.data;
    var end = J.registrationEnd(p.registeredOn);
    return '<form id="person-form"><h3>' + (editor.isNew ? "新しい指導者" : "登録内容の修正") + "</h3><div class=\"grid-form\">" +
      '<label class="field">登録番号<input name="id" value="' + J.esc(p.id) + '"></label>' +
      '<label class="field">登録日<input name="registeredOn" type="date" value="' + J.esc(p.registeredOn) + '"></label>' +
      '<label class="field">区分<select name="kind">' +
      option("general", "一般", p.kind) + option("university", "大学連携", p.kind) + "</select></label>" +
      '<label class="field">大学名<input name="university" value="' + J.esc(p.university || "") + '"></label>' +
      '<label class="field">ふりがな<input name="kana" value="' + J.esc(p.kana) + '"></label>' +
      '<label class="field">氏名<input name="name" value="' + J.esc(p.name) + '"></label>' +
      '<label class="field">性別<select name="gender">' + option("", "未記入", p.gender) + option("女", "女", p.gender) + option("男", "男", p.gender) + "</select></label>" +
      '<label class="field">生年月日<input name="birth" type="date" value="' + J.esc(p.birth || "") + '"></label>' +
      '<label class="field">郵便番号<input name="postal" value="' + J.esc(p.postal || "") + '"></label>' +
      '<label class="field">住所<input name="address" value="' + J.esc(p.address || "") + '"></label>' +
      '<label class="field">電話<input name="phone" value="' + J.esc(p.phone || "") + '"></label>' +
      '<label class="field">FAX<input name="fax" value="' + J.esc(p.fax || "") + '"></label>' +
      '<label class="field span-2">知識・技能（支援内容）<textarea name="skills">' + J.esc(p.skills || "") + "</textarea></label>" +
      '<div class="span-2"><div class="small">登録分野</div><div class="checks">' + J.EXPERTISE.map(function (name) {
        var on = (p.fields || []).indexOf(name) >= 0;
        return '<label><input type="checkbox" name="field" value="' + J.esc(name) + '"' + (on ? " checked" : "") + ">" + J.esc(name) + "</label>";
      }).join("") + "</div></div>" +
      '<label class="field">希望校種<input name="schoolHope" value="' + J.esc(p.schoolHope || "") + '"></label>' +
      '<label class="field">活動希望（曜日等）<input name="timeHope" value="' + J.esc(p.timeHope || "") + '"></label>' +
      '<label class="field span-2">推薦者<input name="recommender" value="' + J.esc(p.recommender || "") + '"></label>' +
      '<label class="checks"><input type="checkbox" name="active"' + (p.active !== false ? " checked" : "") + "> 登録中</label>" +
      '<label class="checks"><input type="checkbox" name="taxExempt"' + (p.taxExempt ? " checked" : "") + "> 源泉徴収の対象外</label>" +
      "</div><p class=\"small\">登録期限は、登録日から3年を超えない3月31日です" + (end ? "（" + J.esc(J.warekiFromISO(end)) + "まで）" : "") + "。</p>" +
      '<div class="toolbar"><button type="button" class="btn btn-primary" data-action="save-person">保存</button>' +
      '<button type="button" class="btn" data-action="close-editor">閉じる</button>' +
      (editor.isNew ? "" : '<button type="button" class="btn btn-danger" data-action="delete-person">台帳から外す</button>') +
      "</div></form>";
  }

  function viewAccounts() {
    var rows = state.accounts.map(function (a) {
      var person = state.instructors.find(function (p) { return String(p.id) === String(a.instructorId); });
      return "<tr><td>" + J.esc(a.instructorId) + "</td><td>" + J.esc(person ? person.name : "台帳にない") + "</td><td>" +
        J.esc(a.bank) + "</td><td>" + J.esc(a.branch) + "</td><td>" + J.esc(a.accountType) + "</td><td>" + J.esc(a.number) +
        "</td><td>" + J.esc(a.holder) + '</td><td><button class="btn btn-ghost" data-action="edit-account" data-id="' + J.esc(a.instructorId) + '">開く</button></td></tr>';
    }).join("");
    return '<section class="panel"><div class="split"><h2>口座別表</h2><button class="btn btn-primary" data-action="new-account">口座を登録</button></div>' +
      '<p class="small">口座振替依頼書の内容です。学校へ渡す指導者リストには出しません。</p>' +
      (rows ? '<div class="table-wrap"><table class="data"><thead><tr><th>登録番号</th><th>指導者</th><th>銀行</th><th>支店</th><th>種目</th><th>番号</th><th>名義（フリガナ）</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="muted">口座はまだありません。</p>') +
      accountForm() + "</section>";
  }

  function accountForm() {
    if (!editor || editor.kind !== "account") return "";
    var a = editor.data;
    var options = state.instructors.map(function (p) {
      return option(p.id, p.id + " " + p.name, a.instructorId);
    }).join("");
    return '<form id="account-form"><h3>口座</h3><div class="grid-form">' +
      '<label class="field">指導者<select name="instructorId">' + options + "</select></label>" +
      '<label class="field">依頼日<input name="requestedOn" type="date" value="' + J.esc(a.requestedOn || "") + '"></label>' +
      '<label class="field">銀行名<input name="bank" value="' + J.esc(a.bank || "") + '"></label>' +
      '<label class="field">支店名<input name="branch" value="' + J.esc(a.branch || "") + '"></label>' +
      '<label class="field">預金種目<select name="accountType">' + option("普通", "普通", a.accountType || "普通") + option("当座", "当座", a.accountType) + "</select></label>" +
      '<label class="field">口座番号<input name="number" value="' + J.esc(a.number || "") + '"></label>' +
      '<label class="field span-2">口座名義（フリガナ）<input name="holder" value="' + J.esc(a.holder || "") + '"></label></div>' +
      '<p class="small">依頼書の注記どおり、債権者と預金口座名は同一人にしてください。</p>' +
      '<div class="toolbar"><button type="button" class="btn btn-primary" data-action="save-account">保存</button>' +
      '<button type="button" class="btn" data-action="close-editor">閉じる</button>' +
      (editor.isNew ? "" : '<button type="button" class="btn btn-danger" data-action="delete-account">この口座を削除</button>') +
      "</div></form>";
  }

  function option(value, label, current) {
    return '<option value="' + J.esc(value) + '"' + (String(current) === String(value) ? " selected" : "") + ">" + J.esc(label) + "</option>";
  }

  function viewSchools() {
    var rows = J.sortSchools(state.schools).map(function (s) {
      var code = J.schoolCodeOf(s) || J.schoolCodeOf(J.knownSchool(s.name));
      return '<tr data-school-id="' + J.esc(s.id) + '"><td class="school-code-cell"><input class="table-input school-code" type="number" min="1" step="1" value="' + J.esc(code || "") + '"></td>' +
        '<td><input class="table-input school-name" value="' + J.esc(s.name) + '"></td>' +
        '<td><select class="table-input school-kind">' + J.SCHOOL_KINDS.map(function (k) { return option(k.id, k.label, s.kind); }).join("") + "</select></td>" +
        '<td><button class="btn btn-ghost" data-action="delete-school" data-id="' + J.esc(s.id) + '">削除</button></td></tr>';
    }).join("");
    return '<section class="panel"><h2>学校園</h2><p class="small">番号は、これまで事務で使ってきた学校IDです。空き番号はそのまま残します。追加する番号には、空いている次の番号が入ります。市の学校名を入れると、その学校の番号に替わります。番号は追加する前に直せます。さつき学園は前期・後期・夜間学級で番号が分かれています。認定こども園もここから追加します。</p>' +
      '<div class="toolbar"><label class="field">番号<input id="new-school-code" type="number" min="1" step="1" value="' + nextSchoolCode() + '" data-auto="1"></label>' +
      '<label class="field">名称<input id="new-school-name" placeholder="例 さくら小学校"></label>' +
      '<label class="field">種別<select id="new-school-kind">' + J.SCHOOL_KINDS.map(function (k) { return option(k.id, k.label, "elementary"); }).join("") + "</select></label>" +
      '<button class="btn btn-primary" data-action="add-school">追加</button>' +
      '<button class="btn" data-action="save-schools">番号と名称を保存</button></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>番号</th><th>名称</th><th>種別</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  function viewSettings() {
    var s = state.settings;
    return '<section class="panel"><h2>単価と源泉徴収</h2>' +
      '<form id="settings-form"><div class="grid-form">' +
      rateField("subject", "教科等派遣（円／時間）", s) +
      rateField("club", "部活動派遣（円／時間）", s) +
      rateField("kodomo", "認定こども園づくり派遣（円／時間）", s) +
      rateField("university", "大学連携学生派遣（円／回）", s) +
      '<label class="field">源泉徴収の率（%）<input name="taxRate" type="number" step="0.01" value="' + J.esc(s.taxRate) + '"></label>' +
      '<label class="field">この金額までの部分（円）<input name="taxThreshold" type="number" min="0" step="1" value="' + J.esc(s.taxThreshold) + '"></label>' +
      '<label class="field">超えた部分の率（%）<input name="taxRateOver" type="number" step="0.01" value="' + J.esc(s.taxRateOver) + '"></label>' +
      '<label class="field">支払者の表示<input name="organization" value="' + J.esc(s.organization) + '"></label>' +
      '<label class="field">振込一覧の宛名<input name="payer" value="' + J.esc(s.payer) + '"></label>' +
      '<label class="checks"><input type="checkbox" name="withholding"' + (s.withholding ? " checked" : "") + "> 源泉徴収額を計算する</label></div>" +
      '<div class="toolbar"><button type="button" class="btn btn-primary" data-action="save-settings">設定を保存</button></div></form></section>' +
      payColumnSettings() +
      '<section class="panel"><h2>バックアップ</h2><p class="lead">指導者、口座、学校、取り込んだ計画・報告、確定した支払いを1つのファイルにします。別のパソコンへ移すときや、ブラウザのデータを消す前に書き出してください。ファイルの形式はJSONです。</p>' +
      '<div class="toolbar"><button class="btn btn-primary" data-action="backup">バックアップを書き出す</button>' +
      '<label class="field">バックアップを開く<input id="backup-file" type="file" accept="application/json,.json"></label></div></section>';
  }

  function payColumnSettings() {
    var cols = activePayColumns();
    var items = cols.map(function (col, index) {
      return "<li><button type=\"button\" class=\"btn btn-ghost\" data-action=\"pay-col-move\" data-id=\"" + J.esc(col.id) + "\" data-dir=\"-1\"" + (index === 0 ? " disabled" : "") + ">上へ</button>" +
        "<button type=\"button\" class=\"btn btn-ghost\" data-action=\"pay-col-move\" data-id=\"" + J.esc(col.id) + "\" data-dir=\"1\"" + (index === cols.length - 1 ? " disabled" : "") + ">下へ</button>" +
        "<label class=\"checks\"><input type=\"checkbox\" name=\"pay-col\" data-id=\"" + J.esc(col.id) + "\"" + (col.on ? " checked" : "") + "> " + J.esc(col.label) + "</label></li>";
    }).join("");
    return '<section class="panel"><h2>支払データの列</h2>' +
      '<p class="lead">画面、伝票、書き出すExcelは、ここで選んだ列と並びになります。チェックを外すと、その列は出ません。</p>' +
      '<ul class="pay-cols">' + items + "</ul></section>";
  }

  function rateField(id, label, settings) {
    var value = settings.rates && settings.rates[id] != null ? settings.rates[id] : "";
    return '<label class="field">' + label + '<input name="rate-' + id + '" type="number" min="0" step="1" value="' + J.esc(value) + '"></label>';
  }

  function readMoney(value) {
    var text = String(value == null ? "" : value).trim();
    if (!text) return null;
    var n = Number(text);
    return isFinite(n) ? n : null;
  }

  function payMoneyNotes(rows) {
    var notes = [];
    var seen = {};
    rows.forEach(function (row) {
      (row.pay.parts || []).forEach(function (part) {
        if (seen[part.category]) return;
        var raw = state.settings.rates ? state.settings.rates[part.category] : null;
        if (raw == null || raw === "") {
          seen[part.category] = true;
          notes.push(part.label + "の単価が未入力です。");
        }
      });
    });
    if (state.settings.withholding && (state.settings.taxRate == null || state.settings.taxRate === "")) {
      notes.push("源泉徴収の率が未入力です。");
    }
    if (!notes.length) return "";
    return '<p class="alert warn">' + notes.map(J.esc).join("<br>") + "</p>";
  }

  function taxFootnote() {
    var s = state.settings;
    var text = "活動時間は終了時刻から開始時刻と休憩を引いた分です。時間単価の報償金は、区分ごとに分を合算してから「分 × 時間単価 ÷ 60」の1円未満を切り捨てます。大学連携は回数 × 1回単価です。";
    if (s.withholding && s.taxRate != null && s.taxRate !== "") {
      text += "源泉徴収税額は、同一人の当月報償金を1回の支払として、" + s.taxRate + "%";
      if (s.taxThreshold != null && s.taxThreshold !== "" && s.taxRateOver != null && s.taxRateOver !== "") {
        text += "（" + Number(s.taxThreshold).toLocaleString("ja-JP") + "円を超える部分は" + s.taxRateOver + "%）";
      }
      text += "を乗じ1円未満を切り捨てた額です。";
    }
    return text + "税務署へ納付する額は源泉徴収税額の合計、指定口座へ振り込む額は差引振込額です。";
  }

  function nextInstructorId() {
    var max = 1000;
    state.instructors.forEach(function (p) {
      var n = Number(p.id);
      if (n > max) max = n;
    });
    return String(max + 1);
  }

  function saveSchoolTable() {
    var rows = [];
    var codes = {};
    var names = {};
    var nodes = document.querySelectorAll("tr[data-school-id]");
    var i;
    for (i = 0; i < nodes.length; i++) {
      var tr = nodes[i];
      var code = J.schoolCodeOf({ code: tr.querySelector(".school-code").value });
      var name = tr.querySelector(".school-name").value.trim();
      var kind = tr.querySelector(".school-kind").value;
      if (!name) {
        alert("名称が空の行があります。");
        return;
      }
      if (!code) {
        alert("番号が空の学校があります。");
        return;
      }
      if (codes[code]) {
        alert("番号 " + code + " が重なっています。");
        return;
      }
      if (names[name]) {
        alert("同じ名前の学校園があります。");
        return;
      }
      codes[code] = true;
      names[name] = true;
      rows.push({ id: tr.getAttribute("data-school-id"), code: code, name: name, kind: kind });
    }
    if (!rows.length) return;
    state.schools = J.sortSchools(rows);
    save();
    render();
  }

  function ensureSchool(name, kind, code) {
    if (!name) return;
    var found = J.findSchool(state.schools, name);
    var known = J.knownSchool(name, state.schools);
    var number = J.schoolCodeOf({ code: code }) || J.schoolCodeOf(known);
    if (found) {
      if (!J.schoolCodeOf(found) && number) found.code = number;
      return;
    }
    var id = number ? "school-" + number : J.uid();
    if (state.schools.some(function (s) { return s.id === id; })) id = J.uid();
    state.schools.push({
      id: id,
      code: number || "",
      name: known ? known.name : J.plainSchoolName(name),
      kind: (known && known.kind) || kind || "elementary"
    });
  }

  function readFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (file) {
      return /\.xlsx?$/i.test(file.name) || /\.xls$/i.test(file.name) || /\.json$/i.test(file.name);
    });
    if (!files.length) {
      if (fileList && fileList.length) alert("提出ファイルがありません。受付フォルダの中は、毎月のフォルダ、学校のフォルダ、担当のExcelファイルの順にしてください。");
      return;
    }
    var pending = files.length;
    var folderMonths = [];
    state.importLog = [];
    files.forEach(function (file) {
      var reader = new FileReader();
      var place = J.submissionPlace(file.webkitRelativePath || file.name);
      reader.onload = function () {
        try {
          var json = J.payloadFromFile(file.name, new Uint8Array(reader.result));
          if (!json || json.error) {
            state.importLog.push({
              monthFolder: place.monthFolder || "月のフォルダなし",
              schoolFolder: place.schoolFolder || "学校フォルダなし",
              text: (place.fileName || file.name) + " は" + (json && json.error ? json.error : "ファイルとして読めませんでした。")
            });
          } else {
            var fromFolder = monthFromFolder(place.monthFolder);
            if (fromFolder) folderMonths.push(fromFolder);
            var line = ingest(json, place);
            state.importLog.push({
              monthFolder: place.monthFolder || "月のフォルダなし",
              schoolFolder: place.schoolFolder || "学校フォルダなし",
              text: line
            });
          }
        } catch (err) {
          state.importLog.push({
            monthFolder: place.monthFolder || "月のフォルダなし",
            schoolFolder: place.schoolFolder || "学校フォルダなし",
            text: (place.fileName || file.name) + " はファイルとして読めませんでした。"
          });
        }
        pending -= 1;
        if (pending === 0) {
          var latest = latestMonth(folderMonths);
          if (latest) {
            state.check.year = latest.year;
            state.check.month = latest.month;
          }
          save();
          state.tab = "import";
          render();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function monthFromFolder(name) {
    var text = String(name || "");
    var reiwa = /令和\s*(元|\d+)\s*年\s*(\d{1,2})\s*月/.exec(text);
    if (reiwa) {
      var n = reiwa[1] === "元" ? 1 : Number(reiwa[1]);
      var month = Number(reiwa[2]);
      if (month >= 1 && month <= 12) return { year: 2018 + n, month: month };
    }
    var ym = /(\d{4})\s*[-ー年./]\s*(\d{1,2})/.exec(text);
    if (ym) {
      var month2 = Number(ym[2]);
      if (month2 >= 1 && month2 <= 12) return { year: Number(ym[1]), month: month2 };
    }
    return null;
  }

  function latestMonth(list) {
    var best = null;
    list.forEach(function (item) {
      if (!item || item.month < 1 || item.month > 12 || !item.year) return;
      if (!best || item.year > best.year || (item.year === best.year && item.month > best.month)) best = item;
    });
    return best;
  }

  function plainSchool(name) {
    return String(name || "").replace(/^守口市立/, "").trim();
  }

  function ingest(json, place) {
    var name = place && place.fileName ? place.fileName : "ファイル";
    var monthFolder = place && place.monthFolder ? place.monthFolder : "";
    var schoolFolder = place && place.schoolFolder ? place.schoolFolder : "";
    if (!json || typeof json !== "object") return name + " の形式が違います。";
    if (json.schema === J.SCHEMA_BACKUP) return name + " は全データのバックアップです。設定の「バックアップを開く」で読み込んでください。";
    if (json.schema === J.SCHEMA_ROSTER) return name + " は学校へ渡す指導者リストです。提出ファイルを選んでください。";
    if (json.schema !== J.SCHEMA_SUBMISSION && !(json.schema === J.SCHEMA_WORK && Array.isArray(json.documents))) return name + " は提出ファイルではありません。";
    if (!json.school || !json.school.name) return name + " に学校名がありません。";
    ensureSchool(json.school.name, json.school.kind, json.school.code);
    var added = 0;
    var updated = 0;
    var skipped = 0;
    var notes = [];
    if (schoolFolder && plainSchool(json.school.name) !== plainSchool(schoolFolder)) {
      notes.push("学校フォルダ「" + schoolFolder + "」と、ファイルの学校名が違います");
    }
    (json.documents || []).forEach(function (doc) {
      var stored = Object.assign({}, doc, {
        schoolName: json.school.name,
        schoolKind: json.school.kind || "",
        principal: doc.principal || json.school.principal || "",
        importedAt: new Date().toISOString(),
        sourceName: place && place.relative ? place.relative : name,
        monthFolder: monthFolder,
        schoolFolder: schoolFolder
      });
      var errors = J.documentBlockers(stored);
      if (errors.length) {
        skipped += 1;
        notes.push((doc.instructorName || "無名") + "は見送り（" + errors[0] + "）");
        return;
      }
      var gaps = J.validateDocument(stored).filter(function (message) { return /^\d+行目/.test(message); });
      if (gaps.length) notes.push((doc.instructorName || "無名") + "は、日付や時刻が揃っていない行も含めて読み込みました");
      var idx = state.documents.findIndex(function (d) {
        return d.id === stored.id || J.activityKey(d) === J.activityKey(stored);
      });
      if (idx >= 0) {
        state.documents[idx] = stored;
        updated += 1;
      } else {
        state.documents.push(stored);
        added += 1;
      }
    });
    return name + "：" + json.school.name + " 追加" + added + "件、上書き" + updated + "件、見送り" + skipped + "件" + (notes.length ? "。" + notes.join(" / ") : "");
  }

  function loadSample() {
    var sample = J.sampleCenterData();
    sample.instructors.forEach(function (p) {
      var idx = state.instructors.findIndex(function (x) { return x.id === p.id; });
      if (idx >= 0) state.instructors[idx] = p;
      else state.instructors.push(p);
    });
    sample.accounts.forEach(function (a) {
      var idx = state.accounts.findIndex(function (x) { return x.instructorId === a.instructorId; });
      if (idx >= 0) state.accounts[idx] = a;
      else state.accounts.push(a);
    });
    sample.documents.forEach(function (d) {
      ensureSchool(d.schoolName, d.schoolKind);
      var idx = state.documents.findIndex(function (x) { return x.id === d.id; });
      if (idx >= 0) state.documents[idx] = d;
      else state.documents.push(d);
    });
    state.check.year = 2026;
    state.check.month = 9;
    state.check.mode = "person";
    state.check.selected = "1001";
    state.pay.year = 2026;
    state.pay.month = 9;
    state.importLog = ["例を読み込みました。実績チェックは令和8年9月、山田花子を人ごとに表示しています。"];
    save();
    render();
  }

  function savePerson() {
    var form = document.getElementById("person-form");
    if (!form || !editor) return;
    var fd = new FormData(form);
    var id = String(fd.get("id") || "").trim();
    var name = String(fd.get("name") || "").trim();
    if (!id || !name) {
      alert("登録番号と氏名は必要です。");
      return;
    }
    var duplicate = state.instructors.some(function (p) {
      return String(p.id) === id && String(p.id) !== String(editor.originalId);
    });
    if (duplicate) {
      alert("その登録番号はすでに使われています。");
      return;
    }
    var fields = [];
    form.querySelectorAll('input[name="field"]:checked').forEach(function (el) { fields.push(el.value); });
    var person = {
      id: id,
      registeredOn: fd.get("registeredOn") || "",
      active: !!form.querySelector('[name="active"]').checked,
      taxExempt: !!form.querySelector('[name="taxExempt"]').checked,
      kind: fd.get("kind"),
      kana: String(fd.get("kana") || "").trim(),
      name: name,
      gender: fd.get("gender") || "",
      birth: fd.get("birth") || "",
      university: String(fd.get("university") || "").trim(),
      postal: String(fd.get("postal") || "").trim(),
      address: String(fd.get("address") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      fax: String(fd.get("fax") || "").trim(),
      skills: String(fd.get("skills") || "").trim(),
      fields: fields,
      schoolHope: String(fd.get("schoolHope") || "").trim(),
      timeHope: String(fd.get("timeHope") || "").trim(),
      recommender: String(fd.get("recommender") || "").trim()
    };
    if (editor.originalId && editor.originalId !== id) {
      state.accounts.forEach(function (a) {
        if (String(a.instructorId) === String(editor.originalId)) a.instructorId = id;
      });
      state.instructors = state.instructors.filter(function (p) { return String(p.id) !== String(editor.originalId); });
    }
    var idx = state.instructors.findIndex(function (p) { return String(p.id) === id; });
    if (idx >= 0) state.instructors[idx] = person;
    else state.instructors.push(person);
    editor = null;
    save();
    render();
  }

  function saveAccount() {
    var form = document.getElementById("account-form");
    if (!form) return;
    var fd = new FormData(form);
    var account = {
      instructorId: String(fd.get("instructorId") || ""),
      requestedOn: fd.get("requestedOn") || "",
      bank: String(fd.get("bank") || "").trim(),
      branch: String(fd.get("branch") || "").trim(),
      accountType: fd.get("accountType") || "普通",
      number: String(fd.get("number") || "").trim(),
      holder: String(fd.get("holder") || "").trim()
    };
    if (!account.instructorId || !account.bank || !account.branch || !account.number || !account.holder) {
      alert("指導者、銀行、支店、口座番号、口座名義を入力してください。");
      return;
    }
    if (editor && editor.originalId && editor.originalId !== account.instructorId) {
      state.accounts = state.accounts.filter(function (a) { return String(a.instructorId) !== String(editor.originalId); });
    }
    var idx = state.accounts.findIndex(function (a) { return String(a.instructorId) === account.instructorId; });
    if (idx >= 0) state.accounts[idx] = account;
    else state.accounts.push(account);
    editor = null;
    save();
    render();
  }

  function talentCategory(person) {
    var fields = (person.fields || []).filter(Boolean);
    var label = fields.join("、");
    if (person.kind === "university") label = label ? label + "（大学連携）" : "大学連携";
    return label;
  }

  function exportRoster() {
    var payload = {
      schema: J.SCHEMA_ROSTER,
      version: 1,
      exportedAt: new Date().toISOString(),
      instructors: state.instructors.filter(function (p) { return p.active !== false; }).map(function (p) {
        return { id: p.id, name: p.name, category: talentCategory(p) };
      })
    };
    J.downloadJson("指導者リスト.json", payload);
  }

  function exportPayCsv(kind) {
    var year = state.pay.year;
    var month = state.pay.month;
    var key = J.monthKey(year, month);
    var rows = state.payments[key] ? state.payments[key].rows : payRows(year, month);
    var ym = J.wareki(year, month);
    if (kind === "tax") {
      var tax = [["対象年月", "登録番号", "氏名", "報償金", "源泉徴収税額"]];
      rows.forEach(function (r) {
        tax.push([ym, r.instructorId, r.name, r.pay.gross, r.pay.tax]);
      });
      var totals = sumRows(rows);
      tax.push(["合計", "", rows.length + "人", totals.gross, totals.tax]);
      J.downloadCsv("源泉徴収_" + key + ".csv", tax);
      return;
    }
    var table = [["対象年月", "登録番号", "氏名", "ふりがな", "銀行名", "支店名", "預金種目", "口座番号", "口座名義", "報償金", "源泉徴収税額", "差引振込額"]];
    rows.forEach(function (r) {
      var a = r.account || {};
      table.push([ym, r.instructorId, r.name, r.kana, a.bank || "", a.branch || "", a.accountType || "", a.number || "", a.holder || "", r.pay.gross, r.pay.tax, r.pay.net]);
    });
    var sum = sumRows(rows);
    table.push(["合計", "", rows.length + "人", "", "", "", "", "", "", sum.gross, sum.tax, sum.net]);
    J.downloadCsv("振込一覧_" + key + ".csv", table);
  }

  function payKindLabel(category) {
    if (category === "subject") return "教科";
    if (category === "club") return "クラブ";
    if (category === "kodomo") return "こども園";
    if (category === "university") return "大学連携";
    return J.categoryOf(category).label;
  }

  function allocateYen(total, weights) {
    var sum = 0;
    var i;
    for (i = 0; i < weights.length; i++) sum += weights[i];
    var left = total;
    return weights.map(function (weight, index) {
      if (index === weights.length - 1) return left;
      var part = sum ? Math.floor(total * weight / sum) : 0;
      left -= part;
      return part;
    });
  }

  function hoursNumber(minutes) {
    return Math.round((Number(minutes) || 0) / 60 * 100) / 100;
  }

  function paymentLineRecords(rows, year, month, slipStart) {
    var due = J.payDueISO(year, month).split("-");
    var dueMonth = Number(due[1]);
    var dueYear = Number(due[0]);
    var dueDate = due.join("-");
    var kindOrder = { subject: 1, club: 2, kodomo: 3, university: 4 };
    var lines = [];
    rows.forEach(function (row) {
      var buckets = {};
      (row.pay.lines || []).forEach(function (line) {
        var key = (line.schoolName || "") + "\t" + (line.category || "");
        if (!buckets[key]) buckets[key] = { schoolName: line.schoolName || "", category: line.category || "", minutes: 0, count: 0, summaries: [] };
        buckets[key].minutes += line.minutes || 0;
        buckets[key].count += line.count || 0;
        var doc = state.documents.find(function (item) { return item.id === line.documentId; });
        var summary = (doc && String(doc.summary || "").trim()) || line.title || "";
        if (summary && buckets[key].summaries.indexOf(summary) < 0) buckets[key].summaries.push(summary);
      });
      var bucketList = Object.keys(buckets).map(function (key) { return buckets[key]; });
      bucketList.sort(function (a, b) {
        var ac = codeForSchoolName(a.schoolName) || 9999;
        var bc = codeForSchoolName(b.schoolName) || 9999;
        if (ac !== bc) return ac - bc;
        return (kindOrder[a.category] || 9) - (kindOrder[b.category] || 9);
      });
      var amountByCat = {};
      (row.pay.parts || []).forEach(function (part) { amountByCat[part.category] = part.amount; });
      var byCat = {};
      bucketList.forEach(function (bucket) {
        if (!byCat[bucket.category]) byCat[bucket.category] = [];
        byCat[bucket.category].push(bucket);
      });
      Object.keys(byCat).forEach(function (category) {
        var group = byCat[category];
        var unit = J.categoryOf(category).unit;
        var weights = group.map(function (bucket) { return unit === "count" ? bucket.count : bucket.minutes; });
        var amounts = allocateYen(amountByCat[category] || 0, weights);
        group.forEach(function (bucket, index) { bucket.amount = amounts[index]; });
      });
      var taxes = allocateYen(row.pay.tax || 0, bucketList.map(function (bucket) { return bucket.amount || 0; }));
      bucketList.forEach(function (bucket, index) {
        var unit = J.categoryOf(bucket.category).unit;
        lines.push({
          schoolCode: codeForSchoolName(bucket.schoolName) || "",
          schoolName: bucket.schoolName,
          year: Number(year),
          month: Number(month),
          instructorId: row.instructorId,
          name: row.name || "",
          kana: row.kana || "",
          hours: unit === "count" ? bucket.count : hoursNumber(bucket.minutes),
          kind: payKindLabel(bucket.category),
          summary: bucket.summaries.join("、"),
          transferMonth: dueMonth,
          gross: bucket.amount || 0,
          tax: taxes[index] || 0,
          net: (bucket.amount || 0) - (taxes[index] || 0),
          taxYear: dueYear,
          dueDate: dueDate
        });
      });
    });
    lines.sort(function (a, b) {
      var ac = Number(a.schoolCode) || 9999;
      var bc = Number(b.schoolCode) || 9999;
      if (ac !== bc) return ac - bc;
      var id = String(a.instructorId).localeCompare(String(b.instructorId), "ja", { numeric: true });
      if (id) return id;
      return String(a.kind).localeCompare(String(b.kind), "ja");
    });
    var start = parseInt(slipStart, 10);
    lines.forEach(function (line, index) {
      line.slip = start > 0 ? start + index : "";
    });
    return lines;
  }

  function exportPayExcel() {
    var year = state.pay.year;
    var month = state.pay.month;
    var key = J.monthKey(year, month);
    var slipInput = document.querySelector('[name="slipStart"]');
    if (slipInput) state.pay.slipStart = String(slipInput.value || "").trim();
    var cols = outputPayColumns();
    if (!cols.length) {
      alert("設定で支払データの列を1つ以上選んでください。");
      return;
    }
    var rows = state.payments[key] ? state.payments[key].rows : payRows(year, month);
    if (!rows.length) {
      alert("書き出す実績報告がありません。");
      return;
    }
    var records = paymentLineRecords(rows, year, month, state.pay.slipStart);
    var table = [cols.map(function (col) { return col.label; })].concat(records.map(function (line) {
      return cols.map(function (col) {
        var value = line[col.id];
        return value == null ? "" : value;
      });
    }));
    save();
    J.downloadExcel("支払データ_" + key + ".xlsx", J.plainWorkbook("支払データ", table, cols.map(function (col) { return col.width; })));
  }

  function confirmPay() {
    var rows = payRows(state.pay.year, state.pay.month);
    if (!rows.length) {
      alert("確定する実績報告がありません。");
      return;
    }
    var missing = rows.filter(function (r) { return !r.account; });
    var message = "この計算内容で支払いを確定します。";
    if (missing.length) message += "\n口座未登録が" + missing.length + "人います。";
    if (!confirm(message)) return;
    state.payments[J.monthKey(state.pay.year, state.pay.month)] = {
      year: state.pay.year,
      month: state.pay.month,
      confirmedAt: new Date().toISOString(),
      rows: rows
    };
    save();
    render();
  }

  function bindDrop(zone) {
    zone.addEventListener("dragover", function (e) {
      e.preventDefault();
      zone.classList.add("drag");
    });
    zone.addEventListener("dragleave", function () { zone.classList.remove("drag"); });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      zone.classList.remove("drag");
      readFiles(e.dataTransfer.files);
    });
  }

  document.body.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var action = btn.getAttribute("data-action");
    if (action === "tab") {
      state.tab = btn.getAttribute("data-tab");
      editor = null;
      save();
      render();
    } else if (action === "mode") {
      state.check.mode = btn.getAttribute("data-mode");
      state.check.selected = "__all__";
      state.detail = null;
      save();
      render();
    } else if (action === "doc-type") {
      var docType = btn.getAttribute("data-type");
      state.check.docType = docType === "plan" || docType === "report" ? docType : "all";
      state.detail = null;
      save();
      render();
    } else if (action === "notice-image") {
      exportNoticeImages();
    } else if (action === "select-check") {
      state.check.selected = btn.getAttribute("data-id");
      state.detail = null;
      save();
      render();
    } else if (action === "check-view") {
      state.check.view = btn.getAttribute("data-view") === "source" ? "source" : "calendar";
      save();
      render();
    } else if (action === "show-detail") {
      var detailId = btn.getAttribute("data-id");
      state.detail = { id: detailId, date: btn.getAttribute("data-date") };
      state.check.view = "source";
      save();
      render();
      var sourceRow = document.querySelector('[data-src="' + detailId.replace(/"/g, "") + '"]');
      if (sourceRow) sourceRow.scrollIntoView({ block: "nearest" });
    } else if (action === "delete-doc") {
      var id = btn.getAttribute("data-id");
      if (!confirm("この書類をセンターの記録から削除しますか。学校の元データは消えません。")) return;
      state.documents = state.documents.filter(function (d) { return d.id !== id; });
      state.detail = null;
      save();
      render();
    } else if (action === "confirm-pay") confirmPay();
    else if (action === "unconfirm-pay") {
      if (!confirm("確定を取り消して、今の実績報告から計算し直せる状態にします。")) return;
      delete state.payments[J.monthKey(state.pay.year, state.pay.month)];
      save();
      render();
    } else if (action === "print-pay") window.print();
    else if (action === "csv-pay") exportPayCsv("pay");
    else if (action === "csv-tax") exportPayCsv("tax");
    else if (action === "excel-pay") exportPayExcel();
    else if (action === "pay-col-move") {
      var moveId = btn.getAttribute("data-id");
      var dir = Number(btn.getAttribute("data-dir"));
      var moving = activePayColumns();
      var order = moving.map(function (col) { return col.id; });
      var enabled = {};
      moving.forEach(function (col) { enabled[col.id] = col.on; });
      var from = order.indexOf(moveId);
      var to = from + dir;
      if (from < 0 || to < 0 || to >= order.length) return;
      var moved = order[from];
      order[from] = order[to];
      order[to] = moved;
      storePayColumns(order, enabled);
      save();
      render();
    }
    else if (action === "load-sample") loadSample();
    else if (action === "people-tab") {
      state.peopleTab = btn.getAttribute("data-tab");
      editor = null;
      save();
      render();
    } else if (action === "new-person") {
      editor = {
        kind: "person",
        isNew: true,
        originalId: "",
        data: {
          id: nextInstructorId(),
          registeredOn: J.todayISO(),
          active: true,
          taxExempt: false,
          kind: "general",
          kana: "",
          name: "",
          gender: "",
          birth: "",
          university: "",
          postal: "",
          address: "",
          phone: "",
          fax: "",
          skills: "",
          fields: [],
          schoolHope: "",
          timeHope: "",
          recommender: ""
        }
      };
      render();
    } else if (action === "edit-person") {
      var person = state.instructors.find(function (p) { return String(p.id) === btn.getAttribute("data-id"); });
      editor = { kind: "person", isNew: false, originalId: person.id, data: JSON.parse(JSON.stringify(person)) };
      render();
    } else if (action === "save-person") savePerson();
    else if (action === "delete-person") {
      if (!confirm("この指導者を台帳から外します。口座の記録も消します。")) return;
      state.instructors = state.instructors.filter(function (p) { return String(p.id) !== String(editor.originalId); });
      state.accounts = state.accounts.filter(function (a) { return String(a.instructorId) !== String(editor.originalId); });
      editor = null;
      save();
      render();
    } else if (action === "close-editor") {
      editor = null;
      render();
    } else if (action === "new-account") {
      editor = {
        kind: "account",
        isNew: true,
        originalId: "",
        data: { instructorId: state.instructors[0] ? state.instructors[0].id : "", requestedOn: J.todayISO(), bank: "", branch: "", accountType: "普通", number: "", holder: "" }
      };
      if (!state.instructors.length) {
        alert("先に指導者を登録してください。");
        editor = null;
        return;
      }
      render();
    } else if (action === "edit-account") {
      var account = state.accounts.find(function (a) { return String(a.instructorId) === btn.getAttribute("data-id"); });
      editor = { kind: "account", isNew: false, originalId: account.instructorId, data: JSON.parse(JSON.stringify(account)) };
      render();
    } else if (action === "save-account") saveAccount();
    else if (action === "delete-account") {
      if (!confirm("この口座を削除しますか。")) return;
      state.accounts = state.accounts.filter(function (a) { return String(a.instructorId) !== String(editor.originalId); });
      editor = null;
      save();
      render();
    } else if (action === "export-roster") exportRoster();
    else if (action === "add-school") {
      var code = J.schoolCodeOf({ code: document.getElementById("new-school-code").value });
      var name = document.getElementById("new-school-name").value.trim();
      var kind = document.getElementById("new-school-kind").value;
      if (!code) {
        alert("学校番号を入れてください。");
        return;
      }
      if (!name) return;
      if (state.schools.some(function (s) { return J.schoolCodeOf(s) === code; })) {
        alert("同じ番号の学校園があります。");
        return;
      }
      if (state.schools.some(function (s) { return s.name === name; })) {
        alert("同じ名前の学校園があります。");
        return;
      }
      var id = "school-" + code;
      if (state.schools.some(function (s) { return s.id === id; })) id = J.uid();
      state.schools.push({ id: id, code: code, name: name, kind: kind });
      save();
      render();
    } else if (action === "save-schools") {
      saveSchoolTable();
    } else if (action === "delete-school") {
      var schoolId = btn.getAttribute("data-id");
      if (!confirm("この学校園を一覧から削除しますか。取り込んだ報告は残ります。")) return;
      state.schools = state.schools.filter(function (s) { return s.id !== schoolId; });
      save();
      render();
    } else if (action === "save-settings") {
      var form = document.getElementById("settings-form");
      var fd = new FormData(form);
      state.settings = {
        rates: {
          subject: readMoney(fd.get("rate-subject")),
          club: readMoney(fd.get("rate-club")),
          kodomo: readMoney(fd.get("rate-kodomo")),
          university: readMoney(fd.get("rate-university"))
        },
        taxRate: readMoney(fd.get("taxRate")),
        taxRateOver: readMoney(fd.get("taxRateOver")),
        taxThreshold: readMoney(fd.get("taxThreshold")),
        withholding: !!form.querySelector('[name="withholding"]').checked,
        configured: true,
        organization: String(fd.get("organization") || "").trim(),
        payer: String(fd.get("payer") || "").trim(),
        payColumns: state.settings.payColumns || null
      };
      save();
      render();
    } else if (action === "backup") {
      J.downloadJson("人材バンク全データ.json", {
        schema: J.SCHEMA_BACKUP,
        version: 1,
        exportedAt: new Date().toISOString(),
        instructors: state.instructors,
        accounts: state.accounts,
        schools: state.schools,
        documents: state.documents,
        payments: state.payments,
        settings: state.settings
      });
    }
  });

  document.body.addEventListener("change", function (e) {
    if (e.target.name === "checkYear" || e.target.name === "checkMonth") {
      if (e.target.name === "checkYear") state.check.year = Number(e.target.value);
      if (e.target.name === "checkMonth") state.check.month = Number(e.target.value);
      state.detail = null;
      save();
      render();
    }
    if (e.target.name === "payYear" || e.target.name === "payMonth") {
      if (e.target.name === "payYear") state.pay.year = Number(e.target.value);
      if (e.target.name === "payMonth") state.pay.month = Number(e.target.value);
      save();
      render();
    }
    if (e.target.name === "slipStart") {
      state.pay.slipStart = String(e.target.value || "").trim();
      save();
    }
    if (e.target.name === "pay-col") {
      var cols = activePayColumns();
      var order = cols.map(function (col) { return col.id; });
      var enabled = {};
      cols.forEach(function (col) { enabled[col.id] = col.on; });
      enabled[e.target.getAttribute("data-id")] = e.target.checked;
      storePayColumns(order, enabled);
      save();
    }
    if (e.target.id === "import-file" || e.target.id === "import-folder") {
      readFiles(e.target.files);
      e.target.value = "";
    }
    if (e.target.id === "backup-file" && e.target.files[0]) {
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var json = JSON.parse(reader.result);
          if (!json || json.schema !== J.SCHEMA_BACKUP) {
            alert("全データのバックアップではありません。");
            return;
          }
          if (!confirm("今のセンターデータを、このバックアップで置き換えます。")) return;
          state.instructors = json.instructors || [];
          state.accounts = json.accounts || [];
          state.schools = J.alignSchools(json.schools || J.defaultSchools());
          state.documents = json.documents || [];
          state.payments = json.payments || {};
          var restored = json.settings || {};
          restored.configured = !!json.settings;
          state.settings = privateSettings(restored);
          save();
          render();
        } catch (err) {
          alert("ファイルを読み取れませんでした。");
        }
      };
      reader.readAsText(file, "utf-8");
      e.target.value = "";
    }
  });

  document.body.addEventListener("input", function (e) {
    if (e.target.id === "new-school-code") {
      e.target.setAttribute("data-auto", "0");
      return;
    }
    if (e.target.id === "new-school-name") {
      var codeInput = document.getElementById("new-school-code");
      if (!codeInput) return;
      var knownCode = J.schoolCodeOf(J.knownSchool(e.target.value, state.schools));
      if (knownCode) {
        codeInput.value = knownCode;
        codeInput.setAttribute("data-auto", "1");
        return;
      }
      if (codeInput.getAttribute("data-auto") !== "0") codeInput.value = nextSchoolCode();
      return;
    }
    if (e.target.classList && e.target.classList.contains("school-name")) {
      var rowCode = J.schoolCodeOf(J.knownSchool(e.target.value, state.schools));
      var rowInput = e.target.closest("tr") && e.target.closest("tr").querySelector(".school-code");
      if (rowCode && rowInput && !String(rowInput.value || "").trim()) rowInput.value = rowCode;
      return;
    }
    if (e.target.name !== "checkQuery") return;
    var q = e.target.value.trim();
    state.check.query = q;
    document.querySelectorAll(".list-btn[data-text]").forEach(function (btn) {
      if (btn.getAttribute("data-id") === "__all__") {
        btn.style.display = "";
        return;
      }
      btn.style.display = !q || (btn.getAttribute("data-text") || "").indexOf(q) >= 0 ? "" : "none";
    });
  });

  render();
})();
