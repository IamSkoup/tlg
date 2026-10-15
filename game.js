(function () {
  'use strict';
  const story = window.ECHO_STORY;
  const SAVE_KEY = 'tlg_echo_save_v1';
  const PREF_KEY = 'tlg_echo_settings_v1';
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['art','menu','game','ending-screen','chapter-kicker','chapter-name','chapter-card','toast','qte-counter','choice-panel','dialogue','portrait','speaker','line','next-indicator','modal','modal-title','modal-content','ending-title','ending-description','danger-fx','dust-fx','roar-fx'].map(id => [id, $(id)]));
  const art = {
    treeMorning: ['tree-morning.png'],
    treeSunset: ['landscapes-one.png',0,0], treeNight: ['landscapes-one.png',1,0], riverDry: ['landscapes-one.png',0,1], forest: ['landscapes-one.png',1,1],
    mountain: ['landscapes-two.png',0,0], gorge: ['landscapes-two.png',1,0], valley: ['landscapes-two.png',0,1], dryLake: ['landscapes-two.png',1,1],
    dam: ['landscapes-three.png',0,0], channel: ['landscapes-three.png',1,0], damStorm: ['landscapes-three.png',0,1], twoRivers: ['landscapes-three.png',1,1],
    riverMoon: ['landscapes-four.png',0,0], gorgeHigh: ['landscapes-four.png',1,0], waterfall: ['landscapes-four.png',0,1], canalSunset: ['landscapes-four.png',1,1],
    treeCanopy: ['landscapes-five.png',0,0], forestDusk: ['landscapes-five.png',1,0], ridgeSun: ['landscapes-five.png',0,1], gorgeMoon: ['landscapes-five.png',1,1],
    cgMorning: ['story-one.png',0,0], cgRiver: ['story-one.png',1,0], cgBeshte: ['story-one.png',0,1], cgCouncil: ['story-one.png',1,1],
    cgConfront: ['story-two.png',0,0], cgTarekNuri: ['story-two.png',1,0], cgTracks: ['story-two.png',0,1], cgCollapse: ['story-two.png',1,1],
    cgAzad: ['story-three.png',0,0], cgValley: ['story-three.png',1,0], cgNightPride: ['story-three.png',0,1], cgScouts: ['story-three.png',1,1],
    cgFight: ['battle-one.png',0,0], cgRoar: ['battle-one.png',1,0], cgFlank: ['battle-one.png',0,1], cgFinalFight: ['battle-one.png',1,1],
    cgMoonCouncil: ['story-four.png',0,0], cgBirdGate: ['story-four.png',1,0], cgAzadRun: ['story-four.png',0,1], cgTarekRest: ['story-four.png',1,1],
    cgLakeTalk: ['story-five.png',0,0], cgMap: ['story-five.png',1,0], cgWaterfallTalk: ['story-five.png',0,1], cgParley: ['story-five.png',1,1],
    cgRescue: ['story-two.png',1,1], cgTwoBanks: ['two-banks.png'],
    endingTwo: ['endings.png',0,0], endingDry: ['endings.png',1,0], endingForce: ['endings.png',0,1], endingCompromise: ['endings.png',1,1], endingFracture: ['treeNight']
  };
  const portraits = { 'Кайон':0, 'Рани':1, 'Фули':2, 'Тарек':3, 'Нури':4 };
  const speeds = {slow:48, normal:28, fast:12, instant:0};
  const initialStats = { TRUST_RANI:50, TEAM_TRUST:50, MERCY:50, CONFIDENCE:50, ROAR_CONTROL:50, STAMINA:100, FOCUS:100 };
  const initialSettings = { speed:'normal', qte:'off', reducedMotion:false, volume:35 };
  let state = null, typing = null, typedFull = '', qteInterval = null, qteEnd = 0, modalReturnFocus = null, toastTimer = null, audioContext = null, transitionPending = false;

  function safeStore() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch (e) { toast('Браузер не разрешил сохранить прогресс.'); return false; } }
  function readSave() { try { const raw=localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch(e) { return null; } }
  function readPrefs(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||'null')||{};}catch(e){return {};}}
  function savePrefs(settings){try{localStorage.setItem(PREF_KEY,JSON.stringify(settings));}catch(e){toast('Не удалось сохранить настройки.');}}
  function freshState(keep) { return { version:1, sceneId:story.opening, lineIndex:0, stats:{...initialStats}, flags:{}, damage:0, seenScenes:[], chapterSnapshots:{}, endings:keep?.endings || {}, settings:{...initialSettings,...readPrefs(),...(keep?.settings||{})}, backlog:[], timestamp:Date.now() }; }
  function validState(s) { return s && typeof s==='object' && (story.scenes[s.sceneId] || /^ending:/.test(s.sceneId) && story.endings[s.sceneId.slice(7)]) && s.stats && typeof s.stats==='object' && s.flags && typeof s.flags==='object' && Number.isFinite(s.damage); }
  function normalizeState(s) {
    if (!validState(s)) return null;
    const out=freshState(s); out.sceneId=s.sceneId; out.lineIndex=Number.isInteger(s.lineIndex)?Math.max(0,s.lineIndex):0;
    for(const key of Object.keys(initialStats)) out.stats[key]=Number.isFinite(s.stats[key])?Math.max(0,Math.min(100,s.stats[key])):initialStats[key];
    out.flags={...s.flags}; out.damage=Math.max(0,Math.min(99,s.damage)); out.seenScenes=Array.isArray(s.seenScenes)?s.seenScenes.filter(id=>!!story.scenes[id]):[];
    out.chapterSnapshots=s.chapterSnapshots && typeof s.chapterSnapshots==='object'?s.chapterSnapshots:{};
    out.endings=s.endings && typeof s.endings==='object'?s.endings:{};
    out.backlog=Array.isArray(s.backlog)?s.backlog.slice(-120):[];
    out.settings={...initialSettings,...s.settings};
    if(!speeds.hasOwnProperty(out.settings.speed))out.settings.speed='normal';
    if(!['on','extended','off'].includes(out.settings.qte))out.settings.qte='off';
    out.settings.volume=Math.max(0,Math.min(100,Number(out.settings.volume)||0));
    return out;
  }
  function persist() { if(state){state.timestamp=Date.now();safeStore();} updateContinue(); }
  function updateContinue(){ $('continue-game').disabled=!validState(readSave()); }
  function showScreen(which) { ui.menu.classList.toggle('hidden',which!=='menu'); ui.game.classList.toggle('hidden',which!=='game'); ui['ending-screen'].classList.toggle('hidden',which!=='ending'); }
  function isReduced() { return state?.settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function applySettings(){document.body.classList.toggle('reduce-motion',!!state?.settings.reducedMotion);}
  function artInfo(key) { const a=art[key]; if(!a)return art.treeMorning; return typeof a[0]==='string' && a.length===1 && art[a[0]] ? artInfo(a[0]) : a; }
  function artStyle(key, element) { const a=artInfo(key); const file=a[0]; element.style.backgroundImage='url("assets/images/'+file+'")'; element.style.backgroundSize=a.length===3?'auto 200%':'cover'; element.style.backgroundPosition=a.length===3?(a[1]?'right':'left')+' '+(a[2]?'bottom':'top'):'center'; }
  function showArt(key){if(!key)return; const a=artInfo(key); const target='assets/images/'+a[0]+':' +(a[1]||0)+':' +(a[2]||0); if(ui.art.dataset.current===target)return; ui.art.classList.add('shifting'); setTimeout(()=>{artStyle(key,ui.art);ui.art.dataset.current=target;ui.art.classList.remove('shifting');},isReduced()?0:170);}
  function chapterOf(id){const scene=story.scenes[id];return scene?story.chapters.find(c=>c[0]===scene.chapter):story.chapters.at(-1);}
  function lineVisible(l){const w=l.when;if(!w)return true; if(w.flag && !state.flags[w.flag])return false; if(w.notFlag && state.flags[w.notFlag])return false; if(w.notFlag2 && state.flags[w.notFlag2])return false; if(w.statMin && state.stats[w.statMin[0]]<w.statMin[1])return false;return true;}
  function current(){if(state.sceneId.startsWith('ending:'))return {id:state.sceneId,chapter:'final',art:story.endings[state.sceneId.slice(7)].art,lines:story.endings[state.sceneId.slice(7)].lines,next:null,ending:true};return story.scenes[state.sceneId];}
  function visibleLines(scene){return scene.lines.filter(lineVisible);}
  function stopTyping(){if(typing){clearInterval(typing);typing=null;}typedFull='';}
  function stopQte(){if(qteInterval){clearInterval(qteInterval);qteInterval=null;}ui['qte-counter'].classList.add('hidden');}
  function playTone(freq=440,duration=.08,type='sine'){if(!state || state.settings.volume<=0)return;try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,audioContext.currentTime);gain.gain.setValueAtTime(.035*state.settings.volume/100,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audioContext.currentTime+duration);osc.connect(gain).connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+duration);}catch(e){}}
  function roarFx(){ui['roar-fx'].classList.remove('active');void ui['roar-fx'].offsetWidth;ui['roar-fx'].classList.add('active');playTone(95,.5,'sawtooth');setTimeout(()=>ui['roar-fx'].classList.remove('active'),1100);}
  function dustFx(){ui['dust-fx'].classList.remove('active');void ui['dust-fx'].offsetWidth;ui['dust-fx'].classList.add('active');setTimeout(()=>ui['dust-fx'].classList.remove('active'),850);}
  function toast(message){clearTimeout(toastTimer);ui.toast.textContent=message;ui.toast.classList.remove('hidden');void ui.toast.offsetWidth;toastTimer=setTimeout(()=>ui.toast.classList.add('hidden'),2900);}
  function maybeCard(chapter){const span=ui['chapter-card'].querySelector('span'),title=ui['chapter-card'].querySelector('strong');span.textContent=chapter[1];title.textContent=chapter[2];ui['chapter-card'].classList.remove('hidden');void ui['chapter-card'].offsetWidth;setTimeout(()=>ui['chapter-card'].classList.add('hidden'),isReduced()?400:2500);}
  function enterScene(id, options={}){
    transitionPending=false;stopTyping();stopQte();if(id==='@ending'){id='ending:'+resolveEnding();}
    if(!story.scenes[id]&&!/^ending:/.test(id))throw Error('Unknown scene: '+id);
    const oldChapter=state.sceneId&&story.scenes[state.sceneId]?.chapter;
    state.sceneId=id;state.lineIndex=0;
    const scene=current();const chapter=chapterOf(id);if(chapter){ui['chapter-kicker'].textContent=chapter[1];ui['chapter-name'].textContent=chapter[2];}
    if(!scene.ending){if(!state.seenScenes.includes(id))state.seenScenes.push(id);if(!state.chapterSnapshots[scene.chapter])state.chapterSnapshots[scene.chapter]={sceneId:id,stats:{...state.stats},flags:{...state.flags},damage:state.damage};if(!options.quiet&&oldChapter!==scene.chapter)maybeCard(chapter);}
    ui['danger-fx'].classList.toggle('active',state.damage>=3);
    showScreen('game');showArt(scene.art);render();persist();
  }
  function resume(){const s=normalizeState(readSave());if(!s){toast('Сохранение не найдено.');return;}state=s;applySettings();const scene=current();const chapter=chapterOf(state.sceneId);ui['chapter-kicker'].textContent=chapter[1];ui['chapter-name'].textContent=chapter[2];showScreen('game');showArt(scene.art);ui['danger-fx'].classList.toggle('active',state.damage>=3);render();}
  function startNew(){const old=normalizeState(readSave());state=freshState(old);applySettings();enterScene(story.opening);}
  function recordLine(scene,line,index){const key=scene.id+':'+index;if(state.backlog.at(-1)?.key===key)return;state.backlog.push({key,speaker:line.speaker,text:line.text});state.backlog=state.backlog.slice(-120);}
  function render(){const scene=current();const lines=visibleLines(scene);ui['choice-panel'].classList.add('hidden');ui['choice-panel'].replaceChildren();stopQte();if(state.lineIndex<lines.length){const line=lines[state.lineIndex];if(line.art)showArt(line.art);recordLine(scene,line,state.lineIndex);ui.speaker.textContent=line.speaker||'';ui.line.textContent='';ui['next-indicator'].classList.add('hidden');if(Object.hasOwn(portraits,line.speaker)){ui.portrait.classList.remove('hidden');ui.portrait.style.backgroundImage='url("assets/images/characters.png")';ui.portrait.style.backgroundPosition=(portraits[line.speaker]*25)+'% center';}else ui.portrait.classList.add('hidden');typeLine(line.text);persist();return;}ui.portrait.classList.add('hidden');ui.speaker.textContent='';ui.line.textContent=scene.ending?'История завершена. Нажмите, чтобы увидеть итог.':scene.choices?'Ваше решение изменит дальнейшие события.':'Продолжить.';ui['next-indicator'].classList.remove('hidden');if(scene.choices)showChoices(scene);else if(scene.ending)finishEnding();}
  function typeLine(text){stopTyping();typedFull=text;const speed=speeds[state.settings.speed];if(!speed||isReduced()){ui.line.textContent=text;ui['next-indicator'].classList.remove('hidden');return;}const chars=[...text];let i=0;typing=setInterval(()=>{i=Math.min(chars.length,i+2);ui.line.textContent=chars.slice(0,i).join('');if(i>=chars.length){clearInterval(typing);typing=null;ui['next-indicator'].classList.remove('hidden');}},speed);}
  function advance(){if(transitionPending||ui.game.classList.contains('hidden')||!ui.modal.classList.contains('hidden'))return;if(typing){clearInterval(typing);typing=null;ui.line.textContent=typedFull;ui['next-indicator'].classList.remove('hidden');return;}const scene=current(),lines=visibleLines(scene);if(state.lineIndex<lines.length){state.lineIndex++;render();return;}if(scene.choices)return;if(scene.ending){finishEnding();return;}enterScene(scene.next);}
  function canChoose(c){if(c.requires)for(const [name,min] of Object.entries(c.requires))if((state.stats[name]||0)<min)return false;if(c.requireFlags)for(const flag of c.requireFlags)if(!state.flags[flag])return false;return true;}
  function lockedReason(c){if(c.requireFlags)return 'Нужны сведения, спасение Тарека и доверие его семьи.';if(c.requires?.TEAM_TRUST)return 'Нужно доверие команды.';if(c.requires?.STAMINA)return 'Не хватает сил.';if(c.requires?.ROAR_CONTROL)return 'Нужны контроль Рыка и доверие команды.';return 'Пока недоступно.';}
  function showChoices(scene){ui['choice-panel'].classList.remove('hidden');scene.choices.forEach((choice,i)=>{const b=document.createElement('button');b.className='choice';const span=document.createElement('span');span.className='index';span.textContent=String(i+1).padStart(2,'0');b.append(span,document.createTextNode(choice.text));if(!canChoose(choice)){b.disabled=true;const note=document.createElement('small');note.textContent=lockedReason(choice);b.append(note);}else b.addEventListener('click',()=>choose(choice));ui['choice-panel'].append(b);});if(scene.qte&&state.settings.qte!=='off'){const seconds=state.settings.qte==='extended'?12:6;qteEnd=Date.now()+seconds*1000;ui['qte-counter'].classList.remove('hidden');const tick=()=>{const n=Math.max(0,Math.ceil((qteEnd-Date.now())/1000));ui['qte-counter'].textContent='Решение: '+n+' с';if(n<=0){stopQte();const fallback=scene.choices.find(canChoose);if(fallback){toast('Время вышло — Кайон действует первым порывом.');choose(fallback);}}};tick();qteInterval=setInterval(tick,150);}}
  function choose(choice){if(transitionPending||!canChoose(choice))return;transitionPending=true;ui['choice-panel'].classList.add('hidden');stopQte();playTone(520,.07);for(const [key,value] of Object.entries(choice.effects||{}))state.stats[key]=Math.max(0,Math.min(100,(state.stats[key]||0)+value));if(choice.flags)Object.assign(state.flags,choice.flags);if(choice.damage){state.damage+=choice.damage;dustFx();}if(choice.roar)roarFx();if(choice.notice)toast(choice.notice);enterScene(choice.next);}
  function resolveEnding(){const f=state.flags,s=state.stats;if(state.damage>=5||f.finalStrategy==='open')return 'dryRoots';if(s.TRUST_RANI<25)return 'fracture';if(f.finalStrategy==='restore'&&s.MERCY>=65&&s.TRUST_RANI>=40&&s.TEAM_TRUST>=48&&s.ROAR_CONTROL>=40&&f.savedNuri&&f.rescuedTarek&&f.oldChannel)return 'twoRivers';if(f.finalStrategy==='seal')return 'kingsStrength';return 'compromise';}
  function finishEnding(){const key=state.sceneId.slice(7);if(!story.endings[key])return;const previous=state.endings[key];state.endings[key]=previous||new Date().toISOString();persist();ui['ending-title'].textContent=story.endings[key].title;ui['ending-description'].textContent=story.endings[key].description;showArt(story.endings[key].art);showScreen('ending');}
  function returnMenu(){transitionPending=false;stopTyping();stopQte();if(state)persist();showArt('treeSunset');showScreen('menu');updateContinue();}
  function openModal(title,build){modalReturnFocus=document.activeElement;ui['modal-title'].textContent=title;ui['modal-content'].replaceChildren();build(ui['modal-content']);ui.modal.classList.remove('hidden');$('modal-close').focus();stopQte();}
  function closeModal(){ui.modal.classList.add('hidden');modalReturnFocus?.focus();if(state&&!ui.game.classList.contains('hidden')){const scene=current();if(scene.choices&&state.lineIndex>=visibleLines(scene).length)showChoices(scene);}}
  function makeButton(text,action,css='button'){const b=document.createElement('button');b.className=css;b.textContent=text;b.addEventListener('click',action);return b;}
  function textNode(tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
  function showHistory(){openModal('История диалогов',root=>{const list=state?.backlog||[];if(!list.length)root.append(textNode('p','Пока нет реплик.'));else for(const item of list.slice(-80)){const e=textNode('div','', 'history-entry');if(item.speaker)e.append(textNode('strong',item.speaker));e.append(textNode('p',item.text));root.append(e);}root.scrollTop=root.scrollHeight;});}
  function showSettings(){const settings=state?.settings||normalizeState(readSave())?.settings||{...initialSettings,...readPrefs()};const update=()=>{savePrefs(settings);if(state)persist();};openModal('Настройки',root=>{
    const row=(label,control)=>{const div=textNode('div','', 'setting-row');const lab=textNode('label',label);div.append(lab,control);root.append(div);return lab;};
    const speed=document.createElement('select');for(const [value,label] of [['slow','Медленно'],['normal','Нормально'],['fast','Быстро'],['instant','Мгновенно']]){const opt=new Option(label,value);speed.append(opt);}speed.value=settings.speed;speed.addEventListener('change',()=>{settings.speed=speed.value;update();});row('Скорость текста',speed);
    const qte=document.createElement('select');for(const [value,label] of [['off','Отключены'],['on','Включены — 6 с'],['extended','Увеличенное время — 12 с']])qte.append(new Option(label,value));qte.value=settings.qte;qte.addEventListener('change',()=>{settings.qte=qte.value;update();});row('QTE',qte);
    const motion=document.createElement('input');motion.type='checkbox';motion.checked=!!settings.reducedMotion;motion.addEventListener('change',()=>{settings.reducedMotion=motion.checked;applySettings();update();});row('Уменьшить анимации',motion);
    const vol=document.createElement('input');vol.type='range';vol.min='0';vol.max='100';vol.value=String(settings.volume);vol.addEventListener('input',()=>{settings.volume=Number(vol.value);update();});row('Громкость эффектов',vol);
    const actions=textNode('div','', 'modal-actions');actions.append(makeButton('Экспорт сохранения',exportSave),makeButton('Импорт сохранения',importSave),makeButton('Удалить сохранение',deleteSave,'button danger-button'));root.append(actions);
    root.append(textNode('p','Автосохранение выполняется после каждого решения и перехода между главами. Звуки создаются браузером и работают без сети.'));
  });}
  function exportSave(){const save=state||normalizeState(readSave());if(!save){toast('Нет сохранения для экспорта.');return;}const blob=new Blob([JSON.stringify(save,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='echoes-of-the-tree-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function importSave(){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.style.display='none';document.body.append(input);input.onchange=async()=>{try{if(!input.files?.length)return;const parsed=JSON.parse(await input.files[0].text());const newState=normalizeState(parsed);if(!newState)throw Error('Неверный формат');state=newState;applySettings();persist();closeModal();resume();toast('Сохранение загружено.');}catch(e){toast('Не удалось импортировать сохранение.');}finally{input.remove();}};input.click();}
  function deleteSave(){if(!confirm('Удалить сохранение, открытые концовки и настройки?'))return;try{localStorage.removeItem(SAVE_KEY);localStorage.removeItem(PREF_KEY);}catch(e){}state=null;closeModal();returnMenu();toast('Сохранение удалено.');}
  function showChapters(){const saved=normalizeState(readSave());openModal('Главы',root=>{const list=textNode('div','', 'chapter-list');for(const c of story.chapters){const item=textNode('div','', 'chapter-item');item.append(textNode('small',c[1]),textNode('strong',c[2]));const snap=saved?.chapterSnapshots[c[0]];item.append(textNode('p',snap?'Доступна точка начала главы. Сюжет продолжится с состоянием того прохождения.':'Откроется после первого посещения.'));if(snap)item.append(makeButton('Начать с этой главы',()=>{const keep=normalizeState(readSave());state=freshState(keep);state.stats={...snap.stats};state.flags={...snap.flags};state.damage=snap.damage;state.chapterSnapshots={...keep.chapterSnapshots};state.seenScenes=[...keep.seenScenes];closeModal();enterScene(snap.sceneId);},'button'));list.append(item);}root.append(list);});}
  function showEndings(){const saved=normalizeState(readSave()),found=saved?.endings||{};openModal('Концовки',root=>{const list=textNode('div','', 'ending-list');for(const [key,e] of Object.entries(story.endings)){const unlocked=!!found[key],item=textNode('div','', 'ending-item');if(unlocked){const thumb=textNode('div','', 'ending-thumb');artStyle(e.art,thumb);item.append(thumb);}item.append(textNode('small',unlocked?'ОТКРЫТО • '+new Date(found[key]).toLocaleDateString('ru-RU'):'????'),textNode('strong',unlocked?e.title:'????'));if(unlocked)item.append(textNode('p',e.description));list.append(item);}root.append(list);});}

  $('new-game').addEventListener('click',()=>{if(validState(readSave())&&!confirm('Начать новую игру? Текущий маршрут будет перезаписан, открытые концовки сохранятся.'))return;startNew();});
  $('continue-game').addEventListener('click',resume);
  $('chapters-button').addEventListener('click',showChapters);
  $('endings-button').addEventListener('click',showEndings);
  $('settings-button').addEventListener('click',showSettings);
  $('history-button').addEventListener('click',showHistory);
  $('game-settings-button').addEventListener('click',showSettings);
  $('menu-button').addEventListener('click',returnMenu);
  $('ending-menu').addEventListener('click',returnMenu);
  $('ending-restart').addEventListener('click',startNew);
  $('modal-close').addEventListener('click',closeModal);
  ui.modal.addEventListener('click',e=>{if(e.target===ui.modal)closeModal();});
  ui.dialogue.addEventListener('click',advance);
  ui.dialogue.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();advance();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!ui.modal.classList.contains('hidden')){closeModal();return;}if(!ui.modal.classList.contains('hidden')||ui.game.classList.contains('hidden'))return;if(/^[1-4]$/.test(e.key)&&!ui['choice-panel'].classList.contains('hidden')){const b=ui['choice-panel'].children[Number(e.key)-1];if(b&&!b.disabled)b.click();}else if((e.key===' '||e.key==='Enter')&&document.activeElement===document.body){e.preventDefault();advance();}});
  window.addEventListener('beforeunload',()=>{if(state)persist();});
  const saved=normalizeState(readSave());if(saved){state=saved;applySettings();}showArt('treeSunset');showScreen('menu');updateContinue();
  // Exposed only for automated route validation in this repository.
  window.ECHO_DEBUG={ getState:()=>state, startNew, enterScene, choose, resolveEnding, art };
})();
