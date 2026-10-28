// 갭 신호 알림을 받아 띄우는 서비스 워커입니다. 화면 파일은 가로채거나 저장하지 않습니다.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

self.addEventListener('push',e=>{
  let m={};try{m=e.data.json()}catch(_){m={body:e.data?e.data.text():''}}
  const url=new URL(m.url||'./',self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(m.title||'갭 알림',{body:m.body||'',tag:m.tag,renotify:!!m.tag,data:{url}}));
});

// 알림을 누르면 열려 있는 갭 차트로 가고(1시간봉으로 바꿔서), 없으면 새로 엽니다.
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||self.registration.scope,path=new URL(url).pathname;
  e.waitUntil((async()=>{
    const wins=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const w=wins.find(c=>new URL(c.url).pathname===path);
    if(w){await w.focus();try{await w.navigate(url)}catch(_){}return}
    await self.clients.openWindow(url);
  })());
});
