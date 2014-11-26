/*jslint node: true, mocha: true */
'use strict';
var strata = require('../../strata');
var expect = require('chai').expect;


function noop() {}
describe('Search', function () {
    // groan.
    this.timeout(10000);

    it('Should return 50 solutions/articles', function (done) {
        strata.search('rhel', function (data) {
            expect(data.length).to.equal(50);
            done();
        }, noop);
    });

    it('Should return one solution/article', function (done) {
        strata.search('rhel', function (data) {
            expect(data.length).to.equal(1);
            done();
        }, noop, 1);
    });

    it('Should return one solution', function (done) {
        strata.solutions.search('rhel', function (data) {
            expect(data.length).to.equal(1);
            expect(data[0].label).to.equal('solution');
            done();
        }, noop, 1);
    });

    it('Should return one article', function (done) {
        strata.articles.search('rhel', function (data) {
            expect(data.length).to.equal(1);
            expect(data[0].label).to.equal('article');
            done();
        }, noop, 1);
    });

    it('Should return one article by id', function (done) {
        strata.articles.get('1200223', function (data) {
            expect(data).to.be.ok();
            expect(data.title).to.equal('Bash Code Injection Vulnerability via Specially Crafted Environment Variables (CVE-2014-6271, CVE-2014-7169)');
            done();
        }, noop);
    });

    it('Should return one article by url', function (done) {
        strata.articles.get('https://api.access.redhat.com/rs/articles/1200223', function (data) {
            expect(data).to.be.ok();
            expect(data.title).to.equal('Bash Code Injection Vulnerability via Specially Crafted Environment Variables (CVE-2014-6271, CVE-2014-7169)');
            done();
        }, noop);
    });

});
