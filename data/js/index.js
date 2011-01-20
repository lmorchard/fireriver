/**
 * Content script for index page UI
 */
MAX_ITEMS = 250;
    
onMessage = function onMessage(event) {
    if ('undefined'==typeof(event.type)) { return; }
    switch (event.type) {
        case 'historyUpdate': historyUpdate(event); break;
        case 'feedsUpdate': feedsUpdate(event); break;
        default: break;
    }
};

/** Initialize the page */
function init() { 
    $(document).ready(ready);
}

/** React to page being ready, wire up UI handlers */
function ready() {

}

/** React to incoming feeds update from addon controller */
function feedsUpdate (event) {

    var items = [],
        feeds_seen = {};

    for (var i=0,feed; feed=event.feeds[i]; i++) {
        
        if (feeds_seen[feed.id]) { continue; }
        feeds_seen[feed.id] = 1;

        for (var j=0,entry; entry=feed.entries[j]; j++) {
            var item_out = {
                feed_id: feed.id,
                feed_title: feed.title,
                feed_link: feed.link,
                feed_favicon: feed.favicon,
                title: entry.title,
                link: entry.link,
                published: new Date(entry.published),
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
    for (var i=0,item; item=items[i]; i++) {
        var ns = {
            '.feedTitle a': item.feed_title,
            '.feedTitle a @href': item.feed_link,
            '.title a': item.title || "Untitled",
            '.title a @href': item.link,
            '.favicon @src': item.feed_favicon,
            '.published': ''+ISODateString(item.published),
            '.published @title': ''+ISODateString(item.published),
            '.published @datetime': ''+ISODateString(item.published),
            '.hideFeed @data-id': item.feed_id
        };

        if (item.summary) {
            // ns['.summary_wrap @src'] = 'data:text/html,'+item.summary;
            ns['.expandEntry @data-src'] = 'data:text/html,'+item.summary;
        }

        if (last_feed !== item.feed_id) {
            divider_tmpl_el.cloneTemplate(ns).appendTo(par_el);
            last_feed = item.feed_id;
        }
        tmpl_el.cloneTemplate(ns).appendTo(par_el);
    }

    var tmpl_el = $('.hidden-feeds .template');
    var par_el = $('.hidden-feeds ul');
    par_el.find('li:not(.template)').remove();
    var hidden_feeds = event.hidden_feeds;
    for (var i=0,feed; feed=hidden_feeds[i]; i++) {
        var ns = {
            '.feedTitle a': feed.title,
            '.feedTitle a @href': feed.link,
            '.favicon @src': feed.favicon,
            '.unhideFeed @data-id': feed.id
        };
        tmpl_el.cloneTemplate(ns).appendTo(par_el);
    }

    $.timeago.settings.refreshMillis = 0;
    $('time.timeago').timeago();

    $('section.feeds > ul li.feed-divider .hideFeed').click(function () {
        postMessage({ type: 'hideFeed', id: $(this).attr('data-id') });
        return false;
    });

    $('section.hidden-feeds > ul li.feed-divider .unhideFeed').click(function () {
        postMessage({ type: 'unhideFeed', id: $(this).attr('data-id') });
        return false;
    });

    $('section.feeds > ul li.feed-entry a.expandEntry').each(function () {
        var el = $(this);
        if (!el.attr('data-src')) { el.hide(); }
    });

    if (false) $('section.feeds > ul li.feed-entry').appear(function () {
        var entry = $(this);
        var expand = entry.find('a.expandEntry');
        var src = expand.attr('data-src');
        if (src) {
            setTimeout(function () {
                var ifrm = entry.find('.summary_wrap');
                ifrm.show();
                ifrm[0].src = src;
                ifrm = null;
            }, 0.1);
        }
    });

    $('section.feeds > ul li.feed-entry a.expandEntry').click(function () {
        var src = $(this).attr('data-src');
        $(this).siblings('.summary_wrap').each(function () {
            if (this.style.display == 'block') {
                this.style.display = 'none';
            } else {
                if (this.src!=src) { this.src = src; }
                this.style.display = 'block';
                /* TODO: Work this out, so we don't have inline JS in the HTML
                var f = this;
                f.onload = function () {
                    f.height=f.contentDocument.body.offsetHeight+16
                    f = null;
                }
                */
            }
        });
        return false;
    });
    
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
