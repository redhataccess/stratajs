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
//COMMENT OUT THE rquire.config and requre() if you wish to use non-require
//Also comment out the }); on the last line
require.config({
    paths: {
        jquery: 'js/jquery-1.11.0',
        jsUri: 'js/Uri',
        'js-markdown-extra': 'js/js-markdown-extra',
        strata: '../strata'
    }
});
require(['strata'], function (strata) {

    'use strict';
    //Get strata.js version
    console.log(strata.version);

    function loginHandler(isAuthed, authedUser) {
        console.log(isAuthed);
        if (authedUser !== undefined) {
            console.log(authedUser);
        }
    }

    //Use this method to login, will default to SSO cookie if this is not set
    //DO NOT SET CREDENTIALS IF YOU WANT TO USE SSO COOKIE
    //strata.setCredentials("USERNAME", "PASSWORD", loginHandler);

    function onFailure(error, xhr, response, status) {
        console.log(error);
        console.log(response);
        console.log(status);
        console.log(xhr);
    }

    //Check to see if the user's credentials are good
    strata.checkLogin(loginHandler);

    //Diagnose text using the problems (AskShadowman) interface
    //Look for strata.diagnose helper function to make it easy to get the solutions back
    //onSuccess callback receives array of solutions
    strata.problems(
        "OpenStack Networking Issues",
        function (response) {
            //Iterate over the response array
            //response.forEach(someHandler);
            console.log(response);
        },
        onFailure
    );


    //Fetch a solution by ID
    /*strata.solutions.get("####",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //Fetch a solution by URI, useful so you don't have to parse returned entry.uri objects
    /*strata.solutions.get("https://api.access.redhat.com/rs/solutions/####",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //Extract symptoms from text
    strata.symptoms.extractor(
        "20:32:50,123 09as somethign fun \n\
20:32:50,618 WARN  [org.jboss.jca.core.connectionmanager.pool.strategy.OnePool] (JCA PoolFiller) IJ000610: Unable to fill pool: javax.resource.ResourceException: Could not create connection \n\
    at org.jboss.jca.adapters.jdbc.local.LocalManagedConnectionFactory.getLocalManagedConnection(LocalManagedConnectionFactory.java:282) \n\
    at org.jboss.jca.adapters.jdbc.local.LocalManagedConnectionFactory.createManagedConnection(LocalManagedConnectionFactory.java:240) \n\
    at org.jboss.jca.core.connectionmanager.pool.mcp.SemaphoreArrayListManagedConnectionPool.createConnectionEventListener(SemaphoreArrayListManagedConnectionPool.java:781) [ironjacamar-core-impl-1.0.17.Final-redhat-1.jar:1.0.17.Final-redhat-1] \n\
    at org.jboss.jca.core.connectionmanager.pool.mcp.SemaphoreArrayListManagedConnectionPool.fillToMin(SemaphoreArrayListManagedConnectionPool.java:725) [ironjacamar-core-impl-1.0.17.Final-redhat-1.jar:1.0.17.Final-redhat-1] \n\
    at org.jboss.jca.core.connectionmanager.pool.mcp.PoolFiller.run(PoolFiller.java:97) [ironjacamar-core-impl-1.0.17.Final-redhat-1.jar:1.0.17.Final-redhat-1] \n\
    at java.lang.Thread.run(Thread.java:744) [rt.jar:1.7.0_45] \n\
Caused by: org.postgresql.util.PSQLException: Connection refused. Check that the hostname and port are correct and that the postmaster is accepting TCP/IP connections. \n\
    at org.postgresql.core.v3.ConnectionFactoryImpl.openConnectionImpl(ConnectionFactoryImpl.java:207) \n\
    at org.postgresql.core.ConnectionFactory.openConnection(ConnectionFactory.java:64) \n\
    at org.postgresql.jdbc2.AbstractJdbc2Connection.<init>(AbstractJdbc2Connection.java:136) \n\
    at org.postgresql.jdbc3.AbstractJdbc3Connection.<init>(AbstractJdbc3Connection.java:29) \n\
    at org.postgresql.jdbc3g.AbstractJdbc3gConnection.<init>(AbstractJdbc3gConnection.java:21) \n\
    at org.postgresql.jdbc4.AbstractJdbc4Connection.<init>(AbstractJdbc4Connection.java:31) \n\
    at org.postgresql.jdbc4.Jdbc4Connection.<init>(Jdbc4Connection.java:24) \n\
    at org.postgresql.Driver.makeConnection(Driver.java:393) \n\
    at org.postgresql.Driver.connect(Driver.java:267) \n\
    at org.jboss.jca.adapters.jdbc.local.LocalManagedConnectionFactory.getLocalManagedConnection(LocalManagedConnectionFactory.java:254) \n\
    ... 5 more \n\
Caused by: java.net.ConnectException: Connection refused \n\
    at java.net.PlainSocketImpl.socketConnect(Native Method) [rt.jar:1.7.0_45] \n\
    at java.net.AbstractPlainSocketImpl.doConnect(AbstractPlainSocketImpl.java:339) [rt.jar:1.7.0_45] \n\
    at java.net.AbstractPlainSocketImpl.connectToAddress(AbstractPlainSocketImpl.java:200) [rt.jar:1.7.0_45] \n\
    at java.net.AbstractPlainSocketImpl.connect(AbstractPlainSocketImpl.java:182) [rt.jar:1.7.0_45] \n\
    at java.net.SocksSocketImpl.connect(SocksSocketImpl.java:392) [rt.jar:1.7.0_45] \n\
    at java.net.Socket.connect(Socket.java:579) [rt.jar:1.7.0_45] \n\
    at java.net.Socket.connect(Socket.java:528) [rt.jar:1.7.0_45] \n\
    at org.postgresql.core.PGStream.<init>(PGStream.java:60) \n\
    at org.postgresql.core.v3.ConnectionFactoryImpl.openConnectionImpl(ConnectionFactoryImpl.java:101) \n\
    ... 14 more \n\
20:32:50,750 INFO  [org.jboss.as] (Controller Boot Thread) JBAS015961: Http management interface listening on http://127.0.0.1:9990/management",
        function (response) {
            console.log(response);
        },
        onFailure
    );

    //Fetch a case by ID, URI also acceptable
    /*strata.cases.get("##########",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //Fetch case comments by ID, URI to a case is also acceptable
    /*strata.cases.comments.get("##########",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //List case attachments by ID, URI to a case is also acceptable
    /*strata.cases.attachments.list("##########",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //List cases for currently logged in user
    strata.cases.list(
        function (response) {
            console.log(response);
        },
        onFailure,
        true
    );

    //Search Solutions by keyword
    strata.solutions.search("Networking\ Issue",
        function (response) {
            console.log(response);
        },
        onFailure,
        11,
        false
    );

    //Search Articles by keyword
    strata.articles.search("Networking\ Issue",
        function (response) {
            console.log(response);
        },
        onFailure,
        11,
        false
    );

    //Fetch a solution by ID, URI to article also acceptable
    strata.articles.get("19183",
     function (response) {
     console.log(response);
     },
     onFailure
     );

    //List groups for currently logged in user
    strata.groups.list(
        function (response) {
            console.log(response);
        },
        onFailure
    );

    //Get group information by ID, URI to group also acceptable
    /*strata.groups.get("####",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //List Products for currently logged in user
    strata.products.list(
        function (response) {
            console.log(response);
        },
        onFailure
    );

    //Get Product by code, URI to code also acceptable
    /*strata.products.get("Product Name",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //Product Versions by code, URI to code also acceptable
    /*strata.products.versions("Product Code",
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //Get Case Types
    strata.values.cases.types(
        function (response) {
            console.log(response);
        },
        onFailure
    );

    //Get Case Severities
    strata.values.cases.severity(
        function (response) {
            console.log(response);
        },
        onFailure
    );

    //Get Case Statuses
    strata.values.cases.status(
        function (response) {
            console.log(response);
        },
        onFailure
    );

    var newCase = new strata.Case();
    newCase.description = "test";
    newCase.summary = "test";
    //Need to use values from products.get and products.versions
    newCase.product = "Red Hat Enterprise Linux";
    newCase.version = "6.0";

    //strata.cases.post(newCase, function (casenum) { console.log(casenum); });

    var newComment = new strata.CaseComment();
    newComment.text = "Comment Text";
    /*strata.cases.comments.post(
     "CaseNum##"
     newComment,
     function (response) {
     console.log(response);
     });*/

    //Helper function to ease working with diagnose
    //Success function called for EACH retured Solution
    /*strata.diagnose(
        "OpenStack Networking Issues",
        function (response) {
            console.log(response);
        },
        onFailure,
        11
    );*/

    //Returns an array of Articles and Solutions
    //Returns resourceType and response if chained
    strata.search("Networking\ Issue",
        function (resourceType, response) {
            console.log(resourceType, response);
        },
        onFailure,
        11,
        true
    );

    var filter = new strata.CaseFilter();
    filter.id = "#########";
    //Filter cases
    /*strata.cases.filter(filter,
     function (response) {
     console.log(response);
     },
     onFailure
     );*/

    //List accounts for currently logged in user
    strata.accounts.list(
        function (response) {
            console.log(response);
            strata.accounts.get(response, function (response) {
                console.log(response);
            }, onFailure);
            strata.accounts.users(response, function (response) {
                console.log(response);
            }, onFailure);
        },
        onFailure
    );

    //strata.cases.csv();
    //Clear user credentials
    //strata.clearCredentials();
//COMMENT OUT LINE BELOW FOR NON-REQUIRE
});
