/**
 * Feed finder page mod, stolen in large part from the Google Reader subscribe
 * bookmarklet
 *
 * http://googlereader.blogspot.com/2005/11/subscribing-to-feeds-via-little-google.html
 *
 * TODO: Make this readable
 */
var ls=document.getElementsByTagName('link'),
    items=[];
for(var i=0,l; l=ls[i]; i++){
    var t=l.getAttribute('type');
    var r=l.getAttribute('rel');
    if(t&&(t=='application/rss+xml'||t=='application/atom+xml')&&r&&r=='alternate'){
        var h = l.getAttribute('href');
        if(h.indexOf('http')!=0){
            var p=(h.indexOf('/')!=0)?'/':location.pathname;
            h='http://'+location.hostname+p+h;
        }
        var title = l.getAttribute('title');
        items.push({
            'url': h, 
            'title': title, 
        });
    }
}
postMessage({
    'type': 'feedsFoundForPage',
    'title': document.title,
    'url': window.location.href,
    'items': items
});
