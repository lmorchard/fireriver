/**
 * Fireriver main module
 */

const {Cc,Ci,Cr} = require("chrome");
//const {Cc,Ci,Cm,Cr,Cu} = require("chrome");
//var popupNotifications = {};
//Cu.import("resource://gre/modules/PopupNotifications.jsm", popupNotifications);

const self = require('self');
const data = self.data;
const tabs = require("tabs");
const notifications = require("notifications");
const pageMod = require("page-mod");
const pageWorkers = require("page-worker");
const widget = require("widget");
const panel = require("panel");
const simpleStorage = require("simple-storage");
const preferences = require("preferences-service");
const request = require("request");
const windows = require("windows").browserWindows;

const indexui = require('index-ui');

var bookmarksService = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
    .getService(Ci.nsINavBookmarksService);
var livemarkService = Cc["@mozilla.org/browser/livemark-service;2"] 
    .getService(Ci.nsILivemarkService);
var faviconService = Cc["@mozilla.org/browser/favicon-service;1"]
    .getService(Ci.nsIFaviconService);
var historyService = Cc["@mozilla.org/browser/nav-history-service;1"]
    .getService(Ci.nsINavHistoryService);
var globalHistory2 = Cc["@mozilla.org/browser/nav-history-service;1"]
    .getService(Ci.nsIGlobalHistory2);
var annotationService = Cc["@mozilla.org/browser/annotation-service;1"]
    .getService(Ci.nsIAnnotationService);

const index_url = data.url('index.html');

// Used to mark livemark feeds hidden by the user
const FRANNO_HIDE      = 'fireriver/hide';
// Annotation where feed-level persistent metadata stashed
const FRANNO_FEEDMETA  = 'fireriver/feedmeta';
// Used to mark children of livemarks augmented by the addon
const FRANNO_AUGMENTED = 'fireriver/augmented';
// Used to mark feeds auto-added by addon, in need of title/link correction
const FRANNO_FIXME     = 'fireriver/fixme';
// From PlacesUIUtils.jsm, annotation where feed item summary stashed
const DESCRIPTION_ANNO = "bookmarkProperties/description";

var ROOT_FOLDER_NAME = "Fireriver Feeds";
var _currRootId = null;

var last_feed_scan = null;
var bm_observer = null;
var pending_feed_events = { };
var last_worker = null;

var MAX_ENTRY_AGE = ( 1000 * 1000 * 60 * 60 * 24 * 7 );
var MAX_ENTRY_RESULTS = 1000;

/** Main driver */
exports.main = function (options, callbacks) {

    // TODO: Should these be arrays? So I can shift / pop old entries when
    // quota runs out?
    if ('undefined' == typeof(simpleStorage.storage.feeds_ignored)) {
        simpleStorage.storage.feeds_ignored = {}
    }
    if ('undefined' == typeof(simpleStorage.storage.hosts_ignored)) {
        simpleStorage.storage.hosts_ignored = {}
    }

    // Wire up an icon to open a tab to Fireriver.
    widget.Widget({
        label: 'Fireriver',
        widget: 100,
        contentURL: data.url('img/blue-rss.png'),
        onClick: function () {
            openIndex();
        }
    });

    // Set up content scripts for index UI
    pageMod.PageMod({
        include: index_url + '*',
        contentScriptFile: [
            // data.url('js/jquery-1.4.4.min.js'), 
            data.url('js/jquery-1.4.4.min.js'), 
            data.url('js/jquery.timeago.js'), 
            data.url('js/jquery.cloneTemplate.js'), 
            data.url('js/jquery.appear-1.1.1.js'), 
            data.url('js/index.js')
        ],
        contentScriptWhen: 'ready',
        onAttach: function (worker) {
            // HACK: Should really wrap a UI Handler object around this worker,
            // not just throw it in a global.
            last_worker = worker;
            worker.on('message', function(event) {
                handleMessageFromIndex(worker, event);
            });
            handleIndexReady(worker);
        }
    });

    var index_ui = indexui.IndexUI({
    });

    // Spy on all page loads to discover new feeds.
    pageMod.PageMod({
        include: '*',
        contentScriptWhen: 'ready',
        contentScriptFile: data.url('js/feed-finder.js'),
        onAttach: function (worker) {
            worker.on('message', handleFeedsFoundForPage);
        }
    });

    // When switching to a new tab, see if we need to reveal a pending feed
    // notification.
    tabs.on('activate', function onActivate (tab) {
        showPendingFeedNotifications();
    });

    var rootId = findRootBookmarkFolder();

    // Wire up the bookmark observer to watch the root folder for managed
    // livemarks.
    bm_observer = {
        onBeginUpdateBatch: function () { },
        onEndUpdateBatch: function () { },
        onItemRemoved: function (id, folder, index, type) {
            //postFoldersUpdate(last_worker);
        },
        onItemAdded: function (id, folder, index, type, uri) {
            //postFoldersUpdate(last_worker);
        },
        onItemMoved: function (id, old_parent, old_idx, new_parent, new_idx) { 
            //postFoldersUpdate(last_worker);
        },
        onItemVisited: function (id, visit_id, time) { 
            // console.debug("VISITED " + JSON.stringify(Array.prototype.slice.call(arguments)));
        },
        onItemChanged: function (id, property, is_annotation, value) {
            // console.debug("CHANGED " + JSON.stringify(Array.prototype.slice.call(arguments)));

            if (is_annotation && 'livemark/loading' == property && 
                    annotationService.itemHasAnnotation(id, property) &&
                    isLivemarkManagedByAddon(id))  {

                console.debug("FEED REFRESH STARTED " + bookmarksService.getItemTitle(id) + 
                    " " + livemarkService.getFeedURI(id).spec);
            }

            // When the livemark/loading annotation goes away, that feed is
            // done loading and has been processed.
            if (is_annotation && 'livemark/loading' == property && 
                    !annotationService.itemHasAnnotation(id, property) &&
                    isLivemarkManagedByAddon(id))  {

                console.debug("FEED REPARSE QUEUED " + bookmarksService.getItemTitle(id) + 
                    " " + livemarkService.getFeedURI(id).spec);

                handleLivemarkFinishedLoading(id);

            }

            if (is_annotation && 'livemark/loadfailed' == property &&
                    annotationService.itemHasAnnotation(id, property)) {
                console.debug("FEED LOAD FAILED " + bookmarksService.getItemTitle(id) + 
                    " " + livemarkService.getFeedURI(id).spec);
            }
        },
        QueryInterface: function(iid) {
            if (iid.equals(Ci.nsINavBookmarkObserver) ||
                    iid.equals(Ci.nsISupports)) {
                return this;
            }
            throw Cr.NS_ERROR_NO_INTERFACE;
        }
    };

    bookmarksService.addObserver(bm_observer, false);
    //openIndex();

}

/** Clean up on unload. */
exports.onUnload = function (reason) {
    // TODO: Seems like I should do this, but it raises an error
    if (bm_observer) {
        bookmarksService.removeObserver(bm_observer);
    }
}

/** Handle a message from the index UI page */
function handleMessageFromIndex (worker, event) {
    if ('undefined' == typeof(event.type)) { return; }
    switch (event.type) {
        case 'hideFeed':
            hideFeed(worker, event); break;
        case 'unhideFeed':
            unhideFeed(worker, event); break;
        case 'selectFolder':
            postFeedsUpdate(worker, event.folder_id); break;
        case 'reloadAllLivemarks':
            notifications.notify({
                title: 'Reloading all Live Bookmarks',
                text: 'Your Live Bookmarks are now reloading.'
            });
            livemarkService.reloadAllLivemarks();
            break;
        default:
            break;
    }
}

/** Open the index page UI. */
function openIndex () {
    // TODO: Don't open if already open
    // TODO: Auto-pin as an app tab?
    tabs.open({ url: index_url });
}

/** Handle readiness of index UI */
function handleIndexReady (worker) {
    postSummaryCSS(worker);
    postFoldersUpdate(worker);
    postFeedsUpdate(worker);
}

function postSummaryCSS(worker, url) {
    var css_src = data.load('css/summary_frame.css');
    worker.postMessage({ type: 'summaryCSS', src: css_src });
}

/** Find (or create) the root bookmark folder for managed livemarks */
function findRootBookmarkFolder () {
    var root_id = null;

    // See: http://code.google.com/p/sage/source/browse/src/sage/content/sage_main.js#175
    function findRoot(folderNode) {
        folderNode.containerOpen = true;
        for (var c = 0; c < folderNode.childCount; c++) {
            var child = folderNode.getChild(c);
            if (child.type == Ci.nsINavHistoryResultNode.RESULT_TYPE_FOLDER &&
                    !livemarkService.isLivemark(child.itemId)) {
                if (child.title == ROOT_FOLDER_NAME) {
                    root_id = child.itemId;
                } else {
                    child.QueryInterface(Ci.nsINavHistoryContainerResultNode);
                    findRoot(child);
                } 
            }
        }
    }

    var query, result;
    query = historyService.getNewQuery();
    query.setFolders([bookmarksService.bookmarksMenuFolder], 1);
    result = historyService.executeQuery(query, historyService.getNewQueryOptions());
    findRoot(result.root);
    
    if (!root_id) {
        root_id = bookmarksService.createFolder(bookmarksService.bookmarksMenuFolder, 
            ROOT_FOLDER_NAME, bookmarksService.DEFAULT_INDEX);
    }

    return root_id;
}

/**
 * Send an update to the folders tree in the index.
 */
function postFoldersUpdate (worker, root_id) {
    if (!root_id) { root_id = findRootBookmarkFolder(); }
    var folders = recurseFolderIDs([root_id]).map(function (id) {
        return [
            id,
            bookmarksService.getItemTitle(id),
            bookmarksService.getFolderIdForItem(id),
        ];
    });
    worker.postMessage({ 
        type: 'foldersUpdate', 
        root_id: root_id,
        folders: folders,
    });
}

/** 
 * Handle message that a feed was found from feed-finder.js 
 */
function handleFeedsFoundForPage (event) {
    if (!event.items.length) { return; }

    // TODO: Handle multiple feeds? Too complex?
    var feed = event.items[0];
    
    // Does a livemark for this feed already exist? If so, just ignore.
    var item_id = livemarkService.getLivemarkIdForFeedURI(url(feed.url));
    if (-1 != item_id) { return; }

    // Skip, if this host or page has been ignored.
    var site_url = url(event.url);
    if ( 'undefined' != typeof(simpleStorage.storage.hosts_ignored[site_url.hostPort]) || 
            'undefined' != typeof(simpleStorage.storage.feeds_ignored[feed.url]) ) {
        return;
    }

    // Defer showing the notification box if the page isn't in the active tab.
    pending_feed_events[event.url] = event;
    showPendingFeedNotifications();
}

/** 
 * Show a notification box if there's a pending feed event for the current
 * tab's URL 
 */
function showPendingFeedNotifications () {
    
    // Bail if there's no notification pending for the current tab's URL.
    var curr_url = tabs.activeTab.url;
    if ('undefined' == typeof(pending_feed_events[curr_url])) { 
        return; 
    }

    // Since there is a pending notification, grab it.
    var event = pending_feed_events[curr_url];
    delete pending_feed_events[curr_url];

    // Show the notification bar.
    appendNotificationBox({
        value: 'fireriver-feed-detected',
        label: 'Fireriver has detected a feed on this page.',
        image: FIRERIVER_LOGO_IMAGE,
        buttons: [
            { label: "Ignore this whole site", 
                accessKey: "w", popup: null, 
                callback: function (bar, button) { 
                    var site_url = url(event.url);
                    ignoreThisHost(site_url); 
                }
            },
            { label: "Ignore this page", 
                accessKey: "p", popup: null, 
                callback: function (bar, button) { 
                    var feeds = event.items;
                    ignoreFeeds(feeds); 
                }
            },
            { label: "Subscribe to this page", 
                accessKey: "s", popup: null, 
                callback: function (bar, button) { 
                    subscribeToPage(event); 
                }
            },
        ]
    });

}

/**
 * Display a notification box in the most recent window.
 *
 * TODO:liberate this to a reusable module, along with the deferring logic on tab switching.
 */
function appendNotificationBox(options) {

    var WM = Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator);
    var win = WM.getMostRecentWindow('navigator:browser');
    var browser = win.gBrowser;
    var notifyBox = browser.getNotificationBox();

    var label    = options.label || 'Default label';
    var value    = options.value || 'Default value';
    var image    = options.image;
    var buttons  = options.buttons || [];
    var priority = options.priority || notifyBox.PRIORITY_INFO_LOW;
    var persistence = options.persistence || 0;

    var box = notifyBox.appendNotification(
        label, value, image, priority, buttons);

    box.persistence = persistence;
}

/** Mark this page as ignored in the future */
function ignoreThisHost (site_url) {
    // TODO: Observe quota for this!
    simpleStorage.storage.hosts_ignored[site_url.hostPort] = 1;
}

/** Mark feeds from a page as ignored, without subscribing */
function ignoreFeeds (feeds) {
    // TODO: Make panel to manage seen feeds / clear the record
    // TODO: Observe quota for this!
    for (var i=0; i<feeds.length; i++) {
        var feed = feeds[i];
        simpleStorage.storage.feeds_ignored[feed.url] = 1;
    }
}

/** Subscribe to the first feed from event */
function subscribeToPage (event) {
    var root_id = findRootBookmarkFolder();
    var feed = event.items[0];

    // Create a new one based on what was detected.
    item_id = livemarkService.createLivemark(root_id,
        event.title + ' - ' + feed.title, url(event.url), url(feed.url), -1);

    // Mark the feed as in need of correction on initial feed load.
    annotationService.setItemAnnotation(item_id, FRANNO_FIXME,
        true, 0, annotationService.EXPIRE_WEEKS);
        
    notifications.notify({
        title: 'Subscribed to feed',
        text: ''+feed.url
    });
}

/**
 * Generate an ASCII MD5 hash for a string
 * See: https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsICryptoHash#Computing_the_Hash_of_a_String
 */
function hashMD5 (str) {
    var converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
        createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var result = {};
    var data = converter.convertToByteArray(str, result);
    var ch = Cc["@mozilla.org/security/hash;1"]
        .createInstance(Ci.nsICryptoHash);
    ch.init(ch.MD5);
    ch.update(data, data.length);
    var hash = ch.finish(true);
    function hex(charCode) {
      return ("0" + charCode.toString(16)).slice(-2);
    }
    return [hex(hash.charCodeAt(i)) for (i in hash)].join("");
}

/**
 * Recursively collect folder IDs starting from a root folder.
 */
function recurseFolderIDs(root_ids) {
    if (!root_ids) { root_ids = [ findRootBookmarkFolder() ]; }

    var folder_ids = [];

    for (var j=0; j<root_ids.length; j++) {
        var query, result, options;
        var root_id = root_ids[j];
        query = historyService.getNewQuery();
        query.setFolders([root_id], 1);
        options = historyService.getNewQueryOptions();
        options.excludeItems = true;
        result = historyService.executeQuery(query, options);

        var root = result.root;
        root.containerOpen = true;

        for (var i=0; i<root.childCount; i++) {
            var node = root.getChild(i);
            if (node.type != node.RESULT_TYPE_FOLDER) { continue; }
            if (livemarkService.isLivemark(node.itemId)) { continue; }
            folder_ids.push(node.itemId);
        }

        root.containerOpen = false;
    }

    return (folder_ids.length) ?
        root_ids.concat.apply(root_ids, recurseFolderIDs(folder_ids)) :
        root_ids;
}

/** 
 * Send an update of feeds and entries to display to index UI 
 */
function postFeedsUpdate (worker, root_id) {
    if (!root_id) { root_id = findRootBookmarkFolder(); }

    var SHOW_SKIPS = false;

    var now = new Date().getTime() * 1000;
    var published_min = now - MAX_ENTRY_AGE;

    var entries = [];
    var hidden_feeds = [];

    // Start a search query on the root folder for feeds.
    var query = historyService.getNewQuery();
    query.setFolders([ root_id ], 1);
    query.searchTerms = "http"; // HACK: Seems I need a search term to get everything
    
    var options = historyService.getNewQueryOptions();
    options.queryType = Ci.nsINavHistoryQueryOptions.QUERY_TYPE_BOOKMARKS;
    // HACK: Arbitrary maxResults to account for entries filtered out below.
    options.maxResults = MAX_ENTRY_RESULTS * 2.5;
    options.sortingMode = Ci.nsINavHistoryQueryOptions.SORT_BY_DATEADDED_DESCENDING;

    var result = historyService.executeQuery(query, options);
    var root = result.root;

    root.containerOpen = true;

    console.debug("QUERIED ITEMS = " + root.childCount);

    var entries = [];
    var feed_cache = {};

    for (var i=0; (i<root.childCount); i++) {
        var entry_node = root.getChild(i);
        var entry_node_id = entry_node.itemId;

        // Don't show items that haven't been augmented with summary & published yet
        if (!annotationService.itemHasAnnotation(entry_node_id, FRANNO_AUGMENTED)) {
            if (SHOW_SKIPS) console.debug("SKIPPED (not augmented) " + entry_node.uri);
            continue;
        }

        var published = entry_node.dateAdded;

        // Skip if this entry is too old, or in the future (which has happened).
        if (published < published_min || published > now) { 
            if (SHOW_SKIPS) console.debug("SKIPPED (too old) " + entry_node.uri);
            continue; 
        }

        // Skip this entry, if the link has been visited
        if (globalHistory2.isVisited(url(entry_node.uri))) {
            if (SHOW_SKIPS) console.debug("SKIPPED (visited) " + entry_node.uri);
            continue;
        }

        var feed_id = bookmarksService.getFolderIdForItem(entry_node_id);
        var feed_out = feed_cache[feed_id];
        if (!feed_out) {
            feed_out = {
                id: feed_id,
                title: bookmarksService.getItemTitle(feed_id),
                link: livemarkService.getSiteURI(feed_id).spec,
                uri: livemarkService.getFeedURI(feed_id).spec
            };
            try {
                // Grab a favicon for feed and entries, if we can.
                feed_out.favicon = faviconService.getFaviconDataAsDataURL(
                    faviconService.getFaviconForPage(url(feed_out.link)));
                // TODO: Figure out how to get missing favicons?
            } catch (e) { }
            if (annotationService.itemHasAnnotation(feed_id, FRANNO_HIDE)) {
                feed_out.hidden = true;
                hidden_feeds.push(feed_out);
            }
            feed_cache[feed_id] = feed_out;
        }

        // Skip this entry, if the feed is hidden.
        if (feed_out.hidden) { 
            if (SHOW_SKIPS) console.debug("SKIPPED (feed hidden) " + entry_node.uri);
            continue; 
        }

        var entry_out = {
            feed: feed_out,
            hash: hashMD5(feed_out.url + entry_node.uri),
            title: entry_node.title,
            link: entry_node.uri,
            summary: '',
            published: published,
        };

        if (annotationService.itemHasAnnotation(entry_node_id, DESCRIPTION_ANNO)) {
            entry_out.summary = annotationService.getItemAnnotation(
                entry_node_id, DESCRIPTION_ANNO);
        }

        entries.push(entry_out);
        //if (entries.length >= MAX_ENTRY_RESULTS) { break; }
    }
    root.containerOpen = false;

    console.debug("FILTERED ENTRIES = " + entries.length + " SENDING " + MAX_ENTRY_RESULTS);

    worker.postMessage({ 
        type: 'feedsUpdate', 
        entries: entries,
    });

    worker.postMessage({ 
        type: 'hiddenFeedsUpdate', 
        hidden_feeds: hidden_feeds
    });

}

/** Determine whether a given folder is managed by the addon */
function isFolderManagedByAddon(folder_id) {
    // TODO: Make this account for subfolders within the root folder.
    var root_id = findRootBookmarkFolder();
    
    // This seems wrong, but eventually the loop is escaped by an invalid value
    // causing an exception.
    // TODO: Find out if there's a better way to do this? Seems evil.
    try {
        var curr_id = folder_id;
        while (true) {
            curr_id = bookmarksService.getFolderIdForItem(curr_id);
            if (curr_id == root_id) { break; }
        }
    } catch (e) {
        return false;
    }

    return true;
}

/** Determine whether a given livemark is managed by addon */
function isLivemarkManagedByAddon(folder_id) {
    // Only livemarks are managed.
    if (!livemarkService.isLivemark(folder_id)) { return false; }
    return isFolderManagedByAddon(folder_id);
}

/**
 * When a livemark has finished loading, re-fetch the feed to grab extra data
 * like published timestamp and summary content for each entry. This will
 * augment what the browser fetches out of the box.
 */
function handleLivemarkFinishedLoading(folder_id) {
    var feed_url = livemarkService.getFeedURI(folder_id);
    var req = request.Request({
        url: feed_url.spec,
        onComplete: function (resp) {
            console.log("FEED FETCHED FOR REPARSE " + bookmarksService.getItemTitle(folder_id) + 
                " " + feed_url.spec);
            bookmarksService.runInBatchMode({
                runBatched: function () {
                    parseFeed(folder_id, feed_url, resp.text);
                }
            }, null); 
        }
    });
    req.get();
}

/** 
 * Parse a feed, digest its contents, store as a JSON blob annotation on an
 * existing livemark.
 */
function parseFeed (feed_id, feed_url, feed_xml) {

    var feedProc = Cc["@mozilla.org/feed-processor;1"]
        .createInstance(Ci.nsIFeedProcessor);

    feedProc.listener = {
        
        handleResult: function resultListener_handleResult(aResult) {

            var now = new Date().getTime() * 1000;

            // Try to get a handle on the parsed feed, but bail on failure
            if (!aResult || !aResult.doc || aResult.bozo) {
                console.debug("Feed parsing failed for " + feed_url.spec);
                return;
            }
            var nsIFeed = aResult.doc;
            nsIFeed.QueryInterface(Ci.nsIFeed);

            // On initial feed load, correct the title and site link we set
            // based on the page where the feed was detected. This helps adjust
            // for feeds found on sub-pages, where the title and link may be
            // not quite right.
            if (annotationService.itemHasAnnotation(feed_id, FRANNO_FIXME)) {
                bookmarksService.setItemTitle(feed_id, nsIFeed.title.text);
                livemarkService.setSiteURI(feed_id, url(nsIFeed.link));
                // Remove the annotation, so this only gets done once. Future
                // manual changes should be left alone.
                annotationService.removeItemAnnotation(feed_id, FRANNO_FIXME);
            }

            // Try grabbing metadata encoded in an annotation for the feed.
            var feed_meta = {};
            if (annotationService.itemHasAnnotation(feed_id, FRANNO_FEEDMETA)) {
                feed_meta = JSON.parse(annotationService.getItemAnnotation(
                    feed_id, FRANNO_FEEDMETA));
            }

            // Item metadata will be copied to this output object, thus
            // allowing metadata for items no longer in the feed to disappear.
            var feed_meta_out = {};

            // Process the feed's items.
            for (var i = 0; i < nsIFeed.items.length; i++) {
                var item = nsIFeed.items.queryElementAt(i, Ci.nsIFeedEntry);

                // Get persistent metadata for this item from the feed
                var item_meta = ('undefined' == typeof(feed_meta[item.link.spec])) ?
                    {} : feed_meta[item.link.spec];  

                var published = new Date(item.published || item.updated).getTime() * 1000;
                if (!published) {
                    // This item is missing a valid datestamp, so record
                    // when this item was first seen and use that as the
                    // datestamp going forward.
                    if (!item_meta.published) { item_meta.published = now; }
                    published = item_meta.published;
                }

                // Try digging up the summary from the feed item
                var summary = '';
                if (item.summary) { summary = item.summary.text; }
                else if (item.content) { summary = item.content.text; }

                // Find the bookmark ID for this item link in this folder.
                var bookmark_ids = bookmarksService.getBookmarkIdsForURI(url(item.link));
                var entry_id = null;
                for (var j=0; j<bookmark_ids.length; j++) {
                    var id = bookmark_ids[j];
                    if (bookmarksService.getFolderIdForItem(id) == feed_id) {
                        entry_id = id; break;
                    }
                }

                // Somehow, this feed item has no associate bookmark, so skip.
                if (!entry_id) { continue; }

                // Stash this item's persistent metadata in the feed.
                feed_meta_out[item.link.spec] = item_meta;
                
                bookmarksService.setItemDateAdded(entry_id, published);
                annotationService.setItemAnnotation(entry_id, DESCRIPTION_ANNO, 
                   summary, 0, annotationService.EXPIRE_WEEKS);
                annotationService.setItemAnnotation(entry_id, FRANNO_AUGMENTED,
                    true, 0, annotationService.EXPIRE_WEEKS);
            }

            // Stash the accumulated metadata for this feed as an annotation.
            annotationService.setItemAnnotation(feed_id, FRANNO_FEEDMETA, 
               JSON.stringify(feed_meta_out), 0, annotationService.EXPIRE_WEEKS);
            
            if (last_worker) {
                //postFeedsUpdate(last_worker);
            }
        }
    }

    feedProc.parseFromString(feed_xml, url(feed_url));
}

/** Handle request from index UI to hide a feed */
function hideFeed (worker, event) {
    annotationService.setItemAnnotation(event.id, FRANNO_HIDE, 
        1, 0, annotationService.EXPIRE_WEEKS);
    postFeedsUpdate(worker);
}

/** Handle request from index UI to hide a feed */
function unhideFeed (worker, event) {
    annotationService.removeItemAnnotation(event.id, FRANNO_HIDE);
    postFeedsUpdate(worker);
}

/** Utility to convert an URL string to URL object */
function url(spec) {
    if (typeof(spec) != "string") { return spec; }
    var classObj = Cc["@mozilla.org/network/io-service;1"];
    var ios = classObj.getService(Ci.nsIIOService);
    return ios.newURI(spec, null, null);
}

const FIRERIVER_LOGO_IMAGE = "data:image/png,%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%20%00%00%00%20%08%06%00%00%00szz%F4%00%00%00%19tEXtSoftware%00Adobe%20ImageReadyq%C9e%3C%00%00%05%EBIDATx%DA%C4W%5Dl%14U%14%FE%EE%FC%ECt%7F%BA%85v%A1%90%16%84%B4%A04%08b(1hD%1B%5B%03F4%F1%DD%17%D4%08!%9Ah%7C%C2D%1E%20%26%98%F8%40H%CA%8B%86%A0!!%01%0D%09%18%B5%8A%8A%10C%9B%0AR%02%15E%0B%B5%CD%B6%94v%BB%DD%BF%F9%BD%9E%3B%DB%D9%CE%B4t!%D0%84%99%9C%CC%EE%9D%3B%E7%9C%FB%7D%E7%E7%5E%C69%C7%C3%BC%14%FF%9F%C7%0F%5C%D9D%8F%ED%24%CF%90%D4%CD%B1%AD%01%92%B3%24%ED%3D%3B%9B~%F1%06%99%87%00%19%DF%13%8F%84v%B5%AE%AEC%DD%3C%0DQU%9AS%EBY%D3%C1%40JG%C7%E5%01%A4s%C6%5Er%E2%C3%92%03d%BC%25%AC%85~%7Cm%C3r%9A(!%AD%03%86%3D%B7%CB%0F%C9%40%5C%03b%AA%83%E3%5D%7D%C8%15%F46r%A2%C3%5B%E6%F6Gj%17%60%C2%60%18%CEr%E4M%0E%D3%E6%D0%CD%A2%98%16%87%E5p8%FC%FE%A5%40%3A%84%EE4%D9XZ%9B%C0%24%D5%A5%18h%8DG%23%18%2B%88%C9%80%ED%00%0BC%C0%92(%C38%8D%A5M%E0%16%3D%B3%84%8A%AA0%C8%B4%1A%F9%3E%19%1A%CB%13%12dK%D8%F4%3BP%C5%24%06%DD*%C6%83i%01%0D%09%867%D6%14%AD%88%D1%91%1C%C7%F51%8E%0BC%1C%97ns%A4t%0EMe%AE%23%8C%DD%BB%03%BA-%E6%BB%1F%C4%02Y%60%FB%D2%D1%12%90%99SK%14%D3%17D%98%2BOQnX%84%D0%99%9B6N%5C%B7%91%2C%A0%E8%88%FC%80i%E8w%40p%A6H%B3%D7%07%85%7CkY%26%E3y%92o%C9%89%A3%D7%2C%E4%085%95%1C%91%D8%FD%3A%E08%A5AN%F7%10qu~%C0v%237%11%91%DC%D5O%BF%C4%C8%E6%06%19O%D7K8%DCc%E0%87%01%0B%E1%0A%09%92%F4%80%08%08%CD%97R6~%1F%B1%C91%0E%01F%3D%05%E4%13%09%19%CF-S%B0%B2%3A%88w%5Cc%D8%B9%5E%C3%F2*%13%07%2F%1B%A8%08K%F7%1C%A4%25%07%2C%3F%02%BCH%03'G%04%B7%22f%06%0D%8E%FE~%CA%E1%7Ft%AC%9E%2Fc%DBZ%0DM%89%40!%C5K%2BT%C4(%7B%F6u%E7%A1U%C8%F7%84%84%E4%A7%C0%13%D3%B2Q_%01l%AD%97%B1%B1%86%A1N%A5ZP%B0%DDqE%05z'l%BC%F7S%06%87.%E6g(%DC%F4%88%8Aw%C9%B9L%D6%A2%F9N%40%AF_f%22%E0%A3%40%14%A1%C6JJ%C3u%E1%D2%D8P%D6A%E7%80%81%EE%A4%85%B3I%132%95%EA%2F%FF%D6%D1E%BF%DFi%8E%E0%D1%9A)4%DA%1A4JY%1B_%DD0%A0iR%D94%95%FC%14xb%DA6%A5%A1%13%98X%1B%95%F0%F2%CA%0A%EC~6%86%03-1%D4*%0E%C4%DDK%2B%DD%F1%7D%0AWG%CC%C0%FC7%9F%8C%A0V%15%95%D4%0E%E8%F6%A4%2C%05%0Ew%10RfO%C3%C7%12*%F6%B7Va%25%154%8B%CA%A6C%B4%EC%3D%9B%A6%FE%C1%03%A9%FA~s%14%F9%9C%E9%CE%99%8D%82%3B%22%20%D2%F0%FC%90%81%3D%BF%A6p%E8%C2%04%FEH%1A3%9C%98G%E9%B6%FF%C5%F9h%8A1%18%B4%CA%7F%F3%16%3E97%1E%98%B3nq%08%1B%16%C8(%18%D6%DD%11%101%E0%89M%9C%FD%A7%3B85%A8%A3%FDj%16%DB%BE%BB%8D%D7O%0C%E3%F8%95%0Cx%A0%C31%7C%DAZ%8DU1%09%A2y~%DD%97G%C7%F5%5C%C0%89%1D%EB%E3%B0%A9%B5%9A%84%82%DFFY%04l%A2%C0a%1CL4%9D%10%83J%85%E8%CF%BC%83%BD%5D%E3x%FB%E4%10%26%F4%A9%15%84%A9%FA%ED%7B%A1%1AanC%22*%3E%FEm%CC%ED%A6%DE%D5X%AD%A2%99%D2uz%2C%94%8D%81R%3A%D2G%82%C3%5C%C6%80A0%0A%03%9Dc%26%DE%3A%99%0C%18%A9%0E%CB%D8%B2T%83Ei%3AJ%A9%F7%CD%B5%89%00%0A%9B%1B%C2%D0u%EBn1%C0%03%A2S%DB%8A%90%C2%DD%CDU8%B6%B5%16%1F%11%94!%D3q)%E8%19%B7p%F8B*%60%A4%AD1%8A%02%D5%0A%10-%C7z3%81w%CDua%CC%93%B8%5B%17%3C%FD3%11%E0NI%2CJ%C38%A5%D8g%5B%16%E2%95U%95XQ%13%C2%ABMq%B4%B7%D1F%C2%B2%C0%08%89%2F%AE%8Ec4%3F%B5mZ%B3%A8%02%2B%E2%8Cb%C1A%CF%A8%8E%FE%F1%A9%B4%AC%89%C8h%AAV%DC%F4%F6l%94%8D%01%83V%BEqQ%08%8D5Z%60%25k%17%87%D1%18%93%DD%BE1Lh%1C%BD4%16hL%9B%EA%C3.m%06%E1%D4%D9%9F%0D%7C%5BG%DF%89J%3A%7B%0C%88%E8%9F%14%D1%07%86s%E6%1Dk%C0m%E2%D2%25%82vF%3F%DF%08%1AY%BDPs%8D%88%00%EEK%05S7%1E%92%8A%F5%60%D2F%F9BD%0A%CE%25%F38%D5%1B%CC%EB%23%17G%D1%975%8B%8D%8A%EE%9B%99%A0%93%0D%84%98-%0A%13x%60%95n%DD%A0%0E%E9%94%EB%05%F6%B4%03%8AE%B5%FE%833C%E8%1A%CCaqL%C1%60%C6%C2%91%BF%D2%C4%BFB%3C%17%E7%A6(%98%0Ev%DE%82%B7%83%1F%15%E9IA(%BAh%F7%88%8E%CF%BBG%20v%DD%8C%EE%F3%B4%C1%E0%B4%5B%99n%C7%DB%96%A72Q%ADJ!M%22RKmY%EC%84%C5%7F%11%B5%F4%B1D%F5%95%F9%B6%3C%DC.%BE%17%F3D%100o%0Eu%1F%87%90%E0%E2%1D%2F%B6sF%1B%04F%B4%85%14%99%E2%D8A%2C%ABgh%5B%5E%E9QpZ%22%EE%A2%D4%C3%1DatR%84%AFL(%A4M%BDx%8A%FF%81%F7B19-i%D4%FB%FDsx%D1a%F1%9Dx'%9E.24%1C%A5%9A!l%D1%D5%E1%8F%81v%8D%CAe%2C%AA%20%5E%A9B%92Y%20(%E7B%84N%A1%5B%D8%D0%8A%A7%9E%F6%19G3%25%24%EDJ%2C%A1%82C%9Cc%8E%8Ff%A0%B45(%8EF%FA%D3%B0%0C'x4%F3%1DN%5B%7C%87%D3Es%7C8M%FA%0E%A7%A7g%1CN%1F%D6%F5%BF%00%03%00%F0%D6%123%E2%AF%16%B8%00%00%00%00IEND%AEB%60%82";
