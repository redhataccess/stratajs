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
        define('strata', ['jquery', 'jsuri'], factory);
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
        secureSupportPortal = false,
        secureSupportPathPrefix = '',
        baseAjaxParams = {},
        checkCredentials,
        fetchUser,
        fetchUserBySSO,
        fetchSolution,
        fetchArticle,
        searchArticles,
        sendCaseNum,
        fetchCase,
        fetchCaseComments,
        fetchCaseExternalUpdates,
        createComment,
        fetchCases,
        searchCases,
        advancedSearchCases,
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
        caseReviewSelector,
        solutionReviewSelector,
        attachmentMaxSize,
        fetchCaseSymptoms,
        symptomSolutions,
        createSolution,
        addCaseSbrs,
        removeCaseSbrs;

    strata.version = '1.7.0';
    redhatClientID = 'stratajs-' + strata.version;

    strata.logToSentry = function (message) {
        if (!message) {
            return;
        }
        if (window.sessionjs && window.sessionjs.reportProblem) {
            if (window.app) {
                window.sessionjs.reportProblem(message, {
                    tags: {
                        portal_app: window.app
                    }
                });
            } else {
                window.sessionjs.reportProblem(message);
            }
        }

    }

    function getIsTokenExpired() {
        if (window.sessionjs && window.sessionjs.isTokenExpired) {
            return window.sessionjs.isTokenExpired;
        }
        else {
            // For PCM we use the below line because in sessionjs we don't get the isTokenExpired() function directly
            // also it throws an error in PCM - window.sessionjs.isTokenExpired() is not a function
            if (window.sessionjs && window.sessionjs._state && window.sessionjs._state.keycloak) {
                return window.sessionjs._state.keycloak.isTokenExpired;
            }
        }
    }
    // If the token is expiring within 30 seconds, go ahead and refresh it.  Using 30 seconds considering jwt.js checks if
    // the token needs to be refreshed every 58 seconds with a TTE of 90 seconds.  So 30 seconds guarantees that
    // we are at the boundary of what jwt.js does without overlapping a great deal
    function isTokenExpired() {
        var _isTokenExpired = getIsTokenExpired();
        return _isTokenExpired(30);
    }

    function handleJWTandCallAjax(ajaxParams) {
        $.ajax($.extend({}, baseAjaxParams, ajaxParams));

        // Not working right now, update taken is failing in the qa environment.
        // Will discuss with michael clayton.
        // if (isTokenExpired()) {
        //     window.sessionjs.updateToken(true).success(function() {
        //         $.ajax($.extend({}, baseAjaxParams, ajaxParams));
        //     });
        // } else {
        //     $.ajax($.extend({}, baseAjaxParams, ajaxParams));
        // }
    }

    // function for reporting error to sentry
    function report401ToSentry(method, path, generatedBy) {
        strata.logToSentry('received 401 from ' + method + ' ' + path + ' generated by ' + generatedBy);
    }


    if (window.portal && window.portal.host) {
        //if this is a chromed app this will work otherwise we default to prod
        portalHostname = new Uri(window.portal.host).host();

    } else {
        portalHostname = 'access.redhat.com';
    }

    if (localStorage && localStorage.getItem('portalHostname')) {
        portalHostname = localStorage.getItem('portalHostname');
    }

    strataHostname = new Uri('https://api.' + portalHostname);
    strataHostname.addQueryParam(redhatClient, redhatClientID);

    strata.setRedhatClientID = function (id) {
        redhatClientID = id;
        strataHostname.replaceQueryParam(redhatClient, redhatClientID);
    };

    strata.setSecureSupportPortal = function (flag) {
        secureSupportPortal = flag;
        secureSupportPathPrefix = secureSupportPortal ? '/secure-support' : '';
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
        if (isASCII(username + password)) {
            basicAuthToken = btoa(username + ':' + password);
            localStorage.setItem('rhAuthToken', basicAuthToken);
            localStorage.setItem('rhUserName', username);
            authedUser.login = username;
            return true;
        } else {
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
    //regex from https://github.com/segmentio/is-url/blob/master/index.js
    function isUrl(string) {
        return /^(?:\w+:)?\/\/([^\s\.]+\.\S{2}|localhost[\:?\d]*)\S*$/.test(string);
    }

    var XML_CHAR_MAP = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
    };
    //Function to escape XML specific charcters
    function escapeXml(s) {
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
                groupNumbers.push({ group_number: num });
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

        checkCredentials = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/users/current'),
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
    };

    //Sends data to the strata diagnostic toolchain
    strata.problems = function (data, onSuccess, onFailure, limit) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { data = ''; }
        if (limit === undefined) { limit = 50; }

        var getSolutionsFromText = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/problems')
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
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/problems', 'strata.problems');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.recommendations = function (data, onSuccess, onFailure, limit, highlight, highlightTags) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { data = ''; }
        if (limit === undefined) { limit = 50; }
        if (highlight === undefined) { highlight = false; }

        var tmpUrl = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/problems')
            .addQueryParam('limit', limit).addQueryParam('highlight', highlight);
        if (highlightTags !== undefined) {
            tmpUrl.addQueryParam('highlightTags', highlightTags);
        }

        var getRecommendationsFromText = handleJWTandCallAjax({
            url: tmpUrl,
            data: JSON.stringify(data),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            headers: {
                Accept: 'application/vnd.redhat.json.suggestions'
            },
            success: function (response) {
                if (response.recommendation !== undefined) {
                    var suggestedRecommendations = response.recommendation;
                    onSuccess(suggestedRecommendations);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/problems', 'strata.recommendations');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.recommendationsForCase = function (data, onSuccess, onFailure, limit, start, highlight, highlightTagPre, highlightTagPost) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data == null) data = '';
        if (limit == null) limit = 50;
        if (start == null) start = 0;

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/recommendations')
            .addQueryParam('rows', String(limit))
            .addQueryParam('start', String(start)) // jsUri fubar's 0, it doesn't add it as a number, must force it to a string to be safe
            .addQueryParam('fl', '*,score')
            .addQueryParam('fq', 'documentKind:( "Solution" OR "Video" OR "CertifiedSoftware" OR "CertifiedCloudPartner" OR "Article" OR "Errata" OR "Vulnerability" OR "CertifiedHardware" OR "Cve" OR "LabInfo")')
            .addQueryParam('fq', '-documentKind:Documentation')
            .addQueryParam('fq', '-internalTags:helper_solution');

        if (highlight) {
            url.addQueryParam('hl', 'true')
                .addQueryParam('hl.fragsize', '300')
                .addQueryParam('hl.fl', 'abstract,publishedAbstract');
            if (highlightTagPre !== undefined) url.addQueryParam('hl.simple.pre', highlightTagPre);
            if (highlightTagPost !== undefined) url.addQueryParam('hl.simple.post', highlightTagPost)
        }

        var getRecommendationsFromCase = handleJWTandCallAjax({
            url: url.toString(),
            data: JSON.stringify(data),
            type: 'POST',
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.redhat.case+json',
                'Accept': 'application/vnd.redhat.solr+json'
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/recommendations', 'strata.recommendationForCase');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });

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

        fetchUser = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/users/' + userId),
            headers: {
                accept: 'application/vnd.redhat.user+json'
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/users', 'strata.users.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.users.getBySSO = function (onSuccess, onFailure, userSSO) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (userSSO == null || userSSO.length === 0) { throw 'user SSO must be specified'; }

        fetchUserBySSO = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/users').addQueryParam('ssoUserName', userSSO),
            headers: {
                accept: 'application/json'
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/users', 'strata.users.getBySSo');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });
    }

    strata.users.chatSession.get = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }


        fetchUserChatSession = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/users/current/chatSession'),
            type: 'POST',
            method: 'POST',
            headers: {
                accept: 'application/json'
            },
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/users/', 'strata.users.getBySSo');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/solutions/' + solution);
        }

        fetchSolution = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                convertDates(response);
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/solutions/', 'strata.solutions.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Search for solutions
    strata.solutions.search = function (keyword, onSuccess, onFailure, limit, chain) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (keyword === undefined) { keyword = ''; }
        if (limit === undefined) { limit = 50; }
        if (chain === undefined) { chain = false; }

        var searchSolutions = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/solutions')
                .addQueryParam('keyword', keyword)
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/solutions/', 'strata.solutions.search');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Create a solution
    strata.solutions.post = function (solution, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (solution === undefined) { throw 'solution must be defined'; }

        createSolution = handleJWTandCallAjax({
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/solutions'),
            data: JSON.stringify(solution),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/solutions/', 'strata.solutions.post');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/articles/' + article);
        }

        fetchArticle = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/articles/', 'strata.articles.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Search articles
    strata.articles.search = function (keyword, onSuccess, onFailure, limit, chain) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (keyword === undefined) { keyword = ''; }
        if (limit === undefined) { limit = 50; }
        if (chain === undefined) { chain = false; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/articles');
        url.addQueryParam('keyword', keyword);
        url.addQueryParam('limit', limit);

        searchArticles = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/articles/', 'strata.articles.search');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Base for cases
    strata.cases = {};
    strata.cases.attachments = {};
    strata.cases.comments = {};
    strata.cases.notified_users = {};
    strata.cases.owner = {};
    strata.cases.externalUpdates = {};
    strata.cases.sbrs = {};
    strata.solutionEngine = {};

    //Sending new case number to Solution Engine as per the guid
    // https://projects.engineering.redhat.com/browse/PCM-5350
    strata.solutionEngine.sendCaseNumber = function (caseNumObj, guid, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (caseNumObj === undefined) { onFailure('casenum must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/se/session/' + guid);

        sendCaseNum = handleJWTandCallAjax({
            url: url,
            type: 'PUT',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(caseNumObj),
            statusCode: {
                200: function () {
                    onSuccess();
                },
                400: onFailure,
                401: report401ToSentry('PUT', '/rs/se/session/', 'strata.solutionEngine.sendCaseNumber')
            }
        });
    };

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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum);
        }

        fetchCase = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/', 'strata.cases.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/comments/' + commentId);
        }

        fetchCaseComments = handleJWTandCallAjax({
            url: url,
            type: 'PUT',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(comment),
            statusCode: {
                200: function () {
                    onSuccess();
                },
                400: onFailure,
                401: report401ToSentry('PUT', '/rs/cases/', 'strata.cases.comments.update')
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/comments');
        }

        fetchCaseComments = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/', 'strata.cases.comments.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //List External Updates
    strata.cases.externalUpdates.list = function (casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/externalTrackerUpdates');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/externalTrackerUpdates');
        }

        fetchCaseExternalUpdates = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.external_tracker_update !== undefined) {
                    response.external_tracker_update.forEach(convertDates);
                    onSuccess(response.external_tracker_update);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/externalTrackerUpdates', 'strata.cases.externalUpdates.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/comments');
        }

        createComment = handleJWTandCallAjax({
            url: url,
            data: JSON.stringify(casecomment),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            success: function (response, status, xhr) {
                var commentnum;
                if (response.id !== undefined) {
                    //For some reason the comment object is being returned in IE8
                    commentnum = response.id;
                } else if (response.location !== undefined && response.location[0] !== undefined) {
                    commentnum = response.location[0];
                    commentnum = commentnum.split('/').pop();
                } else {
                    //Created case comment data is in the XHR
                    commentnum = xhr.getResponseHeader('Location');
                    commentnum = commentnum.split('/').pop();
                }
                onSuccess(commentnum);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/cases/comments', 'strata.cases.comment.post');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //List cases for the given user
    strata.cases.list = function (onSuccess, onFailure, closed) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (closed === undefined) { closed = 'false'; }

        if (!closed) {
            closed = 'false';
        }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases');
        url.addQueryParam('includeClosed', closed);


        fetchCases = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/', 'strata.cases.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Utility wrapper for preparing SOLR query
    function prepareURLParams(url, caseStatus, caseOwner, caseGroup, accountNumber, searchString, sortField, sortOrder, offset, limit, queryParams, start, useNewSearch) {
        var solrQueryString = "";
        var concatQueryString = function (param) {
            if (solrQueryString === "") {
                solrQueryString = param;
            } else {
                solrQueryString = solrQueryString.concat(" AND " + param);
            }
        };
        //Function to escape special chars in search query string
        var escapeSearchString = function (searchString) {
            var replace = /([^a-zA-Z0-9])/g;
            var newSearchString = searchString.replace(replace, "\\$1");
            return newSearchString;
        };
        if (!isObjectNothing(searchString)) {
            concatQueryString(escapeSearchString(searchString));
        }
        if (!isObjectNothing(caseStatus)) {
            var caseStatusQuery = 'case_status:';
            if (caseStatus.toLowerCase() === 'open') {
                concatQueryString(caseStatusQuery + 'Waiting*');
            } else if (caseStatus.toLowerCase() === 'closed') {
                concatQueryString(caseStatusQuery + 'Closed*');
            } else if (caseStatus.toLowerCase() === 'worh') {
                concatQueryString(caseStatusQuery + '*Red*'); // Case status that matches waiting on red hat
            } else if (caseStatus.toLowerCase() === 'wocust') {
                concatQueryString(caseStatusQuery + '*Customer*'); // Case status that matches waiting on customer
            } else {
                concatQueryString(caseStatusQuery + '*');
            }
        }
        if (!isObjectNothing(caseOwner)) {
            var caseOwnerQuery = 'case_owner:';
            concatQueryString(caseOwnerQuery + '"' + caseOwner + '"');
        }
        if (!isObjectNothing(caseGroup)) {
            var caseGroupQuery = 'case_folderNumber:';
            if (caseGroup === 'ungrouped') {
                concatQueryString(caseGroupQuery + "\\-1");
            } else {
                concatQueryString(caseGroupQuery + caseGroup);
            }
        }
        if (!isObjectNothing(accountNumber)) {
            var accountNumberQuery = 'case_accountNumber:';
            concatQueryString(accountNumberQuery + accountNumber);
        }
        if (!isObjectNothing(queryParams) && queryParams.length > 0) {
            for (var i = 0; i < queryParams.length; ++i) {
                concatQueryString(queryParams[i]);
            }
        }
        url.addQueryParam(useNewSearch ? 'q' : 'query', solrQueryString);
        if (!isObjectNothing(sortField)) {
            var solrSortOrder = 'case_' + sortField;
            if (!isObjectNothing(sortOrder)) {
                solrSortOrder = solrSortOrder.concat(" " + sortOrder);
            }
            url.addQueryParam('sort', solrSortOrder);
        }

        if (!isObjectNothing(offset)) {
            url.addQueryParam('offset', offset);
        }
        if (!isObjectNothing(start)) {
            url.addQueryParam('start', start);
        }
        if (!isObjectNothing(limit)) {
            url.addQueryParam(useNewSearch ? 'rows' : 'limit', limit);
        }
        return url;
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
    strata.cases.search = function (onSuccess, onFailure, caseStatus, caseOwner, caseGroup, accountNumber, searchString, sortField, sortOrder, offset, limit, queryParams, start, partnerSearch, caseFields) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases');
        prepareURLParams(url, caseStatus, caseOwner, caseGroup, accountNumber, searchString, sortField, sortOrder, offset, limit, queryParams, start, true);
        url.addQueryParam('newSearch', true);  // Add this query param to direct search to Calaveras
        url.addQueryParam('partnerSearch', partnerSearch);
        caseFields && caseFields.length > 0 && url.addQueryParam('fl', caseFields.join(','));

        var mapResponse = function (caseDocs, totalCases) {
            return ({
                total_count: totalCases,
                case: caseDocs.map(function (kase) {
                    return $.extend({}, kase, {
                        created_by: kase.case_createdByName,
                        created_date: kase.case_createdDate,
                        last_modified_by: kase.case_lastModifiedByName,
                        last_modified_date: kase.case_lastModifiedDate,
                        summary: kase.case_summary,
                        status: kase.case_status,
                        product: kase.case_product[0],
                        version: kase.case_version,
                        account_number: kase.case_accountNumber,
                        contact_name: kase.case_contactName,
                        owner: kase.case_owner,
                        severity: kase.case_severity,
                        last_public_update_at: kase.case_last_public_update_date,
                        last_public_update_by: kase.case_last_public_update_by,
                        case_number: kase.case_number,
                        folder_name: kase && kase.case_folderName ? kase.case_folderName : ''
                    })
                })
            });
        };

        searchCases = handleJWTandCallAjax({
            headers: {
                Accept: 'application/vnd.redhat.solr+json'
            },
            url: url,
            success: function (res) {
                var response = mapResponse(res.response.docs, res.response.numFound);
                if (response['case'] !== undefined) {
                    response['case'].forEach(convertDates);
                    onSuccess(response);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/', 'strata.cases.search');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.cases.advancedSearch = function (onSuccess, onFailure, query, order, offset, limit, format, caseFields) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (limit === undefined) { limit = 50; }
        if (offset === undefined) { offset = 0; }

        var url = strataHostname.clone().setPath("/rs/cases");
        url.addQueryParam('query', query);
        url.addQueryParam('newSearch', true);
        url.addQueryParam('limit', limit);
        url.addQueryParam('offset', offset);
        caseFields && caseFields.length > 0 && url.addQueryParam('fl', caseFields.join(','));
        if (order != null) {
            url.addQueryParam('sort', order);
        }

        var ajaxParams = {
            url: url,
            success: function (response) {
                if (format == 'csv') {
                    onSuccess(response);
                } else {
                    if (response['case'] != undefined) {
                        response['case'].forEach(convertDates);
                        onSuccess(response);
                    } else {
                        onSuccess([]);
                    }
                }
            },
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/', 'strata.cases.advancedSearch');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        }

        if (format === 'csv') {
            ajaxParams.dataType = 'text';
            ajaxParams.headers = {
                Accept: 'text/csv'
            };
        }

        advancedSearchCases = handleJWTandCallAjax(ajaxParams);
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/notified_users');
        }

        addNotifiedUser = handleJWTandCallAjax({
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
                201: onSuccess
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/cases/notified_users', 'strata.cases.notified_users.add');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.cases.notified_users.remove = function (casenum, ssoUserName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (ssoUserName === undefined) { onFailure('ssoUserName must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/notified_users/' + encodeURIComponent(ssoUserName));

        removeNotifiedUser = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('DELETE', '/rs/cases/notified_users', 'strata.cases.notified_users');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Add Sbrs to case
    strata.cases.sbrs.add = function (casenum, sbrGroups, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (sbrGroups === undefined) { onFailure('sbrGroups must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/sbr');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/sbr');
        }

        addCaseSbrs = handleJWTandCallAjax({
            url: url,
            data: JSON.stringify(sbrGroups),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            headers: {
                Accept: 'text/plain'
            },
            dataType: 'text',
            success: onSuccess,
            statusCode: {
                201: onSuccess
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/cases/sbr', 'strata.cases.sbrs.add');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.cases.sbrs.remove = function (casenum, sbrGroups, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }
        if (sbrGroups === undefined) { onFailure('ssoUserName must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/sbr');

        removeCaseSbrs = handleJWTandCallAjax({
            url: url,
            data: JSON.stringify(sbrGroups),
            type: 'DELETE',
            method: 'DELETE',
            contentType: 'application/json',
            headers: {
                Accept: 'text/plain'
            },
            dataType: 'text',
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('DELETE', '/rs/cases/sbr', 'strata.cases.sbrs.remove');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //List cases in CSV for the given user
    strata.cases.csv = function (onSuccess, onFailure) {
        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases');

        fetchCasesCSV = handleJWTandCallAjax({
            headers: {
                Accept: 'text/csv'
            },
            url: url,
            contentType: 'text/csv',
            dataType: 'text',
            success: function (data) {
                onSuccess(data);
            },
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases', 'strata.cases.csv');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });
    };

    //Filter cases
    strata.cases.filter = function (casefilter, partnerSearch, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casefilter === undefined) { onFailure('casefilter must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/filter');
        url.addQueryParam('partnerSearch', partnerSearch);

        //Remove any 0 length fields
        removeEmpty(casefilter);

        filterCases = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/cases/filter', 'strata.cases.filter');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Create a new case
    strata.cases.post = function (casedata, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casedata === undefined) { onFailure('casedata must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases');

        createAttachment = handleJWTandCallAjax({
            url: url,
            data: JSON.stringify(casedata),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            success: function (response, status, xhr) {
                //Created case data is in the XHR
                var casenum;
                if (response.location !== undefined && response.location[0] !== undefined) {
                    casenum = response.location[0];
                    casenum = casenum.split('/').pop();
                } else {
                    casenum = xhr.getResponseHeader('Location');
                    casenum = casenum.split('/').pop();
                }
                onSuccess(casenum);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/cases', 'strata.cases.post');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum);
        }

        var successCallback = function () {
            onSuccess();
        };

        updateCase = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('PUT', '/rs/cases', 'strata.cases.put');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/attachments');
        }

        listCaseAttachments = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/cases/attachments', 'strata.cases.attachments.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //POST an attachment
    //data MUST be MULTIPART/FORM-DATA
    strata.cases.attachments.post = function (data, casenum, onSuccess, onFailure, onProgress, isPrivate) {
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/attachments');
        }
        if (isPrivate) {
            url.addQueryParam("private", isPrivate);
        }

        createAttachment = handleJWTandCallAjax({
            xhr: function () {
                var xhr = new window.XMLHttpRequest();
                if (onProgress != null && $.isFunction(onProgress)) {
                    xhr.upload.addEventListener("progress", function (evt) {
                        if (evt.lengthComputable) {
                            var percentComplete = evt.loaded * 100 / evt.total;
                            var abort = function () {
                                xhr.abort();
                            };

                            onProgress(percentComplete, abort);
                        }
                    }, false);
                }
                return xhr;
            },
            url: url,
            data: data,
            type: 'POST',
            method: 'POST',
            processData: false,
            contentType: false,
            cache: false,
            success: onSuccess,
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/cases/attachments', 'strata.cases.attachment.post');
                }

                // When xhr.getAllResponseHeaders() doesn't exist the xhr request has been manually aborted.
                if (xhr.getAllResponseHeaders()) {
                    onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
                } else {
                    onFailure('aborted', xhr, response, status)
                }
            }
        });
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
        deleteAttachment = handleJWTandCallAjax({
            url: url,
            type: 'DELETE',
            method: 'DELETE',
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('DELETE', '/rs/cases/attachments', 'strata.cases.attachments.remove');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Change the case owner
    strata.cases.owner.update = function (casenum, ssoUserName, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/internal/cases/' + casenum + '/changeowner').addQueryParam('contactSsoName', ssoUserName.toString());

        updateOwner = handleJWTandCallAjax({
            url: url,
            type: 'POST',
            method: 'POST',
            contentType: false,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/internal/cases/changeowner', 'strata.cases.owner.update');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Base for symptoms
    strata.symptoms = {};

    //Symptom Extractor
    strata.symptoms.extractor = function (data, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (data === undefined) { onFailure('data must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/symptoms/extractor');

        getSymptomsFromText = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/symptoms/extractractor', 'strata.symptons.extractor');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Base for groups
    strata.groups = {};

    //List groups for this user
    strata.groups.list = function (onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url;
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups');
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups/contact/' + encodeURIComponent(ssoUserName));
        }

        listGroups = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.group !== undefined) {
                    onSuccess(response.group);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/groups', 'strata.groups.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Create a group
    strata.groups.create = function (groupName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (groupName === undefined) { onFailure('groupName must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups');
        url.addQueryParam(redhatClient, redhatClientID);

        var throwError = function (xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        createGroup = handleJWTandCallAjax({
            url: url,
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            data: '{"name": "' + groupName + '"}',
            success: onSuccess,
            statusCode: {
                201: function (response) {
                    var groupNumber;
                    if (response !== null) {
                        var locationHeader = response.getResponseHeader('Location');
                        groupNumber =
                            locationHeader.slice(locationHeader.lastIndexOf('/') + 1);
                    }
                    onSuccess(groupNumber);
                },
                400: throwError,
                409: throwError,
                500: throwError,
                401: report401ToSentry('POST', '/rs/groups', 'strata.groups.create')
            }
        });
    };

    //Update a group
    strata.groups.update = function (group, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (group === undefined) { onFailure('group must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups/' + group.number);

        var throwError = function (xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        updateGroup = handleJWTandCallAjax({
            url: url,
            type: 'PUT',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(group),
            success: onSuccess,
            statusCode: {
                200: function (response) {
                    if (response !== null) {
                        var locationHeader = response.getResponseHeader('Location');
                        var groupNumber =
                            locationHeader.slice(locationHeader.lastIndexOf('/') + 1);
                        onSuccess(groupNumber);
                    } else {
                        onSuccess();
                    }
                },
                400: throwError,
                500: throwError,
                401: report401ToSentry('PUT', '/rs/groups', 'strata.groups.update')
            }
        });
    };

    //Update a group
    strata.groups.createDefault = function (group, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (group === undefined) { onFailure('group must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups/' + group.number + '/default/');

        var throwError = function (xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        updateGroup = handleJWTandCallAjax({
            url: url,
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(group),
            success: onSuccess,
            statusCode: {
                200: function () {
                    onSuccess();
                },
                400: throwError,
                500: throwError,
                401: report401ToSentry('POST', '/rs/groups/default', 'strata.groups.createDefault')
            }
        });
    };

    //Delete a group
    strata.groups.remove = function (groupnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (groupnum === undefined) { onFailure('groupnum must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups/' + groupnum);
        url.addQueryParam(redhatClient, redhatClientID);

        var throwError = function (xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        deleteGroup = handleJWTandCallAjax({
            url: url,
            type: 'DELETE',
            method: 'DELETE',
            success: onSuccess,
            statusCode: {
                200: function () {
                    onSuccess();
                },
                400: throwError,
                500: throwError,
                502: throwError,
                401: report401ToSentry('DELETE', '/rs/groups', 'strata.groups.remove')
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/groups/' + groupnum);
        }

        fetchGroup = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/groups', 'strata.groups.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Base for groupUsers
    strata.groupUsers = {};
    //Update a group
    strata.groupUsers.update = function (users, accountId, groupnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (users === undefined || users === accountId || users === groupnum) { onFailure('users, accountID and groupnum must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/account/' + accountId + '/groups/' + groupnum + '/users');

        var throwError = function (xhr, response, status) {
            onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
        };

        updateGroupUsers = handleJWTandCallAjax({
            url: url,
            type: 'PUT',
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(strata.utils.fixUsersObject(users)),
            success: onSuccess,
            statusCode: {
                200: function () {
                    onSuccess();
                },
                400: throwError,
                500: throwError,
                502: throwError,
                401: report401ToSentry('PUT', '/rs/account/groups/users', 'strata.groupUsers.update')
            }
        });
    };

    //Base for products
    strata.products = {};

    //List products for this user
    strata.products.list = function (onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/products/contact/' + encodeURIComponent(ssoUserName));
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/products');
        }

        listProducts = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.product !== undefined) {
                    onSuccess(response.product);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/products/contact', 'strata.products.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/products/' + code);
        }

        fetchProduct = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/products', 'strata.products.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/products/' + code + '/versions');
        }

        fetchProductVersions = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.version !== undefined) {
                    onSuccess(response.version);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/products/versions', 'strata.products.version');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Base for values
    strata.values = {};
    strata.values.cases = {};
    strata.values.cases.attachment = {};

    //Retrieve the case types
    strata.values.cases.types = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/values/case/types');

        caseTypes = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.value !== undefined) {
                    onSuccess(response.value);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/values/cases/types', 'strata.values.cases.types');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Retrieve the case severities
    strata.values.cases.severity = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/values/case/severity');

        caseSeverities = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.value !== undefined) {
                    onSuccess(response.value);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/values/cases/severity', 'strata.values.cases.severity');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Retrieve the case statuses
    strata.values.cases.status = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/values/case/status');

        caseStatus = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.value !== undefined) {
                    onSuccess(response.value);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/values/cases/status', 'strata.values.cases.status');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Retrieve the attachment max. size
    strata.values.cases.attachment.size = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/values/case/attachment/size');

        attachmentMaxSize = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response !== undefined) {
                    onSuccess(response);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/values/cases/attachment/size', 'strata.values.attachment.size');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Retrieve business hours
    strata.values.businesshours = function (timezone, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/values/businesshours');
        url.addQueryParam('timezone', timezone);

        businesshours = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/values/businesshours', 'strata.values.businesshours');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Base for System Profiles
    strata.systemProfiles = {};

    //List system profiles
    strata.systemProfiles.list = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/system_profiles');

        fetchSystemProfiles = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.system_profile !== undefined) {
                    onSuccess(response.system_profile);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/system_profiles', 'strata.systemProfiles');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/system_profiles/' + casenum);
        }

        fetchSystemProfile = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if ($.isArray(response.system_profile)) {
                    onSuccess(response.system_profile);
                } else {
                    onSuccess(response);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/system_profiles', 'strata.systemProfiles.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };
    //TODO: Create helper class to Handle list + filtering

    //Create a new System Profile
    strata.systemProfiles.post = function (systemprofile, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (systemprofile === undefined) { onFailure('systemprofile must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/system_profiles');

        createSystemProfile = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/system_profiles', 'strata.systemProfiles.post');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.accounts = {};

    //List Accounts for the given user
    strata.accounts.list = function (onSuccess, onFailure, closed) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (closed === undefined) { closed = false; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts');

        fetchAccounts = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/accounts', 'strata.accounts.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts/' + accountnum);
        }

        fetchAccount = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/accounts', 'strata.accounts.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
        } else if (group === undefined || group === "-1") {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts/' + accountnum + '/users');
        } else {
            url = strataHostname.clone()
                .setPath(secureSupportPathPrefix + '/rs/accounts/' + accountnum + '/groups/' + group + '/users');
        }

        fetchAccountUsers = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.user !== undefined) {
                    onSuccess(response.user);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/accounts/users', 'strata.accounts.users');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.accounts.addBookmark = function (accountNumber, ssoName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (accountNumber == null) { throw 'Account number must be specified'; }
        if (ssoName == null) { throw 'Contact SSO must be specified'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts/bookmarks');
        var addBookmark = handleJWTandCallAjax({
            url: url,
            data: JSON.stringify({
                accountNumber: accountNumber,
                contactSsoName: ssoName
            }),
            type: 'POST',
            method: 'POST',
            contentType: 'application/json',
            dataType: "text",
            success: onSuccess,
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/accounts/bookmarks', 'strata.accounts.addBookmark');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });
    };

    strata.accounts.removeBookmark = function (accountNumber, ssoName, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (accountNumber == null) { throw 'Account number must be specified'; }
        if (ssoName == null) { throw 'Contact SSO must be specified'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts/' + accountNumber + '/bookmarks');
        url.addQueryParam('contactSsoName', ssoName);

        var removeBookmark = handleJWTandCallAjax({
            url: url,
            type: 'DELETE',
            method: 'DELETE',
            dataType: "text",
            success: onSuccess,
            error: function (xhr, response, status) {
                if (xhr.status == 401) {
                    report401ToSentry('DELETE', '/rs/accounts/bookmarks', 'strata.accounts.removeBookmark');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, response, status);
            }
        });
    };

    //Get Accounts under a partner
    strata.accounts.getManagedAccounts = function (accountnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (accountnum === undefined) { onFailure('accountnum must be defined'); }

        var url;
        if (isUrl(accountnum)) {
            url = new Uri(accountnum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts/customer/' + accountnum);
        }

        fetchAccount = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/accounts/customers', 'strata.accounts.getManagedAccounts');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Get Accounts that manage a customer
    strata.accounts.getManagersForAccount = function (accountnum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (accountnum === undefined) { onFailure('accountnum must be defined'); }

        var url;
        if (isUrl(accountnum)) {
            url = new Uri(accountnum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/accounts/partner/' + accountnum);
        }

        fetchAccount = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/accounts/partner', 'strata.accounts.getManagersForAccount');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.entitlements = {};
    strata.entitlements.get = function (showAll, onSuccess, onFailure, ssoUserName) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url;
        if (ssoUserName === undefined) {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/entitlements?showAll=' + showAll.toString());
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/entitlements/contact/' + encodeURIComponent(ssoUserName) + '?showAll=' + showAll.toString());
        }

        fetchEntitlements = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/entitlements', 'strata.entitlements.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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

    strata.search = function (q, onSuccess, onFailure, rows, chain) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (q === undefined) { q = ''; }
        if (rows === undefined) { rows = 50; }
        if (chain === undefined) { chain = false; }

        var searchStrata = handleJWTandCallAjax({
            headers: {
                accept: 'application/vnd.redhat.solr+json'
            },
            url: strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/search')
                .addQueryParam('q', q)
                .addQueryParam('fl', '*, score') // this will add the score to each response
                .addQueryParam('fq', 'documentKind:(Solution OR Article)')
                .addQueryParam('enableElevation', 'true') // Enable hand picked solutions
                .addQueryParam('rows', rows),
            success: function (response) {
                if (chain && response && response.response && response.response.docs !== undefined) {
                    response.response.docs.forEach(function (entry) {
                        strata.utils.getURI(entry.uri, entry.documentKind, onSuccess, onFailure);
                    });
                } else if (response && response.response && response.response.docs !== undefined) {
                    onSuccess(response.response.docs);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/search', 'strata.search');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.health = {};
    // Get the SFDC health status.
    // If this end point returns "SFDC:false" means SFDC is down/backend calls will not work
    strata.health.sfdc = function (onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/health/sfdc');

        fetchSfdcHealth = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                onSuccess(response);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/health/sfdc', 'strata.health');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
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
        fetchURI = handleJWTandCallAjax({
            url: uri,
            success: function (response) {
                convertDates(response);
                onSuccess(resourceType, response);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '', 'strata.utils.getSelectedText');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.utils.fixUsersObject = function (oldUsers) {
        var users = {};
        users.user = [];
        for (var i = 0; i < oldUsers.length; i++) {
            var tempUser = {
                ssoUsername: oldUsers[i].sso_username,
                firstName: oldUsers[i].first_name,
                lastName: oldUsers[i].last_name,
                access: oldUsers[i].access,
                write: oldUsers[i].write
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
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/chats');
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/chats').addQueryParam('ssoName', ssoUserName.toString());;
        }

        fetchChatTranscript = handleJWTandCallAjax({
            url: url,
            success: onSuccess,
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/chats', 'strata.chat.list');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.escalation = {};

    //Create escalation request
    strata.escalation.create = function (escalationData, onSuccess, onFailure) {
        //Default parameter value
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (escalationData === undefined) { onFailure('escalation data must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/escalations');

        createEscalation = handleJWTandCallAjax({
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
                if (response.location !== undefined && response.location[0] !== undefined) {
                    escalationNum = response.location[0];
                    escalationNum = escalationNum.split('/').pop();
                } else {
                    escalationNum = xhr.getResponseHeader('Location');
                    escalationNum = escalationNum.split('/').pop();
                }
                onSuccess(escalationNum);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('POST', '/rs/escalations', 'strata.escalation.create');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.reviews = {};

    strata.reviews.getCaseNumber = function (query, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases?' + query);
        caseReviewSelector = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/case', 'strata.reviews.getCaseNumber');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    strata.reviews.getSolutionNumber = function (query, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/recommendations?' + query);
        solutionReviewSelector = handleJWTandCallAjax({
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
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/recommendations', 'strata.reviews.getSolutionNumber');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Retrieve case symptoms
    strata.cases.symptoms = {};
    strata.cases.symptoms.get = function (casenum, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (casenum === undefined) { onFailure('casenum must be defined'); }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/comments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/cases/' + casenum + '/symptoms');
        }

        fetchCaseSymptoms = handleJWTandCallAjax({
            url: url,
            success: function (response) {
                if (response.symptom !== undefined) {
                    onSuccess(response.symptom);
                } else {
                    onSuccess([]);
                }
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/case/symptoms', 'strata.cases.symptoms.get');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };

    //Retrieve symptoms related solutions
    strata.cases.symptoms.solutions = {};
    strata.cases.symptoms.solutions.post = function (limit, isOnlySymptoms, data, onSuccess, onFailure) {
        if (!$.isFunction(onSuccess)) { throw 'onSuccess callback must be a function'; }
        if (!$.isFunction(onFailure)) { throw 'onFailure callback must be a function'; }
        if (limit === undefined) { onFailure('limit must be defined'); }

        var url = strataHostname.clone().setPath(secureSupportPathPrefix + '/rs/problems').addQueryParam('onlySymptoms', isOnlySymptoms).addQueryParam('limit', limit);

        symptomSolutions = handleJWTandCallAjax({
            url: url,
            data: data,
            type: 'POST',
            method: 'POST',
            contentType: 'text/plain',
            headers: {
                accept: 'application/vnd.redhat.json.suggestions'
            },
            success: function (response, status, xhr) {
                onSuccess(response.recommendation);
            },
            error: function (xhr, reponse, status) {
                if (xhr.status == 401) {
                    report401ToSentry('GET', '/rs/problems', 'strata.cases.symptoms.solution.post');
                }
                onFailure('Error ' + xhr.status + ' ' + xhr.statusText, xhr, reponse, status);
            }
        });
    };
    return strata;
}));
