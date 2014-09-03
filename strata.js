/*jslint browser: true, devel: true, todo: true, unparam: true */
/*global define, btoa, Markdown */
/*
 Copyright 2014 Red Hat Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
(function (root, factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define('strata', ['jquery', 'jsUri'], factory);
    } else {
        root.strata = factory(root.$, root.Uri);
    }
}(this, function ($, Uri) {
    'use strict';

    var strata = {},
    //Since we can't set the UserAgent
        redhatClient = 'redhat_client',
        redhatClientID,
        //Internal copy of user, might be useful for logging, only valid for cookie auth
        authedUser = {},
        basicAuthToken = '',
        portalHostname,
        strataHostname,
        baseAjaxParams = {},
        authAjaxParams,
        checkCredentials,
        checkCredentialsNoBasic,
        fetchSolution,
        fetchArticle,
        searchArticles,
        fetchCase,
        fetchCaseComments,
        createComment,
        fetchCases,
        fetchCasesCSV,
        addNotifiedUser,
        removeNotifiedUser,
        updateCase,
        filterCases,
        createAttachment,
        deleteAttachment,
        listCaseAttachments,
        getSymptomsFromText,
        listGroups,
        createGroup,
        deleteGroup,
        fetchGroup,
        listProducts,
        fetchProduct,
        fetchProductVersions,
        caseTypes,
        caseSeverities,
        caseStatus,
        fetchSystemProfiles,
        fetchSystemProfile,
        createSystemProfile,
        fetchAccounts,
        fetchAccount,
        fetchURI,
        fetchEntitlements,
        authHostname,
        fetchAccountUsers;

    strata.version = '1.0.34';
    redhatClientID = 'stratajs-' + strata.version;

    if (window.portal && window.portal.host) {
        //if this is a chromed app this will work otherwise we default to prod
        portalHostname = new Uri(window.portal.host).host();
        authHostname = portalHostname;

    } else {
        portalHostname = 'access.redhat.com';
        authHostname = portalHostname;
    }

    if(localStorage && localStorage.getItem('portalHostname')) {
        portalHostname = localStorage.getItem('portalHostname');
    }

    strataHostname = new Uri('https://api.' + portalHostname);
    strataHostname.addQueryParam(redhatClient, redhatClientID);

    strata.setRedhatClientID = function (id) {
        redhatClientID = id;
        strataHostname = new Uri(strataHostname);
        strataHostname.addQueryParam(redhatClient, redhatClientID);
    };

    strata.setStrataHostname = function (hostname) {
        portalHostname = hostname;
        strataHostname = new Uri(portalHostname);
        strataHostname.addQueryParam(redhatClient, redhatClientID);
    };

    strata.setPortalHostname = function (hostname) {
        portalHostname = hostname;
        authHostname = hostname;
        strataHostname = new Uri('https://api.' + portalHostname);
        strataHostname.addQueryParam(redhatClient, redhatClientID);
    };

    strata.setAuthHostname = function (hostname) {
        authHostname = hostname;
        authAjaxParams = $.extend({
            url: 'https://' + authHostname +
                '/services/user/status?jsoncallback=?',
            dataType: 'jsonp'
        }, baseAjaxParams);
    };

    strata.getAuthInfo = function () {
        return authedUser;
    };

    //Store Base64 Encoded Auth Token
    basicAuthToken = localStorage.getItem('rhAuthToken');
    authedUser.login = localStorage.getItem('rhUserName');

    strata.setCredentials = function (username, password) {
        if(isASCII(username + password)){
            basicAuthToken = btoa(username + ':' + password);
            localStorage.setItem('rhAuthToken', basicAuthToken);
            localStorage.setItem('rhUserName', username);
            authedUser.login = username;
            return true;
        } else{
            return false;
        }
    };

    function isASCII(str) {
        return /^[\x00-\x7F]*$/.test(str);
    }

    strata.clearCredentials = function () {
        strata.clearBasicAuth();
        strata.clearCookieAuth();
        authedUser = {};
    };

    strata.clearBasicAuth = function () {
        localStorage.setItem('rhAuthToken', '');
        localStorage.setItem('rhUserName', '');
        basicAuthToken = '';
    };

    strata.clearCookieAuth = function () {
        var logoutFrame = document.getElementById('rhLogoutFrame');
        if (!logoutFrame) {
            // First time logging out.
            $('body').append('<iframe id="rhLogoutFrame" src="https://' + authHostname + '/logout" name="rhLogoutFrame" style="display: none;"></iframe>');
        } else {
            // Will force the iframe to reload
            logoutFrame.src = logoutFrame.src;
        }
    };


    //Private vars related to the connection
    baseAjaxParams = {
        accepts: {
            jsonp: 'application/json, text/json'
        },
        crossDomain: true,
        type: 'GET',
        method: 'GET',
        beforeSend: function (xhr) {
            //Include Basic Auth Credentials if available, will try SSO Cookie otherwise
            xhr.setRequestHeader('X-Omit', 'WWW-Authenticate');
            if (basicAuthToken !== null) {
                if (basicAuthToken.length !== 0) {
                    xhr.setRequestHeader('Authorization', 'Basic ' + basicAuthToken);
                }
            }
        },
        headers: {
            Accept: 'application/json, text/json'
        },
        xhrFields: {
            withCredentials: true
        },
        contentType: 'application/json',
        data: {},
        dataType: 'json'
    };

    authAjaxParams = $.extend({
        url: 'https://' + authHostname +
            '/services/user/status?jsoncallback=?',
        dataType: 'jsonp'
    }, baseAjaxParams);

    //Helper Functions
    //Convert Java Calendar class to something we can use
    //TODO: Make this recursive
    function convertDates(entry) {
        //Iterate over the objects for *_date
        var key;
        for (key in entry) {
            if (entry.hasOwnProperty(key)) {
                if (/[\s\S]*_date/.test(key)) {
                    //Skip indexed_date, it's not a real "Date"
                    if (key !== 'indexed_date') {
                        entry[key] = new Date(entry[key]);
                    }
                }
            }
        }
    }

    function markDownToHtml(entry) {
        var html = Markdown(entry);
        return html;
    }


    //Remove empty fields from object
    //TODO: Make this recursive, so it could remove nested objs
    function removeEmpty(entry) {
        var key;
        for (key in entry) {
            if (entry.hasOwnProperty(key)) {
                //Removes anything with length 0
                if (entry[key].length === 0) {
                    delete entry[key];
                }
            }
        }
    }

    //Function to test whether we've been passed a URL or just a string/ID
    function isUrl(path) {
        return path.search(/^http/) >= 0;
    }

    //Helper classes
    //Class to describe the required Case fields
    strata.Case = function () {
        return {
            summary: '',
            description: '',
            product: '',
            version: ''
        };
    };

    //Class to describe required Case Comment fields
    strata.CaseComment = function () {
        return {
            text: '',
            public: true
        };
    };

    //Class to help create System Profiles
    strata.SystemProfile = function () {
        return {
            account_number: '',
            case_number: '',
            deprecated: false,
            //Append SystemProfileCategoryDetails Objects here
            system_profile_category: [
            ]
        };
    };

    //Helper to deal with SystemProfileCategories
    strata.SystemProfileCategoryDetails = function () {
        return {
            system_profile_category_name: '',
            system_profile_category_summary: '',
            //Append key, value pairs here
            system_profile_category_details: []
        };
    };

    //Example of fields that could be supplied to case filter
    //Fields with length 0 will be stripped out of this obj prior to being sent
    strata.CaseFilter = function () {
        var groupNumbers = [];
        return {
            //The _date objects should be real Date objs
            start_date: '',
            end_date: '',
            account_number: '',
            include_closed: false,
            include_private: false,
            keyword: '',
            group_numbers: groupNumbers,
            addGroupNumber: function (num) {
                groupNumbers.push({group_number: num});
            },
            start: 0,
            count: 50,
            only_ungrouped: false,
            owner_sso_name: '',
            product: '',
            severity: '',
            sort_field: '',
            sort_order: '',
            status: '',
            type: '',
            created_by_sso_name: '',
            resource_type: '',
            id: '',
            uri: '',
            view_uri: ''
        };
    };

    //PUBLIC METHODS
    //User provides a loginSuccess callback to handle the response
    strata.checkLogin = function (loginHandler) {
        if (!$.isFunction(loginHandler)) { throw 'loginHandler callback must be supplied'; }

        checkCredentials = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/users')
                .addQueryParam('ssoUserName', authedUser.login),
            context: authedUser,
            success: function (response) {
                this.name = response.first_name + ' ' + response.last_name;
                this.is_internal = response.is_internal;
                this.org_admin = response.org_admin;
                this.has_chat = response.has_chat;
                this.session_id = response.session_id;
                this.can_add_attachments = response.can_add_attachments;
                loginHandler(true, this);
            },
            error: function () {
                strata.clearBasicAuth();
                loginHandler(false);
            }
        });

        var loginParams = $.extend({
            context: authedUser,
            success: function (response) {
                //We have an SSO Cookie, check that it's still valid
                if (response.authorized) {
                    //Copy into our private obj
                    authedUser = response;
                    //Needs to be here so authedUser.login will resolve
                    checkCredentialsNoBasic = $.extend({}, baseAjaxParams, {
                        context: authedUser,
                        url: strataHostname.clone().setPath('/rs/users')
                            .addQueryParam('ssoUserName', authedUser.login),
                        beforeSend: function (xhr) {
                            xhr.setRequestHeader('X-Omit', 'WWW-Authenticate');
                        },
                        //We are all good
                        success: function (response) {
                            this.sso_username = response.sso_username;
                            this.name = response.first_name + ' ' + response.last_name;
                            this.is_internal = response.is_internal;
                            this.org_admin = response.org_admin;
                            this.has_chat = response.has_chat;
                            this.session_id = response.session_id;
                            this.can_add_attachments = response.can_add_attachments;
                            loginHandler(true, this);
                        },
                        //We have an SSO Cookie but it's invalid
                        error: function () {
                            strata.clearCookieAuth();
                            loginHandler(false);
                        }
                    });
                    //Check /rs/users?ssoUserName=sso-id
                    $.ajax(checkCredentialsNoBasic);
                } else {
                    strata.clearCookieAuth();
                    $.ajax(checkCredentials);
                }
            }
        }, authAjaxParams);

        //Check if we have an SSO Cookie
        $.ajax(loginParams);
    };

    //Sends data to the strata diagnostic toolchain
    strata.problems = function (data, onSuccess, onFailure, limit) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { data = ''; }
        if (limit === undefined) { limit = 50; }

        var getSolutionsFromText = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/problems')
                .addQueryParam('limit', limit),
            data: data,
            type: 'POST',
            method: 'POST',
            contentType: 'text/plain',
            success: function (response) {
                if (response.source_or_link_or_problem[2] !== undefined && response.source_or_link_or_problem[2].source_or_link !== undefined) {
                    //Gets the array of solutions
                    var suggestedSolutions = response.source_or_link_or_problem[2].source_or_link;
                    onSuccess(suggestedSolutions);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(getSolutionsFromText);
    };

    //Base for solutions
    strata.solutions = {};

    //Retrieve a solution
    strata.solutions.get = function (solution, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (solution === undefined) { onFailure('solution must be defined'); }

        var url;
        if (isUrl(solution)) {
            url = new Uri(solution);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/solutions/' + solution);
        }

        fetchSolution = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                convertDates(response);
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchSolution);
    };

    //Search for solutions
    strata.solutions.search = function (keyword, onSuccess, onFailure, limit, chain) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (keyword === undefined) { keyword = ''; }
        if (limit === undefined) {limit = 50; }
        if (chain === undefined) {chain = false; }

        var searchSolutions = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/solutions')
                .addQueryParam('keyword', encodeURIComponent(keyword))
                .addQueryParam('limit', limit),
            success: function (response) {
                if (chain && response.solution !== undefined) {
                    response.solution.forEach(function (entry) {
                        strata.solutions.get(entry.uri, onSuccess, onFailure);
                    });
                } else if (response.solution !== undefined) {
                    response.solution.forEach(convertDates);
                    onSuccess(response.solution);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(searchSolutions);
    };

    //Base for articles
    strata.articles = {};

    //Retrieve an article
    strata.articles.get = function (article, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (article === undefined) { onFailure('article must be defined'); }

        var url;
        if (isUrl(article)) {
            url = new Uri(article);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/articles/' + article);
        }

        fetchArticle = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                convertDates(response);
                if (response !== undefined && response.body !== undefined && response.body.html === undefined) {
                    response.body = markDownToHtml(response.body);
                    onSuccess(response);
                }
                else if (response !== undefined && response.body !== undefined && response.body.html !== undefined) {
                    onSuccess(response);
                } else {
                    onFailure('Failed to retrieve Article ' + article);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchArticle);
    };

    //Search articles
    strata.articles.search = function (keyword, onSuccess, onFailure, limit, chain) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (keyword === undefined) { keyword = ''; }
        if (limit === undefined) {limit = 50; }
        if (chain === undefined) {chain = false; }

        var url = strataHostname.clone().setPath('/rs/articles');
        url.addQueryParam('keyword', encodeURIComponent(keyword));
        url.addQueryParam('limit', limit);

        searchArticles = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (chain && response.article !== undefined) {
                    response.article.forEach(function (entry) {
                        strata.articles.get(entry.uri, onSuccess, onFailure);
                    });
                } else if (response.article !== undefined) {
                    response.article.forEach(convertDates);
                    onSuccess(response.article);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(searchArticles);
    };

    //Base for cases
    strata.cases = {};
    strata.cases.attachments = {};
    strata.cases.comments = {};
    strata.cases.notified_users = {};

    //Retrieve a case
    strata.cases.get = function (casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum);
        }

        fetchCase = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response) {
                    convertDates(response);
                    onSuccess(response);
                } else {
                    onFailure('Failed to retrieve Case: ' + casenum);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchCase);
    };

    //update case comment
    strata.cases.comments.update = function (casenum, comment, commentId, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/comments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/comments/' + commentId);
        }

        fetchCaseComments = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'PUT',
            method: 'PUT',
            data: JSON.stringify(comment),
            statusCode: {
                200: function(response) {
                  onSuccess();
                },
                400: onFailure
            }
        });
        $.ajax(fetchCaseComments);
    };

    //Retrieve case comments
    strata.cases.comments.get = function (casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/comments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/comments');
        }

        fetchCaseComments = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.comment !== undefined) {
                    response.comment.forEach(convertDates);
                    onSuccess(response.comment);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchCaseComments);
    };

    //TODO: Support DRAFT comments? Only useful for internal
    //Create a new case comment
    strata.cases.comments.post = function (casenum, casecomment, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (casecomment === undefined) { onFailure('casecomment must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/comments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/comments');
        }

        createComment = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casecomment),
            type: 'POST',
            method: 'POST',
            success: function (response, status, xhr) {
                //Created case comment data is in the XHR
                var commentnum = xhr.getResponseHeader('Location');
                commentnum = commentnum.split('/').pop();
                onSuccess(commentnum);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(createComment);
    };

    //List cases for the given user
    strata.cases.list = function (onSuccess, onFailure, closed) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (closed === undefined) { closed = 'false'; }

        if (!closed) {
            closed = 'false';
        }

        var url = strataHostname.clone().setPath('/rs/cases');
        url.addQueryParam('includeClosed', closed);

        fetchCases = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response['case'] !== undefined) {
                    response['case'].forEach(convertDates);
                    onSuccess(response['case']);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchCases);
    };

    //Create a new case comment
    strata.cases.notified_users.add = function (casenum, ssoUserName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (ssoUserName === undefined) { onFailure('ssoUserName must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/notified_users');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/notified_users');
        }

        addNotifiedUser = $.extend({}, baseAjaxParams, {
            url: url,
            data: '{"user": [{"ssoUsername":"' + ssoUserName + '"}]}',
            type: 'POST',
            method: 'POST',
            headers: {
                Accept: 'text/plain'
            },
            dataType: 'text',
            success: onSuccess,
            statusCode: {
                201: onSuccess,
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(addNotifiedUser);
    };

    strata.cases.notified_users.remove = function (casenum, ssoUserName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (ssoUserName === undefined) { onFailure('ssoUserName must be defined'); }

        var url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/notified_users/' + ssoUserName);

        removeNotifiedUser = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'DELETE',
            method: 'DELETE',
            contentType: 'text/plain',
            headers: {
                Accept: 'text/plain'
            },
            dataType: 'text',
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(removeNotifiedUser);
    };

    //List cases in CSV for the given user, this casues a download to occur
    strata.cases.csv = function (onSuccess, onFailure) {
        var url = strataHostname.clone().setPath('/rs/cases');

        fetchCasesCSV = $.extend({}, baseAjaxParams, {
            headers: {
                Accept: 'text/csv'
            },
            url: url,
            contentType: 'text/csv',
            dataType: 'text',
            success: function(data, response, status) {
                var uri = 'data:text/csv;charset=UTF-8,' + encodeURIComponent(data);
                window.location = uri;
                onSuccess();
            },
            error: function (xhr, response, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });
        $.ajax(fetchCasesCSV);
    };

    //Filter cases
    strata.cases.filter = function (casefilter, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casefilter === undefined) { onFailure('casefilter must be defined'); }

        var url = strataHostname.clone().setPath('/rs/cases/filter');

        //Remove any 0 length fields
        removeEmpty(casefilter);

        filterCases = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casefilter),
            type: 'POST',
            method: 'POST',
            success: function (response) {
                if (response['case'] !== undefined) {
                    response['case'].forEach(convertDates);
                    onSuccess(response['case']);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(filterCases);
    };

    //Create a new case
    strata.cases.post = function (casedata, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casedata === undefined) { onFailure('casedata must be defined'); }

        var url = strataHostname.clone().setPath('/rs/cases');

        createAttachment = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casedata),
            type: 'POST',
            method: 'POST',
            success: function (response, status, xhr) {
                //Created case data is in the XHR
                var casenum = xhr.getResponseHeader('Location');
                casenum = casenum.split('/').pop();
                onSuccess(casenum);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(createAttachment);
    };

    //Update a case
    strata.cases.put = function (casenum, casedata, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (casedata === undefined) { onFailure('casedata must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum);
        }

        var successCallback = function() {
          onSuccess();
        };

        updateCase = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casedata),
            type: 'PUT',
            method: 'PUT',
            statusCode: {
                200: successCallback,
                202: successCallback,
                400: onFailure
            },
            success: function (response) {
                onSuccess(response);
            }
        });
        $.ajax(updateCase);
    };


    //List case attachments
    strata.cases.attachments.list = function (casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/attachments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/attachments');
        }

        listCaseAttachments = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.attachment === undefined) {
                    onSuccess([]);
                } else {
                    response.attachment.forEach(convertDates);
                    onSuccess(response.attachment);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(listCaseAttachments);
    };

    //POST an attachment
    //data MUST be MULTIPART/FORM-DATA
    strata.cases.attachments.post = function (data, casenum, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { onFailure('data must be defined'); }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/attachments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/attachments');
        }

        createAttachment = $.extend({}, baseAjaxParams, {
            url: url,
            data: data,
            type: 'POST',
            method: 'POST',
            processData: false,
            contentType: false,
            cache: false,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(createAttachment);
    };

    strata.cases.attachments.remove = function (attachmentId, casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (attachmentId === undefined) { onFailure('attachmentId must be defined'); }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url =
            strataHostname.clone().setPath(
                '/rs/cases/' + casenum + '/attachments/' + attachmentId
            );
        deleteAttachment = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'DELETE',
            method: 'DELETE',
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(deleteAttachment);
    };

    //Base for symptoms
    strata.symptoms = {};

    //Symptom Extractor
    strata.symptoms.extractor = function (data, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { onFailure('data must be defined'); }

        var url = strataHostname.clone().setPath('/rs/symptoms/extractor');

        getSymptomsFromText = $.extend({}, baseAjaxParams, {
            url: url,
            data: data,
            type: 'POST',
            method: 'POST',
            contentType: 'text/plain',
            success: function (response) {
                if (response.extracted_symptom !== undefined) {
                    onSuccess(response.extracted_symptom);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(getSymptomsFromText);
    };

    //Base for groups
    strata.groups = {};

    //List groups for this user
    strata.groups.list = function (onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url;
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath('/rs/groups');
        } else {
            url = strataHostname.clone().setPath('/rs/groups/contact/' + ssoUserName);
        }

        listGroups = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.group !== undefined) {
                    onSuccess(response.group);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(listGroups);
    };

    //Create a group
    strata.groups.create = function (groupName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (groupName === undefined) { onFailure('groupName must be defined'); }

        var url = strataHostname.clone().setPath('/rs/groups');
        url.addQueryParam(redhatClient, redhatClientID);

        var throwError = function(xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        createGroup = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'POST',
            method: 'POST',
            data: '{"name": "' + groupName + '"}',
            success: onSuccess,
            statusCode: {
                201: function(response) {
                    var locationHeader = response.getResponseHeader('Location');
                    var groupNumber =
                        locationHeader.slice(locationHeader.lastIndexOf('/') + 1);
                    onSuccess(groupNumber);
                },
                400: throwError,
                500: throwError
            }
        });
        $.ajax(createGroup);
    };

    //Delete a group
    strata.groups.remove = function (groupnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (groupnum === undefined) { onFailure('groupnum must be defined'); }

        var url = strataHostname.clone().setPath('/rs/groups/' + groupnum);
        url.addQueryParam(redhatClient, redhatClientID);

        var throwError = function(xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        deleteGroup = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'DELETE',
            method: 'DELETE',
            success: onSuccess,
            statusCode: {
                200: function(response) {
                    onSuccess();
                },
                400: throwError,
                500: throwError
            }
        });
        $.ajax(deleteGroup);
    };

    //Retrieve a group
    strata.groups.get = function (groupnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (groupnum === undefined) { onFailure('groupnum must be defined'); }

        var url;
        if (isUrl(groupnum)) {
            url = new Uri(groupnum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/groups/' + groupnum);
        }

        fetchGroup = $.extend({}, baseAjaxParams, {
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchGroup);
    };

    //Base for products
    strata.products = {};

    //List products for this user
    strata.products.list = function (onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        if (ssoUserName === undefined) {
            var url = strataHostname.clone().setPath('/rs/products');
        } else {
            var url = strataHostname.clone().setPath('/rs/products/contact/' + ssoUserName);
        }


        listProducts = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.product !== undefined) {
                    onSuccess(response.product);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(listProducts);
    };

    //Retrieve a product
    strata.products.get = function (code, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (code === undefined) { onFailure('code must be defined'); }

        var url;
        if (isUrl(code)) {
            url = new Uri(code);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/products/' + code);
        }

        fetchProduct = $.extend({}, baseAjaxParams, {
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchProduct);
    };

    //Retrieve versions for a product
    strata.products.versions = function (code, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (code === undefined) { onFailure('code must be defined'); }

        var url;
        if (isUrl(code)) {
            url = new Uri(code + '/versions');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/products/' + code + '/versions');
        }

        fetchProductVersions = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.version !== undefined) {
                    onSuccess(response.version);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchProductVersions);
    };

    //Base for values
    strata.values = {};
    strata.values.cases = {};

    //Retrieve the case types
    strata.values.cases.types = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/values/case/types');

        caseTypes = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.value !== undefined) {
                    onSuccess(response.value);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(caseTypes);
    };

    //Retrieve the case severities
    strata.values.cases.severity = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/values/case/severity');

        caseSeverities = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.value !== undefined) {
                    onSuccess(response.value);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(caseSeverities);
    };

    //Retrieve the case statuses
    strata.values.cases.status = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/values/case/status');

        caseStatus = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.value !== undefined) {
                    onSuccess(response.value);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(caseStatus);
    };

    //Base for System Profiles
    strata.systemProfiles = {};

    //List system profiles
    strata.systemProfiles.list = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/system_profiles');

        fetchSystemProfiles = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.system_profile !== undefined) {
                    onSuccess(response.system_profile);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchSystemProfiles);
    };

    //Get a specific system_profile, either by hash or casenum
    //Case can return an array, hash will return a single result
    strata.systemProfiles.get = function (casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/system_profiles/' + casenum);
        }

        fetchSystemProfile = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if ($.isArray(response.system_profile)) {
                    onSuccess(response.system_profile);
                } else {
                    onSuccess(response);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchSystemProfile);
    };
    //TODO: Create helper class to Handle list + filtering

    //Create a new System Profile
    strata.systemProfiles.post = function (systemprofile, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (systemprofile === undefined) { onFailure('systemprofile must be defined'); }

        var url = strataHostname.clone().setPath('/rs/system_profiles');

        createSystemProfile = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(systemprofile),
            type: 'POST',
            method: 'POST',
            success: function (response, status, xhr) {
                //Created case data is in the XHR
                var hash = xhr.getResponseHeader('Location');
                hash = hash.split('/').pop();
                onSuccess(hash);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(createSystemProfile);
    };

    strata.accounts = {};

    //List Accounts for the given user
    strata.accounts.list = function (onSuccess, onFailure, closed) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (closed === undefined) { closed = false; }

        var url = strataHostname.clone().setPath('/rs/accounts');

        fetchAccounts = $.extend({}, baseAjaxParams, {
            url: url,
            success:  onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchAccounts);
    };

    //Get an Account
    strata.accounts.get = function (accountnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (accountnum === undefined) { onFailure('accountnum must be defined'); }

        var url;
        if (isUrl(accountnum)) {
            url = new Uri(accountnum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/accounts/' + accountnum);
        }

        fetchAccount = $.extend({}, baseAjaxParams, {
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchAccount);
    };

    //Get an Accounts Users
    strata.accounts.users = function (accountnum, onSuccess, onFailure, group) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (accountnum === undefined) { onFailure('accountnum must be defined'); }

        var url;
        if (isUrl(accountnum)) {
            url = new Uri(accountnum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else if (group === undefined) {
            url = strataHostname.clone().setPath('/rs/accounts/' + accountnum + '/users');
        } else {
            url = strataHostname.clone()
                .setPath('/rs/accounts/' + accountnum + '/groups/' + group + '/users');
        }

        fetchAccountUsers = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.user !== undefined) {
                    onSuccess(response.user);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchAccountUsers);
    };

    strata.entitlements = {};
    strata.entitlements.get = function (showAll, onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url;
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath('/rs/entitlements?showAll=' + showAll.toString());
        } else {
            url = strataHostname.clone().setPath('/rs/entitlements/contact/' + ssoUserName + '?showAll=' + showAll.toString());
        }

        fetchEntitlements = $.extend({}, baseAjaxParams, {
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchEntitlements);
    };

    //Helper function to "diagnose" text, chains problems and solutions calls
    //This will call 'onSuccess' for each solution
    strata.diagnose = function (data, onSuccess, onFailure, limit) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { onFailure('data must be defined'); }
        if (limit === undefined) { limit = 50; }

        //Call problems, send that list to get solutions to get each one
        strata.problems(data, function (response) {
            response.forEach(function (entry) {
                strata.solutions.get(entry.uri, onSuccess, onFailure);
            });
        }, onFailure, limit);
    };

    strata.search = function (keyword, onSuccess, onFailure, limit, chain) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (keyword === undefined) { keyword = ''; }
        if (limit === undefined) {limit = 50; }
        if (chain === undefined) {chain = false; }

        var searchStrata = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/search')
                .addQueryParam('keyword', encodeURIComponent(keyword))
                .addQueryParam('contentType', 'article,solution')
                .addQueryParam('limit', limit),
            success: function (response) {
                if (chain && response.search_result !== undefined) {
                    response.search_result.forEach(function (entry) {
                        strata.utils.getURI(entry.uri, entry.resource_type, onSuccess, onFailure);
                    });
                } else if (response.search_result !== undefined) {
                    onSuccess(response.search_result);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(searchStrata);
    };

    strata.utils = {};

    //Get selected text from the browser, this should work on
    //Chrome and FF.  Have not tested anything else
    strata.utils.getSelectedText = function () {
        var t = '';
        if (window.getSelection) {
            t = window.getSelection();
        } else if (document.getSelection) {
            t = document.getSelection();
        } else if (document.selection) {
            t = document.selection.createRange().text;
        }
        return t.toString();
    };

    strata.utils.getURI = function (uri, resourceType, onSuccess, onFailure) {
        fetchURI = $.extend({}, baseAjaxParams, {
            url: uri,
            success: function (response) {
                convertDates(response);
                onSuccess(resourceType, response);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchURI);
    };

    return strata;
}));
