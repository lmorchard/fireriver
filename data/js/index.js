/**
 * Content script for index page UI
 */
    
/**
 * Set up listener for messages from chrome.
 */
onMessage = function onMessage (event) {
    if ('undefined'==typeof(event.type)) { return; }
    switch (event.type) {
        case 'historyUpdate': historyUpdate(event); break;
        case 'feedsUpdate': insertFeedEntries(event); break;
        case 'foldersUpdate': foldersUpdate(event); break;
        case 'hiddenFeedsUpdate': hiddenFeedsUpdate(event); break;
        default: break;
    }
};

/** Initialize the page */
function init () { 
    $(document).ready(ready);
}

/** React to page being ready, wire up UI handlers */
function ready () {

    // Wire up livemark reload button
    $('.reloadAllLivemarks').click(function (ev) {
        postMessage({ type: 'reloadAllLivemarks' });
        return false;
    });

    // Wire up folder selection links
    $('nav.folders').click(function (ev) {
        var el = $(this);
        var target = $(ev.target);
        if ('SPAN' == target[0].tagName) { target = target.parent(); }
        var class = target.attr('class');

        switch (class) {
            case 'selectFolder':
                var folder_id = target.attr('data-folder-id');

                $('nav.folders li.selected').removeClass('selected');
                $('nav.folders #folder-'+folder_id).addClass('selected');
                $('section.entries > ul').find('li:not(.template)').remove();

                postMessage({ type: 'selectFolder', folder_id: folder_id });

                return false;
        };

        return true;
    });

    // Install an event-delegating click handler to catch UI elements in
    // dynamically inserted feed items.
    $('section.entries').click(function (ev) {
        var el = $(this);
        var target = $(ev.target);
        if ('SPAN' == target[0].tagName) { target = target.parent(); }
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

    /* TODO: Work out how to handle dividers in the dynamic insertion scheme
    if (false) $('section.entries > ul li.feed-entry').appear(function () {
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

/**
 * Update the folder tree selection display.
 */
function foldersUpdate (event, selected_id) {

    if (!selected_id) { selected_id = event.root_id; }

    var folders = event.folders;
    var tmpl_el = $('#template-folder');
    var root_el = $('.folders > ul.root');

    root_el.find('li:not(.template)').remove();
    if (folders.length > 1) { $('.folders').show(); }

    for (var i=0; i<folders.length; i++) {
        var [ folder_id, folder_title, parent_id ] = folders[i];

        if (folder_id == event.root_id) {
            folder_title = 'All Feeds';
        }

        var par_el = $('#folder-'+parent_id+' > ul.subfolders');
        if (!par_el.length) { par_el = root_el; }

        var new_el = tmpl_el.cloneTemplate({
            '@id': 'folder-'+folder_id,
            '.title': folder_title,
            '.selectFolder @data-folder-id': folder_id
        }).appendTo(par_el);

        if (folder_id == selected_id) {
            new_el.addClass('selected');
        }

    }

}

var INSERT_ENTRIES_CHUNK = 10;
var current_update_fn = null;

/**
 * Insert a big batch of feed entries in chunks.
 */
function insertFeedEntries (event) {
    var entries = event.entries;

    ( function () {
        var cb = arguments.callee;
        for (var i=0; (i<INSERT_ENTRIES_CHUNK) && (entries.length); i++) {
            entry = entries.pop();
            try { insertFeedEntry(entry); }
            catch (e) { console.error(e); }
        }

        $.timeago.settings.refreshMillis = 0;
        $('time.timeago').timeago();
        
        if (entries.length) { setTimeout(cb, 0.1); }
    })();
}

/**
 * insert a single feed entry.
 */
function insertFeedEntry (entry) {
    
    // Skip if this entry is already in the page.
    var entry_el_id = 'entry-'+entry.hash;
    if ($('#'+entry_el_id).length) { return; }
    
    var feed = entry.feed;

    var tmpl_el = $('#template-feed-entry');
    var par_el = $('section.entries ul');

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
        ns['.expandEntry @data-src'] = 'data:text/html,'+entry.summary;
    }

    var new_el = tmpl_el.cloneTemplate(ns);

    $('section.entries ul .published').each(function () {
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

/**
 * Update the list of hidden feeds.
 */
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

/** 
 * Format a date object as ISO8601 
 * TODO: extract into a library
 */
function ISODateString (d) {
    function pad(n){return n<10 ? '0'+n : n}
    return d.getUTCFullYear()+'-'
    + pad(d.getUTCMonth()+1)+'-'
    + pad(d.getUTCDate())+'T'
    + pad(d.getUTCHours())+':'
    + pad(d.getUTCMinutes())+':'
    + pad(d.getUTCSeconds())+'Z';
}

init();
