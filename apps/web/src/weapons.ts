const url=new URL('/armory.html',location.origin);url.search=location.search;url.hash=location.hash||'#locker';location.replace(url.href);
export {};
