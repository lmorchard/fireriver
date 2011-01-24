TODO
----

* Bugs
    * Revisit real-time updates, which seem broken now with folder views

* River UX
    * Disable / hide summary reveal control where summary content is missing
    * Real-time updates to feed display currently visible when new items come in.
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
    * Key modifier (eg. alt?) to toggle summaries for entries within a feed?

* Chrome UX
    * Some indication that a feed refresh is in progress
    * Switch from notification box to popup notification?
        * https://developer.mozilla.org/en/Using_popup_notifications
        * https://developer.mozilla.org/en/JavaScript_code_modules/PopupNotifications.jsm
        * https://developer.mozilla.org/en/Components.utils.import
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
    * Split feed detection / notification out into its own dedicated addon?
    * Build a log of livemark feed processing events
        * # of new items by date
        * HTTP failures, feed parsing errors
    * Delete / archive livemarks that fail 3-5 times?
        * Could be problematic if machine is just offline, or some other global problem
    * Rework flat list of functions for UI handling into object wrapped around
        worker instance for index UI?
    * Allow filtering by tags on Live Bookmarks
    * Configurable URL patterns for sites to ignore for feed detection
    * Currently deferring opening notification box until tab is visible - is
        there any way to open a notification box on a background tab?
    * L10N... someday?
