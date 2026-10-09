'use strict';
// Запуск
/* ── Boot ── */
load();
if(practiceAvailable)uInit();
if(practiceAvailable&&location.hash==='#practice')S.tab='practice';
setupDelegation();
if(tg){
  tg.BackButton?.onClick(()=>{const a=backAction();if(a)act(a);});
  if(tg.isVersionAtLeast?.('6.1')){tg.setHeaderColor?.('#000000');tg.setBackgroundColor?.('#000000');}
  // свайп вниз по длинному списку не должен закрывать мини-приложение
  if(tg.isVersionAtLeast?.('7.7'))tg.disableVerticalSwipes?.();
}
render();
