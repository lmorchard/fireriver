/**
 * Content script for index page UI
 */
    
/** Set up listener for messages from chrome. */
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
    $('time.timeago').timeago();
    wireUpLivemarkReload();
    wireUpFoldersNav();
    wireUpFeedEntries();
    wireUpHiddenFeeds();
}

/** Wire up livemark reload button */
function wireUpLivemarkReload () {
    $('.reloadAllLivemarks').click(function (ev) {
        postMessage({ type: 'reloadAllLivemarks' });
        return false;
    });
}

/** Wire up folder selection links */
function wireUpFoldersNav () {
    $('nav.folders').click(function (ev) {
        var el = $(this);
        var target = $(ev.target);
        if ('SPAN' == target[0].tagName) { target = target.parent(); }
        var class = target.attr('class');

        switch (class) {
            case 'selectFolder':
                var folder_id = target.attr('data-folder-id');
                selectFolder(folder_id);
        };

        return true;
    });
}

/** Select a folder in the sidebar nav */
function selectFolder (folder_id) {
    // Change the folder indicated as selected.
    $('nav.folders li.selected').removeClass('selected');
    $('nav.folders #folder-'+folder_id).addClass('selected');

    // Clear the display of entries in anticipation of an update.
    $('section.entries > ul').find('li:not(.template)').remove();

    // Clear hidden feeds in anticipation of updates.
    $('.hidden-feeds > ul > li:not(.template)').remove();

    // Ask chrome for an update of feed entries.
    postMessage({ type: 'selectFolder', folder_id: folder_id });

    return false;
}

/**
 * Install an event-delegating click handler to catch UI elements in
 * dynamically inserted feed items.
 */
function wireUpFeedEntries () {
    $('section.entries').click(function (ev) {
        var el = $(this);
        var target = $(ev.target);
        if ('SPAN' == target[0].tagName || target.hasClass('parentActive')) { 
            target = target.parent();
        }
        var class = target.attr('class');
        var feed_entry = target.parent();

        switch (class) {

            case 'title':
                // First click on title reveals summary; second click opens the link.
                // Also, ignore click if any modifiers are held, so that
                // cmd-click to open in new tab works.
                // TODO: Decide if this is too confusing.
                var any_modifiers = ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey;
                if (any_modifiers || feed_entry.hasClass('summary-revealed')) {
                    return true;
                } else {
                    return toggleSummaryReveal(feed_entry);
                }

            // Clicks on both timestamp and outline handle expand/collapse summary.
            case 'published timeago':
            case 'expandEntry':
                if (ev.shiftKey) {
                    // Holding shift while clicking handle toggles all entry summaries.
                    $('section.entries > ul').find('li:not(.template)').each(function () {
                        toggleSummaryReveal($(this));
                    });
                    return false;
                } else {
                    // Just toggle this one summary.
                    return toggleSummaryReveal(feed_entry);
                }

            // TODO: Enable feed dividers again to make these work.
            case 'hideFeed':
                postMessage({ type: 'hideFeed', id: target.attr('data-id') });
                selectFolder($('nav.folders li.selected .selectFolder').attr('data-folder-id'));
                return false;
                
            case 'unhideFeed':
                postMessage({ type: 'unhideFeed', id: target.attr('data-id') });
                selectFolder($('nav.folders li.selected .selectFolder').attr('data-folder-id'));
                return false;

        };

        return true;
    });
}

/**
 * Wire up a handler for revealing hidden feeds
 */
function wireUpHiddenFeeds () {
    $('section.hidden-feeds').click(function (ev) {
        var el = $(this);
        var target = $(ev.target);
        if ('SPAN' == target[0].tagName || target.hasClass('parentActive')) { 
            target = target.parent();
        }
        var class = target.attr('class');
        var feed_entry = target.parent();

        switch (class) {
            case 'unhideFeed':
                postMessage({ type: 'unhideFeed', id: target.attr('data-id') });
                selectFolder($('nav.folders li.selected .selectFolder').attr('data-folder-id'));
                return false;
        };

        return true;
    });
}

/** Expand the summary iframe for an entry */
function toggleSummaryReveal (feed_entry, force) {
    var ANIM_TIME = 500;

    // TODO: Work out logic of forcing open / closed based on first item's
    // state in list in mass operation

    var src = feed_entry.find('.expandEntry').attr('data-src');
    if (!src) { return; }
    var summary = feed_entry.find('.summary_wrap');

    if (feed_entry.hasClass('summary-revealed')) {
        
        // Hide the summary iframe
        summary.animate({
            height: 0
        }, ANIM_TIME, function () {
            feed_entry.removeClass('summary-revealed');
        });

    } else if (summary[0].src == src) { 
        
        // Reveal the summary iframe, already loaded
        feed_entry.addClass('summary-revealed');
        summary.animate({
            height: summary[0].contentDocument.body.offsetHeight+8
        }, ANIM_TIME);
    
    } else {

        // Load the summary iframe content, then reveal it.
        feed_entry.addClass('summary-loading');
        summary[0].src = src; 
        summary[0].addEventListener('load', function (ev) {
            feed_entry.removeClass('summary-loading');
            feed_entry.addClass('summary-revealed');
            summary.animate({
                height: summary[0].contentDocument.body.offsetHeight+8
            }, ANIM_TIME);
        }, true);

    }

    return false;
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

        $('time.timeago').timeago();
        adjustFeedTitles();
        
        if (entries.length) { setTimeout(cb, 0.1); }
    })();

}

/**
 * Reveal feed titles at the feed transition boundaries between entries.
 */
function adjustFeedTitles () {
    $('section.entries li.feed-entry').removeClass('feed-title-shown');
    $('section.entries li.feed-entry').each(function () {
        var entry = $(this);
        var curr_feed_title = entry.find('.feedTitle');
        var prev_feed_title = entry.prev('li').find('.feedTitle');
        if (curr_feed_title.attr('data-feed-id') != prev_feed_title.attr('data-feed-id')) {
            entry.addClass('feed-title-shown');
        }
    });
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
        '.feedTitle @data-feed-id': feed.id,
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
    var tmpl_el = $('#template-hidden-feed');
    var par_el = $('.hidden-feeds > ul');
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
