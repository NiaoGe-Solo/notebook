"use strict";

const STORAGE_KEY = "xiaoye.notes.v1";
const THEME_KEY = "xiaoye.theme.v1";
const COLOR_ORDER = ["paper", "mint", "oat", "rose", "blue"];
const NOTE_COLORS = new Set(COLOR_ORDER);
const FILTERS = new Set(["all", "pinned"]);
const THEMES = new Set(["editorial", "recorder", "native"]);
const THEME_COPY = {
  editorial: {
    brand: "页间",
    hero: "把今天，写得慢一点。",
    sub: "图片、声音，都放进同一页。",
  },
  recorder: {
    brand: "声页",
    hero: "先说。再整理。",
    sub: "录音、图片、文字，一次留下。",
  },
  native: {
    brand: "记事本",
    hero: "想到什么，就留下什么。",
    sub: "写、拍、录，都在这里。",
  },
};

const nativeBridge = window.AndroidNotepad;

function importLegacyNativeData() {
  if (!nativeBridge || typeof nativeBridge.getLegacyData !== "function") return;
  try {
    const legacyNotes = nativeBridge.getLegacyData() || "";
    const legacyTheme = nativeBridge.getLegacyTheme?.() || "";
    if (legacyNotes && !localStorage.getItem(STORAGE_KEY)) {
      const parsed = JSON.parse(legacyNotes);
      if (Array.isArray(parsed)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
    }
    if (legacyTheme && THEMES.has(legacyTheme) && !localStorage.getItem(THEME_KEY)) {
      localStorage.setItem(THEME_KEY, legacyTheme);
    }
    nativeBridge.clearLegacyData?.();
  } catch (error) {
    console.error("Legacy data migration failed", error);
  }
}

importLegacyNativeData();

const elements = {
  appShell: document.querySelector("#appShell"),
  homeView: document.querySelector("#homeView"),
  editorView: document.querySelector("#editorView"),
  homeMain: document.querySelector("#homeMain"),
  todayLabel: document.querySelector("#todayLabel"),
  appTitle: document.querySelector("#appTitle"),
  heroMain: document.querySelector("#heroMain"),
  heroSub: document.querySelector("#heroSub"),
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
  themeButton: document.querySelector("#themeButton"),
  noteMenuButton: document.querySelector("#noteMenuButton"),
  backButton: document.querySelector("#backButton"),
  saveStatus: document.querySelector("#saveStatus"),
  noteTitle: document.querySelector("#noteTitle"),
  noteContent: document.querySelector("#noteContent"),
  pinButton: document.querySelector("#pinButton"),
  imageButton: document.querySelector("#imageButton"),
  imageInput: document.querySelector("#imageInput"),
  recordButton: document.querySelector("#recordButton"),
  shareNoteButton: document.querySelector("#shareNoteButton"),
  attachmentSection: document.querySelector("#attachmentSection"),
  attachmentList: document.querySelector("#attachmentList"),
  attachmentCount: document.querySelector("#attachmentCount"),
  actionSheet: document.querySelector("#actionSheet"),
  sheetTitle: document.querySelector("#sheetTitle"),
  themePicker: document.querySelector("#themePicker"),
  sheetActions: document.querySelector("#sheetActions"),
  recordLayer: document.querySelector("#recordLayer"),
  recordState: document.querySelector("#recordState"),
  recordTimer: document.querySelector("#recordTimer"),
  recordHint: document.querySelector("#recordHint"),
  recordToggleButton: document.querySelector("#recordToggleButton"),
  liveWave: document.querySelector("#liveWave"),
  imageViewer: document.querySelector("#imageViewer"),
  imageViewerImage: document.querySelector("#imageViewerImage"),
  imageViewerCaption: document.querySelector("#imageViewerCaption"),
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
let currentTheme = THEMES.has(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) : "editorial";
let currentMediaBlobs = [];
let mediaObjectUrls = [];
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];
let recordingStartedAt = 0;
let recordingTimerId = 0;
let recordingAudioContext = null;
let recordingAnalyser = null;
let recordingAnimationId = 0;
let lastDeletedMediaIds = [];
let attachmentDeleteTimer = 0;
let deletedNoteCleanupTimer = 0;

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
    media: Array.isArray(note.media)
      ? note.media
          .filter((item) => item && typeof item.id === "string")
          .slice(0, 12)
          .map((item) => ({
            id: item.id,
            kind: item.kind === "audio" ? "audio" : "image",
            name: typeof item.name === "string" ? item.name.slice(0, 120) : "",
            mime: typeof item.mime === "string" ? item.mime : "",
            duration: Number(item.duration) || 0,
            waveform: Array.isArray(item.waveform) ? item.waveform.slice(0, 36) : [],
            createdAt: Number(item.createdAt) || Date.now(),
          }))
      : [],
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

function loadNotes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const seeded = seedNotes().map(sanitizeNote);
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

function applyTheme(theme, { persist = true } = {}) {
  currentTheme = THEMES.has(theme) ? theme : "editorial";
  document.documentElement.dataset.theme = currentTheme;
  const copy = THEME_COPY[currentTheme];
  elements.appTitle.textContent = copy.brand;
  elements.heroMain.textContent = copy.hero;
  elements.heroSub.textContent = copy.sub;
  if (nativeBridge && typeof nativeBridge.setTheme === "function") {
    nativeBridge.setTheme(currentTheme);
  }

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === currentTheme));
  });

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, currentTheme);
    } catch (error) {
      console.warn("Unable to persist theme", error);
    }
  }

  requestAnimationFrame(() => {
    const surface = getComputedStyle(document.documentElement).getPropertyValue("--color-surface").trim();
    if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", surface);
    renderNotes();
    if (activeNoteId) renderAttachments();
  });
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

function mediaSummary(note) {
  const media = Array.isArray(note.media) ? note.media : [];
  const images = media.filter((item) => item.kind === "image").length;
  const audio = media.filter((item) => item.kind === "audio");
  const parts = [];
  if (images) parts.push(`${images} 张图片`);
  if (audio.length) {
    const totalDuration = audio.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
    parts.push(`录音 ${window.XiaoyeMedia.formatDuration(totalDuration)}`);
  }
  return parts.join(" · ");
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

  const summary = mediaSummary(note);
  let mediaLine = null;
  if (summary) {
    mediaLine = document.createElement("span");
    mediaLine.className = "note-media-summary";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<use href="#icon-${(note.media || []).some((item) => item.kind === "audio") ? "mic" : "image"}"></use>`;
    const label = document.createElement("span");
    label.textContent = summary;
    mediaLine.append(icon, label);
  }

  const footer = document.createElement("span");
  footer.className = "note-card-footer";

  const time = document.createElement("time");
  time.dateTime = new Date(note.updatedAt).toISOString();
  time.textContent = formatRelativeTime(note.updatedAt);

  const tags = document.createElement("span");
  tags.className = "note-card-tags";
  tags.textContent = extractTags(note).join(" ");

  footer.append(time, tags);
  card.append(titleRow, preview);
  if (mediaLine) card.append(mediaLine);
  card.append(footer);
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
    media: [],
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
  clearMediaObjectUrls();
  renderAttachments();

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
  clearMediaObjectUrls();
  elements.attachmentList.replaceChildren();
  elements.attachmentSection.hidden = true;
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

function clearMediaObjectUrls() {
  mediaObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  mediaObjectUrls = [];
}

function makeWaveBars(values) {
  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const bar = document.createElement("i");
    bar.style.setProperty("--bar", String(Math.max(0.12, Math.min(1, Number(value) || 0.2))));
    fragment.append(bar);
  });
  return fragment;
}

async function renderAttachments() {
  const note = getActiveNote();
  if (!note) return;
  const noteId = note.id;
  const media = Array.isArray(note.media) ? note.media : [];
  elements.attachmentSection.hidden = media.length === 0;
  elements.attachmentCount.textContent = media.length ? `${media.length} 项` : "";
  elements.attachmentList.replaceChildren();
  clearMediaObjectUrls();

  if (!media.length) return;

  let records = [];
  try {
    records = await window.XiaoyeMedia.getAttachments(media.map((item) => item.id));
  } catch (error) {
    console.error(error);
    showToast("附件暂时无法读取");
    return;
  }

  if (activeNoteId !== noteId) return;
  const byId = new Map(records.map((record) => [record.id, record]));

  media.forEach((item) => {
    const record = byId.get(item.id);
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    mediaObjectUrls.push(url);

    if (item.kind === "image") {
      const figure = document.createElement("figure");
      figure.className = "attachment-item attachment-item--image";
      const imageButton = document.createElement("button");
      imageButton.type = "button";
      imageButton.className = "attachment-image-button";
      imageButton.setAttribute("aria-label", `预览图片：${item.name || "图片附件"}`);
      const image = document.createElement("img");
      image.src = url;
      image.alt = item.name || "笔记图片";
      image.loading = "lazy";
      imageButton.append(image);
      imageButton.addEventListener("click", () => openImageViewer(url, item.name));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "attachment-remove";
      remove.setAttribute("aria-label", "移除图片");
      remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      remove.addEventListener("click", () => removeAttachment(item.id));
      figure.append(imageButton, remove);
      elements.attachmentList.append(figure);
      return;
    }

    const card = document.createElement("article");
    card.className = "attachment-item attachment-item--audio";
    const heading = document.createElement("div");
    heading.className = "attachment-audio-heading";
    const label = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "语音笔记";
    const duration = document.createElement("span");
    duration.textContent = window.XiaoyeMedia.formatDuration(item.duration);
    label.append(title, duration);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "attachment-remove attachment-remove--inline";
    remove.setAttribute("aria-label", "移除录音");
    remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    remove.addEventListener("click", () => removeAttachment(item.id));
    heading.append(label, remove);

    const wave = document.createElement("div");
    wave.className = "attachment-wave";
    wave.setAttribute("aria-hidden", "true");
    wave.append(makeWaveBars(item.waveform.length ? item.waveform : window.XiaoyeMedia.fallbackWaveform(item.id)));

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = url;
    audio.className = "attachment-audio";

    card.append(heading, wave, audio);
    elements.attachmentList.append(card);
  });
}

function openImageViewer(url, name) {
  elements.imageViewerImage.src = url;
  elements.imageViewerImage.alt = name || "笔记图片";
  elements.imageViewerCaption.textContent = name || "";
  elements.imageViewer.hidden = false;
  requestAnimationFrame(() => elements.imageViewer.querySelector(".image-viewer-close")?.focus());
}

function closeImageViewer() {
  elements.imageViewer.hidden = true;
  elements.imageViewerImage.removeAttribute("src");
}

async function addImages(files) {
  const note = getActiveNote();
  if (!note) return;
  const remaining = Math.max(0, 12 - note.media.length);
  const selected = [...files].filter((file) => file.type.startsWith("image/")).slice(0, remaining);
  if (!selected.length) {
    showToast(remaining ? "请选择图片文件" : "这篇笔记的附件已满");
    return;
  }

  elements.imageButton.disabled = true;
  elements.saveStatus.textContent = "正在处理图片…";
  try {
    for (const file of selected) {
      const compressed = await window.XiaoyeMedia.compressImage(file);
      const id = makeId();
      const createdAt = Date.now();
      const attachment = {
        id,
        noteId: note.id,
        kind: "image",
        name: file.name || "图片",
        mime: compressed.blob.type || file.type,
        createdAt,
        blob: compressed.blob,
      };
      await window.XiaoyeMedia.putAttachment(attachment);
      note.media.push({
        id,
        kind: "image",
        name: attachment.name,
        mime: attachment.mime,
        duration: 0,
        waveform: [],
        createdAt,
      });
    }
    note.updatedAt = Date.now();
    persistNotes();
    elements.saveStatus.textContent = "已保存";
    renderAttachments();
    renderNotes();
  } catch (error) {
    console.error(error);
    showToast(error.message || "图片没有添加成功");
  } finally {
    elements.imageButton.disabled = false;
    elements.imageInput.value = "";
  }
}

async function removeAttachment(mediaId) {
  const note = getActiveNote();
  if (!note) return;
  const index = note.media.findIndex((item) => item.id === mediaId);
  if (index < 0) return;
  const [metadata] = note.media.splice(index, 1);
  const record = (await window.XiaoyeMedia.getAttachments([mediaId]).catch(() => []))[0];
  note.updatedAt = Date.now();
  persistNotes();
  renderAttachments();
  renderNotes();
  window.clearTimeout(attachmentDeleteTimer);
  attachmentDeleteTimer = window.setTimeout(() => {
    window.XiaoyeMedia.deleteAttachment(mediaId).catch(console.warn);
  }, 6200);

  showToast(metadata.kind === "audio" ? "录音已移除" : "图片已移除", {
    label: "撤销",
    onClick: async () => {
      window.clearTimeout(attachmentDeleteTimer);
      const target = notes.find((item) => item.id === note.id);
      if (!target) return;
      if (record) await window.XiaoyeMedia.putAttachment(record);
      target.media.splice(Math.min(index, target.media.length), 0, metadata);
      target.updatedAt = Date.now();
      persistNotes();
      if (activeNoteId === target.id) renderAttachments();
      renderNotes();
      hideToast();
    },
  });
}

function buildLiveWave() {
  elements.liveWave.replaceChildren(makeWaveBars(window.XiaoyeMedia.fallbackWaveform("live-recording", 28)));
}

function resetRecordPanel() {
  window.clearInterval(recordingTimerId);
  cancelAnimationFrame(recordingAnimationId);
  recordingTimerId = 0;
  recordingAnimationId = 0;
  if (recordingStream) recordingStream.getTracks().forEach((track) => track.stop());
  recordingStream = null;
  if (recordingAudioContext) recordingAudioContext.close().catch(() => {});
  recordingAudioContext = null;
  recordingAnalyser = null;
  elements.recordTimer.textContent = "00:00";
  elements.recordState.textContent = "准备录音";
  elements.recordHint.textContent = "录音会保存在当前笔记里，不会上传。";
  elements.recordToggleButton.textContent = "开始录音";
  elements.recordToggleButton.disabled = false;
  elements.liveWave.querySelectorAll("i").forEach((bar) => {
    bar.style.transform = "";
  });
}

function closeRecordPanel() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  resetRecordPanel();
  elements.recordLayer.hidden = true;
  elements.recordButton.focus({ preventScroll: true });
}

function openRecordPanel() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("当前设备不支持网页录音");
    return;
  }
  buildLiveWave();
  resetRecordPanel();
  elements.recordLayer.hidden = false;
  requestAnimationFrame(() => elements.recordToggleButton.focus({ preventScroll: true }));
}

function preferredAudioMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording() {
  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingChunks = [];
    const mime = preferredAudioMime();
    mediaRecorder = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) recordingChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", finishRecording, { once: true });
    mediaRecorder.start(250);
    recordingStartedAt = Date.now();
    elements.recordState.textContent = "正在录音";
    elements.recordHint.textContent = "再点一次即可停止并保存。";
    elements.recordToggleButton.textContent = "停止并保存";

    recordingTimerId = window.setInterval(() => {
      const seconds = (Date.now() - recordingStartedAt) / 1000;
      elements.recordTimer.textContent = window.XiaoyeMedia.formatDuration(seconds);
    }, 250);

    setupRecordingVisualizer(recordingStream);
  } catch (error) {
    console.error(error);
    resetRecordPanel();
    showToast(error.name === "NotAllowedError" ? "没有麦克风权限，请在系统设置中允许录音" : "麦克风没有启动");
  }
}

function setupRecordingVisualizer(stream) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    recordingAudioContext = new AudioContextClass();
    const source = recordingAudioContext.createMediaStreamSource(stream);
    recordingAnalyser = recordingAudioContext.createAnalyser();
    recordingAnalyser.fftSize = 128;
    source.connect(recordingAnalyser);
    const data = new Uint8Array(recordingAnalyser.frequencyBinCount);

    const animate = () => {
      if (!recordingAnalyser) return;
      recordingAnalyser.getByteFrequencyData(data);
      const bars = [...elements.liveWave.querySelectorAll("i")];
      bars.forEach((bar, index) => {
        const value = data[(index * 2) % data.length] / 255;
        bar.style.transform = `scaleY(${0.25 + value * 1.9})`;
      });
      recordingAnimationId = requestAnimationFrame(animate);
    };
    animate();
  } catch (error) {
    console.warn("Live waveform unavailable", error);
  }
}

async function finishRecording() {
  const duration = (Date.now() - recordingStartedAt) / 1000;
  const mime = mediaRecorder?.mimeType || recordingChunks[0]?.type || "audio/webm";
  resetRecordPanel();
  mediaRecorder = null;

  if (duration < 0.6 || !recordingChunks.length) {
    showToast("录音太短，没有保存");
    return;
  }

  const note = getActiveNote();
  if (!note) return;
  const id = makeId();
  const blob = new Blob(recordingChunks, { type: mime });
  const waveform = await window.XiaoyeMedia.createWaveform(blob, id);
  const createdAt = Date.now();
  const attachment = {
    id,
    noteId: note.id,
    kind: "audio",
    name: "语音笔记",
    mime,
    duration,
    createdAt,
    waveform,
    blob,
  };

  try {
    await window.XiaoyeMedia.putAttachment(attachment);
    note.media.push({
      id,
      kind: "audio",
      name: attachment.name,
      mime,
      duration,
      waveform,
      createdAt,
    });
    if (!note.title.trim() && !note.content.trim()) {
      note.title = `语音笔记 · ${new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date())}`;
    }
    note.updatedAt = Date.now();
    persistNotes();
    elements.noteTitle.value = note.title;
    elements.saveStatus.textContent = "已保存";
    elements.recordLayer.hidden = true;
    renderAttachments();
    renderNotes();
  } catch (error) {
    console.error(error);
    showToast("录音没有保存成功");
  }
}

function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    elements.recordToggleButton.disabled = true;
    elements.recordState.textContent = "正在保存";
    mediaRecorder.stop();
    return;
  }
  startRecording();
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

  window.clearTimeout(deletedNoteCleanupTimer);
  if (lastDeletedMediaIds.length) {
    window.XiaoyeMedia.deleteAttachments(lastDeletedMediaIds).catch(console.warn);
  }
  lastDeletedNote = { note: { ...note }, index: notes.findIndex((item) => item.id === note.id) };
  lastDeletedMediaIds = (note.media || []).map((item) => item.id);
  closeSheet();
  closeEditor({ deleteIfEmpty: false });
  notes = notes.filter((item) => item.id !== note.id);
  persistNotes();
  renderNotes();
  deletedNoteCleanupTimer = window.setTimeout(() => {
    window.XiaoyeMedia.deleteAttachments(lastDeletedMediaIds).catch(console.warn);
    lastDeletedMediaIds = [];
  }, 6200);
  showToast("笔记已删除", {
    label: "撤销",
    onClick: () => {
      if (!lastDeletedNote) return;
      window.clearTimeout(deletedNoteCleanupTimer);
      notes.splice(Math.max(0, lastDeletedNote.index), 0, lastDeletedNote.note);
      persistNotes();
      renderNotes();
      lastDeletedNote = null;
      lastDeletedMediaIds = [];
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

function createColorChooser(note) {
  const section = document.createElement("section");
  section.className = "sheet-color-block";
  const heading = document.createElement("h3");
  heading.textContent = "纸色";
  const picker = document.createElement("div");
  picker.className = "sheet-color-options";
  COLOR_ORDER.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `color-dot color-dot--${color}`;
    button.dataset.color = color;
    button.setAttribute("aria-label", `${color} 纸色`);
    button.setAttribute("aria-pressed", String(note.color === color));
    button.addEventListener("click", () => selectColor(color));
    picker.append(button);
  });
  section.append(heading, picker);
  return section;
}

function openSheet(mode) {
  sheetMode = mode;
  elements.sheetActions.replaceChildren();
  elements.themePicker.hidden = mode !== "home";

  if (mode === "note") {
    elements.sheetTitle.textContent = "笔记选项";
    const note = getActiveNote();
    elements.sheetActions.append(
      ...(note ? [createColorChooser(note)] : []),
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
    if (!elements.imageViewer.hidden) {
      event.preventDefault();
      closeImageViewer();
      return;
    }
    if (!elements.recordLayer.hidden) {
      event.preventDefault();
      closeRecordPanel();
      return;
    }
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
  if (!elements.imageViewer.hidden) {
    closeImageViewer();
    return true;
  }
  if (!elements.recordLayer.hidden) {
    closeRecordPanel();
    return true;
  }
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
  if (nativeBridge || !("serviceWorker" in navigator) || location.protocol === "file:") return;
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
elements.themeButton.addEventListener("click", () => openSheet("home"));
elements.pinButton.addEventListener("click", togglePin);
elements.imageButton.addEventListener("click", () => elements.imageInput.click());
elements.imageInput.addEventListener("change", (event) => addImages(event.target.files));
elements.recordButton.addEventListener("click", openRecordPanel);
elements.recordToggleButton.addEventListener("click", toggleRecording);
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

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => applyTheme(button.dataset.themeChoice));
});

document.querySelectorAll(".color-dot").forEach((button) => {
  button.addEventListener("click", () => selectColor(button.dataset.color));
});

elements.sheetActions.addEventListener("click", handleSheetAction);
elements.actionSheet.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-sheet]")) closeSheet();
});
elements.recordLayer.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-record]")) closeRecordPanel();
});
elements.imageViewer.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-image]")) closeImageViewer();
});

document.addEventListener("keydown", handleGlobalKeydown);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveActiveNote({ immediate: true });
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  }
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

applyTheme(currentTheme, { persist: false });
updateTodayLabel();
renderNotes();
registerServiceWorker();
window.XiaoyeMedia.clearOrphanAttachments(new Set(notes.map((note) => note.id))).catch((error) => {
  console.warn("Unable to clean orphan media", error);
});

if (!navigator.onLine && nativeBridge) {
  elements.saveStatus.textContent = "离线也能继续写";
}
