TODO
----

* Stop using annotations, switch to simple storage?
    * Or, stick all the augmentations into a single JSON blob at the feed level?

* Try to use top-of-window banner to notify when feed added
    * Allow feedback like "Unsubscribe", "Never subscribe to this domain again"

* Allow filtering by tags on Live Bookmarks

* Allow subfolders in the "Fireriver Feeds" folder, browse by those

* Configurable URL patterns for sites to ignore for feed detection

* Find some better images for widgets in addon-bar

* Delete XPI from github, use downloads to host that

* Find out if page attributes in Places is an insane thing to keep using

* Switch to maintaining a folder of Live Bookmarks?
    * Live Bookmark items don't have summary / description content

* Loading indicator for summary iframes that are in progress

* Try making the feed page build more async?
    * setTimeout-ify the insertion of each item?

* Do smarter stuff with visit count, so feeds from more visited pages get higher priority

* Refrain from subscribing until page visited 2-3 times (configurable)

* Pref to enable/disable auto-sub of feeds altogether

* Find a good way to do feed scans on idle

* Pref to control feed scan interval

* Checkbox opt-out / hide of detected feeds

* Pref for # of items on page

* Controls to collapse / expand summaries

* Sharing buttons

* Verbosity setting for notifications of background activity?

* Incremental auto-updating as new items arrive

* Use infinite scroll, only load / render a pageful of items at a time
    * https://github.com/paulirish/infinite-scroll

* Preference for iframes auto-expanding when visible

* Smooth animation for iframe expansion?

* Retain past items, up to a limit, when parsing new items from feed

* Look into pubsubhubbub for realtime update cues.

* Look into [thin-server RSS sync][] for item status

[thin-server RSS sync]: http://inessential.com/2010/02/08/idea_for_alternative_rss_syncing_system
