/**
 * Content script for index page UI
 */
//MAX_ITEMS = 250;
    
onMessage = function onMessage(event) {
    if ('undefined'==typeof(event.type)) { return; }
    switch (event.type) {
        case 'historyUpdate': historyUpdate(event); break;
        case 'feedsUpdate': feedsUpdate(event); break;
        case 'hiddenFeedsUpdate': hiddenFeedsUpdate(event); break;
        default: break;
    }
};

/** Initialize the page */
function init() { 
    $.timeago.settings.refreshMillis = 0;

    $(document).ready(ready);
}

/** React to page being ready, wire up UI handlers */
function ready() {

    // Wire up livemark reload button
    $('.reloadAllLivemarks').click(function (ev) {
        postMessage({ type: 'reloadAllLivemarks' });
        return false;
    });

    // Install an event-delegating click handler to catch UI elements in
    // dynamically inserted feed items.
    $('section.feeds').click(function (ev) {

        var el = $(this);
        var target = $(ev.target);
        if ('SPAN' == target[0].tagName) {
            target = target.parent();
        }
        var class = target.attr('class');

        switch (class) {

            case 'hideFeed':
                postMessage({ type: 'hideFeed', id: target.attr('data-id') });
                return false;

            case 'unhideFeed':
                postMessage({ type: 'unhideFeed', id: target.attr('data-id') });
                return false;

            case 'expandEntry':
                var src = target.attr('data-src');
                target.siblings('.summary_wrap').each(function () {
                    if (this.style.display == 'block') {
                        this.style.display = 'none';
                    } else {
                        if (this.src!=src) { this.src = src; }
                        this.style.display = 'block';
                    }
                });
                return false;
        };

        return true;
    });

    /*
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
    */

}

const INSERT_ENTRIES_CHUNK = 5;
/**
 * Insert a big batch of feed entries in chunks.
 */
function insertFeedEntries(event) {
    var entries = event.entries;
    (function () {
        var cb = arguments.callee;
        for (var i=0; (i<INSERT_ENTRIES_CHUNK) && (entries.length); i++) {
            entry = entries.pop();
            try { insertFeedEntry(entry); }
            catch (e) { console.error(e); }
        }
        if (entries.length) { 
            setTimeout(cb, 0.1); 
        }
    })()
}

/**
 * insert a single feed entry.
 */
function insertFeedEntry (entry) {
    
    // Skip if this entry is already in the page.
    var entry_el_id = 'entry-'+entry.hash;
    if ($('#'+entry_el_id).length) { return; }
    
    var feed = entry.feed;

    // var divider_tmpl_el = $('.feeds .template.feed-divider');
    var divider_tmpl_el = $('#template-feed-divider');
    // var tmpl_el = $('.feeds .template.feed-entry');
    var tmpl_el = $('#template-feed-entry');
    var par_el = $('.feeds ul');

    var iso_published = ISODateString(new Date(entry.published));

    var ns = {
        '@id': entry_el_id,
        '.feedTitle a': feed.title,
        '.feedTitle a @href': feed.link,
        '.title a': entry.title || "Untitled",
        '.title a @href': entry.link,
        '.favicon @src': feed.favicon,
        '.published': ''+iso_published,
        '.published @title': ''+iso_published,
        '.published @datetime': ''+iso_published,
        '.hideFeed @data-id': feed.id
    };

    if (entry.summary) {
        // ns['.summary_wrap @src'] = 'data:text/html,'+entry.summary;
        ns['.expandEntry @data-src'] = 'data:text/html,'+entry.summary;
    }

    /*
    if (last_feed !== entry.feed_id) {
        divider_tmpl_el.cloneTemplate(ns).appendTo(par_el);
        last_feed = entry.feed_id;
    }
    */

    var new_el = tmpl_el.cloneTemplate(ns);
    new_el.find('time.timeago').timeago();

    $('.feeds ul .published').each(function () {
        var el = $(this);
        if (iso_published >= el.attr('datetime')) {
            el.parent().before(new_el);
            new_el = null;
            return false;
        }
    });
    if (new_el) { 
        par_el.append(new_el);
    }

}

/** React to incoming feeds update from addon controller */
function feedsUpdate (event) {
    //$('.feeds ul').find('li:not(.template)').remove();
    insertFeedEntries({ entries: event.entries });
}

function hiddenFeedsUpdate (event) {
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
