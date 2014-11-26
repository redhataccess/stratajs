'use strict';
var strata = require('../strata');

var success = function(data) {
    console.log('success', data);
};

var error = function(data) {
    console.log('errror', data);
};

strata.search('rhel', success, error, 1);
