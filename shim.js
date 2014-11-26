/*jslint node: true*/
'use strict';
var request = require('request');
var _ = require('lodash');

function getCookieString (cookieArr) {
    return cookieArr.join('; ');
}

module.exports = {
    isFunction: _.isFunction,
    extend: _.assign,
    ajax: function(args) {
        args.url = args.url.toString();
        args.strictSSL = false;
        var cookies = args.getCookieJar();
        if (cookies && cookies.length) {
            args.headers.Cookie = getCookieString(cookies);
        }
        var basicAuthToken = args.getBasicAuthToken();
        if (basicAuthToken) {
            //Include Basic Auth Credentials if available, will try SSO Cookie otherwise
            if (basicAuthToken && basicAuthToken.length) {
                args.headers['X-Omit'] = 'WWW-Authenticate';
                args.headers.Authorization = 'Basic ' + basicAuthToken;
                // Basic trumps Cookie
                delete args.headers.Cookie;
            }
        }
        request(args, function(err, response, body){
            if (err || response.statusCode >= 400) {
                return args.error({status: response.statusCode, statusText: body});
            }
            try {
                return args.success(JSON.parse(body));
            } catch (e) {
                return args.success(body);
            }
        });
    },
    btoa: function(string) {
        return new Buffer(string).toString('base64');
    }
};
