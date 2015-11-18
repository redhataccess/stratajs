/*jslint browser: true, devel: true, todo: true, unparam: true, camelcase: false */
/*global define, btoa */
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
        checkCredentials,
        fetchUser,
        fetchSolution,
        fetchArticle,
        searchArticles,
        fetchCase,
        fetchCaseComments,
        createComment,
        fetchCases,
        searchCases,
        fetchCasesCSV,
        addNotifiedUser,
        removeNotifiedUser,
        updateCase,
        filterCases,
        createAttachment,
        deleteAttachment,
        updateOwner,
        listCaseAttachments,
        getSymptomsFromText,
        listGroups,
        createGroup,
        deleteGroup,
        updateGroup,
        updateGroupUsers,
        fetchGroup,
        listProducts,
        fetchProduct,
        fetchProductVersions,
        caseTypes,
        caseSeverities,
        caseStatus,
        businesshours,
        fetchSystemProfiles,
        fetchSystemProfile,
        createSystemProfile,
        fetchAccounts,
        fetchAccount,
        fetchURI,
        fetchEntitlements,
        fetchSfdcHealth,
        fetchAccountUsers,
        fetchUserChatSession,
        fetchChatTranscript,
        createEscalation,
        solutionReviewSelector,
        attachmentMaxSize;

    strata.version = '1.4.2';
    redhatClientID = 'stratajs-' + strata.version;

    if (window.portal && window.portal.host) {
        //if this is a chromed app this will work otherwise we default to prod
        portalHostname = new Uri(window.portal.host).host();

    } else {
        portalHostname = 'access.redhat.com';
    }

    if(localStorage && localStorage.getItem('portalHostname')) {
        portalHostname = localStorage.getItem('portalHostname');
    }

    strataHostname = new Uri('https://api.' + portalHostname);
    strataHostname.addQueryParam(redhatClient, redhatClientID);

    strata.setRedhatClientID = function (id) {
        redhatClientID = id;
        strataHostname.replaceQueryParam(redhatClient, redhatClientID);
    };

    strata.addAccountNumber = function (id) {
        strataHostname.deleteQueryParam('account_number', id);
        strataHostname.addQueryParam('account_number', id);
    };

    strata.setStrataHostname = function (hostname) {
        portalHostname = hostname;
        strataHostname = new Uri(portalHostname);
        strataHostname.addQueryParam(redhatClient, redhatClientID);
    };

    strata.setPortalHostname = function (hostname) {
        portalHostname = hostname;
        strataHostname = new Uri('https://api.' + portalHostname);
        strataHostname.addQueryParam(redhatClient, redhatClientID);
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
            $('body').append('<iframe id="rhLogoutFrame" src="https://' + portalHostname + '/logout" name="rhLogoutFrame" style="display: none;"></iframe>');
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
        data: {},
        dataType: 'json'
    };

    //Helper Functions
    //Convert Java Calendar class to something we can use
    //TODO: Make this recursive
    function convertDates(entry) {
        //Iterate over the objects for *_date
        var key;
        for (key in entry) {
            if (entry.hasOwnProperty(key)) {
                if ((/[\s\S]*_date/.test(key)) || (/[\s\S]*_time/.test(key))) {
                    //Skip indexed_date, it's not a real "Date"
                    if (key !== 'indexed_date') {
                        entry[key] = new Date(entry[key]);
                    }
                }
            }
        }
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

    var XML_CHAR_MAP = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
    };
    //Function to escape XML specific charcters
    function escapeXml (s) {
        return s.replace(/[<>&"']/g, function (ch) {
            return XML_CHAR_MAP[ch];
        });
    };

    //Function to check valid(not null) object present
    function isObjectNothing(object) {
        if (object === '' || object === undefined || object === null) {
            return true;
        } else {
            return false;
        }
    };

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
            url: strataHostname.clone().setPath('/rs/users/current'),
            headers: {
                accept: 'application/vnd.redhat.user+json'
            },
            success: function (response) {
                response.loggedInUser = response.first_name + ' ' + response.last_name;
                loginHandler(true, response);
            },
            error: function () {
                strata.clearBasicAuth();
                strata.clearCookieAuth();
                loginHandler(false);
            }
        });
        $.ajax(checkCredentials);
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

    strata.recommendations = function (data, onSuccess, onFailure, limit, highlight, highlightTags) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { data = ''; }
        if (limit === undefined) { limit = 50; }
        if (highlight === undefined) { highlight = false; }

        var tmpUrl = strataHostname.clone().setPath('/rs/problems')
                .addQueryParam('limit', limit).addQueryParam('highlight', highlight);
        if(highlightTags !== undefined){
            tmpUrl.addQueryParam('highlightTags', highlightTags);
        }

        var getRecommendationsFromText = $.extend({}, baseAjaxParams, {
            url: tmpUrl,
            data: JSON.stringify(data),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            headers: {
                Accept: 'application/vnd.redhat.json.suggestions'
            },
            success: function (response) {
                if(response.recommendation !== undefined){
                    var suggestedRecommendations = response.recommendation;
                    onSuccess(suggestedRecommendations);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(getRecommendationsFromText);
    };

    //TODO rip out when strata fixes endpoint
    strata.recommendationsXmlHack = function (data, onSuccess, onFailure, limit, highlight, highlightTags) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { data = ''; }
        if (limit === undefined) { limit = 50; }
        if (highlight === undefined) { highlight = false; }

        var tmpUrl = strataHostname.clone().setPath('/rs/problems')
                .addQueryParam('limit', limit).addQueryParam('highlight', highlight);
        if(highlightTags !== undefined){
            tmpUrl.addQueryParam('highlightTags', highlightTags);
        }

        var xmlString = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><case xmlns=\"http://www.redhat.com/gss/strata\">";
        if(data.product !== undefined){
            xmlString = xmlString.concat("<product>" + data.product + "</product>");
        }if(data.version !== undefined){
            xmlString = xmlString.concat("<version>" + data.version + "</version>");
        }if(data.summary !== undefined){
            xmlString = xmlString.concat("<summary>" + escapeXml(data.summary) + "</summary>");
        }if(data.description !== undefined){
            xmlString = xmlString.concat("<description>" + escapeXml(data.description) + "</description>");
        }
        xmlString = xmlString.concat("</case>");

        var getRecommendationsFromText = $.extend({}, baseAjaxParams, {
            url: tmpUrl,
            data: xmlString,
            type: 'POST',
            method: 'POST',
            contentType: 'application/xml',
            headers: {
                Accept: 'application/vnd.redhat.json.suggestions'
            },
            success: function (response) {
                if(response.recommendation !== undefined){
                    var suggestedRecommendations = response.recommendation;
                    onSuccess(suggestedRecommendations);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(getRecommendationsFromText);
    };

    //Base for users
    strata.users = {};
    strata.users.chatSession = {};
    strata.users.get = function (onSuccess, onFailure, userId) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (userId === undefined) {
            userId = 'current';
        }

        fetchUser = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/users/' + userId),
            headers: {
                accept: 'application/vnd.redhat.user+json'
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchUser);
    };

    strata.users.chatSession.get = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }


        fetchUserChatSession = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/users/current/chatSession'),
            type: 'POST',
            method: 'POST',
            headers: {
                accept: 'application/json'
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchUserChatSession);
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
                if (response !== undefined && response.body !== undefined && response.body.html !== undefined) {
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
    strata.cases.owner = {};

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
                    if (response.chats !== undefined && response.chats.chat !== undefined) {
                        response.chats.chat.forEach(convertDates);
                    }
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
            contentType: 'application/json',
            data: JSON.stringify(comment),
            statusCode: {
                200: function() {
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
            contentType: 'application/json',
            success: function (response, status, xhr) {
                var commentnum;
                if (response.id !== undefined){
                    //For some reason the comment object is being returned in IE8
                    commentnum = response.id;
                } else if (response.location !== undefined && response.location[0] !== undefined){
                    commentnum = response.location[0];
                    commentnum = commentnum.split('/').pop();
                } else{
                    //Created case comment data is in the XHR
                    commentnum = xhr.getResponseHeader('Location');
                    commentnum = commentnum.split('/').pop();
                }
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

    //Utility wrapper for preparing SOLR query
    function prepareSolrQuery(caseStatus, caseOwner, caseGroup, accountNumber, searchString, sortField, sortOrder, offset, limit, queryParams, addlQueryParams) {
        var solrQueryString = "";
        var identifier = '';        
        var concatQueryString = function(param){
            if(solrQueryString === ""){
                solrQueryString = param;
            }else{
                solrQueryString = solrQueryString.concat("+AND+" + param);
            }
        };
        //Function to escape special chars in search query string
        var escapeSearchString = function(searchString) {
            var replace = /([^a-zA-Z0-9])/g;
            var newSearchString = searchString.replace(replace,"\\$1");
            return newSearchString;
        };
        if (!isObjectNothing(searchString)) {
            concatQueryString(escapeSearchString(searchString));
        }
        if (!isObjectNothing(caseStatus)) {
            identifier = 'case_status:';
            if (caseStatus.toLowerCase() === 'open') {
                concatQueryString(identifier + 'Waiting*');
            } else if (caseStatus.toLowerCase() === 'closed') {
                concatQueryString(identifier + 'Closed*');
            } else{
                concatQueryString(identifier + '*');
            }
        }
        if (!isObjectNothing(caseOwner)) { 
            identifier = 'case_owner:';
            concatQueryString(identifier + caseOwner);
        }
        if (!isObjectNothing(caseGroup)) {
            identifier = 'case_folderNumber:';
            if (caseGroup === 'ungrouped') {
                concatQueryString(identifier + "\\-1");
            } else {
                concatQueryString(identifier + caseGroup);
            }
        }
        if (!isObjectNothing(accountNumber)) {
            identifier = 'case_accountNumber:';
            concatQueryString(identifier + accountNumber);
        }
        if (!isObjectNothing(queryParams) && queryParams.length > 0){
            for (var i = 0; i < queryParams.length; ++i) {
                concatQueryString(queryParams[i]);
            }
        }
        if (!isObjectNothing(sortField)) {
            identifier = '&sort=case_';
            solrQueryString = solrQueryString.concat(identifier + sortField);
        }
        if (!isObjectNothing(sortOrder)) {
            solrQueryString = solrQueryString.concat(" " + sortOrder);
        }
        if (!isObjectNothing(offset)) {
            solrQueryString = solrQueryString.concat("&offset=" + offset);
        }
        if (!isObjectNothing(limit)) {
            solrQueryString = solrQueryString.concat("&limit=" + limit);
        }
        if (!isObjectNothing(addlQueryParams)) {
            solrQueryString = solrQueryString.concat(addlQueryParams);
        }
        solrQueryString = encodeURI(solrQueryString);
        return solrQueryString;
    }

    //Search cases SOLR
    //Following are the filter params that can be passed to SOLR search:
    //1.caseStatus - open (waiting on Red Hat/Waiting on customer), closed, both
    //2.caseOwner - full name of the case owner (First name + Last name)
    //3.caseGroup - group number of the group to which the case belongs
    //4.accountNumber - account under which cases need to be searched
    //5.searchString - the search string present in the case description, summary, comments etc
    //6.sortField - to sort the result list based on this field (case property)
    //7.sortOrder - order ASC/DESC
    //8.offset - from which index to start (0 for begining)
    //9.limit - how many results to fetch (50 by default)
    //10.queryParams - should be a list of params (identifier:value) to be added to the search query
    //11.addlQueryParams - additional query params to be appended at the end of the query, begin with '&'
    strata.cases.search = function (onSuccess, onFailure, caseStatus, caseOwner, caseGroup, accountNumber, searchString, sortField, sortOrder, offset, limit, queryParams, addlQueryParams) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        var searchQuery = prepareSolrQuery(caseStatus, caseOwner, caseGroup, accountNumber, searchString, sortField, sortOrder, offset, limit, queryParams, addlQueryParams);
        
        var url = strataHostname.clone().setPath('/rs/cases');
        url.addQueryParam('query', searchQuery);
        url.addQueryParam('newSearch', true);  // Add this query param to direct search to Calaveras
        
        searchCases = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response['case'] !== undefined) {
                    response['case'].forEach(convertDates);
                    onSuccess(response);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(searchCases);
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
            contentType: 'application/json',
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

    //List cases in CSV for the given user
    strata.cases.csv = function (onSuccess, onFailure) {
        var url = strataHostname.clone().setPath('/rs/cases');

        fetchCasesCSV = $.extend({}, baseAjaxParams, {
            headers: {
                Accept: 'text/csv'
            },
            url: url,
            contentType: 'text/csv',
            dataType: 'text',
            success: function(data) {
                onSuccess(data);
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
            contentType: 'application/json',
            type: 'POST',
            method: 'POST',
            success: function (response) {
                if (response['case'] !== undefined) {
                    response['case'].forEach(convertDates);
                    onSuccess(response);
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
            contentType: 'application/json',
            success: function (response, status, xhr) {
                 //Created case data is in the XHR
                var casenum;
                if (response.location !== undefined && response.location[0] !== undefined){
                    casenum = response.location[0];
                    casenum = casenum.split('/').pop();
                } else{
                    casenum = xhr.getResponseHeader('Location');
                    casenum = casenum.split('/').pop();
                }
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
            dataType: 'text',
            contentType: 'application/json',
            statusCode: {
                200: successCallback,
                202: successCallback,
                400: onFailure
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
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

    //Change the case owner
    strata.cases.owner.update = function (casenum, ssoUserName, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url = strataHostname.clone().setPath('/rs/internal/cases/' + casenum + '/changeowner').addQueryParam('contactSsoName', ssoUserName.toString());

        updateOwner = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'POST',
            method: 'POST',
            contentType: false,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(updateOwner);
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
            contentType: 'application/json',
            data: '{"name": "' + groupName + '"}',
            success: onSuccess,
            statusCode: {
                201: function(response) {
                    var groupNumber;
                    if(response !== null){
                        var locationHeader = response.getResponseHeader('Location');
                        groupNumber =
                            locationHeader.slice(locationHeader.lastIndexOf('/') + 1);
                    }
                    onSuccess(groupNumber);
                },
                400: throwError,
                409: throwError,
                500: throwError
            }
        });
        $.ajax(createGroup);
    };

    //Update a group
    strata.groups.update = function (group, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (group === undefined) { onFailure('group must be defined'); }

        var url = strataHostname.clone().setPath('/rs/groups/' + group.number);

        var throwError = function(xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        updateGroup = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'PUT',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(group),
            success: onSuccess,
            statusCode: {
                200: function(response) {
                    var locationHeader = response.getResponseHeader('Location');
                    var groupNumber =
                        locationHeader.slice(locationHeader.lastIndexOf('/') + 1);
                    onSuccess(groupNumber);
                },
                400: throwError,
                500: throwError
            }
        });
        $.ajax(updateGroup);
    };

    //Update a group
    strata.groups.createDefault = function (group, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (group === undefined) { onFailure('group must be defined'); }

        var url = strataHostname.clone().setPath('/rs/groups/' + group.number + '/default/');

        var throwError = function(xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        updateGroup = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(group),
            success: onSuccess,
            statusCode: {
                200: function() {
                    onSuccess();
                },
                400: throwError,
                500: throwError
            }
        });
        $.ajax(updateGroup);
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
                200: function() {
                    onSuccess();
                },
                400: throwError,
                500: throwError,
                502: throwError
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

    //Base for groupUsers
    strata.groupUsers = {};
    //Update a group
    strata.groupUsers.update = function (users, accountId, groupnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (users === undefined || users === accountId || users === groupnum) { onFailure('users, accountID and groupnum must be defined'); }

        var url = strataHostname.clone().setPath('/rs/account/'+ accountId + '/groups/' + groupnum + '/users');

        var throwError = function(xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        updateGroupUsers = $.extend({}, baseAjaxParams, {
            url: url,
            type: 'PUT',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(strata.utils.fixUsersObject(users)),
            success: onSuccess,
            statusCode: {
                200: function() {
                    onSuccess();
                },
                400: throwError,
                500: throwError,
                502: throwError
            }
        });
        $.ajax(updateGroupUsers);
    };

    //Base for products
    strata.products = {};

    //List products for this user
    strata.products.list = function (onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/products/contact/' + ssoUserName);
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath('/rs/products');
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
    strata.values.cases.attachment = {};

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

    //Retrieve the attachment max. size
    strata.values.cases.attachment.size = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/values/case/attachment/size');

        attachmentMaxSize = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response !== undefined) {                  
                    onSuccess(response);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(attachmentMaxSize);
    };

    //Retrieve business hours
    strata.values.businesshours = function (timezone, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/values/businesshours');
        url.addQueryParam('timezone', timezone);

        businesshours = $.extend({}, baseAjaxParams, {
            url: url,
            headers: {
                accept: 'application/vnd.redhat.businesshours+json'
            },
            success: function (response) {
                if (response !== undefined) {
                    onSuccess(response);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(businesshours);
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
            contentType: 'application/json',
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

    strata.health = {};
    // Get the SFDC health status.
    // If this end point returns "SFDC:false" means SFDC is down/backend calls will not work
    strata.health.sfdc = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/health/sfdc');

        fetchSfdcHealth = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchSfdcHealth);
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

    strata.utils.fixUsersObject = function (oldUsers) {
        var users = {};
        users.user = [];
        for(var i = 0; i < oldUsers.length; i++){
            var tempUser = {
                ssoUsername : oldUsers[i].sso_username,
                firstName : oldUsers[i].first_name,
                lastName : oldUsers[i].last_name,
                access : oldUsers[i].access,
                write : oldUsers[i].write
            };
            users.user.push(tempUser);
        }
        return users;
    };

    strata.chat = {};

    //List chat transcripts for the given user
    strata.chat.list = function (onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url;
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath('/rs/chats');
        } else {
            url = strataHostname.clone().setPath('/rs/chats').addQueryParam('ssoName', ssoUserName.toString());;
        }        

        fetchChatTranscript = $.extend({}, baseAjaxParams, {
            url: url,
            success:  onSuccess,
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(fetchChatTranscript);
    };

    strata.escalation = {};

    //Create escalation request
    strata.escalation.create = function (escalationData, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (escalationData === undefined) { onFailure('escalation data must be defined'); }

        var url = strataHostname.clone().setPath('/rs/escalations');

        createEscalation = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(escalationData),
            type: 'POST',
            method: 'POST',
            contentType: 'application/vnd.redhat.escalation+json',
            headers: {
                accept: 'application/vnd.redhat.escalation+json'
            },
            success: function (response, status, xhr) {
                //Created escalated data is in the XHR
                var escalationNum;
                if (response.location !== undefined && response.location[0] !== undefined){
                    escalationNum = response.location[0];
                    escalationNum = escalationNum.split('/').pop();
                } else{
                    escalationNum = xhr.getResponseHeader('Location');
                    escalationNum = escalationNum.split('/').pop();
                }
                onSuccess(escalationNum);
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(createEscalation);
    };

    strata.reviews = {};

    strata.reviews.getSolutionNumber = function ( query, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath('/rs/recommendations?'+query);
        solutionReviewSelector = $.extend({}, baseAjaxParams, {
            url: url,
            headers: {
                accept: 'application/vnd.redhat.solr+json'
            },
            success: function (response) {
                if (response !== undefined) {
                    onSuccess(response);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
        $.ajax(reviewSelector);
    };

    return strata;
}));
