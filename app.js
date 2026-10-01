import {normalizeTex} from './tex-compat.js';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s).normalize('NFC').toLocaleLowerCase().replace(/[_\s-]+/g,' ');
const decode=s=>{try{return decodeURIComponent(s)}catch{return s}};
const typeNames={definition:'定义',axiom:'公理',theorem:'定理',lemma:'引理',corollary:'推论',proposition:'命题',example:'例子',book:'书籍',info:'资料',system:'形式系统',note:'笔记'};
let index,byId,group='57',currentNote=null,listLimit=60,backlinkLimit=12,requestNumber=0,controller,noticeTimer,mathQueue=Promise.resolve(),resizeTimer,lastWidth=0;
const cache=new Map();
function notice(text){clearTimeout(noticeTimer);$('#notice').textContent=text;$('#notice').style.display='block';noticeTimer=setTimeout(()=>$('#notice').style.display='none',4500)}
async function json(url,signal){const response=await fetch(url,{signal});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.json()}
function noteUrl(id,anchor=''){return `?note=${encodeURIComponent(id)}${anchor?'#'+encodeURIComponent(anchor):''}`}
function renderCollections(){
  $('#collections').innerHTML=index.groups.map(g=>`<button class="collection ${group===g.id?'active':''}" data-group="${g.id}"${group===g.id?' aria-current="true"':''}><span class="collection-num">${g.id==='FormalSystem'?'⊢':g.id}</span><span>${esc(g.title)}<small>${esc(g.book)}</small></span><b>${g.count.toLocaleString()}</b></button>`).join('');
}
function renderList(){
  const query=norm($('#note-search').value.trim()),words=query.split(' ').filter(Boolean);
  let notes=query?index.notes.filter(n=>words.every(w=>n.search.includes(w))):index.notes.filter(n=>n.group===group);
  if(query)notes=notes.map(n=>({n,score:n.searchTitle===query?3:n.searchTitle.startsWith(query)?2:n.searchTitle.includes(query)?1:0})).sort((a,b)=>b.score-a.score).map(r=>r.n);
  $('#list-title').textContent=query?'全库匹配':index.groups.find(g=>g.id===group)?.title||'笔记';
  $('#list-count').textContent=notes.length.toLocaleString();
  $('#note-list').innerHTML=notes.slice(0,listLimit).map(n=>`<a class="note-item ${currentNote?.id===n.id?'selected':''}" href="${noteUrl(n.id)}" data-note="${n.id}"${currentNote?.id===n.id?' aria-current="page"':''}><span>${esc(n.title)}</span><small>${esc(n.path.split('/').pop().replace(/\.md$/,''))}</small></a>`).join('')+(notes.length>listLimit?`<button id="more-notes" class="more-notes">继续显示 · 还有 ${(notes.length-listLimit).toLocaleString()} 篇</button>`:'')+(!notes.length?'<p class="empty-results">没有匹配的笔记。试试文件名、标题或别名。</p>':'');
}
function renderProperties(note){
  if(!note.properties?.length){$('#properties').innerHTML='';return}
  const mainKeys=['type','book','depends_on'];const primary=note.properties.filter(p=>mainKeys.includes(p.key)),secondary=note.properties.filter(p=>!mainKeys.includes(p.key));
  const row=p=>`<div class="property-row"><dt>${esc(p.key)}</dt><dd>${p.html}</dd></div>`;
  $('#properties').innerHTML=`<details class="properties" open><summary>属性与依赖 <span class="property-total">${note.properties.length} 项</span></summary><dl class="property-list">${primary.map(row).join('')}${secondary.length?`<div class="property-more"><details><summary>全部属性 · ${secondary.length} 项</summary><dl>${secondary.map(row).join('')}</dl></details></div>`:''}${note.metadataError?'<p class="math-error-note">原始属性格式存在问题，已尽可能保留显示。</p>':''}</dl></details>`;
}
function renderBacklinks(){
  const links=currentNote.backlinks||[];$('#backlink-count').textContent=links.length.toLocaleString();
  $('#backlinks').innerHTML=links.slice(0,backlinkLimit).map(b=>{const n=byId.get(b.id);return `<a class="backlink" href="${noteUrl(b.id,b.anchor)}" data-note="${b.id}"><span>${esc(n.title)}</span><small>${esc(n.path)}</small><small class="backlink-locations">${esc(b.locations.join(' / '))} · ${b.count} 处</small>${b.excerpt?`<p class="backlink-context">${esc(b.excerpt.replace(/\[\[([^\]]+)\]\]/g,'$1'))}</p>`:''}</a>`}).join('')+(links.length>backlinkLimit?`<button id="more-backlinks" class="more-backlinks">显示其余 ${links.length-backlinkLimit} 篇</button>`:'')+(!links.length?'<p class="context-empty">当前发布的笔记中，暂无其他文件引用此笔记。</p>':'');
}
function renderOutgoing(){
  const resolved=currentNote.outgoing||[],broken=[...new Map(currentNote.links.filter(l=>l.status!=='resolved').map(l=>[l.target,l])).values()];
  const linked=resolved.map(id=>{const n=byId.get(id);return `<a href="${noteUrl(id)}" data-note="${id}">${esc(n.title)}</a>`}).join('');
  $('#reference-footer').innerHTML=`<h2>引用与依赖 <span class="footer-count">${resolved.length}</span></h2>${resolved.length?`<div class="reference-chips">${linked}</div>`:'<p class="context-description">此笔记未链接到其他已收录的笔记。</p>'}${broken.length?`<details class="unresolved-list"><summary>有 ${broken.length} 个链接需要核对</summary><p>目标可能未包含在此次发布范围内，或名称与原文件不一致。</p><div class="reference-chips">${broken.map(l=>`<a href="?unresolved=${encodeURIComponent(l.target)}" data-link-target="${esc(l.target)}" data-candidates="${esc(JSON.stringify(l.candidates||[]))}">${esc(l.target)} · ${l.status==='ambiguous'?'同名目标':'未找到'}</a>`).join('')}</div></details>`:''}<p class="snapshot-note">本页来自 ${esc(currentNote.path)} · ${new Date(index.snapshot).toLocaleDateString('zh-CN')} 发布快照</p>`;
}
async function mathReady(){
  const started=Date.now();while(!window.MathJax?.startup?.promise){if(Date.now()-started>20000)throw Error('公式组件加载超时');await new Promise(r=>setTimeout(r,80))}
  await MathJax.startup.promise;return MathJax;
}
function enqueueMath(task){mathQueue=mathQueue.catch(()=>{}).then(task);return mathQueue}
function restoreMath(root){
  MathJax.typesetClear([root]);
  root.querySelectorAll('.math-inline').forEach(el=>el.textContent='\\('+normalizeTex(el.dataset.tex)+'\\)');
  root.querySelectorAll('.equation').forEach(el=>el.querySelector('.math-display').textContent='\\['+normalizeTex(el.dataset.tex)+'\\]');
}
function updateFormulaOverflow(root){
  root.querySelectorAll('.equation').forEach(figure=>{
    const display=figure.querySelector('.math-display');
    const scroller=display.querySelector('mjx-container[overflow="scroll"]')||display;
    const wide=scroller.scrollWidth>scroller.clientWidth+2||display.scrollWidth>display.clientWidth+2;
    let hint=figure.querySelector('.equation-scroll-hint');
    if(wide&&!hint){hint=document.createElement('span');hint.className='equation-scroll-hint';hint.textContent='左右滑动查看';figure.append(hint)}
    if(hint)hint.hidden=!wide;
    figure.classList.toggle('has-wide-formula',wide);
  });
  root.querySelectorAll('.math-inline').forEach(inline=>{
    const wide=inline.scrollWidth>inline.clientWidth+2;
    inline.classList.toggle('has-wide-formula',wide);
    if(wide){inline.tabIndex=0;inline.setAttribute('role','region');inline.setAttribute('aria-label','行内公式，可横向滑动查看完整内容')}
    else{inline.removeAttribute('tabindex');inline.removeAttribute('role');inline.removeAttribute('aria-label')}
  });
}
async function typesetNote(ticket,reset=false){
  return enqueueMath(async()=>{try{
    const mj=await mathReady();if(ticket!==requestNumber)return;
    const root=$('#reader');if(reset)restoreMath(root);
    mj.startup.document.outputJax.options.displayOverflow=$('#formula-mode').value;
    mj.texReset();root.classList.add('math-pending');await mj.typesetPromise([root]);
    root.classList.remove('math-pending');
    updateFormulaOverflow(root);lastWidth=$('#note-body').clientWidth;root.dataset.mathReady='true';
    const errors=root.querySelectorAll('mjx-merror');if(errors.length){notice(`${errors.length} 处原始 LaTeX 有语法问题，已保留完整源码。`);for(const error of errors){const figure=error.closest('.equation');if(figure)figure.querySelector('.math-display').innerHTML=`<div class="formula-fallback"><p>原始 LaTeX 有语法问题，以下为完整源码。</p><pre>${esc(figure.dataset.tex)}</pre></div>`;else{const inline=error.closest('.math-inline');if(inline){inline.textContent=inline.dataset.tex;inline.title='原始 LaTeX 有语法问题，已保留源码';inline.classList.add('inline-math-error')}}}}
  }catch(error){$('#reader').classList.remove('math-pending');$('#reader').dataset.mathReady='error';notice('部分公式未能排版，可展开查看完整 LaTeX。');console.error(error)}});
}
function scrollToAnchor(anchor){
  if(!anchor)return;const target=document.getElementById(decode(anchor));
  if(!target){notice('目标段落未找到，已打开对应笔记。');return}
  let parent=target.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement}
  target.scrollIntoView({block:'center'});target.classList.add('reference-target');setTimeout(()=>target.classList.remove('reference-target'),2400);
}
async function showNote(id,{push=false,anchor='',initial=false}={}){
  if(!byId.has(id)){showError('未找到这篇笔记','该链接对应的笔记不在当前发布快照中。');return}
  if(currentNote?.id===id){if(push)history.pushState({id},'',noteUrl(id,anchor));if(anchor)scrollToAnchor(anchor);return}
  const ticket=++requestNumber;controller?.abort();controller=new AbortController();$('#reader').setAttribute('aria-busy','true');
  try{
    const note=cache.get(id)||await json(`/data/notes/${id}.json`,controller.signal);if(ticket!==requestNumber)return;
    cache.set(id,note);if(cache.size>35)cache.delete(cache.keys().next().value);
    await mathQueue.catch(()=>{});if(ticket!==requestNumber)return;
    if(window.MathJax?.typesetClear)MathJax.typesetClear([$('#reader')]);
    currentNote=note;group=note.group;backlinkLimit=12;
    if(push)history.pushState({id},'',noteUrl(id,anchor));else if(initial&&!new URLSearchParams(location.search).has('note'))history.replaceState({id},'',noteUrl(id,anchor));
    const collection=index.groups.find(g=>g.id===group);
    $('#breadcrumb-group').textContent=collection.title;
    $('#note-header').innerHTML=`<div class="eyebrow">${esc(collection.book)} <span class="type-badge">${esc(typeNames[note.type]||note.type)}</span></div><h1 class="note-title">${esc(note.title)}</h1><div class="note-path"><span>${esc(note.path)}</span><span>${(note.math||[]).filter(m=>m.display).length} 个公式块</span></div><div class="title-rule"></div>`;
    renderProperties(note);$('#note-body').innerHTML=(note.renderWarnings?.length?'<p class="source-warning">原文含空公式分隔符，已恢复后续公式与章节的显示。</p>':'')+note.html;
    $('#toc').innerHTML=note.headings.length?note.headings.map(h=>`<a href="#${encodeURIComponent(h.id)}" class="level-${h.level}">${esc(h.text.replace(/\[\[([^\]]+)\]\]/g,'$1'))}</a>`).join(''):'<p class="context-empty">此笔记没有章节标题。</p>';
    renderCollections();renderList();renderBacklinks();renderOutgoing();
    document.title=note.title+' · 形式知识库';$('#reader').dataset.noteId=id;$('#reader').dataset.mathReady='false';$('#reader').setAttribute('aria-busy','false');
    setSidebar(false,false);window.scrollTo(0,0);
    await typesetNote(ticket);if(ticket!==requestNumber)return;
    if(anchor)scrollToAnchor(anchor);
  }catch(error){if(error.name==='AbortError'||ticket!==requestNumber)return;showError('笔记暂时无法加载','请检查连接后重试。');console.error(error)}
}
function showError(title,detail){$('#reader').setAttribute('aria-busy','false');$('#note-header').innerHTML='';$('#properties').innerHTML='';$('#note-body').innerHTML=`<section class="load-error"><h2>${esc(title)}</h2><p>${esc(detail)}</p><a href="/">返回知识库</a></section>`;$('#toc').innerHTML='';$('#backlinks').innerHTML='';$('#reference-footer').innerHTML=''}
function setSidebar(open,focus=true){
  const mobile=matchMedia('(max-width:760px)').matches;$('#library').classList.toggle('open',open);$('#library').inert=mobile&&!open;$('.workspace').inert=mobile&&open;$('#sidebar-scrim').hidden=!open;$('#menu-button').setAttribute('aria-expanded',String(open));document.body.classList.toggle('sidebar-open',open&&mobile);
  if(focus&&mobile)(open?$('#note-search'):$('#menu-button')).focus();
}
async function expandFormula(figure){
  const tex=figure.dataset.tex,dialog=$('#formula-dialog');$('#formula-source').textContent=tex;$('#expanded-formula').textContent=tex;dialog.showModal();
  await enqueueMath(async()=>{try{const mj=await mathReady(),out=mj.startup.document.outputJax;const previous=out.options.displayOverflow;out.options.displayOverflow='scroll';try{mj.texReset();const rendered=await mj.tex2chtmlPromise(normalizeTex(tex),{display:true,containerWidth:Math.max(200,$('#expanded-formula').clientWidth-32)});if(rendered.querySelector('mjx-merror'))$('#expanded-formula').innerHTML=`<div class="formula-fallback"><p>原始 LaTeX 有语法问题，以下为完整源码。</p><pre>${esc(tex)}</pre></div>`;else $('#expanded-formula').replaceChildren(rendered)}finally{out.options.displayOverflow=previous}}catch{notice('公式保留为 LaTeX 源码。')}});
}
function showLinkTarget(target,candidates=[]){
  const actual=candidates.filter(id=>byId.has(id));$('#link-dialog-title').textContent=actual.length?'选择链接目标':'未找到链接目标';
  $('#link-dialog-content').innerHTML=`<p class="link-target-name">${esc(target)}</p>${actual.length?'<p>有多个符合这个名称的笔记，请按路径选择。</p>'+actual.map(id=>{const n=byId.get(id);return `<a class="dialog-link" href="${noteUrl(id)}" data-note="${id}">${esc(n.title)}<small>${esc(n.path)}</small></a>`}).join(''):'<p>当前发布的 9 个目录中未找到此目标。它可能在其他目录，或已经更名；原始链接已保留。</p>'}`;
  $('#link-dialog').showModal();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button'),link=event.target.closest('a');
  if(button?.dataset.group){group=button.dataset.group;$('#note-search').value='';listLimit=60;renderCollections();renderList();showNote(index.groups.find(g=>g.id===group).home,{push:true});return}
  if(button?.id==='more-notes'){listLimit+=60;const oldTop=$('#note-list').scrollTop;renderList();$('#note-list').scrollTop=oldTop;return}
  if(button?.id==='more-backlinks'){backlinkLimit=currentNote.backlinks.length;renderBacklinks();return}
  if(button?.classList.contains('equation-action')){expandFormula(button.closest('.equation'));return}
  if(button?.classList.contains('dialog-close')){button.closest('dialog').close();return}
  if(link?.dataset.note&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();const anchor=new URL(link.href).hash.slice(1);document.querySelectorAll('dialog[open]').forEach(d=>d.close());showNote(link.dataset.note,{push:true,anchor:decode(anchor)});return}
  if(link?.dataset.linkTarget){event.preventDefault();showLinkTarget(link.dataset.linkTarget,JSON.parse(link.dataset.candidates||'[]'));return}
  if(link?.getAttribute('href')?.startsWith('#')&&link.getAttribute('href')!=='#reader'){event.preventDefault();const anchor=link.getAttribute('href').slice(1);history.pushState({id:currentNote?.id},'',noteUrl(currentNote?.id||index.home,decode(anchor)));scrollToAnchor(anchor)}
});
$('#menu-button').addEventListener('click',()=>setSidebar(!$('#library').classList.contains('open')));
$('#sidebar-scrim').addEventListener('click',()=>setSidebar(false));
$('#note-search').addEventListener('input',()=>{listLimit=60;renderList()});
$('#formula-mode').addEventListener('change',()=>{try{localStorage.setItem('formal-formula-mode',$('#formula-mode').value)}catch{}if(currentNote){$('#reader').dataset.mathReady='false';typesetNote(requestNumber,true)}});
document.addEventListener('keydown',event=>{if(event.key==='/'&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();if(matchMedia('(max-width:760px)').matches)setSidebar(true);$('#note-search').focus()}if(event.key==='Escape'&&$('#library').classList.contains('open'))setSidebar(false)});
window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.search).get('note')||index.home;showNote(id,{anchor:decode(location.hash.slice(1))})});
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{setSidebar($('#library').classList.contains('open'),false);const width=$('#note-body').clientWidth;if(currentNote&&Math.abs(width-lastWidth)>1){$('#reader').dataset.mathReady='false';typesetNote(requestNumber,true)}},220)});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close()}}));
async function start(){
  $('#formula-mode').value=matchMedia('(max-width:760px)').matches?'scroll':'linebreak';
  try{const value=localStorage.getItem('formal-formula-mode');if(['linebreak','scroll','scale'].includes(value))$('#formula-mode').value=value}catch{}
  index=await json('/data/index.json');byId=new Map(index.notes.map(n=>{n.searchTitle=norm(n.title);n.search=norm([n.title,n.display,n.path,...n.aliases].join(' '));return [n.id,n]}));
  $('#total-count').textContent=index.count.toLocaleString();$('#group-count').textContent=index.groups.length+' 个笔记集';$('#snapshot-date').textContent=new Date(index.snapshot).toLocaleDateString('zh-CN');
  const params=new URLSearchParams(location.search);setSidebar(false,false);
  await showNote(params.get('note')||index.home,{initial:true,anchor:decode(location.hash.slice(1))});
  lastWidth=$('#note-body').clientWidth;if(params.has('unresolved'))showLinkTarget(params.get('unresolved'));
}
start().catch(error=>{showError('知识库暂时无法加载','请检查连接后刷新页面。');console.error(error)});
