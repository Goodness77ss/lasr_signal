const url=new URL('/armory.html',location.origin);url.search=location.search;url.hash=location.hash||'#wallet';location.replace(url.href);
export {};
