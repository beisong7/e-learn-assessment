# Video test fixture

`flower.mp4` is the short public-domain/CC0 flower sample used in MDN's interactive video examples:

https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4

It is retained here only to make real video playback, seeking, resume, and ended-event tests deterministic. Browser tests fulfill video requests with HTTP byte-range responses from this file. The application itself currently references the hosted sample URL.
