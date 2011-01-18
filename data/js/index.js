/**
 * 
 */
MAX_ITEMS = 50;
    
onMessage = function onMessage(event) {
    if ('undefined'==typeof(event.type)) { return; }
    switch (event.type) {
        case 'historyUpdate': historyUpdate(event); break;
        case 'feedsUpdate': feedsUpdate(event); break;
        default: break;
    }
};

function init() { 
    $(document).ready(ready);
}

function ready() {

    $('nav a').click(function () {
        var el = $(this);
        postMessage("NAV LINK " + el.text());
        return false;
    });
    

}

function historyUpdate (event) {
    var tmpl_el = $('.history .template.history-item');
    var par_el = $('.history ul');
    for (var i=0,item; item=event.items[i]; i++) {
        tmpl_el.cloneTemplate({
            'img.favicon @src': item.favicon,
            'a.title': item.title,
            'a.title @href': item.uri
        }).appendTo(par_el);
    }
}

function feedsUpdate (event) {

    var items = [],
        feeds_seen = {};

    for (var i=0,feed; feed=event.feeds[i]; i++) {
        
        if (feeds_seen[feed.link]) { continue; }
        feeds_seen[feed.link] = 1;

        for (var j=0,entry; entry=feed.entries[j]; j++) {
            var item_out = {
                feed_title: feed.title,
                feed_link: feed.link,
                feed_favicon: feed.favicon,
                title: entry.title,
                link: entry.link,
                published: new Date(entry.published),
                updated: new Date(entry.updated),
                summary: entry.summary
            };
            items.push(item_out);
        }

    }

    items.sort(function (b,a) {
        var au = new Date(a.published),
            bu = new Date(b.published);
        return (au > bu) ? 1 : ( (au==bu) ? 0 : -1 );
    });

    items = items.slice(0,MAX_ITEMS);

    var divider_tmpl_el = $('.feeds .template.feed-divider');
    var tmpl_el = $('.feeds .template.feed-entry');
    var par_el = $('.feeds ul');

    par_el.find('li:not(.template)').remove();

    var last_feed = null;
    for (var i=0,item; (item=items[i]) && i<MAX_ITEMS; i++) {
        var ns = {
            '.feedTitle a': item.feed_title,
            '.feedTitle a @href': item.feed_link,
            '.title a': item.title,
            '.title a @href': item.link,
            '.favicon @src': item.feed_favicon,
            '.summary': item.summary,
            '.summary_wrap @src': 'data:text/html,'+item.summary,
            '.published': ''+ISODateString(item.published),
            '.published @title': ''+ISODateString(item.published),
            '.published @datetime': ''+ISODateString(item.published)
        };

        if (last_feed !== item.feed_link) {
            divider_tmpl_el.cloneTemplate(ns).appendTo(par_el);
            last_feed = item.feed_link;
        }
        tmpl_el.cloneTemplate(ns).appendTo(par_el);
    }

    $.timeago.settings.refreshMillis = 0;
    $('time.timeago').timeago();
    
}

function ISODateString(d){
    function pad(n){return n<10 ? '0'+n : n}
    return d.getUTCFullYear()+'-'
    + pad(d.getUTCMonth()+1)+'-'
    + pad(d.getUTCDate())+'T'
    + pad(d.getUTCHours())+':'
    + pad(d.getUTCMinutes())+':'
    + pad(d.getUTCSeconds())+'Z';
}


init();
