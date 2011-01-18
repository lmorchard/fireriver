/**
 * Fireriver main module
 */
const {Cc,Ci} = require("chrome");

const self = require('self');
const data = self.data;
const tabs = require("tabs");
const notifications = require("notifications");
const pageMod = require("page-mod");
const widget = require("widget");
const simpleStorage = require("simple-storage");
const pageWorkers = require("page-worker");
const preferences = require("preferences-service");
const request = require("request");

var livemarkService = Cc["@mozilla.org/browser/livemark-service;2"] 
    .getService(Ci.nsILivemarkService);
var faviconService = Cc["@mozilla.org/browser/favicon-service;1"]
    .getService(Ci.nsIFaviconService);
var historyService = Cc["@mozilla.org/browser/nav-history-service;1"]
    .getService(Ci.nsINavHistoryService);
var annotationService = Cc["@mozilla.org/browser/annotation-service;1"]
    .getService(Ci.nsIAnnotationService);
    
const index_url = data.url('index.html');

const ANNOTATION_FEED_URL = 'fireriver/feed-url';
const ANNOTATION_FEED_XML = 'fireriver/feed-xml';
const ANNOTATION_FEED_XML_LAST_FETCH = 'fireriver/feed-xml-last-fetch';
const ANNOTATION_FEED_JSON = 'fireriver/feed-json';

const MAX_FEEDS = 100;

const FEED_SCAN_INTERVAL = 1000 * 60 * 10 // 10 min

var last_feed_scan = null;

/** Main driver */
exports.main = function (options, callbacks) {

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
            indexReady(worker);
        }
    });

    // Spy on all pages to discover new feeds.
    pageMod.PageMod({
        include: '*',
        contentScriptWhen: 'ready',
        contentScriptFile: data.url('js/feed-finder.js'),
        onAttach: function (worker) {
            worker.on('message', handleFeedsFoundForPage);

            var now = new Date().getTime();
            if (!last_feed_scan || (now - last_feed_scan) > FEED_SCAN_INTERVAL) {
                last_feed_scan = now;
                scanFeeds();
            }
        }
    });

}

/** Clean up on unload. */
exports.onUnload = function (reason) {
}

/** Open the index page UI. */
function openIndex () {
    tabs.open({ url: index_url });
}

/** Handle readiness of index UI */
function indexReady (worker) {

    scanFeeds();

    var root = queryHistoryForFeeds();
    var max = Math.min(MAX_FEEDS, root.childCount);

    var items = [];
    var feeds = [];

    for (var i=0; i<max; i++) {
        var child = root.getChild(i);
        
        item_out = {
            uri: child.uri,
            title: child.title,
            favicon: '',
            feed: '',
            xml: ''
        };
        
        try {
            item_out.favicon = faviconService.getFaviconDataAsDataURL(
                faviconService.getFaviconForPage(url(child.uri)));
        } catch (e) { }
        
        if (annotationService.pageHasAnnotation(url(child.uri), ANNOTATION_FEED_URL)) {
            item_out.feed = annotationService.getPageAnnotation(url(child.uri), 
                ANNOTATION_FEED_URL);
        }

        if (annotationService.pageHasAnnotation(url(child.uri), ANNOTATION_FEED_XML)) {
            item_out.xml = annotationService.getPageAnnotation(url(child.uri), 
                ANNOTATION_FEED_XML);
        }
        
        items.push(item_out);

        try {
            var json_data = annotationService.getPageAnnotation(
                url(child.uri), ANNOTATION_FEED_JSON);
            feeds.push(JSON.parse(json_data));
        } catch (e) { }
    }

    //worker.postMessage({ type: 'historyUpdate', items: items });
    worker.postMessage({ type: 'feedsUpdate', feeds: feeds });

}

/** Query for history entries with feeds */
function queryHistoryForFeeds () {
    var options = historyService.getNewQueryOptions();
    options.resultType = options.RESULTS_AS_URI;
    options.sortingMode = options.SORT_BY_VISITCOUNT_DESCENDING;
    
    var query = historyService.getNewQuery();
    query.annotation = ANNOTATION_FEED_URL;

    var result = historyService.executeQuery(query, options);
    var root = result.root;
    root.containerOpen = true;

    return root;
}

/** Scan feeds for new items. */
function scanFeeds () {
    console.log("Scanning feeds...");
    var root = queryHistoryForFeeds();
    var max = Math.min(MAX_FEEDS, root.childCount);
    for (var i=0; i<max; i++) {
        var child = root.getChild(i);
        var page_url = url(child.uri);
        var feed_url = annotationService.getPageAnnotation(
            url(child.uri), ANNOTATION_FEED_URL);
        refreshFeed(child.uri, feed_url);
    }
}

/** Attempt to fetch feed XML for a page */
function refreshFeed (page_url, feed_url) {

    var needs_refresh = false;

    if (!annotationService.pageHasAnnotation(url(page_url), ANNOTATION_FEED_XML)) {
        // No XML, so needs a refresh.
        needs_refresh = true;
    } else if (annotationService.pageHasAnnotation(url(page_url), 
            ANNOTATION_FEED_XML_LAST_FETCH)) {
        // If the last fetch was longer ago than the interval, need refresh.
        var last_fetch = new Date(annotationService.getPageAnnotation(url(page_url), 
            ANNOTATION_FEED_XML_LAST_FETCH));
        var now = new Date();
        console.log("Feed last refreshed " + feed_url + " " + last_fetch);
        if (now.getTime() - last_fetch.getTime() > FEED_SCAN_INTERVAL) {
            needs_refresh = true;
        }
    } else {
        needs_refresh = true;
    }
        
    if (!needs_refresh) {
        console.log("Skipping feed " + feed_url);
    } else {
        console.log("Refreshing feed " + feed_url);
        var req = request.Request({
            url: annotationService.getPageAnnotation(url(page_url), ANNOTATION_FEED_URL),
            onComplete: function (resp) {
                annotationService.setPageAnnotation(url(page_url), 
                    ANNOTATION_FEED_XML, 
                    resp.text, 0, annotationService.EXPIRE_WEEKS);
                annotationService.setPageAnnotation(url(page_url), 
                    ANNOTATION_FEED_XML_LAST_FETCH, 
                    ''+(new Date()), 0, annotationService.EXPIRE_WEEKS);
                parseFeed(page_url);
            }
        });
        req.get();
    }

}

/** Attempt to parse a page's feed into JSON */
function parseFeed (page_url) {

    var feed_url = annotationService.getPageAnnotation(url(page_url), 
        ANNOTATION_FEED_URL);
    var feed_xml = annotationService.getPageAnnotation(url(page_url), 
        ANNOTATION_FEED_XML);

    var feedProc = Cc["@mozilla.org/feed-processor;1"]
        .createInstance(Ci.nsIFeedProcessor);

    console.log("Parsing feed " + page_url);

    feedProc.listener = {
        
        handleResult: function resultListener_handleResult(aResult) {
            
            var nsIFeed = aResult.doc;
            if (!nsIFeed) { return; }

            feed = {};
            
            nsIFeed.QueryInterface(Ci.nsIFeed);
            
            feed.link = nsIFeed.link.spec;
            feed.title = nsIFeed.title.text;
            feed.subtitle = nsIFeed.subtitle.text;
            feed.favicon = faviconService.getFaviconDataAsDataURL(
                faviconService.getFaviconForPage(url(page_url)));

            feed.entries = [];
            for (var i = 0; i < nsIFeed.items.length; i++) {
                var item = nsIFeed.items.queryElementAt(i, Ci.nsIFeedEntry);
                var item_out = {
                    title: item.title.text,
                    link: item.link.spec,
                    published: item.published,
                    updated: item.updated,
                    summary: item.summary.text,
                    content: item.content
                };
                feed.entries.push(item_out);
            }

            var json_data = JSON.stringify(feed);
            
            annotationService.setPageAnnotation(url(page_url), ANNOTATION_FEED_JSON, 
                json_data, 0, annotationService.EXPIRE_WEEKS);
            
        }
    }

    feedProc.parseFromString(feed_xml, url(feed_url));
}

/** Handle a message from the index UI page */
function handleMessageFromIndex (worker, event) {
    console.log(worker);
    console.log(event);
}

/** Handle message that a feed was found from feed-finder.js */
function handleFeedsFoundForPage (event) {
    if (!event.items.length) { return; }
    annotationService.setPageAnnotation(url(event.url), ANNOTATION_FEED_URL, 
        event.items[0].url, 0, annotationService.EXPIRE_WEEKS);
    scanFeeds();
}

/** Utility to convert an URL string to URL object */
function url(spec) {
    if (typeof(spec) != "string") { return spec; }
    var classObj = Cc["@mozilla.org/network/io-service;1"];
    var ios = classObj.getService(Ci.nsIIOService);
    return ios.newURI(spec, null, null);
}
