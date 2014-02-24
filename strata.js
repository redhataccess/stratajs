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
    if (typeof define === 'function' && define.amd) {
        define('strata', ['jquery', 'jsUri'], factory);
    } else {
        root.strata = factory(root.$, root.Uri);
    }
}(this, function ($, Uri) {
    'use strict';
    var strata = {};
    strata.version = "1.0";

    //Since we can't set the UserAgent
    var redhatClient = "redhat_client";
    var redhatClientID = "stratajs-" + strata.version;

    strata.setRedhatClientID = function (id) {
        redhatClientID = id;
    };

    //Internal copy of user, might be useful for logging, only valid for cookie auth
    var authedUser = {};

    strata.getAuthInfo = function () {
        return authedUser;
    };

    //Store Base64 Encoded Auth Token
    var basicAuthToken = "";
    basicAuthToken = localStorage.getItem("rhAuthToken");

    strata.setCredentials = function (username, password) {
        basicAuthToken = btoa(username + ":" + password);
        localStorage.setItem("rhAuthToken", basicAuthToken);
    };

    //Private vars related to the connection
    var portalHostname = 'access.redhat.com';
    var strataHostname = new Uri('https://api.' + portalHostname);
    strataHostname.addQueryParam(redhatClient, redhatClientID);
    var baseAjaxParams = {
        accepts: {
            jsonp: 'application/json, text/json'
        },
        crossDomain: true,
        type: 'GET',
        method: 'GET',
        beforeSend: function (xhr) {
            //Include Basic Auth Credentials if available, will try SSO Cookie otherwise
            xhr.setRequestHeader('X-Omit', 'WWW-Authenticate');
            if (basicAuthToken === null || basicAuthToken.length === 0) {
                //Take advantage of lazy eval for Chrome fix
                //Chrome localStorage.get returns null, FF returns ""
            } else {
                xhr.setRequestHeader('Authorization', "Basic " + basicAuthToken);
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

    var authAjaxParams = $.extend({
        url: 'https://' + portalHostname +
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
                if (/.+_date/.test(key)) {
                    //Skip indexed_date, it's not a real "Date"
                    if (key !== "indexed_date") {
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

    //Helper classes
    //Class to describe the required Case fields
    strata.Case = function () {
        return {
            summary: "",
            description: "",
            product: "",
            version: ""
        };
    };

    //Class to describe required Case Comment fields
    strata.CaseComment = function () {
        return {
            text: "",
            public: true
        };
    };

    //Class to help create System Profiles
    strata.SystemProfile = function () {
        return {
            account_number: "",
            case_number: "",
            deprecated: false,
            //Append SystemProfileCategoryDetails Objects here
            system_profile_category: [
            ]
        };
    };

    //Helper to deal with SystemProfileCategories
    strata.SystemProfileCategoryDetails = function () {
        return {
            system_profile_category_name: "",
            system_profile_category_summary: "",
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
            start_date: "",
            end_date: "",
            account_number: "",
            include_closed: false,
            include_private: false,
            keyword: "",
            group_numbers: groupNumbers,
            addGroupNumber: function (num) {
                groupNumbers.push({group_number: num});
            },
            start: 0,
            count: 50,
            only_ungrouped: false,
            owner_sso_name: "",
            product: "",
            severity: "",
            sort_field: "",
            sort_order: "",
            status: "",
            type: "",
            created_by_sso_name: "",
            resource_type: "",
            id: "",
            uri: "",
            view_uri: ""
        };
    };

    //PUBLIC METHODS
    //User provides a loginSuccess callback to handle the response
    strata.checkLogin = function (loginHandler) {
        if (loginHandler === undefined) { return false; }

        if (basicAuthToken === null || basicAuthToken.length === 0) {
            var loginParams = $.extend({
                success: function (response) {
                    //Copy into our private obj
                    authedUser = response;
                    if (response.authorized) {
                        loginHandler(true, response);
                    } else {
                        loginHandler(false);
                    }
                }
            }, authAjaxParams);
            $.ajax(loginParams);
        } else {
            var checkCredentials = $.extend({}, baseAjaxParams, {
                url: strataHostname.clone().setPath('/rs/entitlements'),
                success: function () {
                    loginHandler(true);
                },
                error: function () {
                    loginHandler(false);
                }
            });
            $.ajax(checkCredentials);

        }
    };

    //Sends data to the strata diagnostic toolchain
    strata.problems = function (data, onSuccess, onFailure, limit) {
        if (data === undefined) { return false; }
        if (onSuccess === undefined) { return false; }
        if (limit === undefined) { limit = 10; }

        var getSolutionsFromText = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/problems')
                .addQueryParam('limit', limit),
            data: data,
            type: 'POST',
            method: 'POST',
            contentType: 'text/plain',
            success: function (response) {
                //Gets the array of solutions
                var suggestedSolutions = response.source_or_link_or_problem[2].source_or_link;
                onSuccess(suggestedSolutions);
            },
            error: onFailure
        });
        $.ajax(getSolutionsFromText);
    };

    //Base for solutions
    strata.solutions = {};

    //Retrieve a solution
    strata.solutions.get = function (solution, onSuccess, onFailure) {
        if (solution === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(solution)) {
            url = new Uri(solution);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/solutions/' + solution);
        }

        var fetchSolution = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                convertDates(response);
                onSuccess(response);
            },
            error: onFailure
        });
        $.ajax(fetchSolution);
    };

    //Search for solutions
    strata.solutions.search = function (keyword, onSuccess, onFailure, limit) {
        if (keyword === undefined) { return false; }
        if (onSuccess === undefined) { return false; }
        if (limit === undefined) {limit = 10; }

        var searchSolutions = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/solutions')
                .addQueryParam('keyword', keyword)
                .addQueryParam('limit', limit),
            success: function (response) {
                response.solution.forEach(convertDates);
                onSuccess(response.solution);
            },
            error: onFailure
        });
        $.ajax(searchSolutions);
    };

    //Base for articles
    strata.articles = {};

    //Retrieve an article
    strata.articles.get = function (article, onSuccess, onFailure) {
        if (article === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(article)) {
            url = new Uri(article);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/articles/' + article);
        }

        var fetchArticle = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                convertDates(response);
                onSuccess(response);
            },
            error: onFailure
        });
        $.ajax(fetchArticle);
    };

    //Search articles
    strata.articles.search = function (keyword, onSuccess, onFailure, limit) {
        if (keyword === undefined) { return false; }
        if (onSuccess === undefined) { return false; }
        if (limit === undefined) {limit = 10; }

        var url = strataHostname.clone().setPath('/rs/articles');
        url.addQueryParam('keyword', keyword);
        url.addQueryParam('limit', limit);

        var searchArticles = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                response.article.forEach(convertDates);
                onSuccess(response.article);
            },
            error: onFailure
        });
        $.ajax(searchArticles);
    };

    //Base for cases
    strata.cases = {};
    strata.cases.attachments = {};
    strata.cases.comments = {};

    //Retrieve a case
    strata.cases.get = function (casenum, onSuccess, onFailure) {
        if (casenum === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum);
        }

        var fetchCase = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                convertDates(response);
                onSuccess(response);
            },
            error: onFailure
        });
        $.ajax(fetchCase);
    };

    //Retrieve case comments
    strata.cases.comments.get = function (casenum, onSuccess, onFailure) {
        if (casenum === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/comments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/comments');
        }

        var fetchCaseComments = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                response.comment.forEach(convertDates);
                onSuccess(response.comment);
            },
            error: onFailure
        });
        $.ajax(fetchCaseComments);
    };

    //TODO: Support DRAFT comments? Only useful for internal
    //Create a new case comment
    strata.cases.comments.post = function (casenum, casecomment, onSuccess, onFailure) {
        //Default parameter value
        if (casenum === undefined) { return false; }
        if (casecomment === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/comments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/comments');
        }

        var createComment = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casecomment),
            type: 'POST',
            method: 'POST',
            success: function (response, status, xhr) {
                //Created case comment data is in the XHR
                var casenum = xhr.getResponseHeader("Location");
                casenum = casenum.split("/").pop();
                onSuccess(casenum);
            },
            error: onFailure
        });
        $.ajax(createComment);
    };

    //List cases for the given user
    strata.cases.list = function (onSuccess, onFailure, closed) {
        if (onSuccess === undefined) { return false; }
        if (closed === undefined) { closed = false; }

        var url = strataHostname.clone().setPath('/rs/cases');
        url.addQueryParam('includeClosed', closed);

        var fetchCases = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                response.case.forEach(convertDates);
                onSuccess(response.case);
            },
            error: onFailure
        });
        $.ajax(fetchCases);
    };

    //Filter cases
    strata.cases.filter = function (casefilter, onSuccess, onFailure) {
        //Default parameter value
        if (casefilter === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/cases/filter');

        //Remove any 0 length fields
        removeEmpty(casefilter);

        var filterCases = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casefilter),
            type: 'POST',
            method: 'POST',
            success: function (response) {
                response.case.forEach(convertDates);
                onSuccess(response.case);
            },
            error: onFailure
        });
        $.ajax(filterCases);
    };

    //Create a new case
    strata.cases.post = function (casedata, onSuccess, onFailure) {
        //Default parameter value
        if (casedata === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/cases');

        var createAttachment = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(casedata),
            type: 'POST',
            method: 'POST',
            success: function (response, status, xhr) {
                //Created case data is in the XHR
                var casenum = xhr.getResponseHeader("Location");
                casenum = casenum.split("/").pop();
                onSuccess(casenum);
            },
            error: onFailure
        });
        $.ajax(createAttachment);
    };

    //List case attachments
    strata.cases.attachments.list = function (casenum, onSuccess, onFailure) {
        if (casenum === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/attachments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/attachments');
        }

        var listCaseAttachments = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if (response.attachment === undefined) {
                    onSuccess({});
                } else {
                    response.attachment.forEach(convertDates);
                    onSuccess(response.attachment);
                }
            },
            error: onFailure
        });
        $.ajax(listCaseAttachments);
    };

    //POST an attachment
    //data MUST be MULTIPART/FORM-DATA
    strata.cases.attachments.post = function (data, casenum, onSuccess, onFailure) {
        //Default parameter value
        if (data === undefined) { return false; }
        if (casenum === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum + '/attachments');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/cases/' + casenum + '/attachments');
        }

        var createAttachment = $.extend({}, baseAjaxParams, {
            url: url,
            data: data,
            type: 'POST',
            method: 'POST',
            contentType: 'multipart/form-data',
            success: onSuccess,
            error: onFailure
        });
        $.ajax(createAttachment);
    };

    //Base for symptoms
    strata.symptoms = {};

    //Symptom Extractor
    strata.symptoms.extractor = function (data, onSuccess, onFailure) {
        if (data === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/symptoms/extractor');

        var getSymptomsFromText = $.extend({}, baseAjaxParams, {
            url: url,
            data: data,
            type: 'POST',
            method: 'POST',
            contentType: 'text/plain',
            success: function (response) {
                onSuccess(response.extracted_symptom);
            },
            error: onFailure
        });
        $.ajax(getSymptomsFromText);
    };

    //Base for groups
    strata.groups = {};

    //List groups for this user
    strata.groups.list = function (onSuccess, onFailure) {
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/groups');

        var listGroups = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.group);
            },
            error: onFailure
        });
        $.ajax(listGroups);
    };

    //Retrieve a group
    strata.groups.get = function (groupnum, onSuccess, onFailure) {
        if (groupnum === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(groupnum)) {
            url = new Uri(groupnum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/groups/' + groupnum);
        }

        var fetchGroup = $.extend({}, baseAjaxParams, {
            url: url,
            success: onSuccess,
            error: onFailure
        });
        $.ajax(fetchGroup);
    };

    //Base for products
    strata.products = {};

    //List products for this user
    strata.products.list = function (onSuccess, onFailure) {
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/products');

        var listProducts = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.product);
            },
            error: onFailure
        });
        $.ajax(listProducts);
    };

    //Retrieve a product
    strata.products.get = function (code, onSuccess, onFailure) {
        if (code === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(code)) {
            url = new Uri(code);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/products/' + code);
        }

        var fetchProduct = $.extend({}, baseAjaxParams, {
            url: url,
            success: onSuccess,
            error: onFailure
        });
        $.ajax(fetchProduct);
    };

    //Retrieve versions for a product
    strata.products.versions = function (code, onSuccess, onFailure) {
        if (code === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(code)) {
            url = new Uri(code + '/versions');
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/products/' + code + '/versions');
        }

        var fetchProductVersions = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.version);
            },
            error: onFailure
        });
        $.ajax(fetchProductVersions);
    };

    //Base for values
    strata.values = {};
    strata.values.cases = {};

    //Retrieve the case types
    strata.values.cases.types = function (onSuccess, onFailure) {
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/values/case/types');

        var caseTypes = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.value);
            },
            error: onFailure
        });
        $.ajax(caseTypes);
    };

    //Retrieve the case severities
    strata.values.cases.severity = function (onSuccess, onFailure) {
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/values/case/severity');

        var caseSeverities = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.value);
            },
            error: onFailure
        });
        $.ajax(caseSeverities);
    };

    //Retrieve the case statuses
    strata.values.cases.status = function (onSuccess, onFailure) {
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/values/case/status');

        var caseStatus = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.value);
            },
            error: onFailure
        });
        $.ajax(caseStatus);
    };

    //Base for System Profiles
    strata.systemProfiles = {};

    //List system profiles
    strata.systemProfiles.list = function (onSuccess, onFailure) {
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/system_profiles');

        var fetchSystemProfiles = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                onSuccess(response.system_profile);
            },
            error: onFailure
        });
        $.ajax(fetchSystemProfiles);
    };

    //Get a specific system_profile, either by hash or casenum
    //Case can return an array, hash will return a single result
    strata.systemProfiles.get = function (casenum, onSuccess, onFailure) {
        if (casenum === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url;
        if (isUrl(casenum)) {
            url = new Uri(casenum);
            url.addQueryParam(redhatClient, redhatClientID);
        } else {
            url = strataHostname.clone().setPath('/rs/system_profiles/' + casenum);
        }

        var fetchSystemProfile = $.extend({}, baseAjaxParams, {
            url: url,
            success: function (response) {
                if ($.isArray(response.system_profile)) {
                    onSuccess(response.system_profile);
                } else {
                    onSuccess(response);
                }
            },
            error: onFailure
        });
        $.ajax(fetchSystemProfile);
    };
    //TODO: Create helper class to Handle list + filtering

    //Create a new System Profile
    strata.systemProfiles.post = function (systemprofile, onSuccess, onFailure) {
        //Default parameter value
        if (systemprofile === undefined) { return false; }
        if (onSuccess === undefined) { return false; }

        var url = strataHostname.clone().setPath('/rs/system_profiles');

        var createSystemProfile = $.extend({}, baseAjaxParams, {
            url: url,
            data: JSON.stringify(systemprofile),
            type: 'POST',
            method: 'POST',
            success: function (response, status, xhr) {
                //Created case data is in the XHR
                var hash = xhr.getResponseHeader("Location");
                hash = hash.split("/").pop();
                onSuccess(hash);
            },
            error: onFailure
        });
        $.ajax(createSystemProfile);
    };

    //Helper function to "diagnose" text, chains problems and solutions calls
    //This will call 'onSuccess' for each solution
    strata.diagnose = function (data, onSuccess, onFailure, limit) {
        if (data === undefined) { return false; }
        if (onSuccess === undefined) { return false; }
        if (limit === undefined) { limit = 10; }

        //Call problems, send that list to get solutions to get each one
        strata.problems(data, function (response) {
            response.forEach(function (entry) {
                strata.solutions.get(entry.uri, onSuccess, onFailure);
            });
        }, onFailure, limit);
    };

    strata.search = function (keyword, onSuccess, onFailure, limit) {
        if (keyword === undefined) { return false; }
        if (onSuccess === undefined) { return false; }
        if (limit === undefined) {limit = 10; }

        var searchSolutions = $.extend({}, baseAjaxParams, {
            url: strataHostname.clone().setPath('/rs/search')
                .addQueryParam('keyword', keyword)
                .addQueryParam('limit', limit),
            success: function (response) {
                onSuccess(response.search_result);
            },
            error: onFailure
        });
        $.ajax(searchSolutions);
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

    return strata;
}));
