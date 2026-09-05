(function initLongReading(root) {
  "use strict";
  const THRESHOLD = 10000;
  // Preserve exact offsets, including whitespace. Prefer paragraph boundaries.
  function split(text, limit = 8000) {
    const parts = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + limit, text.length);
      if (end < text.length) {
        const newline = text.lastIndexOf("\n", end);
        const space = text.lastIndexOf(" ", end);
        if (newline > start + limit / 2) end = newline + 1;
        else if (space > start + limit / 2) end = space + 1;
        if (/[\uD800-\uDBFF]/.test(text[end - 1])) end -= 1;
      }
      parts.push({ id: `s${parts.length + 1}`, start, end });
      start = end;
    }
    return parts;
  }
  function validSections(digest, text) {
    if (digest?.sourceText !== text || !Array.isArray(digest.sections)) return false;
    const expected = split(text);
    return expected.length === digest.sections.length && expected.every((part, i) => {
      const section = digest.sections[i];
      return section.id === part.id && section.start === part.start && section.end === part.end
        && typeof section.titleZh === "string" && typeof section.summaryZh === "string";
    });
  }
  async function summarize(post, request, progress = () => {}) {
    const sections = [];
    const parts = split(post.text);
    for (const part of parts) {
      progress(`正在生成分节摘要 ${sections.length + 1}/${parts.length}…`);
      const result = await request("sectionDigest", { ...post, text: post.text.slice(part.start, part.end) });
      sections.push({ ...part, titleZh: result.titleZh, summaryZh: result.summaryZh });
    }
    progress("正在汇总全文主旨…");
    const overview = await request("digest", {
      ...post,
      text: sections.map(s => `${s.titleZh}\n${s.summaryZh}`).join("\n\n"),
    });
    return { ...overview, sections, sourceText: post.text };
  }
  async function translate(post, request, progress = () => {}) {
    const source = root.XDG_LEARNING_DATA.segmentPostText(post.text);
    const batches = [];
    let batch = [];
    for (const segment of source) {
      if (batch.length && batch.map(s => s.original).join("\n\n").length + segment.original.length > 2500) {
        batches.push(batch);
        batch = [];
      }
      batch.push(segment);
    }
    if (batch.length) batches.push(batch);
    const segments = [];
    for (const [i, items] of batches.entries()) {
      progress(`正在翻译 ${i + 1}/${batches.length}…`);
      const text = items.map(s => s.original).join("\n\n");
      const value = await request("translate", { ...post, text });
      if (!root.XDG_LEARNING_DATA.isAlignedTranslation(value, text)
          || value.segments.length !== items.length) throw new Error("Translation does not match original paragraphs.");
      segments.push(...value.segments.map((s, index) => ({ ...s, id: items[index].id, original: items[index].original })));
    }
    return { translationZh: segments.map(s => s.translationZh).join("\n\n"), segments };
  }

  const api = { THRESHOLD, split, validSections, summarize, translate };
  root.XDG_LONG_READING = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
