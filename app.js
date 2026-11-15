"use strict";

const STORAGE_KEY = "xiaoye.notes.v1";
const COLOR_ORDER = ["paper", "mint", "oat", "rose", "blue"];
const NOTE_COLORS = new Set(COLOR_ORDER);
const FILTERS = new Set(["all", "pinned"]);

const elements = {
  appShell: document.querySelector("#appShell"),
  homeView: document.querySelector("#homeView"),
  editorView: document.querySelector("#editorView"),
  homeMain: document.querySelector("#homeMain"),
  todayLabel: document.querySelector("#todayLabel"),
  searchInput: document.querySelector("#searchInput"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  noteList: document.querySelector("#noteList"),
  noteCount: document.querySelector("#noteCount"),
  listTitle: document.querySelector("#listTitle"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyCopy: document.querySelector("#emptyCopy"),
  emptyNewButton: document.querySelector("#emptyNewButton"),
  newNoteButton: document.querySelector("#newNoteButton"),
  homeMenuButton: document.querySelector("#homeMenuButton"),
  noteMenuButton: document.querySelector("#noteMenuButton"),
  backButton: document.querySelector("#backButton"),
  saveStatus: document.querySelector("#saveStatus"),
  noteTitle: document.querySelector("#noteTitle"),
  noteContent: document.querySelector("#noteContent"),
  pinButton: document.querySelector("#pinButton"),
  shareNoteButton: document.querySelector("#shareNoteButton"),
  actionSheet: document.querySelector("#actionSheet"),
  sheetTitle: document.querySelector("#sheetTitle"),
  sheetActions: document.querySelector("#sheetActions"),
  toast: document.querySelector("#toast"),
  toastMessage: document.querySelector("#toastMessage"),
  toastAction: document.querySelector("#toastAction"),
};

let notes = loadNotes();
let currentFilter = "all";
let activeNoteId = null;
let saveTimer = 0;
let toastTimer = 0;
let lastDeletedNote = null;
let sheetMode = "home";
let installPrompt = null;

const nativeBridge = window.AndroidNotepad;

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seedNotes() {
  const now = Date.now();
  return [
    {
      id: makeId(),
      title: "欢迎使用小页",
      content: "这里是你的离线记事本。\n\n点右下角的“新笔记”开始写，内容会自动保存。长内容、待办清单和随手想法都可以放进来。\n\n你可以置顶重要页面，也可以给每篇笔记换一种纸色。",
      pinned: true,
      color: "mint",
      createdAt: now - 1000 * 60 * 40,
      updatedAt: now - 1000 * 60 * 18,
    },
    {
      id: makeId(),
      title: "买点东西",
      content: "牛奶\n鸡蛋\n咖啡豆\n洗衣液",
      pinned: false,
      color: "oat",
      createdAt: now - 1000 * 60 * 60 * 4,
      updatedAt: now - 1000 * 60 * 37,
    },
    {
      id: makeId(),
      title: "下次想做的事",
      content: "去附近没走过的那条路散步。\n找一部老电影，晚上关掉弹幕看完。",
      pinned: false,
      color: "blue",
      createdAt: now - 1000 * 60 * 60 * 24,
      updatedAt: now - 1000 * 60 * 60 * 5,
    },
  ];
}

function sanitizeNote(note) {
  if (!note || typeof note !== "object") return null;
  const createdAt = Number(note.createdAt);
  const updatedAt = Number(note.updatedAt);
  return {
    id: typeof note.id === "string" && note.id ? note.id : makeId(),
    title: typeof note.title === "string" ? note.title.slice(0, 100) : "",
    content: typeof note.content === "string" ? note.content.slice(0, 100000) : "",
    pinned: Boolean(note.pinned),
    color: NOTE_COLORS.has(note.color) ? note.color : "paper",
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

function loadNotes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const seeded = seedNotes();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error("invalid note data");
    return parsed.map(sanitizeNote).filter(Boolean);
  } catch (error) {
    console.error(error);
    return seedNotes();
  }
}

function persistNotes() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch (error) {
    console.error(error);
    showToast("保存失败，请检查浏览器的存储权限");
    return false;
  }
}

function updateTodayLabel() {
  const now = new Date();
  const text = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  elements.todayLabel.textContent = text;
}

function formatRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = now.getTime() - date.getTime();
  const sameDay = now.toDateString() === date.toDateString();

  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (sameDay) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString()) return "昨天";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function getDisplayTitle(note) {
  return note.title.trim() || "无标题笔记";
}

function getPreview(note) {
  const text = note.content.replace(/\s+/g, " ").trim();
  return text || "还没有正文";
}

function extractTags(note) {
  const matches = `${note.title} ${note.content}`.match(/#[\p{L}\p{N}_-]+/gu) || [];
  return [...new Set(matches)].slice(0, 3);
}

function visibleNotes() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase("zh-CN");
  return notes
    .filter((note) => currentFilter !== "pinned" || note.pinned)
    .filter((note) => {
      if (!query) return true;
      return `${note.title}\n${note.content}`.toLocaleLowerCase("zh-CN").includes(query);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
}

function createNoteCard(note) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = `note-card note-card--${note.color}`;
  card.dataset.noteId = note.id;
  card.setAttribute("aria-label", `打开笔记：${getDisplayTitle(note)}`);

  const titleRow = document.createElement("span");
  titleRow.className = "note-card-title-row";

  const title = document.createElement("h3");
  title.textContent = getDisplayTitle(note);
  titleRow.append(title);

  if (note.pinned) {
    const pin = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    pin.setAttribute("class", "note-pin");
    pin.setAttribute("aria-label", "已置顶");
    pin.innerHTML = '<use href="#icon-pin"></use>';
    titleRow.append(pin);
  }

  const preview = document.createElement("span");
  preview.className = "note-preview";
  preview.textContent = getPreview(note);

  const footer = document.createElement("span");
  footer.className = "note-card-footer";

  const time = document.createElement("time");
  time.dateTime = new Date(note.updatedAt).toISOString();
  time.textContent = formatRelativeTime(note.updatedAt);

  const tags = document.createElement("span");
  tags.className = "note-card-tags";
  tags.textContent = extractTags(note).join(" ");

  footer.append(time, tags);
  card.append(titleRow, preview, footer);
  return card;
}

function renderNotes() {
  const visible = visibleNotes();
  const hasQuery = Boolean(elements.searchInput.value.trim());

  elements.noteList.replaceChildren(...visible.map(createNoteCard));
  elements.noteCount.textContent = `${visible.length} 条`;
  elements.clearSearchButton.hidden = !hasQuery;
  elements.listTitle.textContent = hasQuery ? "搜索结果" : currentFilter === "pinned" ? "置顶笔记" : "最近笔记";

  const isEmpty = visible.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.noteList.hidden = isEmpty;

  if (!isEmpty) return;

  if (hasQuery) {
    elements.emptyTitle.textContent = "没有找到相关笔记";
    elements.emptyCopy.textContent = "换个关键词试试，或者清除搜索。";
    elements.emptyNewButton.hidden = true;
  } else if (currentFilter === "pinned") {
    elements.emptyTitle.textContent = "还没有置顶笔记";
    elements.emptyCopy.textContent = "打开一篇笔记，点底部的置顶就可以把它放在最前面。";
    elements.emptyNewButton.hidden = true;
  } else {
    elements.emptyTitle.textContent = "这里还没有笔记";
    elements.emptyCopy.textContent = "把刚想到的、要做到的，先写下来。";
    elements.emptyNewButton.hidden = false;
  }
}

function setFilter(filter) {
  currentFilter = FILTERS.has(filter) ? filter : "all";
  document.querySelectorAll(".filter-chip").forEach((button) => {
    const selected = button.dataset.filter === currentFilter;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderNotes();
}

function nextNoteColor() {
  const count = notes.length % COLOR_ORDER.length;
  return COLOR_ORDER[count];
}

function createNote() {
  const now = Date.now();
  const note = {
    id: makeId(),
    title: "",
    content: "",
    pinned: false,
    color: nextNoteColor(),
    createdAt: now,
    updatedAt: now,
  };
  notes.unshift(note);
  persistNotes();
  openEditor(note.id);
}

function getActiveNote() {
  return notes.find((note) => note.id === activeNoteId) || null;
}

function openEditor(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) return;

  activeNoteId = noteId;
  elements.noteTitle.value = note.title;
  elements.noteContent.value = note.content;
  elements.saveStatus.textContent = "已保存";
  elements.pinButton.setAttribute("aria-pressed", String(note.pinned));
  elements.pinButton.querySelector("span").textContent = note.pinned ? "已置顶" : "置顶";

  document.querySelectorAll(".color-dot").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.color === note.color));
  });

  elements.appShell.classList.add("is-editing");
  elements.homeView.inert = true;
  elements.editorView.inert = false;
  elements.editorView.setAttribute("aria-hidden", "false");
  window.setTimeout(() => elements.noteTitle.focus({ preventScroll: true }), 240);
}

function saveActiveNote({ immediate = false } = {}) {
  const note = getActiveNote();
  if (!note) return;
  window.clearTimeout(saveTimer);

  if (immediate) {
    commitEditorValues(note);
    return;
  }

  elements.saveStatus.textContent = "正在保存…";
  saveTimer = window.setTimeout(() => commitEditorValues(note), 360);
}

function commitEditorValues(note) {
  const title = elements.noteTitle.value;
  const content = elements.noteContent.value;
  const changed = note.title !== title || note.content !== content;

  if (changed) {
    note.title = title;
    note.content = content;
    note.updatedAt = Date.now();
    persistNotes();
  }

  elements.saveStatus.textContent = "已保存";
}

function closeEditor({ deleteIfEmpty = true } = {}) {
  const note = getActiveNote();
  if (!note) return;

  window.clearTimeout(saveTimer);
  commitEditorValues(note);

  if (deleteIfEmpty && !note.title.trim() && !note.content.trim()) {
    notes = notes.filter((item) => item.id !== note.id);
    persistNotes();
  }

  activeNoteId = null;
  elements.appShell.classList.remove("is-editing");
  elements.homeView.inert = false;
  elements.editorView.inert = true;
  elements.editorView.setAttribute("aria-hidden", "true");
  renderNotes();
  window.setTimeout(() => (elements.searchInput.value ? elements.clearSearchButton : elements.newNoteButton).focus({ preventScroll: true }), 240);
}

function togglePin() {
  const note = getActiveNote();
  if (!note) return;

  note.pinned = !note.pinned;
  note.updatedAt = Date.now();
  elements.pinButton.setAttribute("aria-pressed", String(note.pinned));
  elements.pinButton.querySelector("span").textContent = note.pinned ? "已置顶" : "置顶";
  persistNotes();
}

function selectColor(color) {
  const note = getActiveNote();
  if (!note || !NOTE_COLORS.has(color)) return;

  note.color = color;
  note.updatedAt = Date.now();
  document.querySelectorAll(".color-dot").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.color === color));
  });
  persistNotes();
}

function noteAsMarkdown(note) {
  const title = getDisplayTitle(note);
  return `# ${title}\n\n${note.content}\n`;
}

async function shareNote() {
  const note = getActiveNote();
  if (!note) return;
  saveActiveNote({ immediate: true });

  const title = getDisplayTitle(note);
  const text = noteAsMarkdown(note);

  try {
    if (nativeBridge && typeof nativeBridge.shareText === "function") {
      nativeBridge.shareText(title, text);
      return;
    }
    if (navigator.share) {
      await navigator.share({ title, text });
      return;
    }
    downloadText(`${safeFilename(title)}.md`, text, "text/markdown");
    showToast("Markdown 文件已生成");
  } catch (error) {
    if (error && error.name === "AbortError") return;
    console.error(error);
    showToast("这篇笔记暂时无法分享");
  }
}

function safeFilename(value) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 60) || "小页笔记";
}

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupNotes() {
  const payload = {
    app: "小页",
    version: 1,
    exportedAt: new Date().toISOString(),
    notes,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  downloadText(`小页备份-${stamp}.json`, JSON.stringify(payload, null, 2));
  closeSheet();
  showToast("备份文件已生成");
}

function deleteActiveNote() {
  const note = getActiveNote();
  if (!note) return;

  lastDeletedNote = { note: { ...note }, index: notes.findIndex((item) => item.id === note.id) };
  closeSheet();
  closeEditor({ deleteIfEmpty: false });
  notes = notes.filter((item) => item.id !== note.id);
  persistNotes();
  renderNotes();
  showToast("笔记已删除", {
    label: "撤销",
    onClick: () => {
      if (!lastDeletedNote) return;
      notes.splice(Math.max(0, lastDeletedNote.index), 0, lastDeletedNote.note);
      persistNotes();
      renderNotes();
      lastDeletedNote = null;
      hideToast();
    },
  });
}

function showToast(message, action) {
  window.clearTimeout(toastTimer);
  elements.toastMessage.textContent = message;
  elements.toast.hidden = false;
  elements.toastAction.hidden = !action;
  elements.toastAction.onclick = action ? action.onClick : null;
  elements.toastAction.textContent = action ? action.label : "";

  toastTimer = window.setTimeout(() => hideToast(), action ? 6000 : 3200);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  elements.toast.hidden = true;
  elements.toastAction.onclick = null;
}

function sheetButton({ action, icon, label, danger = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `sheet-action${danger ? " sheet-action--danger" : ""}`;
  button.dataset.action = action;
  button.innerHTML = `<svg aria-hidden="true"><use href="#icon-${icon}"></use></svg><span></span>`;
  button.querySelector("span").textContent = label;
  return button;
}

function openSheet(mode) {
  sheetMode = mode;
  elements.sheetActions.replaceChildren();

  if (mode === "note") {
    elements.sheetTitle.textContent = "笔记选项";
    elements.sheetActions.append(
      sheetButton({ action: "export", icon: "download", label: "导出这篇笔记" }),
      sheetButton({ action: "delete", icon: "trash", label: "删除笔记", danger: true }),
    );
  } else {
    elements.sheetTitle.textContent = "小页选项";
    const actions = [sheetButton({ action: "backup", icon: "download", label: "备份全部笔记" })];
    if (!nativeBridge) {
      actions.push(sheetButton({ action: "install", icon: "smartphone", label: "添加到手机主屏幕" }));
    }
    elements.sheetActions.append(...actions);
  }

  elements.actionSheet.hidden = false;
  requestAnimationFrame(() => {
    const sheet = elements.actionSheet.querySelector(".bottom-sheet");
    sheet.focus({ preventScroll: true });
    const firstAction = sheet.querySelector(".sheet-action");
    if (firstAction) firstAction.focus({ preventScroll: true });
  });
}

function closeSheet() {
  elements.actionSheet.hidden = true;
  if (sheetMode === "note" && activeNoteId) {
    elements.noteMenuButton.focus({ preventScroll: true });
  } else {
    elements.homeMenuButton.focus({ preventScroll: true });
  }
}

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    closeSheet();
    return;
  }

  closeSheet();
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(isIOS ? "点 Safari 的分享按钮，再选“添加到主屏幕”" : "打开浏览器菜单，选择“安装应用”或“添加到主屏幕”");
}

function handleSheetAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  switch (button.dataset.action) {
    case "export":
      closeSheet();
      shareNote();
      break;
    case "delete":
      deleteActiveNote();
      break;
    case "backup":
      backupNotes();
      break;
    case "install":
      installApp();
      break;
  }
}

function setSearch(value) {
  elements.searchInput.value = value;
  renderNotes();
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    if (!elements.actionSheet.hidden) {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (elements.appShell.classList.contains("is-editing")) {
      event.preventDefault();
      closeEditor();
    }
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    closeEditor();
    elements.searchInput.focus();
  }
}

window.handleNativeBack = () => {
  if (!elements.actionSheet.hidden) {
    closeSheet();
    return true;
  }
  if (elements.appShell.classList.contains("is-editing")) {
    closeEditor();
    return true;
  }
  return false;
};

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service worker unavailable", error));
  });
}

elements.noteList.addEventListener("click", (event) => {
  const card = event.target.closest(".note-card");
  if (card) openEditor(card.dataset.noteId);
});

elements.newNoteButton.addEventListener("click", createNote);
elements.emptyNewButton.addEventListener("click", createNote);
elements.backButton.addEventListener("click", () => closeEditor());
elements.noteMenuButton.addEventListener("click", () => openSheet("note"));
elements.homeMenuButton.addEventListener("click", () => openSheet("home"));
elements.pinButton.addEventListener("click", togglePin);
elements.shareNoteButton.addEventListener("click", shareNote);
elements.noteTitle.addEventListener("input", () => saveActiveNote());
elements.noteContent.addEventListener("input", () => saveActiveNote());
elements.noteTitle.addEventListener("blur", () => saveActiveNote({ immediate: true }));
elements.noteContent.addEventListener("blur", () => saveActiveNote({ immediate: true }));
elements.searchInput.addEventListener("input", renderNotes);
elements.clearSearchButton.addEventListener("click", () => {
  setSearch("");
  elements.searchInput.focus();
});

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

document.querySelectorAll(".color-dot").forEach((button) => {
  button.addEventListener("click", () => selectColor(button.dataset.color));
});

elements.sheetActions.addEventListener("click", handleSheetAction);
elements.actionSheet.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-sheet]")) closeSheet();
});

document.addEventListener("keydown", handleGlobalKeydown);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveActiveNote({ immediate: true });
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("online", () => {
  if (getActiveNote()) elements.saveStatus.textContent = "已保存";
});

window.addEventListener("offline", () => {
  if (getActiveNote()) elements.saveStatus.textContent = "离线也能继续写";
});

updateTodayLabel();
renderNotes();
registerServiceWorker();

if (!navigator.onLine && nativeBridge) {
  elements.saveStatus.textContent = "离线也能继续写";
}
