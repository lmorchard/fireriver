TODO
----

* Bugs
    * Figure out how to get favicons that aren't cached

* Browser chrome UX
    * Find some better images for widget icons in addon-bar
    * Hide feed detection notification after a few seconds?

* River page UX
    * Loading indicator for parts of river that are in-progress
    * Preference for iframes auto-expanding when visible
    * Smooth animation for iframe expansion?
    * Try making the feed page build more async?
        * setTimeout-ify the insertion of each item?
    * Pref for # of items on page
    * Sharing buttons
    * Real-time auto-updating as new items arrive
    * Use infinite scroll, only load / render a pageful of items at a time
        * https://github.com/paulirish/infinite-scroll

* Live Bookmarks augmentations
    * Retain past items, up to a limit, when parsing new items from feed?

* General intelligence
    * Do smarter stuff with visit count, so feeds from more visited pages get higher priority
    * Only show new stuff
        * Using history and visited links for cues
        * Sync with Google Reader somehow?
        * Use a thin-server RSS sync?
    * Look into pubsubhubbub for realtime update cues.
    * Look into [thin-server RSS sync][] for item status

[thin-server RSS sync]: http://inessential.com/2010/02/08/idea_for_alternative_rss_syncing_system

* Misc
    * Allow filtering by tags on Live Bookmarks
    * Allow subfolders in the "Fireriver Feeds" folder, browse by those
    * Configurable URL patterns for sites to ignore for feed detection

