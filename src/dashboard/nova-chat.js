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
  var allowedActions=new Set(['navigate','open_opportunity','open_resource','open_external_verified','show_route_step']);
  var state={sessionId:localStorage.getItem(STORAGE_SESSION)||(crypto.randomUUID?crypto.randomUUID():'chat-'+Date.now()),messages:readJSON(STORAGE_MESSAGES,[]),isSending:false,lastFailed:null};
  localStorage.setItem(STORAGE_SESSION,state.sessionId);

  function readJSON(key,fallback){try{var v=JSON.parse(localStorage.getItem(key)||'');return v==null?fallback:v;}catch(_){return fallback;}}
  function save(){localStorage.setItem(STORAGE_MESSAGES,JSON.stringify(state.messages.slice(-MAX_LOCAL_MESSAGES)));}
  function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function textHtml(v){return esc(v).replace(/\n/g,'<br>');}
  function getSnapshot(){return readJSON('despegaOnboardingSnapshot',{});}
  function itemText(item){if(typeof item==='string')return item.trim();if(!item||typeof item!=='object')return'';return String(item.value||item.description||item.name||item.category||item.subcategory||'').trim();}
  function values(profile,key){return(Array.isArray(profile&&profile[key])?profile[key]:[]).map(itemText).filter(Boolean).slice(0,8);}
  function dashboardApi(){return window.DESPEGA_DASHBOARD_API||null;}
  function firstName(){var snap=getSnapshot(),step1=snap.step1||readJSON('despegaRegisterStep1',{});return String(step1.firstName||'').trim().split(/\s+/)[0]||'';}
  function buildContext(){
    var snap=getSnapshot(),step1=snap.step1||readJSON('despegaRegisterStep1',{}),step2=snap.step2||readJSON('despegaRegisterStep2',{}),profile=(snap.step3&&snap.step3.profile)||readJSON('despegaAIProfile',{});
    var api=dashboardApi();
    var fullCatalog=(api&&api.getCatalog?api.getCatalog():[]);
    var catalog=fullCatalog.slice(0,12).map(function(o){return{id:o.id,type:o.type,title:o.title,provider:o.provider,modality:o.modality,duration:o.duration,cost:o.cost,level:o.level,description:o.description,requirements:Array.isArray(o.requirements)?o.requirements.slice(0,6):[],verification:o.verification&&o.verification.status||'',source_name:o.source&&o.source.name||'',deadline:o.application&&o.application.deadline||null,match_reasons:api&&api.getMatchReasons?api.getMatchReasons(o.id):[]};});
    var route=api&&api.getRoute?api.getRoute():{progress:0,current_step:'profile',next_step:'profile',completed_steps:[],pending_steps:[],steps:[]};
    return{
      profile:{firstName:step1.firstName||'',education:step2.educationLevel||(profile.education&&profile.education.level)||'',goals:values(profile,'goals'),interests:values(profile,'interests'),skills:values(profile,'skills'),experience:values(profile,'experience'),barriers:values(profile,'barriers')},
      route:route,
      opportunities:catalog,
      resources:catalog.map(function(o){return{id:o.id,title:o.title,provider:o.provider,type:o.type,source_name:o.source_name,verification:o.verification};}),
      activity:{saved_opportunities:(api&&api.getSavedIds?api.getSavedIds():readJSON('despegaSavedOpportunities',[])),viewed_opportunities:(api&&api.getViewedIds?api.getViewedIds():readJSON('despegaViewedOpportunities',[])),route_started:localStorage.getItem('despegaRouteSkillsStarted')==='true'},
      current_view:(api&&api.getCurrentView?api.getCurrentView():localStorage.getItem('despegaDashboardView'))||'home'
    };
  }
  function onboardingSessionId(){var s=getSnapshot().sessionId||localStorage.getItem('despegaInterviewSession');return s||'dashboard-session';}
  function panel(){return document.getElementById('ddNovaPanel');}
  function launcher(){return document.getElementById('ddNovaLauncher');}
  function chatMarkup(){
    return '<div class="dd-nova-head"><div class="nova-chat-identity"><span class="nova-chat-avatar" aria-hidden="true"><i></i><i></i><b></b></span><div><strong>Nova</strong><small>Tu guía en DESPEGA</small><span class="nova-chat-status" id="novaChatStatus">Lista para ayudarte</span></div></div><div class="nova-chat-head-actions"><button class="nova-chat-new" type="button" title="Nueva conversación" aria-label="Nueva conversación">↻</button><button class="dd-nova-close" type="button" aria-label="Cerrar">×</button></div></div>'+
      '<div class="nova-chat-messages" id="novaChatMessages" role="log" aria-live="polite"></div>'+
      '<div class="nova-chat-quick" id="novaChatQuick"><button type="button" data-chat-prompt="¿Qué hago ahora?">¿Qué hago ahora?</button><button type="button" data-chat-prompt="Explícame mi ruta actual.">Ver mi ruta</button><button type="button" data-chat-prompt="Muéstrame oportunidades verificadas que pueda explorar.">Buscar oportunidades</button><button type="button" data-chat-prompt="¿Cómo voy y qué he completado?">Mi progreso</button></div>'+
      '<form class="nova-chat-form" id="novaChatForm"><label class="sr-only" for="novaChatInput">Escribe a Nova</label><textarea id="novaChatInput" maxlength="1600" rows="1" placeholder="Escribe tu pregunta..."></textarea><button id="novaChatSend" type="submit" aria-label="Enviar mensaje">➜</button></form>'+
      '<div class="nova-chat-error" id="novaChatError" hidden></div>';
  }
  function welcomeMessage(){
    var name=firstName();
    return 'Hola'+(name?', '+name:'')+' 👋\nPuedo ayudarte a entender tu ruta, revisar oportunidades verificadas o ver cuál puede ser tu siguiente paso. Tú decides qué revisar.';
  }
  function init(){
    var p=panel();if(!p)return;
    p.innerHTML=chatMarkup();
    p.querySelector('.dd-nova-close').addEventListener('click',function(){p.classList.remove('is-open');});
    p.querySelector('.nova-chat-new').addEventListener('click',newConversation);
    p.querySelector('#novaChatForm').addEventListener('submit',function(e){e.preventDefault();sendFromInput();});
    p.querySelector('#novaChatInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendFromInput();}});
    Array.prototype.forEach.call(p.querySelectorAll('[data-chat-prompt]'),function(btn){btn.addEventListener('click',function(){sendMessage(btn.getAttribute('data-chat-prompt')||'');});});
    if(!state.messages.length){state.messages=[{id:'welcome',role:'assistant',content:welcomeMessage(),actions:[],cards:[],motivation:''}];save();}if(!sessionStorage.getItem('despegaNovaHintSeen')){setTimeout(function(){var fab=launcher();if(!fab)return;fab.classList.add('has-message');fab.setAttribute('data-nova-hint','¿Quieres que te ayude a revisar tu ruta?');setTimeout(function(){fab.classList.remove('has-message');fab.removeAttribute('data-nova-hint');},4200);sessionStorage.setItem('despegaNovaHintSeen','true');},3200);}
    render();
    var l=launcher();if(l){l.setAttribute('aria-controls','ddNovaPanel');l.setAttribute('aria-expanded','false');l.addEventListener('click',function(){l.classList.remove('has-message');});}
    new MutationObserver(function(){var ll=launcher();if(ll)ll.setAttribute('aria-expanded',String(p.classList.contains('is-open')));}).observe(p,{attributes:true,attributeFilter:['class']});
  }
  function newConversation(){state.sessionId=(crypto.randomUUID?crypto.randomUUID():'chat-'+Date.now());state.messages=[];state.lastFailed=null;localStorage.setItem(STORAGE_SESSION,state.sessionId);state.messages.push({id:'welcome-'+Date.now(),role:'assistant',content:'Nueva conversación iniciada. Tu perfil, ruta y oportunidades guardadas no se modificaron.',actions:[],cards:[],motivation:''});save();render();}
  function sendFromInput(){var input=document.getElementById('novaChatInput');if(!input)return;var msg=input.value.trim();if(!msg)return;input.value='';sendMessage(msg);}
  function setBusy(busy,label){state.isSending=busy;var send=document.getElementById('novaChatSend'),input=document.getElementById('novaChatInput'),status=document.getElementById('novaChatStatus'),fab=launcher();if(send)send.disabled=busy;if(input)input.disabled=busy;if(status)status.textContent=label||(busy?'Pensando…':'Lista para ayudarte');if(fab){fab.classList.toggle('is-thinking',busy);if(!busy)fab.classList.remove('has-message');}}
  function opportunityById(id){var api=dashboardApi();return api&&api.getOpportunity?api.getOpportunity(id):null;}
  function routeById(id){var api=dashboardApi(),route=api&&api.getRoute?api.getRoute():null;return route&&Array.isArray(route.steps)?route.steps.find(function(s){return s.id===id;}):null;}
  function opportunityCardHtml(card){
    var o=opportunityById(card.id);if(!o)return'';
    return '<article class="nova-rich-card nova-opportunity-card"><span class="nova-rich-kicker">'+esc(o.type||'Oportunidad')+'</span><strong>'+esc(o.title)+'</strong><span>'+esc(o.provider)+'</span><div class="nova-rich-meta"><span>'+esc(o.modality)+'</span><span>'+esc(o.cost)+'</span></div><div class="nova-rich-actions"><button type="button" data-chat-open="'+esc(o.id)+'">Ver detalles</button><button type="button" data-chat-external="'+esc(o.id)+'">Abrir sitio oficial ↗</button></div></article>';
  }
  function routeCardHtml(card){
    var s=routeById(card.id);if(!s)return'';
    return '<article class="nova-rich-card nova-route-card"><span class="nova-rich-kicker">Tu ruta</span><strong>'+esc(s.title)+'</strong><span>'+esc(s.desc||'')+'</span><button type="button" data-chat-route="'+esc(s.id)+'">Ir a Mi Ruta</button></article>';
  }
  function resourceCardHtml(card){
    var o=opportunityById(card.id);if(!o)return'';
    return '<article class="nova-rich-card nova-resource-card"><span class="nova-rich-kicker">Recurso verificado</span><strong>'+esc(o.title)+'</strong><span>'+esc(o.source&&o.source.name||o.provider)+'</span><button type="button" data-chat-external="'+esc(o.id)+'">Abrir sitio oficial ↗</button></article>';
  }
  function cardsHtml(cards){return(Array.isArray(cards)?cards:[]).slice(0,4).map(function(card){if(!card||!card.id)return'';if(card.type==='route')return routeCardHtml(card);if(card.type==='resource')return resourceCardHtml(card);return opportunityCardHtml(card);}).join('');}
  function actionsHtml(actions){return(Array.isArray(actions)?actions:[]).slice(0,4).map(function(a){if(!a||!allowedActions.has(a.type))return'';return'<button type="button" data-chat-action="'+esc(a.type)+'" data-chat-target="'+esc(a.target)+'">'+esc(a.label||'Continuar')+'</button>';}).join('');}
  function render(){
    var box=document.getElementById('novaChatMessages');if(!box)return;
    box.innerHTML=state.messages.map(function(m){
      var rich=cardsHtml(m.cards),actions=actionsHtml(m.actions),motivation=m.motivation?'<div class="nova-msg-motivation">'+textHtml(m.motivation)+'</div>':'';
      return'<div class="nova-msg '+(m.role==='user'?'is-user':'is-nova')+'"><div class="nova-msg-bubble">'+textHtml(m.content)+'</div>'+motivation+rich+(actions?'<div class="nova-msg-actions">'+actions+'</div>':'')+'</div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-chat-action]'),function(btn){btn.addEventListener('click',function(){handleAction(btn.getAttribute('data-chat-action'),btn.getAttribute('data-chat-target'));});});
    Array.prototype.forEach.call(box.querySelectorAll('[data-chat-open]'),function(btn){btn.addEventListener('click',function(){handleAction('open_opportunity',btn.getAttribute('data-chat-open'));});});
    Array.prototype.forEach.call(box.querySelectorAll('[data-chat-route]'),function(btn){btn.addEventListener('click',function(){handleAction('show_route_step',btn.getAttribute('data-chat-route'));});});
    Array.prototype.forEach.call(box.querySelectorAll('[data-chat-external]'),function(btn){btn.addEventListener('click',function(){handleAction('open_external_verified',btn.getAttribute('data-chat-external'));});});
    box.scrollTop=box.scrollHeight;save();
  }
  function handleAction(type,target){
    var api=dashboardApi();if(!api||!allowedActions.has(type))return;
    if(type==='navigate'&&allowedViews.has(target)){api.navigate(target);panel().classList.remove('is-open');return;}
    if(type==='show_route_step'){api.navigate('route');panel().classList.remove('is-open');return;}
    if(type==='open_opportunity'&&api.openOpportunity){api.openOpportunity(target);return;}
    if((type==='open_resource'||type==='open_external_verified')&&api.getVerifiedUrl){var url=api.getVerifiedUrl(target);if(url){window.open(url,'_blank','noopener,noreferrer');trackEvent('link_click',target);}}
  }
  function trackEvent(eventType,target){
    try{
      var last=state.messages.slice().reverse().find(function(m){return m.role==='assistant'&&m.replyTo;});
      if(!last||!last.replyTo)return;
      var form=new FormData();form.append('mode','chat');form.append('session_id',onboardingSessionId());form.append('chat_session_id',state.sessionId);form.append('event_type',eventType);form.append('event_target',String(target||'').slice(0,120));form.append('event_message_id',String(last.replyTo));
      fetch(ENDPOINT,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY},body:form}).catch(function(){});
    }catch(_){}
  }
  function sanitizeClientActions(actions){return(Array.isArray(actions)?actions:[]).filter(function(a){if(!a||!allowedActions.has(a.type))return false;if(a.type==='navigate')return allowedViews.has(a.target);if(a.type==='show_route_step')return Boolean(routeById(a.target));return Boolean(opportunityById(a.target));}).slice(0,4);}
  function sanitizeClientCards(cards){return(Array.isArray(cards)?cards:[]).filter(function(card){if(!card||!card.id)return false;if(card.type==='route')return Boolean(routeById(card.id));return Boolean(opportunityById(card.id));}).map(function(card){return{type:card.type==='route'?'route':card.type==='resource'?'resource':'opportunity',id:card.id};}).slice(0,4);}
  async function sendMessage(message,reuseId){
    if(state.isSending||!String(message||'').trim())return;
    var messageId=reuseId||(crypto.randomUUID?crypto.randomUUID():'msg-'+Date.now());
    if(!reuseId){state.messages.push({id:messageId,role:'user',content:String(message).trim(),actions:[],cards:[],motivation:''});render();}
    setBusy(true,'Nova está pensando…');
    var errorBox=document.getElementById('novaChatError');if(errorBox){errorBox.hidden=true;errorBox.innerHTML='';}
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},CHAT_TIMEOUT_MS);
    try{
      var context=buildContext(),currentView=context.current_view||'home',form=new FormData();
      form.append('mode','chat');form.append('session_id',onboardingSessionId());form.append('chat_session_id',state.sessionId);form.append('message_id',messageId);form.append('message',String(message).trim());form.append('current_view',currentView);form.append('context',JSON.stringify(context));
      form.append('chat_history',JSON.stringify(state.messages.filter(function(m){return m.id!==messageId;}).slice(-12).map(function(m){return{role:m.role,content:m.content};})));
      var res=await fetch(ENDPOINT,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY},body:form,signal:controller.signal});
      var data=await res.json().catch(function(){return{};});
      if(!res.ok){var er=new Error(data.message||data.error||'CHAT_REQUEST_FAILED');er.code=data.error||'CHAT_REQUEST_FAILED';throw er;}
      var actions=sanitizeClientActions(data.actions),cards=sanitizeClientCards(data.cards);
      state.messages.push({id:'assistant-'+messageId,replyTo:messageId,role:'assistant',content:String(data.reply||'').trim()||'No pude generar una respuesta.',actions:actions,cards:cards,motivation:String(data.motivation||'').trim(),messageType:String(data.message_type||'standard')});
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