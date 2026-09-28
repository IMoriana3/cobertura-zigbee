/* Progressive disclosure of the existing controls; no simulation state. */
(function(){
'use strict';
const button=document.getElementById('settingsToggle'),panel=document.getElementById('configPanel'),cols=document.getElementById('appColumns');
button.addEventListener('click',()=>{
  const open=panel.hidden;panel.hidden=!open;cols.classList.toggle('settings-open',open);button.setAttribute('aria-expanded',String(open));
  window.dispatchEvent(new Event('resize'));
  if(open&&window.innerWidth<900)panel.scrollIntoView({behavior:'smooth',block:'start'});
});
// Charts drawn while a details element was closed need their visible width.
document.addEventListener('toggle',event=>{if(event.target.tagName==='DETAILS'&&event.target.open)window.dispatchEvent(new Event('resize'));},true);
})();
