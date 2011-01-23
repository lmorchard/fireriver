TODO
----

* Bugs
    * Revisit real-time updates, which seem broken now with folder views
    * Figure out how to better to chunked item insertion
        * ...and cancellation thereof when switching folders in the middle of
            an update

* River UX
    * Update folder nav list in response to bookmark observer seeing folder 
        add / move / remove
    * Rework flat list of functions for UI handling into object wrapped around
        worker instance for index UI
    * Make page header float down along with scrolling, anticipating that it
        may hold UI controls in the very near future
    * Add first-run panel with doco on the addon, hide after first run
    * Preference for iframes auto-expanding when visible
    * Pref for # of items on page
    * Sharing / read later / star it / flag it buttons
    * Make clicked / visited items disappear after a little while?
    * Use infinite scroll, only load / render a pageful of items at a time
        * https://github.com/paulirish/infinite-scroll
        * Any way to use generators across the worker message channel separation?

* Chrome UX
    * Find some better images for widget icons in addon-bar
    * Hide feed detection notification after a few seconds?

* Live Bookmarks augmentations
    * Retain past items, up to a limit, when parsing new items from feed?

* General intelligence
    * Look into [thin-server RSS sync][] for item status
    * Only show new stuff
        * Using history and visited links for cues
        * Sync with Google Reader somehow?
        * Use a thin-server RSS sync?
    * Look into pubsubhubbub to somehow trigger livemark updates
    * Do smarter stuff with visit count, so feeds from more visited pages get higher priority
    * Expose control to change the refresh timing of live bookmarks (could be hazardous)

[thin-server RSS sync]: http://inessential.com/2010/02/08/idea_for_alternative_rss_syncing_system

* Misc
    * Rework flat list of functions for UI handling into object wrapped around
        worker instance for index UI?
    * Allow filtering by tags on Live Bookmarks
    * Allow subfolders in the "Fireriver Feeds" folder, filter by those
    * Configurable URL patterns for sites to ignore for feed detection
    * Currently deferring opening notification box until tab is visible - is
        there any way to open a notification box on a background tab?
    * L10N... someday?
