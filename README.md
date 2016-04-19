Red Hat Access: StrataJS
========================

JavaScript Library to interact with the Red Hat Customer Portal API

Requires [jQuery](https://jquery.org/) and [jsUri](https://github.com/derek-watson/jsUri)

See test/js/stratajs-driver.js for usage examples

### Testing Locally

Using Apache or Nginx to proxy / to 8080 or any port of your choosing.

Edit `/etc/hosts` to point foo.redhat.com to localhost.

In the stratajs directory start `python -m SimpleHTTPServer 8080`

In your browser go to: https://foo.redhat.com/test/index.html