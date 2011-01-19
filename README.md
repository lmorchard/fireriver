# Fireriver

This is an experiment at building a magical River of news in Firefox that spies
on your browsing habits to find feeds.

It's probably not worth using right now, and is likely very horrible.

## Tips / Notes

* Fireriver will create a new bookmark folder named "Fireriver Feeds"

* Fireriver will use Live Bookmarks in this folder to build a [River of News][]
    page, which you can view by clicking the feed icon on the add-on bar.

* There's a second icon on the add-on bar: It reloads all Live Bookmarks.

* Fireriver creates new Live Bookmarks whenever it notices new feeds on the
    pages you visit.

* You can add Live Bookmarks to the "Fireriver Feeds" folder, and Fireriver
    will include them in the river.

* If you delete a Live Bookmark from the "Fireriver Feeds" folder, Fireriver
    will try not to add that feed again.

* You can hide feeds you don't care about. Once hidden, you can find them at
    the bottom of the page to reveal again.

* Everything Fireriver knows is tied to your Live Bookmarks. If you delete
    them, Fireriver's data goes away too.

## Credits

Influenced by and thieving heavily from:

* [Sage][]
* [Ambient News][]

[River of News]: http://www.reallysimplesyndication.com/riverOfNews
[Sage]: http://code.google.com/p/sage/
[Ambient News]: http://www.toolness.com/wp/?p=158
