/**
 * Fireriver main module
 */
const {Cc,Ci,Cr} = require("chrome");

const self = require('self');
const data = self.data;
const tabs = require("tabs");
const notifications = require("notifications");
const pageMod = require("page-mod");
const widget = require("widget");
const panel = require("panel");
const simpleStorage = require("simple-storage");
const pageWorkers = require("page-worker");
const preferences = require("preferences-service");
const request = require("request");

var bookmarksService = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
    .getService(Ci.nsINavBookmarksService);
var livemarkService = Cc["@mozilla.org/browser/livemark-service;2"] 
    .getService(Ci.nsILivemarkService);
var faviconService = Cc["@mozilla.org/browser/favicon-service;1"]
    .getService(Ci.nsIFaviconService);
var historyService = Cc["@mozilla.org/browser/nav-history-service;1"]
    .getService(Ci.nsINavHistoryService);
var annotationService = Cc["@mozilla.org/browser/annotation-service;1"]
    .getService(Ci.nsIAnnotationService);
    
const index_url = data.url('index.html');

const FRANNO_AUGMENTED = 'fireriver/augmented';
const FRANNO_HIDE      = 'fireriver/hide';
const FRANNO_PUBLISHED = 'fireriver/published';
const FRANNO_UPDATED   = 'fireriver/updated';
const FRANNO_SUMMARY   = 'fireriver/summary';
const FRANNO_CONTENT   = 'fireriver/content';
const FRANNO_AUTOADDED = 'fireriver/autoadded';

const MAX_FEEDS = 100;

const FEED_SCAN_INTERVAL = 1000 * 60 * 15 // 15 min

var last_feed_scan = null;
var bm_observer = null;

/** Main driver */
exports.main = function (options, callbacks) {

    if ('undefined' == typeof(simpleStorage.storage.feeds_seen)) {
        simpleStorage.storage.feeds_seen = {}
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

    widget.Widget({
        label: 'Reload All Livemarks',
        widget: 100,
        contentURL: data.url('img/refresh.png'),
        onClick: function () {
            notifications.notify({
                title: 'Reloading all Live Bookmarks',
                text: 'Your Live Bookmarks are now reloading.'
            });
            livemarkService.reloadAllLivemarks();
        }
    });

    // Set up content scripts for index UI
    pageMod.PageMod({
        include: index_url + '*',
        contentScriptFile: [
            data.url('js/jquery-1.4.4.min.js'), 
            data.url('js/jquery.timeago.js'), 
            data.url('js/jquery.cloneTemplate.js'), 
            data.url('js/index.js')
        ],
        contentScriptWhen: 'ready',
        onAttach: function (worker) {
            worker.on('message', function(event) {
                handleMessageFromIndex(worker, event);
            });
            handleIndexReady(worker);
        }
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

    var rootId = findRootBookmarkFolder();

    // Wire up the bookmark observer to watch the root folder for managed
    // livemarks.
    bm_observer = {
        onBeginUpdateBatch: function () { },
        onEndUpdateBatch: function () { },
        onItemRemoved: function (id, folder, index, type) {
            // TODO: Maybe retain removed items, to restore history?
            // console.debug("REMOVED " + JSON.stringify(Array.prototype.slice.call(arguments)));
        },
        onItemAdded: function (id, folder, index, type, uri) {
            // TODO: Livemarks removes all children and replaces - maybe munge that to retain history?
            // console.debug("ADDED " + JSON.stringify(Array.prototype.slice.call(arguments)));
        },
        onItemChanged: function (id, property, is_annotation, value) {
            console.debug("CHANGED " + JSON.stringify(Array.prototype.slice.call(arguments)));

            // When the livemark/loading annotation goes away, that feed is
            // done loading and has been processed.
            if (is_annotation && 'livemark/loading' == property && 
                    !annotationService.itemHasAnnotation(id, property)) {
                handleLivemarkFinishedLoading(id);
            }
        },
        onItemVisited: function (id, visit_id, time) { },
        onItemMoved: function (id, old_parent, old_idx, new_parent, new_idx) { },
        QueryInterface: function(iid) {
            if (iid.equals(Ci.nsINavBookmarkObserver) ||
                    iid.equals(Ci.nsISupports)) {
                return this;
            }
            throw Cr.NS_ERROR_NO_INTERFACE;
        }
    };

    bookmarksService.addObserver(bm_observer, false);
    // openIndex();

}

/** Clean up on unload. */
exports.onUnload = function (reason) {
    // TODO: Seems like I should do this, but it raises an error
    // bookmarksService.removeObserver(bm_observer);
}

/** Open the index page UI. */
function openIndex () {
    tabs.open({ url: index_url });
}

/** Handle readiness of index UI */
function handleIndexReady (worker) {
    postFeedsUpdate(worker);
}

var ROOT_FOLDER_NAME = "Fireriver Feeds";
var _currRootId = null;

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

/** Handle message that a feed was found from feed-finder.js */
function handleFeedsFoundForPage (event) {
    if (!event.items.length) { return; }

    var root_id = findRootBookmarkFolder();
    var feed = event.items[0];

    // Does a livemark for this feed already exist? If so, skip.
    var item_id = livemarkService.getLivemarkIdForFeedURI(url(feed.url));
    if (-1 != item_id) {
        return;
    }

    // Have we auto-added this feed before? If so, skip.
    // TODO: Observe quota for this!
    // TODO: Make panel to manage seen feeds / clear the record
    // TODO: Find a better way to manage seen feeds?
    if ('undefined' != typeof(simpleStorage.storage.feeds_seen[feed.url])) {
        return;
    }
    simpleStorage.storage.feeds_seen[feed.url] = 1;

    // Create a new one based on what was detected.
    item_id = livemarkService.createLivemark(root_id,
        event.title + ' - ' + feed.title, url(event.url), url(feed.url), -1); 
    annotationService.setItemAnnotation(item_id, FRANNO_AUTOADDED,
        true, 0, annotationService.EXPIRE_WEEKS);
        
    // TODO: Notification option when new feed added

}

/** Send an update of feeds and entries to display to index UI */
function postFeedsUpdate (worker) {

    var feeds = [];
    var hidden_feeds = [];

    // Start a search query on the root folder for feeds.
    var root_id = findRootBookmarkFolder();
    var query, result, options;
    query = historyService.getNewQuery();
    query.setFolders([root_id], 1);
    options = historyService.getNewQueryOptions();
    result = historyService.executeQuery(query, options);

    var root = result.root;
    root.containerOpen = true;

    // Iterate through top-level livemarks
    for (var i=0; i<root.childCount; i++) {
        var feed_node = root.getChild(i);

        if (feed_node.type != feed_node.RESULT_TYPE_FOLDER) { 
            // Skip, if for some reason this isn't a folder.
            continue; 
        }
        
        // Descend into the feed folder to find entry children.
        feed_node.QueryInterface(Ci.nsINavHistoryContainerResultNode);
		feed_node.containerOpen = true;
        var feed_node_id = feed_node.itemId;
        if (!livemarkService.isLivemark(feed_node_id)) {
            continue;
        }

        // Start building the distilled data for this feed.
        var feed_out = {
            id: feed_node_id, // TODO: Is this unwise to expose to index UI?
            title: feed_node.title,
            url: livemarkService.getFeedURI(feed_node_id),
            link: livemarkService.getSiteURI(feed_node_id),
        };
        if (feed_out.url) { feed_out.url = feed_out.url.spec; }
        if (feed_out.link) { feed_out.link = feed_out.link.spec; }

        // Grab a favicon, if we can.
        try {
            feed_out.favicon = faviconService.getFaviconDataAsDataURL(
                faviconService.getFaviconForPage(url(feed_out.link)));
        } catch (e) { }

        if (annotationService.itemHasAnnotation(feed_node_id, FRANNO_HIDE)) {
            // Skip this feed, because it's been hidden 
            // TODO: Construct UI for un-hiding feeds.
            hidden_feeds.push(feed_out);
            continue;
        }

        // Gather up the entry children of the feed.
        var entries = [];
        for (var j=0; j<feed_node.childCount; j++) {
            var entry_node = feed_node.getChild(j);
            var entry_node_id = entry_node.itemId;

            if (!annotationService.itemHasAnnotation(entry_node_id, FRANNO_AUGMENTED)) {
                // Skip entries not yet augmented by Fireriver
                continue;
            }

            var entry_out = {
                title: entry_node.title,
                link: entry_node.uri,
                summary: null,
                published: new Date(entry_node.dateAdded/1000),
                update: new Date(entry_node.lastModified/1000)
            };

            try {
                entry_out.summary = annotationService.getItemAnnotation(
                    entry_node_id, FRANNO_SUMMARY);
            } catch (e) { 
                // TODO: ???
            }

            try {
                entry_out.published = annotationService.getItemAnnotation(
                    entry_node_id, FRANNO_PUBLISHED);
            } catch (e) { 
                // TODO: ???
            }

            entries.push(entry_out);
        }

		feed_node.containerOpen = false;
        feed_out.entries = entries;
        feeds.push(feed_out);

    }
    root.containerOpen = false;

    worker.postMessage({ 
        type: 'feedsUpdate', 
        feeds: feeds,
        hidden_feeds: hidden_feeds
    });
}

/** Determine whether a given livemark is managed by Fireriver */
function isLivemarkManaged(folder_id) {
    if (!livemarkService.isLivemark(folder_id)) { 
        // Only livemarks are managed.
        return false; 
    }
    // TODO: Make this account for subfolders within the root folder.
    var root_id = findRootBookmarkFolder();
    if (bookmarksService.getFolderIdForItem(folder_id) != root_id) {
        return false;
    }
    return true;
}

/** Handle when a livemark has finished loading */
function handleLivemarkFinishedLoading(folder_id) {

    // TODO: Abort, if this isn't a livemark managed by Fireriver
    //if (!isLivemarkManaged(folder_id)) { return; }

    var feed_url = livemarkService.getFeedURI(folder_id);
    var req = request.Request({
        url: feed_url.spec,
        onComplete: function (resp) {
            parseFeed(folder_id, feed_url, resp.text);
        }
    });
    req.get();
}

/** Parse a feed for a folder, attempt to augment children with more data from feed */
function parseFeed (folder_id, feed_url, feed_xml) {

    var feedProc = Cc["@mozilla.org/feed-processor;1"]
        .createInstance(Ci.nsIFeedProcessor);

    feedProc.listener = {
        
        handleResult: function resultListener_handleResult(aResult) {

            if (!aResult || !aResult.doc || aResult.bozo) {
                console.debug("Feed parsing failed for " + feed_url.spec); 
                //console.debug(aResult); 
                //console.debug(aResult.bozo); 
                return;
            }
            var nsIFeed = aResult.doc;
            nsIFeed.QueryInterface(Ci.nsIFeed);

            if (annotationService.itemHasAnnotation(folder_id, FRANNO_AUTOADDED)) {
                bookmarksService.setItemTitle(folder_id, nsIFeed.title.text);
                livemarkService.setSiteURI(folder_id, url(nsIFeed.link));
            }

            for (var i = 0; i < nsIFeed.items.length; i++) {
                var item = nsIFeed.items.queryElementAt(i, Ci.nsIFeedEntry);

                var bookmark_ids = bookmarksService.getBookmarkIdsForURI(url(item.link));
                var entry_id = null;
                for (var j=0; j<bookmark_ids; j++) {
                    var id = bookmark_ids[j];
                    if (bookmarksService.getFolderIdForItem(id) == folder_id) {
                        entry_id = id; 
                        break;
                    }
                }
                if (!entry_id) { continue; }

                try {
                    var summary = '';
                    if (item.summary) { summary = item.summary.text; }
                    else if (item.content) { summary = item.content.text; }
                    else {
                        console.debug("CONTENT EMPTY?! " + feed_url.spec + " " + item.content);
                    }
                    annotationService.setItemAnnotation(entry_id, FRANNO_SUMMARY,
                        summary, 0, annotationService.EXPIRE_WEEKS);
                } catch (e) { 
                    // TODO: ???
                    console.debug('CONTENT SET FAIL: ' + feed_url.spec + ' ' + item.title.text + ' ' + e);
                }

                try {
                    var published = item.published || item.updated;
                    annotationService.setItemAnnotation(entry_id, FRANNO_PUBLISHED,
                        published, 0, annotationService.EXPIRE_WEEKS);
                } catch (e) { 
                    // TODO: ???
                    console.debug('PUBLISHED SET FAIL: ' + feed_url.spec + ' ' + item.title.text + ' ' + e);
                }

                annotationService.setItemAnnotation(entry_id, FRANNO_AUGMENTED,
                    true, 0, annotationService.EXPIRE_WEEKS);

            }
        }
    }

    feedProc.parseFromString(feed_xml, url(feed_url));
}

/** Handle a message from the index UI page */
function handleMessageFromIndex (worker, event) {
    if ('undefined' == typeof(event.type)) { return; }
    switch (event.type) {
        case 'hideFeed':
            hideFeed(worker, event); break;
        case 'unhideFeed':
            unhideFeed(worker, event); break;
        default:
            console.debug(worker);
            console.debug(JSON.stringify(event));
            break;
    }
}

/** Handle request from index UI to hide a feed */
function hideFeed (worker, event) {
    console.debug("HIDE " + JSON.stringify(event));
    annotationService.setItemAnnotation(event.id, FRANNO_HIDE, 
        1, 0, annotationService.EXPIRE_WEEKS);
    postFeedsUpdate(worker);
}

/** Handle request from index UI to hide a feed */
function unhideFeed (worker, event) {
    console.debug("UNHIDE " + JSON.stringify(event));
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
