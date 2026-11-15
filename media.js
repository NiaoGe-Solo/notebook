"use strict";

(function () {
  const DB_NAME = "xiaoye.media.v1";
  const DB_VERSION = 1;
  const STORE_NAME = "attachments";
  let databasePromise = null;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("noteId", "noteId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open media database"));
    });
    return databasePromise;
  }

  async function transaction(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("Media transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("Media transaction aborted"));
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Media request failed"));
    });
  }

  async function putAttachment(attachment) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(attachment);
      tx.oncomplete = () => resolve(attachment);
      tx.onerror = () => reject(tx.error || new Error("Unable to save attachment"));
    });
  }

  async function getAttachments(ids) {
    if (!ids.length) return [];
    const database = await openDatabase();
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const records = await Promise.all(ids.map((id) => requestResult(store.get(id))));
    return records.filter(Boolean);
  }

  async function deleteAttachment(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Unable to delete attachment"));
    });
  }

  async function deleteAttachments(ids) {
    if (!ids.length) return;
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Unable to delete attachments"));
    });
  }

  async function clearOrphanAttachments(validNoteIds) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (!validNoteIds.has(cursor.value.noteId)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Unable to clean attachment cache"));
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Unable to read image"));
      };
      image.src = url;
    });
  }

  async function compressImage(file) {
    const maxBytes = 12 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error("图片超过 12 MB");

    if (file.size <= 1.2 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/i.test(file.type)) {
      return { blob: file, width: null, height: null };
    }

    const image = await loadImage(file);
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.82);
    });

    return {
      blob: blob || file,
      width,
      height,
    };
  }

  function fallbackWaveform(seed, count = 28) {
    let hash = 2166136261;
    for (const character of seed) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Array.from({ length: count }, (_, index) => {
      hash = Math.imul(hash ^ (index + 1), 2246822519);
      const value = Math.abs(hash % 1000) / 1000;
      return Number((0.18 + value * 0.82).toFixed(2));
    });
  }

  async function createWaveform(blob, seed, count = 28) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is unavailable");
      const context = new AudioContextClass();
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const samples = buffer.getChannelData(0);
      const step = Math.max(1, Math.floor(samples.length / count));
      const values = [];

      for (let index = 0; index < count; index += 1) {
        let sum = 0;
        const start = index * step;
        const end = Math.min(samples.length, start + step);
        for (let cursor = start; cursor < end; cursor += 1) {
          sum += samples[cursor] * samples[cursor];
        }
        values.push(Math.sqrt(sum / Math.max(1, end - start)));
      }

      const peak = Math.max(...values, 0.001);
      await context.close();
      return values.map((value) => Number(Math.max(0.12, value / peak).toFixed(2)));
    } catch (error) {
      console.warn("Waveform fallback used", error);
      return fallbackWaveform(seed, count);
    }
  }

  function formatDuration(seconds) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  window.XiaoyeMedia = {
    putAttachment,
    getAttachments,
    deleteAttachment,
    deleteAttachments,
    clearOrphanAttachments,
    compressImage,
    createWaveform,
    fallbackWaveform,
    formatDuration,
  };
})();
