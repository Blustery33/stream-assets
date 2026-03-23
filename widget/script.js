const state = {
  current: 0,
  targetCurrent: 0,
  goal: 10,
  title: "Follower goal",
  last: "—",
};

const liquidTexture = document.getElementById("liquid-texture");
const liquidSurface = document.getElementById("liquid-surface");

const titleEl = document.getElementById("goal-title");
const countEl = document.getElementById("goal-count");
const lastEl = document.getElementById("goal-last");

const titleInput = document.getElementById("title-input");
const progressInput = document.getElementById("progress-input");
const goalInput = document.getElementById("goal-input");

const widget = document.getElementById("widget");
const params = new URLSearchParams(window.location.search);
// Vague forte active par défaut. Optionnel: ?waveDebug=0 pour la désactiver.
let waveDebug = params.get("waveDebug") !== "0";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Réglages de position du liquide.
// Le liquide est vu à travers le masque CSS `assets/cup-mask-guide.svg` (même zone que le gobelet,
// mask-size: contain). Le viewBox du SVG est environ 810 × 1012 — utile pour garder les mêmes
// proportions, mais la hauteur « au bord du gobelet » dépend du tracé du masque + de ces constantes.
// Trop de translate à 0 => peu de liquide visible au début.
// Trop de “travel” => débordement vers le dôme en fin de course.
const LIQUID_TEXTURE_TRANSLATE_Y_AT_ZERO = 42;
const LIQUID_SURFACE_TOP_AT_ZERO = 60;

// Amplitudes entre remplissage visuel 0 et 1 (à retuner si tu changes le masque ou la texture)
// Le nouvel asset de liquide est plus "compact" en hauteur : on doit le
// déplacer davantage (travel plus grand) pour retrouver la même sensation
// de remplissage.
const LIQUID_TEXTURE_TRAVEL = 36;
const LIQUID_SURFACE_TRAVEL = 28;

// Remplissage **strictement** proportionnel au goal : `current / goal` (0 → vide, 1 → plein visuel max).
// Le masque `cup-mask-guide.svg` ne change pas ce calcul : il ne fait que découper l’affichage en CSS.
// On ne lit pas la largeur/hauteur du SVG en JS (pas de « goal ÷ taille du masque »).
// Si à 10/10 le liquide déborde dans le dôme, baisse plutôt LIQUID_TEXTURE_TRAVEL / LIQUID_SURFACE_TRAVEL.
const LIQUID_VISUAL_FULL_AT_PROGRESS = 1;

// Le masque + la texture ont parfois un “seuil” : visuellement, le liquide ne devient
// perceptible qu'à partir d'une certaine hauteur. On applique donc une courbe pour
// rendre le liquide visible plus tôt (sans changer le fait que 10/10 reste plein).
// gamma < 1 : accélère la progression au début. gamma = 1 : linéaire.
const LIQUID_LOW_PROGRESS_GAMMA = 0.68;

// Rognage dynamique de la paille :
// on augmente --straw-crop-bottom en même temps que le niveau du liquide.
// Valeur de base lue depuis le CSS, puis on ajoute un "extra" au fur et à mesure.
// La paille doit s'enterrer progressivement sous le liquide.
// À 0/10 -> vaut "--straw-crop-bottom" (base CSS).
// À 10/10 -> vaut "base + extra".
// Commence à une valeur modérée : on pourra affiner visuellement ensuite.
const STRAW_CROP_EXTRA_AT_FULL = 22; // en "%", donc ~49% à 10/10 si base=27%
// true = la paille progresse par paliers (1 step = 1/current sur goal)
// false = progression continue (animée avec le liquide)
const STRAW_CLIP_STEP_BY_GOAL = true;
// Base fixe: 27% doit être considéré comme le niveau 0.
const STRAW_CROP_BASE = 27;

function renderText() {
  titleEl.textContent = state.title;
  countEl.textContent = `${Math.round(state.targetCurrent)} / ${state.goal}`;
  lastEl.textContent = `Dernier soutien : ${state.last}`;
}

function renderLiquid() {
  const rawProgress = clamp(state.current / state.goal, 0, 1);
  const normalized = clamp(rawProgress / LIQUID_VISUAL_FULL_AT_PROGRESS, 0, 1);
  const visualProgress = clamp(Math.pow(normalized, LIQUID_LOW_PROGRESS_GAMMA), 0, 1);
  const t = performance.now() * 0.001;

  const textureTranslate =
    LIQUID_TEXTURE_TRANSLATE_Y_AT_ZERO -
    visualProgress * LIQUID_TEXTURE_TRAVEL;

  const swayAmplitude = waveDebug ? 18 : 6;
  const textureSwayX = Math.sin(t * 1.9) * swayAmplitude;

  liquidTexture.style.transform = `translate(${textureSwayX}px, ${textureTranslate}%)`;

  // Plus le liquide monte, plus on masque le bas de la paille.
  // inset(0 0 B 0) => visible = (100 - B)%, donc B plus grand = paille plus "cachée".
  // Calcul strictement lié au ratio current/goal :
  // - mode paliers : targetCurrent/goal (1 step par point)
  // - mode continu : current/goal (animé)
  const strawRawProgress = STRAW_CLIP_STEP_BY_GOAL
    ? clamp(Math.round(state.targetCurrent) / state.goal, 0, 1)
    : rawProgress;
  const strawCropBottom = clamp(
    STRAW_CROP_BASE + strawRawProgress * STRAW_CROP_EXTRA_AT_FULL,
    0,
    100
  );
  document.documentElement.style.setProperty(
    "--straw-crop-bottom",
    `${strawCropBottom}%`
  );
}

function tick() {
  state.current += (state.targetCurrent - state.current) * 0.06;
  renderLiquid();
  requestAnimationFrame(tick);
}

function setGoal(current, goal, contributor = null) {
  state.goal = Math.max(1, Number(goal) || 1);
  state.targetCurrent = clamp(Number(current) || 0, 0, state.goal);

  if (contributor) {
    state.last = contributor;
  }

  progressInput.max = String(state.goal);
  progressInput.value = String(Math.round(state.targetCurrent));
  goalInput.value = String(state.goal);

  renderText();
}

function addProgress(amount, contributor) {
  setGoal(state.targetCurrent + amount, state.goal, contributor);
}

function setTitle(title) {
  state.title = title || "Follower goal";
  titleInput.value = state.title;
  renderText();
}

window.MatchaGoalWidget = {
  setGoal,
  addProgress,
  setTitle,
};

window.setGoal = setGoal;

titleInput.addEventListener("input", (e) => {
  setTitle(e.target.value);
});

progressInput.addEventListener("input", (e) => {
  setGoal(Number(e.target.value), state.goal, state.last);
  // Le compteur suit tout de suite le slider : le liquide doit faire pareil (sinon décalage trompeur).
  state.current = state.targetCurrent;
  renderLiquid();
});

goalInput.addEventListener("input", (e) => {
  const newGoal = Number(e.target.value);
  setGoal(Math.min(state.targetCurrent, newGoal), newGoal, state.last);
  state.current = state.targetCurrent;
  renderLiquid();
});

document.getElementById("plus-follow").addEventListener("click", () => {
  addProgress(1, "Nouveau follow");
});

document.getElementById("plus-sub").addEventListener("click", () => {
  addProgress(1, "Nouveau sub");
});

window.addEventListener("onWidgetLoad", (obj) => {
  const fieldData = obj?.detail?.fieldData || {};

  if (fieldData.goalTitle) {
    setTitle(fieldData.goalTitle);
  }

  if (fieldData.goalTotal) {
    setGoal(state.targetCurrent, Number(fieldData.goalTotal), state.last);
  }
});

window.addEventListener("onEventReceived", (obj) => {
  const detail = obj?.detail;
  if (!detail) return;

  const listener = detail.listener;
  const event = detail.event || {};
  const name =
    event.name || event.displayName || event.username || "Anonyme";

  if (listener === "follower-latest") {
    addProgress(1, `${name} (follow)`);
  }

  if (
    listener === "subscriber-latest" ||
    listener === "subscriber-session"
  ) {
    addProgress(1, `${name} (sub)`);
  }
});

if (params.get("overlay") === "1") {
  widget.classList.add("overlay-mode");
}

renderText();
renderLiquid();
requestAnimationFrame(tick);