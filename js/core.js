(function (root) {
  "use strict";

  var SCHEMA_SUBMISSION = "moriguchi-jinzai-bank-submission";
  var SCHEMA_ROSTER = "moriguchi-jinzai-bank-roster";
  var SCHEMA_BACKUP = "moriguchi-jinzai-bank-center-backup";
  var SCHEMA_WORK = "moriguchi-jinzai-bank-school-work";
  var SCHEMA_STATE = "moriguchi-jinzai-bank-school-state";

  var CATEGORIES = [
    { id: "subject", label: "教科等派遣", form: "様式1", unit: "hour", fieldLabel: "教科・領域等", hasGrade: true },
    { id: "club", label: "部活動派遣", form: "様式2", unit: "hour", fieldLabel: "クラブ名", hasGrade: false },
    { id: "kodomo", label: "特色ある認定こども園づくり派遣", form: "こども園", unit: "hour", fieldLabel: "活動名", hasGrade: true },
    { id: "university", label: "大学連携による学生派遣", form: "大学連携", unit: "count", fieldLabel: "教科・領域等またはクラブ名", hasGrade: true }
  ];

  var EXPERTISE = ["文化・芸術", "スポーツ", "福祉・保健", "人権", "科学・技術", "自然・環境", "経済・産業", "国際・外国語", "社会・生活", "その他"];

  var SCHOOL_KINDS = [
    { id: "elementary", label: "小学校" },
    { id: "junior", label: "中学校" },
    { id: "compulsory", label: "義務教育学校" },
    { id: "kodomo", label: "認定こども園" }
  ];

  var WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

  var CHIP_COLORS = ["#3d7eab", "#b86a55", "#3d8f80", "#9a6b94", "#4e8a9a", "#8a6a48", "#6a73a8", "#c49a6a"];
  var CHIP_WASH = ["#e7f3fb", "#fbf0ec", "#e8f6f2", "#f6eef4", "#e8f4f6", "#f6f1e8", "#eeeef6", "#fbf6ee"];

  function defaultSettings() {
    return {
      rates: { subject: null, club: null, kodomo: null, university: null },
      taxRate: null,
      taxRateOver: null,
      taxThreshold: null,
      withholding: false,
      configured: false,
      organization: "守口市教育委員会",
      payer: "守口市会計管理者"
    };
  }

  function enteredNumber(value) {
    if (value == null || String(value).trim() === "") return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function defaultSchools() {
    var rows = [
      [1, "守口小学校", "elementary"],
      [2, "庭窪小学校", "elementary"],
      [9, "八雲小学校", "elementary"],
      [11, "錦小学校", "elementary"],
      [13, "金田小学校", "elementary"],
      [14, "梶小学校", "elementary"],
      [15, "藤田小学校", "elementary"],
      [17, "八雲東小学校", "elementary"],
      [18, "佐太小学校", "elementary"],
      [20, "第一中学校", "junior"],
      [25, "庭窪中学校", "junior"],
      [26, "八雲中学校", "junior"],
      [27, "梶中学校", "junior"],
      [28, "大久保中学校", "junior"],
      [30, "錦中学校", "junior"],
      [39, "樟風中学校", "junior"],
      [40, "よつば小学校", "elementary"],
      [41, "さつき学園（前期）", "compulsory"],
      [42, "さつき学園（後期）", "compulsory"],
      [43, "さつき学園（夜間学級）", "compulsory"],
      [44, "さくら小学校", "elementary"],
      [45, "寺方小学校", "elementary"]
    ];
    return rows.map(function (row) {
      return { id: "school-" + row[0], code: row[0], name: row[1], kind: row[2] };
    });
  }

  function schoolCodeOf(school) {
    var code = parseInt(school && school.code, 10);
    return code > 0 ? code : 0;
  }

  function plainSchoolName(name) {
    return String(name || "").replace(/^守口市立/, "").trim();
  }

  function findSchool(list, name) {
    var plain = plainSchoolName(name);
    if (!plain || !list) return null;
    for (var i = 0; i < list.length; i++) {
      if (plainSchoolName(list[i] && list[i].name) === plain) return list[i];
    }
    return null;
  }

  function knownSchool(name, list) {
    var saved = findSchool(list, name);
    if (saved && schoolCodeOf(saved)) return saved;
    var official = findSchool(defaultSchools(), name);
    if (official) return official;
    return saved;
  }

  function sortSchools(list) {
    return (list || []).slice().sort(function (a, b) {
      var ac = schoolCodeOf(a) || 9999;
      var bc = schoolCodeOf(b) || 9999;
      if (ac !== bc) return ac - bc;
      return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });
  }

  function alignSchools(saved) {
    if (!saved || !saved.length) return defaultSchools();
    var defaults = defaultSchools();
    var byName = {};
    defaults.forEach(function (school) { byName[plainSchoolName(school.name)] = school; });
    var hasCode = saved.some(function (school) { return schoolCodeOf(school) > 0; });
    var names = {};
    saved.forEach(function (school) { names[school.name] = true; });
    var list = saved.map(function (school) {
      var copy = Object.assign({}, school);
      if (copy.name === "寺方南小学校" && !names["寺方小学校"]) copy.name = "寺方小学校";
      var official = byName[plainSchoolName(copy.name)];
      if (official && !schoolCodeOf(copy)) copy.code = official.code;
      if (official && !copy.kind) copy.kind = official.kind;
      if (!copy.id) copy.id = official ? official.id : uid();
      return copy;
    });
    if (!hasCode) {
      list = list.filter(function (item) { return item.name !== "さつき学園"; });
      defaults.forEach(function (school) {
        if (!list.some(function (item) { return item.name === school.name; })) list.push(Object.assign({}, school));
      });
    }
    return sortSchools(list);
  }

  function categoryOf(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return CATEGORIES[0];
  }

  function kindLabel(id) {
    for (var i = 0; i < SCHOOL_KINDS.length; i++) {
      if (SCHOOL_KINDS[i].id === id) return SCHOOL_KINDS[i].label;
    }
    return "";
  }

  function uid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function isoFromDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function partsOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function wareki(year, month, day) {
    var ry = year - 2018;
    var yLabel = ry === 1 ? "元" : String(ry);
    var text = "令和" + yLabel + "年";
    if (month != null) text += Number(month) + "月";
    if (day != null) text += Number(day) + "日";
    return text;
  }

  function warekiFromISO(iso) {
    var p = partsOf(iso);
    if (!p) return "";
    return wareki(p.y, p.m, p.d);
  }

  function weekday(iso) {
    var p = partsOf(iso);
    if (!p) return "";
    return WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()];
  }

  function planDueISO(year, month) {
    return isoFromDate(new Date(year, month - 1, 0));
  }

  function reportDueISO(year, month) {
    return isoFromDate(new Date(year, month, 3));
  }

  function payDueISO(year, month) {
    return isoFromDate(new Date(year, month + 1, 0));
  }

  function registrationEnd(iso) {
    var p = partsOf(iso);
    if (!p) return "";
    var limit = new Date(p.y + 3, p.m - 1, p.d);
    var endYear = limit.getFullYear();
    var march31 = new Date(endYear, 2, 31);
    if (march31.getTime() > limit.getTime()) endYear -= 1;
    return endYear + "-03-31";
  }

  function minutesBetween(start, end) {
    var a = /^(\d{1,2}):(\d{2})$/.exec(start || "");
    var b = /^(\d{1,2}):(\d{2})$/.exec(end || "");
    if (!a || !b) return null;
    return (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
  }

  function sessionMinutes(session) {
    var span = minutesBetween(session.start, session.end);
    if (span == null) return null;
    var br = Number(session.breakMinutes) || 0;
    return span - br;
  }

  function requiredBreakMinutes(workMinutes) {
    if (workMinutes > 8 * 60) return 60;
    if (workMinutes > 6 * 60) return 45;
    return 0;
  }

  function breakShortfalls(doc, others) {
    var key = String((doc && doc.instructorId) || "").trim() || String((doc && doc.instructorName) || "").trim();
    var list = [];
    if (doc) list.push(doc);
    (others || []).forEach(function (item) {
      if (!item || (doc && item.id === doc.id)) return;
      var itemKey = String(item.instructorId || "").trim() || String(item.instructorName || "").trim();
      if (key && itemKey === key) list.push(item);
    });
    var days = {};
    list.forEach(function (item, index) {
      (item.sessions || []).forEach(function (session) {
        if (!session || !session.date) return;
        var span = minutesBetween(session.start, session.end);
        if (span == null || span < 0) return;
        var br = Math.max(0, Number(session.breakMinutes) || 0);
        var work = span - br;
        if (work < 0) return;
        if (!days[session.date]) days[session.date] = { work: 0, breakMinutes: 0, shared: false };
        days[session.date].work += work;
        days[session.date].breakMinutes += br;
        if (index > 0 && (work || br)) days[session.date].shared = true;
      });
    });
    var result = [];
    Object.keys(days).sort().forEach(function (date) {
      var day = days[date];
      var need = requiredBreakMinutes(day.work);
      if (!need || day.breakMinutes >= need) return;
      var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      result.push({
        date: date,
        label: parts ? (Number(parts[2]) + "月" + Number(parts[3]) + "日") : date,
        work: day.work,
        breakMinutes: day.breakMinutes,
        need: need,
        shared: day.shared
      });
    });
    return result;
  }

  function formatMinutes(mins) {
    mins = Math.max(0, Math.round(Number(mins) || 0));
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    if (h && m) return h + "時間" + m + "分";
    if (h) return h + "時間";
    return m + "分";
  }

  function yen(n) {
    var v = Math.round(Number(n) || 0);
    return v.toLocaleString("ja-JP") + "円";
  }

  function colorIndex(key) {
    var text = String(key || "");
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h % CHIP_COLORS.length;
  }

  function colorFor(key) {
    return CHIP_COLORS[colorIndex(key)];
  }

  function colorWash(key) {
    return CHIP_WASH[colorIndex(key)];
  }

  function calcWithholding(gross, settings) {
    var g = Math.max(0, Math.floor(Number(gross) || 0));
    if (!settings || !settings.withholding || g === 0) return 0;
    var rate = enteredNumber(settings.taxRate);
    if (rate == null) return 0;
    var rateBps = Math.round(rate * 100);
    var threshold = enteredNumber(settings.taxThreshold);
    var over = enteredNumber(settings.taxRateOver);
    if (threshold == null || over == null || g <= threshold) return Math.floor(g * rateBps / 10000);
    var overBps = Math.round(over * 100);
    var base = Math.floor(threshold * rateBps / 10000);
    return Math.floor((g - threshold) * overBps / 10000) + base;
  }

  function usableSessions(doc) {
    return (doc.sessions || []).filter(function (s) {
      return s && s.date && s.start && s.end && sessionMinutes(s) != null && sessionMinutes(s) >= 0;
    });
  }

  function documentMinutes(doc) {
    return usableSessions(doc).reduce(function (sum, s) {
      return sum + sessionMinutes(s);
    }, 0);
  }

  function documentCount(doc) {
    return usableSessions(doc).length;
  }

  function calcPersonPay(reports, settings) {
    var byCat = {};
    var lines = [];
    reports.forEach(function (doc) {
      var cat = categoryOf(doc.category);
      var sessions = usableSessions(doc);
      var minutes = 0;
      sessions.forEach(function (s) { minutes += sessionMinutes(s); });
      if (!byCat[doc.category]) {
        byCat[doc.category] = { minutes: 0, count: 0 };
      }
      byCat[doc.category].minutes += minutes;
      byCat[doc.category].count += sessions.length;
      lines.push({
        documentId: doc.id,
        updatedAt: doc.updatedAt || "",
        schoolName: doc.schoolName || "",
        category: doc.category,
        title: doc.title || "",
        minutes: minutes,
        count: sessions.length,
        sessions: sessions
      });
    });

    var parts = [];
    var gross = 0;
    Object.keys(byCat).forEach(function (catId) {
      var cat = categoryOf(catId);
      var agg = byCat[catId];
      var entered = enteredNumber(settings.rates && settings.rates[catId]);
      var rate = entered == null ? 0 : Math.floor(entered);
      var amount = cat.unit === "count"
        ? agg.count * rate
        : Math.floor(agg.minutes * rate / 60);
      gross += amount;
      parts.push({
        category: catId,
        label: cat.label,
        unit: cat.unit,
        minutes: agg.minutes,
        count: agg.count,
        rate: rate,
        amount: amount
      });
    });

    var tax = calcWithholding(gross, settings);
    return {
      parts: parts,
      lines: lines,
      gross: gross,
      tax: tax,
      net: gross - tax,
      minutes: parts.reduce(function (s, p) { return s + (p.unit === "hour" ? p.minutes : 0); }, 0),
      count: parts.reduce(function (s, p) { return s + (p.unit === "count" ? p.count : 0); }, 0)
    };
  }

  function blankSession() {
    return { date: "", start: "", end: "", breakMinutes: 0, content: "" };
  }

  function validateDocument(doc) {
    var errors = [];
    if (!doc || (doc.type !== "plan" && doc.type !== "report")) errors.push("種類（活用計画または実績報告）がありません。");
    if (!doc || !categoryOf(doc.category)) errors.push("活動区分が不正です。");
    if (!doc || !doc.year || !doc.month) errors.push("対象年月がありません。");
    if (!doc || !String(doc.instructorName || "").trim()) errors.push("指導者氏名がありません。");
    if (!doc || !String(doc.instructorId || "").trim()) errors.push("登録番号がありません。");
    if (!doc || !String(doc.title || "").trim()) errors.push(categoryOf(doc && doc.category).fieldLabel + "がありません。");
    var sessions = (doc && doc.sessions) || [];
    var filled = sessions.filter(function (s) { return s.date || s.start || s.end || s.content; });
    if (!filled.length) errors.push("活動日を1行以上入力してください。");
    filled.forEach(function (s, idx) {
      var label = (idx + 1) + "行目";
      if (!s.date || !s.start || !s.end) {
        errors.push(label + "の日付・開始・終了を入力してください。");
        return;
      }
      var p = partsOf(s.date);
      if (!p || p.y !== Number(doc.year) || p.m !== Number(doc.month)) {
        errors.push(label + "の日付が対象月と違います。");
      }
      var mins = sessionMinutes(s);
      if (mins == null) errors.push(label + "の時刻が正しくありません。");
      else if (mins < 0) errors.push(label + "は終了が開始より前か、休憩が活動時間を超えています。");
    });
    if (doc && doc.category === "university" && !String(doc.university || "").trim()) {
      errors.push("大学名がありません。");
    }
    return errors;
  }

  function documentBlockers(doc) {
    return validateDocument(doc).filter(function (message) {
      return !/^\d+行目/.test(message);
    });
  }

  function loadStore(key, fallback) {
    try {
      var raw = root.localStorage && root.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function saveStore(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "application/octet-stream" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function downloadJson(filename, obj) {
    download(filename, JSON.stringify(obj, null, 2), "application/json");
  }

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCsv(filename, rows) {
    var body = rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
    download(filename, "\uFEFF" + body, "text/csv;charset=utf-8");
  }

  function monthKey(year, month) {
    return year + "-" + pad2(month);
  }

  function workMonth(date) {
    var d = date || new Date();
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    if (d.getDate() <= 10) {
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return { year: year, month: month };
  }

  function sampleCenterData() {
    var instructors = [
      {
        id: "1001",
        registeredOn: "2024-04-01",
        active: true,
        taxExempt: false,
        kind: "general",
        kana: "ヤマダハナコ",
        name: "山田花子",
        gender: "女",
        birth: "1980-05-12",
        university: "",
        postal: "570-0000",
        address: "大阪府守口市京阪本通二丁目",
        phone: "06-0000-0001",
        fax: "",
        skills: "リコーダー、器楽指導",
        fields: ["文化・芸術"],
        schoolHope: "小学校",
        timeHope: "火曜・木曜の放課後",
        recommender: "守口市立さくら小学校長"
      },
      {
        id: "1002",
        registeredOn: "2024-04-01",
        active: true,
        taxExempt: false,
        kind: "general",
        kana: "サトウタロウ",
        name: "佐藤太郎",
        gender: "男",
        birth: "1975-11-03",
        university: "",
        postal: "570-0000",
        address: "大阪府守口市八雲西町",
        phone: "06-0000-0002",
        fax: "",
        skills: "バスケットボール",
        fields: ["スポーツ"],
        schoolHope: "小学校・中学校",
        timeHope: "水曜の放課後",
        recommender: "守口市立さくら小学校長"
      },
      {
        id: "2001",
        registeredOn: "2025-04-10",
        active: true,
        taxExempt: false,
        kind: "university",
        kana: "スズキミサキ",
        name: "鈴木美咲",
        gender: "女",
        birth: "2004-02-20",
        university: "大阪○○大学",
        postal: "",
        address: "",
        phone: "090-0000-0003",
        fax: "",
        skills: "理科実験補助",
        fields: ["科学・技術"],
        schoolHope: "小学校",
        timeHope: "金曜",
        recommender: "大阪○○大学"
      }
    ];
    var accounts = [
      { instructorId: "1001", bank: "りそな銀行", branch: "守口支店", accountType: "普通", number: "0000001", holder: "ヤマダハナコ", requestedOn: "2024-04-01" },
      { instructorId: "1002", bank: "りそな銀行", branch: "守口支店", accountType: "普通", number: "0000002", holder: "サトウタロウ", requestedOn: "2024-04-01" }
    ];
    var documents = [
      doc("plan-sakura-hana", "plan", "subject", "さくら小学校", "elementary", 2026, 9, "1001", "ヤマダハナコ", "山田花子", "", "音楽", "3年", 28, "リコーダーの運指", [
        ses("2026-09-08", "15:30", "16:30", 0, "音楽室で3年生に運指を指導する予定。"),
        ses("2026-09-15", "15:30", "16:30", 0, "音楽室で3年生に運指を指導する予定。")
      ], "2026-08-28"),
      doc("report-sakura-hana", "report", "subject", "さくら小学校", "elementary", 2026, 9, "1001", "ヤマダハナコ", "山田花子", "", "音楽", "3年", 28, "リコーダーの運指", [
        ses("2026-09-08", "15:30", "16:30", 0, "音楽室で、3年生に、担任とリコーダーの指使いを指導した。"),
        ses("2026-09-22", "15:30", "16:30", 0, "日程を変更し、音楽室で3年生に指導した。")
      ], "2026-10-02"),
      doc("report-yakumo-hana", "report", "subject", "八雲小学校", "elementary", 2026, 9, "1001", "ヤマダハナコ", "山田花子", "", "音楽", "4年", 30, "リコーダーの運指", [
        ses("2026-09-10", "15:30", "16:30", 0, "音楽室で4年生に運指を指導した。")
      ], "2026-10-01"),
      doc("plan-sakura-taro", "plan", "club", "さくら小学校", "elementary", 2026, 9, "1002", "サトウタロウ", "佐藤太郎", "", "バスケットボール", "", "", "パスとシュート", [
        ses("2026-09-09", "16:00", "18:00", 0, "体育館でパスを指導する予定。"),
        ses("2026-09-16", "16:00", "18:00", 0, "体育館でシュートを指導する予定。"),
        ses("2026-09-23", "16:00", "18:00", 0, "体育館でミニゲームを行う予定。")
      ], "2026-08-27"),
      doc("report-sakura-taro", "report", "club", "さくら小学校", "elementary", 2026, 9, "1002", "サトウタロウ", "佐藤太郎", "", "バスケットボール", "", "", "パスとシュート", [
        ses("2026-09-09", "16:00", "18:00", 0, "体育館で、顧問と、パスを指導した。"),
        ses("2026-09-16", "16:00", "18:00", 0, "体育館で、顧問と、シュートを指導した。"),
        ses("2026-09-23", "16:00", "18:00", 0, "体育館で、顧問と、ミニゲームを行った。")
      ], "2026-10-02"),
      doc("report-satsuki-misaki", "report", "university", "さつき学園", "compulsory", 2026, 9, "2001", "スズキミサキ", "鈴木美咲", "大阪○○大学", "理科", "5年", 32, "実験補助", [
        ses("2026-09-11", "13:30", "14:30", 0, "理科室で実験の補助をした。"),
        ses("2026-09-25", "13:30", "14:30", 0, "理科室で実験の補助をした。")
      ], "2026-10-02"),
      doc("plan-sakura-hana-10", "plan", "subject", "さくら小学校", "elementary", 2026, 10, "1001", "ヤマダハナコ", "山田花子", "", "音楽", "3年", 28, "二重奏", [
        ses("2026-10-06", "15:30", "16:30", 0, "二重奏の練習を行う予定。"),
        ses("2026-10-20", "15:30", "16:30", 0, "二重奏の練習を行う予定。")
      ], "2026-09-28")
    ];
    return { instructors: instructors, accounts: accounts, documents: documents };
  }

  function doc(id, type, category, schoolName, schoolKind, year, month, instructorId, kana, name, university, title, grade, participants, summary, sessions, preparedOn) {
    return {
      id: id,
      type: type,
      category: category,
      year: year,
      month: month,
      preparedOn: preparedOn,
      principal: "校園長　例",
      instructorId: instructorId,
      instructorKana: kana,
      instructorName: name,
      university: university,
      title: title,
      grade: grade,
      participants: participants,
      summary: summary,
      sessions: sessions,
      schoolName: schoolName,
      schoolKind: schoolKind,
      updatedAt: preparedOn + "T09:00:00+09:00",
      sample: true
    };
  }

  function ses(date, start, end, breakMinutes, content) {
    return { date: date, start: start, end: end, breakMinutes: breakMinutes, content: content };
  }

  function excelText(value) {
    if (value == null) return "";
    return String(value).replace(/\s+/g, " ").trim();
  }

  function clockFromCell(cell) {
    if (!cell || cell.v == null || cell.v === "") return "";
    if (typeof cell.v === "number") {
      var shown = /(\d{1,2}):(\d{2})/.exec(String(cell.w || ""));
      if (shown) return pad2(Number(shown[1]) % 24) + ":" + shown[2];
      var mins = Math.round((cell.v % 1) * 24 * 60);
      if (mins < 0) mins += 24 * 60;
      return pad2(Math.floor(mins / 60) % 24) + ":" + pad2(mins % 60);
    }
    var matched = /(\d{1,2}):(\d{2})/.exec(excelText(cell.v));
    if (!matched) return "";
    return pad2(Number(matched[1]) % 24) + ":" + matched[2];
  }

  function breakFromCell(cell) {
    if (!cell || cell.v == null || cell.v === "") return 0;
    if (typeof cell.v === "number") {
      if (cell.v > 0 && cell.v < 1) return Math.round(cell.v * 24 * 60);
      return Math.max(0, Math.round(cell.v));
    }
    var text = excelText(cell.v);
    if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
    var matched = /(\d{1,2}):(\d{2})/.exec(text);
    if (matched) return Number(matched[1]) * 60 + Number(matched[2]);
    return 0;
  }

  function dateFromValue(value, year, month) {
    if (value == null || value === "") return "";
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.getFullYear() + "-" + pad2(value.getMonth() + 1) + "-" + pad2(value.getDate());
    }
    if (typeof value === "number") {
      if (value >= 1 && value <= 31 && year && month) return year + "-" + pad2(month) + "-" + pad2(Math.round(value));
      if (value > 20000) {
        var dt = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
        return dt.getUTCFullYear() + "-" + pad2(dt.getUTCMonth() + 1) + "-" + pad2(dt.getUTCDate());
      }
    }
    var text = excelText(value);
    var iso = /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/.exec(text);
    if (iso) return iso[1] + "-" + pad2(Number(iso[2])) + "-" + pad2(Number(iso[3]));
    var day = parseInt(text, 10);
    if (day >= 1 && day <= 31 && year && month && String(day) === text) return year + "-" + pad2(month) + "-" + pad2(day);
    return "";
  }

  function sessionsWorkbook(sessions, includeBreak) {
    var header = includeBreak
      ? ["日", "開始", "終了", "休憩（分）", "その回の内容"]
      : ["日", "開始", "終了", "その回の内容"];
    var rows = [header];
    (sessions || []).forEach(function (session) {
      if (!session || (!session.date && !session.start && !session.end && !session.content)) return;
      var row = [session.date || "", session.start || "", session.end || ""];
      if (includeBreak) row.push(Number(session.breakMinutes) || 0);
      row.push(session.content || "");
      rows.push(row);
    });
    var sheet = root.XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = includeBreak
      ? [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 40 }]
      : [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    var book = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(book, sheet, "活動の明細");
    return book;
  }

  function sessionsFromExcel(data, year, month) {
    if (!root.XLSX) return { error: "Excelを読み込む準備ができていません。" };
    var book;
    try { book = root.XLSX.read(data, { type: "array" }); }
    catch (err) { return { error: "Excelを読み取れませんでした。" }; }
    var sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) return { error: "活動の明細がありません。" };
    var rows = root.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
    var headerIndex = -1;
    for (var i = 0; i < rows.length; i++) {
      if (excelText(rows[i] && rows[i][0]) === "日") {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex < 0) return { error: "活動の明細のExcelではありません。明細から書き出したファイルを開いてください。" };
    var headers = (rows[headerIndex] || []).map(excelText);
    function column(name) {
      for (var c = 0; c < headers.length; c++) {
        if (headers[c].indexOf(name) >= 0) return c;
      }
      return -1;
    }
    var dateCol = column("日");
    var startCol = column("開始");
    var endCol = column("終了");
    var breakCol = column("休憩");
    var contentCol = column("内容");
    var sessions = [];
    for (var r = headerIndex + 1; r < rows.length; r++) {
      var line = rows[r] || [];
      var start = startCol >= 0 ? clockFromCell({ v: line[startCol] }) : "";
      var end = endCol >= 0 ? clockFromCell({ v: line[endCol] }) : "";
      var content = contentCol >= 0 ? excelText(line[contentCol]) : "";
      var date = dateCol >= 0 ? dateFromValue(line[dateCol], year, month) : "";
      if (!date && !start && !end && !content) continue;
      sessions.push({
        date: date,
        start: start,
        end: end,
        breakMinutes: breakCol >= 0 ? breakFromCell({ v: line[breakCol] }) : 0,
        content: content
      });
    }
    if (!sessions.length) return { error: "活動の明細に行がありません。" };
    return { sessions: sessions };
  }

  function formsFromExcel(data) {
    if (!root.XLSX) return { error: "Excelを読み込む準備ができていません。", documents: [], warnings: [] };
    var book;
    try { book = root.XLSX.read(data, { type: "array", cellDates: false, cellStyles: true }); }
    catch (err) { return { error: "Excelを読み取れませんでした。", documents: [], warnings: [] }; }
    var documents = [];
    var warnings = [];
    var skippedBlank = false;

    function cellText(cell) {
      var text = excelText(cell && cell.v);
      return text.replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
    }

    function weekdayChar(cell) {
      if (!cell) return "";
      var texts = [];
      if (cell.w) texts.push(String(cell.w).trim());
      var raw = cellText(cell);
      if (raw) texts.push(raw);
      for (var i = 0; i < texts.length; i++) {
        var marked = /([日月火水木金土])曜/.exec(texts[i]);
        if (marked) return marked[1];
        if (/^[日月火水木金土]$/.test(texts[i])) return texts[i];
      }
      return "";
    }

    function plain(cell) {
      if (!cell || cell.v == null) return "";
      return String(cell.v).replace(/\r\n/g, "\n").trim();
    }

    function sheetRows(sheet) {
      if (!sheet || !sheet["!ref"]) return [];
      var range = root.XLSX.utils.decode_range(sheet["!ref"]);
      var rows = [];
      for (var r = range.s.r; r <= range.e.r; r++) {
        var row = [];
        for (var c = range.s.c; c <= range.e.c; c++) row.push(sheet[root.XLSX.utils.encode_cell({ r: r, c: c })] || null);
        rows.push(row);
      }
      rows.baseRow = range.s.r;
      rows.baseCol = range.s.c;
      return rows;
    }

    function spanEnd(sheet, absR, absC) {
      var merges = sheet["!merges"] || [];
      for (var i = 0; i < merges.length; i++) {
        var m = merges[i];
        if (absR >= m.s.r && absR <= m.e.r && absC >= m.s.c && absC <= m.e.c) return m.e.c;
      }
      return absC;
    }

    function rightOf(sheet, rows, r, c) {
      var next = spanEnd(sheet, r + rows.baseRow, c + rows.baseCol) + 1 - rows.baseCol;
      return rows[r] && rows[r][next] ? rows[r][next] : null;
    }

    function findCell(rows, pred, limit) {
      var max = limit == null ? rows.length : Math.min(rows.length, limit);
      for (var r = 0; r < max; r++) {
        for (var c = 0; c < rows[r].length; c++) {
          var text = cellText(rows[r][c]);
          if (text && pred(text, r, c)) return { r: r, c: c, text: text };
        }
      }
      return null;
    }

    function exact(rows, word, limit) {
      return findCell(rows, function (text) { return text === word; }, limit);
    }

    function beforeLabel(rows, r, word) {
      for (var c = 1; c < rows[r].length; c++) {
        if (cellText(rows[r][c]) === word) return rows[r][c - 1];
      }
      return null;
    }

    function colExact(row, word) {
      for (var c = 0; c < row.length; c++) {
        if (cellText(row[c]) === word) return c;
      }
      return -1;
    }

    function reiwaYear(cell) {
      var text = cellText(cell);
      if (!text) return 0;
      if (text === "元") return 2019;
      var n = parseInt(text, 10);
      if (!n) return 0;
      if (n >= 2018) return n;
      return 2018 + n;
    }

    function idText(cell) {
      if (!cell || cell.v == null || cell.v === "") return "";
      if (typeof cell.v === "number") return String(Math.round(cell.v));
      return cellText(cell);
    }

    function numberText(cell) {
      var text = cellText(cell);
      if (!text) return "";
      var n = Number(text.replace(/人/g, ""));
      return isNaN(n) ? text : n;
    }

    book.SheetNames.forEach(function (sheetName) {
      try {
      var sheet = book.Sheets[sheetName];
      var rows = sheetRows(sheet);
      if (!rows.length) return;
      var head = [];
      for (var r = 0; r < Math.min(rows.length, 20); r++) {
        for (var c = 0; c < rows[r].length; c++) head.push(cellText(rows[r][c]));
      }
      var headText = head.join(" ");
      var isForm = headText.indexOf("様式") >= 0 || headText.indexOf("指導者氏名") >= 0 || headText.indexOf("人材バンク") >= 0;
      if (!isForm) {
        warnings.push(sheetName + "：計画・報告書の様式ではないため、読み込んでいません。");
        return;
      }
      var header = findCell(rows, function (text, r) {
        if (text !== "回") return false;
        return colExact(rows[r], "日") >= 0 && colExact(rows[r], "活動内容") >= 0;
      });
      var nameLabel = findCell(rows, function (text) { return text.indexOf("指導者氏名") >= 0; }, 20);
      var idLabel = findCell(rows, function (text) { return text.indexOf("登録番号") >= 0; }, 20);
      var kanaLabel = findCell(rows, function (text) { return text.indexOf("フリガナ") >= 0; }, 20);
      var titleLabel = findCell(rows, function (text) { return text.indexOf("教科・領域") >= 0 || text.indexOf("クラブ名") >= 0; }, 20);
      var principalLabel = findCell(rows, function (text) { return text.indexOf("校園長") >= 0; }, 16);
      var schoolLabel = findCell(rows, function (text) { return text.indexOf("守口市立") >= 0; }, 16);
      var universityLabel = findCell(rows, function (text) { return text === "大学名"; }, 16);
      var summaryLabel = findCell(rows, function (text) { return text === "活動内容"; }, header ? header.r : 20);
      var monthSentence = findCell(rows, function (text) { return text.indexOf("月の活動内容") >= 0; }, 24);
      var mark = exact(rows, "書", 12);
      var preparedRow = -1;
      for (var pr = 0; pr < Math.min(rows.length, 6); pr++) {
        var hasReiwa = false;
        var hasDay = false;
        for (var pc = 0; pc < rows[pr].length; pc++) {
          var label = cellText(rows[pr][pc]);
          if (label === "令和") hasReiwa = true;
          if (label === "日") hasDay = true;
        }
        if (hasReiwa && hasDay) preparedRow = pr;
      }
      var club = headText.indexOf("様式2") >= 0 || headText.indexOf("様式２") >= 0 || headText.indexOf("部活動") >= 0 || (titleLabel && titleLabel.text.indexOf("クラブ") >= 0);
      var category = universityLabel ? "university" : (club ? "club" : "subject");
      var expect = club ? 13 : 10;
      var activityYear = 0;
      var activityMonth = 0;
      if (monthSentence) {
        for (var yc = 0; yc < rows[monthSentence.r].length; yc++) {
          if (cellText(rows[monthSentence.r][yc]) === "令和") {
            activityYear = reiwaYear(rightOf(sheet, rows, monthSentence.r, yc));
            break;
          }
        }
      }
      if (mark) activityMonth = parseInt(cellText(beforeLabel(rows, mark.r, "月")), 10) || 0;
      var typeText = mark ? rows[mark.r].map(cellText).join("") : "";
      var type = typeText.indexOf("実績") >= 0 ? "report" : (typeText.indexOf("計画") >= 0 ? "plan" : "");
      var preparedYear = preparedRow >= 0 ? reiwaYear(beforeLabel(rows, preparedRow, "年")) : 0;
      var preparedMonth = preparedRow >= 0 ? parseInt(cellText(beforeLabel(rows, preparedRow, "月")), 10) || 0 : 0;
      var preparedDay = preparedRow >= 0 ? parseInt(cellText(beforeLabel(rows, preparedRow, "日")), 10) || 0 : 0;
      if (!activityYear) activityYear = preparedYear;
      if (!activityMonth) activityMonth = preparedMonth;
      var preparedOn = preparedYear && preparedMonth && preparedDay
        ? preparedYear + "-" + pad2(preparedMonth) + "-" + pad2(preparedDay)
        : "";
      var schoolName = schoolLabel ? cellText(rightOf(sheet, rows, schoolLabel.r, schoolLabel.c)).replace(/^守口市立/, "") : "";
      var principal = principalLabel ? cellText(rightOf(sheet, rows, principalLabel.r, principalLabel.c)).replace(/^校園長/, "") : "";
      var instructorName = nameLabel ? cellText(rightOf(sheet, rows, nameLabel.r, nameLabel.c)) : "";
      var instructorKana = kanaLabel ? cellText(rightOf(sheet, rows, kanaLabel.r, kanaLabel.c)) : "";
      var instructorId = idLabel ? idText(rightOf(sheet, rows, idLabel.r, idLabel.c)) : "";
      var title = titleLabel ? cellText(rightOf(sheet, rows, titleLabel.r, titleLabel.c)) : "";
      var gradeLabel = findCell(rows, function (text) { return text.indexOf("対象学年") >= 0; }, 20);
      var peopleLabel = findCell(rows, function (text) { return text.indexOf("参加人数") >= 0; }, 20);
      var grade = gradeLabel ? cellText(rightOf(sheet, rows, gradeLabel.r, gradeLabel.c)) : "";
      if (/^\d+$/.test(grade)) grade += "年";
      var participants = peopleLabel ? numberText(rightOf(sheet, rows, peopleLabel.r, peopleLabel.c)) : "";
      var summary = summaryLabel && (!header || summaryLabel.r < header.r) ? plain(rightOf(sheet, rows, summaryLabel.r, summaryLabel.c)) : "";
      var university = universityLabel ? cellText(rightOf(sheet, rows, universityLabel.r, universityLabel.c)) : "";
      var sessions = [];
      var slots = 0;
      var extraFilled = 0;
      var incompleteRows = 0;
      var hiddenRows = 0;
      var weekdayMismatch = 0;
      var sawExample = false;
      var lastCoveredExcelRow = 0;
      if (!header) {
        if (instructorName || instructorId || title) {
          warnings.push(sheetName + "：活動の表の見出しが見つかりません。ひな形と違うため、明細は読み込んでいません。");
        } else {
          skippedBlank = true;
          return;
        }
      } else {
        var headerRow = rows[header.r];
        var dayCol = colExact(headerRow, "日");
        var timeCol = colExact(headerRow, "時間");
        var contentCol = colExact(headerRow, "活動内容");
        var breakCol = -1;
        for (var bc = 0; bc < headerRow.length; bc++) {
          if (cellText(headerRow[bc]).indexOf("休憩") >= 0) breakCol = bc;
        }
        var serialCol = header.c;
        var totalRow = -1;
        for (var tr = header.r + 1; tr < rows.length; tr++) {
          var joined = rows[tr].map(cellText).join("");
          if (joined.indexOf("活動時間数") >= 0 || joined.indexOf("活動回数") >= 0) {
            totalRow = tr;
            break;
          }
        }
        var endRow = totalRow >= 0 ? totalRow : Math.min(rows.length, header.r + 80);
        if (totalRow < 0 && (instructorName || instructorId || title)) {
          warnings.push(sheetName + "：合計の行がありません。明細は表の下まで読みました。");
        }
        for (var sr = header.r + 1; sr < endRow; sr++) {
          var serial = cellText(rows[sr][serialCol]);
          if (serial === "例") {
            sawExample = true;
            continue;
          }
          var numbered = /^\d+$/.test(serial);
          if (numbered) {
            slots += 1;
            lastCoveredExcelRow = sr + rows.baseRow + 1;
          }
          var endCol = timeCol + 2;
          if (timeCol >= 0 && cellText(rows[sr][timeCol + 1]).indexOf("～") < 0 && cellText(rows[sr][timeCol + 1]).indexOf("~") < 0 && clockFromCell(rows[sr][timeCol + 1])) {
            endCol = timeCol + 1;
          }
          var start = timeCol >= 0 ? clockFromCell(rows[sr][timeCol]) : "";
          var end = timeCol >= 0 ? clockFromCell(rows[sr][endCol]) : "";
          var content = contentCol >= 0 ? plain(rows[sr][contentCol]) : "";
          var day = dayCol >= 0 ? dateFromValue(rows[sr][dayCol] && rows[sr][dayCol].v, activityYear, activityMonth) : "";
          var breakMinutes = category === "subject" && breakCol >= 0 ? breakFromCell(rows[sr][breakCol]) : 0;
          var weekdayCol = colExact(headerRow, "曜日");
          var writtenWeekday = weekdayCol >= 0 ? weekdayChar(rows[sr][weekdayCol]) : "";
          if (!day && !start && !end && !content) continue;
          if (!numbered) extraFilled += 1;
          if (!day || !start || !end) incompleteRows += 1;
          if (day && writtenWeekday && weekday(day) && writtenWeekday !== weekday(day)) weekdayMismatch += 1;
          var absRow = sr + rows.baseRow;
          if (sheet["!rows"] && sheet["!rows"][absRow] && sheet["!rows"][absRow].hidden) hiddenRows += 1;
          var session = { date: day, start: start, end: end, breakMinutes: breakMinutes, content: content };
          if (writtenWeekday) session.enteredWeekday = writtenWeekday;
          sessions.push(session);
          lastCoveredExcelRow = sr + rows.baseRow + 1;
        }
        if (!sawExample && (instructorName || instructorId || title || sessions.length)) {
          warnings.push(sheetName + "：記入例の行がありません。ひな形と違う可能性があります。");
        }
        if ((instructorName || instructorId || title || sessions.length) && slots !== expect) {
          warnings.push(sheetName + "：明細はひな形では" + expect + "行です。このシートは" + slots + "行あるので、ひな形から変わっています。入力されている行は読み込みました。");
        }
        if (extraFilled) warnings.push(sheetName + "：番号のない行にも入力があるので、その行も読み込みました。");
        if (hiddenRows) warnings.push(sheetName + "：非表示の行も読み込みました。");
        if (incompleteRows) warnings.push(sheetName + "：日付や時刻が揃っていない行も読み込みました。");
        if (weekdayMismatch) warnings.push(sheetName + "：日付と曜日が違う行が" + weekdayMismatch + "行あります。");
        if (totalRow >= 0 && lastCoveredExcelRow) {
          var formula = "";
          for (var fc = 0; fc < rows[totalRow].length; fc++) {
            if (rows[totalRow][fc] && rows[totalRow][fc].f && /SUM/i.test(rows[totalRow][fc].f)) formula = rows[totalRow][fc].f;
          }
          var sum = /SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/i.exec(formula || "");
          if (sum && lastCoveredExcelRow > Number(sum[2])) {
            warnings.push(sheetName + "：合計の計算が、増やした行まで入っていません。時間は、このシステムで計算し直します。");
          }
        }
      }
      if (!instructorName && !instructorId && !title && !sessions.length) {
        skippedBlank = true;
        return;
      }
      if (!nameLabel) warnings.push(sheetName + "：指導者氏名の欄が見つかりません。");
      if (!idLabel) warnings.push(sheetName + "：登録番号の欄が見つかりません。");
      if (!type) {
        type = "plan";
        warnings.push(sheetName + "：計画か報告かの記載がありません。活用計画として読み込みました。");
      }
      if (!activityYear || !activityMonth) warnings.push(sheetName + "：対象の年月が読み取れませんでした。");
      documents.push({
        type: type,
        category: category,
        year: activityYear || "",
        month: activityMonth || "",
        preparedOn: preparedOn,
        principal: principal,
        instructorId: instructorId,
        instructorKana: instructorKana,
        instructorName: instructorName,
        university: university,
        title: title,
        grade: grade,
        participants: participants,
        summary: summary,
        sessions: sessions,
        schoolName: schoolName,
        sheetName: sheetName
      });
      } catch (err) {
        warnings.push(sheetName + "：このシートは読み込めませんでした。");
      }
    });
    if (skippedBlank) warnings.push("入力のないシートは読み込んでいません。");
    return { documents: documents, warnings: warnings };
  }

  function icsEscape(value) {
    return String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/\r\n|\n|\r/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function icsStamp(date) {
    var d = date || new Date();
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
      pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }

  function icsLocal(date, time) {
    var parts = String(date || "").split("-");
    var clock = String(time || "00:00").split(":");
    return parts[0] + parts[1] + parts[2] + "T" + pad2(Number(clock[0] || 0)) + pad2(Number(clock[1] || 0)) + "00";
  }

  function calendarIcs(events) {
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Moriguchi Jinzai Bank//JA",
      "CALSCALE:GREGORIAN",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Tokyo",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0900",
      "TZOFFSETTO:+0900",
      "TZNAME:JST",
      "END:STANDARD",
      "END:VTIMEZONE"
    ];
    var stamp = icsStamp(new Date());
    (events || []).forEach(function (event) {
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + icsEscape(event.uid));
      lines.push("DTSTAMP:" + stamp);
      lines.push("DTSTART;TZID=Asia/Tokyo:" + icsLocal(event.date, event.start));
      lines.push("DTEND;TZID=Asia/Tokyo:" + icsLocal(event.date, event.end));
      lines.push("SUMMARY:" + icsEscape(event.summary));
      if (event.description) lines.push("DESCRIPTION:" + icsEscape(event.description));
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  function downloadExcel(filename, book) {
    var out = book instanceof Uint8Array ? book : root.XLSX.write(book, { bookType: "xlsx", type: "array" });
    var blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = root.document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    root.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  var HANDOFF_MARK = "moriguchi-jinzai-bank-excel";

  function handoffRoleText(handoff) {
    if (handoff === "report") return "実績報告";
    if (handoff === "plan") return "活用計画";
    if (handoff === "work") return "作業";
    return "";
  }

  function handoffRoleId(value) {
    var text = excelText(value);
    if (text === "実績報告" || text === "report") return "report";
    if (text === "活用計画" || text === "plan") return "plan";
    if (text === "作業" || text === "work") return "work";
    return "";
  }

  function categoryIdFromText(value) {
    var text = excelText(value);
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === text || CATEGORIES[i].label === text || CATEGORIES[i].form === text) return CATEGORIES[i].id;
    }
    return text || "subject";
  }

  function kindIdFromText(value) {
    var text = excelText(value);
    for (var i = 0; i < SCHOOL_KINDS.length; i++) {
      if (SCHOOL_KINDS[i].id === text || SCHOOL_KINDS[i].label === text) return SCHOOL_KINDS[i].id;
    }
    return text;
  }

  function sheetRows(sheet) {
    return root.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  }

  function columnIndex(header, name) {
    for (var i = 0; i < header.length; i++) {
      if (excelText(header[i]) === name) return i;
    }
    return -1;
  }

  function zipStore(files) {
    function u16(n) { return new Uint8Array([n & 255, (n >> 8) & 255]); }
    function u32(n) { return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]); }
    function concat(parts) {
      var len = 0;
      for (var i = 0; i < parts.length; i++) len += parts[i].length;
      var out = new Uint8Array(len);
      var pos = 0;
      for (var j = 0; j < parts.length; j++) {
        out.set(parts[j], pos);
        pos += parts[j].length;
      }
      return out;
    }
    var table = zipStore.table;
    if (!table) {
      table = new Uint32Array(256);
      for (var i = 0; i < 256; i++) {
        var c = i;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      zipStore.table = table;
    }
    function crc32(bytes) {
      var crc = 0xFFFFFFFF;
      for (var n = 0; n < bytes.length; n++) crc = table[(crc ^ bytes[n]) & 255] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    var encoder = new TextEncoder();
    var locals = [];
    var central = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var data = file.data instanceof Uint8Array ? file.data : encoder.encode(file.data);
      var crc = crc32(data);
      var local = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
        name, data
      ]);
      var centralRec = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset),
        name
      ]);
      locals.push(local);
      central.push(centralRec);
      offset += local.length;
    });
    var centralBlob = concat(central);
    var end = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBlob.length), u32(offset), u16(0)
    ]);
    return concat(locals.concat([centralBlob, end]));
  }

  function xmlText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function colLetters(index) {
    var n = index + 1;
    var text = "";
    while (n > 0) {
      var m = (n - 1) % 26;
      text = String.fromCharCode(65 + m) + text;
      n = Math.floor((n - 1) / 26);
    }
    return text;
  }

  function worksheetXml(spec) {
    var rows = {};
    (spec.cells || []).forEach(function (cell) {
      if (!rows[cell.r]) rows[cell.r] = [];
      rows[cell.r].push(cell);
    });
    var rowNumbers = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
    var sheetData = rowNumbers.map(function (r) {
      var height = spec.heights && spec.heights[r] ? ' ht="' + spec.heights[r] + '" customHeight="1"' : "";
      var cells = rows[r].slice().sort(function (a, b) { return a.c - b.c; }).map(function (cell) {
        var ref = colLetters(cell.c) + (cell.r + 1);
        var style = cell.s ? ' s="' + cell.s + '"' : "";
        if (cell.v == null || cell.v === "") return '<c r="' + ref + '"' + style + "/>";
        if (cell.n && typeof cell.v === "number" && isFinite(cell.v)) return '<c r="' + ref + '"' + style + "><v>" + cell.v + "</v></c>";
        return '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlText(cell.v) + "</t></is></c>";
      }).join("");
      return '<row r="' + (r + 1) + '"' + height + ">" + cells + "</row>";
    }).join("");
    var cols = (spec.widths || []).map(function (width, index) {
      return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>';
    }).join("");
    var merges = (spec.merges || []).map(function (merge) {
      return '<mergeCell ref="' + colLetters(merge.c) + (merge.r + 1) + ":" + colLetters(merge.c2) + (merge.r2 + 1) + '"/>';
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
      (cols ? "<cols>" + cols + "</cols>" : "") +
      "<sheetData>" + sheetData + "</sheetData>" +
      (merges ? '<mergeCells count="' + spec.merges.length + '">' + merges + "</mergeCells>" : "") +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/>' +
      "</worksheet>";
  }

  function xlsxStyles() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="3">' +
      '<font><sz val="11"/><name val="Yu Gothic"/></font>' +
      '<font><b/><sz val="18"/><name val="Yu Mincho"/></font>' +
      '<font><b/><sz val="11"/><name val="Yu Gothic"/></font>' +
      "</fonts>" +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF4F1EA"/></patternFill></fill>' +
      "</fills>" +
      '<borders count="2">' +
      "<border><left/><right/><top/><bottom/></border>" +
      '<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border>' +
      "</borders>" +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="9">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      "</cellXfs>" +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>";
  }

  function putCell(spec, r, c, value, style, c2) {
    var end = c2 == null ? c : c2;
    spec.cells.push({ r: r, c: c, v: value, s: style || 0 });
    for (var col = c + 1; col <= end; col++) spec.cells.push({ r: r, c: col, v: "", s: style || 0 });
    if (end > c) spec.merges.push({ r: r, c: c, r2: r, c2: end });
  }

  function tableSheet(name, rows, widths, options) {
    var opts = options || {};
    var dataStyle = opts.dataStyle == null ? 4 : opts.dataStyle;
    var spec = { cells: [], merges: [], widths: widths, heights: {} };
    rows.forEach(function (row, r) {
      row.forEach(function (value, c) {
        spec.cells.push({ r: r, c: c, v: value, s: r === 0 ? 5 : dataStyle, n: !!opts.numeric && r > 0 });
      });
      if (r === 0) spec.heights[r] = 20;
      else if (opts.rowHeight) spec.heights[r] = opts.rowHeight;
    });
    return { name: name, xml: worksheetXml(spec) };
  }

  function clockText(mins) {
    if (mins == null || mins < 0) return "";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return h + ":" + (m < 10 ? "0" : "") + m;
  }

  function formDayText(iso, doc) {
    var parts = partsOf(iso);
    if (!parts) return "";
    if (parts.y !== Number(doc.year) || parts.m !== Number(doc.month)) return iso;
    return String(parts.d);
  }

  function officialSchoolName(name) {
    var text = String(name || "").trim();
    if (!text) return "";
    return text.indexOf("守口市立") === 0 ? text : "守口市立" + text;
  }

  function formSheetName(doc, used) {
    var kind = doc.type === "report" ? "実績報告" : "活用計画";
    var base = (kind + "_" + (doc.title || "活動") + "_" + (doc.instructorName || "指導者")).replace(/[\\\/:\*\?\[\]]/g, "");
    if (!base) base = "帳票";
    var name = base.slice(0, 31);
    var n = 2;
    while (used[name] || name === "受付情報" || name === "提出内容") {
      var suffix = "_" + n;
      name = base.slice(0, 31 - suffix.length) + suffix;
      n += 1;
    }
    used[name] = true;
    return name;
  }

  function formSheet(doc, school) {
    var cat = categoryOf(doc.category);
    var university = doc.category === "university";
    var club = doc.category === "club";
    var showBreak = doc.category === "subject" || doc.category === "kodomo";
    var cols = 7;
    var last = cols - 1;
    var spec = { cells: [], merges: [], widths: showBreak ? [8, 10, 8, 20, 12, 12, 42] : [8, 10, 8, 20, 12, 18, 36], heights: {} };
    var mark = university ? "（大学連携）" : (club ? "（様式２）" : (doc.category === "kodomo" ? "（認定こども園）" : "（様式１）"));
    var formName = university ? "大学連携" : (club ? "部活動活用" : (doc.category === "kodomo" ? "認定こども園づくり" : "教科等活用"));
    var kind = doc.type === "plan" ? "活用計画" : "実績報告";
    var verb = doc.type === "plan" ? "計画します。" : "報告します。";
    var reiwa = Number(doc.year) - 2018;
    var reiwaText = reiwa === 1 ? "元" : (reiwa > 0 ? String(reiwa) : "");
    var principal = doc.principal || school.principal || "";
    var principalText = principal.indexOf("校園長") === 0 ? principal : (principal ? "校園長名　" + principal : "校園長名");
    putCell(spec, 0, 0, mark, 0, 1);
    putCell(spec, 0, 2, formName, 0, 3);
    putCell(spec, 0, 4, warekiFromISO(doc.preparedOn), 2, last);
    putCell(spec, 1, 0, "守口市社会人等指導者人材バンク事業", 0, last);
    putCell(spec, 3, 0, (doc.month || "") + "月　" + kind + "書", 1, last);
    spec.heights[3] = 28;
    putCell(spec, 5, 4, officialSchoolName(school.name), 2, last);
    putCell(spec, 6, 4, principalText, 2, last);
    var row = 8;
    if (university) {
      putCell(spec, row, 0, "大学名", 3);
      putCell(spec, row, 1, doc.university || "", 4, last);
      row += 1;
    }
    putCell(spec, row, 0, "フリガナ", 3);
    putCell(spec, row, 1, doc.instructorKana || "", 4, 3);
    putCell(spec, row, 4, "登録番号", 3);
    putCell(spec, row, 5, doc.instructorId || "", 4, last);
    row += 1;
    putCell(spec, row, 0, "指導者氏名", 3);
    putCell(spec, row, 1, doc.instructorName || "", 4, last);
    row += 1;
    putCell(spec, row, 0, cat.fieldLabel, 3);
    if (cat.hasGrade) {
      putCell(spec, row, 1, doc.title || "", 4);
      putCell(spec, row, 2, "対象学年", 3);
      putCell(spec, row, 3, doc.grade || "", 4);
      putCell(spec, row, 4, "参加人数", 3);
      putCell(spec, row, 5, doc.participants === "" || doc.participants == null ? "" : String(doc.participants) + "人", 4, last);
    } else {
      putCell(spec, row, 1, doc.title || "", 4, last);
    }
    row += 1;
    putCell(spec, row, 0, "活動内容", 3);
    putCell(spec, row, 1, doc.summary || "", 4, last);
    spec.heights[row] = 32;
    row += 1;
    putCell(spec, row, 0, "令和" + reiwaText + "年" + (doc.month || "") + "月の活動内容を下記のとおり" + verb, 0, last);
    row += 2;
    var headers = ["回", "日", "曜日", "時間", "活動時間"];
    if (showBreak) headers.push("休憩時間");
    headers.push("活動内容");
    headers.forEach(function (header, index) {
      if (!showBreak && header === "活動内容") putCell(spec, row, index, header, 5, last);
      else spec.cells.push({ r: row, c: index, v: header, s: 5 });
    });
    spec.heights[row] = 20;
    var headRow = row;
    row += 1;
    var sessions = (doc.sessions || []).filter(function (session) {
      return session && (session.date || session.start || session.end || session.content);
    });
    if (!sessions.length) sessions = [blankSession()];
    sessions.forEach(function (session, index) {
      var mins = sessionMinutes(session);
      var time = (session.start || "") + ((session.start || session.end) ? " ～ " : "") + (session.end || "");
      var values = [
        String(index + 1),
        formDayText(session.date, doc),
        session.date ? weekday(session.date) : "",
        time,
        clockText(mins)
      ];
      if (showBreak) values.push((Number(session.breakMinutes) || 0) + "分");
      values.push(session.content || "");
      values.forEach(function (value, col) {
        if (!showBreak && col === values.length - 1) putCell(spec, row, col, value, 4, last);
        else spec.cells.push({ r: row, c: col, v: value, s: col === values.length - 1 ? 4 : 6 });
      });
      spec.heights[row] = 22;
      row += 1;
    });
    var totalLabel = university ? "活動回数" : "活動時間数";
    var totalValue = university ? String(documentCount(doc)) : clockText(documentMinutes(doc));
    var totalUnit = university ? "回" : "時間";
    putCell(spec, row, 0, totalLabel, 7, 3);
    spec.cells.push({ r: row, c: 4, v: totalValue, s: 6 });
    putCell(spec, row, 5, totalUnit, 4, last);
    spec.heights[row] = 20;
    return { spec: spec, headRow: headRow };
  }

  function workbookBytes(sheets) {
    var encoder = new TextEncoder();
    var overrides = [
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    ];
    var workbookRels = [];
    var workbookSheets = [];
    sheets.forEach(function (sheet, index) {
      var n = index + 1;
      overrides.push('<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
      workbookRels.push('<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>');
      workbookSheets.push('<sheet name="' + xmlText(sheet.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>');
    });
    var styleId = sheets.length + 1;
    workbookRels.push('<Relationship Id="rId' + styleId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>');
    var files = [
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + overrides.join("") + "</Types>" },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookViews><workbookView activeTab="0"/></workbookViews><sheets>' + workbookSheets.join("") + "</sheets></workbook>" },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + workbookRels.join("") + "</Relationships>" },
      { name: "xl/styles.xml", data: xlsxStyles() }
    ];
    sheets.forEach(function (sheet, index) {
      files.push({ name: "xl/worksheets/sheet" + (index + 1) + ".xml", data: sheet.xml });
    });
    return zipStore(files.map(function (file) {
      return { name: file.name, data: typeof file.data === "string" ? encoder.encode(file.data) : file.data };
    }));
  }

  function plainWorkbook(sheetName, rows, widths) {
    return workbookBytes([tableSheet(sheetName, rows, widths, { dataStyle: 8, rowHeight: 18, numeric: true })]);
  }

  function handoffWorkbook(payload) {
    var school = payload.school || {};
    var infoRows = [
      ["項目", "内容"],
      ["形式", HANDOFF_MARK],
      ["役割", handoffRoleText(payload.handoff)],
      ["学校名", school.name || ""],
      ["学校番号", schoolCodeOf(school) || schoolCodeOf(knownSchool(school.name)) || ""],
      ["種別", kindLabel(school.kind) || school.kind || ""],
      ["校園長名", school.principal || ""],
      ["保存日時", payload.savedAt || ""],
      ["対象年月", payload.period || ""]
    ];
    var header = ["書類番号", "種類", "年", "月", "登録番号", "指導者氏名", "ふりがな", "区分", "活動名", "学年", "参加人数", "大学名", "校園長名", "作成日", "概要", "日", "開始", "終了", "休憩（分）", "その回の内容", "曜日"];
    var rows = [header];
    (payload.documents || []).forEach(function (doc) {
      var cat = categoryOf(doc.category);
      var sessions = (doc.sessions || []).filter(function (session) {
        return session && (session.date || session.start || session.end || session.content);
      });
      if (!sessions.length) sessions = [blankSession()];
      sessions.forEach(function (session) {
        rows.push([
          doc.id || "",
          doc.type === "report" ? "実績報告" : "活用計画",
          Number(doc.year) || "",
          Number(doc.month) || "",
          doc.instructorId || "",
          doc.instructorName || "",
          doc.instructorKana || "",
          cat.label,
          doc.title || "",
          doc.grade || "",
          doc.participants === "" || doc.participants == null ? "" : doc.participants,
          doc.university || "",
          doc.principal || school.principal || "",
          doc.preparedOn || "",
          doc.summary || "",
          session.date || "",
          session.start || "",
          session.end || "",
          Number(session.breakMinutes) || 0,
          session.content || "",
          session.enteredWeekday || ""
        ]);
      });
    });
    var sheets = [
      tableSheet("受付情報", infoRows, [14, 42]),
      tableSheet("提出内容", rows, [12, 12, 8, 6, 12, 16, 16, 28, 22, 10, 10, 18, 14, 14, 28, 14, 10, 10, 12, 36, 8], { dataStyle: 8, rowHeight: 18 })
    ];
    return workbookBytes(sheets);
  }

  function handoffFromExcel(data) {
    if (!root.XLSX) return { error: "Excelを読み込む準備ができていません。" };
    var book;
    try { book = root.XLSX.read(data, { type: "array", cellDates: false }); }
    catch (err) { return { error: "Excelを読み取れませんでした。" }; }
    var infoSheet = book.Sheets["受付情報"];
    var bodySheet = book.Sheets["提出内容"];
    if (!infoSheet || !bodySheet) return { error: "このExcelは受け渡し用ではありません。計画・報告を書き出したファイルを選んでください。" };
    var info = {};
    sheetRows(infoSheet).forEach(function (row) {
      var key = excelText(row[0]);
      if (key && key !== "項目") info[key] = row[1];
    });
    if (excelText(info["形式"]) && excelText(info["形式"]) !== HANDOFF_MARK) {
      return { error: "このExcelは受け渡し用ではありません。計画・報告を書き出したファイルを選んでください。" };
    }
    var table = sheetRows(bodySheet);
    var header = table[0] || [];
    if (excelText(header[0]) !== "書類番号") return { error: "提出内容の見出しがありません。" };
    function at(row, name) {
      var index = columnIndex(header, name);
      return index >= 0 ? row[index] : "";
    }
    var savedAt = excelText(info["保存日時"]);
    var documents = [];
    var groups = {};
    for (var r = 1; r < table.length; r++) {
      var line = table[r] || [];
      var type = handoffRoleId(at(line, "種類"));
      if (type !== "plan" && type !== "report") continue;
      var year = Number(excelText(at(line, "年")));
      var month = Number(excelText(at(line, "月")));
      var docId = excelText(at(line, "書類番号"));
      var instructorId = excelText(at(line, "登録番号"));
      var title = excelText(at(line, "活動名"));
      var key = docId || [type, year, month, instructorId || excelText(at(line, "指導者氏名")), title].join("|");
      if (!groups[key]) {
        var participants = at(line, "参加人数");
        groups[key] = {
          id: docId || uid(),
          type: type,
          category: categoryIdFromText(at(line, "区分")),
          year: year,
          month: month,
          preparedOn: dateFromValue(at(line, "作成日"), year, month),
          principal: excelText(at(line, "校園長名")) || excelText(info["校園長名"]),
          instructorId: instructorId,
          instructorKana: excelText(at(line, "ふりがな")),
          instructorName: excelText(at(line, "指導者氏名")),
          university: excelText(at(line, "大学名")),
          title: title,
          grade: excelText(at(line, "学年")),
          participants: participants === "" || participants == null ? "" : Number(participants),
          summary: excelText(at(line, "概要")),
          sessions: [],
          updatedAt: savedAt
        };
        documents.push(groups[key]);
      }
      var date = dateFromValue(at(line, "日"), year, month);
      var start = clockFromCell({ v: at(line, "開始") });
      var end = clockFromCell({ v: at(line, "終了") });
      var content = excelText(at(line, "その回の内容"));
      var written = excelText(at(line, "曜日")).replace(/曜日$/, "");
      if (!date && !start && !end && !content) continue;
      var session = {
        date: date,
        start: start,
        end: end,
        breakMinutes: breakFromCell({ v: at(line, "休憩（分）") }),
        content: content
      };
      if (/^[日月火水木金土]$/.test(written)) session.enteredWeekday = written;
      groups[key].sessions.push(session);
    }
    documents.forEach(function (doc) {
      if (!doc.sessions.length) doc.sessions = [blankSession()];
    });
    if (!documents.length) return { error: "このExcelには計画・報告が入っていません。" };
    return {
      schema: SCHEMA_WORK,
      version: 1,
      handoff: handoffRoleId(info["役割"]),
      savedAt: savedAt,
      period: excelText(info["対象年月"]),
      school: {
        name: excelText(info["学校名"]),
        code: schoolCodeOf({ code: info["学校番号"] }) || "",
        kind: kindIdFromText(info["種別"]),
        principal: excelText(info["校園長名"])
      },
      documents: documents
    };
  }

  function payloadFromFile(name, buffer) {
    if (/\.xlsx?$/i.test(name) || /\.xls$/i.test(name)) return handoffFromExcel(buffer);
    try {
      return JSON.parse(new TextDecoder("utf-8").decode(buffer));
    } catch (err) {
      return { error: "ファイルとして読めませんでした。" };
    }
  }

  function activityKey(doc) {
    var who = String(doc.instructorId || "").trim() || String(doc.instructorName || "").trim();
    return [
      doc.schoolName || "",
      doc.type || "",
      Number(doc.year),
      Number(doc.month),
      who,
      doc.category || "",
      String(doc.title || "").trim()
    ].join("|");
  }

  function reconcileRows(docs) {
    var map = {};
    (docs || []).forEach(function (d) {
      var key = [d.schoolName || "", d.instructorId || "", d.category || "", d.title || ""].join("|");
      if (!map[key]) map[key] = { school: d.schoolName || "", id: d.instructorId || "", name: d.instructorName || "", title: d.title || "", category: d.category, plan: null, report: null };
      if (d.type === "plan" || d.type === "report") map[key][d.type] = d;
    });
    return Object.keys(map).map(function (key) {
      var item = map[key];
      var planMin = item.plan ? documentMinutes(item.plan) : null;
      var reportMin = item.report ? documentMinutes(item.report) : null;
      var planDates = item.plan ? usableSessions(item.plan).map(function (s) { return s.date; }).sort().join(",") : "";
      var reportDates = item.report ? usableSessions(item.report).map(function (s) { return s.date; }).sort().join(",") : "";
      var status = "一致";
      if (item.plan && !item.report) status = "報告がない";
      else if (!item.plan && item.report) status = "計画がない";
      else if (planMin !== reportMin) status = "時間差";
      else if (planDates !== reportDates) status = "日にちが違う";
      return {
        school: item.school,
        id: item.id,
        name: item.name,
        title: item.title,
        category: categoryOf(item.category).label,
        planMin: planMin,
        reportMin: reportMin,
        status: status
      };
    }).sort(function (a, b) {
      return String(a.school).localeCompare(String(b.school), "ja") || String(a.name).localeCompare(String(b.name), "ja") || String(a.title).localeCompare(String(b.title), "ja");
    });
  }

  function submissionPlace(relativePath) {
    var parts = String(relativePath || "").split(/[/\\]/).filter(Boolean);
    var fileName = parts.length ? parts[parts.length - 1] : "";
    var parents = parts.slice(0, -1);
    return {
      monthFolder: parents.length >= 2 ? parents[parents.length - 2] : "",
      schoolFolder: parents.length >= 1 ? parents[parents.length - 1] : "",
      fileName: fileName,
      relative: parts.join("/")
    };
  }

  root.Jinzai = {
    SCHEMA_SUBMISSION: SCHEMA_SUBMISSION,
    SCHEMA_ROSTER: SCHEMA_ROSTER,
    SCHEMA_BACKUP: SCHEMA_BACKUP,
    SCHEMA_WORK: SCHEMA_WORK,
    SCHEMA_STATE: SCHEMA_STATE,
    CATEGORIES: CATEGORIES,
    EXPERTISE: EXPERTISE,
    SCHOOL_KINDS: SCHOOL_KINDS,
    WEEKDAYS: WEEKDAYS,
    categoryOf: categoryOf,
    kindLabel: kindLabel,
    defaultSettings: defaultSettings,
    defaultSchools: defaultSchools,
    schoolCodeOf: schoolCodeOf,
    plainSchoolName: plainSchoolName,
    findSchool: findSchool,
    knownSchool: knownSchool,
    sortSchools: sortSchools,
    alignSchools: alignSchools,
    uid: uid,
    esc: esc,
    pad2: pad2,
    todayISO: todayISO,
    isoFromDate: isoFromDate,
    wareki: wareki,
    warekiFromISO: warekiFromISO,
    weekday: weekday,
    planDueISO: planDueISO,
    reportDueISO: reportDueISO,
    payDueISO: payDueISO,
    registrationEnd: registrationEnd,
    minutesBetween: minutesBetween,
    sessionMinutes: sessionMinutes,
    requiredBreakMinutes: requiredBreakMinutes,
    breakShortfalls: breakShortfalls,
    formatMinutes: formatMinutes,
    yen: yen,
    colorFor: colorFor,
    colorWash: colorWash,
    calcWithholding: calcWithholding,
    usableSessions: usableSessions,
    documentMinutes: documentMinutes,
    documentCount: documentCount,
    activityKey: activityKey,
    reconcileRows: reconcileRows,
    submissionPlace: submissionPlace,
    calcPersonPay: calcPersonPay,
    blankSession: blankSession,
    validateDocument: validateDocument,
    documentBlockers: documentBlockers,
    sessionsFromExcel: sessionsFromExcel,
    formsFromExcel: formsFromExcel,
    sessionsWorkbook: sessionsWorkbook,
    calendarIcs: calendarIcs,
    download: download,
    downloadExcel: downloadExcel,
    plainWorkbook: plainWorkbook,
    handoffWorkbook: handoffWorkbook,
    handoffFromExcel: handoffFromExcel,
    payloadFromFile: payloadFromFile,
    loadStore: loadStore,
    saveStore: saveStore,
    downloadJson: downloadJson,
    downloadCsv: downloadCsv,
    monthKey: monthKey,
    workMonth: workMonth,
    sampleCenterData: sampleCenterData
  };
})(typeof window !== "undefined" ? window : globalThis);
