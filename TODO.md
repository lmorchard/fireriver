TODO
----

* Bugs
    * Figure out how to get favicons that aren't cached

* Chrome UX
    * Move "reload all bookmarks" to river UI
    * Find some better images for widget icons in addon-bar
    * Hide feed detection notification after a few seconds?

* River UX
    * Loading indicator for parts of river that are in-progress
    * Preference for iframes auto-expanding when visible
    * Smooth animation for iframe expansion?
    * Pref for # of items on page
    * Sharing buttons
    * Make clicked / visited items disappear after a little while?
    * Use infinite scroll, only load / render a pageful of items at a time
        * https://github.com/paulirish/infinite-scroll
        * Any way to use generators across the worker message channel separation?

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
    * Expose control to change the refresh timing of live bookmarks (could be hazardous)

[thin-server RSS sync]: http://inessential.com/2010/02/08/idea_for_alternative_rss_syncing_system

* Misc
    * Rework flat list of functions for UI handling 1into object wrapped around
        worker instance for index UI?
    * Allow filtering by tags on Live Bookmarks
    * Allow subfolders in the "Fireriver Feeds" folder, browse by those
    * Configurable URL patterns for sites to ignore for feed detection
    * Currently deferring opening notification box until tab is visible - is
        there any way to open a notification on a background tab?
    * L10N... someday?
