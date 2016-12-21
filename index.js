'use strict';

const util = require('./util/cache-utils');
const hapi = require('hapi');
const good = require('good');
const redis = require('ioredis');
const moment = require('moment');
const _ = require('lodash');
const fs = require('fs');
const joi = require('joi');
const inert = require('inert');
const vision = require('vision');
const wagers = require('./plugin/wagers-plugin');

const fetchSystemDataPromise = require('./system/fetchSystemDataPromise');
const fetchWagersFromCachePromise = require('./history/fetchWagersFromCachePromise');
const fetchWagersFromESIPromise = require('./history/fetchWagersFromESIPromise');
const fetchWagerDetailsFromCachePromise = require('./details/fetchWagerDetailsFromCachePromise');
const fetchWagerDetailsFromESIPromise = require('./details/fetchWagerDetailsFromESIPromise');

const restClient = require('node-rest-client').Client;
const config = JSON.parse(fs.readFileSync('./conf/caching-server.config'));

const redisClient = new redis(6379, config.redisHost);
const dateFormat = 'YYYY-MM-DD';
const utcSuffix = 'T00:00:00.000Z';

const historyUrl = config.coreUrl + '/wagers/${userid}';
const detailsUrl = config.coreUrl + '/wagers/${userid}/tickets/${ticketnumber}';
const systemKey = 'system:data';
const server = new hapi.Server();
server.connection({
  port: config.port
});
const restApiClient = new restClient();
const trueOrFalse = /^((true)|(false))$/;
const utcDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const yyyymmddDate = /^\d{4}-\d{2}-\d{2}$/;
const esiSidFormat = /^[A-Z0-9]{32}$/;
const userIdFormat = /^\d{9,}$/;
const ticketNumberFormat = /^\d{9,}$/;

const querySchemaHistory = joi.object().keys({ 
  startdate: joi.string().required().regex(utcDate),
  enddate: joi.string().required().regex(utcDate),
  lotto: joi.string().regex(trueOrFalse),
  keno: joi.string().regex(trueOrFalse),
  bullseye: joi.string().regex(trueOrFalse),
  play3: joi.string().regex(trueOrFalse),
  strikeCategory: joi.string().regex(trueOrFalse),
  cache: joi.string().regex(trueOrFalse),
  cutoff: joi.string().regex(yyyymmddDate),
  refreshonly: joi.string().regex(trueOrFalse)
}).without('refreshonly', ['cache', 'lotto', 'keno', 'bullseye', 'play3', 'strikeCategory']);

const paramsSchemaHistory = { 
  userid: joi.string().required().regex(userIdFormat)
};

const querySchemaDetails = joi.object().keys({ 
  cache: joi.string().regex(trueOrFalse),
  cutoff: joi.string().regex(yyyymmddDate),
  refreshonly: joi.string().regex(trueOrFalse)
}).without('refreshonly', ['cache']);


const paramsSchemaDetails = { 
  userid: joi.string().required().regex(userIdFormat),
  ticketnumber: joi.string().required().regex(ticketNumberFormat)
};

const schemaHeader = {
  user_id: joi.string().required().regex(userIdFormat),
  esi_sid: joi.string().required().regex(esiSidFormat)
};


/***
 * Fetch ticket history with caching
 * ===============================
 */
server.route({
  method: 'GET',
  path: '/api/core/v1/wagers/{userid}',
  handler: function(request, reply) {

    let userId = request.params.userid;
    let historyKey = 'gamehistory:userid:'+ userId;
    let startDate = (request.query.startdate ? request.query.startdate : moment(moment() - moment.duration(4, 'months')).format(dateFormat).toString() + utcSuffix);
    let endDate = (request.query.enddate ? request.query.enddate : moment().format(dateFormat).toString() + utcSuffix);
    let today = (request.query.cutoff ? request.query.cutoff : moment().format(dateFormat));

    let gameFilter = [];
    if (request.query.lotto == 'true') { gameFilter.push('Lotto Powerball') }
    if (request.query.strikeCategory == 'true') { gameFilter.push('Lotto Strike') }
    if (request.query.keno == 'true') { gameFilter.push('Keno') }
    if (request.query.bullseye == 'true') { gameFilter.push('Bullseye') }
    if (request.query.play3 == 'true') { gameFilter.push('Play3') }
    server.log('info', 'game filter : ' + JSON.stringify(gameFilter));

    // Error if start date > end date
    if (startDate > endDate) {
      return reply({ 'message': 'nz.co.nzlotteries.exception.InvalidDateException'}).code(400);
    }

    // Fetch ticket history for user
    fetchSystemDataPromise({
      server,
      esi: restClient,
      redis: redisClient,
      request,
      historyKey,
      systemKey,
      historyUrl,
      today
    })
    .then(fetchWagersFromCachePromise)
    .then(fetchWagersFromESIPromise)
    .then((pObj) => {
      // If refreshonly, just return a confirmation message
      if (request.query.refreshonly == 'true') {
        return reply({ 
          message: 'Ticket history refreshed in cache for user ' + userId +
                   ' for period from ' + startDate.substr(0, 10) + ' to ' + endDate.substr(0, 10)
        }).code(200);
      }

      //server.log('debug', 'main pObj.gameHistory[0]: ' + JSON.stringify(pObj.gameHistory[0]));
    	return reply({gameHistory: util.findGames(pObj.gameHistory, gameFilter)}).code(200);
    })
    .catch((err) => {
      try {
        let errjson = JSON.parse(err.message);
        return (reply(errjson.message).code(errjson.code));        
      } catch (e) {
        return (reply(err.message).code(500));
      }
    });
  },
  config: {
    tags: ['api'],
    validate: {
      query: querySchemaHistory,
      params: paramsSchemaHistory,
      headers: joi.object(schemaHeader).options({ allowUnknown: true})
    }
  }
});


/***
 * Fetch ticket details with caching
 * =================================
 */
server.route({
  method: 'GET',
  path: '/api/core/v1/wagers/{userid}/tickets/{ticketnumber}',
  handler: function(request, reply) {
    let userId = request.params.userid;
    let ticketNumber = request.params.ticketnumber;
    let ticketKey = 'tickets:userid:' + userId + ':number:' + ticketNumber;
    let today = (request.query.cutoff ? request.query.cutoff : moment().format(dateFormat));

    // Fetch ticket details for ticket number
    fetchSystemDataPromise({
      server,
      esi: restClient,
      redis: redisClient,
      request,
      ticketKey,
      systemKey,
      detailsUrl,
      today
    })
    .then(fetchWagerDetailsFromCachePromise)
    .then(fetchWagerDetailsFromESIPromise)
    .then((pObj) => {
      if (request.query.refreshonly == 'true') {
        return reply({ 
          message: 'Ticket details refreshed in cache for ticket ' + ticketNumber +  ' for user ' + userId
        }).code(200);
      }

      //server.log('debug', 'main pObj.cachedWagerDetails: ' + JSON.stringify(pObj.cachedWagerDetails));
      return reply(pObj.cachedWagerDetails).code(200);
    })
    .catch((err) => {
      try {
        let errjson = JSON.parse(err.message);
        return (reply(errjson.message).code(errjson.code));        
      } catch (e) {
        return (reply(err.message).code(500));
      }
    });
  },
  config: {
    tags: ['api'],
    validate: {
      params: paramsSchemaDetails,
      query: querySchemaDetails,
      headers: joi.object(schemaHeader).options({ allowUnknown: true})
    }
  }
});


/***
 * Register plugin and start server
 * ================================
 */
const options = {
  info: {
    'title': 'Tickets History and Details Caching API Documentation',
    'version': '0.1.0',
  }
}; 
server.register([
  inert,
  vision,
  {register: require('hapi-swagger'),
    options: options
  },
  {
    register: good,
    options: {
      reporters: {
        consoleReporter: [{
          module: 'good-squeeze',
          name: 'Squeeze',
          args: [{
            response: '*',
            log: '*'
          }]
        }, {
          module: 'good-console'
        }, 'stdout'],
        fileReporter: [{
            module: 'good-squeeze',
            name: 'Squeeze',
            args: [{ 
              response: '*',
              log: '*'
            }]
        }, {
            module: 'good-squeeze',
            name: 'SafeJson'
        }, {
            module: 'good-file',
            args: ['./wagers-caching-service.log']
        }]
      }
    }
  }
  ,
  {
  	register: wagers,
  	options: {
  		redis: redisClient,
  		esi: restApiClient
  	}
  }], 
  (err) => {
    if (err) {
      throw err; // something bad happened loading the plugin
    }

    server.start((err) => {
      if (err) {
        throw err;
      }
      server.log('info', 'Server running at: ' + server.info.uri);
    });
  }
);
module.exports=server;