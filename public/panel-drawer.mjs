export function createPanelDrawer(){
  const chat=document.getElementById('conversationPanel'),action=document.getElementById('actionPanel');
  const dialog=document.createElement('dialog');
  dialog.className='panel-drawer';dialog.setAttribute('aria-label','展开的对局面板');
  dialog.innerHTML='<div class="drawer-grip" aria-hidden="true"></div><header class="drawer-heading"><div class="drawer-tabs" role="group" aria-label="展开面板内容"><button data-drawer-tab="chat" aria-pressed="false">对局聊天</button><button data-drawer-tab="action" aria-pressed="false">猜答案 / 画手操作</button></div><button class="drawer-close" aria-label="收起面板">收起 ↓</button></header><div class="drawer-body"><aside class="drawer-preview"><h3>当前画布</h3><canvas width="1000" height="650" aria-label="当前画布预览"></canvas><p>展开作答时也能对照画面。收起后可以继续落笔。</p></aside><div class="drawer-content"></div></div>';
  document.body.append(dialog);
  const content=dialog.querySelector('.drawer-content'),actionTab=dialog.querySelector('[data-drawer-tab="action"]'),preview=dialog.querySelector('.drawer-preview canvas');
  const refreshPreview=()=>preview.getContext('2d').drawImage(document.getElementById('canvas'),0,0);
  let current=null,marker=null,opener=null;
  function restore(){
    if(!current)return;
    marker.replaceWith(current);delete current.dataset.panelExpanded;current=null;marker=null;
  }
  function select(kind){
    const panel=kind==='chat'?chat:action;
    if(panel===current)return;
    restore();marker=document.createComment('expanded panel home');panel.before(marker);
    current=panel;panel.dataset.panelExpanded='true';content.append(panel);dialog.dataset.activePanel=kind;refreshPreview();
    for(const tab of dialog.querySelectorAll('[data-drawer-tab]'))tab.setAttribute('aria-pressed',String(tab.dataset.drawerTab===kind));
    if(kind==='action')panel.querySelector('input:not([type="checkbox"]),textarea')?.focus({preventScroll:true});
    else panel.querySelector('.chat-log')?.focus({preventScroll:true});
  }
  function open(kind,button){
    opener=button;select(kind);dialog.showModal();document.body.classList.add('drawer-open');
    if(kind==='action')action.querySelector('input:not([type="checkbox"]),textarea')?.focus({preventScroll:true});
  }
  dialog.querySelector('.drawer-close').onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{
    const tab=event.target.closest('[data-drawer-tab]');if(tab)select(tab.dataset.drawerTab);
    if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientY<r.top||event.clientX<r.left||event.clientX>r.right)dialog.close();}
  });
  dialog.addEventListener('close',()=>{restore();document.body.classList.remove('drawer-open');if(opener?.isConnected)opener.focus({preventScroll:true});});
  function button(kind,label){
    const b=document.createElement('button');b.type='button';b.className='panel-expand';b.textContent=label;b.setAttribute('aria-haspopup','dialog');
    b.onclick=()=>open(kind,b);return b;
  }
  chat.querySelector('.chat-heading').append(button('chat','展开聊天 ↑'));
  function ensureActionButton(){if(!action.querySelector('.panel-expand'))action.prepend(button('action','展开作答 ↑'));}
  new MutationObserver(ensureActionButton).observe(action,{childList:true});ensureActionButton();
  return {update(game){
    if(dialog.open)refreshPreview();
    actionTab.hidden=!game||game.phase==='finished';
    if(dialog.open&&(!game||current===action&&game.phase==='finished')){restore();dialog.close();}
  }};
}
