const DEFAULT_RECIPE = {
  name: "모닝 V60",
  coffee: 20,
  water: 300,
  totalSeconds: 180,
  steps: [
    { seconds: 0, label: "뜸 들이기 · 60g까지 천천히 붓기" },
    { seconds: 40, label: "1차 푸어 · 150g까지 붓기" },
    { seconds: 80, label: "2차 푸어 · 240g까지 붓기" },
    { seconds: 120, label: "마지막 푸어 · 300g까지 붓기" },
  ],
};

const STORAGE_KEY = "brew-timer-recipe-v1";
const LIBRARY_KEY = "brew-timer-library-v2";
const $ = (selector) => document.querySelector(selector);
const elements = {
  name: $("#recipe-name"),
  coffee: $("#coffee-amount"),
  water: $("#water-amount"),
  total: $("#total-duration"),
  status: $("#status-label"),
  ring: $("#timer-ring"),
  display: $("#timer-display"),
  kicker: $("#timer-kicker"),
  target: $("#timer-target"),
  stepTime: $("#step-time"),
  stepTitle: $("#step-title"),
  stepDetail: $("#step-detail"),
  stepCount: $("#step-count"),
  steps: $("#steps-list"),
  start: $("#start-button"),
  reset: $("#reset-button"),
  edit: $("#edit-button"),
  dialog: $("#recipe-dialog"),
  form: $("#recipe-form"),
  formName: $("#form-name"),
  formCoffee: $("#form-coffee"),
  stepFields: $("#step-fields"),
  addStep: $("#add-step-button"),
  stepTemplate: $("#step-field-template"),
};

let library = loadLibrary();
let recipe = library.recipes.find((item) => item.id === library.selectedId) || library.recipes[0];
let editingId = null;
let timerState = "idle";
let startedAt = 0;
let accumulatedMs = 0;
let animationFrame = 0;
let lastStepIndex = -1;
let wakeLock = null;
let audioContext = null;

function normalizeRecipe(item) {
  let previous = 0;
  return {
    ...item, id: item.id || crypto.randomUUID(), method: item.method || "하리오 V60",
    steps: item.steps.map((step) => {
      const target = step.target ?? Number(step.label.match(/(\d+)\s*g/i)?.[1] || previous);
      const amount = step.amount ?? Math.max(0, target - previous);
      previous = target;
      return { ...step, amount, target };
    }),
  };
}

function loadLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIBRARY_KEY));
    if (saved?.recipes?.length) return { ...saved, recipes: saved.recipes.map(normalizeRecipe) };
    const old = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const first = normalizeRecipe(old?.steps?.length ? old : structuredClone(DEFAULT_RECIPE));
    return { selectedId: first.id, recipes: [first] };
  } catch {
    const first = normalizeRecipe(structuredClone(DEFAULT_RECIPE));
    return { selectedId: first.id, recipes: [first] };
  }
}

function persistLibrary(next) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(next)); }
  catch { return false; }
  library = next;
  return true;
}

function canChangeRecipe() {
  if (timerState === "running" || timerState === "paused") {
    $("#app-message").textContent = "추출을 마치거나 ‘처음으로’를 누른 뒤 레시피를 변경해주세요.";
    return false;
  }
  return true;
}

function renderLibrary() {
  const query = $("#recipe-search").value.trim().toLowerCase();
  const list = $("#recipe-list");
  list.replaceChildren();
  for (const item of library.recipes.filter((r) => `${r.name} ${r.method} ${r.bean || ""}`.toLowerCase().includes(query))) {
    const card = document.createElement("article");
    card.className = "saved-recipe";
    card.innerHTML = '<button type="button" class="select-recipe"><span class="saved-name"></span><span class="saved-meta"></span><span class="saved-detail"></span></button><div class="recipe-actions"><button type="button">편집</button><button type="button">복제</button><button type="button" class="delete-recipe">삭제</button></div>';
    card.classList.toggle("selected", item.id === recipe.id);
    card.querySelector(".saved-name").textContent = `${item.name}${item.id === recipe.id ? " · 선택됨" : ""}`;
    card.querySelector(".saved-meta").textContent = `${item.method} · 원두 ${item.coffee}g · 물 ${item.water}g · ${formatTime(item.totalSeconds)}`;
    card.querySelector(".saved-detail").textContent = [item.temperature && `${item.temperature}°C`, item.bean, item.grind].filter(Boolean).join(" · ");
    card.querySelector(".select-recipe").onclick = () => {
      if (!persistLibrary({ ...library, selectedId: item.id })) return alert("저장 공간을 확인해주세요. 선택을 저장하지 못했습니다.");
      resetTimer(); recipe = item; renderRecipe(); $("#library-dialog").close();
    };
    const actions = card.querySelectorAll(".recipe-actions button");
    actions[0].onclick = () => { $("#library-dialog").close(); openEditor(item); };
    actions[1].onclick = () => { $("#library-dialog").close(); openEditor({ ...structuredClone(item), id: null, name: `${item.name} 복사`.slice(0, 30) }); };
    actions[2].disabled = library.recipes.length === 1;
    actions[2].onclick = () => {
      if (!confirm(`‘${item.name}’ 레시피를 삭제할까요? 되돌릴 수 없습니다.`)) return;
      const recipes = library.recipes.filter((r) => r.id !== item.id);
      const selectedId = recipe.id === item.id ? recipes[0].id : recipe.id;
      if (!persistLibrary({ recipes, selectedId })) return alert("삭제 내용을 저장하지 못했습니다.");
      recipe = recipes.find((r) => r.id === selectedId); resetTimer(); renderRecipe(); renderLibrary();
    };
    list.append(card);
  }
  if (!list.children.length) list.textContent = "검색 결과가 없어요. 다른 이름이나 드리퍼로 찾아보세요.";
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function splitStep(label) {
  const [title, ...detail] = label.split("·");
  return { title: title.trim(), detail: detail.join("·").trim() || "다음 단계까지 이어가세요" };
}

function renderRecipe() {
  $("#library-count").textContent = library.recipes.length;
  $("#recipe-method").textContent = recipe.method;
  const facts = [
    ["원두 : 물 비율", `1:${Number((recipe.water / recipe.coffee).toFixed(1))}`],
    ["물 온도", recipe.temperature && `${recipe.temperature}°C`],
    ["원두", recipe.bean],
    ["분쇄도", recipe.grind],
  ];
  $("#recipe-meta").replaceChildren(...facts.filter(([, value]) => value).map(([label, value]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    item.append(term, detail);
    return item;
  }));
  $("#recipe-notes").textContent = recipe.notes || "";
  elements.name.textContent = recipe.name;
  elements.coffee.textContent = `${recipe.coffee}g`;
  elements.water.textContent = `${recipe.water}g`;
  elements.total.textContent = formatTime(recipe.totalSeconds);
  elements.stepCount.textContent = `${recipe.steps.length}단계`;
  elements.steps.replaceChildren(
    ...recipe.steps.map((step, index) => {
      const item = document.createElement("li");
      const parts = splitStep(step.label);
      item.dataset.step = index;
      item.innerHTML = `<time>${formatTime(step.seconds)}</time><strong></strong><span class="amount"></span>`;
      item.querySelector("strong").textContent = parts.title;
      item.querySelector(".amount").textContent = step.amount ? `+${step.amount}g → ${step.target}g` : `대기 · ${step.target}g`;
      return item;
    }),
  );
  updateTimerView(0);
}

function elapsedMs() {
  return timerState === "running" ? accumulatedMs + Date.now() - startedAt : accumulatedMs;
}

function currentStepIndex(seconds) {
  let active = 0;
  recipe.steps.forEach((step, index) => {
    if (seconds >= step.seconds) active = index;
  });
  return active;
}

function updateTimerView(ms) {
  const seconds = ms / 1000;
  const stepIndex = currentStepIndex(seconds);
  const step = recipe.steps[stepIndex];
  const parts = splitStep(step.label);
  const progress = Math.min(100, (seconds / recipe.totalSeconds) * 100);

  elements.display.textContent = formatTime(seconds);
  elements.ring.style.setProperty("--progress", `${progress}%`);
  elements.stepTime.textContent = formatTime(step.seconds);
  elements.stepTitle.textContent = parts.title;
  elements.stepDetail.textContent = parts.detail;
  const end = recipe.steps[stepIndex + 1]?.seconds ?? recipe.totalSeconds;
  elements.target.textContent = `${stepIndex === recipe.steps.length - 1 ? "완료" : "다음 단계"}까지 ${formatTime(Math.ceil(end - seconds))}`;
  $("#pour-amount").textContent = step.amount ? `+${step.amount}g` : "대기";
  $("#pour-target").textContent = `${step.target}g`;
  $("#next-step").textContent = recipe.steps[stepIndex + 1] ? `다음 · ${splitStep(recipe.steps[stepIndex + 1].label).title} · ${formatTime(end)}` : `마지막 단계 · ${formatTime(recipe.totalSeconds)}에 완료`;
  elements.steps.querySelectorAll("li").forEach((item, index) => {
    item.classList.toggle("active", index === stepIndex && timerState !== "idle");
    item.classList.toggle("done", index < stepIndex);
  });

  if (timerState === "running" && stepIndex !== lastStepIndex) {
    if (lastStepIndex >= 0) signalStep();
    lastStepIndex = stepIndex;
  }
}

function tick() {
  const ms = elapsedMs();
  if (ms >= recipe.totalSeconds * 1000) {
    accumulatedMs = recipe.totalSeconds * 1000;
    finishTimer();
    return;
  }
  updateTimerView(ms);
  animationFrame = requestAnimationFrame(tick);
}

async function beginTimer() {
  if (timerState === "running") return;
  if (timerState === "complete") resetTimer();
  const BrowserAudioContext = window.AudioContext || window.webkitAudioContext;
  audioContext ||= BrowserAudioContext ? new BrowserAudioContext() : null;
  if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
  startedAt = Date.now();
  timerState = "running";
  document.body.classList.add("brewing");
  elements.status.textContent = "추출 중";
  elements.kicker.textContent = "경과 시간";
  elements.start.querySelector("span").textContent = "잠시 멈춤";
  elements.start.querySelector("path").setAttribute("d", "M7 5h4v14H7V5Zm6 0h4v14h-4V5Z");
  elements.reset.classList.remove("hidden");
  lastStepIndex = currentStepIndex(elapsedMs() / 1000);
  requestWakeLock();
  tick();
}

function pauseTimer() {
  accumulatedMs = elapsedMs();
  timerState = "paused";
  cancelAnimationFrame(animationFrame);
  elements.status.textContent = "일시 정지";
  elements.start.querySelector("span").textContent = "계속하기";
  elements.start.querySelector("path").setAttribute("d", "m8 5 11 7-11 7V5Z");
  releaseWakeLock();
}

function finishTimer() {
  timerState = "complete";
  cancelAnimationFrame(animationFrame);
  updateTimerView(accumulatedMs);
  elements.status.textContent = "완료";
  elements.kicker.textContent = "추출 완료";
  elements.target.textContent = "맛있게 즐기세요";
  elements.start.querySelector("span").textContent = "다시 추출";
  elements.start.querySelector("path").setAttribute("d", "m8 5 11 7-11 7V5Z");
  signalStep(true);
  releaseWakeLock();
}

function resetTimer() {
  $("#app-message").textContent = "";
  cancelAnimationFrame(animationFrame);
  timerState = "idle";
  document.body.classList.remove("brewing");
  startedAt = 0;
  accumulatedMs = 0;
  lastStepIndex = -1;
  elements.status.textContent = "준비됨";
  elements.kicker.textContent = "경과 시간";
  elements.target.textContent = "시작 버튼을 눌러주세요";
  elements.start.querySelector("span").textContent = "추출 시작";
  elements.start.querySelector("path").setAttribute("d", "m8 5 11 7-11 7V5Z");
  elements.reset.classList.add("hidden");
  releaseWakeLock();
  updateTimerView(0);
}

function signalStep(isComplete = false) {
  navigator.vibrate?.(isComplete ? [160, 80, 160] : 160);
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = isComplete ? 1046 : 880;
  gain.gain.setValueAtTime(0.001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.32);
}

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { wakeLock = null; }
}

function releaseWakeLock() {
  wakeLock?.release();
  wakeLock = null;
}

function updateEditorSummary() {
  let seconds = 0, water = 0;
  for (const field of elements.stepFields.children) {
    const duration = Number(field.querySelector(".step-duration").value) || 0;
    const amount = Number(field.querySelector(".step-water").value) || 0;
    water += amount;
    field.querySelector(".step-preview").textContent = `${formatTime(seconds)}–${formatTime(seconds + duration)} · 누적 ${water}g`;
    seconds += duration;
  }
  $("#editor-summary").textContent = `총 ${formatTime(seconds)} · 물 ${water}g`;
}

function addStepField(step = { label: "", amount: 0 }, duration = 30) {
  const field = elements.stepTemplate.content.firstElementChild.cloneNode(true);
  const [title, ...notes] = step.label.split("·");
  field.querySelector(".step-duration").value = duration;
  field.querySelector(".step-water").value = step.amount;
  field.querySelector(".step-label").value = title.trim();
  field.querySelector(".step-note").value = notes.join("·").trim();
  field.querySelector(".remove-step").addEventListener("click", () => {
    if (elements.stepFields.children.length > 1) { field.remove(); updateEditorSummary(); }
  });
  elements.stepFields.append(field);
  updateEditorSummary();
}

function openEditor(item = recipe) {
  if (!canChangeRecipe()) return;
  editingId = item.id;
  $("#editor-title").textContent = editingId ? "레시피 편집" : "새 레시피";
  $("#form-error").textContent = "";
  elements.formName.value = item.name;
  elements.formCoffee.value = item.coffee;
  for (const key of ["method", "temperature", "bean", "grind", "notes"]) $("#form-" + key).value = item[key] || "";
  elements.stepFields.replaceChildren();
  item.steps.forEach((step, index) => addStepField(step, (item.steps[index + 1]?.seconds ?? item.totalSeconds) - step.seconds));
  elements.dialog.showModal();
}

function saveRecipe() {
  const fields = [...elements.stepFields.querySelectorAll(".step-field")];
  let seconds = 0, water = 0;
  const steps = fields.map((field) => {
    const title = field.querySelector(".step-label").value.trim();
    const note = field.querySelector(".step-note").value.trim();
    const amount = Number(field.querySelector(".step-water").value);
    water += amount;
    const step = { seconds, label: [title, note].filter(Boolean).join(" · "), amount, target: water };
    seconds += Number(field.querySelector(".step-duration").value);
    return step;
  });
  if (!elements.formName.value.trim() || fields.some((field) => !field.querySelector(".step-label").value.trim()) || water <= 0) {
    $("#form-error").textContent = "레시피·단계 이름과 0g보다 많은 전체 물 양을 입력해주세요.";
    return false;
  }
  const saved = {
    id: editingId || crypto.randomUUID(),
    name: elements.formName.value.trim(),
    coffee: Number(elements.formCoffee.value),
    water, totalSeconds: seconds, steps,
  };
  for (const key of ["method", "temperature", "bean", "grind", "notes"]) saved[key] = $("#form-" + key).value.trim();
  saved.method ||= "드리퍼 미지정";
  const recipes = editingId ? library.recipes.map((item) => item.id === editingId ? saved : item) : [...library.recipes, saved];
  if (!persistLibrary({ recipes, selectedId: saved.id })) {
    $("#form-error").textContent = "저장하지 못했습니다. 기기 저장 공간과 브라우저 설정을 확인해주세요. 입력 내용은 그대로 유지됩니다.";
    return false;
  }
  recipe = saved;
  resetTimer();
  renderRecipe();
  return true;
}

elements.start.addEventListener("click", () => timerState === "running" ? pauseTimer() : beginTimer());
elements.reset.addEventListener("click", resetTimer);
elements.edit.addEventListener("click", () => openEditor());
elements.addStep.addEventListener("click", () => addStepField());
elements.stepFields.addEventListener("input", updateEditorSummary);
$("#editor-close").onclick = () => elements.dialog.close();
$("#library-button").onclick = () => {
  if (!canChangeRecipe()) return;
  $("#recipe-search").value = "";
  renderLibrary(); $("#library-dialog").showModal();
};
$("#library-close").onclick = () => $("#library-dialog").close();
$("#recipe-search").oninput = renderLibrary;
$("#new-recipe").onclick = () => {
  $("#library-dialog").close();
  openEditor({ id: null, name: "", coffee: 20, method: "하리오 V60", totalSeconds: 180, steps: [
    { seconds: 0, label: "뜸 들이기", amount: 60 },
    { seconds: 40, label: "물 붓기", amount: 240 },
    { seconds: 120, label: "물 빠짐 대기", amount: 0 },
  ] });
};
elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (saveRecipe()) elements.dialog.close();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && timerState === "running") requestWakeLock();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js");

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  context.registerTool({
    name: "start_brew_timer",
    title: "추출 타이머 시작",
    description: "현재 화면에 설정된 커피 레시피로 추출 타이머를 시작합니다.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute() {
      if (timerState === "running") return { status: "already_running" };
      await beginTimer();
      return { status: "running", recipe: recipe.name };
    },
  });
}

renderRecipe();
registerWebMcp();
