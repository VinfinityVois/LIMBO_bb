(()=>{'use strict';
const KEY='limbo_chapter_done_';
function completeChapter(index){
 const n=Number(index);
 if(!Number.isInteger(n)||n<0||n>9)return false;
 try{localStorage.setItem(KEY+n,'1');window.dispatchEvent(new CustomEvent('limbo:chapter-complete',{detail:{chapter:n}}));return true;}catch(e){return false;}
}
window.LIMBO_CHAPTER_COMPLETE=completeChapter;
function syncScenes(){
 for(let id=1;id<=3;id++){
  let done=false;
  try{done=localStorage.getItem('limbo_scene_progress_done_'+id)==='1'||Number(localStorage.getItem('limbo_scene_progress')||0)>=id;}catch(e){}
  if(done)completeChapter(id);
 }
}
syncScenes();
window.addEventListener('limbo:progress',syncScenes);
window.addEventListener('storage',e=>{if(!e.key||e.key.indexOf('limbo_scene_progress')===0)syncScenes();});
})();