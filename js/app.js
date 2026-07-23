/* TOEIC Vocabulary Practice — app logic (state, flashcards, quiz engine, rendering).
   Depends on VOCAB_CATEGORIES / RAW_WORDS / SENTENCE_TEMPLATES from data/vocab.js. */

/* ---------------- helpers ---------------- */
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffleArr(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function shuffleCopy(arr){ const c=arr.slice(); shuffleArr(c); return c; }

const POS_LABEL = { n:"danh từ", v:"động từ", adj:"tính từ", phrase:"cụm từ" };

/* ---------------- word bank ---------------- */
const WORDS = RAW_WORDS.map((r,i)=>({ id:"w"+i, term:r[0], pos:r[1], vi:r[2], cat:r[3], ipa:r[4] }));
const TOTAL_WORDS = WORDS.length;
const CAT_BY_ID = {};
VOCAB_CATEGORIES.forEach(c=>{ CAT_BY_ID[c.id] = c; });
function wordsInCat(catId){ return catId==='all' ? WORDS : WORDS.filter(w=>w.cat===catId); }

/* ---------------- state / storage (safe for sandboxed iframe embeds) ---------------- */
const STORE_KEY = "toeicVocabState_v1";
let memoryState = null; // fallback if localStorage is unavailable
function storageAvailable(){
  try{ const k="__t__"; localStorage.setItem(k,"1"); localStorage.removeItem(k); return true; }
  catch(e){ return false; }
}
const HAS_STORAGE = storageAvailable();
function loadState(){
  let raw = null;
  if(HAS_STORAGE){
    try{ raw = JSON.parse(localStorage.getItem(STORE_KEY)); }catch(e){}
  } else {
    raw = memoryState;
  }
  if(!raw) raw = {};
  if(!raw.words) raw.words = {};
  WORDS.forEach(w=>{
    if(!raw.words[w.id]) raw.words[w.id] = {status:"new", correct:0, wrong:0, lastSeen:0};
  });
  if(!raw.quizHistory) raw.quizHistory = [];
  return raw;
}
let STATE = loadState();
function saveState(){
  if(HAS_STORAGE){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }catch(e){}
  } else {
    memoryState = STATE;
  }
}
function markWordResult(id, known){
  const rec = STATE.words[id];
  if(known){ rec.correct++; if(rec.status!=="unknown") rec.status="known"; }
  else { rec.wrong++; rec.status="unknown"; }
  rec.lastSeen = Date.now();
  saveState();
}
function markQuizResult(id, correct){
  const rec = STATE.words[id];
  rec.status = correct ? "known" : "unknown";
  if(correct) rec.correct++; else rec.wrong++;
  rec.lastSeen = Date.now();
  saveState();
}

/* ---------------- modal (replaces native alert/confirm) ---------------- */
function showAppAlert(message){
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalMessage').textContent = message;
  const actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  const okBtn = document.createElement('button');
  okBtn.className = 'btn btn-primary'; okBtn.textContent = 'Đóng';
  okBtn.addEventListener('click', ()=>{ overlay.style.display='none'; });
  actions.appendChild(okBtn);
  overlay.style.display='flex';
}
function showAppConfirm(message, onConfirm){
  const overlay = document.getElementById('modalOverlay');
  document.getElementById('modalMessage').textContent = message;
  const actions = document.getElementById('modalActions');
  actions.innerHTML = '';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-ghost'; cancelBtn.textContent = 'Hủy';
  cancelBtn.addEventListener('click', ()=>{ overlay.style.display='none'; });
  const okBtn = document.createElement('button');
  okBtn.className = 'btn btn-primary'; okBtn.textContent = 'Xác nhận';
  okBtn.addEventListener('click', ()=>{ overlay.style.display='none'; onConfirm(); });
  actions.appendChild(cancelBtn); actions.appendChild(okBtn);
  overlay.style.display='flex';
}

/* ---------------- nav ---------------- */
document.querySelectorAll('nav button').forEach(btn=>{
  btn.addEventListener('click', ()=> showView(btn.dataset.view));
});
function showView(name){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active', v.id==='view-'+name));
  if(name==='home') renderHome();
  if(name==='record') renderRecord();
  if(name!=='quiz'){
    stopQuizTimer();
  } else if(document.getElementById('quizArea').style.display==='block' && !quizTimerInterval && quizEndAt>Date.now()){
    quizTimerInterval = setInterval(()=>{
      const remaining = updateTimerDisplay();
      if(remaining<=0){ stopQuizTimer(); showAppAlert('Đã hết giờ làm bài! Quiz sẽ được nộp với các câu đã trả lời.'); finishQuiz(); }
    }, 1000);
  }
  window.scrollTo(0,0);
}

/* ---------------- TTS ---------------- */
function speak(term){
  if(!('speechSynthesis' in window)){ showAppAlert('Trình duyệt này không hỗ trợ phát âm.'); return; }
  const u = new SpeechSynthesisUtterance(term);
  u.lang = 'en-US'; u.rate = 0.9;
  const voices = speechSynthesis.getVoices();
  const v = voices.find(v=>v.lang && v.lang.startsWith('en'));
  if(v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
if('speechSynthesis' in window){ speechSynthesis.onvoiceschanged = ()=>{}; }

/* ---------------- HOME ---------------- */
function renderHome(){
  const known = WORDS.filter(w=>STATE.words[w.id].status==='known').length;
  const unknown = WORDS.filter(w=>STATE.words[w.id].status==='unknown').length;
  const pct = Math.round(known/TOTAL_WORDS*100);
  const lastScore = STATE.quizHistory.length ?
    Math.round(STATE.quizHistory[STATE.quizHistory.length-1].score/STATE.quizHistory[STATE.quizHistory.length-1].total*100)+'%' : '--';
  document.getElementById('homeTotalWords').textContent = TOTAL_WORDS;
  document.getElementById('homeStats').innerHTML = `
    <div class="hero-stats">
      <div class="hero-stat"><div class="num">${known}/${TOTAL_WORDS}</div><div class="lbl">Từ đã thuộc (${pct}%)</div></div>
      <div class="hero-stat"><div class="num">${unknown}</div><div class="lbl">Từ cần ôn lại</div></div>
      <div class="hero-stat"><div class="num">${STATE.quizHistory.length}</div><div class="lbl">Số lượt Quiz</div></div>
      <div class="hero-stat"><div class="num">${lastScore}</div><div class="lbl">Điểm Quiz gần nhất</div></div>
    </div>
  `;
  document.getElementById('catGrid').innerHTML = VOCAB_CATEGORIES.map(c=>{
    const n = wordsInCat(c.id).length;
    return `<button class="cat-item" data-cat="${c.id}">
      <span class="cat-title">${c.title}</span>
      <span class="cat-count">${n} từ</span>
    </button>`;
  }).join('');
  document.querySelectorAll('#catGrid .cat-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      showView('wordlist');
      setCategoryFilter(btn.dataset.cat);
    });
  });
}

/* ---------------- WORDLIST / FLASHCARDS ---------------- */
let flashQueue = [];
let flashIdx = 0;
let flashResult = {known:0, unknown:0};
let flashCurrentAnswered = false;
let selectedCat = 'all';

function renderCatChips(){
  const chips = [{id:'all', title:'Tất cả'}, ...VOCAB_CATEGORIES];
  document.getElementById('catChips').innerHTML = chips.map(c=>
    `<button class="chip ${c.id===selectedCat?'active':''}" data-cat="${c.id}">${c.title}</button>`
  ).join('');
  document.querySelectorAll('#catChips .chip').forEach(btn=>{
    btn.addEventListener('click', ()=> setCategoryFilter(btn.dataset.cat));
  });
}
function setCategoryFilter(catId){
  selectedCat = catId;
  renderCatChips();
  const n = wordsInCat(selectedCat).length;
  document.getElementById('catFilterHint').textContent = `${n} từ trong mục này.`;
}

function weightedSample(pool, n){
  const weighted = [];
  pool.forEach(w=>{
    const st = STATE.words[w.id].status;
    const weight = st==='unknown'?3 : st==='new'?2 : 1;
    for(let i=0;i<weight;i++) weighted.push(w);
  });
  const chosen = []; const usedIds = new Set();
  let guard = 0;
  while(chosen.length < n && weighted.length && guard < 8000){
    guard++;
    const cand = weighted[Math.floor(Math.random()*weighted.length)];
    if(!usedIds.has(cand.id)){ usedIds.add(cand.id); chosen.push(cand); }
  }
  return chosen;
}

document.getElementById('startFlashBtn').addEventListener('click', ()=>{
  const n = parseInt(document.getElementById('sessionSize').value,10);
  const pool = wordsInCat(selectedCat);
  if(!pool.length){ showAppAlert('Không có từ nào trong mục này.'); return; }
  flashQueue = weightedSample(pool, Math.min(n, pool.length));
  startFlashSession();
});
document.getElementById('reviewWrongBtn').addEventListener('click', ()=>{
  const pool = wordsInCat(selectedCat).filter(w=>STATE.words[w.id].status==='unknown');
  if(pool.length===0){ showAppAlert('Chưa có từ nào cần ôn lại trong mục này. Hãy học thêm để hệ thống ghi nhận nhé!'); return; }
  flashQueue = shuffleCopy(pool);
  startFlashSession();
});

function startFlashSession(){
  flashIdx = 0; flashResult = {known:0, unknown:0};
  document.getElementById('wordlistIntro').style.display='none';
  document.getElementById('flashDoneBox').style.display='none';
  document.getElementById('flashArea').style.display='block';
  showFlashCard();
}
function showFlashCard(){
  if(flashIdx >= flashQueue.length){ finishFlashSession(); return; }
  const w = flashQueue[flashIdx];
  flashCurrentAnswered = false;
  document.getElementById('flashProgress').textContent = `Thẻ ${flashIdx+1}/${flashQueue.length}`;
  document.getElementById('flashCat').textContent = CAT_BY_ID[w.cat].title;
  document.getElementById('flashWord').textContent = w.term;
  document.getElementById('flashIpa').textContent = w.ipa;
  document.getElementById('flashPos').textContent = POS_LABEL[w.pos]||w.pos;
  document.getElementById('flashVi').style.display='none';
  document.getElementById('flashVi').textContent = w.vi;
  document.getElementById('flashBadge').textContent = '';
  document.getElementById('flashBadge').className = 'badge-mark';
  document.getElementById('knowRow').style.display='flex';
  document.getElementById('writeCheckBox').style.display='none';
  document.getElementById('writeCheckInput').value='';
  document.getElementById('nextCardBtn').style.display='none';
}
document.getElementById('speakBtn').addEventListener('click', ()=> speak(flashQueue[flashIdx].term));
document.getElementById('btnCross').addEventListener('click', ()=>{
  if(flashCurrentAnswered) return;
  finalizeCard(false);
});
document.getElementById('btnTick').addEventListener('click', ()=>{
  if(flashCurrentAnswered) return;
  document.getElementById('knowRow').style.display='none';
  document.getElementById('flashWord').textContent = '';
  document.getElementById('writeCheckBox').style.display='block';
  const input = document.getElementById('writeCheckInput');
  input.value = '';
  setTimeout(()=>input.focus(), 30);
});
document.getElementById('writeCheckSubmit').addEventListener('click', submitWriteCheck);
document.getElementById('writeCheckInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitWriteCheck(); });
function submitWriteCheck(){
  if(flashCurrentAnswered) return;
  const w = flashQueue[flashIdx];
  const typed = document.getElementById('writeCheckInput').value.trim().toLowerCase();
  if(!typed) return;
  const correct = typed === w.term.toLowerCase();
  finalizeCard(correct);
}
function finalizeCard(correctKnown){
  flashCurrentAnswered = true;
  const w = flashQueue[flashIdx];
  markWordResult(w.id, correctKnown);
  if(correctKnown) flashResult.known++; else flashResult.unknown++;
  document.getElementById('flashWord').textContent = w.term;
  document.getElementById('flashVi').style.display='block';
  const badgeEl = document.getElementById('flashBadge');
  badgeEl.textContent = correctKnown ? '✓' : '✕';
  badgeEl.className = 'badge-mark ' + (correctKnown ? 'known' : 'unknown');
  document.getElementById('knowRow').style.display='none';
  document.getElementById('writeCheckBox').style.display='none';
  document.getElementById('nextCardBtn').style.display='inline-flex';
  if(!correctKnown){
    const insertAt = Math.min(flashQueue.length, flashIdx + 4 + Math.floor(Math.random()*3));
    flashQueue.splice(insertAt, 0, w);
  }
}
document.getElementById('nextCardBtn').addEventListener('click', ()=>{ flashIdx++; showFlashCard(); });
function finishFlashSession(){
  document.getElementById('flashArea').style.display='none';
  document.getElementById('flashDoneBox').style.display='block';
  document.getElementById('flashDoneSummary').textContent =
    `Bạn đã ôn ${flashResult.known+flashResult.unknown} thẻ: ✓ ${flashResult.known} từ đã thuộc, ✕ ${flashResult.unknown} từ cần ôn thêm.`;
}
document.getElementById('flashDoneRestart').addEventListener('click', ()=>{
  document.getElementById('flashDoneBox').style.display='none';
  document.getElementById('wordlistIntro').style.display='block';
});
document.getElementById('flashDoneHome').addEventListener('click', ()=>{
  document.getElementById('flashDoneBox').style.display='none';
  document.getElementById('wordlistIntro').style.display='block';
});

/* ---------------- QUIZ ---------------- */
const QUIZ_SIZE = 30;
const QUIZ_DURATION_SEC = 15*60;
let quizQuestions = [];
let quizIdx = 0;
let quizScore = 0;
let quizAnswered = false;
let quizWrongList = [];
let quizTimerInterval = null;
let quizEndAt = 0;
let quizStartAt = 0;

function formatDuration(sec){
  const m = Math.floor(sec/60), s = sec%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function distractorPool(w, count){
  const others = WORDS.filter(x=>x.id!==w.id && x.vi!==w.vi);
  shuffleArr(others);
  return others.slice(0, count);
}
function fillblankEligible(w){ return (w.pos==='n' || w.pos==='v' || w.pos==='adj') && SENTENCE_TEMPLATES[w.pos]; }

function makeQuestion(w){
  const types = ['w2m','m2w','oddone','spelling','listening'];
  if(fillblankEligible(w)) types.push('fillblank');
  const type = types[Math.floor(Math.random()*types.length)];
  const explain = `'${w.term}' (${POS_LABEL[w.pos]||w.pos}) nghĩa là '${w.vi}'.`;

  if(type==='w2m'){
    const distractors = distractorPool(w,3).map(d=>d.vi);
    const options = shuffleCopy([w.vi, ...distractors]);
    return {type, word:w, prompt:`'${w.term}' nghĩa là gì?`, options, answer:w.vi, explain};
  }
  if(type==='listening'){
    const distractors = distractorPool(w,3).map(d=>d.vi);
    const options = shuffleCopy([w.vi, ...distractors]);
    return {type, word:w, audioWord:w.term, prompt:`▶ Nghe và chọn nghĩa đúng:`, options, answer:w.vi, explain};
  }
  if(type==='m2w'){
    const distractors = distractorPool(w,3).map(d=>d.term);
    const options = shuffleCopy([w.term, ...distractors]);
    return {type, word:w, prompt:`Từ/cụm từ nào có nghĩa là '${w.vi}'?`, options, answer:w.term, explain};
  }
  if(type==='fillblank'){
    const templates = SENTENCE_TEMPLATES[w.pos];
    const template = templates[Math.floor(Math.random()*templates.length)];
    const distractors = distractorPool(w,3).filter(d=>d.pos===w.pos).map(d=>d.term);
    while(distractors.length<3){
      const extra = distractorPool(w,6).map(d=>d.term).find(t=>!distractors.includes(t) && t!==w.term);
      if(!extra) break;
      distractors.push(extra);
    }
    const options = shuffleCopy([w.term, ...distractors.slice(0,3)]);
    return {type, word:w, prompt:`Điền từ có nghĩa là '${w.vi}' vào câu:\n"${template}"`, options, answer:w.term,
      explain:`Câu hoàn chỉnh: "${template.replace('___', w.term)}" — ${explain}`};
  }
  if(type==='oddone'){
    const sameCat = WORDS.filter(x=>x.id!==w.id && x.pos===w.pos);
    shuffleArr(sameCat);
    const same2 = sameCat.slice(0,2);
    const diffCat = WORDS.filter(x=>x.pos!==w.pos);
    shuffleArr(diffCat);
    const diff1 = diffCat[0];
    const options = shuffleCopy([w.term, same2[0].term, same2[1].term, diff1.term]);
    return {type, word:w, prompt:`Từ nào KHÁC LOẠI (từ loại) so với 3 từ còn lại?`, options, answer:diff1.term,
      explain:`'${same2[0].term}', '${same2[1].term}' và '${w.term}' đều là ${POS_LABEL[w.pos]||w.pos}, còn '${diff1.term}' là ${POS_LABEL[diff1.pos]||diff1.pos} — nghĩa là '${diff1.vi}'.`};
  }
  if(type==='spelling'){
    const target = w.term.toLowerCase();
    const letters = target.replace(/[^a-z]/g,'').split('');
    let scrambled = letters.slice();
    let tries=0;
    do{ shuffleArr(scrambled); tries++; } while(scrambled.join('')===letters.join('') && tries<10);
    return {type, word:w, prompt:`Sắp xếp các chữ cái để tạo thành từ có nghĩa là '${w.vi}':`,
      letters:scrambled, answer:letters.join(''), displayWord:w.term, explain};
  }
}

document.getElementById('startQuizBtn').addEventListener('click', buildQuiz);
function buildQuiz(){
  const pool = weightedSample(WORDS, Math.min(QUIZ_SIZE, TOTAL_WORDS));
  quizQuestions = pool.map(w => makeQuestion(w));
  quizIdx = 0; quizScore = 0; quizWrongList = []; quizStartAt = Date.now();
  document.getElementById('quizIntro').style.display='none';
  document.getElementById('quizResultBox').style.display='none';
  document.getElementById('quizArea').style.display='block';
  startQuizTimer();
  showQuizQuestion();
}
function startQuizTimer(){
  stopQuizTimer();
  quizEndAt = Date.now() + QUIZ_DURATION_SEC*1000;
  updateTimerDisplay();
  quizTimerInterval = setInterval(()=>{
    const remaining = updateTimerDisplay();
    if(remaining<=0){
      stopQuizTimer();
      showAppAlert('Đã hết giờ làm bài! Quiz sẽ được nộp với các câu đã trả lời.');
      finishQuiz();
    }
  }, 1000);
}
function stopQuizTimer(){ if(quizTimerInterval){ clearInterval(quizTimerInterval); quizTimerInterval=null; } }
function updateTimerDisplay(){
  const remaining = Math.max(0, Math.round((quizEndAt - Date.now())/1000));
  const el = document.getElementById('quizTimer');
  if(el){
    el.textContent = `⏱ ${formatDuration(remaining)}`;
    el.classList.toggle('warn', remaining<=60);
  }
  return remaining;
}

function showQuizQuestion(){
  quizAnswered = false;
  document.getElementById('quizProgress').textContent = `Câu ${quizIdx+1}/${quizQuestions.length} — Điểm: ${quizScore}`;
  const q = quizQuestions[quizIdx];
  const box = document.getElementById('quizQuestionBox');

  if(q.type==='spelling'){
    box.innerHTML = `
      <div class="card qcard">
        <span class="qlabel">Sắp xếp chữ cái</span>
        <div class="qtext">${q.prompt}</div>
        <div class="spell-answer" id="spellAnswer"></div>
        <div class="letters-row" id="spellTiles"></div>
        <div style="display:flex; gap:10px; justify-content:center; margin-top:18px;">
          <button class="btn btn-ghost" id="spellClear">Xoá</button>
          <button class="speak-btn" id="spellSpeak">▶ Nghe gợi ý</button>
        </div>
        <div id="quizExplainBox"></div>
      </div>
    `;
    let built = [];
    function renderSpell(){
      document.getElementById('spellAnswer').innerHTML = q.answer.split('').map((_,i)=>
        `<span class="spell-slot">${built[i]?built[i].toUpperCase():''}</span>`).join('');
    }
    renderSpell();
    document.getElementById('spellTiles').innerHTML = q.letters.map((l,i)=>
      `<button class="letter-tile" data-i="${i}">${l.toUpperCase()}</button>`).join('');
    document.getElementById('spellTiles').querySelectorAll('.letter-tile').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(quizAnswered || btn.classList.contains('used')) return;
        btn.classList.add('used');
        built.push(btn.textContent.toLowerCase());
        renderSpell();
        if(built.length === q.answer.length){
          const correct = built.join('') === q.answer;
          finishQuizAnswer(correct, q);
        }
      });
    });
    document.getElementById('spellClear').addEventListener('click', ()=>{
      if(quizAnswered) return;
      built = [];
      document.getElementById('spellTiles').querySelectorAll('.letter-tile').forEach(b=>b.classList.remove('used'));
      renderSpell();
    });
    document.getElementById('spellSpeak').addEventListener('click', ()=> speak(q.displayWord));
  } else {
    box.innerHTML = `
      <div class="card qcard">
        <span class="qlabel">${CAT_BY_ID[q.word.cat].title}</span>
        <div class="qtext">${q.prompt}</div>
        ${q.audioWord ? `<button class="speak-btn" id="quizAudioBtn" style="margin-top:14px;">▶ Nghe lại</button>` : ''}
        <div class="options" id="optionsBox"></div>
        <div id="quizExplainBox"></div>
      </div>
    `;
    if(q.audioWord){
      document.getElementById('quizAudioBtn').addEventListener('click', ()=> speak(q.audioWord));
      speak(q.audioWord);
    }
    const optBox = document.getElementById('optionsBox');
    const letters = ['A','B','C','D'];
    q.options.forEach((opt,i)=>{
      const b = document.createElement('button');
      b.className='opt';
      b.innerHTML = `<span class="letter">${letters[i]}</span><span>${opt}</span>`;
      b.addEventListener('click', ()=>{
        if(quizAnswered) return;
        const correct = opt === q.answer;
        finishQuizAnswer(correct, q, b, optBox);
      });
      optBox.appendChild(b);
    });
  }
}
function finishQuizAnswer(correct, q, clickedBtn, optBox){
  quizAnswered = true;
  markQuizResult(q.word.id, correct);
  if(correct) quizScore++;
  else quizWrongList.push(q);
  if(optBox){
    optBox.querySelectorAll('.opt').forEach(b=>{
      b.disabled = true;
      const label = b.querySelector('span:last-child').textContent;
      if(label === q.answer) b.classList.add('correct');
      else if(b===clickedBtn) b.classList.add('wrong');
    });
  }
  document.getElementById('quizExplainBox').innerHTML =
    `<div class="explain-box">${correct?'✓ Chính xác! ':'✕ Chưa đúng. '}${q.explain}</div>
     <button class="btn btn-primary" id="quizNextBtn" style="margin-top:16px;">${quizIdx+1<quizQuestions.length?'Câu tiếp theo →':'Xem kết quả'}</button>`;
  document.getElementById('quizProgress').textContent = `Câu ${quizIdx+1}/${quizQuestions.length} — Điểm: ${quizScore}`;
  document.getElementById('quizNextBtn').addEventListener('click', ()=>{
    quizIdx++;
    if(quizIdx>=quizQuestions.length) finishQuiz(); else showQuizQuestion();
  });
}
function finishQuiz(){
  stopQuizTimer();
  const timeSpentSec = Math.max(0, Math.round((Date.now()-quizStartAt)/1000));
  STATE.quizHistory.push({date:Date.now(), score:quizScore, total:quizQuestions.length, timeSpentSec});
  saveState();
  document.getElementById('quizArea').style.display='none';
  document.getElementById('quizResultBox').style.display='block';
  const pct = Math.round(quizScore/quizQuestions.length*100);
  document.getElementById('quizResultSummary').innerHTML = `
    <div class="score-band">
      <div class="stamp"><div class="frac">${quizScore}/${quizQuestions.length}</div><div class="pct">${pct}%</div></div>
      <div class="score-copy">
        <h2>${pct>=80?'Xuất sắc!':pct>=50?'Khá tốt!':'Cần ôn tập thêm'}</h2>
        <p>${pct>=80?'Bạn nắm rất vững từ vựng TOEIC ở mức này. Hãy thử một mục từ vựng mới!':pct>=50?'Bạn đang tiến bộ tốt. Ôn lại các từ đã sai để nhớ lâu hơn.':'Hãy dùng Flashcard để ôn lại các từ đã sai bên dưới, sau đó làm quiz lại.'}</p>
      </div>
    </div>
  `;
  const wrongBox = document.getElementById('quizWrongList');
  if(quizWrongList.length===0){
    wrongBox.innerHTML = `<p class="all-good">Không có câu nào sai — tuyệt vời!</p>`;
  } else {
    wrongBox.innerHTML = `<div class="weak-chips">` + quizWrongList.map(q=>
      `<span class="weak-chip">${q.word.term} — ${q.word.vi}</span>`).join('') + `</div>`;
  }
}
document.getElementById('quizRestartBtn').addEventListener('click', ()=>{
  document.getElementById('quizResultBox').style.display='none';
  document.getElementById('quizIntro').style.display='block';
});
document.getElementById('quizHomeBtn').addEventListener('click', ()=>{
  document.getElementById('quizResultBox').style.display='none';
  document.getElementById('quizIntro').style.display='block';
  showView('home');
});

/* ---------------- RECORD ---------------- */
function renderRecord(){
  const known = WORDS.filter(w=>STATE.words[w.id].status==='known').length;
  const unknownList = WORDS.filter(w=>STATE.words[w.id].status==='unknown');
  const pct = Math.round(known/TOTAL_WORDS*100);
  const avgScore = STATE.quizHistory.length ?
    Math.round(STATE.quizHistory.reduce((s,q)=>s+q.score/q.total,0)/STATE.quizHistory.length*100) : 0;

  document.getElementById('recordStats').innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><div class="num">${known}/${TOTAL_WORDS}</div><div class="lbl">Từ đã thuộc (${pct}%)</div></div>
      <div class="stat-box"><div class="num">${unknownList.length}</div><div class="lbl">Từ cần ôn lại</div></div>
      <div class="stat-box"><div class="num">${STATE.quizHistory.length}</div><div class="lbl">Số lượt Quiz</div></div>
      <div class="stat-box"><div class="num">${avgScore}%</div><div class="lbl">Điểm Quiz trung bình</div></div>
    </div>
  `;

  const topWrong = WORDS.filter(w=>STATE.words[w.id].wrong>0)
    .sort((a,b)=>STATE.words[b.id].wrong-STATE.words[a.id].wrong).slice(0,10);
  document.getElementById('wrongTopList').innerHTML = topWrong.length ? `<div class="weak-chips">` + topWrong.map(w=>
    `<span class="weak-chip">${w.term} — ${w.vi} (sai ${STATE.words[w.id].wrong} lần)</span>`).join('') + `</div>`
    : `<p class="muted">Chưa có dữ liệu — hãy làm Flashcard hoặc Quiz trước!</p>`;

  document.getElementById('needReviewList').innerHTML = unknownList.length ? unknownList.slice(0,15).map(w=>
    `<div class="history-row"><span>${w.term} <span class="muted">(${w.vi})</span></span><span class="muted">${POS_LABEL[w.pos]||w.pos}</span></div>`
  ).join('') : `<p class="muted">Không có từ nào cần ôn lại. Tuyệt vời!</p>`;

  const hist = STATE.quizHistory.slice().reverse().slice(0,10);
  document.getElementById('quizHistoryList').innerHTML = hist.length ? hist.map(h=>
    `<div class="history-row"><span class="date">${new Date(h.date).toLocaleDateString('vi-VN')} ${new Date(h.date).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</span><span class="muted">${h.timeSpentSec!=null?formatDuration(h.timeSpentSec):'--'}</span><span class="score">${h.score}/${h.total} (${Math.round(h.score/h.total*100)}%)</span></div>`
  ).join('') : `<p class="muted">Chưa có lượt Quiz nào.</p>`;
}
document.getElementById('goReviewBtn').addEventListener('click', ()=>{
  showView('wordlist');
  setCategoryFilter('all');
  document.getElementById('reviewWrongBtn').click();
});
document.getElementById('resetProgressBtn').addEventListener('click', ()=>{
  showAppConfirm('Bạn có chắc muốn xoá toàn bộ tiến độ học? Hành động này không thể hoàn tác.', ()=>{
    if(HAS_STORAGE){ try{ localStorage.removeItem(STORE_KEY); }catch(e){} }
    memoryState = null;
    STATE = loadState();
    renderRecord();
    renderHome();
    showAppAlert('Đã xoá toàn bộ tiến độ.');
  });
});

/* ---------------- INIT ---------------- */
renderCatChips();
setCategoryFilter('all');
renderHome();
