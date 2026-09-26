
(function(){
  'use strict';
  var SUPABASE_URL='https://ojmiuvlrffbojvofegad.supabase.co';
  var SUPABASE_KEY='sb_publishable_xQPKqBIqtWFxv20Qrob_qg_UC6QY_a8';
  var ENDPOINT=SUPABASE_URL+'/functions/v1/despega-ai';
  var STORAGE_SESSION='despegaNovaChatSession';
  var STORAGE_MESSAGES='despegaNovaChatMessages';
  var MAX_LOCAL_MESSAGES=40;
  var CHAT_TIMEOUT_MS=18000;
  var allowedViews=new Set(['home','route','opportunities','progress','profile']);
  var state={sessionId:localStorage.getItem(STORAGE_SESSION)||(crypto.randomUUID?crypto.randomUUID():'chat-'+Date.now()),messages:readJSON(STORAGE_MESSAGES,[]),isSending:false,lastFailed:null};
  localStorage.setItem(STORAGE_SESSION,state.sessionId);

  function readJSON(key,fallback){try{var v=JSON.parse(localStorage.getItem(key)||'');return v==null?fallback:v;}catch(_){return fallback;}}
  function save(){localStorage.setItem(STORAGE_MESSAGES,JSON.stringify(state.messages.slice(-MAX_LOCAL_MESSAGES)));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function getSnapshot(){return readJSON('despegaOnboardingSnapshot',{});}
  function itemText(item){if(typeof item==='string')return item.trim();if(!item||typeof item!=='object')return'';return String(item.value||item.description||item.name||item.category||item.subcategory||'').trim();}
  function values(profile,key){return(Array.isArray(profile&&profile[key])?profile[key]:[]).map(itemText).filter(Boolean).slice(0,8);}
  function buildContext(){
    var snap=getSnapshot(),step1=snap.step1||readJSON('despegaRegisterStep1',{}),step2=snap.step2||readJSON('despegaRegisterStep2',{}),profile=(snap.step3&&snap.step3.profile)||readJSON('despegaAIProfile',{});
    var api=window.DESPEGA_DASHBOARD_API;
    var catalog=(api&&api.getCatalog?api.getCatalog():[]).slice(0,8).map(function(o){return{id:o.id,type:o.type,title:o.title,provider:o.provider,modality:o.modality,duration:o.duration,cost:o.cost,level:o.level,description:o.description};});
    return{profile:{firstName:step1.firstName||'',education:step2.educationLevel||(profile.education&&profile.education.level)||'',goals:values(profile,'goals'),interests:values(profile,'interests'),skills:values(profile,'skills'),experience:values(profile,'experience'),barriers:values(profile,'barriers')},route:{currentView:(api&&api.getCurrentView?api.getCurrentView():localStorage.getItem('despegaDashboardView'))||'home',skillsStarted:localStorage.getItem('despegaRouteSkillsStarted')==='true'},opportunities:catalog,savedIds:(api&&api.getSavedIds?api.getSavedIds():readJSON('despegaSavedOpportunities',[])),viewedIds:(api&&api.getViewedIds?api.getViewedIds():readJSON('despegaViewedOpportunities',[]))};
  }
  function onboardingSessionId(){var s=getSnapshot().sessionId||localStorage.getItem('despegaInterviewSession');return s||'dashboard-session';}
  function panel(){return document.getElementById('ddNovaPanel');}
  function launcher(){return document.getElementById('ddNovaLauncher');}
  function chatMarkup(){
    return '<div class="dd-nova-head"><div><strong>Nova</strong><span class="nova-chat-status" id="novaChatStatus">Lista para ayudarte</span></div><div class="nova-chat-head-actions"><button class="nova-chat-new" type="button" title="Nueva conversación" aria-label="Nueva conversación">↻</button><button class="dd-nova-close" type="button" aria-label="Cerrar">×</button></div></div>'+
      '<div class="nova-chat-messages" id="novaChatMessages" role="log" aria-live="polite"></div>'+
      '<div class="nova-chat-quick" id="novaChatQuick"><button type="button" data-chat-prompt="¿Qué entendiste de mí?">Mi perfil</button><button type="button" data-chat-prompt="Explícame mi ruta actual.">Mi ruta</button><button type="button" data-chat-prompt="¿Qué oportunidades puedo explorar y por qué aparecen?">Oportunidades</button></div>'+
      '<form class="nova-chat-form" id="novaChatForm"><label class="sr-only" for="novaChatInput">Escribe a Nova</label><textarea id="novaChatInput" maxlength="1600" rows="1" placeholder="Escribe tu pregunta..."></textarea><button id="novaChatSend" type="submit" aria-label="Enviar mensaje">➜</button></form>'+
      '<div class="nova-chat-error" id="novaChatError" hidden></div>';
  }
  function init(){
    var p=panel();if(!p)return;
    p.innerHTML=chatMarkup();
    p.querySelector('.dd-nova-close').addEventListener('click',function(){p.classList.remove('is-open');});
    p.querySelector('.nova-chat-new').addEventListener('click',newConversation);
    p.querySelector('#novaChatForm').addEventListener('submit',function(e){e.preventDefault();sendFromInput();});
    p.querySelector('#novaChatInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendFromInput();}});
    Array.prototype.forEach.call(p.querySelectorAll('[data-chat-prompt]'),function(btn){btn.addEventListener('click',function(){sendMessage(btn.getAttribute('data-chat-prompt')||'');});});
    if(!state.messages.length){state.messages=[{id:'welcome',role:'assistant',content:'Hola. Puedo ayudarte a revisar tu perfil, entender tu ruta o explorar las opciones disponibles. Tú decides qué revisar.',actions:[]}];save();}
    render();
    var l=launcher();if(l){l.setAttribute('aria-controls','ddNovaPanel');l.setAttribute('aria-expanded','false');}
    new MutationObserver(function(){var ll=launcher();if(ll)ll.setAttribute('aria-expanded',String(p.classList.contains('is-open')));}).observe(p,{attributes:true,attributeFilter:['class']});
  }
  function newConversation(){state.sessionId=(crypto.randomUUID?crypto.randomUUID():'chat-'+Date.now());state.messages=[];state.lastFailed=null;localStorage.setItem(STORAGE_SESSION,state.sessionId);state.messages.push({id:'welcome-'+Date.now(),role:'assistant',content:'Nueva conversación iniciada. Tu perfil y tu ruta no se modificaron.',actions:[]});save();render();}
  function sendFromInput(){var input=document.getElementById('novaChatInput');if(!input)return;var msg=input.value.trim();if(!msg)return;input.value='';sendMessage(msg);}
  function setBusy(busy,label){state.isSending=busy;var send=document.getElementById('novaChatSend'),input=document.getElementById('novaChatInput'),status=document.getElementById('novaChatStatus');if(send)send.disabled=busy;if(input)input.disabled=busy;if(status)status.textContent=label||(busy?'Pensando…':'Lista para ayudarte');}
  function render(){
    var box=document.getElementById('novaChatMessages');if(!box)return;
    var html=state.messages.map(function(m){var actions=Array.isArray(m.actions)&&m.actions.length?'<div class="nova-msg-actions">'+m.actions.map(function(a){return'<button type="button" data-chat-nav="'+esc(a.target)+'">'+esc(a.label)+'</button>';}).join('')+'</div>':'';return'<div class="nova-msg '+(m.role==='user'?'is-user':'is-nova')+'"><div class="nova-msg-bubble">'+esc(m.content)+'</div>'+actions+'</div>';}).join('');
    box.innerHTML=html;
    Array.prototype.forEach.call(box.querySelectorAll('[data-chat-nav]'),function(btn){btn.addEventListener('click',function(){var target=btn.getAttribute('data-chat-nav');if(allowedViews.has(target)&&window.DESPEGA_DASHBOARD_API&&window.DESPEGA_DASHBOARD_API.navigate){window.DESPEGA_DASHBOARD_API.navigate(target);panel().classList.remove('is-open');}});});
    box.scrollTop=box.scrollHeight;save();
  }
  async function sendMessage(message,reuseId){
    if(state.isSending||!String(message||'').trim())return;
    var messageId=reuseId||(crypto.randomUUID?crypto.randomUUID():'msg-'+Date.now());
    if(!reuseId){state.messages.push({id:messageId,role:'user',content:String(message).trim(),actions:[]});render();}
    setBusy(true,'Nova está pensando…');
    var errorBox=document.getElementById('novaChatError');if(errorBox){errorBox.hidden=true;errorBox.innerHTML='';}
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},CHAT_TIMEOUT_MS);
    try{
      var context=buildContext(),currentView=context.route.currentView||'home',form=new FormData();
      form.append('mode','chat');form.append('session_id',onboardingSessionId());form.append('chat_session_id',state.sessionId);form.append('message_id',messageId);form.append('message',String(message).trim());form.append('current_view',currentView);form.append('context',JSON.stringify(context));
      form.append('chat_history',JSON.stringify(state.messages.filter(function(m){return m.id!==messageId;}).slice(-12).map(function(m){return{role:m.role,content:m.content};})));
      var res=await fetch(ENDPOINT,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY},body:form,signal:controller.signal});
      var data=await res.json().catch(function(){return{};});
      if(!res.ok){var er=new Error(data.message||data.error||'CHAT_REQUEST_FAILED');er.code=data.error||'CHAT_REQUEST_FAILED';throw er;}
      var actions=Array.isArray(data.actions)?data.actions.filter(function(a){return a&&a.type==='navigate'&&allowedViews.has(a.target);}):[];
      state.messages.push({id:'assistant-'+messageId,role:'assistant',content:String(data.reply||'').trim()||'No pude generar una respuesta.',actions:actions});
      state.lastFailed=null;render();setBusy(false,'Lista para ayudarte');
    }catch(err){
      var code=err&&err.name==='AbortError'?'CHAT_TIMEOUT':String(err&&err.code||'NETWORK_ERROR');
      state.lastFailed={message:message,messageId:messageId};
      if(errorBox){errorBox.hidden=false;errorBox.innerHTML='<span>'+(code==='CHAT_TIMEOUT'?'La respuesta tardó demasiado.':'No pude responder en este momento.')+' Tu perfil y tu ruta siguen guardados.</span><button type="button" id="novaRetry">Reintentar</button>';var retry=errorBox.querySelector('#novaRetry');if(retry)retry.addEventListener('click',function(){sendMessage(message,messageId);});}
      setBusy(false,'Error de conexión');
    }finally{clearTimeout(timer);}
  }
  var observer=new MutationObserver(function(){if(panel()&&!document.getElementById('novaChatForm'))init();});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();