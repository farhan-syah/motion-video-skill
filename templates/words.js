// Word-anchored scenes. Copy to the project (lib/words.js). Load after ../out/anchors.js in each scene, before the scene's script.
// tools/timeline.mjs (templates/timeline.mjs) writes out/anchors.js from the narration's word times.
//
//   at("phrase", { nth, off })   seconds from the scene start when the narrator says the phrase
//   endAt("phrase")              seconds when the phrase ends
//   SCENE_DUR, SCENE_START       the scene's length and its start on the video timeline
//   data-w="phrase"              sets --t (entrance start) on an element, 0.15 s before the phrase. data-w-off, data-w-nth, data-w-min
//   data-w-out="phrase"          sets --out-t (exit start). data-w-out-off
//
// Everything here reads the scene time alone. Nothing reads a clock.
(() => {
  const id = decodeURIComponent(location.pathname.split("/").pop()).replace(/\.html$/, "");
  const S = (window.__SCENES || {})[id];
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const stream = [];
  (S?.words || []).forEach((w, wi) => norm(w[0]).split(" ").filter(Boolean).forEach((tok) => stream.push({ tok, wi })));

  function find(phrase, nth = 0) {
    if (!S) throw new Error(`words: no anchors for scene "${id}". Run tools/timeline.mjs.`);
    const t = norm(phrase).split(" ");
    let seen = 0;
    for (let i = 0; i + t.length <= stream.length; i++) {
      if (t.every((tok, k) => stream[i + k].tok === tok)) {
        if (seen++ === nth) return { first: S.words[stream[i].wi], last: S.words[stream[i + t.length - 1].wi] };
      }
    }
    throw new Error(`words: "${phrase}" (match ${nth}) is not spoken in scene "${id}"`);
  }
  window.at = (phrase, o = {}) => find(phrase, o.nth ?? 0).first[1] + (o.off ?? 0);
  window.endAt = (phrase, o = {}) => find(phrase, o.nth ?? 0).last[2] + (o.off ?? 0);
  window.SCENE_DUR = S?.dur ?? 10;
  window.SCENE_START = S?.start ?? 0;

  document.addEventListener("DOMContentLoaded", () => {
    for (const el of document.querySelectorAll("[data-w]")) {
      const d = el.dataset;
      const t = at(d.w, { nth: Number(d.wNth ?? 0) }) + Number(d.wOff ?? -0.15);
      el.style.setProperty("--t", `${Math.max(Number(d.wMin ?? 0), t).toFixed(3)}s`);
    }
    for (const el of document.querySelectorAll("[data-w-out]")) {
      const d = el.dataset;
      el.style.setProperty("--out-t", `${Math.max(0, endAt(d.wOut, { nth: Number(d.wNth ?? 0) }) + Number(d.wOutOff ?? 0.1)).toFixed(3)}s`);
    }
  });
})();
